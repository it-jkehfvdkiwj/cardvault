"""
Central configuration + production safety checks.

The single most dangerous failure mode for a small SaaS is booting in
production with a development default still in place — most of all a known
``JWT_SECRET``, which lets anyone forge a login for any account (including
yours, the admin). Silent misconfiguration is worse than a crash, so in
production this module **refuses to start** rather than come up insecure.

Production is detected automatically, so it also protects you if you forget to
set ``APP_ENV`` on the host:

* ``APP_ENV=production`` set explicitly, or
* the platform announced itself (Render sets ``RENDER``, Fly sets ``FLY_APP_NAME``), or
* ``APP_BASE_URL`` / ``CORS_ORIGINS`` point at a real https:// domain.
"""

from __future__ import annotations

import os
import sys

DEV_JWT_SECRET = "dev-insecure-secret-change-me-0123456789-abcdefghij"


def _truthy(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _public_https_configured() -> bool:
    """True if any configured URL is a real https:// host (not localhost)."""
    blob = f"{os.getenv('APP_BASE_URL', '')},{os.getenv('CORS_ORIGINS', '')}"
    for origin in blob.split(","):
        origin = origin.strip().lower()
        if origin.startswith("https://") and "localhost" not in origin and "127.0.0.1" not in origin:
            return True
    return False


def is_production() -> bool:
    explicit = os.getenv("APP_ENV", "").strip().lower()
    if explicit in {"production", "prod"}:
        return True
    if explicit in {"development", "dev", "local", "test"}:
        return False
    if os.getenv("RENDER") or os.getenv("FLY_APP_NAME") or os.getenv("RAILWAY_ENVIRONMENT"):
        return True
    return _public_https_configured()


IS_PRODUCTION = is_production()


def check_production_config() -> list[str]:
    """Return a list of fatal misconfigurations (empty = good to go)."""
    problems: list[str] = []

    secret = os.getenv("JWT_SECRET", "")
    if not secret or secret == DEV_JWT_SECRET:
        problems.append(
            "JWT_SECRET is missing or still the development default. Anyone who "
            "knows it can forge a login for any account. Generate one with:\n"
            '        python -c "import secrets; print(secrets.token_urlsafe(48))"'
        )
    elif len(secret) < 32:
        problems.append("JWT_SECRET is too short — use at least 32 random characters.")

    origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
    if "*" in origins:
        problems.append(
            "CORS_ORIGINS is '*' while credentials are allowed — that lets any "
            "website make authenticated calls on behalf of a logged-in user. "
            "List your real domain(s) instead."
        )

    return problems


def enforce() -> None:
    """Abort start-up in production if the configuration is unsafe."""
    if private_beta() and not invite_codes():
        # Not fatal — an existing account can still log in — but nobody new can
        # register, which is confusing to debug from the outside.
        print(
            "[CardVault] PRIVATE_BETA is on but INVITE_CODES is empty: nobody can "
            "register. Set INVITE_CODES=deincode123 (comma-separated for several), "
            "or PRIVATE_BETA=false to open registration to everyone.",
            file=sys.stderr,
        )

    if not IS_PRODUCTION:
        if os.getenv("JWT_SECRET", DEV_JWT_SECRET) == DEV_JWT_SECRET:
            print(
                "[CardVault] Development mode — using the insecure default "
                "JWT_SECRET. Fine locally, fatal in production.",
                file=sys.stderr,
            )
        return

    problems = check_production_config()
    if problems:
        print("\n" + "=" * 72, file=sys.stderr)
        print("CardVault refuses to start: unsafe production configuration", file=sys.stderr)
        print("=" * 72, file=sys.stderr)
        for p in problems:
            print(f"  ✗ {p}", file=sys.stderr)
        print(
            "\nSet these in your hosting environment, then redeploy. "
            "See DEPLOY.md section 1.\n" + "=" * 72 + "\n",
            file=sys.stderr,
        )
        raise SystemExit(1)


# ── Closed testing phase ──────────────────────────────────────────────────────
#
# While this is on, CardVault is not a public offer: only people holding an
# invite code can create an account, and search engines are told to stay away
# entirely. That keeps the deployment a private test among people you invited
# personally rather than a service addressed to the general public.
#
# Defaults to ON so a fresh deploy is never accidentally open to the world.
# Set PRIVATE_BETA=false to launch publicly.

def private_beta() -> bool:
    return os.getenv("PRIVATE_BETA", "true").strip().lower() in {"1", "true", "yes", "on"}


def invite_codes() -> set[str]:
    """Accepted invite codes, compared case-insensitively."""
    raw = os.getenv("INVITE_CODES", "")
    return {c.strip().lower() for c in raw.split(",") if c.strip()}


def invite_code_valid(code: str | None) -> bool:
    return bool(code) and code.strip().lower() in invite_codes()


# ── Runtime toggles ───────────────────────────────────────────────────────────

def max_upload_bytes() -> int:
    """Hard cap on a single request body (default 25 MB).

    Phone photos are 3–8 MB and a batch upload sends up to 50 of them, so the
    limit is applied per request with a generous batch allowance in the
    middleware; this value is the per-file guard.
    """
    return int(os.getenv("MAX_UPLOAD_MB", "25")) * 1024 * 1024


def max_request_bytes() -> int:
    """Hard cap on a whole request body (default 200 MB) — protects RAM."""
    return int(os.getenv("MAX_REQUEST_MB", "200")) * 1024 * 1024
