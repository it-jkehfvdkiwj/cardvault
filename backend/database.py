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
        "cards": [("photo_front", "VARCHAR"), ("photo_back", "VARCHAR")],
        "users": [("sale_photos_per_card", "INTEGER DEFAULT 1")],
    }
    with engine.begin() as conn:
        for table, columns in portable.items():
            if table not in existing_tables:
                continue
            cols = _existing_cols(table)
            for col, ddl in columns:
                if col not in cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))

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
