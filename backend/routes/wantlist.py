from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Card, User, Wantlist
from services import auth_service

router = APIRouter(prefix="/api/wantlist", tags=["wantlist"])


class WantlistAdd(BaseModel):
    tcg_card_id: str
    name: str
    set_name: Optional[str] = None
    set_code: Optional[str] = None
    rarity: Optional[str] = None
    image_url: Optional[str] = None


@router.get("")
def list_wantlist(
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    q = db.query(Wantlist).filter(Wantlist.user_id == user.id)
    if search:
        q = q.filter(Wantlist.name.ilike(f"%{search}%"))
    items = q.order_by(Wantlist.added_at.desc()).all()

    owned_map: dict[str, int] = {
        c.tcg_card_id: c.id
        for c in db.query(Card.tcg_card_id, Card.id).filter(Card.user_id == user.id).all()
        if c.tcg_card_id
    }

    return {
        "items": [
            {
                "id": w.id,
                "tcg_card_id": w.tcg_card_id,
                "name": w.name,
                "set_name": w.set_name,
                "set_code": w.set_code,
                "rarity": w.rarity,
                "image_url": w.image_url,
                "in_collection": w.tcg_card_id in owned_map,
                "owned_card_id": owned_map.get(w.tcg_card_id),
                "added_at": w.added_at.isoformat() if w.added_at else None,
            }
            for w in items
        ]
    }


@router.post("")
def add_to_wantlist(
    payload: WantlistAdd,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    existing = (
        db.query(Wantlist)
        .filter(Wantlist.tcg_card_id == payload.tcg_card_id, Wantlist.user_id == user.id)
        .first()
    )
    if existing:
        return {"id": existing.id, "message": "Already in wantlist"}

    entry = Wantlist(
        user_id=user.id,
        tcg_card_id=payload.tcg_card_id,
        name=payload.name,
        set_name=payload.set_name,
        set_code=payload.set_code,
        rarity=payload.rarity,
        image_url=payload.image_url,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return {"id": entry.id, "message": "Added to wantlist"}


@router.delete("/{item_id}")
def remove_from_wantlist(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    entry = (
        db.query(Wantlist)
        .filter(Wantlist.id == item_id, Wantlist.user_id == user.id)
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(entry)
    db.commit()
    return {"ok": True}
