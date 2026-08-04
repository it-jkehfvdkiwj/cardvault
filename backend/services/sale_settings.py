"""
Listing defaults, stored per seller.

Marketplace, shipping, location and the pricing rule used to live only in
environment variables plus whatever was typed into the export dialog that day.
That meant re-entering the same four numbers on every export, and it meant two
exports could silently differ. They belong to the seller, so they are saved
with the seller.

Stored as JSON in ``User.sale_options``: adding an option later needs no
migration, and an unknown key from an older or newer release is ignored rather
than crashing the export.
"""

from __future__ import annotations

import json

from models import User
from services import ebay_service

# Only these keys are accepted from a client; anything else is dropped. Values
# are coerced to the right type, so a text field arriving as "1,80" or "" can
# never poison the CSV with a non-numeric price.
_NUMERIC = {"shipping_cost", "price_multiplier", "min_price", "usd_eur_rate"}
_BOOLEAN = {"round_99"}
_TEXT = {"site", "category", "listing_format", "duration", "location",
         "shipping_service"}
ALLOWED = _NUMERIC | _BOOLEAN | _TEXT


def defaults() -> dict:
    """Env-based defaults — the starting point for a seller who never chose."""
    return ebay_service.default_options()


def _coerce(key: str, value) -> object | None:
    if key in _NUMERIC:
        if isinstance(value, str):
            value = value.strip().replace(",", ".")
        try:
            n = float(value)
        except (TypeError, ValueError):
            return None
        return max(0.0, n)
    if key in _BOOLEAN:
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "on"}
        return bool(value)
    if key in _TEXT:
        text = str(value).strip()
        return text[:60] or None
    return None


def clean(patch: dict) -> dict:
    out: dict = {}
    for key, value in (patch or {}).items():
        if key not in ALLOWED or value is None:
            continue
        coerced = _coerce(key, value)
        if coerced is not None:
            out[key] = coerced
    if "site" in out and out["site"] not in ebay_service.SITES:
        del out["site"]
    return out


def options_of(user: User) -> dict:
    """The seller's effective options: defaults with their choices layered on."""
    opts = defaults()
    try:
        saved = json.loads(user.sale_options) if user.sale_options else {}
    except (ValueError, TypeError):
        saved = {}
    if isinstance(saved, dict):
        opts.update(clean(saved))
    return opts


def update(user: User, patch: dict) -> dict:
    """Merge a partial change into the stored options and return the result."""
    try:
        saved = json.loads(user.sale_options) if user.sale_options else {}
    except (ValueError, TypeError):
        saved = {}
    if not isinstance(saved, dict):
        saved = {}
    saved.update(clean(patch))
    user.sale_options = json.dumps(saved, ensure_ascii=False)
    return options_of(user)
