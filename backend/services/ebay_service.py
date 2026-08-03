"""
eBay bulk-listing CSV export (eBay *File Exchange* format).

This produces a CSV you can upload directly under
**Verkäufer-Cockpit → Angebote → Hochladen (File Exchange)** on ebay.de
(or Seller Hub → Reports → Upload on other sites) to create many fixed-price
listings at once — no API credentials required, so it works immediately.

Defaults target **ebay.de / EUR** because that is the common case for German
sellers, but every site-specific value (SiteID, currency, category, shipping…)
is configurable via env vars or per-request options.

Pricing: each listing's price is derived from the card's stored Cardmarket EUR
price (trend → market → USD×rate fallback), multiplied by a configurable factor,
floored at a minimum, and optionally rounded to a psychological ".99" ending.

The exact File Exchange column set evolves over time; the columns here are the
documented core fields. Always run a *draft* upload first and let eBay validate
before publishing. The leaf **category** in particular should be verified for
your marketplace (defaults to the Pokémon "Einzelkarten" category on ebay.de).
"""

import csv
import io
import os
from html import escape

from sqlalchemy.orm import Session

from models import Card, SaleTemplatePhoto
from services import sale_photo_service

# ── Marketplace presets ───────────────────────────────────────────────────────
# (SiteID, Country, Currency) tuples keyed by a short site code.
SITES: dict[str, tuple[str, str, str]] = {
    "DE": ("Germany", "DE", "EUR"),
    "AT": ("Austria", "AT", "EUR"),
    "UK": ("UK", "GB", "GBP"),
    "US": ("US", "US", "USD"),
    "FR": ("France", "FR", "EUR"),
    "IT": ("Italy", "IT", "EUR"),
    "ES": ("Spain", "ES", "EUR"),
}

# Map our internal card condition to (eBay ConditionID, human label per site).
# Trading-card singles use ConditionID 4000 ("Ungraded"); the fine-grained grade
# is carried as the "Kartenzustand"/"Card Condition" item specific.
_CONDITION_GRADE = {
    "Mint": "Neuwertig (Mint)",
    "Near Mint": "Neuwertig (Near Mint)",
    "Lightly Played": "Leicht gespielt (Lightly Played)",
    "Moderately Played": "Mäßig gespielt (Moderately Played)",
    "Heavily Played": "Stark gespielt (Heavily Played)",
    "Damaged": "Beschädigt (Damaged)",
}
_UNGRADED_CONDITION_ID = "4000"

_LANG_LABEL = {
    "EN": "Englisch", "DE": "Deutsch", "FR": "Französisch",
    "IT": "Italienisch", "ES": "Spanisch", "JA": "Japanisch",
}


def _env(name: str, default: str) -> str:
    return os.getenv(name, default)


def default_options() -> dict:
    """Export defaults, overridable via env then per-request."""
    return {
        "site": _env("EBAY_SITE", "DE"),
        "category": _env("EBAY_CATEGORY", "183454"),  # Pokémon Einzelkarten (verify!)
        "listing_format": _env("EBAY_FORMAT", "FixedPrice"),
        "duration": _env("EBAY_DURATION", "GTC"),
        "location": _env("EBAY_LOCATION", "Deutschland"),
        "shipping_service": _env("EBAY_SHIPPING_SERVICE", "DE_DeutschePostBrief"),
        "shipping_cost": float(_env("EBAY_SHIPPING_COST", "1.80")),
        "price_multiplier": float(_env("EBAY_PRICE_MULTIPLIER", "1.0")),
        "min_price": float(_env("EBAY_MIN_PRICE", "0.99")),
        "round_99": _env("EBAY_ROUND_99", "true").lower() == "true",
        "usd_eur_rate": float(_env("USD_EUR_RATE", "0.92")),
    }


# ── Pricing ────────────────────────────────────────────────────────────────────

def compute_price(card: Card, opts: dict) -> float:
    """Suggested list price for a card, in the marketplace currency."""
    base = card.price_trend_eur or card.market_price_eur or card.price_low_eur
    if base is None and card.market_price_usd:
        base = card.market_price_usd * opts["usd_eur_rate"]

    price = (base or 0.0) * opts["price_multiplier"]
    price = max(price, opts["min_price"])

    if opts["round_99"] and price >= 1:
        # Round UP to the next ".99" so we never undersell, e.g.
        # 3.45 → 3.99, 12.10 → 12.99, 4.00 → 4.99.
        import math
        candidate = math.floor(price) + 0.99
        if candidate < price:
            candidate += 1
        price = candidate
    return round(price, 2)


# ── Photos ─────────────────────────────────────────────────────────────────────

def collect_photo_urls(card: Card, templates: list[SaleTemplatePhoto]) -> list[str]:
    """Ordered list of public image URLs for a card's listing.

    Order: the seller's own photos in photo-plan order, then each fixed template
    photo inserted at its configured position. Falls back to the stock TCG image
    when the card has no own photo (so a listing always has at least one
    picture).
    """
    from services import photo_plan

    urls: list[str] = []
    for key in photo_plan.card_photo_keys(card):
        u = sale_photo_service.public_url(key)
        if u:
            urls.append(u)

    for tpl in sorted(templates, key=lambda t: (t.position or 99, t.id)):
        u = sale_photo_service.public_url(tpl.path)
        if not u:
            continue
        idx = max(0, min((tpl.position or len(urls) + 1) - 1, len(urls)))
        urls.insert(idx, u)

    if not urls and card.image_url:
        urls.append(card.image_url)
    # eBay allows up to 24 PicURLs; absolute http(s) URLs only.
    return [u for u in urls[:24] if u and u.startswith("http")]


def _pic_url_field(card: Card, templates: list[SaleTemplatePhoto]) -> str:
    """eBay File Exchange PicURL value: image URLs separated by '|'."""
    return "|".join(collect_photo_urls(card, templates))


# ── Title / description ────────────────────────────────────────────────────────

def build_title(card: Card) -> str:
    """eBay title, max 80 chars. Front-loads the most searchable terms."""
    parts = ["Pokémon", card.name or "Karte"]
    if card.set_name:
        parts.append(card.set_name)
    if card.set_code:
        parts.append(card.set_code)
    if card.rarity:
        parts.append(card.rarity)
    lang = _LANG_LABEL.get((card.language or "EN").upper())
    if lang:
        parts.append(lang)
    if card.is_foil:
        parts.append("Holo")
    title = " ".join(p for p in parts if p)
    if len(title) > 80:
        title = title[:80].rsplit(" ", 1)[0]
    return title


# Placeholders usable in the seller's own intro/outro text blocks. Kept small
# and German-facing on purpose: these are typed by hand into a text box, so
# every extra token is one more thing to get wrong.
PLACEHOLDERS = {
    "{name}": "Kartenname",
    "{set}": "Set-Name",
    "{nummer}": "Set-Code / Kartennummer",
    "{seltenheit}": "Seltenheit",
    "{sprache}": "Sprache",
    "{zustand}": "Zustand",
}


def render_block(text: str | None, card: Card) -> str:
    """Fill a seller text block and turn it into safe HTML paragraphs.

    The text is escaped *before* the newline-to-paragraph step, so a seller can
    type an ampersand or an angle bracket without breaking the listing — and
    cannot inject markup into their own description either.
    """
    if not text or not text.strip():
        return ""
    lang = _LANG_LABEL.get((card.language or "EN").upper(), card.language or "EN")
    values = {
        "{name}": card.name or "",
        "{set}": card.set_name or "",
        "{nummer}": card.set_code or "",
        "{seltenheit}": card.rarity or "",
        "{sprache}": lang,
        "{zustand}": _CONDITION_GRADE.get(card.condition, card.condition or ""),
    }
    filled = text
    for token, value in values.items():
        filled = filled.replace(token, value)
    paragraphs = [escape(p.strip()) for p in filled.split("\n") if p.strip()]
    return "".join(f"<p>{p}</p>" for p in paragraphs)


def build_description(
    card: Card, opts: dict, intro: str | None = None, outro: str | None = None
) -> str:
    """Simple, clean HTML description (eBay accepts HTML).

    ``intro`` / ``outro`` are the seller's saved text blocks; when both are
    empty the generic shipping note at the bottom is kept as a fallback so a
    listing is never left without one.
    """
    grade = _CONDITION_GRADE.get(card.condition, card.condition or "—")
    lang = _LANG_LABEL.get((card.language or "EN").upper(), card.language or "EN")
    rows = [
        ("Karte", card.name),
        ("Set", card.set_name),
        ("Set-Code / Nummer", card.set_code),
        ("Seltenheit", card.rarity),
        ("Sprache", lang),
        ("Zustand", grade),
        ("Holo / Foil", "Ja" if card.is_foil else "Nein"),
    ]
    body = "".join(
        f"<tr><td style='padding:4px 12px 4px 0;color:#555'>{escape(str(k))}</td>"
        f"<td style='padding:4px 0'><b>{escape(str(v))}</b></td></tr>"
        for k, v in rows if v
    )
    img = (
        f"<p><img src='{escape(card.image_url)}' alt='{escape(card.name or '')}' "
        f"style='max-width:360px'/></p>" if card.image_url else ""
    )
    intro_html = render_block(intro, card)
    outro_html = render_block(outro, card)
    if not outro_html and not intro_html:
        outro_html = (
            "<p style='color:#777;font-size:12px'>Versand als Standardbrief mit "
            "Sendungsverfolgung möglich. Bei mehreren Karten bitte vor dem Kauf "
            "wegen kombiniertem Versand anfragen.</p>"
        )
    return (
        "<div style='font-family:Arial,sans-serif;font-size:14px'>"
        f"<h2>{escape(build_title(card))}</h2>"
        f"{intro_html}"
        f"{img}"
        f"<table>{body}</table>"
        f"{outro_html}"
        "</div>"
    )


# ── Readiness check ────────────────────────────────────────────────────────────

def listing_warnings(card: Card, photos: list[str], price: float, opts: dict) -> list[str]:
    """Everything about this card that would make a poor or risky listing.

    These used to be invisible: the CSV was produced regardless, and the seller
    only found out after eBay had published 40 listings using Pokémon's own
    artwork at the minimum price. Surfacing them before the download is the
    whole point.
    """
    out: list[str] = []
    from services import photo_plan

    own_photos = len(photo_plan.card_photo_keys(card))
    if not own_photos:
        out.append(
            "Kein eigenes Foto — das Angebot würde das Bild des Herstellers "
            "verwenden. Das ist urheberrechtlich heikel und verkauft schlechter."
        )
    if not (card.price_trend_eur or card.market_price_eur or card.market_price_usd):
        out.append(
            f"Kein Marktpreis hinterlegt — es würde der Mindestpreis von "
            f"{opts['min_price']:.2f} € eingesetzt."
        )
    if not photos:
        out.append("Überhaupt kein Bild verfügbar — eBay lehnt das Angebot ab.")
    if len(build_title(card)) >= 80:
        out.append("Titel musste auf 80 Zeichen gekürzt werden.")
    if not card.set_name:
        out.append("Kein Set hinterlegt — Titel und Beschreibung bleiben dünn.")
    if (card.quantity or 1) > 1:
        out.append(
            f"Menge {card.quantity}: eBay stellt daraus ein Angebot mit "
            f"{card.quantity} Stück, nicht {card.quantity} Einzelangebote."
        )
    return out


# ── CSV builder ────────────────────────────────────────────────────────────────

def _action_header(opts: dict) -> str:
    site_id, country, currency = SITES.get(opts["site"], SITES["DE"])
    return (
        f"*Action(SiteID={site_id}|Country={country}|Currency={currency}"
        "|Version=1193|CC=UTF-8)"
    )


def build_listing_csv(
    db: Session,
    user_id: int,
    card_ids: list[int] | None = None,
    for_trade_only: bool = False,
    options: dict | None = None,
) -> bytes:
    """
    Build an eBay File Exchange "Add" CSV for the selected cards.

    user_id:         only this user's cards are exported
    card_ids:        explicit subset of card IDs (None = whole collection)
    for_trade_only:  if True, only cards flagged for_trade are exported
    options:         overrides merged over default_options()
    """
    opts = default_options()
    if options:
        opts.update({k: v for k, v in options.items() if v is not None})

    q = db.query(Card).filter(Card.user_id == user_id)
    if card_ids:
        q = q.filter(Card.id.in_(card_ids))
    if for_trade_only:
        q = q.filter(Card.for_trade.is_(True))
    cards = q.order_by(Card.set_name, Card.name).all()

    templates = (
        db.query(SaleTemplatePhoto)
        .filter(SaleTemplatePhoto.user_id == user_id)
        .all()
    )
    intro, outro = _text_blocks(db, user_id)

    out = io.StringIO()
    writer = csv.writer(out)
    header = [
        _action_header(opts),
        "*Category",
        "*Title",
        "*Description",
        "*ConditionID",
        "C:Kartenzustand",          # item specific: card condition grade
        "C:Spiel",                  # item specific: game
        "C:Sprache",                # item specific: language
        "PicURL",
        "*Quantity",
        "*Format",
        "*StartPrice",
        "*Duration",
        "*Location",
        "ShippingType",
        "ShippingService-1:Option",
        "ShippingService-1:Cost",
    ]
    writer.writerow(header)

    for c in cards:
        price = compute_price(c, opts)
        grade = _CONDITION_GRADE.get(c.condition, c.condition or "")
        lang = _LANG_LABEL.get((c.language or "EN").upper(), c.language or "EN")
        writer.writerow([
            "Add",
            opts["category"],
            build_title(c),
            build_description(c, opts, intro, outro),
            _UNGRADED_CONDITION_ID,
            grade,
            "Pokémon",
            lang,
            _pic_url_field(c, templates),
            c.quantity or 1,
            opts["listing_format"],
            f"{price:.2f}",
            opts["duration"],
            opts["location"],
            "Flat",
            opts["shipping_service"],
            f"{opts['shipping_cost']:.2f}",
        ])

    # UTF-8 BOM so Excel / eBay read special characters (é, ä, …) correctly.
    return ("﻿" + out.getvalue()).encode("utf-8")


def preview_listings(
    db: Session,
    user_id: int,
    card_ids: list[int] | None = None,
    for_trade_only: bool = False,
    options: dict | None = None,
) -> list[dict]:
    """Return a JSON-friendly preview (title + price) without building the CSV."""
    opts = default_options()
    if options:
        opts.update({k: v for k, v in options.items() if v is not None})

    q = db.query(Card).filter(Card.user_id == user_id)
    if card_ids:
        q = q.filter(Card.id.in_(card_ids))
    if for_trade_only:
        q = q.filter(Card.for_trade.is_(True))
    cards = q.order_by(Card.set_name, Card.name).all()

    templates = (
        db.query(SaleTemplatePhoto)
        .filter(SaleTemplatePhoto.user_id == user_id)
        .all()
    )

    from services import photo_plan

    out = []
    for c in cards:
        photos = collect_photo_urls(c, templates)
        own = len(photo_plan.card_photo_keys(c))
        price = compute_price(c, opts)
        out.append({
            "id": c.id,
            "title": build_title(c),
            "price": price,
            "currency": SITES.get(opts["site"], SITES["DE"])[2],
            "quantity": c.quantity or 1,
            "image_url": photos[0] if photos else c.image_url,
            "n_photos": len(photos),
            "n_own_photos": own,
            "has_price_data": bool(
                c.price_trend_eur or c.market_price_eur or c.market_price_usd
            ),
            "warnings": listing_warnings(c, photos, price, opts),
        })
    return out


def _text_blocks(db: Session, user_id: int) -> tuple[str | None, str | None]:
    """The seller's saved intro/outro text, or (None, None)."""
    from models import User

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None, None
    return user.sale_intro, user.sale_outro


def preview_description(db: Session, user_id: int, card: Card) -> str:
    """Render one full description exactly as the CSV would contain it."""
    intro, outro = _text_blocks(db, user_id)
    return build_description(card, default_options(), intro, outro)
