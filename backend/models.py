from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    display_name = Column(String)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    # Set whenever the password changes; every access token issued before this
    # moment is rejected, so a reset or a change logs out all other devices.
    password_changed_at = Column(DateTime)

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

    # eBay selling: how many photos per card the seller takes (1 = front only,
    # 2 = front + back / "2er-Pack" capture mode).
    sale_photos_per_card = Column(Integer, default=1, nullable=False)

    # Free text placed above / below the generated listing description. Supports
    # the placeholders documented in services/ebay_service.PLACEHOLDERS, so one
    # saved block ("Versand als Großbrief, {name} kommt in einer Toploader-Hülle")
    # adapts itself to every card. Plain text; newlines become paragraphs.
    sale_intro = Column(Text)
    sale_outro = Column(Text)

    # The seller's photo plan: a JSON array of labels, one per shot, in order.
    # ["Vorderseite", "Rückseite", "Ecken"] means three photos per card. Empty
    # or invalid falls back to services.photo_plan.DEFAULT_PLAN.
    sale_photo_plan = Column(Text)

    # E-mail confirmation. Until email_verified_at is set the account cannot log
    # in. The code itself is never stored — only a hash, same reasoning as for
    # passwords: a leaked database must not hand out working codes.
    email_verified_at = Column(DateTime)
    verify_code_hash = Column(String)
    verify_sent_at = Column(DateTime)
    verify_attempts = Column(Integer, default=0, nullable=False)

    # Which invite code this account was created with (closed testing phase).
    # NULL for accounts made before invites existed, or by an ADMIN_EMAILS address.
    invite_code = Column(String, index=True)


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
    # Legacy single front/back photo columns. Superseded by the ``card_photos``
    # table, which allows any number of shots per card. They are still written
    # so that a rollback to the previous release keeps working, and they are
    # what run_migrations() reads to seed card_photos for existing collections.
    # Read through services.photo_plan.card_photo_keys(), never directly.
    photo_front = Column(String)
    photo_back = Column(String)
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

    # Loaded eagerly: every place that reads a card for a listing needs its
    # photos, and lazy loading turned a 200-card export into 200 extra queries.
    photos = relationship(
        "CardPhoto", lazy="selectin", cascade="all, delete-orphan",
        order_by="CardPhoto.position",
    )


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


class InviteCode(Base):
    """An invite code for the closed testing phase.

    Codes can also come from the ``INVITE_CODES`` env var — that keeps working as
    a bootstrap so you can always get in, even with an empty database. Codes
    created here are the comfortable path: they can be revoked, limited to a
    number of uses, and you can see who signed up with which one.
    """
    __tablename__ = "invite_codes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True, nullable=False)
    label = Column(String)                          # "für Max", "Reddit-Post" …
    max_uses = Column(Integer)                       # NULL = unbegrenzt
    uses = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), index=True)


class ApiCache(Base):
    __tablename__ = "api_cache"

    id = Column(Integer, primary_key=True, index=True)
    cache_key = Column(String, unique=True, index=True)
    response_json = Column(Text)
    cached_at = Column(DateTime, server_default=func.now())


class SaleTemplatePhoto(Base):
    """A seller's reusable fixed photo (e.g. shipping info, condition guide, logo)
    that is inserted into every eBay listing at a chosen position."""
    __tablename__ = "sale_template_photos"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    path = Column(String, nullable=False)        # filename under the sale-photos dir
    label = Column(String)                        # optional caption ("Versandinfo")
    position = Column(Integer, default=99)        # insertion slot in the photo order
    created_at = Column(DateTime, server_default=func.now())


class CardPhoto(Base):
    """One of the seller's own photos of one physical card.

    Replaces the fixed ``photo_front`` / ``photo_back`` pair so a seller can
    define their own photo plan — front, back, corners, holo angle, whatever —
    and take as many shots per card as that plan calls for.

    ``position`` is the 1-based slot in the user's plan; ``label`` is copied
    from the plan at capture time so an old photo keeps its meaning even after
    the plan is later renamed or reordered.
    """
    __tablename__ = "card_photos"

    id = Column(Integer, primary_key=True, index=True)
    card_id = Column(Integer, ForeignKey("cards.id"), index=True, nullable=False)
    position = Column(Integer, default=1, nullable=False)
    label = Column(String)
    path = Column(String, nullable=False)         # key under the sale-photos dir
    created_at = Column(DateTime, server_default=func.now())


class CatalogCard(Base):
    """A local copy of every Pokémon card the TCG API knows about.

    Why this exists: the app used to need a network round-trip to identify any
    card, which made scanning depend on a third-party service that is being
    wound down in favour of a paid successor. With the catalogue imported, a
    scan is answered from this table — instantly, offline, and unaffected by
    whatever happens to the API.

    ``number_int`` and ``printed_total`` are stored separately from the printed
    strings because that pair ("21" of "197") is exactly what OCR produces and
    what the lookup searches on; keeping them as integers makes that an index
    hit instead of a scan over 20,000 rows.

    ``local_image`` is a filename under the catalogue image dir, set once the
    picture has been downloaded. NULL means "still served from the API's CDN".
    """
    __tablename__ = "catalog_cards"

    id = Column(String, primary_key=True)              # e.g. "sv3-21"
    name = Column(String, index=True, nullable=False)
    set_id = Column(String, index=True)
    set_name = Column(String)
    set_series = Column(String)
    printed_total = Column(Integer, index=True)
    number = Column(String)                            # as printed ("21", "TG05")
    number_int = Column(Integer, index=True)           # numeric part, for lookup
    rarity = Column(String)
    types = Column(String)                             # comma separated
    hp = Column(String)
    national_dex = Column(String)                      # comma separated
    image_small = Column(String)
    image_large = Column(String)
    local_image = Column(String)
    updated_at = Column(DateTime, server_default=func.now())


class CollectionSnapshot(Base):
    """Daily snapshot of a user's collection value — powers the value-history
    chart (portfolio view). One row per user per day, upserted whenever stats
    are computed, so the history builds itself with zero extra infrastructure."""
    __tablename__ = "collection_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    day = Column(String, index=True, nullable=False)     # "YYYY-MM-DD" (UTC)
    total_cards = Column(Integer, default=0)
    total_unique = Column(Integer, default=0)
    total_value_eur = Column(Float, default=0.0)
    total_value_usd = Column(Float, default=0.0)
    taken_at = Column(DateTime, server_default=func.now())


class MarketplaceConnection(Base):
    """A user's linked marketplace account (eBay OAuth, Whatnot API token, …).

    One row per (user, platform). Secrets are stored server-side only and never
    returned through the API — the frontend only sees status/username.
    """
    __tablename__ = "marketplace_connections"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    platform = Column(String, nullable=False)      # "ebay" | "whatnot"
    # eBay: long-lived refresh token from the user-consent OAuth flow.
    # Whatnot: the seller's API token from the Seller Hub.
    refresh_token = Column(Text)
    access_token = Column(Text)                     # short-lived, cached
    access_token_expires_at = Column(DateTime)
    external_username = Column(String)              # display only
    status = Column(String, default="connected")    # connected | error | revoked
    connected_at = Column(DateTime, server_default=func.now())


class MarketplaceListing(Base):
    """A card listed on an external marketplace — the cross-listing ledger.

    Tracks where each card is live so a sale on one platform can end the
    listings on the others (auto-delist).
    """
    __tablename__ = "marketplace_listings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    card_id = Column(Integer, ForeignKey("cards.id"), index=True, nullable=False)
    platform = Column(String, nullable=False)       # "ebay" | "whatnot" | "vinted"
    external_id = Column(String, index=True)        # listing/offer ID on the platform
    sku = Column(String, index=True)                # our SKU (cardvault-<card_id>)
    status = Column(String, default="active")       # active | sold | ended | error
    price = Column(Float)
    currency = Column(String, default="EUR")
    listed_at = Column(DateTime, server_default=func.now())
    ended_at = Column(DateTime)
    note = Column(Text)


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
