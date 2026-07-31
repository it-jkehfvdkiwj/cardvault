import logging
import os
import time
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

import config

# Refuses to boot in production with a default JWT secret or wildcard CORS.
config.enforce()

from database import Base, engine, run_migrations
from routes import (
    account, admin, auth, billing, cards, ebay, market, prices, public, sale,
    stats, wantlist,
)

Base.metadata.create_all(bind=engine)
run_migrations()

app = FastAPI(
    title="Cardeva API",
    version="1.0.0",
    # Don't advertise the whole API surface publicly in production.
    docs_url=None if config.IS_PRODUCTION else "/docs",
    redoc_url=None if config.IS_PRODUCTION else "/redoc",
    openapi_url=None if config.IS_PRODUCTION else "/openapi.json",
)

origins = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Compress JSON/CSV responses (collection lists, exports) — typically 5–10×
# smaller on the wire, which makes the app feel much snappier on mobile data.
app.add_middleware(GZipMiddleware, minimum_size=1500)

# ── Logging & unhandled errors ────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger("cardvault")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc: Exception):
    """Log the full traceback server-side, return a plain message to the client.

    Starlette's default 500 page is HTML, which the frontend then fails to parse
    ("Unexpected token '<'"), hiding the real problem. It can also echo internals
    to the user. This keeps the detail in the logs where you can find it.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Serverfehler. Bitte versuch es später noch einmal."},
    )


app.include_router(auth.router)
app.include_router(account.router)
app.include_router(admin.router)
app.include_router(billing.router)
app.include_router(cards.router)
app.include_router(prices.router)
app.include_router(wantlist.router)
app.include_router(stats.router)
app.include_router(ebay.router)
app.include_router(market.router)
app.include_router(public.router)
app.include_router(sale.router)


@app.get("/api/health/tcg")
async def health_tcg():
    """Live reachability check for the Pokémon TCG API from THIS server.

    Card identification depends entirely on api.pokemontcg.io, so when every scan
    returns 'no match' this tells us whether the API is reachable/slow from the
    deploy (vs an OCR problem). Returns a big, human-readable HTML verdict so it
    can be read off a phone screen — open it in the browser on the deployed URL.
    """
    import time
    from fastapi.responses import HTMLResponse
    from services import tcg_api_service

    has_key = bool(os.getenv("POKEMON_TCG_API_KEY", ""))
    ok = False
    detail = ""
    t0 = time.perf_counter()
    try:
        resp = await tcg_api_service._client().get(
            f"{tcg_api_service.TCG_API_BASE}/cards",
            headers=tcg_api_service._get_headers(),
            params={"q": "number:52", "pageSize": 1, "select": "id,name,set"},
        )
        ms = round((time.perf_counter() - t0) * 1000)
        n = len(resp.json().get("data", []))
        ok = resp.status_code == 200 and n > 0
        detail = f"HTTP {resp.status_code} · {ms} ms · {n} Treffer"
    except Exception as exc:
        ms = round((time.perf_counter() - t0) * 1000)
        detail = f"{type(exc).__name__} nach {ms} ms"

    if ok:
        head, sub, color = "✅ Karten-API ERREICHBAR", "Dann liegt es nicht an der API — sag Claude Bescheid.", "#16a34a"
    else:
        head, sub, color = "❌ Karten-API NICHT erreichbar", "Das ist die Ursache für 'keine Treffer'. Sag Claude diese Meldung.", "#dc2626"
    keyline = "API-Key: gesetzt ✅" if has_key else "API-Key: NICHT gesetzt ⚠️"
    html = f"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cardeva · API-Check</title></head>
<body style="font-family:system-ui,sans-serif;background:#FAFAF8;color:#1A1A17;margin:0;padding:24px;text-align:center">
<div style="max-width:520px;margin:10vh auto">
  <div style="font-size:28px;font-weight:800;color:{color};line-height:1.25">{head}</div>
  <p style="font-size:17px;color:#44443F;margin-top:14px">{sub}</p>
  <div style="margin-top:22px;padding:14px;border-radius:12px;background:#fff;border:1px solid #E4E1D9;font-size:15px;color:#44443F">
    {detail}<br>{keyline}
  </div>
</div></body></html>"""
    return HTMLResponse(html)


def _inline_script_hashes() -> list[str]:
    """CSP hashes for the inline <script> blocks in the built index.html.

    ``index.html`` carries a JSON-LD block for search engines. Under a strict
    ``script-src 'self'`` the browser would refuse it, and the usual workaround —
    ``'unsafe-inline'`` — would also re-enable every injected script, which is
    the whole thing CSP is meant to stop. So we hash whatever inline scripts the
    build actually contains at start-up: the policy stays strict *and* nobody has
    to remember to update a hash after editing index.html.
    """
    import base64
    import hashlib
    import re

    index = Path(__file__).parent.parent / "frontend" / "dist" / "index.html"
    if not index.is_file():
        return []
    try:
        html = index.read_text(encoding="utf-8")
    except OSError:
        return []
    hashes = []
    for body in re.findall(r"<script\b[^>]*>(.*?)</script>", html, re.S | re.I):
        if not body.strip():
            continue  # <script src="..."> — covered by 'self'
        digest = hashlib.sha256(body.encode("utf-8")).digest()
        hashes.append(f"'sha256-{base64.b64encode(digest).decode()}'")
    return hashes


# Content-Security-Policy: the app is a single React bundle, so everything is
# same-origin except Google Fonts (stylesheet + font files) and the card artwork
# served from the TCG API / Cardmarket / the user's own R2 bucket.
_CSP = "; ".join([
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    " ".join(["script-src 'self'", *_inline_script_hashes()]),
    # Tailwind + React's style attributes require inline styles; that is a much
    # smaller risk than inline scripts. Fonts are bundled, so no CDN is allowed.
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    # Card artwork comes from several external CDNs (TCG API, Cardmarket, R2).
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https:",
    "upgrade-insecure-requests",
])


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "0"
    response.headers["Permissions-Policy"] = (
        # The scanner needs the camera; nothing else is ever used.
        "camera=(self), microphone=(), geolocation=(), interest-cohort=()"
    )
    if config.private_beta():
        # During the closed test the site is not addressed to the public, so it
        # must not turn up in search results. This header outranks robots.txt and
        # covers every response, including shared collection links someone might
        # paste somewhere. It disappears by itself once PRIVATE_BETA is off.
        response.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive, nosnippet"
    response.headers.setdefault("Content-Security-Policy", _CSP)

    # Caching: Vite fingerprints everything under /assets, so those can be
    # cached forever. index.html must never be, or users keep running an old
    # bundle after a deploy.
    path = request.url.path
    if path.startswith("/assets/"):
        response.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
    elif path.startswith("/uploads/"):
        response.headers.setdefault("Cache-Control", "public, max-age=86400")
    elif path in ("/", "/index.html") or response.headers.get("content-type", "").startswith("text/html"):
        response.headers["Cache-Control"] = "no-cache"

    if config.IS_PRODUCTION:
        # Tell browsers to never speak plain HTTP to this host again.
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )
    return response


@app.middleware("http")
async def limit_body_size(request, call_next):
    """Reject oversized uploads before they are buffered into RAM.

    Every upload route does ``await file.read()``, so without this a single
    multi-gigabyte POST would take the whole instance down.
    """
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > config.max_request_bytes():
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=413,
            content={
                "detail": "Upload zu groß. Bitte lade weniger oder kleinere Bilder auf einmal hoch."
            },
        )
    return await call_next(request)

upload_dir = Path(os.getenv("UPLOAD_DIR", "uploads"))
upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")


# ── Root-level routes ─────────────────────────────────────────────────────────
# These must be declared BEFORE the SPA catch-all below: routes are matched in
# registration order, so anything added afterwards is shadowed by "/{full_path}"
# and silently answered with index.html. (That is exactly what used to happen to
# /health — the Render health check was checking the HTML shell, not the API.)

@app.get("/health")
def health():
    return {"status": "ok", "service": "Cardeva API"}


@app.get("/robots.txt", include_in_schema=False)
def robots_txt():
    """Served dynamically so the crawl policy always matches the actual mode.

    During the closed test nothing may be indexed. Once PRIVATE_BETA is off the
    static file from the frontend build takes over again — no need to remember
    to edit robots.txt on launch day.
    """
    from fastapi.responses import FileResponse as _FileResponse, PlainTextResponse

    if config.private_beta():
        return PlainTextResponse(
            "# Geschlossene Testphase — diese Seite ist kein öffentliches Angebot.\n"
            "User-agent: *\nDisallow: /\n"
        )
    static = _frontend_dist / "robots.txt"
    if static.is_file():
        return _FileResponse(str(static), media_type="text/plain")
    return PlainTextResponse("User-agent: *\nAllow: /\n")


# Serve the React build if it exists (production / Render deployment).
_frontend_dist = (Path(__file__).parent.parent / "frontend" / "dist").resolve()
if _frontend_dist.exists():
    from fastapi.responses import FileResponse, JSONResponse
    app.mount("/assets", StaticFiles(directory=str(_frontend_dist / "assets")), name="assets")

    _INDEX = _frontend_dist / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        """Serve a real build file if it exists, else index.html for React Router.

        Two things matter here for safety:

        1. **Path traversal.** ``full_path`` is URL-decoded by Starlette, so a
           request for ``/..%2f..%2f..%2fetc%2fpasswd`` would otherwise escape
           the build directory and hand out arbitrary server files (including
           ``.env``). We resolve the candidate and require it to stay inside
           ``frontend/dist``.
        2. **Unknown API paths.** They must 404 as JSON rather than silently
           returning the HTML shell, which would turn a typo'd endpoint into a
           confusing "Unexpected token '<'" error in the browser.
        """
        if full_path.startswith(("api/", "uploads/")):
            return JSONResponse(status_code=404, content={"detail": "Not found"})

        try:
            candidate = (_frontend_dist / full_path).resolve()
            if candidate.is_file() and candidate.is_relative_to(_frontend_dist):
                return FileResponse(str(candidate))
        except (OSError, ValueError):
            pass
        return FileResponse(str(_INDEX))


@app.on_event("startup")
def _cleanup_stale_temps() -> None:
    """Delete upload temp files older than 1 day left over from previous runs."""
    cutoff = time.time() - 86400
    for p in upload_dir.glob("tmp_*.jpg"):
        try:
            if p.stat().st_mtime < cutoff:
                p.unlink()
        except OSError:
            pass


@app.on_event("shutdown")
async def _close_http_client() -> None:
    """Close the shared pooled HTTP client used for TCG/PokeAPI calls."""
    from services import tcg_api_service
    await tcg_api_service.aclose_client()
