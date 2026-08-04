"""
Perceptual-hash based card identification.

Pipeline
--------
1. compute_phash()  – hash the preprocessed card image from upload
2. find_best_match() – scan the hash index in SQLite, return closest card
3. index_card()     – (async) download a card's image and store its hash;
                       called after the user confirms a card so the index
                       grows organically with the collection.
4. bulk_index_set() – (async) batch-index all cards in a TCG API set;
                       called from the /hash-index/build endpoint.

Similarity metric
-----------------
imagehash.phash() produces a 64-bit fingerprint (8×8 grid).
Hamming distance ≤ 10  ≈ ≥ 84 % similar  → "good match"
Hamming distance ≤ 16  ≈ ≥ 75 % similar  → "possible match"
We return best distance so callers can decide the threshold.
"""

import io
import logging
import os
import threading

import cv2
import httpx
import numpy as np
from PIL import Image
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

try:
    import imagehash
    IMAGEHASH_AVAILABLE = True
except ImportError:
    IMAGEHASH_AVAILABLE = False

from models import CardHashIndex

# 16×16 → 256 bits. The old 8×8 gave 64 bits for the *whole* card, and on
# Pokémon cards most of that describes the frame every card shares: same border,
# same bars, same text blocks. Four times the resolution, and the artwork hash
# below, are what make two cards from one set distinguishable at all.
HASH_SIZE = int(os.getenv("PHASH_SIZE", "16"))
MAX_BITS = HASH_SIZE ** 2

logger = logging.getLogger("cardvault.hash")
GOOD_MATCH_DISTANCE = 10    # ≤ this → high confidence (≥ 84 %)
FALLBACK_DISTANCE = 16      # ≤ this → possible match (≥ 75 %)


# ── Core helpers ──────────────────────────────────────────────────────────────

def _pil_to_phash(pil_img: Image.Image) -> str:
    return str(imagehash.phash(pil_img, hash_size=HASH_SIZE))


def _hamming(h1: str, h2: str) -> int:
    return bin(int(h1, 16) ^ int(h2, 16)).count("1")


def confidence_pct(distance: int) -> int:
    return round(max(0, (1 - distance / MAX_BITS) * 100))


# ── Public API ────────────────────────────────────────────────────────────────

def compute_phash(cv_img: np.ndarray) -> str | None:
    """Return hex phash string for an OpenCV BGR image, or None if unavailable."""
    if not IMAGEHASH_AVAILABLE:
        return None
    pil = Image.fromarray(cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB))
    return _pil_to_phash(pil)


# The illustration window as a fraction of the card, measured on modern layouts.
# Deliberately generous: a few pixels of frame cost far less than clipping the
# picture, and old layouts put the art slightly differently.
_ART_BOX = (0.07, 0.10, 0.93, 0.57)     # left, top, right, bottom


def art_crop(cv_img: np.ndarray) -> np.ndarray:
    """The illustration window of a portrait card image."""
    h, w = cv_img.shape[:2]
    x0, y0, x1, y1 = _ART_BOX
    crop = cv_img[int(h * y0):int(h * y1), int(w * x0):int(w * x1)]
    return crop if crop.size else cv_img


_GRAD_SIZE = (256, 256)     # every image reduced to this before differencing

def _gradient_image(cv_img: np.ndarray) -> Image.Image:
    """Edge strength, as an image.

    Brightness-based hashing struggles with foil: a sheen across the card
    changes every value it looks at. Gradients describe *where the shapes are*,
    and a reflection does not move the outline of a Pokémon.

    Two details are load-bearing, both found by measurement:

    * **Resize first.** A catalogue scan is 245 px wide, a phone photo well over
      a thousand. Sobel measures change *per pixel*, so without a common size
      the two images produce edges of entirely different strength and the
      comparison is meaningless.
    * **Blur before differencing.** Print raster, holo sparkle and sensor noise
      are all high-frequency; unblurred they register as edges of their own and
      drown out the drawing.
    """
    small = cv2.resize(cv_img, _GRAD_SIZE, interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (9, 9), 0)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    mag = cv2.magnitude(gx, gy)
    mag = cv2.normalize(mag, None, 0, 255, cv2.NORM_MINMAX)
    return Image.fromarray(mag.astype(np.uint8))


def signature(cv_img: np.ndarray) -> tuple[str | None, str | None, str | None]:
    """(full-card hash, artwork hash, artwork-gradient hash) for a deskewed card.

    The gradient is taken of the **artwork**, not of the whole card. Measured on
    300 cards under simulated glare: the whole-card gradient is dominated by the
    frame every card in a set shares, which pulls all candidates equally close
    together and destroys the gap between the right card and the next one. The
    artwork is the part that actually differs, so that is the part worth
    describing.
    """
    if not IMAGEHASH_AVAILABLE:
        return None, None, None
    full = _pil_to_phash(Image.fromarray(cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB)))
    art_img = art_crop(cv_img)
    art = _pil_to_phash(Image.fromarray(cv2.cvtColor(art_img, cv2.COLOR_BGR2RGB)))
    edge = _pil_to_phash(_gradient_image(art_img))
    return full, art, edge


def signature_of_file(path: str) -> tuple[str | None, str | None, str | None]:
    """Same, for a stored catalogue image."""
    img = cv2.imread(path)
    if img is None:
        return None, None, None
    return signature(img)


def phash_of_file(path: str) -> str | None:
    """Perceptual hash of an image file on disk (used to index the catalogue)."""
    try:
        with Image.open(path) as img:
            return _pil_to_phash(img.convert("RGB"))
    except Exception:
        return None


# ── Catalogue index, held in memory ───────────────────────────────────────────
#
# The old lookup pulled every row out of the database on each scan and compared
# hex strings character by character. That was tolerable with a dozen entries;
# with the full catalogue it is 20,000 rows and 20,000 string comparisons per
# card. Hashes are 64-bit numbers, so the comparison is one XOR and a bit count
# — microseconds for the whole catalogue — and the table only has to be read
# once.
_INDEX: list[tuple[str, int, int, int]] = []   # (id, full, art, gradient)
_INDEX_SIZE = -1
_INDEX_LOCK = threading.Lock()

# The artwork carries most of the discriminating information — the frame is
# shared across a whole set — so it counts double in the appearance blend.
_W_FULL, _W_ART = 1.0, 2.0


def reset_index() -> None:
    """Force a reload, e.g. right after the index has been rebuilt."""
    global _INDEX_SIZE
    _INDEX_SIZE = -1


def _catalog_index(db: Session) -> list[tuple[str, int, int, int]]:
    """(id, full, art, gradient) for the whole catalogue, cached across requests."""
    global _INDEX, _INDEX_SIZE
    from models import CatalogCard

    count = (
        db.query(sa_func.count(CatalogCard.id))
        .filter(CatalogCard.phash.isnot(None)).scalar() or 0
    )
    if count == _INDEX_SIZE:
        return _INDEX
    with _INDEX_LOCK:
        if count == _INDEX_SIZE:       # another thread got there first
            return _INDEX
        rows = (
            db.query(
                CatalogCard.id, CatalogCard.phash,
                CatalogCard.phash_art, CatalogCard.phash_edge,
            )
            .filter(CatalogCard.phash.isnot(None)).all()
        )
        built = []
        for cid, ph, pa, pe in rows:
            try:
                full = int(ph, 16)
            except (TypeError, ValueError):
                continue
            def _as_int(value, fallback):
                try:
                    return int(value, 16)
                except (TypeError, ValueError):
                    return fallback
            built.append((cid, full, _as_int(pa, full), _as_int(pe, full)))
        _INDEX, _INDEX_SIZE = built, count
        logger.info("Bildindex geladen: %d Karten", len(built))
    return _INDEX


def find_in_catalog(
    phash: str, db: Session, top: int = 3,
    art_hash: str | None = None, edge_hash: str | None = None,
) -> list[tuple[str, int]]:
    """Closest catalogue cards, as (tcg_card_id, distance), best first.

    Two views of the same card, and the **better** of them decides:

    * the appearance blend (whole card + artwork) — the everyday case;
    * the artwork's gradient — holo and foil, where a sheen rewrites every
      brightness value while leaving the outlines exactly where they were.

    Taking the minimum rather than an average is deliberate: a card only has to
    be recognisable *one* way, and demanding that both agree would throw away
    the case the second one exists for. It is also why the whole-card hash is
    not a third option here. Tried and measured: on its own it describes the
    frame every card in a set shares, so under glare it rates the whole set
    equally close and the right card loses its lead. It earns its place inside
    the blend and nowhere else.
    """
    index = _catalog_index(db)
    if not index:
        return []
    try:
        needle_full = int(phash, 16)
    except (TypeError, ValueError):
        return []

    def _needle(value, fallback):
        try:
            return int(value, 16)
        except (TypeError, ValueError):
            return fallback

    needle_art = _needle(art_hash, needle_full)
    needle_edge = _needle(edge_hash, needle_full)
    total_w = _W_FULL + _W_ART

    scored = []
    for cid, f, a, e in index:
        d_full = (needle_full ^ f).bit_count()
        d_art = (needle_art ^ a).bit_count()
        blend = (_W_FULL * d_full + _W_ART * d_art) / total_w
        d_edge = (needle_edge ^ e).bit_count()
        scored.append((cid, round(min(blend, d_edge))))
    scored.sort(key=lambda x: x[1])
    return scored[:top]


def find_best_match(phash: str, db: Session) -> tuple[dict | None, int]:
    """
    Scan the hash index and return (candidate_dict, hamming_distance).
    candidate_dict is shaped like a TCG API card so callers treat it uniformly.
    Returns (None, MAX_BITS+1) when the index is empty.
    """
    entries = db.query(CardHashIndex).all()
    if not entries:
        return None, MAX_BITS + 1

    best_entry, best_dist = None, MAX_BITS + 1
    for e in entries:
        d = _hamming(phash, e.phash)
        if d < best_dist:
            best_dist = d
            best_entry = e

    if best_entry is None:
        return None, MAX_BITS + 1

    return {
        "id": best_entry.tcg_card_id,
        "name": best_entry.name,
        "set": {"name": best_entry.set_name},
        "rarity": best_entry.rarity,
        "images": {"small": best_entry.image_url, "large": best_entry.image_url},
        "_confidence": confidence_pct(best_dist),
        "_source": "phash",
    }, best_dist


async def index_card(
    tcg_card_id: str,
    name: str,
    set_name: str | None,
    rarity: str | None,
    image_url: str,
    db: Session,
) -> bool:
    """Download card image and upsert its phash into the index. Returns True on success."""
    if not IMAGEHASH_AVAILABLE:
        return False

    existing = (
        db.query(CardHashIndex)
        .filter(CardHashIndex.tcg_card_id == tcg_card_id)
        .first()
    )
    if existing:
        return True  # already indexed

    try:
        async with httpx.AsyncClient(timeout=12) as client:
            resp = await client.get(image_url)
            resp.raise_for_status()
        pil = Image.open(io.BytesIO(resp.content)).convert("RGB")
        phash = _pil_to_phash(pil)

        entry = CardHashIndex(
            tcg_card_id=tcg_card_id,
            name=name,
            set_name=set_name,
            rarity=rarity,
            image_url=image_url,
            phash=phash,
        )
        db.add(entry)
        db.commit()
        logger.info("Hash-indexed %s (%s)", name, tcg_card_id)
        return True
    except Exception as exc:
        logger.warning("Failed to hash-index %s: %s", tcg_card_id, exc)
        return False


async def bulk_index_set(set_cards: list[dict], db: Session) -> int:
    """
    Download and hash every card in a list of TCG API card objects.
    Returns the count of newly indexed cards.
    """
    count = 0
    for card in set_cards:
        img_url = (card.get("images") or {}).get("small", "")
        if not img_url:
            continue
        ok = await index_card(
            tcg_card_id=card["id"],
            name=card.get("name", ""),
            set_name=(card.get("set") or {}).get("name"),
            rarity=card.get("rarity"),
            image_url=img_url,
            db=db,
        )
        if ok:
            count += 1
    return count


def index_stats(db: Session) -> dict:
    total = db.query(CardHashIndex).count()
    return {"indexed_cards": total, "imagehash_available": IMAGEHASH_AVAILABLE}
