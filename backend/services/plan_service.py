"""
Subscription plans, limits and feature gates.

Two tiers:
  free  – generous enough to try the product, with a card cap and no bulk tools.
  pro   – unlimited collection + eBay export + bulk price refresh.

Limits live here so the API, the UI (via /api/billing/plans) and enforcement all
read the same source of truth.
"""

from sqlalchemy.orm import Session

from models import Card, User

PLANS: dict[str, dict] = {
    "free": {
        "id": "free",
        "name": "Free",
        "price_eur": 0,
        "card_limit": 50,
        "features": {
            "ebay_export": False,
            "bulk_price_refresh": False,
            "csv_pdf_export": False,
        },
        "highlights": [
            "Up to 50 cards",
            "Scan & auto-identify (all languages)",
            "Live Cardmarket prices",
        ],
    },
    "pro": {
        "id": "pro",
        "name": "Pro",
        "price_eur": 4.99,
        "card_limit": None,  # unlimited
        "features": {
            "ebay_export": True,
            "bulk_price_refresh": True,
            "csv_pdf_export": True,
        },
        "highlights": [
            "Unlimited cards",
            "eBay bulk-listing export",
            "CSV / PDF / JSON export",
            "Priority support",
        ],
    },
}

DEFAULT_PLAN = "free"


def plan_of(user: User) -> dict:
    return PLANS.get(user.plan or DEFAULT_PLAN, PLANS[DEFAULT_PLAN])


def card_limit(user: User) -> int | None:
    return plan_of(user)["card_limit"]


def card_count(db: Session, user_id: int) -> int:
    return db.query(Card).filter(Card.user_id == user_id).count()


def can_add_card(db: Session, user: User) -> bool:
    limit = card_limit(user)
    if limit is None:
        return True
    return card_count(db, user.id) < limit


def has_feature(user: User, feature: str) -> bool:
    return bool(plan_of(user)["features"].get(feature, False))


def usage(db: Session, user: User) -> dict:
    limit = card_limit(user)
    used = card_count(db, user.id)
    return {
        "cards_used": used,
        "card_limit": limit,
        "cards_remaining": None if limit is None else max(0, limit - used),
    }


def serialize_user(user: User, db: Session) -> dict:
    plan = plan_of(user)
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name or user.email.split("@")[0],
        "is_admin": bool(user.is_admin),
        "is_active": bool(user.is_active),
        "plan": user.plan or DEFAULT_PLAN,
        "plan_name": plan["name"],
        "features": plan["features"],
        "usage": usage(db, user),
        "subscription_status": user.subscription_status,
        "subscription_period_end": (
            user.subscription_period_end.isoformat()
            if user.subscription_period_end else None
        ),
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "is_public": bool(user.is_public),
        "public_slug": user.public_slug,
    }
