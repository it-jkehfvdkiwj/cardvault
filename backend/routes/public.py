from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Card, User

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/{slug}")
def public_collection(
    slug: str,
    for_trade: bool = Query(False, description="Only cards marked for trade/sale"),
    db: Session = Depends(get_db),
):
    """Read-only public view of a user's collection (no authentication)."""
    owner = (
        db.query(User)
        .filter(User.public_slug == slug, User.is_public.is_(True))
        .first()
    )
    if not owner:
        raise HTTPException(status_code=404, detail="Collection not found or private")

    q = db.query(Card).filter(Card.user_id == owner.id)
    if for_trade:
        q = q.filter(Card.for_trade.is_(True))
    cards = q.order_by(Card.set_name, Card.name).all()

    total_value_eur = sum(
        (c.market_price_eur or c.price_trend_eur or 0) * (c.quantity or 1) for c in cards
    )

    return {
        "owner_name": owner.display_name or owner.email.split("@")[0],
        "card_count": sum(c.quantity or 1 for c in cards),
        "unique_count": len(cards),
        "for_trade_count": sum(1 for c in cards if c.for_trade),
        "total_value_eur": round(total_value_eur, 2),
        "cards": [
            {
                "id": c.id,
                "name": c.name,
                "set_name": c.set_name,
                "rarity": c.rarity,
                "image_url": c.image_url,
                "condition": c.condition,
                "quantity": c.quantity,
                "is_foil": c.is_foil,
                "for_trade": c.for_trade,
                "language": c.language or "EN",
                "price_eur": c.market_price_eur or c.price_trend_eur,
                "price_usd": c.market_price_usd,
            }
            for c in cards
        ],
    }
