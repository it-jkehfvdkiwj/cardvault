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

IMAGE_DIR = Path(os.getenv("CATALOG_IMAGE_DIR", "backend/catalog_images"))
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


def import_all(db: Session, progress=None, page_limit: int | None = None) -> dict:
    """Pull the whole catalogue, page by page, upserting as it goes.

    Safe to interrupt and safe to re-run: each page is committed on its own and
    rows are matched by primary key, so a second run updates in place rather
    than duplicating. About 82 requests for 20,000-odd cards.
    """
    imported = updated = 0
    page = 1
    total = None
    with httpx.Client(timeout=60, headers=_headers()) as client:
        while True:
            resp = client.get(
                f"{API_BASE}/cards",
                params={"page": page, "pageSize": PAGE_SIZE, "select": SELECT_FIELDS},
            )
            resp.raise_for_status()
            payload = resp.json()
            cards = payload.get("data") or []
            total = payload.get("totalCount", total)
            if not cards:
                break

            existing = {
                c.id: c for c in db.query(CatalogCard).filter(
                    CatalogCard.id.in_([c.get("id") for c in cards if c.get("id")])
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

            if progress:
                progress(page, imported + updated, total)
            if len(cards) < PAGE_SIZE:
                break
            page += 1
            if page_limit and page > page_limit:
                break

    logger.info("Katalog: %d neu, %d aktualisiert (Gesamt laut API: %s)",
                imported, updated, total)
    return {"imported": imported, "updated": updated, "total": total}


def stats(db: Session) -> dict:
    n = db.query(sa_func.count(CatalogCard.id)).scalar() or 0
    sets = db.query(sa_func.count(sa_func.distinct(CatalogCard.set_id))).scalar() or 0
    with_img = (
        db.query(sa_func.count(CatalogCard.id))
        .filter(CatalogCard.local_image.isnot(None)).scalar() or 0
    )
    return {"cards": n, "sets": sets, "with_local_image": with_img}


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
                logger.debug("Bild fehlgeschlagen %s: %s", row.id, exc)
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
    }
