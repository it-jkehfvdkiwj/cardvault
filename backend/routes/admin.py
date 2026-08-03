from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

import config
from database import get_db
from models import (
    Card, CollectionSnapshot, InviteCode, MarketplaceConnection,
    MarketplaceListing, SaleTemplatePhoto, User, Wantlist,
)
from services import auth_service, invite_service, plan_service

router = APIRouter(prefix="/api/admin", tags=["admin"])


class UserUpdate(BaseModel):
    plan: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None


@router.get("/stats")
def admin_stats(
    admin: User = Depends(auth_service.require_admin),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active.is_(True)).count()
    admins = db.query(User).filter(User.is_admin.is_(True)).count()
    pro_users = db.query(User).filter(User.plan == "pro").count()
    free_users = total_users - pro_users
    total_cards = db.query(Card).count()

    new_week = db.query(User).filter(User.created_at >= week_ago).count()
    new_month = db.query(User).filter(User.created_at >= month_ago).count()

    pro_price = plan_service.PLANS["pro"]["price_eur"]

    # "Active" in the sense that matters during a test: people who actually came
    # back, not just people whose account isn't disabled.
    logged_in_7d = db.query(User).filter(User.last_login_at >= week_ago).count()
    never_logged_in = db.query(User).filter(User.last_login_at.is_(None)).count()
    cards_7d = db.query(Card).filter(Card.added_at >= week_ago).count()

    return {
        "total_users": total_users,
        "active_users": active_users,
        "admins": admins,
        "pro_users": pro_users,
        "free_users": free_users,
        "total_cards": total_cards,
        "new_users_7d": new_week,
        "new_users_30d": new_month,
        "logged_in_7d": logged_in_7d,
        "never_logged_in": never_logged_in,
        "cards_added_7d": cards_7d,
        "estimated_mrr_eur": round(pro_users * pro_price, 2),
        # The panel needs these to avoid showing a meaningless MRR while nobody
        # can pay, and to surface which mode the deployment is in.
        "free_launch": plan_service.free_launch(),
        "private_beta": config.private_beta(),
    }


# Sortable columns, mapped so the client can't pass arbitrary SQL.
_SORTABLE = {
    "created_at": User.created_at,
    "last_login_at": User.last_login_at,
    "email": User.email,
}


@router.get("/users")
def list_users(
    search: Optional[str] = None,
    sort: str = "created_at",
    order: str = "desc",
    admin: User = Depends(auth_service.require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(User)
    if search:
        like = f"%{search}%"
        q = q.filter(
            (User.email.ilike(like))
            | (User.display_name.ilike(like))
            | (User.invite_code.ilike(like))
        )

    # Card counts per user in one query.
    counts = dict(
        db.query(Card.user_id, func.count(Card.id)).group_by(Card.user_id).all()
    )

    if sort == "cards":
        # Not a column — sort in Python after the counts are known.
        users = q.all()
        users.sort(key=lambda u: counts.get(u.id, 0), reverse=(order != "asc"))
    else:
        column = _SORTABLE.get(sort, User.created_at)
        # NULLs (never logged in) belong at the end either way, and SQLite and
        # Postgres disagree about where they land by default — hence the
        # explicit is-null key first.
        users = q.order_by(
            column.is_(None),
            column.asc() if order == "asc" else column.desc(),
        ).all()

    return {
        "users": [
            {**plan_service.serialize_user(u, db),
             "card_count": counts.get(u.id, 0),
             "invite_code": u.invite_code}
            for u in users
        ]
    }


@router.get("/users/{user_id}")
def user_detail(
    user_id: int,
    admin: User = Depends(auth_service.require_admin),
    db: Session = Depends(get_db),
):
    """Everything about one account, for the expandable row in the admin panel."""
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    cards = db.query(Card).filter(Card.user_id == user_id).all()
    total_value = sum(
        (c.market_price_eur or c.price_trend_eur or 0) * (c.quantity or 1) for c in cards
    )
    newest = sorted(
        (c for c in cards if c.added_at), key=lambda c: c.added_at, reverse=True
    )[:5]

    return {
        **plan_service.serialize_user(target, db),
        "invite_code": target.invite_code,
        "stats": {
            "cards_total": sum(c.quantity or 1 for c in cards),
            "cards_unique": len(cards),
            "collection_value_eur": round(total_value, 2),
            "for_trade": sum(1 for c in cards if c.for_trade),
            "wantlist": db.query(Wantlist).filter(Wantlist.user_id == user_id).count(),
            "last_card_added": (
                newest[0].added_at.isoformat() if newest else None
            ),
        },
        "recent_cards": [
            {
                "id": c.id,
                "name": c.name,
                "set_name": c.set_name,
                "image_url": c.image_url,
                "added_at": c.added_at.isoformat() if c.added_at else None,
            }
            for c in newest
        ],
    }


@router.post("/users/{user_id}/reset-password")
def send_reset_link(
    user_id: int,
    admin: User = Depends(auth_service.require_admin),
    db: Session = Depends(get_db),
):
    """Send the user a password-reset link — the safe way to help someone who is
    locked out, since it never reveals or sets a password for them.

    If SMTP isn't configured the link is returned here so you can pass it on
    yourself; that's fine during a closed test among people you know.
    """
    import os

    from services import email_service

    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    token = auth_service.create_reset_token(target.id)
    base = os.getenv("APP_BASE_URL", "http://localhost:5173").rstrip("/")
    link = f"{base}/reset-password?token={token}"
    sent = email_service.send_password_reset(target.email, link)
    return {"ok": True, "sent": sent, "link": None if sent else link}


@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    payload: UserUpdate,
    admin: User = Depends(auth_service.require_admin),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.plan is not None:
        if payload.plan not in plan_service.PLANS:
            raise HTTPException(status_code=400, detail="Unknown plan")
        target.plan = payload.plan
        if payload.plan == "pro" and target.subscription_status is None:
            target.subscription_status = "active"
        if payload.plan == "free":
            target.subscription_status = None
    if payload.is_admin is not None:
        target.is_admin = payload.is_admin
    if payload.is_active is not None:
        # Don't let an admin lock themselves out.
        if target.id == admin.id and not payload.is_active:
            raise HTTPException(status_code=400, detail="You can't deactivate yourself")
        target.is_active = payload.is_active

    db.commit()
    db.refresh(target)
    return plan_service.serialize_user(target, db)


# ── Einladungscodes ───────────────────────────────────────────────────────────

class InviteCreate(BaseModel):
    code: Optional[str] = None        # leer = automatisch generieren
    label: Optional[str] = None
    max_uses: Optional[int] = None    # None = unbegrenzt


class InviteUpdate(BaseModel):
    is_active: Optional[bool] = None
    label: Optional[str] = None
    max_uses: Optional[int] = None


@router.get("/invites")
def list_invites(
    admin: User = Depends(auth_service.require_admin),
    db: Session = Depends(get_db),
):
    used = invite_service.usage_by_code(db)
    rows = db.query(InviteCode).order_by(InviteCode.created_at.desc()).all()
    codes = [
        invite_service.serialize(r, used.get(invite_service.normalize(r.code), 0))
        for r in rows
    ]
    # Env codes have no row but still work — show them so the panel reflects
    # reality instead of implying they don't exist.
    known = {invite_service.normalize(r.code) for r in rows}
    env_codes = [
        {
            "id": None,
            "code": c,
            "label": "aus INVITE_CODES (Env)",
            "max_uses": None,
            "uses": used.get(invite_service.normalize(c), 0),
            "is_active": True,
            "exhausted": False,
            "from_env": True,
            "created_at": None,
        }
        for c in sorted(config.invite_codes())
        if invite_service.normalize(c) not in known
    ]
    return {
        "invites": codes + env_codes,
        "private_beta": config.private_beta(),
    }


@router.post("/invites")
def create_invite(
    payload: InviteCreate,
    admin: User = Depends(auth_service.require_admin),
    db: Session = Depends(get_db),
):
    code = (payload.code or "").strip() or invite_service.generate_code()
    if invite_service.is_valid(db, code) or db.query(InviteCode).filter(
        InviteCode.code == code
    ).first():
        raise HTTPException(status_code=409, detail="Diesen Code gibt es schon.")
    if payload.max_uses is not None and payload.max_uses < 1:
        raise HTTPException(status_code=400, detail="Die Nutzungsgrenze muss mindestens 1 sein.")

    row = InviteCode(
        code=code,
        label=(payload.label or "").strip() or None,
        max_uses=payload.max_uses,
        created_by=admin.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return invite_service.serialize(row, 0)


@router.patch("/invites/{invite_id}")
def update_invite(
    invite_id: int,
    payload: InviteUpdate,
    admin: User = Depends(auth_service.require_admin),
    db: Session = Depends(get_db),
):
    row = db.query(InviteCode).filter(InviteCode.id == invite_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Code nicht gefunden")
    if payload.is_active is not None:
        row.is_active = payload.is_active
    if payload.label is not None:
        row.label = payload.label.strip() or None
    if payload.max_uses is not None:
        row.max_uses = payload.max_uses or None
    db.commit()
    db.refresh(row)
    used = invite_service.usage_by_code(db)
    return invite_service.serialize(row, used.get(invite_service.normalize(row.code), 0))


@router.delete("/invites/{invite_id}")
def delete_invite(
    invite_id: int,
    admin: User = Depends(auth_service.require_admin),
    db: Session = Depends(get_db),
):
    row = db.query(InviteCode).filter(InviteCode.id == invite_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Code nicht gefunden")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    admin: User = Depends(auth_service.require_admin),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You can't delete your own account here")
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Same full erasure as the self-service account deletion, so an admin delete
    # doesn't leave orphaned rows and stored photos behind.
    from services import photo_plan, sale_photo_service

    for card in db.query(Card).filter(Card.user_id == user_id).all():
        # Every photo of the card — see the same loop in routes/account.py.
        for key in photo_plan.card_photo_keys(card):
            sale_photo_service.delete(key)
    for tpl in db.query(SaleTemplatePhoto).filter(SaleTemplatePhoto.user_id == user_id).all():
        sale_photo_service.delete(tpl.path)

    for model in (
        MarketplaceListing, MarketplaceConnection, SaleTemplatePhoto,
        CollectionSnapshot, Card, Wantlist,
    ):
        db.query(model).filter(model.user_id == user_id).delete(synchronize_session=False)

    db.delete(target)
    db.commit()
    return {"ok": True}
