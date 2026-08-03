"""
E-mail confirmation with a 6-digit code.

Why a code and not a link
-------------------------
Most sign-ups happen on a phone. A confirmation link opens in whatever browser
the mail app prefers, which is regularly *not* the browser holding the
half-finished registration — the user then lands on a logged-out page and gives
up. A code can be read on any device and typed where the session already is.

Security notes
--------------
* The code is stored **hashed** (bcrypt, same as passwords). A database dump
  therefore does not contain usable codes.
* Codes expire after :data:`CODE_TTL_MINUTES` and are single-use.
* ``verify_attempts`` counts wrong guesses per account. Six digits is only a
  million combinations, which is brute-forceable in minutes without a limit, so
  the code is destroyed after :data:`MAX_ATTEMPTS` failures and a new one has to
  be requested.
* Resending is throttled by :data:`RESEND_COOLDOWN_SECONDS` so the endpoint
  can't be used to spam somebody else's inbox.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta

import bcrypt

from models import User

CODE_LENGTH = 6
CODE_TTL_MINUTES = 30
MAX_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 60


def generate_code() -> str:
    """A uniformly random 6-digit code, leading zeros included."""
    return f"{secrets.randbelow(10 ** CODE_LENGTH):0{CODE_LENGTH}d}"


def _hash(code: str) -> str:
    return bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode()


def _matches(code: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(code.encode(), hashed.encode())
    except (ValueError, TypeError):
        return False


def issue(user: User) -> str:
    """Attach a fresh code to the user and return the plaintext to send."""
    code = generate_code()
    user.verify_code_hash = _hash(code)
    user.verify_sent_at = datetime.utcnow()
    user.verify_attempts = 0
    return code


def is_verified(user: User) -> bool:
    return user.email_verified_at is not None


def seconds_until_resend(user: User) -> int:
    """0 when a new code may be sent, else how long the user still has to wait."""
    if not user.verify_sent_at:
        return 0
    elapsed = (datetime.utcnow() - user.verify_sent_at).total_seconds()
    return max(0, int(RESEND_COOLDOWN_SECONDS - elapsed))


class VerifyError(Exception):
    """Carries a message meant for the user."""


def check(user: User, code: str) -> None:
    """Validate a submitted code, marking the account verified on success.

    Raises :class:`VerifyError` with a German message on any failure. The caller
    must commit — this only mutates the user object, so a failed attempt and its
    counter are persisted in the same transaction as everything else.
    """
    if is_verified(user):
        return
    if not user.verify_code_hash or not user.verify_sent_at:
        raise VerifyError("Es liegt kein Code vor. Fordere bitte einen neuen an.")

    age = datetime.utcnow() - user.verify_sent_at
    if age > timedelta(minutes=CODE_TTL_MINUTES):
        user.verify_code_hash = None
        raise VerifyError("Der Code ist abgelaufen. Fordere bitte einen neuen an.")

    if (user.verify_attempts or 0) >= MAX_ATTEMPTS:
        user.verify_code_hash = None
        raise VerifyError(
            "Zu viele Fehlversuche. Der Code wurde gesperrt — fordere einen neuen an."
        )

    if not _matches((code or "").strip(), user.verify_code_hash):
        user.verify_attempts = (user.verify_attempts or 0) + 1
        left = MAX_ATTEMPTS - user.verify_attempts
        if left <= 0:
            user.verify_code_hash = None
            raise VerifyError(
                "Zu viele Fehlversuche. Der Code wurde gesperrt — fordere einen neuen an."
            )
        raise VerifyError(f"Der Code stimmt nicht. Noch {left} Versuch(e).")

    user.email_verified_at = datetime.utcnow()
    user.verify_code_hash = None
    user.verify_attempts = 0
