from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Card, CollectionSnapshot, User
from services import auth_service, tcg_api_service

router = APIRouter(prefix="/api/stats", tags=["stats"])


def _upsert_snapshot(
    db: Session, user_id: int,
    total_cards: int, total_unique: int,
    total_value_eur: float, total_value_usd: float,
) -> None:
    """Record (or update) today's collection snapshot. Called from get_stats,
    so the value history builds itself whenever the user opens the app."""
    day = datetime.utcnow().strftime("%Y-%m-%d")
    snap = (
        db.query(CollectionSnapshot)
        .filter(CollectionSnapshot.user_id == user_id, CollectionSnapshot.day == day)
        .first()
    )
    if snap is None:
        snap = CollectionSnapshot(user_id=user_id, day=day)
        db.add(snap)
    snap.total_cards = total_cards
    snap.total_unique = total_unique
    snap.total_value_eur = round(total_value_eur, 2)
    snap.total_value_usd = round(total_value_usd, 2)
    try:
        db.commit()
    except Exception:
        db.rollback()


@router.get("/history")
def get_value_history(
    days: int = Query(90, ge=7, le=730),
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """Daily collection-value snapshots for the portfolio chart."""
    since = (datetime.utcnow() - timedelta(days=days)).strftime("%Y-%m-%d")
    rows = (
        db.query(CollectionSnapshot)
        .filter(CollectionSnapshot.user_id == user.id, CollectionSnapshot.day >= since)
        .order_by(CollectionSnapshot.day.asc())
        .all()
    )
    return {
        "history": [
            {
                "day": r.day,
                "total_cards": r.total_cards,
                "total_value_eur": r.total_value_eur,
                "total_value_usd": r.total_value_usd,
            }
            for r in rows
        ]
    }


@router.get("/sets-progress")
async def get_sets_progress(
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """Set-completion progress: owned unique cards vs. the set's printed total.

    Owned cards are grouped by the TCG set id embedded in ``tcg_card_id``
    (e.g. "sv4pt5-18" → set "sv4pt5") — robust against renamed/localized set
    names. Cardmarket-only cards (id "cm-…") can't be attributed and are
    skipped.
    """
    rows = (
        db.query(Card.tcg_card_id)
        .filter(Card.user_id == user.id, Card.tcg_card_id.isnot(None))
        .distinct()
        .all()
    )
    owned_by_set: dict[str, int] = {}
    for (tcg_id,) in rows:
        if not tcg_id or tcg_id.startswith("cm-") or "-" not in tcg_id:
            continue
        set_id = tcg_id.rsplit("-", 1)[0]
        owned_by_set[set_id] = owned_by_set.get(set_id, 0) + 1

    if not owned_by_set:
        return {"sets": []}

    try:
        all_sets = await tcg_api_service.list_sets_full(db)
    except Exception:
        return {"sets": []}

    out = []
    for s in all_sets:
        sid = s.get("id")
        if sid not in owned_by_set:
            continue
        total = s.get("printedTotal") or s.get("total") or 0
        owned = owned_by_set[sid]
        images = s.get("images") or {}
        out.append({
            "set_id": sid,
            "name": s.get("name"),
            "series": s.get("series"),
            "symbol": images.get("symbol"),
            "logo": images.get("logo"),
            "owned": owned,
            "total": total,
            "percent": round(min(owned / total, 1.0) * 100, 1) if total else None,
        })
    out.sort(key=lambda x: (-(x["percent"] or 0), x["name"] or ""))
    return {"sets": out}


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

    # Side effect: record today's snapshot for the value-history chart.
    _upsert_snapshot(db, user.id, total_cards, total_unique, total_value_eur, total_value)

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
