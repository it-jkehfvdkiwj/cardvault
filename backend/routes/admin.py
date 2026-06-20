from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import Card, User, Wantlist
from services import auth_service, plan_service

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

    return {
        "total_users": total_users,
        "active_users": active_users,
        "admins": admins,
        "pro_users": pro_users,
        "free_users": free_users,
        "total_cards": total_cards,
        "new_users_7d": new_week,
        "new_users_30d": new_month,
        "estimated_mrr_eur": round(pro_users * pro_price, 2),
    }


@router.get("/users")
def list_users(
    search: Optional[str] = None,
    admin: User = Depends(auth_service.require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(User)
    if search:
        like = f"%{search}%"
        q = q.filter((User.email.ilike(like)) | (User.display_name.ilike(like)))
    users = q.order_by(User.created_at.desc()).all()

    # Card counts per user in one query.
    counts = dict(
        db.query(Card.user_id, func.count(Card.id)).group_by(Card.user_id).all()
    )
    return {
        "users": [
            {**plan_service.serialize_user(u, db), "card_count": counts.get(u.id, 0)}
            for u in users
        ]
    }


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
    db.query(Card).filter(Card.user_id == user_id).delete()
    db.query(Wantlist).filter(Wantlist.user_id == user_id).delete()
    db.delete(target)
    db.commit()
    return {"ok": True}
