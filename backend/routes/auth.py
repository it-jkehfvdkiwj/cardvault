import os
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import User
from services import auth_service, email_service, plan_service

router = APIRouter(prefix="/api/auth", tags=["auth"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None


class LoginIn(BaseModel):
    email: str
    password: str


class ForgotIn(BaseModel):
    email: str


class ResetIn(BaseModel):
    token: str
    new_password: str


def _token_response(user: User, db: Session) -> dict:
    return {
        "access_token": auth_service.create_access_token(user.id),
        "token_type": "bearer",
        "user": plan_service.serialize_user(user, db),
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/register")
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Please enter a valid email address")
    if len(payload.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    user = User(
        email=email,
        display_name=(payload.display_name or "").strip() or None,
        password_hash=auth_service.hash_password(payload.password),
        is_admin=auth_service.is_admin_email(email),
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _token_response(user, db)


@router.post("/login")
def login(payload: LoginIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not auth_service.verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Wrong email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been disabled.")
    # Auto-promote configured admin emails and stamp the login time.
    if auth_service.is_admin_email(email) and not user.is_admin:
        user.is_admin = True
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return _token_response(user, db)


@router.get("/me")
def me(
    user: User = Depends(auth_service.get_current_user),
    db: Session = Depends(get_db),
):
    return plan_service.serialize_user(user, db)


@router.post("/forgot-password")
def forgot_password(payload: ForgotIn, db: Session = Depends(get_db)):
    """Send a password-reset link. Always returns ok (never reveals whether an
    account exists)."""
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if user:
        token = auth_service.create_reset_token(user.id)
        base = os.getenv("APP_BASE_URL", "http://localhost:5173").rstrip("/")
        email_service.send_password_reset(user.email, f"{base}/reset-password?token={token}")
    return {"ok": True}


@router.post("/reset-password")
def reset_password(payload: ResetIn, db: Session = Depends(get_db)):
    user_id = auth_service.verify_reset_token(payload.token)
    if not user_id:
        raise HTTPException(status_code=400, detail="This reset link is invalid or expired")
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="This reset link is invalid or expired")
    user.password_hash = auth_service.hash_password(payload.new_password)
    db.commit()
    return {"ok": True}
