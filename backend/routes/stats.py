from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Card, User
from services import auth_service

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("")
def get_stats(
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    cards = db.query(Card).filter(Card.user_id == user.id).all()
    if not cards:
        return {
            "total_cards": 0,
            "total_unique": 0,
            "total_value_usd": 0,
            "total_value_eur": 0,
            "for_trade_count": 0,
            "rarest_card": None,
            "most_valuable_card": None,
            "by_condition": {},
            "by_rarity": {},
            "by_set": {},
            "by_language": {},
        }

    total_cards = sum(c.quantity for c in cards)
    total_unique = len(cards)
    total_value = sum((c.market_price_usd or 0) * c.quantity for c in cards)
    total_value_eur = sum(
        ((c.market_price_eur or c.price_trend_eur or 0) * c.quantity) for c in cards
    )
    for_trade_count = sum(1 for c in cards if c.for_trade)

    rarity_order = [
        "Amazing Rare", "Secret Rare", "Ultra Rare", "Hyper Rare",
        "Rare Holo VMAX", "Rare Holo VSTAR", "Rare Holo V",
        "Rare Holo", "Rare", "Uncommon", "Common",
    ]

    def rarity_rank(c: Card) -> int:
        try:
            return rarity_order.index(c.rarity or "")
        except ValueError:
            return len(rarity_order)

    rarest = min(cards, key=rarity_rank)
    most_valuable = max(cards, key=lambda c: (c.market_price_usd or 0) * c.quantity)
    top_valuable = sorted(
        cards,
        key=lambda c: (c.market_price_eur or c.price_trend_eur or 0),
        reverse=True,
    )[:5]

    by_condition: dict[str, int] = {}
    by_rarity: dict[str, int] = {}
    by_set: dict[str, dict] = {}
    by_language: dict[str, int] = {}

    for c in cards:
        cond = c.condition or "Unknown"
        by_condition[cond] = by_condition.get(cond, 0) + c.quantity

        rar = c.rarity or "Unknown"
        by_rarity[rar] = by_rarity.get(rar, 0) + c.quantity

        sname = c.set_name or "Unknown"
        if sname not in by_set:
            by_set[sname] = {"count": 0, "value": 0.0}
        by_set[sname]["count"] += c.quantity
        by_set[sname]["value"] += (c.market_price_usd or 0) * c.quantity

        lang = c.language or "EN"
        by_language[lang] = by_language.get(lang, 0) + c.quantity

    return {
        "total_cards": total_cards,
        "total_unique": total_unique,
        "total_value_usd": round(total_value, 2),
        "total_value_eur": round(total_value_eur, 2),
        "for_trade_count": for_trade_count,
        "rarest_card": {
            "id": rarest.id,
            "name": rarest.name,
            "rarity": rarest.rarity,
            "image_url": rarest.image_url,
        },
        "most_valuable_card": {
            "id": most_valuable.id,
            "name": most_valuable.name,
            "market_price_usd": most_valuable.market_price_usd,
            "image_url": most_valuable.image_url,
        },
        "top_valuable": [
            {
                "id": c.id,
                "name": c.name,
                "image_url": c.image_url,
                "value_eur": c.market_price_eur or c.price_trend_eur,
                "value_usd": c.market_price_usd,
            }
            for c in top_valuable
            if (c.market_price_eur or c.price_trend_eur or c.market_price_usd)
        ],
        "by_condition": by_condition,
        "by_rarity": by_rarity,
        "by_set": by_set,
        "by_language": by_language,
    }
