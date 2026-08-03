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


def _card_candidates(
    mask: np.ndarray, area_full: float, min_area_frac: float = 0.05
) -> list[tuple]:
    """Find card-shaped quadrilaterals in a binary mask.

    Returns a list of ``(score, minAreaRect)`` where score rewards large, very
    rectangular, correctly-proportioned blobs.

    ``min_area_frac`` is the smallest blob we consider, as a fraction of the
    whole photo. The default 0.05 suits a single card filling much of the frame.
    Binder pages need a much lower bound: one card on a 3×3 page is about 1/11
    of the photo, on a 4×3 page about 1/14.
    """
    out: list[tuple] = []
    sh, sw = mask.shape[:2]
    contours, _ = cv2.findContours(mask, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    for c in contours:
        area = cv2.contourArea(c)
        if area < min_area_frac * area_full or area > 0.985 * area_full:
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
        # heavily (4th power) and use only area**0.4 so a near-full-frame blob
        # with an off ratio can't win on size alone.
        ratio_fit = 1.0 - min(abs(ratio - _CARD_RATIO) / _CARD_RATIO, 1.0)
        # A card photographed within a frame has a margin around it. A blob that
        # spans the whole photo (touches every edge) is almost always the frame
        # itself — a 3:4 phone photo's 0.75 ratio is deceptively card-like. Penalise
        # edge-spanning blobs so a smaller, correctly-proportioned card region wins;
        # don't reject them, since genuine full-frame scans (card fills the photo)
        # have no competing candidate and should still pass.
        x, y, bw, bh = cv2.boundingRect(c)
        touch = (x <= 2) + (y <= 2) + (x + bw >= sw - 2) + (y + bh >= sh - 2)
        edge_penalty = 0.25 if touch >= 3 else (0.7 if touch == 2 else 1.0)
        score = (ratio_fit ** 4) * rectangularity * (area ** 0.4) * edge_penalty
        out.append((score, rect))
    return out


def _downscale(cv_img: np.ndarray, target: float = 900.0) -> tuple[np.ndarray, float]:
    """Return (small copy, scale) — segmentation runs on the small copy."""
    h_img, w_img = cv_img.shape[:2]
    scale = target / max(h_img, w_img) if max(h_img, w_img) > target else 1.0
    if scale == 1.0:
        return cv_img, 1.0
    return cv2.resize(cv_img, (int(w_img * scale), int(h_img * scale))), scale


def _build_masks(small: np.ndarray) -> list[np.ndarray]:
    """Several independent foreground segmentations of the same photo.

    No single strategy handles every background, so we run all of them and let
    the scoring decide. Shared by the single-card and the binder-page path.
    """
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    masks: list[np.ndarray] = []

    # Strategy 1: colourful (sat) OR dark (value) foreground.
    _, sat_mask = cv2.threshold(hsv[:, :, 1], 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    dark_mask = (hsv[:, :, 2] < 60).astype(np.uint8) * 255
    m1 = cv2.bitwise_or(sat_mask, dark_mask)
    masks.append(cv2.morphologyEx(m1, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8)))

    # Strategy 1b: a colourful card on an achromatic (gray / white) surface — the
    # card art is saturated, the background isn't. This isolates cards that fill
    # only PART of the frame, which the brightness/edge masks tend to merge into
    # the background (a real-world failure: a German card on a dotted cutting mat).
    sat_fixed = (hsv[:, :, 1] > 35).astype(np.uint8) * 255
    sat_fixed = cv2.morphologyEx(sat_fixed, cv2.MORPH_CLOSE, np.ones((35, 35), np.uint8))
    sat_fixed = cv2.morphologyEx(sat_fixed, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    masks.append(sat_fixed)

    # Strategy 2: Canny edges → dilate/close into solid card region.
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 30, 120)
    edges = cv2.dilate(edges, np.ones((5, 5), np.uint8), iterations=2)
    masks.append(cv2.morphologyEx(edges, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)))

    # Strategy 3: Otsu on gray (separates card from contrasting background).
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    for mm in (otsu, cv2.bitwise_not(otsu)):
        masks.append(cv2.morphologyEx(mm, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8)))

    # Strategy 4: adaptive threshold. Binder pockets sit under plastic that
    # brightens unevenly across the page, which defeats the global Otsu cut —
    # a local threshold still separates each pocket from its neighbours.
    adap = cv2.adaptiveThreshold(
        cv2.GaussianBlur(gray, (5, 5), 0), 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 8,
    )
    masks.append(cv2.morphologyEx(adap, cv2.MORPH_CLOSE, np.ones((11, 11), np.uint8)))
    return masks


def _warp_rect(cv_img: np.ndarray, rect, scale: float) -> np.ndarray | None:
    """Deskew one detected rectangle out of the full-resolution photo."""
    box = (cv2.boxPoints(rect).astype("float32")) / scale
    warped = _four_point_transform(cv_img, box)
    if warped is None or warped.size == 0:
        return None
    # Force portrait orientation (90° fix); 180° is handled by OCR.
    if warped.shape[1] > warped.shape[0]:
        warped = cv2.rotate(warped, cv2.ROTATE_90_CLOCKWISE)
    ht = warped.shape[0]
    ratio = warped.shape[1] / ht if ht else 0
    if not (_RATIO_MIN <= ratio <= _RATIO_MAX):
        return None
    return warped


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
    small, scale = _downscale(cv_img)
    area_full = float(small.shape[0] * small.shape[1])

    candidates: list[tuple] = []
    for mask in _build_masks(small):
        candidates.extend(_card_candidates(mask, area_full))
    if not candidates:
        return None

    return _warp_rect(cv_img, max(candidates, key=lambda x: x[0])[1], scale)


# ── Binder pages: many cards in one photo ─────────────────────────────────────

def _rect_bbox(rect) -> tuple[float, float, float, float]:
    pts = cv2.boxPoints(rect)
    return pts[:, 0].min(), pts[:, 1].min(), pts[:, 0].max(), pts[:, 1].max()


def _overlap(a: tuple, b: tuple) -> tuple[float, float]:
    """Return (IoU, containment) for two axis-aligned boxes.

    ``containment`` is the intersection over the *smaller* box, which catches
    nesting that IoU misses: a card's art window sits entirely inside the card
    but can score a low IoU purely because it is small.
    """
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    ix = max(0.0, min(ax1, bx1) - max(ax0, bx0))
    iy = max(0.0, min(ay1, by1) - max(ay0, by0))
    inter = ix * iy
    if inter <= 0:
        return 0.0, 0.0
    area_a = (ax1 - ax0) * (ay1 - ay0)
    area_b = (bx1 - bx0) * (by1 - by0)
    union = area_a + area_b - inter
    smaller = min(area_a, area_b)
    return (inter / union if union > 0 else 0.0,
            inter / smaller if smaller > 0 else 0.0)


def detect_card_regions(cv_img: np.ndarray, max_cards: int = 24) -> list[np.ndarray]:
    """Find *every* card in a photo — built for binder pages.

    The same masks and scoring as the single-card path, but instead of keeping
    only the winner we keep all non-overlapping card-shaped regions.

    Two heuristics do the heavy lifting, **in this order**:

    * **Uniform size, first.** Cards in a binder are all the same size in the
      photo, and each real card is reported by several of the segmentations —
      so the most frequently occurring size *is* the card size. Everything off
      that size is dropped before anything else happens.
    * **Non-maximum suppression, second.** The segmentations report the same
      rectangle repeatedly; identical finds are merged, keeping the
      highest-scoring version of each.

    The order matters and was found the hard way. Two adjacent cards regularly
    merge into one blob that scores *higher* than either card alone (it is
    bigger, and still roughly card-shaped). Running suppression first lets that
    blob evict both real cards, silently costing two cards per page. Filtering
    by size first removes the merged blob — and the whole-page blob — before
    they can suppress anything.

    Returns crops in reading order (top-left to bottom-right). An empty list
    means "no grid found" — the caller should fall back to single-card mode.
    """
    small, scale = _downscale(cv_img, 1100.0)   # a bit more detail than the 1-card path
    area_full = float(small.shape[0] * small.shape[1])

    candidates: list[tuple] = []
    for mask in _build_masks(small):
        candidates.extend(_card_candidates(mask, area_full, min_area_frac=0.012))
    if not candidates:
        return []

    # ── Keep only the dominant card size ─────────────────────────────────────
    # The mode, not the median: junk can outnumber cards in a single mask, but
    # no junk size repeats as consistently across all five segmentations as the
    # cards do. Needs a decent sample to be meaningful, hence the count check.
    if len(candidates) >= 6:
        areas = [c[1][1][0] * c[1][1][1] for c in candidates]
        counts = [
            (a, sum(1 for b in areas if a / 1.35 <= b <= a * 1.35))
            for a in areas if a > 0
        ]
        best_area = 0.0
        if counts:
            top = max(n for _, n in counts)
            # Of the sizes that repeat about as often as the most common one,
            # take the LARGEST. A card's inner art window repeats exactly as
            # reliably as the card outline around it — picking the plain mode
            # therefore locks onto the art and returns two boxes per card.
            # The outline is always the bigger of the two.
            best_area = max(a for a, n in counts if n >= 0.5 * top)
        if best_area > 0:
            candidates = [
                c for c in candidates
                if best_area / 1.5 <= c[1][1][0] * c[1][1][1] <= best_area * 1.5
            ]
    if not candidates:
        return []

    # ── Non-maximum suppression over what's left ─────────────────────────────
    candidates.sort(key=lambda x: x[0], reverse=True)
    kept: list[tuple] = []          # (score, rect, bbox)
    for score, rect in candidates:
        bbox = _rect_bbox(rect)
        clash = False
        for k in kept:
            iou, contained = _overlap(bbox, k[2])
            if iou > 0.25 or contained > 0.6:
                clash = True
                break
        if clash:
            continue
        kept.append((score, rect, bbox))
        if len(kept) >= max_cards:
            break
    if not kept:
        return []

    # ── Reading order: group into rows, then left to right within each row ───
    heights = sorted(k[2][3] - k[2][1] for k in kept)
    row_tol = heights[len(heights) // 2] * 0.5
    kept.sort(key=lambda k: (k[2][1] + k[2][3]) / 2)      # by vertical centre
    rows: list[list[tuple]] = []
    for k in kept:
        cy = (k[2][1] + k[2][3]) / 2
        if rows and abs(cy - rows[-1][0][3]) <= row_tol:
            rows[-1].append(k + (cy,))
        else:
            rows.append([k + (cy,)])
    ordered = [k for row in rows for k in sorted(row, key=lambda k: k[2][0])]

    out: list[np.ndarray] = []
    for k in ordered[:max_cards]:
        warped = _warp_rect(cv_img, k[1], scale)
        if warped is not None:
            out.append(warped)
    return out


def preprocess_multi(image_bytes: bytes, max_cards: int = 24) -> list[np.ndarray]:
    """Split one uploaded photo into one deskewed image per card found.

    Always returns at least one image: if no grid is detected, the result is the
    single-card preprocessing, so callers never need a special case for
    "ordinary photo of one card".
    """
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img = _normalize(img)
    cv_img = _pil_to_cv(img)

    regions = detect_card_regions(cv_img, max_cards=max_cards)
    if len(regions) >= 2:
        return regions

    single = _auto_crop_card(cv_img)
    return [single if single is not None else cv_img]


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


def to_pil(cv_arr: np.ndarray) -> Image.Image:
    """Public wrapper — callers holding a detected crop need it as PIL to save."""
    return _cv_to_pil(cv_arr)


def save_image(img: Image.Image, filename: str) -> str:
    dest = UPLOAD_DIR / filename
    img.save(dest, format="JPEG", quality=90)
    return str(dest)


def get_name_region(cv_img: np.ndarray) -> np.ndarray:
    """Return the top 15% of the card image where the name text lives."""
    h = cv_img.shape[0]
    return cv_img[: int(h * 0.15), :]
