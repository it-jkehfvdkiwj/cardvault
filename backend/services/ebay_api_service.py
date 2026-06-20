"""
eBay Sell API integration — SCAFFOLD.

This is the groundwork for *direct* live listing via eBay's REST Sell APIs
(Inventory + Offer). It is intentionally inert until you provide credentials, so
the rest of the app (and the CSV export in ``ebay_service``) keeps working
without an eBay developer account.

To enable later
---------------
1. Create an app at https://developer.ebay.com → get App ID (client_id) and
   Cert ID (client_secret).
2. Run the OAuth user-consent flow once to obtain a **refresh token** with the
   ``sell.inventory`` scope.
3. Set these env vars:
       EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_REFRESH_TOKEN
       EBAY_ENV = "production" | "sandbox"   (default: production)
       EBAY_MARKETPLACE_ID = "EBAY_DE"       (default)
4. Implement ``create_listing`` (inventory item → offer → publish). The token
   plumbing below is ready to use.

Until then ``status()`` reports what's missing and ``create_listing`` returns a
clear "not configured / not implemented" result instead of failing silently.
"""

import base64
import os
import time

import httpx

_ENVS = {
    "production": {
        "oauth": "https://api.ebay.com/identity/v1/oauth2/token",
        "api": "https://api.ebay.com",
    },
    "sandbox": {
        "oauth": "https://api.sandbox.ebay.com/identity/v1/oauth2/token",
        "api": "https://api.sandbox.ebay.com",
    },
}

_SCOPE = "https://api.ebay.com/oauth/api_scope/sell.inventory"

# Simple in-process token cache.
_token_cache: dict = {"access_token": None, "expires_at": 0.0}


def _env_name() -> str:
    return os.getenv("EBAY_ENV", "production").lower()


def _creds() -> tuple[str, str, str]:
    return (
        os.getenv("EBAY_CLIENT_ID", ""),
        os.getenv("EBAY_CLIENT_SECRET", ""),
        os.getenv("EBAY_REFRESH_TOKEN", ""),
    )


def ebay_available() -> bool:
    """True only when all credentials needed for live listing are present."""
    cid, secret, refresh = _creds()
    return bool(cid and secret and refresh)


def status() -> dict:
    """Report configuration state (used by the /api/ebay/status endpoint)."""
    cid, secret, refresh = _creds()
    return {
        "live_listing_available": ebay_available(),
        "env": _env_name(),
        "marketplace_id": os.getenv("EBAY_MARKETPLACE_ID", "EBAY_DE"),
        "missing": [
            name for name, val in (
                ("EBAY_CLIENT_ID", cid),
                ("EBAY_CLIENT_SECRET", secret),
                ("EBAY_REFRESH_TOKEN", refresh),
            ) if not val
        ],
        # CSV export always works regardless of API creds.
        "csv_export_available": True,
    }


def _get_access_token() -> str:
    """Exchange the stored refresh token for a short-lived access token."""
    now = time.time()
    if _token_cache["access_token"] and _token_cache["expires_at"] > now + 60:
        return _token_cache["access_token"]

    cid, secret, refresh = _creds()
    if not (cid and secret and refresh):
        raise RuntimeError("eBay credentials not configured")

    basic = base64.b64encode(f"{cid}:{secret}".encode()).decode()
    resp = httpx.post(
        _ENVS[_env_name()]["oauth"],
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh,
            "scope": _SCOPE,
        },
        timeout=20,
    )
    resp.raise_for_status()
    data = resp.json()
    _token_cache["access_token"] = data["access_token"]
    _token_cache["expires_at"] = now + int(data.get("expires_in", 7200))
    return _token_cache["access_token"]


def create_listing(card, options: dict | None = None) -> dict:
    """
    Create a single live eBay listing for a card.

    SCAFFOLD: the full Inventory→Offer→Publish flow requires configured eBay
    business policies (payment/return/shipping) that can't be set up here, so
    this returns a clear status rather than a half-working call. The token
    helper above is functional once credentials exist, so implementing the three
    REST calls is the only remaining step.
    """
    if not ebay_available():
        return {
            "ok": False,
            "status": "not_configured",
            "detail": "eBay API credentials missing. Use CSV export, or set "
                      "EBAY_CLIENT_ID / EBAY_CLIENT_SECRET / EBAY_REFRESH_TOKEN.",
        }
    return {
        "ok": False,
        "status": "not_implemented",
        "detail": "Live listing scaffold present and authenticated, but the "
                  "Inventory/Offer publish flow is not implemented yet. CSV "
                  "export is the supported path today.",
    }
