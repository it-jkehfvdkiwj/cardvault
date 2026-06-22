import os
import time
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv()

from database import Base, engine, run_migrations
from routes import (
    account, admin, auth, billing, cards, ebay, prices, public, stats, wantlist,
)

Base.metadata.create_all(bind=engine)
run_migrations()

app = FastAPI(title="CardVault API", version="1.0.0")

origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
app.include_router(public.router)


@app.get("/api/health/tcg")
async def health_tcg():
    """Live reachability check for the Pokémon TCG API from THIS server.

    Card identification depends entirely on api.pokemontcg.io, so when every scan
    returns 'no match' this tells us whether the API is reachable/slow from the
    deploy (vs an OCR problem). Open it in the browser on the deployed URL.
    """
    import time
    from services import tcg_api_service

    out = {
        "has_api_key": bool(os.getenv("POKEMON_TCG_API_KEY", "")),
        "base": tcg_api_service.TCG_API_BASE,
    }
    t0 = time.perf_counter()
    try:
        resp = await tcg_api_service._client().get(
            f"{tcg_api_service.TCG_API_BASE}/cards",
            headers=tcg_api_service._get_headers(),
            params={"q": "number:52", "pageSize": 1, "select": "id,name,set"},
        )
        out["latency_ms"] = round((time.perf_counter() - t0) * 1000)
        out["status_code"] = resp.status_code
        out["ok"] = resp.status_code == 200
        try:
            out["sample_results"] = len(resp.json().get("data", []))
        except Exception:
            out["sample_results"] = None
    except Exception as exc:
        out["ok"] = False
        out["error"] = type(exc).__name__
        out["latency_ms"] = round((time.perf_counter() - t0) * 1000)
    return out


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "0"
    return response

upload_dir = Path(os.getenv("UPLOAD_DIR", "uploads"))
upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

# Serve the React build if it exists (production / Render deployment).
_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    from fastapi.responses import FileResponse
    app.mount("/assets", StaticFiles(directory=str(_frontend_dist / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        # Serve actual files if they exist, otherwise return index.html for React Router.
        candidate = _frontend_dist / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(_frontend_dist / "index.html"))


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


@app.get("/health")
def health():
    return {"status": "ok", "service": "CardVault API"}
