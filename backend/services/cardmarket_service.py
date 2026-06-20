"""
Cardmarket API v2.0 integration (OAuth 1.0a).

Setup
-----
Register your app at https://www.cardmarket.com/en/Magic/Account/API
then set these env vars (all four are required):
    CM_APP_TOKEN, CM_APP_SECRET, CM_ACCESS_TOKEN, CM_ACCESS_SECRET

Without credentials every function returns empty results gracefully –
the rest of the app continues to work with TCG API data only.

Pokemon game ID on Cardmarket = 3
Language IDs: 1=EN  2=FR  3=DE  4=ES  5=IT
"""

import json
import logging
import os
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

CM_BASE = "https://api.cardmarket.com/ws/v2.0/output.json"
GAME_ID = 3
PAGE_SIZE = 20
CACHE_TTL_HOURS = 24

LANG_ID: dict[str, int] = {
    "EN": 1, "FR": 2, "DE": 3, "ES": 4, "IT": 5,
}
LANG_SLUG: dict[str, str] = {
    "EN": "en", "FR": "fr", "DE": "de", "ES": "es", "IT": "it",
}


# ── Auth ──────────────────────────────────────────────────────────────────────

def _get_auth():
    """Return an OAuth1 session or None if credentials are missing."""
    try:
        from requests_oauthlib import OAuth1
    except ImportError:
        return None

    keys = [
        os.getenv("CM_APP_TOKEN", ""),
        os.getenv("CM_APP_SECRET", ""),
        os.getenv("CM_ACCESS_TOKEN", ""),
        os.getenv("CM_ACCESS_SECRET", ""),
    ]
    if not all(keys):
        return None
    return OAuth1(*keys)


def cm_available() -> bool:
    return _get_auth() is not None


# ── Cache helpers (reuse ApiCache table) ─────────────────────────────────────

def _cache_get(db: Session, key: str):
    from models import ApiCache
    entry = db.query(ApiCache).filter(ApiCache.cache_key == key).first()
    if not entry:
        return None
    if datetime.utcnow() > entry.cached_at + timedelta(hours=CACHE_TTL_HOURS):
        db.delete(entry)
        db.commit()
        return None
    return json.loads(entry.response_json)


def _cache_set(db: Session, key: str, data) -> None:
    from models import ApiCache
    entry = db.query(ApiCache).filter(ApiCache.cache_key == key).first()
    if entry:
        entry.response_json = json.dumps(data)
        entry.cached_at = datetime.utcnow()
    else:
        entry = ApiCache(cache_key=key, response_json=json.dumps(data))
        db.add(entry)
    db.commit()


# ── Product search ────────────────────────────────────────────────────────────

def search_products(
    name: str,
    language: str,
    db: Session,
    page: int = 1,
) -> tuple[list[dict], bool]:
    """
    Search Cardmarket for Pokemon cards by name.
    Returns (results_list, has_more).
    """
    auth = _get_auth()
    if not auth:
        return [], False

    lang_id = LANG_ID.get(language.upper(), 1)
    cache_key = f"cm:search:{name}:{lang_id}:{page}"

    cached = _cache_get(db, cache_key)
    if cached is not None:
        return cached["items"], cached["has_more"]

    try:
        import requests
        resp = requests.get(
            f"{CM_BASE}/products/find",
            params={
                "search": name,
                "idGame": GAME_ID,
                "idLanguage": lang_id,
                "isExactMatch": "false",
                "start": (page - 1) * PAGE_SIZE,
                "maxResults": PAGE_SIZE + 1,  # fetch one extra to detect has_more
            },
            auth=auth,
            timeout=15,
        )
        resp.raise_for_status()
        raw_products = resp.json().get("product", []) or []
    except Exception as exc:
        logger.warning("Cardmarket search failed: %s", exc)
        return [], False

    has_more = len(raw_products) > PAGE_SIZE
    products = raw_products[:PAGE_SIZE]
    results = [_normalize_product(p, language) for p in products]

    _cache_set(db, cache_key, {"items": results, "has_more": has_more})
    return results, has_more


# ── Product prices ────────────────────────────────────────────────────────────

def get_product_prices(product_id: int, db: Session) -> dict:
    """Fetch price guide for a single Cardmarket product."""
    auth = _get_auth()
    if not auth:
        return {}

    cache_key = f"cm:prices:{product_id}"
    cached = _cache_get(db, cache_key)
    if cached is not None:
        return cached

    try:
        import requests
        resp = requests.get(
            f"{CM_BASE}/products/{product_id}",
            auth=auth,
            timeout=15,
        )
        resp.raise_for_status()
        product = resp.json().get("product", {}) or {}
        guide = product.get("priceGuide", {}) or {}
        prices = {
            "sell_eur": guide.get("SELL"),
            "low_eur": guide.get("LOW"),
            "avg_eur": guide.get("AVG"),
            "trend_eur": guide.get("TREND"),
            "avg30_eur": guide.get("AVG30"),
            "low_foil_eur": guide.get("LOWFOIL"),
            "trend_foil_eur": guide.get("TRENDFOIL"),
            "cm_product_id": product_id,
        }
    except Exception as exc:
        logger.warning("Cardmarket prices failed for %s: %s", product_id, exc)
        prices = {}

    _cache_set(db, cache_key, prices)
    return prices


# ── URL helpers ───────────────────────────────────────────────────────────────

def product_url(product_id: int, language: str = "EN") -> str:
    slug = LANG_SLUG.get(language.upper(), "en")
    return f"https://www.cardmarket.com/{slug}/Pokemon/Products/Singles/-/{product_id}"


# ── Normalisation ─────────────────────────────────────────────────────────────

def _normalize_product(p: dict, language: str = "EN") -> dict:
    """Map a raw Cardmarket product dict to the common candidate shape."""
    product_id = p.get("idProduct")
    img_path = p.get("image", "")
    img_url = f"https://static.cardmarket.com/img/Pokemon/Cards{img_path}" if img_path else ""

    guide = p.get("priceGuide", {}) or {}
    return {
        # Use "cm-<id>" so the frontend can distinguish CM vs TCG cards
        "id": f"cm-{product_id}",
        "cm_id": product_id,
        "name": p.get("enName") or p.get("locName") or "",
        "loc_name": p.get("locName"),
        "set": {"name": p.get("expansionName", "")},
        "rarity": p.get("rarity"),
        "images": {"small": img_url, "large": img_url},
        "price_trend_eur": guide.get("TREND"),
        "price_sell_eur": guide.get("SELL"),
        "cm_url": product_url(product_id, language) if product_id else None,
        "_source": "cardmarket",
        "_confidence": None,
    }
