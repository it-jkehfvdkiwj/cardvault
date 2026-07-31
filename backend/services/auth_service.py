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

import config

# In production ``config.enforce()`` has already aborted start-up if this is
# still the development default, so reading it here is safe.
JWT_SECRET = os.getenv("JWT_SECRET", config.DEV_JWT_SECRET)
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

# The handful of passwords that show up in essentially every credential-stuffing
# list. Blocking them costs a legitimate user nothing and removes the easiest
# way into an account.
_WEAK_PASSWORDS = {
    "password", "passwort", "12345678", "123456789", "1234567890", "qwertz123",
    "qwerty123", "password1", "passwort1", "iloveyou", "sunshine", "princess",
    "football", "baseball", "welcome1", "admin123", "letmein1", "pokemon1",
    "pikachu1", "cardvault", "abcd1234", "test1234", "1q2w3e4r", "asdfghjk",
}


def password_problem(password: str) -> str | None:
    """Return a human-readable reason the password is unacceptable, or None.

    Deliberately light-touch: length does far more for real-world safety than
    forcing symbols, which mostly produces ``Passwort1!``.
    """
    if len(password) < 8:
        return "Das Passwort muss mindestens 8 Zeichen lang sein."
    if len(password) > 128:
        return "Das Passwort darf höchstens 128 Zeichen lang sein."
    if password.lower() in _WEAK_PASSWORDS:
        return "Dieses Passwort ist zu verbreitet. Bitte wähle ein anderes."
    if len(set(password)) < 4:
        return "Das Passwort ist zu einfach (zu wenige verschiedene Zeichen)."
    return None


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
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "exp": now + timedelta(days=JWT_EXPIRE_DAYS),
        "iat": now,
        # Explicit scope so a short-lived password-reset token can never be
        # replayed as a full access token (see verify_reset_token).
        "scope": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_reset_token(user_id: int) -> str:
    """Short-lived (1 h) token for password resets, scoped so it can't be used
    as a normal access token."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "exp": now + timedelta(hours=1),
        "iat": now,
        "scope": "reset",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_reset_token(token: str) -> tuple[int, int] | None:
    """Return ``(user_id, issued_at_unix)`` for a valid reset token, else None.

    The issue time is returned so the caller can reject a link that predates the
    last password change — that makes reset links effectively single-use.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("scope") != "reset":
            return None
        return int(payload.get("sub")), int(payload.get("iat", 0))
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

    # Reject anything that isn't a login token — most importantly the 1-hour
    # password-reset token, which would otherwise be a valid bearer token.
    # Tokens issued before this change carry no scope, so treat missing as
    # "access" to avoid logging everyone out on deploy.
    if payload.get("scope", "access") != "access":
        raise _CRED_EXC

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise _CRED_EXC

    # A password change (or reset) invalidates every token issued before it, so
    # stealing a laptop's saved token doesn't survive the victim's reaction.
    changed_at = getattr(user, "password_changed_at", None)
    issued_at = payload.get("iat")
    if changed_at and issued_at:
        if changed_at.tzinfo is None:
            changed_at = changed_at.replace(tzinfo=timezone.utc)
        # JWT `iat` is whole seconds while password_changed_at has microseconds,
        # so both are compared at second resolution. Strictly-less-than means a
        # token minted in the same second as the change (the fresh one handed
        # back to the device doing the change) survives, while anything older is
        # revoked. Any wider tolerance would keep stolen tokens alive.
        if issued_at < int(changed_at.timestamp()):
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
