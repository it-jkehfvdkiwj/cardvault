"""
Invite codes for the closed testing phase.

Two sources, on purpose:

* **Env (`INVITE_CODES`)** — the bootstrap. Always valid, never runs out, works
  with an empty database. This is what gets you in on a fresh deploy, and what
  saves you if you ever manage to deactivate every code in the admin panel.
* **Database (`invite_codes` table)** — the comfortable path. Codes you create
  in the admin panel can carry a label ("für Max"), a usage limit, and can be
  switched off again. Usage is counted so you can see which code brought whom.

``redeem`` is the only function that mutates anything; ``is_valid`` is a
read-only check used to give a good error message before doing any work.
"""

from __future__ import annotations

import secrets
import string

from sqlalchemy.orm import Session

import config
from models import InviteCode, User

# Ambiguous characters removed: no 0/O, no 1/l/I. Codes get read aloud and typed
# on phones, so "was that a zero or an O?" is a real cost.
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def generate_code(words: int = 3, block: int = 4) -> str:
    """A readable random code like ``K7QM-3XPT-9RWD``."""
    return "-".join(
        "".join(secrets.choice(_ALPHABET) for _ in range(block)) for _ in range(words)
    )


def normalize(code: str | None) -> str:
    return (code or "").strip().lower()


def _db_code(db: Session, code: str) -> InviteCode | None:
    """Look the code up case-insensitively without relying on collation."""
    wanted = normalize(code)
    if not wanted:
        return None
    for row in db.query(InviteCode).all():
        if normalize(row.code) == wanted:
            return row
    return None


def _has_capacity(row: InviteCode) -> bool:
    return row.max_uses is None or (row.uses or 0) < row.max_uses


def is_valid(db: Session, code: str | None) -> bool:
    if not code:
        return False
    if config.invite_code_valid(code):      # env code — always accepted
        return True
    row = _db_code(db, code)
    return bool(row and row.is_active and _has_capacity(row))


def redeem(db: Session, code: str | None) -> str | None:
    """Consume one use of the code. Returns the canonical code, or None if invalid.

    Does not commit — the caller commits together with the new user, so a failed
    registration can never burn a use.
    """
    if not code:
        return None
    row = _db_code(db, code)
    if row:
        if not row.is_active or not _has_capacity(row):
            return None
        row.uses = (row.uses or 0) + 1
        return row.code
    if config.invite_code_valid(code):
        return code.strip()
    return None


def usage_by_code(db: Session) -> dict[str, int]:
    """How many accounts each code produced, keyed by the normalized code.

    Counted from the users table rather than the counter column, so codes that
    came from the env (and therefore have no row) still show up, and so the
    numbers stay right if a code row is deleted.
    """
    counts: dict[str, int] = {}
    for (used,) in db.query(User.invite_code).filter(User.invite_code.isnot(None)):
        key = normalize(used)
        counts[key] = counts.get(key, 0) + 1
    return counts


def serialize(row: InviteCode, used_count: int | None = None) -> dict:
    return {
        "id": row.id,
        "code": row.code,
        "label": row.label,
        "max_uses": row.max_uses,
        "uses": used_count if used_count is not None else (row.uses or 0),
        "is_active": bool(row.is_active),
        "exhausted": not _has_capacity(row),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
