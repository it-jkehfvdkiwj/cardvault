import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Card, User, Wantlist
from services import auth_service, plan_service

router = APIRouter(prefix="/api/account", tags=["account"])


class SharingUpdate(BaseModel):
    enabled: bool


class ProfileUpdate(BaseModel):
    display_name: Optional[str] = None


class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str


class AccountDelete(BaseModel):
    password: str


@router.get("")
def get_account(
    user: User = Depends(auth_service.get_current_user),
    db: Session = Depends(get_db),
):
    return plan_service.serialize_user(user, db)


@router.put("/profile")
def update_profile(
    payload: ProfileUpdate,
    user: User = Depends(auth_service.get_current_user),
    db: Session = Depends(get_db),
):
    if payload.display_name is not None:
        user.display_name = payload.display_name.strip() or None
    db.commit()
    db.refresh(user)
    return plan_service.serialize_user(user, db)


@router.put("/password")
def change_password(
    payload: PasswordUpdate,
    user: User = Depends(auth_service.get_current_user),
    db: Session = Depends(get_db),
):
    if not auth_service.verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    user.password_hash = auth_service.hash_password(payload.new_password)
    db.commit()
    return {"ok": True}


@router.put("/sharing")
def update_sharing(
    payload: SharingUpdate,
    user: User = Depends(auth_service.get_current_user),
    db: Session = Depends(get_db),
):
    """Enable/disable the public shareable collection page."""
    user.is_public = payload.enabled
    if payload.enabled and not user.public_slug:
        # Generate a unique, hard-to-guess slug.
        while True:
            slug = secrets.token_urlsafe(8).replace("_", "").replace("-", "")[:10].lower()
            if not db.query(User).filter(User.public_slug == slug).first():
                break
        user.public_slug = slug
    db.commit()
    db.refresh(user)
    return plan_service.serialize_user(user, db)


@router.delete("")
def delete_account(
    payload: AccountDelete,
    user: User = Depends(auth_service.get_current_user),
    db: Session = Depends(get_db),
):
    if not auth_service.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Password is incorrect")
    # Remove the user's data, then the account.
    db.query(Card).filter(Card.user_id == user.id).delete()
    db.query(Wantlist).filter(Wantlist.user_id == user.id).delete()
    db.delete(user)
    db.commit()
    return {"ok": True}
