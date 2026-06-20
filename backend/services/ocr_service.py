"""
OCR for Pokémon cards.

Two independent extractors are exposed:

* ``extract_set_and_number`` – reads the printed set abbreviation + collector
  number from the bottom of the card (e.g. ``"PAF 018/091"``).  This is the
  **most reliable** identifier and, crucially, it is *language independent*:
  a German "Glurak" and an English "Charizard" share the exact same set code
  and number, so this path identifies foreign-language cards perfectly.

* ``extract_card_name`` – reads the card name from the top region.  Used as a
  fallback.  Runs Tesseract with the German **and** English models so umlauts
  and German names ("Glurak", "Bisaflor", …) are recognised; the result is then
  translated to English upstream before hitting the (English-only) TCG API.

Performance: each Tesseract call costs ~0.5–1 s, so we OCR a single upscaled
crop first and only fan out to extra crops / page-seg modes when the cheap pass
fails (early exit).
"""

import os
import re
from collections import Counter
from pathlib import Path

import cv2
import numpy as np

# Known printed set codes (PAF, SVI, MEW, …) used to validate OCR'd codes.
try:
    from services.set_code_map import SET_CODE_MAP
    _KNOWN_CODES = set(SET_CODE_MAP.keys())
except Exception:  # pragma: no cover - import-order safety
    _KNOWN_CODES = set()

try:
    import pytesseract

    _TESS_CMD = os.getenv(
        "TESSERACT_CMD", r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    )
    if os.path.exists(_TESS_CMD):
        pytesseract.pytesseract.tesseract_cmd = _TESS_CMD
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False

# Project-local tessdata bundles the eng + deu models so the app works without
# touching the system Tesseract install (no admin rights). Overridable.
_DEFAULT_TESSDATA = Path(__file__).resolve().parent.parent / "tessdata"
TESSDATA_DIR = os.getenv("TESSDATA_DIR", str(_DEFAULT_TESSDATA))

# Languages for the *name* OCR. German first so German glyphs win; English too.
NAME_LANGS = os.getenv("OCR_NAME_LANGS", "deu+eng")

# ── Regex patterns ────────────────────────────────────────────────────────────
_NUM_RE = re.compile(r"\b(\d{1,4})\s*/\s*(\d{1,4})\b")
_SET_NUM_RE = re.compile(
    r"\b([A-Z][A-Z0-9]{1,5})\s*[\-\s]?\s*(\d{1,4})\s*/\s*(\d{1,4})\b", re.IGNORECASE
)
_SET_NUM_NOSLASH_RE = re.compile(r"\b([A-Z]{2,5})\s+(\d{1,4})\b", re.IGNORECASE)


# ── Tesseract helpers ─────────────────────────────────────────────────────────

def _tessdata_arg() -> str:
    if TESSDATA_DIR and os.path.isdir(TESSDATA_DIR):
        return f'--tessdata-dir "{TESSDATA_DIR}" '
    return ""


def _ocr(crop: np.ndarray, *, lang: str, psm: int, whitelist: str | None = None) -> str:
    config = f"{_tessdata_arg()}--oem 3 --psm {psm}"
    if whitelist is not None:
        config += f" -c tessedit_char_whitelist={whitelist}"
    try:
        return pytesseract.image_to_string(crop, lang=lang, config=config)
    except pytesseract.TesseractError:
        try:
            return pytesseract.image_to_string(crop, lang="eng", config=config)
        except Exception:
            return ""
    except Exception:
        return ""


def _prep(crop: np.ndarray, scale: int = 3) -> tuple[np.ndarray, np.ndarray]:
    """Return (upscaled_gray, otsu_binary) for a crop. We deliberately avoid
    heavy denoising before upscaling — it smears the tiny collector-number digits
    and tanks accuracy. These two variants cover the vast majority of cards
    (Otsu for clean text, plain gray for low-contrast / stylised fonts)."""
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(
        gray, (gray.shape[1] * scale, gray.shape[0] * scale),
        interpolation=cv2.INTER_CUBIC,
    )
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return gray, otsu


def _strip_zeros(num_raw: str) -> str:
    return str(int(num_raw)) if num_raw.isdigit() else num_raw


# ── Set code + collector number ───────────────────────────────────────────────

def _vote(texts: list[str]) -> tuple[str | None, str | None, str | None]:
    """From OCR snippets, extract the most-voted known set code, collector
    number and set total. Returns (code, number, total)."""
    code_votes: Counter[str] = Counter()
    number_votes: Counter[tuple[str, str | None]] = Counter()
    for raw in texts:
        up = raw.upper()
        for m in _NUM_RE.finditer(up):
            num, total = m.group(1), m.group(2)
            if not num.isdigit() or not total.isdigit():
                continue
            ni, ti = int(num), int(total)
            # Pokémon collector numbers/totals are at most 3 digits (1–999);
            # a 4-digit value is always an OCR artifact (e.g. "7078/917").
            if not (1 <= ni <= 999) or not (1 <= ti <= 999):
                continue
            # Collector number can exceed the total only modestly (secret rares,
            # e.g. 198/091). A number many times the total is bogus.
            if ni > ti * 4:
                continue
            number_votes[(_strip_zeros(num), _strip_zeros(total))] += 1
        for token in re.findall(r"[A-Z]{2,6}", up):
            if token in _KNOWN_CODES:
                code_votes[token] += 1
        for m in _SET_NUM_RE.finditer(up):
            tok = m.group(1).upper()
            if tok in _KNOWN_CODES:
                code_votes[tok] += 2  # contiguous "CODE NNN/TTT" = high signal
    best_code = code_votes.most_common(1)[0][0] if code_votes else None
    if number_votes:
        best_number, best_total = number_votes.most_common(1)[0][0]
    else:
        best_number, best_total = None, None
    return best_code, best_number, best_total


def _cheap_bottom_texts(cv_img: np.ndarray) -> list[str]:
    """Two cheap OCR reads of the full bottom strip (psm 11). Catches the
    majority of cards in ~1 s."""
    h = cv_img.shape[0]
    strip = cv_img[int(h * 0.87):, :]
    if strip.size == 0:
        return []
    gray, otsu = _prep(strip, scale=3)
    return [_ocr(gray, lang="eng", psm=11), _ocr(otsu, lang="eng", psm=11)]


def _cheap_bottom(cv_img: np.ndarray) -> tuple[str | None, str | None, str | None]:
    """Cheap-pass set/number read (no expensive corner fan-out)."""
    return _vote(_cheap_bottom_texts(cv_img))


def extract_set_and_number(
    cv_img: np.ndarray,
) -> tuple[str | None, str | None, str | None]:
    """
    Read the printed set abbreviation, collector number and set total from the
    bottom of the card.  Language independent.  Returns
    ``(set_abbreviation, card_number, set_total)`` (any element may be ``None``).

    Code and number are extracted *independently* and combined (the print often
    separates them with the illustrator name / regulation mark), validating the
    code against the known set-code map — far more robust than requiring
    "CODE NNN/TTT" to be contiguous.
    """
    if not TESSERACT_AVAILABLE:
        return None, None, None
    return _resolve_bottom(list(_cheap_bottom_texts(cv_img)), cv_img)


def _fanout_bottom_texts(cv_img: np.ndarray) -> list[str]:
    """Expensive corner fan-out (psm 11 + 6 on both bottom corners). ~8 OCR
    calls — only run when the cheap pass failed."""
    h, w = cv_img.shape[:2]
    texts: list[str] = []
    for region in (
        cv_img[int(h * 0.87):, : int(w * 0.5)],   # bottom-left
        cv_img[int(h * 0.87):, int(w * 0.5):],    # bottom-right
    ):
        if region.size == 0:
            continue
        g, o = _prep(region, scale=4)
        for im in (o, g):
            for psm in (11, 6):
                texts.append(_ocr(im, lang="eng", psm=psm))
    return texts


def _resolve_bottom(
    texts: list[str], cv_img: np.ndarray, do_fanout: bool = True,
) -> tuple[str | None, str | None, str | None]:
    """Vote on the given OCR texts; optionally add the corner fan-out and revote."""
    code, number, total = _vote(texts)
    if code and number:
        return code, number, total

    if do_fanout:
        texts = texts + _fanout_bottom_texts(cv_img)
        code, number, total = _vote(texts)
        if code and number:
            return code, number, total

    # Fallback: "CODE NNN" without slash, code validated.
    if not code:
        for raw in texts:
            for m in _SET_NUM_NOSLASH_RE.finditer(raw.upper()):
                tok = m.group(1).upper()
                if tok in _KNOWN_CODES:
                    code = tok
                    break
            if code:
                break
    return (code or None), (number or None), (total or None)


def read_card_bottom(
    cv_img: np.ndarray,
) -> tuple[str | None, str | None, str | None, np.ndarray]:
    """
    Orientation-robust bottom read. The auto-crop may leave a card upside-down,
    so we cheaply probe both orientations first, then run the expensive corner
    fan-out at most **once**, on the more promising orientation. Returns
    ``(code, number, total, correctly_oriented_image)`` — the returned image is
    flipped to the orientation that produced a hit, so downstream name OCR and
    perceptual hashing operate on an upright card.
    """
    if not TESSERACT_AVAILABLE:
        return None, None, None, cv_img

    flipped = cv2.rotate(cv_img, cv2.ROTATE_180)

    # 1) Cheap probe of both orientations (≈4 OCR calls). Catches most cards.
    up_texts = list(_cheap_bottom_texts(cv_img))
    c, n, t = _vote(up_texts)
    if c and n:
        return c, n, t, cv_img

    fl_texts = list(_cheap_bottom_texts(flipped))
    c2, n2, t2 = _vote(fl_texts)
    if c2 and n2:
        return c2, n2, t2, flipped

    # 2) Cheap pass failed both ways → run the expensive fan-out ONCE on the
    #    orientation that at least yielded a collector number (else original).
    if n2 and not n:
        c2, n2, t2 = _resolve_bottom(fl_texts, flipped)
        return c2, n2, t2, flipped

    c, n, t = _resolve_bottom(up_texts, cv_img)
    return c, n, t, cv_img


# ── Card name ─────────────────────────────────────────────────────────────────

_NAME_STOPWORDS = {
    "hp", "kp", "stage", "basic", "stufe", "basis", "ex", "gx", "v", "vmax",
    "vstar", "pokemon", "pokémon", "trainer", "energy", "energie", "item",
    "supporter", "ability", "fähigkeit",
}

_KNOWN_NAMES: set[str] | None = None


def _known_names() -> set[str]:
    global _KNOWN_NAMES
    if _KNOWN_NAMES is None:
        names: set[str] = set()
        try:
            from services.tcg_api_service import GERMAN_TO_EN
            for de, en in GERMAN_TO_EN.items():
                names.add(de.lower())
                names.add(en.lower())
        except Exception:
            pass
        _KNOWN_NAMES = names
    return _KNOWN_NAMES


def _clean_name(raw: str) -> str:
    cleaned = re.sub(r"[^A-Za-zÄÖÜäöüß'.\- ]", " ", raw)
    words = []
    for w in cleaned.split():
        stripped = w.strip(".'-")
        if len(stripped) < 2 or stripped.lower() in _NAME_STOPWORDS:
            continue
        words.append(stripped)
    result = re.sub(r"\s+", " ", " ".join(words)).strip(" -")
    return result if len(result) > 1 else ""


def _best_name(candidates: list[str]) -> str:
    if not candidates:
        return ""
    known = _known_names()
    for cand in candidates:                       # strongest: known Pokémon name
        for token in cand.split():
            if token.lower() in known:
                return token
    tokens = [t for cand in candidates for t in cand.split() if len(t) >= 4]
    if tokens:                                    # else: longest readable word
        return max(tokens, key=len)
    return Counter(candidates).most_common(1)[0][0]


def extract_card_name(cv_img: np.ndarray) -> str:
    """Best-effort card-name OCR from the title area (fallback path)."""
    if not TESSERACT_AVAILABLE:
        return ""

    h, w = cv_img.shape[:2]
    region = cv_img[int(h * 0.03):int(h * 0.16), int(w * 0.04):int(w * 0.78)]
    if region.size == 0:
        return ""

    known = _known_names()
    candidates: list[str] = []
    gray, otsu = _prep(region, scale=3)
    for im in (otsu, gray):
        for psm in (7, 11):
            name = _clean_name(_ocr(im, lang=NAME_LANGS, psm=psm))
            if name:
                candidates.append(name)
                # Early exit: a token matching a known Pokémon name is conclusive.
                if any(tok.lower() in known for tok in name.split()):
                    return _best_name(candidates)
    return _best_name(candidates)
