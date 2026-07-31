"""
eBay Sell API integration — per-user account linking + live listing.

Architecture
------------
* CardVault registers ONE app at https://developer.ebay.com (App ID + Cert ID
  + RuName). These are server-wide env vars:
      EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_RU_NAME
      EBAY_ENV = "production" | "sandbox"       (default: production)
      EBAY_MARKETPLACE_ID = "EBAY_DE"           (default)
* Each USER then links their own eBay account via the OAuth user-consent flow:
  ``authorize_url()`` → user consents on ebay.com → ``exchange_code()`` stores
  their long-lived refresh token in ``marketplace_connections``.
* ``publish_card()`` runs the three-step listing flow: create/replace inventory
  item (SKU = cardvault-<card_id>) → create offer → publish offer.
* ``end_listing()`` withdraws an offer (used by auto-delist).
* ``fetch_recent_orders()`` polls the Fulfillment API — the sync job uses it to
  detect sales and delist the card everywhere else.

Everything degrades gracefully: without app credentials ``app_configured()`` is
False and the UI shows setup instructions instead of a broken button.
"""

import base64
import os
import urllib.parse
from datetime import datetime, timedelta

import httpx
from sqlalchemy.orm import Session

from models import MarketplaceConnection

_ENVS = {
    "production": {
        "oauth": "https://api.ebay.com/identity/v1/oauth2/token",
        "authorize": "https://auth.ebay.com/oauth2/authorize",
        "api": "https://api.ebay.com",
    },
    "sandbox": {
        "oauth": "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
        "authorize": "https://auth.sandbox.ebay.com/oauth2/authorize",
        "api": "https://api.sandbox.ebay.com",
    },
}

# Scopes: inventory management (list/delist) + order read (sold detection).
_SCOPES = " ".join([
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
])

_TIMEOUT = 25


def _env_name() -> str:
    return os.getenv("EBAY_ENV", "production").lower()


def _urls() -> dict:
    return _ENVS.get(_env_name(), _ENVS["production"])


def _app_creds() -> tuple[str, str, str]:
    return (
        os.getenv("EBAY_CLIENT_ID", ""),
        os.getenv("EBAY_CLIENT_SECRET", ""),
        os.getenv("EBAY_RU_NAME", ""),
    )


def app_configured() -> bool:
    cid, secret, ru = _app_creds()
    return bool(cid and secret and ru)


def marketplace_id() -> str:
    return os.getenv("EBAY_MARKETPLACE_ID", "EBAY_DE")


def status(db: Session | None = None, user_id: int | None = None) -> dict:
    cid, secret, ru = _app_creds()
    connected = False
    username = None
    if db is not None and user_id is not None:
        conn = get_connection(db, user_id)
        connected = bool(conn and conn.refresh_token and conn.status == "connected")
        username = conn.external_username if conn else None
    return {
        "app_configured": app_configured(),
        "env": _env_name(),
        "marketplace_id": marketplace_id(),
        "user_connected": connected,
        "ebay_username": username,
        "missing": [
            n for n, v in (
                ("EBAY_CLIENT_ID", cid),
                ("EBAY_CLIENT_SECRET", secret),
                ("EBAY_RU_NAME", ru),
            ) if not v
        ],
        "csv_export_available": True,
    }


# ── OAuth: user consent flow ──────────────────────────────────────────────────

def authorize_url(state: str) -> str:
    """URL the user visits to link their eBay account to CardVault."""
    cid, _, ru = _app_creds()
    if not app_configured():
        raise RuntimeError("eBay app credentials not configured")
    params = {
        "client_id": cid,
        "response_type": "code",
        "redirect_uri": ru,           # eBay uses the RuName as redirect_uri
        "scope": _SCOPES,
        "state": state,
    }
    return f"{_urls()['authorize']}?{urllib.parse.urlencode(params)}"


def _basic_auth() -> str:
    cid, secret, _ = _app_creds()
    return base64.b64encode(f"{cid}:{secret}".encode()).decode()


def exchange_code(db: Session, user_id: int, code: str) -> MarketplaceConnection:
    """Swap the consent code for tokens and persist the connection."""
    _, _, ru = _app_creds()
    resp = httpx.post(
        _urls()["oauth"],
        headers={
            "Authorization": f"Basic {_basic_auth()}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={"grant_type": "authorization_code", "code": code, "redirect_uri": ru},
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    tok = resp.json()

    conn = get_connection(db, user_id) or MarketplaceConnection(
        user_id=user_id, platform="ebay"
    )
    conn.refresh_token = tok["refresh_token"]
    conn.access_token = tok["access_token"]
    conn.access_token_expires_at = datetime.utcnow() + timedelta(
        seconds=int(tok.get("expires_in", 7200)) - 120
    )
    conn.status = "connected"
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return conn


def get_connection(db: Session, user_id: int) -> MarketplaceConnection | None:
    return (
        db.query(MarketplaceConnection)
        .filter(
            MarketplaceConnection.user_id == user_id,
            MarketplaceConnection.platform == "ebay",
        )
        .first()
    )


def disconnect(db: Session, user_id: int) -> None:
    conn = get_connection(db, user_id)
    if conn:
        db.delete(conn)
        db.commit()


def _access_token(db: Session, user_id: int) -> str:
    """Valid per-user access token, refreshed from the stored refresh token."""
    conn = get_connection(db, user_id)
    if not conn or not conn.refresh_token:
        raise RuntimeError("eBay account not connected")
    if (
        conn.access_token
        and conn.access_token_expires_at
        and conn.access_token_expires_at > datetime.utcnow()
    ):
        return conn.access_token

    resp = httpx.post(
        _urls()["oauth"],
        headers={
            "Authorization": f"Basic {_basic_auth()}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type": "refresh_token",
            "refresh_token": conn.refresh_token,
            "scope": _SCOPES,
        },
        timeout=_TIMEOUT,
    )
    if resp.status_code >= 400:
        conn.status = "error"
        db.commit()
        raise RuntimeError(f"eBay token refresh failed: HTTP {resp.status_code}")
    tok = resp.json()
    conn.access_token = tok["access_token"]
    conn.access_token_expires_at = datetime.utcnow() + timedelta(
        seconds=int(tok.get("expires_in", 7200)) - 120
    )
    conn.status = "connected"
    db.commit()
    return conn.access_token


def _headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Content-Language": "de-DE" if marketplace_id() == "EBAY_DE" else "en-US",
    }


# ── Listing: inventory item → offer → publish ─────────────────────────────────

def publish_card(
    db: Session,
    user_id: int,
    card,
    title: str,
    description_html: str,
    price: float,
    currency: str,
    image_urls: list[str],
    condition_note: str | None = None,
) -> dict:
    """Create a live fixed-price listing for one card. Returns listing info.

    Requires the user's eBay account to have business policies (payment /
    return / shipping) configured — eBay demands them for Inventory-API
    listings. We use the account's DEFAULT policies via the offer's
    ``merchantLocationKey``-less minimal form; if eBay rejects for missing
    policies the error is surfaced verbatim so the seller knows what to fix.
    """
    token = _access_token(db, user_id)
    api = _urls()["api"]
    sku = f"cardvault-{card.id}"

    # 1. Inventory item (idempotent PUT by SKU).
    inv_payload = {
        "product": {
            "title": title[:80],
            "description": description_html,
            "imageUrls": image_urls[:12] or None,
            "aspects": {
                "Spiel": ["Pokémon TCG"],
                "Sprache": [card.language or "EN"],
                **({"Seltenheit": [card.rarity]} if card.rarity else {}),
                **({"Set": [card.set_name]} if card.set_name else {}),
            },
        },
        "condition": "USED_EXCELLENT",
        **({"conditionDescription": condition_note} if condition_note else {}),
        "availability": {
            "shipToLocationAvailability": {"quantity": card.quantity or 1}
        },
    }
    r = httpx.put(
        f"{api}/sell/inventory/v1/inventory_item/{sku}",
        headers=_headers(token), json=inv_payload, timeout=_TIMEOUT,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"eBay inventory item failed: {r.status_code} {r.text[:400]}")

    # 2. Offer (or reuse an existing one for this SKU).
    offer_payload = {
        "sku": sku,
        "marketplaceId": marketplace_id(),
        "format": "FIXED_PRICE",
        "availableQuantity": card.quantity or 1,
        "categoryId": os.getenv("EBAY_CATEGORY", "183454"),
        "listingDescription": description_html,
        "pricingSummary": {
            "price": {"value": f"{price:.2f}", "currency": currency}
        },
        "listingPolicies": _listing_policies(),
    }
    r = httpx.post(
        f"{api}/sell/inventory/v1/offer",
        headers=_headers(token), json=offer_payload, timeout=_TIMEOUT,
    )
    if r.status_code == 400 and "25002" in r.text:
        # Offer already exists for this SKU — fetch and update it.
        offers = httpx.get(
            f"{api}/sell/inventory/v1/offer?sku={sku}",
            headers=_headers(token), timeout=_TIMEOUT,
        ).json().get("offers", [])
        if not offers:
            raise RuntimeError(f"eBay offer conflict but none found: {r.text[:300]}")
        offer_id = offers[0]["offerId"]
        u = httpx.put(
            f"{api}/sell/inventory/v1/offer/{offer_id}",
            headers=_headers(token), json=offer_payload, timeout=_TIMEOUT,
        )
        if u.status_code >= 400:
            raise RuntimeError(f"eBay offer update failed: {u.status_code} {u.text[:400]}")
    elif r.status_code >= 400:
        raise RuntimeError(f"eBay offer failed: {r.status_code} {r.text[:400]}")
    else:
        offer_id = r.json()["offerId"]

    # 3. Publish.
    p = httpx.post(
        f"{api}/sell/inventory/v1/offer/{offer_id}/publish",
        headers=_headers(token), timeout=_TIMEOUT,
    )
    if p.status_code >= 400:
        raise RuntimeError(f"eBay publish failed: {p.status_code} {p.text[:400]}")
    listing_id = p.json().get("listingId")

    return {"sku": sku, "offer_id": offer_id, "listing_id": listing_id}


def _listing_policies() -> dict:
    """Business-policy IDs. If the seller set env overrides use them; otherwise
    eBay falls back to the account defaults where supported."""
    out = {}
    for env, key in (
        ("EBAY_FULFILLMENT_POLICY_ID", "fulfillmentPolicyId"),
        ("EBAY_PAYMENT_POLICY_ID", "paymentPolicyId"),
        ("EBAY_RETURN_POLICY_ID", "returnPolicyId"),
    ):
        v = os.getenv(env, "")
        if v:
            out[key] = v
    return out


def end_listing(db: Session, user_id: int, offer_id: str) -> bool:
    """Withdraw (end) a published offer — used for auto-delist."""
    token = _access_token(db, user_id)
    r = httpx.post(
        f"{_urls()['api']}/sell/inventory/v1/offer/{offer_id}/withdraw",
        headers=_headers(token), timeout=_TIMEOUT,
    )
    return r.status_code < 400


# ── Sold detection ────────────────────────────────────────────────────────────

def fetch_recent_orders(db: Session, user_id: int, hours: int = 48) -> list[dict]:
    """Recent paid orders with their line-item SKUs (Fulfillment API)."""
    token = _access_token(db, user_id)
    since = (datetime.utcnow() - timedelta(hours=hours)).strftime(
        "%Y-%m-%dT%H:%M:%S.000Z"
    )
    r = httpx.get(
        f"{_urls()['api']}/sell/fulfillment/v1/order",
        headers=_headers(token),
        params={"filter": f"creationdate:[{since}..]", "limit": 100},
        timeout=_TIMEOUT,
    )
    if r.status_code >= 400:
        raise RuntimeError(f"eBay orders fetch failed: {r.status_code}")
    orders = []
    for o in r.json().get("orders", []):
        skus = [
            li.get("sku")
            for li in o.get("lineItems", [])
            if li.get("sku", "").startswith("cardvault-")
        ]
        if skus:
            orders.append({
                "order_id": o.get("orderId"),
                "status": o.get("orderFulfillmentStatus"),
                "skus": skus,
            })
    return orders
