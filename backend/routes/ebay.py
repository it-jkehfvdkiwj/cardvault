from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Card, User
from services import auth_service, ebay_api_service, ebay_service, plan_service

router = APIRouter(prefix="/api/ebay", tags=["ebay"])


def _require_pro(user: User) -> None:
    if not plan_service.has_feature(user, "ebay_export"):
        raise HTTPException(
            status_code=402,
            detail="eBay export is a Pro feature. Upgrade to unlock bulk listing.",
        )


class ExportRequest(BaseModel):
    card_ids: Optional[list[int]] = None
    for_trade_only: bool = False
    options: Optional[dict] = None


class ListRequest(BaseModel):
    card_id: int
    options: Optional[dict] = None


@router.get("/status")
def ebay_status(user: User = Depends(auth_service.get_current_user)):
    """Report eBay capabilities + the default export options for the UI."""
    return {
        **ebay_api_service.status(),
        "default_options": ebay_service.default_options(),
        "sites": list(ebay_service.SITES.keys()),
    }


@router.post("/preview")
def ebay_preview(
    payload: ExportRequest,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """Preview titles + computed prices before downloading the CSV."""
    items = ebay_service.preview_listings(
        db,
        user_id=user.id,
        card_ids=payload.card_ids,
        for_trade_only=payload.for_trade_only,
        options=payload.options,
    )
    return {"count": len(items), "listings": items}


@router.post("/export/csv")
def ebay_export_csv(
    payload: ExportRequest,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """Build and return an eBay File Exchange CSV for the selected cards."""
    _require_pro(user)
    data = ebay_service.build_listing_csv(
        db,
        user_id=user.id,
        card_ids=payload.card_ids,
        for_trade_only=payload.for_trade_only,
        options=payload.options,
    )
    return Response(
        content=data,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=ebay_listings.csv"},
    )


@router.post("/list")
def ebay_list(
    payload: ListRequest,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """Create a single live eBay listing (scaffold — see ebay_api_service)."""
    card = (
        db.query(Card)
        .filter(Card.id == payload.card_id, Card.user_id == user.id)
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    result = ebay_api_service.create_listing(card, payload.options)
    if not result.get("ok"):
        # 501 for not-implemented, 400 for not-configured.
        code = 501 if result.get("status") == "not_implemented" else 400
        raise HTTPException(status_code=code, detail=result.get("detail"))
    return result
