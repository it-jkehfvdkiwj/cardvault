import io
import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageEnhance

# Register HEIC/HEIF support so iPhone photos (.heic) can be decoded by Pillow.
try:
    import pillow_heif

    pillow_heif.register_heif_opener()
except Exception:
    pass


UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _pil_to_cv(img: Image.Image) -> np.ndarray:
    return cv2.cvtColor(np.array(img.convert("RGB")), cv2.COLOR_RGB2BGR)


def _cv_to_pil(arr: np.ndarray) -> Image.Image:
    return Image.fromarray(cv2.cvtColor(arr, cv2.COLOR_BGR2RGB))


def preprocess_card_image(image_bytes: bytes) -> tuple[Image.Image, np.ndarray]:
    """Preprocess uploaded card image: normalize + try to auto-crop card."""
    img = Image.open(io.BytesIO(image_bytes))

    # Convert HEIC-like formats / ensure RGB
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    # Normalize brightness/contrast
    img = _normalize(img)

    cv_img = _pil_to_cv(img)
    cropped = _auto_crop_card(cv_img)
    if cropped is not None:
        final = _cv_to_pil(cropped)
    else:
        final = img

    return final, _pil_to_cv(final)


def _normalize(img: Image.Image) -> Image.Image:
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(1.2)
    enhancer = ImageEnhance.Brightness(img)
    img = enhancer.enhance(1.05)
    return img


# A Pokémon card is 6.3 × 8.8 cm → aspect ratio ≈ 0.716 (short/long side).
_CARD_RATIO = 0.716
_RATIO_MIN, _RATIO_MAX = 0.55, 0.90


def _card_candidates(mask: np.ndarray, area_full: float) -> list[tuple]:
    """Find card-shaped quadrilaterals in a binary mask.

    Returns a list of ``(score, minAreaRect)`` where score rewards large, very
    rectangular, correctly-proportioned blobs.
    """
    out: list[tuple] = []
    contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    for c in contours:
        area = cv2.contourArea(c)
        if area < 0.06 * area_full or area > 0.985 * area_full:
            continue
        rect = cv2.minAreaRect(c)
        (_, _), (rw, rh), _ = rect
        if rw < 1 or rh < 1:
            continue
        ratio = min(rw, rh) / max(rw, rh)
        if not (_RATIO_MIN <= ratio <= _RATIO_MAX):
            continue
        rectangularity = area / (rw * rh)        # 1.0 = perfect rectangle
        if rectangularity < 0.7:
            continue
        # The single strongest signal that we found *the card* (vs the whole
        # photo) is the aspect ratio: a card is almost exactly 0.716. Weight that
        # heavily (4th power) and use only sqrt(area) so a near-full-frame blob
        # with an off ratio can't win on size alone.
        ratio_fit = 1.0 - min(abs(ratio - _CARD_RATIO) / _CARD_RATIO, 1.0)
        score = (ratio_fit ** 4) * rectangularity * (area ** 0.5)
        out.append((score, rect))
    return out


def _auto_crop_card(cv_img: np.ndarray) -> np.ndarray | None:
    """
    Locate the card within the photo and return a deskewed, portrait crop.

    Works for cards on plain *or* busy backgrounds, filling the frame or only
    part of it, at any in-plane angle. We try several segmentation strategies
    (saturation/dark mask, Canny edges, Otsu) and keep the most card-shaped
    rectangle across all of them. Returns ``None`` (caller keeps the original)
    only when nothing plausibly card-shaped is found.

    Note: the result may be upside-down (180°) — in-plane orientation is
    resolved later by the OCR stage, which reads the same regardless.
    """
    h_img, w_img = cv_img.shape[:2]
    # Work on a downscaled copy for speed/robustness.
    scale = 900.0 / max(h_img, w_img) if max(h_img, w_img) > 900 else 1.0
    small = cv2.resize(cv_img, (int(w_img * scale), int(h_img * scale))) if scale != 1.0 else cv_img
    sh, sw = small.shape[:2]
    area_full = float(sh * sw)

    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)

    masks: list[np.ndarray] = []

    # Strategy 1: colourful (sat) OR dark (value) foreground.
    _, sat_mask = cv2.threshold(hsv[:, :, 1], 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    dark_mask = (hsv[:, :, 2] < 60).astype(np.uint8) * 255
    m1 = cv2.bitwise_or(sat_mask, dark_mask)
    masks.append(cv2.morphologyEx(m1, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8)))

    # Strategy 2: Canny edges → dilate/close into solid card region.
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 30, 120)
    edges = cv2.dilate(edges, np.ones((5, 5), np.uint8), iterations=2)
    masks.append(cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)))

    # Strategy 3: Otsu on gray (separates card from contrasting background).
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    for mm in (otsu, cv2.bitwise_not(otsu)):
        masks.append(cv2.morphologyEx(mm, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8)))

    candidates: list[tuple] = []
    for mask in masks:
        candidates.extend(_card_candidates(mask, area_full))
    if not candidates:
        return None

    best_rect = max(candidates, key=lambda x: x[0])[1]
    box = (cv2.boxPoints(best_rect).astype("float32")) / scale  # back to full res
    warped = _four_point_transform(cv_img, box)
    if warped is None or warped.size == 0:
        return None

    # Force portrait orientation (90° fix); 180° is handled by OCR.
    if warped.shape[1] > warped.shape[0]:
        warped = cv2.rotate(warped, cv2.ROTATE_90_CLOCKWISE)

    wh, ht = warped.shape[1], warped.shape[0]
    ratio = wh / ht if ht else 0
    if not (_RATIO_MIN <= ratio <= _RATIO_MAX):
        return None
    return warped


def _order_points(pts: np.ndarray) -> np.ndarray:
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect


def _four_point_transform(image: np.ndarray, pts: np.ndarray) -> np.ndarray:
    rect = _order_points(pts)
    tl, tr, br, bl = rect

    widthA = np.linalg.norm(br - bl)
    widthB = np.linalg.norm(tr - tl)
    maxWidth = max(int(widthA), int(widthB))

    heightA = np.linalg.norm(tr - br)
    heightB = np.linalg.norm(tl - bl)
    maxHeight = max(int(heightA), int(heightB))

    dst = np.array([
        [0, 0],
        [maxWidth - 1, 0],
        [maxWidth - 1, maxHeight - 1],
        [0, maxHeight - 1],
    ], dtype="float32")

    M = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(image, M, (maxWidth, maxHeight))


def save_image(img: Image.Image, filename: str) -> str:
    dest = UPLOAD_DIR / filename
    img.save(dest, format="JPEG", quality=90)
    return str(dest)


def get_name_region(cv_img: np.ndarray) -> np.ndarray:
    """Return the top 15% of the card image where the name text lives."""
    h = cv_img.shape[0]
    return cv_img[: int(h * 0.15), :]
