"""
Billing via Stripe Checkout — works fully once keys are set, with a built-in
"demo upgrade" so the subscription flow is testable without a Stripe account yet.

Configure for real billing:
    STRIPE_SECRET_KEY      sk_live_… / sk_test_…
    STRIPE_PRICE_ID        the recurring Price ID for the Pro plan
    STRIPE_WEBHOOK_SECRET  whsec_… (for the /api/billing/webhook endpoint)
    APP_BASE_URL           e.g. https://yourdomain.com (for redirect URLs)

Until then, ``demo_enabled()`` lets a user self-upgrade for testing (toggle with
ALLOW_DEMO_BILLING; turn it OFF in production once Stripe is live).
"""

import os
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from models import User


def _stripe():
    try:
        import stripe
    except ImportError:
        return None
    key = os.getenv("STRIPE_SECRET_KEY", "")
    if not key:
        return None
    stripe.api_key = key
    return stripe


def stripe_enabled() -> bool:
    return _stripe() is not None and bool(os.getenv("STRIPE_PRICE_ID"))


def demo_enabled() -> bool:
    # Defaults ON so the flow is usable immediately; set ALLOW_DEMO_BILLING=false
    # once real Stripe billing is configured.
    return os.getenv("ALLOW_DEMO_BILLING", "true").lower() == "true"


def _base_url() -> str:
    return os.getenv("APP_BASE_URL", "http://localhost:5173").rstrip("/")


# ── Plan mutations ────────────────────────────────────────────────────────────

def set_pro(db: Session, user: User, *, status: str = "active",
            period_end: datetime | None = None,
            customer_id: str | None = None,
            subscription_id: str | None = None) -> None:
    user.plan = "pro"
    user.subscription_status = status
    user.subscription_period_end = period_end or (
        datetime.now(timezone.utc) + timedelta(days=30)
    )
    if customer_id:
        user.stripe_customer_id = customer_id
    if subscription_id:
        user.stripe_subscription_id = subscription_id
    db.commit()


def set_free(db: Session, user: User, *, status: str | None = "canceled") -> None:
    user.plan = "free"
    user.subscription_status = status
    db.commit()


# ── Stripe Checkout ───────────────────────────────────────────────────────────

def create_checkout_session(db: Session, user: User) -> str | None:
    """Create a Stripe Checkout session and return its URL, or None if Stripe
    isn't configured."""
    stripe = _stripe()
    price_id = os.getenv("STRIPE_PRICE_ID", "")
    if not stripe or not price_id:
        return None

    customer_id = user.stripe_customer_id
    if not customer_id:
        customer = stripe.Customer.create(email=user.email, metadata={"user_id": user.id})
        customer_id = customer.id
        user.stripe_customer_id = customer_id
        db.commit()

    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{_base_url()}/account?upgraded=1",
        cancel_url=f"{_base_url()}/pricing?canceled=1",
        metadata={"user_id": user.id},
    )
    return session.url


def handle_webhook(db: Session, payload: bytes, sig_header: str | None) -> dict:
    """Process a Stripe webhook event and sync subscription state."""
    stripe = _stripe()
    if not stripe:
        return {"ignored": True}

    secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    try:
        if secret and sig_header:
            event = stripe.Webhook.construct_event(payload, sig_header, secret)
        else:
            import json
            event = json.loads(payload)
    except Exception:
        return {"error": "invalid payload"}

    etype = event.get("type", "")
    obj = (event.get("data") or {}).get("object", {})
    customer_id = obj.get("customer")
    user = (
        db.query(User).filter(User.stripe_customer_id == customer_id).first()
        if customer_id else None
    )
    if not user:
        return {"ignored": True}

    if etype in ("checkout.session.completed", "customer.subscription.updated",
                 "invoice.paid"):
        set_pro(db, user, status="active", subscription_id=obj.get("subscription"))
    elif etype in ("customer.subscription.deleted", "invoice.payment_failed"):
        set_free(db, user, status="canceled")

    return {"ok": True, "type": etype}
