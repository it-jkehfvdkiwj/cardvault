"""
Authentication: password hashing (bcrypt) + JWT access tokens.

A single ``get_current_user`` dependency protects the API; every data route
filters by the returned user so each account only sees its own collection.
"""

import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from database import get_db
from models import User

JWT_SECRET = os.getenv(
    "JWT_SECRET", "dev-insecure-secret-change-me-0123456789-abcdefghij"
)
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = int(os.getenv("JWT_EXPIRE_DAYS", "30"))

# Emails listed here are auto-promoted to admin on register/login.
ADMIN_EMAILS = {
    e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()
}


def is_admin_email(email: str) -> bool:
    return email.strip().lower() in ADMIN_EMAILS

# tokenUrl is only used by the Swagger "Authorize" UI; login also accepts JSON.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

_CRED_EXC = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid or expired credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


# ── Passwords ─────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    # bcrypt operates on bytes and caps at 72 bytes; encode + truncate safely.
    pw = password.encode("utf-8")[:72]
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(
            password.encode("utf-8")[:72], password_hash.encode("utf-8")
        )
    except Exception:
        return False


# ── Tokens ────────────────────────────────────────────────────────────────────

def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_reset_token(user_id: int) -> str:
    """Short-lived (1 h) token for password resets, scoped so it can't be used
    as a normal access token."""
    expire = datetime.now(timezone.utc) + timedelta(hours=1)
    payload = {"sub": str(user_id), "exp": expire, "scope": "reset"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_reset_token(token: str) -> int | None:
    """Return the user id if the token is a valid reset token, else None."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("scope") != "reset":
            return None
        return int(payload.get("sub"))
    except Exception:
        return None


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload.get("sub"))
    except Exception:
        raise _CRED_EXC

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise _CRED_EXC
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been disabled.",
        )
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency that allows only admin accounts."""
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required.",
        )
    return user
