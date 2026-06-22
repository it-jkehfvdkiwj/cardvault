"""
Storage + public URLs for the seller's own card photos (eBay listings).

Photos live under ``<UPLOAD_DIR>/sale/`` and are served publicly at
``/uploads/sale/<file>`` (the /uploads mount is unauthenticated). They use a
non-``tmp_`` prefix so the stale-temp cleanup never deletes them.

eBay's File Exchange copies PicURL images into its own picture service when the
CSV is processed, so these URLs only need to be reachable at *that* moment — which
makes self-hosting viable even on ephemeral storage. The URLs must be ABSOLUTE and
public: set ``APP_BASE_URL`` (e.g. https://cardvault.onrender.com) in production.
"""

import os
import shutil
import uuid
from pathlib import Path

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
SALE_SUBDIR = "sale"
SALE_DIR = UPLOAD_DIR / SALE_SUBDIR
SALE_DIR.mkdir(parents=True, exist_ok=True)

_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp"}


def _safe_ext(filename: str | None, fallback: str = ".jpg") -> str:
    ext = Path(filename or "").suffix.lower()
    return ext if ext in _ALLOWED_EXT else fallback


def save_bytes(data: bytes, filename: str | None = None) -> str:
    """Persist raw image bytes; return the relative path 'sale/<uuid>.<ext>'."""
    ext = _safe_ext(filename)
    rel = f"{SALE_SUBDIR}/{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / rel).write_bytes(data)
    return rel


def adopt_scan_image(local_image_path: str | None) -> str | None:
    """Copy a scan's temp image into the sale dir as a permanent front photo.

    The scan pipeline writes ``tmp_<uuid>.jpg`` (auto-deleted after a day); we copy
    it so the card keeps its photo. Returns the relative sale path or None.
    """
    if not local_image_path:
        return None
    src = Path(local_image_path)
    if not src.is_absolute():
        src = UPLOAD_DIR / src.name
    if not src.is_file():
        return None
    rel = f"{SALE_SUBDIR}/{uuid.uuid4().hex}{_safe_ext(src.name)}"
    try:
        shutil.copyfile(src, UPLOAD_DIR / rel)
    except OSError:
        return None
    return rel


def delete(rel_path: str | None) -> None:
    if not rel_path:
        return
    try:
        p = UPLOAD_DIR / rel_path
        # Guard against escaping the sale dir.
        if SALE_DIR in p.resolve().parents or p.parent == SALE_DIR:
            p.unlink(missing_ok=True)
    except OSError:
        pass


def public_url(rel_path: str | None) -> str | None:
    """Absolute public URL for a stored sale photo, or None.

    Requires APP_BASE_URL in production so eBay can fetch the image.
    """
    if not rel_path:
        return None
    # Render injects RENDER_EXTERNAL_URL automatically, so photos get absolute
    # public URLs on the deploy with no manual config; APP_BASE_URL overrides it.
    base = (os.getenv("APP_BASE_URL") or os.getenv("RENDER_EXTERNAL_URL") or "").rstrip("/")
    return f"{base}/uploads/{rel_path}" if base else f"/uploads/{rel_path}"
