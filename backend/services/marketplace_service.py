"""
Multi-platform selling exports: Whatnot + Vinted.

Platform capabilities (as of mid-2026):

* **Whatnot** — has a Seller Hub CSV bulk import ("Bulk import products from a
  CSV file") and an official Seller API (GraphQL). The CSV path works for every
  seller today with zero setup, so that is the primary export here. Listings
  arrive as *drafts* in the Seller Hub, are reviewed there and published.

* **Vinted** — has NO public seller API (only an allowlisted Pro program) and
  no bulk import. The best legal/stable option is a ready-to-paste text bundle:
  per card a finished title, description and price the seller pastes into the
  Vinted app. We generate a clean .txt (and a JSON preview for the UI with
  copy-to-clipboard per card).

Pricing/titles/photos are shared with the eBay export (ebay_service) so all
platforms stay consistent.
"""

import csv
import io
import os

from sqlalchemy.orm import Session

from models import Card, SaleTemplatePhoto
from services import ebay_service, sale_photo_service

_CONDITION_LABEL_DE = {
    "Mint": "Mint (neuwertig)",
    "Near Mint": "Near Mint (fast neuwertig)",
    "Lightly Played": "Lightly Played (leichte Spuren)",
    "Moderately Played": "Moderately Played (deutliche Spuren)",
    "Heavily Played": "Heavily Played (starke Spuren)",
    "Damaged": "Damaged (beschädigt)",
}

_LANG_LABEL = {
    "EN": "Englisch", "DE": "Deutsch", "FR": "Französisch",
    "IT": "Italienisch", "ES": "Spanisch", "JA": "Japanisch",
}


def _select_cards(
    db: Session,
    user_id: int,
    card_ids: list[int] | None,
    for_trade_only: bool,
) -> list[Card]:
    q = db.query(Card).filter(Card.user_id == user_id)
    if card_ids:
        q = q.filter(Card.id.in_(card_ids))
    if for_trade_only:
        q = q.filter(Card.for_trade.is_(True))
    return q.order_by(Card.set_name, Card.name).all()


def _templates(db: Session, user_id: int) -> list[SaleTemplatePhoto]:
    return (
        db.query(SaleTemplatePhoto)
        .filter(SaleTemplatePhoto.user_id == user_id)
        .all()
    )


def _opts(options: dict | None) -> dict:
    opts = ebay_service.default_options()
    if options:
        opts.update({k: v for k, v in options.items() if v is not None})
    return opts


# ── Whatnot ────────────────────────────────────────────────────────────────────

def whatnot_default_options() -> dict:
    return {
        "category": os.getenv("WHATNOT_CATEGORY", "Trading Card Games"),
        "sub_category": os.getenv("WHATNOT_SUBCATEGORY", "Pokémon Singles"),
        "listing_type": os.getenv("WHATNOT_TYPE", "Buy it Now"),
        "shipping_profile": os.getenv("WHATNOT_SHIPPING_PROFILE", "0-1 oz"),
        "offerable": os.getenv("WHATNOT_OFFERABLE", "TRUE"),
    }


def build_whatnot_csv(
    db: Session,
    user_id: int,
    card_ids: list[int] | None = None,
    for_trade_only: bool = False,
    options: dict | None = None,
) -> bytes:
    """Whatnot Seller Hub bulk-import CSV.

    Column set follows the Whatnot CSV template ("Bulk import products from a
    CSV file"). Uploaded listings land as **drafts** in the Seller Hub where
    category/sub-category values are validated against Whatnot's own list — the
    seller reviews and publishes there. Image URLs must be publicly reachable
    (our sale photos / TCG stock images are).
    """
    opts = _opts(options)
    wn = whatnot_default_options()
    if options:
        wn.update({k: v for k, v in options.items() if k in wn and v is not None})

    cards = _select_cards(db, user_id, card_ids, for_trade_only)
    templates = _templates(db, user_id)

    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow([
        "Category", "Sub Category", "Title", "Description", "Quantity",
        "Type", "Price", "Shipping Profile", "Offerable", "Hazmat",
        "Condition", "Cost Per Item", "SKU",
        "Image URL 1", "Image URL 2", "Image URL 3", "Image URL 4",
        "Image URL 5", "Image URL 6", "Image URL 7", "Image URL 8",
    ])

    for c in cards:
        price = ebay_service.compute_price(c, opts)
        photos = ebay_service.collect_photo_urls(c, templates)[:8]
        photos += [""] * (8 - len(photos))
        lang = _LANG_LABEL.get((c.language or "EN").upper(), c.language or "EN")
        desc = (
            f"{c.name} — {c.set_name or ''} {c.set_code or ''}".strip()
            + (f" · {c.rarity}" if c.rarity else "")
            + f" · Sprache: {lang}"
            + f" · Zustand: {_CONDITION_LABEL_DE.get(c.condition, c.condition or '—')}"
            + (" · Holo/Foil" if c.is_foil else "")
        )
        writer.writerow([
            wn["category"],
            wn["sub_category"],
            ebay_service.build_title(c),
            desc,
            c.quantity or 1,
            wn["listing_type"],
            f"{price:.2f}",
            wn["shipping_profile"],
            wn["offerable"],
            "Not Hazmat",
            "Near Mint or Better" if c.condition in ("Mint", "Near Mint") else "Played",
            "",                                   # cost per item (seller-private)
            f"cardvault-{c.id}",
            *photos,
        ])

    return ("﻿" + out.getvalue()).encode("utf-8")


# ── Vinted ─────────────────────────────────────────────────────────────────────

def vinted_listing_texts(
    db: Session,
    user_id: int,
    card_ids: list[int] | None = None,
    for_trade_only: bool = False,
    options: dict | None = None,
) -> list[dict]:
    """Ready-to-paste Vinted listing texts (no API exists — copy & paste flow)."""
    opts = _opts(options)
    cards = _select_cards(db, user_id, card_ids, for_trade_only)

    out = []
    for c in cards:
        price = ebay_service.compute_price(c, opts)
        lang = _LANG_LABEL.get((c.language or "EN").upper(), c.language or "EN")
        cond = _CONDITION_LABEL_DE.get(c.condition, c.condition or "—")
        title = ebay_service.build_title(c)
        desc_lines = [
            f"Pokémon Karte: {c.name}",
            f"Set: {c.set_name or '—'}" + (f" ({c.set_code})" if c.set_code else ""),
        ]
        if c.rarity:
            desc_lines.append(f"Seltenheit: {c.rarity}")
        desc_lines += [
            f"Sprache: {lang}",
            f"Zustand: {cond}",
        ]
        if c.is_foil:
            desc_lines.append("Holo / Foil ✨")
        desc_lines += [
            "",
            "Versand als Standardbrief oder versichert — wie du möchtest.",
            "Weitere Karten im Profil, kombinierter Versand möglich!",
            "",
            "#pokemon #pokemonkarten #tcg #sammelkarten"
            + (f" #{(c.name or '').split()[0].lower()}" if c.name else ""),
        ]
        out.append({
            "id": c.id,
            "title": title[:70],                  # Vinted title limit
            "description": "\n".join(desc_lines),
            "price": price,
            "currency": "EUR",
            "image_url": c.image_url,
            "photo_front_url": sale_photo_service.public_url(c.photo_front),
        })
    return out


def build_vinted_txt(
    db: Session,
    user_id: int,
    card_ids: list[int] | None = None,
    for_trade_only: bool = False,
    options: dict | None = None,
) -> bytes:
    """One .txt file with all listings, separated for easy copy & paste."""
    items = vinted_listing_texts(db, user_id, card_ids, for_trade_only, options)
    parts = [
        "CARDVAULT → VINTED EXPORT",
        f"{len(items)} Listings — Titel, Beschreibung & Preis pro Karte.",
        "Vinted hat keine öffentliche Verkäufer-API, daher: Text kopieren,",
        "in der Vinted-App einfügen, eigene Fotos hochladen, fertig.",
        "=" * 60,
    ]
    for i, it in enumerate(items, 1):
        parts += [
            "",
            f"--- Karte {i}/{len(items)} " + "-" * 30,
            f"TITEL:  {it['title']}",
            f"PREIS:  {it['price']:.2f} €",
            "BESCHREIBUNG:",
            it["description"],
        ]
    return ("﻿" + "\n".join(parts)).encode("utf-8")
