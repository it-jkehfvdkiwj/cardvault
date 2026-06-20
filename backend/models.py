from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text,
)
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    display_name = Column(String)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    # Roles / status
    is_admin = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # Subscription / billing
    plan = Column(String, default="free", nullable=False)       # "free" | "pro"
    subscription_status = Column(String)                         # active|canceled|past_due
    subscription_period_end = Column(DateTime)
    stripe_customer_id = Column(String, index=True)
    stripe_subscription_id = Column(String, index=True)
    last_login_at = Column(DateTime)

    # Public shareable collection page
    is_public = Column(Boolean, default=False, nullable=False)
    public_slug = Column(String, unique=True, index=True)


class Card(Base):
    __tablename__ = "cards"

    id = Column(Integer, primary_key=True, index=True)
    # Owner. Nullable so pre-auth rows stay orphaned (hidden) after the upgrade.
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    tcg_card_id = Column(String, index=True)
    name = Column(String, nullable=False)
    set_name = Column(String)
    set_code = Column(String)
    rarity = Column(String)
    card_type = Column(String)
    hp = Column(String)
    image_url = Column(String)
    local_image_path = Column(String)
    condition = Column(String, default="Near Mint")
    quantity = Column(Integer, default=1)
    notes = Column(Text)
    is_foil = Column(Boolean, default=False)
    for_trade = Column(Boolean, default=False)
    # Language the physical card is printed in (ISO 639-1 / custom codes)
    # EN=English  DE=German  FR=French  IT=Italian  ES=Spanish  JA=Japanese
    language = Column(String, default="EN")
    # TCGPlayer prices (USD)
    market_price_usd = Column(Float)
    price_low_usd = Column(Float)
    price_mid_usd = Column(Float)
    price_high_usd = Column(Float)
    # Cardmarket prices (EUR)
    cm_product_id = Column(Integer)
    market_price_eur = Column(Float)
    price_low_eur = Column(Float)
    price_trend_eur = Column(Float)
    price_updated_at = Column(DateTime)
    added_at = Column(DateTime, server_default=func.now())


class Wantlist(Base):
    __tablename__ = "wantlist"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    tcg_card_id = Column(String, index=True)
    name = Column(String, nullable=False)
    set_name = Column(String)
    set_code = Column(String)
    rarity = Column(String)
    image_url = Column(String)
    added_at = Column(DateTime, server_default=func.now())


class ApiCache(Base):
    __tablename__ = "api_cache"

    id = Column(Integer, primary_key=True, index=True)
    cache_key = Column(String, unique=True, index=True)
    response_json = Column(Text)
    cached_at = Column(DateTime, server_default=func.now())


class CardHashIndex(Base):
    """Perceptual-hash index for fast visual card matching."""
    __tablename__ = "card_hash_index"

    id = Column(Integer, primary_key=True, index=True)
    tcg_card_id = Column(String, unique=True, index=True)
    name = Column(String, nullable=False)
    set_name = Column(String)
    rarity = Column(String)
    image_url = Column(String)
    phash = Column(String, nullable=False)
    indexed_at = Column(DateTime, server_default=func.now())
