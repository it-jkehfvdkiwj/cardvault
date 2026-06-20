from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from database import get_db
from models import User
from services import auth_service, billing_service, plan_service

router = APIRouter(prefix="/api/billing", tags=["billing"])


@router.get("/plans")
def get_plans(
    user: User = Depends(auth_service.get_current_user),
    db: Session = Depends(get_db),
):
    return {
        "plans": list(plan_service.PLANS.values()),
        "current_plan": user.plan or "free",
        "stripe_enabled": billing_service.stripe_enabled(),
        "demo_enabled": billing_service.demo_enabled(),
        "usage": plan_service.usage(db, user),
    }


@router.post("/checkout")
def checkout(
    user: User = Depends(auth_service.get_current_user),
    db: Session = Depends(get_db),
):
    """Start a Stripe Checkout session (returns a redirect URL)."""
    url = billing_service.create_checkout_session(db, user)
    if not url:
        raise HTTPException(
            status_code=400,
            detail="Online payment isn't configured yet. Use the test upgrade for now.",
        )
    return {"url": url}


@router.post("/demo-upgrade")
def demo_upgrade(
    user: User = Depends(auth_service.get_current_user),
    db: Session = Depends(get_db),
):
    """Upgrade to Pro without payment — for testing before Stripe is live."""
    if not billing_service.demo_enabled():
        raise HTTPException(status_code=403, detail="Test upgrades are disabled.")
    billing_service.set_pro(db, user, status="active")
    db.refresh(user)
    return plan_service.serialize_user(user, db)


@router.post("/cancel")
def cancel(
    user: User = Depends(auth_service.get_current_user),
    db: Session = Depends(get_db),
):
    """Downgrade to Free (cancels the Stripe subscription if one exists)."""
    stripe = billing_service._stripe()
    if stripe and user.stripe_subscription_id:
        try:
            stripe.Subscription.delete(user.stripe_subscription_id)
        except Exception:
            pass
    billing_service.set_free(db, user, status="canceled")
    db.refresh(user)
    return plan_service.serialize_user(user, db)


@router.post("/webhook")
async def webhook(request: Request, db: Session = Depends(get_db)):
    """Stripe webhook endpoint (no auth — verified via signature)."""
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    return billing_service.handle_webhook(db, payload, sig)
