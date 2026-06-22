"""
Storage + public URLs for the seller's own card photos (eBay listings).

Two interchangeable backends, chosen automatically:

* **Cloudflare R2** (when the ``R2_*`` env vars are set) — durable object storage
  with a free tier and no egress fees, so photos survive redeploys and eBay can
  always fetch them. This is the production path.
* **Local disk** under ``<UPLOAD_DIR>/sale/`` (served at ``/uploads/sale/<file>``)
  as a fallback for local development. Ephemeral on a free host.

Stored DB values are the object **key** (e.g. ``sale/<uuid>.jpg``) in both cases,
so switching backends doesn't change the schema. URLs are absolute + public.

Required env for R2 (see DEPLOY.md):
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL
"""

import os
import uuid
from pathlib import Path

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
SALE_SUBDIR = "sale"
SALE_DIR = UPLOAD_DIR / SALE_SUBDIR
SALE_DIR.mkdir(parents=True, exist_ok=True)

_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}
_CONTENT_TYPE = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".webp": "image/webp",
}


def _safe_ext(filename: str | None, fallback: str = ".jpg") -> str:
    ext = Path(filename or "").suffix.lower()
    return ext if ext in _ALLOWED_EXT else fallback


# ── Cloudflare R2 backend ─────────────────────────────────────────────────────

def _r2_cfg() -> dict:
    return {
        "account_id": os.getenv("R2_ACCOUNT_ID", ""),
        "access_key": os.getenv("R2_ACCESS_KEY_ID", ""),
        "secret_key": os.getenv("R2_SECRET_ACCESS_KEY", ""),
        "bucket": os.getenv("R2_BUCKET", ""),
        "public_url": os.getenv("R2_PUBLIC_URL", "").rstrip("/"),
    }


def r2_enabled() -> bool:
    return all(_r2_cfg().values())


_r2_client_cache = None


def _r2_client():
    global _r2_client_cache
    if _r2_client_cache is None:
        import boto3
        from botocore.config import Config

        c = _r2_cfg()
        _r2_client_cache = boto3.client(
            "s3",
            endpoint_url=f"https://{c['account_id']}.r2.cloudflarestorage.com",
            aws_access_key_id=c["access_key"],
            aws_secret_access_key=c["secret_key"],
            region_name="auto",
            config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
        )
    return _r2_client_cache


# ── Public API (backend-agnostic) ─────────────────────────────────────────────

def save_bytes(data: bytes, filename: str | None = None) -> str:
    """Persist raw image bytes; return the object key 'sale/<uuid>.<ext>'."""
    ext = _safe_ext(filename)
    key = f"{SALE_SUBDIR}/{uuid.uuid4().hex}{ext}"
    if r2_enabled():
        _r2_client().put_object(
            Bucket=_r2_cfg()["bucket"], Key=key, Body=data,
            ContentType=_CONTENT_TYPE.get(ext, "image/jpeg"),
        )
    else:
        (UPLOAD_DIR / key).write_bytes(data)
    return key


def adopt_scan_image(local_image_path: str | None) -> str | None:
    """Copy a scan's temp image into permanent storage as a front/back photo.

    The scan pipeline writes ``tmp_<uuid>.jpg`` (auto-deleted after a day); we copy
    its bytes so the card keeps its photo. Returns the object key or None.
    """
    if not local_image_path:
        return None
    src = Path(local_image_path)
    if not src.is_absolute():
        src = UPLOAD_DIR / src.name
    if not src.is_file():
        return None
    try:
        return save_bytes(src.read_bytes(), src.name)
    except Exception:
        return None


def delete(key: str | None) -> None:
    if not key:
        return
    if r2_enabled():
        try:
            _r2_client().delete_object(Bucket=_r2_cfg()["bucket"], Key=key)
        except Exception:
            pass
        return
    try:
        p = UPLOAD_DIR / key
        if SALE_DIR in p.resolve().parents or p.parent == SALE_DIR:
            p.unlink(missing_ok=True)
    except OSError:
        pass


def public_url(key: str | None) -> str | None:
    """Absolute public URL for a stored photo, or None.

    R2: the bucket's public base URL. Local: APP_BASE_URL / RENDER_EXTERNAL_URL so
    eBay can fetch it (Render injects RENDER_EXTERNAL_URL automatically).
    """
    if not key:
        return None
    if r2_enabled():
        return f"{_r2_cfg()['public_url']}/{key}"
    base = (os.getenv("APP_BASE_URL") or os.getenv("RENDER_EXTERNAL_URL") or "").rstrip("/")
    return f"{base}/uploads/{key}" if base else f"/uploads/{key}"
