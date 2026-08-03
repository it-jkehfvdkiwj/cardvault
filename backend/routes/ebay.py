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


@router.get("/status")
def ebay_status(
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """Report eBay capabilities + the default export options for the UI."""
    return {
        **ebay_api_service.status(db, user.id),
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
    # Aggregate the per-card warnings so the UI can lead with one honest number
    # instead of making the seller read every row.
    issues: dict[str, int] = {}
    for item in items:
        for w in item.get("warnings", []):
            issues[w] = issues.get(w, 0) + 1
    return {
        "count": len(items),
        "listings": items,
        "n_with_warnings": sum(1 for i in items if i.get("warnings")),
        "issues": [
            {"text": text, "count": n}
            for text, n in sorted(issues.items(), key=lambda kv: -kv[1])
        ],
        "total_value": round(sum(i["price"] * i["quantity"] for i in items), 2),
    }


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


# Live listing / account linking now lives in routes/market.py (/api/market/…).
