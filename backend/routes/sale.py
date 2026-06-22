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

class SaleSettings(BaseModel):
    photos_per_card: int = 1


@router.get("/settings")
def get_settings(user: User = Depends(auth_service.get_current_user)):
    return {
        "photos_per_card": user.sale_photos_per_card or 1,
        # True = photos go to durable Cloudflare R2 (survive redeploys).
        "durable_storage": sale_photo_service.r2_enabled(),
    }


@router.put("/settings")
def update_settings(
    payload: SaleSettings,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    user.sale_photos_per_card = 2 if payload.photos_per_card >= 2 else 1
    db.commit()
    return {"photos_per_card": user.sale_photos_per_card}


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
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
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
