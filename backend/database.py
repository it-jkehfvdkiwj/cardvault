from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./cardvault.db")

# Render/Heroku hand out "postgres://" URLs, but SQLAlchemy 2.0 only accepts the
# "postgresql://" scheme — normalise so a managed Postgres just works.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if IS_SQLITE else {},
    # Managed Postgres drops idle connections; pre-ping avoids stale-connection errors.
    pool_pre_ping=not IS_SQLITE,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_migrations() -> None:
    """Lightweight additive migrations for existing SQLite databases.

    SQLAlchemy's create_all() makes new tables but never alters existing ones, so
    we add the new ``user_id`` columns by hand if they're missing. Existing rows
    keep user_id = NULL (orphaned / hidden), matching the 'start fresh' choice.

    The legacy DDL further down (DATETIME, BOOLEAN DEFAULT 0) is SQLite-specific;
    on Postgres a fresh DB already has those via create_all(), so we skip it. The
    *portable* additions block below uses ANSI DDL and runs on both backends, so
    columns added to existing tables after launch (e.g. the sale-photo columns)
    show up on the live Postgres too.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    def _existing_cols(table: str) -> set[str]:
        return {c["name"] for c in inspector.get_columns(table)}

    # ── Portable additive columns (SQLite + Postgres) ─────────────────────────
    portable = {
        "cards": [
            ("photo_front", "VARCHAR"), ("photo_back", "VARCHAR"),
            ("sale_price", "FLOAT"),
        ],
        "users": [
            ("sale_photos_per_card", "INTEGER DEFAULT 1"),
            ("password_changed_at", "TIMESTAMP"),
            ("invite_code", "VARCHAR"),
            ("sale_intro", "TEXT"),
            ("sale_outro", "TEXT"),
            ("sale_photo_plan", "TEXT"),
            ("sale_options", "TEXT"),
            ("email_verified_at", "TIMESTAMP"),
            ("verify_code_hash", "VARCHAR"),
            ("verify_sent_at", "TIMESTAMP"),
            ("verify_attempts", "INTEGER DEFAULT 0"),
        ],
    }
    with engine.begin() as conn:
        for table, columns in portable.items():
            if table not in existing_tables:
                continue
            cols = _existing_cols(table)
            for col, ddl in columns:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))

    # ── Accounts that existed before e-mail confirmation stay confirmed ───────
    # Without this every existing user — including the operator — would be
    # locked out the moment this release goes live, because login now refuses
    # accounts with no email_verified_at. They proved their address by other
    # means (they were invited personally), so they are grandfathered in.
    # Runs once: after the backfill no rows match the WHERE clause.
    #
    # Note the FRESH inspector. ``_existing_cols`` above reads the snapshot
    # taken at the top of this function — from before the ALTER TABLE
    # statements ran — so on an existing database it would report the column as
    # missing and skip the backfill. That is precisely the case this guards
    # against, so the check has to look at the database as it is now.
    fresh = inspect(engine)
    users_cols_now = (
        {c["name"] for c in fresh.get_columns("users")}
        if "users" in set(fresh.get_table_names()) else set()
    )
    if "email_verified_at" in users_cols_now:
        with engine.begin() as conn:
            conn.execute(text("""
                UPDATE users SET email_verified_at = created_at
                WHERE email_verified_at IS NULL AND created_at IS NOT NULL
            """))
            # Rows without a created_at (very old test data) get "now".
            conn.execute(text(
                "UPDATE users SET email_verified_at = CURRENT_TIMESTAMP "
                "WHERE email_verified_at IS NULL"
            ))

    # ── Seed card_photos from the legacy front/back columns ───────────────────
    # Runs once: cards written before the photo plan existed keep their photos,
    # in the right slots, without anyone having to re-upload anything. Guarded
    # by "is the table empty" rather than a flag, so it is safe to re-run and
    # cannot duplicate rows. Cards photographed after the switch already write
    # both places, so they are skipped by the NOT EXISTS clause anyway.
    if "card_photos" in set(inspect(engine).get_table_names()) and "cards" in existing_tables:
        card_cols = _existing_cols("cards")
        if {"photo_front", "photo_back"} <= card_cols:
            with engine.begin() as conn:
                already = conn.execute(text("SELECT COUNT(*) FROM card_photos")).scalar()
                if not already:
                    for col, pos, label in (
                        ("photo_front", 1, "Vorderseite"),
                        ("photo_back", 2, "Rückseite"),
                    ):
                        conn.execute(text(f"""
                            INSERT INTO card_photos (card_id, position, label, path)
                            SELECT id, :pos, :label, {col} FROM cards
                            WHERE {col} IS NOT NULL AND {col} <> ''
                        """), {"pos": pos, "label": label})

    # ── Legacy SQLite-only migrations (pre-launch local DBs) ───────────────────
    if not IS_SQLITE:
        return

    # Columns to add if missing: {table: [(column, "SQL type [default]"), ...]}
    additions = {
        "cards": [("user_id", "INTEGER")],
        "wantlist": [("user_id", "INTEGER")],
        "users": [
            ("is_admin", "BOOLEAN DEFAULT 0"),
            ("is_active", "BOOLEAN DEFAULT 1"),
            ("plan", "VARCHAR DEFAULT 'free'"),
            ("subscription_status", "VARCHAR"),
            ("subscription_period_end", "DATETIME"),
            ("stripe_customer_id", "VARCHAR"),
            ("stripe_subscription_id", "VARCHAR"),
            ("last_login_at", "DATETIME"),
            ("is_public", "BOOLEAN DEFAULT 0"),
            ("public_slug", "VARCHAR"),
        ],
    }
    with engine.begin() as conn:
        for table, columns in additions.items():
            if table not in existing_tables:
                continue
            existing_cols = {c["name"] for c in inspector.get_columns(table)}
            for col, ddl in columns:
                if col not in existing_cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
