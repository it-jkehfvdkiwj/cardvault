"""
Multi-marketplace hub: /api/market/…

* Exports:   Whatnot CSV, Vinted text bundle (+ JSON previews)
* Accounts:  eBay OAuth linking, Whatnot API-token linking
* Automation: live cross-listing (eBay + Whatnot) and sold-sync/auto-delist
"""

from datetime import datetime, timedelta
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Card, MarketplaceListing, SaleTemplatePhoto, User
from services import (
    auth_service,
    ebay_api_service,
    ebay_service,
    marketplace_service,
    plan_service,
    whatnot_api_service,
)

router = APIRouter(prefix="/api/market", tags=["market"])


def _require_pro(user: User) -> None:
    if not plan_service.has_feature(user, "ebay_export"):
        raise HTTPException(
            status_code=402,
            detail="Marktplatz-Export ist ein Pro-Feature.",
        )


class ExportRequest(BaseModel):
    card_ids: Optional[list[int]] = None
    for_trade_only: bool = False
    options: Optional[dict] = None


class WhatnotTokenRequest(BaseModel):
    token: str


class PublishRequest(BaseModel):
    card_ids: list[int]
    platforms: list[str]                      # subset of ["ebay", "whatnot"]
    options: Optional[dict] = None


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status")
def market_status(
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """Everything the export/connect UI needs in one call."""
    wn_conn = whatnot_api_service.get_connection(db, user.id)
    active = (
        db.query(MarketplaceListing)
        .filter(
            MarketplaceListing.user_id == user.id,
            MarketplaceListing.status == "active",
        )
        .count()
    )
    return {
        "ebay": ebay_api_service.status(db, user.id),
        "whatnot": {
            "api_connected": whatnot_api_service.connected(db, user.id),
            "username": wn_conn.external_username if wn_conn else None,
            "csv_export_available": True,
        },
        "vinted": {
            # No public seller API — copy&paste export only (honest capability).
            "api_available": False,
            "text_export_available": True,
        },
        "active_listings": active,
        "default_options": ebay_service.default_options(),
        "whatnot_options": marketplace_service.whatnot_default_options(),
    }


# ── Whatnot export ────────────────────────────────────────────────────────────

@router.post("/whatnot/export/csv")
def whatnot_export_csv(
    payload: ExportRequest,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    _require_pro(user)
    data = marketplace_service.build_whatnot_csv(
        db, user.id, payload.card_ids, payload.for_trade_only, payload.options
    )
    return Response(
        content=data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=whatnot_listings.csv"},
    )


# ── Vinted export ─────────────────────────────────────────────────────────────

@router.post("/vinted/preview")
def vinted_preview(
    payload: ExportRequest,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    items = marketplace_service.vinted_listing_texts(
        db, user.id, payload.card_ids, payload.for_trade_only, payload.options
    )
    return {"count": len(items), "listings": items}


@router.post("/vinted/export/txt")
def vinted_export_txt(
    payload: ExportRequest,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    _require_pro(user)
    data = marketplace_service.build_vinted_txt(
        db, user.id, payload.card_ids, payload.for_trade_only, payload.options
    )
    return Response(
        content=data,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=vinted_listings.txt"},
    )


# ── eBay account linking (OAuth) ──────────────────────────────────────────────

def _state_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "purpose": "ebay_oauth",
        "exp": datetime.utcnow() + timedelta(minutes=15),
    }
    return jwt.encode(payload, auth_service.JWT_SECRET, algorithm="HS256")


def _verify_state(state: str) -> int:
    try:
        payload = jwt.decode(state, auth_service.JWT_SECRET, algorithms=["HS256"])
        if payload.get("purpose") != "ebay_oauth":
            raise ValueError
        return int(payload["sub"])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")


@router.get("/ebay/connect")
def ebay_connect(
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """Return the eBay consent URL the frontend opens in a new tab."""
    if not ebay_api_service.app_configured():
        raise HTTPException(
            status_code=400,
            detail="eBay-App noch nicht konfiguriert. EBAY_CLIENT_ID, "
                   "EBAY_CLIENT_SECRET und EBAY_RU_NAME als Umgebungsvariablen "
                   "setzen (kostenloser Account auf developer.ebay.com).",
        )
    return {"authorize_url": ebay_api_service.authorize_url(_state_token(user.id))}


@router.get("/ebay/callback")
def ebay_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db),
):
    """OAuth redirect target — no auth header (browser redirect), so identity
    comes from the signed state token."""
    user_id = _verify_state(state)
    try:
        ebay_api_service.exchange_code(db, user_id, code)
        body = ("✅ eBay-Konto verbunden!", "Du kannst dieses Fenster schließen.")
    except Exception as exc:
        body = ("❌ Verbindung fehlgeschlagen", str(exc)[:200])
    return HTMLResponse(
        f"""<!doctype html><html><body style="font-family:system-ui;background:#0B1220;
        color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center"><h2>{body[0]}</h2><p style="color:#94a3b8">{body[1]}</p>
        </div><script>setTimeout(()=>window.close(),2500)</script></body></html>"""
    )


@router.delete("/ebay/connection")
def ebay_disconnect(
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    ebay_api_service.disconnect(db, user.id)
    return {"ok": True}


# ── Whatnot account linking (API token) ───────────────────────────────────────

@router.post("/whatnot/connection")
def whatnot_connect(
    payload: WhatnotTokenRequest,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    if not payload.token.strip():
        raise HTTPException(status_code=400, detail="Token fehlt")
    whatnot_api_service.save_token(db, user.id, payload.token)
    try:
        me = whatnot_api_service.verify_token(db, user.id)
        return {"ok": True, "username": me.get("username")}
    except Exception as exc:
        whatnot_api_service.disconnect(db, user.id)
        raise HTTPException(status_code=400, detail=f"Token ungültig: {exc}")


@router.delete("/whatnot/connection")
def whatnot_disconnect(
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    whatnot_api_service.disconnect(db, user.id)
    return {"ok": True}


# ── Live cross-listing ────────────────────────────────────────────────────────

@router.post("/publish")
def publish(
    payload: PublishRequest,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """List the selected cards live on the chosen platforms (API accounts
    required). Every created listing is recorded in the cross-listing ledger so
    the sync job can auto-delist on a sale."""
    _require_pro(user)
    if not payload.card_ids:
        raise HTTPException(status_code=400, detail="Keine Karten ausgewählt")

    opts = ebay_service.default_options()
    if payload.options:
        opts.update({k: v for k, v in payload.options.items() if v is not None})

    cards = (
        db.query(Card)
        .filter(Card.id.in_(payload.card_ids), Card.user_id == user.id)
        .all()
    )
    templates = (
        db.query(SaleTemplatePhoto)
        .filter(SaleTemplatePhoto.user_id == user.id)
        .all()
    )

    results = []
    for card in cards:
        title = ebay_service.build_title(card)
        desc = ebay_service.build_description(card, opts)
        price = ebay_service.compute_price(card, opts)
        currency = ebay_service.SITES.get(opts["site"], ebay_service.SITES["DE"])[2]
        photos = ebay_service.collect_photo_urls(card, templates)
        entry = {"card_id": card.id, "title": title, "platforms": {}}

        for platform in payload.platforms:
            try:
                if platform == "ebay":
                    info = ebay_api_service.publish_card(
                        db, user.id, card, title, desc, price, currency, photos,
                    )
                    external_id = info.get("offer_id")
                elif platform == "whatnot":
                    info = whatnot_api_service.create_listing(
                        db, user.id, title=title, description=desc,
                        price=price, currency=currency,
                        quantity=card.quantity or 1, image_urls=photos,
                    )
                    external_id = info.get("product_id")
                else:
                    entry["platforms"][platform] = {
                        "ok": False, "error": "Plattform nicht automatisierbar"
                    }
                    continue

                listing = MarketplaceListing(
                    user_id=user.id, card_id=card.id, platform=platform,
                    external_id=external_id, sku=f"cardvault-{card.id}",
                    status="active", price=price, currency=currency,
                )
                db.add(listing)
                db.commit()
                entry["platforms"][platform] = {"ok": True, **info}
            except Exception as exc:
                db.rollback()
                entry["platforms"][platform] = {"ok": False, "error": str(exc)[:300]}
        results.append(entry)

    return {"results": results}


# ── Sold-sync + auto-delist ───────────────────────────────────────────────────

@router.post("/sync")
def sync_sales(
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """Check connected platforms for sales; when a card sold anywhere, end its
    listings on all other platforms and mark it sold in the ledger.

    Called from the UI ("Jetzt synchronisieren") — can later be wired to a cron
    or eBay Platform Notifications for real-time behaviour.
    """
    sold_card_ids: set[int] = set()
    checked = []

    # eBay orders → SKUs like "cardvault-<card_id>"
    if ebay_api_service.get_connection(db, user.id):
        try:
            for order in ebay_api_service.fetch_recent_orders(db, user.id):
                for sku in order["skus"]:
                    try:
                        sold_card_ids.add(int(sku.split("-", 1)[1]))
                    except (IndexError, ValueError):
                        pass
            checked.append("ebay")
        except Exception:
            pass

    # Whatnot orders → match by our ledger's external product IDs
    if whatnot_api_service.connected(db, user.id):
        try:
            product_ids = {
                l.external_id: l.card_id
                for l in db.query(MarketplaceListing).filter(
                    MarketplaceListing.user_id == user.id,
                    MarketplaceListing.platform == "whatnot",
                    MarketplaceListing.status == "active",
                )
            }
            for order in whatnot_api_service.fetch_recent_orders(db, user.id):
                for p in order["products"]:
                    if p.get("id") in product_ids:
                        sold_card_ids.add(product_ids[p["id"]])
            checked.append("whatnot")
        except Exception:
            pass

    delisted = []
    for card_id in sold_card_ids:
        listings = (
            db.query(MarketplaceListing)
            .filter(
                MarketplaceListing.user_id == user.id,
                MarketplaceListing.card_id == card_id,
                MarketplaceListing.status == "active",
            )
            .all()
        )
        for l in listings:
            ended = False
            try:
                if l.platform == "ebay":
                    ended = ebay_api_service.end_listing(db, user.id, l.external_id)
                elif l.platform == "whatnot":
                    ended = whatnot_api_service.delete_listing(db, user.id, l.external_id)
            except Exception:
                ended = False
            l.status = "sold" if not ended else "ended"
            l.ended_at = datetime.utcnow()
            if ended:
                delisted.append({"card_id": card_id, "platform": l.platform})
        db.commit()

    return {
        "checked_platforms": checked,
        "sold_card_ids": sorted(sold_card_ids),
        "delisted": delisted,
    }


@router.get("/listings")
def list_marketplace_listings(
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    rows = (
        db.query(MarketplaceListing, Card.name)
        .join(Card, Card.id == MarketplaceListing.card_id)
        .filter(MarketplaceListing.user_id == user.id)
        .order_by(MarketplaceListing.listed_at.desc())
        .limit(200)
        .all()
    )
    return {
        "listings": [
            {
                "id": l.id, "card_id": l.card_id, "card_name": name,
                "platform": l.platform, "status": l.status,
                "price": l.price, "currency": l.currency,
                "external_id": l.external_id,
                "listed_at": l.listed_at.isoformat() if l.listed_at else None,
            }
            for l, name in rows
        ]
    }
