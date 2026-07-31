"""
Whatnot Seller API (GraphQL) — per-user token integration.

Whatnot exposes an official Seller API at https://developers.whatnot.com
(GraphQL over HTTPS, token auth). Sellers generate an API token in their
Seller Hub and paste it into CardVault (Account → Marktplätze); we store it in
``marketplace_connections`` and can then:

* create a product + Buy-It-Now listing (cross-listing)
* unpublish/delete a listing (auto-delist when sold elsewhere)
* read recent orders (sold detection)

The CSV bulk import (marketplace_service.build_whatnot_csv) remains the
zero-setup path; this API path is for users who want full automation.
"""

import os

import httpx
from sqlalchemy.orm import Session

from models import MarketplaceConnection

API_URL = os.getenv("WHATNOT_API_URL", "https://api.whatnot.com/seller-api/graphql")
_TIMEOUT = 25


def get_connection(db: Session, user_id: int) -> MarketplaceConnection | None:
    return (
        db.query(MarketplaceConnection)
        .filter(
            MarketplaceConnection.user_id == user_id,
            MarketplaceConnection.platform == "whatnot",
        )
        .first()
    )


def save_token(db: Session, user_id: int, token: str) -> MarketplaceConnection:
    conn = get_connection(db, user_id) or MarketplaceConnection(
        user_id=user_id, platform="whatnot"
    )
    conn.refresh_token = token.strip()
    conn.status = "connected"
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return conn


def disconnect(db: Session, user_id: int) -> None:
    conn = get_connection(db, user_id)
    if conn:
        db.delete(conn)
        db.commit()


def connected(db: Session, user_id: int) -> bool:
    conn = get_connection(db, user_id)
    return bool(conn and conn.refresh_token and conn.status == "connected")


def _gql(db: Session, user_id: int, query: str, variables: dict | None = None) -> dict:
    conn = get_connection(db, user_id)
    if not conn or not conn.refresh_token:
        raise RuntimeError("Whatnot account not connected")
    r = httpx.post(
        API_URL,
        headers={
            "Authorization": f"Bearer {conn.refresh_token}",
            "Content-Type": "application/json",
        },
        json={"query": query, "variables": variables or {}},
        timeout=_TIMEOUT,
    )
    if r.status_code >= 400:
        if r.status_code in (401, 403):
            conn.status = "error"
            db.commit()
        raise RuntimeError(f"Whatnot API error: HTTP {r.status_code}")
    data = r.json()
    if data.get("errors"):
        raise RuntimeError(f"Whatnot API error: {data['errors'][0].get('message')}")
    return data.get("data", {})


def verify_token(db: Session, user_id: int) -> dict:
    """Cheap `me` query to validate the pasted token and grab the username."""
    data = _gql(db, user_id, "query { me { id username } }")
    me = data.get("me") or {}
    conn = get_connection(db, user_id)
    if conn and me.get("username"):
        conn.external_username = me["username"]
        db.commit()
    return me


def create_listing(
    db: Session, user_id: int, *, title: str, description: str,
    price: float, currency: str, quantity: int, image_urls: list[str],
) -> dict:
    """Create a product + Buy-It-Now listing. Returns {product_id, listing_id}."""
    q = """
    mutation($input: ProductInput!) {
      productCreate(input: $input) {
        product { id
          variants(first: 1) { edges { node { id } } }
        }
        userErrors { field message }
      }
    }"""
    variables = {
        "input": {
            "title": title,
            "description": description,
            "category": {"name": os.getenv("WHATNOT_CATEGORY", "Trading Card Games")},
            "media": [{"url": u} for u in image_urls[:8]],
            "variants": [{
                "price": {"amount": f"{price:.2f}", "currency": currency},
                "inventoryLevel": {"quantity": quantity},
                "salesChannels": [{"type": "MARKETPLACE"}],
            }],
        }
    }
    data = _gql(db, user_id, q, variables)
    payload = data.get("productCreate") or {}
    errs = payload.get("userErrors") or []
    if errs:
        raise RuntimeError(f"Whatnot listing failed: {errs[0].get('message')}")
    product = payload.get("product") or {}
    return {"product_id": product.get("id")}


def delete_listing(db: Session, user_id: int, listing_id: str) -> bool:
    """Unpublish + delete a listing (auto-delist)."""
    q = """
    mutation($input: ListingDeleteInput!) {
      listingDelete(input: $input) { userErrors { field message } }
    }"""
    try:
        data = _gql(db, user_id, q, {"input": {"id": listing_id}})
        errs = (data.get("listingDelete") or {}).get("userErrors") or []
        return not errs
    except RuntimeError:
        return False


def fetch_recent_orders(db: Session, user_id: int, limit: int = 50) -> list[dict]:
    """Recent orders with product titles (sold detection)."""
    q = """
    query($first: Int!) {
      orders(first: $first, sortKey: CREATED_AT, reverse: true) {
        edges { node {
          id status
          items(first: 10) { edges { node { id product { id title } } } }
        } }
      }
    }"""
    data = _gql(db, user_id, q, {"first": limit})
    out = []
    for edge in ((data.get("orders") or {}).get("edges") or []):
        node = edge.get("node") or {}
        items = [
            ((it.get("node") or {}).get("product") or {})
            for it in ((node.get("items") or {}).get("edges") or [])
        ]
        out.append({
            "order_id": node.get("id"),
            "status": node.get("status"),
            "products": [{"id": p.get("id"), "title": p.get("title")} for p in items],
        })
    return out
