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
# Collector numbers and set totals are 1–3 digits (1–999). We deliberately do NOT
# anchor with \b: real cards print the regulation mark / year right next to the
# "NNN/TTT", and OCR often merges them (e.g. "052/19707", "052/1972 2023"). A
# \b-anchored, up-to-4-digit pattern rejected those outright — the #1 reason a
# modern card with a perfectly readable number failed to identify. Capturing the
# 1–3 digits immediately around the slash grabs the right value despite the noise;
# _vote's range/ratio checks + multi-read voting reject the rare false positive.
_NUM_RE = re.compile(r"(\d{1,3})\s*/\s*(\d{1,3})")
_SET_NUM_RE = re.compile(
    r"([A-Z][A-Z0-9]{1,5})\s*[\-\s]?\s*(\d{1,3})\s*/\s*(\d{1,3})", re.IGNORECASE
)
_SET_NUM_NOSLASH_RE = re.compile(r"\b([A-Z]{2,5})\s+(\d{1,3})\b", re.IGNORECASE)

# Char whitelist for digit-focused collector-number reads.
_NUM_WHITELIST = "0123456789/"


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


def _prep(crop: np.ndarray, target_w: int = 1400) -> tuple[np.ndarray, np.ndarray]:
    """Return (gray, otsu_binary) for a crop, resized to ~``target_w`` px wide.

    We bound the working width instead of blindly multiplying resolution: a
    high-res phone scan upscaled 3× produced a ~4600 px strip that cost ~3 s per
    Tesseract call. Normalising to a fixed width keeps OCR fast and is plenty for
    the small bottom text — while tiny webcam crops are still upscaled (capped at
    3×) so low-res frames stay readable. We avoid heavy denoising, which smears the
    tiny collector-number digits. Otsu handles clean text; plain gray covers
    low-contrast / stylised fonts."""
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    if w:
        scale = min(target_w / w, 3.0)
        if abs(scale - 1.0) > 0.05:
            interp = cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC
            gray = cv2.resize(
                gray, (max(1, round(w * scale)), max(1, round(h * scale))),
                interpolation=interp,
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
    """Cheap OCR of the full bottom strip, escalating only as needed.

    The collector number + printed total ("052/197") is the reliable, easy-to-read
    signal (the 3-letter set code often mis-reads). A single Otsu + psm 6 pass
    reads it on the vast majority of modern cards, so we try that first and return
    immediately once we have both number and total — most cards cost ONE Tesseract
    call. Only when that's inconclusive do we add psm 11 and the grayscale variant
    (for low-contrast / stylised fonts)."""
    h = cv_img.shape[0]
    strip = cv_img[int(h * 0.87):, :]
    if strip.size == 0:
        return []
    gray, otsu = _prep(strip, target_w=1500)

    texts = [_ocr(otsu, lang="eng", psm=6)]
    _, n, t = _vote(texts)
    if n and t:
        return texts

    # Digit-focused pass: whitelisting digits+slash reads "NNN/TTT" far more
    # cleanly when letters/symbols (regulation mark, year) crowd the number.
    texts.append(_ocr(otsu, lang="eng", psm=6, whitelist=_NUM_WHITELIST))
    texts.append(_ocr(otsu, lang="eng", psm=11))
    _, n, t = _vote(texts)
    if n and t:
        return texts

    texts.append(_ocr(gray, lang="eng", psm=11, whitelist=_NUM_WHITELIST))
    texts.append(_ocr(gray, lang="eng", psm=6))
    return texts


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
    """Expensive last-resort fan-out — only when the cheap pass found no number.

    Runs at higher resolution than the cheap pass (small/blurry numbers need it)
    over a taller strip and both corners, mixing general reads with digit-focused
    (whitelisted) reads that pull "NNN/TTT" out of crowded print."""
    h, w = cv_img.shape[:2]
    texts: list[str] = []
    for region in (
        cv_img[int(h * 0.82):, : int(w * 0.55)],   # bottom-left (modern number)
        cv_img[int(h * 0.82):, int(w * 0.45):],    # bottom-right (older layout)
        cv_img[int(h * 0.82):, :],                  # full bottom (context)
    ):
        if region.size == 0:
            continue
        g, o = _prep(region, target_w=1800)
        for im in (o, g):
            texts.append(_ocr(im, lang="eng", psm=6, whitelist=_NUM_WHITELIST))
            texts.append(_ocr(im, lang="eng", psm=11))
    return texts


def _resolve_bottom(
    texts: list[str], cv_img: np.ndarray, do_fanout: bool = True,
) -> tuple[str | None, str | None, str | None]:
    """Vote on the given OCR texts; optionally add the corner fan-out and revote.

    A collector number alone is enough to identify the card downstream (via
    number+total lookup), so we don't insist on also reading the flaky set code."""
    code, number, total = _vote(texts)
    if number:
        return code, number, total

    if do_fanout:
        texts = texts + _fanout_bottom_texts(cv_img)
        code, number, total = _vote(texts)
        if number:
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

    # 1) Cheap probe — often a single OCR call. A readable collector number is
    #    enough: the card is identified downstream via number(+total). We no longer
    #    require the set code here — it mis-reads often, and requiring it used to
    #    force the expensive corner fan-out on nearly every card (~20 s).
    up_texts = list(_cheap_bottom_texts(cv_img))
    c, n, t = _vote(up_texts)
    if n:
        return c, n, t, cv_img

    # 2) No number upright → the auto-crop may have left the card upside-down.
    #    Probe the flipped orientation cheaply.
    fl_texts = list(_cheap_bottom_texts(flipped))
    c2, n2, t2 = _vote(fl_texts)
    if n2:
        return c2, n2, t2, flipped

    # 3) Neither orientation yielded a number → expensive corner fan-out ONCE.
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
    gray, otsu = _prep(region, target_w=1200)
    for im in (otsu, gray):
        for psm in (7, 11):
            name = _clean_name(_ocr(im, lang=NAME_LANGS, psm=psm))
            if name:
                candidates.append(name)
                # Early exit: a token matching a known Pokémon name is conclusive.
                if any(tok.lower() in known for tok in name.split()):
                    return _best_name(candidates)
    return _best_name(candidates)
