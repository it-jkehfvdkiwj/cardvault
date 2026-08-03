"""
Selling settings + reusable template photos for eBay listings.

- /api/sale/settings   : how many photos per card (1 = front only, 2 = +back)
- /api/sale/templates  : fixed photos (shipping info, condition guide, logo…)
                         inserted into every listing at a chosen position.
"""

from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import SaleTemplatePhoto, User
from services import auth_service, sale_photo_service

router = APIRouter(prefix="/api/sale", tags=["sale"])


# ── Settings ──────────────────────────────────────────────────────────────────

_MAX_BLOCK = 2000


class SaleSettings(BaseModel):
    photos_per_card: Optional[int] = None
    sale_intro: Optional[str] = None
    sale_outro: Optional[str] = None
    photo_plan: Optional[list[str]] = None


@router.get("/settings")
def get_settings(user: User = Depends(auth_service.get_current_user)):
    from services import ebay_service, photo_plan

    plan = photo_plan.plan_of(user)
    return {
        # Kept in sync with the plan length so older clients still work.
        "photos_per_card": len(plan),
        "photo_plan": plan,
        "suggested_labels": photo_plan.SUGGESTED_LABELS,
        "max_slots": photo_plan.MAX_SLOTS,
        # True = photos go to durable Cloudflare R2 (survive redeploys).
        "durable_storage": sale_photo_service.r2_enabled(),
        "sale_intro": user.sale_intro or "",
        "sale_outro": user.sale_outro or "",
        "placeholders": ebay_service.PLACEHOLDERS,
    }


@router.put("/settings")
def update_settings(
    payload: SaleSettings,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    from services import photo_plan

    # Every field is optional so the upload page can flip one setting without
    # wiping the others.
    if payload.photo_plan is not None:
        try:
            photo_plan.set_plan(user, payload.photo_plan)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    elif payload.photos_per_card is not None:
        # Legacy path: a plain count from an older client. Grow or shrink the
        # existing plan rather than replacing it, so custom labels survive.
        current = photo_plan.plan_of(user)
        want = max(1, min(payload.photos_per_card, photo_plan.MAX_SLOTS))
        while len(current) < want:
            nxt = photo_plan.SUGGESTED_LABELS[len(current)] if len(current) < len(
                photo_plan.SUGGESTED_LABELS) else f"Foto {len(current) + 1}"
            current.append(nxt)
        photo_plan.set_plan(user, current[:want])
    user.sale_photos_per_card = len(photo_plan.plan_of(user))
    for field in ("sale_intro", "sale_outro"):
        value = getattr(payload, field)
        if value is not None:
            if len(value) > _MAX_BLOCK:
                raise HTTPException(
                    status_code=400,
                    detail=f"Der Text ist zu lang (maximal {_MAX_BLOCK} Zeichen).",
                )
            setattr(user, field, value.strip() or None)
    db.commit()
    return {
        "photos_per_card": user.sale_photos_per_card,
        "photo_plan": photo_plan.plan_of(user),
        "sale_intro": user.sale_intro or "",
        "sale_outro": user.sale_outro or "",
    }


# ── Template photos ───────────────────────────────────────────────────────────

def _tpl_dict(t: SaleTemplatePhoto) -> dict:
    return {
        "id": t.id,
        "label": t.label,
        "position": t.position,
        "url": sale_photo_service.public_url(t.path),
    }


@router.get("/templates")
def list_templates(
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    tpls = (
        db.query(SaleTemplatePhoto)
        .filter(SaleTemplatePhoto.user_id == user.id)
        .order_by(SaleTemplatePhoto.position, SaleTemplatePhoto.id)
        .all()
    )
    return {"templates": [_tpl_dict(t) for t in tpls]}


@router.post("/templates")
async def add_template(
    file: UploadFile = File(...),
    label: Optional[str] = Form(None),
    position: int = Form(3),
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    import config
    from routes.cards import _read_limited

    data = await _read_limited(file, config.max_upload_bytes())
    if not data:
        raise HTTPException(status_code=400, detail="Die Datei ist leer.")
    if db.query(SaleTemplatePhoto).filter(SaleTemplatePhoto.user_id == user.id).count() >= 20:
        raise HTTPException(
            status_code=400,
            detail="Maximal 20 Vorlagen-Fotos. Bitte lösche zuerst eines.",
        )
    rel = sale_photo_service.save_bytes(data, file.filename)
    tpl = SaleTemplatePhoto(
        user_id=user.id, path=rel, label=label, position=max(1, position),
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return _tpl_dict(tpl)


@router.put("/templates/{tpl_id}")
def update_template(
    tpl_id: int,
    label: Optional[str] = Form(None),
    position: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    tpl = (
        db.query(SaleTemplatePhoto)
        .filter(SaleTemplatePhoto.id == tpl_id, SaleTemplatePhoto.user_id == user.id)
        .first()
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    if label is not None:
        tpl.label = label
    if position is not None:
        tpl.position = max(1, position)
    db.commit()
    return _tpl_dict(tpl)


@router.delete("/templates/{tpl_id}")
def delete_template(
    tpl_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    tpl = (
        db.query(SaleTemplatePhoto)
        .filter(SaleTemplatePhoto.id == tpl_id, SaleTemplatePhoto.user_id == user.id)
        .first()
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    path = tpl.path
    db.delete(tpl)
    db.commit()
    sale_photo_service.delete(path)
    return {"ok": True}
