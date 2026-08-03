"""
The seller's photo plan, and reading a card's photos in that order.

Background
----------
Cards used to have exactly two photo columns, ``photo_front`` and
``photo_back``. That is fine for a catalogue and useless for selling: a buyer
of a 200 € card wants the corners, the edges and the holo at an angle, and a
seller wants to take those shots in the same order every time without thinking
about it.

A *plan* is simply an ordered list of labels — ``["Vorderseite", "Rückseite",
"Ecken"]``. It drives three things:

* the camera, which announces the next shot instead of guessing,
* how many files the upload page groups into one card,
* the order photos appear in the eBay listing.

Labels are stored *on each photo as well* (see models.CardPhoto). Renaming or
reordering the plan later must not silently relabel photos that were already
taken, which is exactly what would happen if the label were only looked up by
position at display time.
"""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from models import Card, CardPhoto, User

# Chosen to match what a card actually needs to sell, not what is easiest to
# implement. A new user gets front + back and can extend from there.
DEFAULT_PLAN: list[str] = ["Vorderseite", "Rückseite"]

# Suggestions offered in the editor. Not a restriction — labels are free text.
SUGGESTED_LABELS: list[str] = [
    "Vorderseite", "Rückseite", "Ecken", "Kanten",
    "Holo im Winkel", "Oberfläche", "Zentrierung", "Detail",
]

MAX_SLOTS = 8
_MAX_LABEL = 40


def parse_plan(raw: str | None) -> list[str]:
    """Read a stored plan, falling back to the default on anything unexpected."""
    if not raw:
        return list(DEFAULT_PLAN)
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return list(DEFAULT_PLAN)
    if not isinstance(data, list):
        return list(DEFAULT_PLAN)
    labels = [str(x).strip()[:_MAX_LABEL] for x in data if str(x).strip()]
    return labels[:MAX_SLOTS] or list(DEFAULT_PLAN)


def clean_plan(labels: list[str]) -> list[str]:
    """Validate a plan coming from the client. Raises ValueError when unusable."""
    cleaned = [str(x).strip()[:_MAX_LABEL] for x in (labels or []) if str(x).strip()]
    if not cleaned:
        raise ValueError("Der Fotoplan braucht mindestens eine Aufnahme.")
    if len(cleaned) > MAX_SLOTS:
        raise ValueError(f"Höchstens {MAX_SLOTS} Aufnahmen pro Karte.")
    return cleaned


def plan_of(user: User) -> list[str]:
    return parse_plan(user.sale_photo_plan)


def set_plan(user: User, labels: list[str]) -> list[str]:
    cleaned = clean_plan(labels)
    user.sale_photo_plan = json.dumps(cleaned, ensure_ascii=False)
    return cleaned


# ── Reading a card's photos ───────────────────────────────────────────────────

def card_photo_keys(card: Card) -> list[str]:
    """Storage keys of a card's own photos, in plan order.

    Falls back to the legacy front/back columns for cards written before the
    plan existed *and* not yet migrated — belt and braces, since
    run_migrations() copies them across at start-up.
    """
    rows = sorted(card.photos or [], key=lambda p: (p.position or 99, p.id))
    keys = [p.path for p in rows if p.path]
    if keys:
        return keys
    return [k for k in (card.photo_front, card.photo_back) if k]


def set_card_photo(
    db: Session, card: Card, position: int, label: str | None, key: str | None
) -> None:
    """Store (or clear) the photo in one slot, keeping the legacy columns in sync.

    Passing ``key=None`` removes the slot. The caller owns deleting the actual
    file — this only touches the rows.
    """
    existing = next(
        (p for p in (card.photos or []) if (p.position or 1) == position), None
    )
    if key is None:
        if existing:
            db.delete(existing)
    elif existing:
        existing.path = key
        existing.label = label
    else:
        db.add(CardPhoto(card_id=card.id, position=position, label=label, path=key))

    # Keep the old columns truthful so a rollback (or any code path still
    # reading them) sees the first two photos rather than stale ones.
    if position == 1:
        card.photo_front = key
    elif position == 2:
        card.photo_back = key
