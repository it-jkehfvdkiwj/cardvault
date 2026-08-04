import logging
import os
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import config
from database import get_db
from models import User
from services import (
    auth_service, email_service, invite_service, plan_service, verify_service,
)
from services.rate_limit import rate_limit, clear_failures, too_many_failures

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Registration problems are invisible from the outside — the user just sees a
# red toast and nobody can tell whether it was the invite code, a duplicate
# address or the mail server. These lines make the next attempt diagnosable.
_log = logging.getLogger("cardvault.auth")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None
    invite_code: Optional[str] = None


class VerifyIn(BaseModel):
    email: str
    code: str


class ResendIn(BaseModel):
    email: str


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

@router.get("/config")
def auth_config():
    """Public flags the login screen needs before anyone is authenticated.

    Deliberately contains no secrets — only whether registration is currently
    invite-only, so the form can show the code field and the right wording
    instead of letting someone fill in everything and then bounce off a 403.
    """
    return {
        "private_beta": config.private_beta(),
        "email_verification": config.email_verification(),
    }


@router.post(
    "/register",
    # 5 new accounts per IP per hour — plenty for a family, useless for a bot.
    dependencies=[Depends(rate_limit("register", 5, 3600))],
)
def register(
    payload: RegisterIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    email = payload.email.strip().lower()
    if not _EMAIL_RE.match(email) or len(email) > 254:
        raise HTTPException(status_code=400, detail="Bitte gib eine gültige E-Mail-Adresse ein.")

    # Closed testing phase: only invited people get an account. Addresses listed
    # in ADMIN_EMAILS are always let through, so the operator can never lock
    # themselves out by mistyping a code.
    used_code: Optional[str] = None
    if config.private_beta() and not auth_service.is_admin_email(email):
        if not invite_service.is_valid(db, payload.invite_code):
            raise HTTPException(
                status_code=403,
                detail="Dieser Einladungscode ist ungültig, abgelaufen oder schon "
                       "aufgebraucht. Cardeva ist gerade in einer geschlossenen "
                       "Testphase.",
            )
        # Only consumed once we're sure the account will actually be created.
        used_code = payload.invite_code.strip()

    problem = auth_service.password_problem(payload.password)
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=409,
            detail="Für diese E-Mail-Adresse gibt es bereits ein Konto.",
        )

    user = User(
        email=email,
        display_name=(payload.display_name or "").strip() or None,
        password_hash=auth_service.hash_password(payload.password),
        is_admin=auth_service.is_admin_email(email),
        last_login_at=datetime.now(timezone.utc),
        invite_code=invite_service.redeem(db, used_code) if used_code else None,
    )
    verify_on = config.email_verification()
    code = verify_service.issue(user) if verify_on else None
    if not verify_on:
        # Stamped as confirmed right away: if verification is switched back on
        # later, accounts made in the meantime must not be locked out.
        user.email_verified_at = datetime.now(timezone.utc)
    db.add(user)
    db.commit()
    db.refresh(user)

    # Tell the operator someone signed up. Done in the background so a slow or
    # broken mail server can never make a successful registration look failed.
    background.add_task(
        email_service.notify_admins_new_user,
        email=user.email,
        display_name=user.display_name,
        invite_code=user.invite_code,
        total_users=db.query(User).count(),
    )
    if not verify_on:
        _log.info("Registrierung ohne Bestaetigung freigeschaltet: %s", user.email)
        return _token_response(user, db)

    # The confirmation mail is sent inline, not in the background: if it cannot
    # be delivered the user must find out now, while they are still looking at
    # the form, rather than waiting for a code that will never arrive.
    sent = email_service.send_verification_code(user.email, code)
    _log.info("Registrierung: %s, Code verschickt: %s", user.email, sent)
    return {
        "needs_verification": True,
        "email": user.email,
        "mail_sent": sent,
        "resend_in": verify_service.RESEND_COOLDOWN_SECONDS,
    }


@router.post(
    "/login",
    # Per-IP ceiling; the per-account counter below stops proxy rotation.
    dependencies=[Depends(rate_limit("login_ip", 20, 300))],
)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not auth_service.verify_password(payload.password, user.password_hash):
        # Counted per account, so guessing one victim's password is capped at
        # 10 attempts per 15 minutes no matter how many IPs the attacker has.
        if too_many_failures(email):
            raise HTTPException(
                status_code=429,
                detail="Zu viele Fehlversuche. Bitte warte 15 Minuten oder setze dein Passwort zurück.",
            )
        raise HTTPException(status_code=401, detail="E-Mail oder Passwort ist falsch.")
    clear_failures(email)
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Dieses Konto wurde deaktiviert.")
    if config.email_verification():
        if not verify_service.is_verified(user):
            # 403 with a machine-readable marker so the login screen can switch
            # straight to the code field instead of showing a dead end.
            raise HTTPException(
                status_code=403,
                detail="Bitte bestätige zuerst deine E-Mail-Adresse. "
                       "Wir haben dir einen Code geschickt.",
                headers={"X-Needs-Verification": "1"},
            )
    elif not verify_service.is_verified(user):
        # Verification is switched off and this account never confirmed —
        # typically because it was created while verification was on and the
        # code never arrived. Stamp it now: otherwise turning verification back
        # on would silently lock out everyone who joined during the off period,
        # which is a trap that only springs weeks later.
        user.email_verified_at = datetime.now(timezone.utc)
        _log.info("Konto ohne Bestaetigung freigeschaltet (Pflicht ist aus): %s", email)
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


@router.post(
    "/forgot-password",
    # Stops the endpoint being used to spam someone's inbox.
    dependencies=[Depends(rate_limit("forgot", 5, 900))],
)
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


@router.post(
    "/reset-password",
    dependencies=[Depends(rate_limit("reset", 10, 900))],
)
def reset_password(payload: ResetIn, db: Session = Depends(get_db)):
    invalid = HTTPException(
        status_code=400, detail="Dieser Link ist ungültig oder abgelaufen."
    )
    parsed = auth_service.verify_reset_token(payload.token)
    if not parsed:
        raise invalid
    user_id, issued_at = parsed
    problem = auth_service.password_problem(payload.new_password)
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise invalid
    # A link issued before the last password change has already been spent.
    changed = user.password_changed_at
    if changed:
        if changed.tzinfo is None:
            changed = changed.replace(tzinfo=timezone.utc)
        if issued_at < int(changed.timestamp()):
            raise invalid
    user.password_hash = auth_service.hash_password(payload.new_password)
    # Log out every existing session (including whoever may have had the old
    # password) and burn any other outstanding reset link.
    user.password_changed_at = datetime.now(timezone.utc)
    db.commit()
    clear_failures(user.email)
    return {"ok": True}


@router.post(
    "/verify",
    # Six digits is a million combinations; the per-account counter in
    # verify_service caps guesses at five, and this caps the whole endpoint.
    dependencies=[Depends(rate_limit("verify", 20, 900))],
)
def verify(payload: VerifyIn, db: Session = Depends(get_db)):
    """Confirm an address with the emailed code and log the user straight in."""
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # Same wording as a wrong code: this endpoint must not reveal which
        # addresses have an account.
        raise HTTPException(status_code=400, detail="Der Code stimmt nicht.")
    try:
        verify_service.check(user, payload.code)
    except verify_service.VerifyError as exc:
        db.commit()                       # keep the attempt counter
        raise HTTPException(status_code=400, detail=str(exc))
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return _token_response(user, db)


@router.post(
    "/verify/resend",
    dependencies=[Depends(rate_limit("verify_resend", 5, 900))],
)
def resend_verification(payload: ResendIn, db: Session = Depends(get_db)):
    """Send a fresh code.

    Always answers the same way, whether or not the address exists — otherwise
    this is a free membership oracle. The cooldown stops it being used to bomb
    somebody else's inbox.
    """
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    generic = {"ok": True, "resend_in": verify_service.RESEND_COOLDOWN_SECONDS}
    if not user or verify_service.is_verified(user):
        return generic

    wait = verify_service.seconds_until_resend(user)
    if wait:
        raise HTTPException(
            status_code=429,
            detail=f"Bitte warte noch {wait} Sekunden, bevor du einen neuen Code anforderst.",
            headers={"Retry-After": str(wait)},
        )
    code = verify_service.issue(user)
    db.commit()
    email_service.send_verification_code(user.email, code)
    return generic
