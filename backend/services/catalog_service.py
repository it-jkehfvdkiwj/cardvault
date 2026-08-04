"""
The local card catalogue: import, lookup, and image storage.

Purpose
-------
Identify any Pokémon card without asking a third-party service. The TCG API is
being wound down in favour of a paid successor, and even while it lives it is a
network hop that can be slow, rate-limited or simply down — which is exactly
what happened during a real scan: the card was read correctly and still came
back unidentified.

Shape of the data
-----------------
Rows are returned as dicts in the **same shape the TCG API produces**
(``{"id", "name", "set": {...}, "images": {...}, …}``), so the identification
pipeline and the frontend need no special case for "came from the catalogue"
versus "came from the API".

Prices are deliberately *not* stored here. They change constantly, they are the
one thing worth a live request, and freezing them in a catalogue that refreshes
monthly would quietly wreck the eBay export.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import time
from pathlib import Path

import httpx
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from models import CatalogCard

logger = logging.getLogger("cardvault.catalog")

API_BASE = os.getenv("TCG_API_BASE", "https://api.pokemontcg.io/v2")
PAGE_SIZE = 250                     # the API's maximum
# Only the fields needed to *identify* a card. Dropping the price blocks makes
# the import roughly four times smaller and avoids storing data that is stale
# the moment it is written.
SELECT_FIELDS = (
    "id,name,set,number,rarity,types,hp,images,nationalPokedexNumbers"
)

# Anchored to this file rather than the working directory: the container runs
# with cwd=/app/backend, so a relative "backend/catalog_images" resolved to
# /app/backend/backend/catalog_images. Compose sets the variable explicitly in
# production, but the default has to be right for local runs too.
_DEFAULT_IMAGE_DIR = Path(__file__).resolve().parent.parent / "catalog_images"
IMAGE_DIR = Path(os.getenv("CATALOG_IMAGE_DIR") or _DEFAULT_IMAGE_DIR)
# Refuse to start an image download that would leave the disk this empty. The
# server also holds the database, the uploads and the Docker images; filling it
# would take the whole site down, which is a far worse outcome than a missing
# thumbnail.
MIN_FREE_BYTES = int(os.getenv("CATALOG_MIN_FREE_GB", "3")) * 1024 ** 3

_NUM_RE = re.compile(r"(\d+)")


def _headers() -> dict:
    key = os.getenv("POKEMON_TCG_API_KEY", "").strip()
    return {"X-Api-Key": key} if key else {}


def _number_int(number: str | None) -> int | None:
    """Numeric part of a printed number. "TG05" → 5, "21" → 21, "SV107" → 107."""
    if not number:
        return None
    m = _NUM_RE.search(str(number))
    return int(m.group(1)) if m else None


# ── Import ────────────────────────────────────────────────────────────────────

def _row_from_api(card: dict) -> dict:
    s = card.get("set") or {}
    images = card.get("images") or {}
    return {
        "id": card.get("id"),
        "name": card.get("name") or "",
        "set_id": s.get("id"),
        "set_name": s.get("name"),
        "set_series": s.get("series"),
        "printed_total": s.get("printedTotal") or s.get("total"),
        "number": card.get("number"),
        "number_int": _number_int(card.get("number")),
        "rarity": card.get("rarity"),
        "types": ",".join(card.get("types") or []) or None,
        "hp": card.get("hp"),
        "national_dex": ",".join(
            str(n) for n in (card.get("nationalPokedexNumbers") or [])
        ) or None,
        "image_small": images.get("small"),
        "image_large": images.get("large"),
    }


MAX_RETRIES = 5
RETRY_BASE_DELAY = 2.0          # seconds; doubles per attempt


def _get_with_retry(client: httpx.Client, url: str, params: dict, label: str) -> dict:
    """GET with a growing delay on 5xx/429. Everything talking to this API goes
    through here — the set list included. Leaving that one call unprotected is
    exactly how a whole import died on its very first request."""
    delay = RETRY_BASE_DELAY
    last: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as exc:
            last = exc
            status = exc.response.status_code
            if status < 500 and status != 429:
                raise
            logger.warning("%s: HTTP %d (Versuch %d/%d) — warte %.0fs",
                           label, status, attempt, MAX_RETRIES, delay)
        except httpx.HTTPError as exc:
            last = exc
            logger.warning("%s: %s (Versuch %d/%d) — warte %.0fs",
                           label, type(exc).__name__, attempt, MAX_RETRIES, delay)
        if attempt < MAX_RETRIES:
            time.sleep(delay)
            delay *= 2
    raise last if last else RuntimeError(f"{label} fehlgeschlagen")


# The /sets endpoint refuses large pages. Measured: pageSize=250 returns 500 or
# 502 every time, pageSize=50 answers instantly with the identical fields. 174
# sets therefore cost four small requests instead of one big one — which is the
# same lesson as the deep card pages, just at the other end of the API.
SETS_PAGE_SIZE = 50


def _fetch_sets(client: httpx.Client) -> list[dict]:
    """All set ids, newest first, so the useful ones land first."""
    sets: list[dict] = []
    page = 1
    while True:
        payload = _get_with_retry(
            client,
            f"{API_BASE}/sets",
            {
                "page": page,
                "pageSize": SETS_PAGE_SIZE,
                "select": "id,name,series,printedTotal,releaseDate",
            },
            f"Set-Liste Seite {page}",
        )
        batch = payload.get("data") or []
        sets.extend(batch)
        if len(batch) < SETS_PAGE_SIZE:
            break
        page += 1
    sets.sort(key=lambda s: s.get("releaseDate") or "", reverse=True)
    return sets


def _known_set_ids(db: Session) -> list[dict]:
    """Set ids we can name without asking the API at all.

    Fallback for when the set list itself is unavailable: everything already in
    the local catalogue, plus every set the printed-code map knows. It cannot
    discover a brand-new set, but it keeps an import running instead of turning
    one broken endpoint into a total stop.
    """
    ids = {
        r[0] for r in db.query(CatalogCard.set_id).distinct() if r[0]
    }
    try:
        from services.set_code_map import SET_CODE_MAP
        ids.update(v for v in SET_CODE_MAP.values() if v)
    except Exception:
        pass
    return [{"id": i} for i in sorted(ids)]


def _fetch_page(
    client: httpx.Client, page: int, page_size: int, query: str | None = None
) -> dict:
    """One page of cards, retried.

    The page size stays fixed on purpose. Shrinking it on failure looks helpful
    and silently loses cards: page numbers are relative to the size, so fetching
    page 1 at 125 and then page 2 at 250 skips items 126-250 entirely.
    """
    params = {"page": page, "pageSize": page_size, "select": SELECT_FIELDS}
    if query:
        params["q"] = query
    return _get_with_retry(client, f"{API_BASE}/cards", params,
                           f"Seite {page}" + (f" ({query})" if query else ""))


def import_all(db: Session, progress=None, page_limit: int | None = None) -> dict:
    """Pull the whole catalogue, **one set at a time**.

    Not a straight walk through /cards: paging that far in costs the server a
    deep offset scan, and it fails. A real run got to page 67 — record 16,500 —
    before every retry came back 500, while the early pages had gone through
    fine. The deeper the page, the worse it got.

    Fetching per set keeps every request shallow (no set has more than a few
    hundred cards), which sidesteps the problem entirely instead of retrying
    into it. It also gives an honest resume: a set whose local count already
    matches the server's is skipped after one cheap request.

    Safe to interrupt and safe to re-run — rows are matched by primary key.
    """
    imported = updated = skipped_sets = 0
    failed_sets: list[str] = []

    used_fallback = False
    with httpx.Client(timeout=60, headers=_headers()) as client:
        try:
            sets = _fetch_sets(client)
        except Exception as exc:
            sets = _known_set_ids(db)
            used_fallback = True
            logger.warning(
                "Set-Liste nicht abrufbar (%s) — arbeite mit %d bekannten Sets weiter",
                type(exc).__name__, len(sets),
            )
            if not sets:
                raise
        if page_limit:
            sets = sets[:page_limit]

        for idx, s_meta in enumerate(sets, 1):
            set_id = s_meta.get("id")
            if not set_id:
                continue
            have = (
                db.query(sa_func.count(CatalogCard.id))
                .filter(CatalogCard.set_id == set_id).scalar() or 0
            )
            page = 1
            set_total = None
            try:
                while True:
                    payload = _fetch_page(
                        client, page, PAGE_SIZE, query=f"set.id:{set_id}"
                    )
                    cards = payload.get("data") or []
                    set_total = payload.get("totalCount", set_total)

                    # Already complete: nothing to do beyond this one request.
                    if page == 1 and set_total is not None and have >= set_total:
                        skipped_sets += 1
                        break
                    if not cards:
                        break

                    existing = {
                        c.id: c for c in db.query(CatalogCard).filter(
                            CatalogCard.id.in_(
                                [c.get("id") for c in cards if c.get("id")]
                            )
                        )
                    }
                    for card in cards:
                        row = _row_from_api(card)
                        if not row["id"] or not row["name"]:
                            continue
                        found = existing.get(row["id"])
                        if found:
                            for k, v in row.items():
                                if k != "id":
                                    setattr(found, k, v)
                            updated += 1
                        else:
                            db.add(CatalogCard(**row))
                            imported += 1
                    db.commit()

                    if len(cards) < PAGE_SIZE:
                        break
                    page += 1
            except Exception as exc:
                # One bad set must not cost the other 173.
                db.rollback()
                failed_sets.append(set_id)
                logger.warning("Set %s uebersprungen: %s: %s",
                               set_id, type(exc).__name__, exc)

            if progress:
                progress(idx, len(sets), set_id, imported + updated)

    logger.info(
        "Katalog: %d neu, %d aktualisiert, %d Sets schon vollstaendig, %d fehlgeschlagen",
        imported, updated, skipped_sets, len(failed_sets),
    )
    return {
        "imported": imported,
        "updated": updated,
        "skipped_sets": skipped_sets,
        "failed_sets": failed_sets,
        "used_fallback": used_fallback,
    }


def stats(db: Session) -> dict:
    n = db.query(sa_func.count(CatalogCard.id)).scalar() or 0
    sets = db.query(sa_func.count(sa_func.distinct(CatalogCard.set_id))).scalar() or 0
    with_img = (
        db.query(sa_func.count(CatalogCard.id))
        .filter(CatalogCard.local_image.isnot(None)).scalar() or 0
    )
    with_hash = (
        db.query(sa_func.count(CatalogCard.id))
        .filter(CatalogCard.phash.isnot(None)).scalar() or 0
    )
    return {
        "cards": n, "sets": sets,
        "with_local_image": with_img, "with_phash": with_hash,
    }


# ── Lookup (the reason the catalogue exists) ─────────────────────────────────

def _to_api_shape(row: CatalogCard) -> dict:
    """Render a row the way the TCG API would, so callers stay unchanged."""
    images = {}
    if row.local_image:
        # Served by the app itself; survives the API disappearing.
        images = {
            "small": f"/catalog-images/{row.local_image}",
            "large": f"/catalog-images/{row.local_image}",
        }
    else:
        if row.image_small:
            images["small"] = row.image_small
        if row.image_large:
            images["large"] = row.image_large
    return {
        "id": row.id,
        "name": row.name,
        "set": {
            "id": row.set_id,
            "name": row.set_name,
            "series": row.set_series,
            "printedTotal": row.printed_total,
            "total": row.printed_total,
        },
        "number": row.number,
        "rarity": row.rarity,
        "types": row.types.split(",") if row.types else [],
        "hp": row.hp,
        "images": images,
        "nationalPokedexNumbers": (
            [int(x) for x in row.national_dex.split(",") if x.isdigit()]
            if row.national_dex else []
        ),
        "_source": "catalog",
    }


def get_by_id(db: Session, card_id: str) -> dict | None:
    row = db.query(CatalogCard).filter(CatalogCard.id == card_id).first()
    return _to_api_shape(row) if row else None


def find_by_number_total(
    db: Session, number: str, total: str | None, limit: int = 5
) -> list[dict]:
    """Cards matching the printed "NNN/TTT" — the key OCR actually produces."""
    ni = _number_int(number)
    if ni is None:
        return []
    q = db.query(CatalogCard).filter(CatalogCard.number_int == ni)
    if total and str(total).isdigit():
        # Tolerate a small OCR slip in the total, and rank exact matches first.
        ti = int(total)
        q = q.filter(CatalogCard.printed_total.between(ti - 2, ti + 2))
        rows = q.limit(limit * 4).all()
        rows.sort(key=lambda r: abs((r.printed_total or 0) - ti))
    else:
        rows = q.limit(limit * 4).all()
    return [_to_api_shape(r) for r in rows[:limit]]


def search_by_name(db: Session, name: str, limit: int = 20) -> list[dict]:
    if not name or len(name) < 2:
        return []
    rows = (
        db.query(CatalogCard)
        .filter(CatalogCard.name.ilike(f"%{name.strip()}%"))
        .limit(limit)
        .all()
    )
    return [_to_api_shape(r) for r in rows]


def is_populated(db: Session) -> bool:
    """True once the catalogue holds enough to be worth consulting first."""
    return (db.query(sa_func.count(CatalogCard.id)).scalar() or 0) > 100


# ── Images ────────────────────────────────────────────────────────────────────

def build_phash_index(db: Session, limit: int | None = None, progress=None) -> dict:
    """Compute a perceptual hash for every locally stored card image.

    This is what makes visual identification actually work. The old index was
    filled one card at a time, after a scan was confirmed, by downloading that
    card's picture — so in practice it held a handful of entries and the visual
    path never fired. Every card whose printed number the OCR could not read
    fell through to guessing by name.

    The pictures are already on disk, so this is pure local CPU: no network, no
    rate limit, repeatable. Cards without a downloaded image are skipped — run
    ``images`` first.
    """
    from services import hash_service

    q = (
        db.query(CatalogCard)
        .filter(CatalogCard.local_image.isnot(None), CatalogCard.phash.is_(None))
        .order_by(CatalogCard.id)
    )
    if limit:
        q = q.limit(limit)
    rows = q.all()

    done = failed = 0
    for i, row in enumerate(rows, 1):
        path = IMAGE_DIR / row.local_image
        try:
            row.phash = hash_service.phash_of_file(str(path))
            if row.phash:
                done += 1
            else:
                failed += 1
        except Exception as exc:
            failed += 1
            if failed <= 3:
                logger.warning("Hash fehlgeschlagen %s: %s: %s",
                               row.id, type(exc).__name__, exc)
        if i % 200 == 0:
            db.commit()
            if progress:
                progress(i, len(rows))
    db.commit()

    total = (
        db.query(sa_func.count(CatalogCard.id))
        .filter(CatalogCard.phash.isnot(None)).scalar() or 0
    )
    return {"hashed": done, "failed": failed, "total_indexed": total}


def relink_collection(db: Session) -> dict:
    """Point existing collection cards at the locally stored artwork.

    Cards store their picture URL at the moment they are added, so everything
    added before the catalogue existed still refers to the API's CDN. Those
    rows would show empty frames the day that CDN goes away — even though the
    same image is already sitting on this disk. This rewrites them.

    The URL is made absolute via APP_BASE_URL, not left as "/catalog-images/…":
    the eBay export only accepts absolute http(s) picture URLs and silently
    drops anything else, so a relative path would fix the website and quietly
    break the listings.
    """
    from models import Card

    base = (os.getenv("APP_BASE_URL") or "").rstrip("/")
    if not base:
        raise RuntimeError(
            "APP_BASE_URL ist nicht gesetzt — ohne sie kann keine absolute "
            "Bildadresse gebildet werden."
        )

    local = {
        r.id: r.local_image
        for r in db.query(CatalogCard).filter(CatalogCard.local_image.isnot(None))
    }
    changed = skipped = 0
    for card in db.query(Card).filter(Card.tcg_card_id.isnot(None)):
        fname = local.get(card.tcg_card_id)
        if not fname:
            skipped += 1
            continue
        new_url = f"{base}/catalog-images/{fname}"
        if card.image_url != new_url:
            card.image_url = new_url
            changed += 1
    db.commit()
    return {"changed": changed, "no_local_image": skipped}


def free_bytes() -> int:
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    return shutil.disk_usage(IMAGE_DIR).free


def download_images(
    db: Session, kind: str = "small", limit: int | None = None, progress=None,
) -> dict:
    """Fetch card pictures onto local disk.

    ``kind`` is "small" (~245×342, a few tens of KB) or "large". Small is the
    default because it is what the collection grid and the confirm dialog show;
    large multiplies the footprint several times over for pixels nothing
    displays.

    Resumable: rows that already have a local file are skipped, so an
    interrupted run continues where it stopped. Stops early — without an error —
    if free disk space falls to the reserve, because a full disk on this server
    means the whole site goes down.
    """
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    col = CatalogCard.image_large if kind == "large" else CatalogCard.image_small

    q = (
        db.query(CatalogCard)
        .filter(CatalogCard.local_image.is_(None), col.isnot(None))
        .order_by(CatalogCard.id)
    )
    if limit:
        q = q.limit(limit)
    rows = q.all()

    done = failed = 0
    stopped_for_space = False
    errors: list[str] = []
    with httpx.Client(timeout=60, follow_redirects=True) as client:
        for i, row in enumerate(rows, 1):
            if i % 25 == 1 and free_bytes() < MIN_FREE_BYTES:
                stopped_for_space = True
                logger.warning(
                    "Bilder-Download gestoppt: nur noch %.1f GB frei.",
                    free_bytes() / 1024 ** 3,
                )
                break
            url = row.image_large if kind == "large" else row.image_small
            ext = Path(url).suffix or ".png"
            fname = f"{row.id}{ext}"
            dest = IMAGE_DIR / fname
            try:
                if not dest.exists():
                    resp = client.get(url)
                    resp.raise_for_status()
                    dest.write_bytes(resp.content)
                row.local_image = fname
                done += 1
            except Exception as exc:
                failed += 1
                # The first few reasons are reported, not hidden on DEBUG. A run
                # that reported "200 fehlgeschlagen" and nothing else was
                # impossible to act on — the cause has to travel with the count.
                if len(errors) < 3:
                    errors.append(f"{row.id}: {type(exc).__name__}: {exc}")
                    logger.warning("Bild fehlgeschlagen %s: %s: %s",
                                   row.id, type(exc).__name__, exc)
            if i % 50 == 0:
                db.commit()
                if progress:
                    progress(i, len(rows))
    db.commit()

    used = sum(f.stat().st_size for f in IMAGE_DIR.glob("*") if f.is_file())
    return {
        "downloaded": done,
        "failed": failed,
        "remaining": max(0, len(rows) - done - failed),
        "bytes_on_disk": used,
        "stopped_for_space": stopped_for_space,
        "errors": errors,
    }
