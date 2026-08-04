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

HASH_SIZE = 8               # 8×8 grid → 64-bit hash stored as 16 hex chars
MAX_BITS = HASH_SIZE ** 2   # 64

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
_INDEX: list[tuple[str, int]] = []      # (tcg_card_id, phash as int)
_INDEX_SIZE = -1                        # row count the cache was built from
_INDEX_LOCK = threading.Lock()


def _catalog_index(db: Session) -> list[tuple[str, int]]:
    """(id, hash) pairs for the whole catalogue, cached across requests."""
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
            db.query(CatalogCard.id, CatalogCard.phash)
            .filter(CatalogCard.phash.isnot(None)).all()
        )
        built = []
        for cid, ph in rows:
            try:
                built.append((cid, int(ph, 16)))
            except (TypeError, ValueError):
                continue
        _INDEX, _INDEX_SIZE = built, count
        logger.info("Bildindex geladen: %d Karten", len(built))
    return _INDEX


def find_in_catalog(phash: str, db: Session, top: int = 3) -> list[tuple[str, int]]:
    """Closest catalogue cards for a hash, as (tcg_card_id, distance), best first."""
    index = _catalog_index(db)
    if not index:
        return []
    try:
        needle = int(phash, 16)
    except (TypeError, ValueError):
        return []
    scored = [(cid, (needle ^ h).bit_count()) for cid, h in index]
    scored.sort(key=lambda x: x[1])
    return [(cid, d) for cid, d in scored[:top]]


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
