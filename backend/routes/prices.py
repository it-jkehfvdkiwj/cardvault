import asyncio
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Card, User
from services import auth_service, cardmarket_service, plan_service, tcg_api_service


class BulkRefreshRequest(BaseModel):
    ids: Optional[list[int]] = None

router = APIRouter(prefix="/api/prices", tags=["prices"])


@router.get("/{card_api_id}")
async def get_price(
    card_api_id: str,
    language: str = Query("EN"),
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """
    Refresh prices for a card from both TCG API (USD) and Cardmarket (EUR).
    Returns a merged price dict and updates the DB records for that card.
    """
    # ── TCG API prices (USD + embedded EUR trend) ─────────────────────────
    tcg_prices: dict = {}
    if not card_api_id.startswith("cm-"):
        try:
            card_data = await tcg_api_service.get_card_by_id(card_api_id, db)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"TCG API error: {exc}")
        if not card_data:
            raise HTTPException(status_code=404, detail="Card not found in TCG API")
        tcg_prices = tcg_api_service.extract_price(card_data)

    # ── Cardmarket dedicated prices (EUR) ─────────────────────────────────
    cm_prices: dict = {}
    db_cards = (
        db.query(Card)
        .filter(Card.tcg_card_id == card_api_id, Card.user_id == user.id)
        .all()
    )
    cm_product_id = next(
        (c.cm_product_id for c in db_cards if c.cm_product_id), None
    )
    if cm_product_id and cardmarket_service.cm_available():
        try:
            cm_prices = cardmarket_service.get_product_prices(cm_product_id, db)
        except Exception:
            pass

    # ── Merge and update DB ────────────────────────────────────────────────
    merged = {
        # USD
        "market_usd": tcg_prices.get("market"),
        "low_usd": tcg_prices.get("low"),
        "mid_usd": tcg_prices.get("mid"),
        "high_usd": tcg_prices.get("high"),
        # EUR (CM dedicated > TCG API embed)
        "sell_eur": cm_prices.get("sell_eur") or tcg_prices.get("market_eur"),
        "low_eur": cm_prices.get("low_eur") or tcg_prices.get("low_eur"),
        "trend_eur": cm_prices.get("trend_eur") or tcg_prices.get("trend_eur"),
        "avg30_eur": cm_prices.get("avg30_eur"),
        "low_foil_eur": cm_prices.get("low_foil_eur"),
        "trend_foil_eur": cm_prices.get("trend_foil_eur"),
        "cm_product_id": cm_product_id,
        "cm_url": (
            cardmarket_service.product_url(cm_product_id, language)
            if cm_product_id else None
        ),
    }

    for c in db_cards:
        c.market_price_usd = merged["market_usd"]
        c.price_low_usd = merged["low_usd"]
        c.price_mid_usd = merged["mid_usd"]
        c.price_high_usd = merged["high_usd"]
        c.market_price_eur = merged["sell_eur"]
        c.price_low_eur = merged["low_eur"]
        c.price_trend_eur = merged["trend_eur"]
        c.price_updated_at = datetime.utcnow()
    if db_cards:
        db.commit()

    return merged


@router.post("/bulk-refresh")
async def bulk_refresh_prices(
    payload: BulkRefreshRequest = Body(default=BulkRefreshRequest()),
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """
    Refresh prices for all (or a subset of) the user's cards from TCG API.
    Pro only. Deduplicates by TCG card ID so each unique card is only fetched
    once even when the user owns multiple copies.
    """
    if not plan_service.has_feature(user, "bulk_price_refresh"):
        raise HTTPException(
            status_code=402,
            detail="Bulk price refresh is a Pro feature. Upgrade to unlock.",
        )

    q = db.query(Card).filter(Card.user_id == user.id)
    if payload.ids:
        q = q.filter(Card.id.in_(payload.ids))
    cards = q.all()

    # Deduplicate: hit the API once per unique TCG card ID.
    seen: set[str] = set()
    unique_ids: list[str] = []
    for c in cards:
        tid = c.tcg_card_id or ""
        if tid and not tid.startswith("cm-") and tid not in seen:
            seen.add(tid)
            unique_ids.append(tid)

    unique_ids = unique_ids[:200]  # cap so the request doesn't time out

    refreshed = errors = 0
    now = datetime.utcnow()

    for tcg_id in unique_ids:
        try:
            card_data = await tcg_api_service.get_card_by_id(tcg_id, db)
            if card_data:
                prices = tcg_api_service.extract_price(card_data)
                rows = (
                    db.query(Card)
                    .filter(Card.user_id == user.id, Card.tcg_card_id == tcg_id)
                    .all()
                )
                for row in rows:
                    row.market_price_usd = prices.get("market")
                    row.price_low_usd = prices.get("low")
                    row.price_mid_usd = prices.get("mid")
                    row.price_high_usd = prices.get("high")
                    row.market_price_eur = prices.get("market_eur")
                    row.price_low_eur = prices.get("low_eur")
                    row.price_trend_eur = prices.get("trend_eur")
                    row.price_updated_at = now
                refreshed += 1
            else:
                errors += 1
        except Exception:
            errors += 1
        await asyncio.sleep(0.05)

    db.commit()
    return {
        "refreshed": refreshed,
        "errors": errors,
        "unique_cards": len(unique_ids),
        "total_rows": len(cards),
    }
