import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from models import Card, CardHashIndex, User
from services import (
    auth_service,
    cardmarket_service,
    export_service,
    hash_service,
    image_service,
    ocr_service,
    plan_service,
    sale_photo_service,
    set_code_map,
    tcg_api_service,
)

router = APIRouter(prefix="/api/cards", tags=["cards"])

# Hamming distance threshold for "good enough" hash match (≥ 84 % similarity)
HASH_GOOD_MATCH = 10


# ── Helpers ───────────────────────────────────────────────────────────────────

def _set_total_plausible(card_detail: dict, ocr_total: Optional[str]) -> bool:
    """
    Check whether an OCR'd set total (the "/197" part of "021/197") is consistent
    with the set the matched card actually belongs to.

    Guards against a misread short set code (e.g. "RR") that happens to be a valid
    set with the same collector number. A small OCR error in the total is
    tolerated; a gross mismatch (different set size) rejects the code match.
    """
    if not ocr_total or not str(ocr_total).isdigit():
        return True  # nothing to check against
    ot = int(ocr_total)
    set_data = card_detail.get("set") or {}
    for key in ("printedTotal", "total"):
        v = set_data.get(key)
        if isinstance(v, int) and abs(v - ot) <= max(5, round(v * 0.05)):
            return True
    return False


# ── Schemas ───────────────────────────────────────────────────────────────────

class CardConfirm(BaseModel):
    tcg_card_id: str
    name: str
    set_name: Optional[str] = None
    set_code: Optional[str] = None
    rarity: Optional[str] = None
    card_type: Optional[str] = None
    hp: Optional[str] = None
    image_url: Optional[str] = None
    condition: str = "Near Mint"
    quantity: int = 1
    notes: Optional[str] = None
    is_foil: bool = False
    for_trade: bool = False
    language: str = "EN"
    # CM fields optionally sent from the frontend when user picks a CM result
    cm_product_id: Optional[int] = None
    # Scan photos kept as the card's own front/back pictures for the eBay listing.
    scan_front_path: Optional[str] = None
    scan_back_path: Optional[str] = None


class CardUpdate(BaseModel):
    condition: Optional[str] = None
    quantity: Optional[int] = None
    notes: Optional[str] = None
    is_foil: Optional[bool] = None
    for_trade: Optional[bool] = None
    language: Optional[str] = None


class BulkUpdate(BaseModel):
    ids: list[int]
    for_trade: Optional[bool] = None
    condition: Optional[str] = None


class BulkDelete(BaseModel):
    ids: list[int]


# ── Sets ──────────────────────────────────────────────────────────────────────

@router.get("/sets")
async def list_sets(
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """Return all TCG API sets for the set-filter dropdown (cached 24 h)."""
    sets = await tcg_api_service.list_sets(db)
    return {"sets": sets}


@router.get("/sets-owned")
def list_owned_sets(
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """Return distinct set names present in the user's collection."""
    from sqlalchemy import distinct as sa_distinct
    rows = (
        db.query(Card.set_name, Card.set_code)
        .filter(Card.user_id == user.id, Card.set_name.isnot(None))
        .distinct()
        .order_by(Card.set_name)
        .all()
    )
    return [{"name": r[0], "code": r[1]} for r in rows if r[0]]


@router.get("/collection-ids")
def get_collection_ids(
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """Compact tcg_card_id → quantity map for client-side duplicate detection."""
    rows = (
        db.query(Card.id, Card.tcg_card_id, Card.quantity)
        .filter(Card.user_id == user.id, Card.tcg_card_id.isnot(None))
        .all()
    )
    return [{"card_id": r[0], "tcg_card_id": r[1], "quantity": r[2]} for r in rows]


# ── Upload & identification pipeline ─────────────────────────────────────────

@router.post("/upload")
async def upload_cards(
    files: list[UploadFile] = File(...),
    set_code: Optional[str] = Form(None),
    pairs: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    if len(files) > 50:
        raise HTTPException(status_code=400, detail="Maximum 50 files per upload")

    results = []
    for idx, file in enumerate(files):
        # "2er-Pack" mode: files arrive as [front, back, front, back, …]. Even
        # indexes are fronts (identified below); odd indexes are backs — we just
        # crop+store them and attach the path to the preceding front's result so
        # confirm() can keep it as the card's back photo.
        if pairs and idx % 2 == 1:
            try:
                pil_b, _ = image_service.preprocess_card_image(await file.read())
                bname = f"tmp_{uuid.uuid4().hex}.jpg"
                bpath = image_service.save_image(pil_b, bname)
                if results:
                    results[-1]["back_local_path"] = bpath
            except Exception:
                pass
            continue

        # Accept by MIME type OR by image file extension — browsers often send
        # an empty/odd content-type for .heic (iPhone) photos.
        fname = (file.filename or "").lower()
        is_image = (
            (file.content_type or "").startswith("image/")
            or fname.endswith((
                ".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".bmp", ".tiff",
            ))
        )
        if not is_image:
            results.append({"filename": file.filename, "error": "Not an image file"})
            continue

        raw_bytes = await file.read()
        try:
            pil_img, cv_img = image_service.preprocess_card_image(raw_bytes)
        except Exception as exc:
            results.append({"filename": file.filename, "error": f"Image processing failed: {exc}"})
            continue

        # Save preprocessed thumbnail regardless of match outcome
        temp_filename = f"tmp_{uuid.uuid4().hex}.jpg"
        local_path = image_service.save_image(pil_img, temp_filename)
        thumbnail_url = f"/uploads/{temp_filename}"

        candidates: list[dict] = []
        ocr_name: str = ""
        ocr_name_raw: str = ""    # raw (possibly non-EN) OCR result
        detected_language: str = "EN"
        identification_method: str = "none"
        identified_early: bool = False  # True when set+number gave a direct hit

        # ── Step 0: read the bottom set code + collector number ───────────
        # Modern cards print e.g. "PAF 018/091" at the bottom-left. This is the
        # most reliable, language-independent identifier. read_card_bottom also
        # corrects 180° orientation, so cv_img below is upright.
        set_abbr = card_num = set_total = None
        try:
            set_abbr, card_num, set_total, cv_img = ocr_service.read_card_bottom(cv_img)
        except Exception:
            pass

        # 0a: exact set code + number → direct TCG ID.
        code_card = None
        code_total_ok = True
        if set_abbr and card_num:
            try:
                tcg_id = set_code_map.lookup_tcg_id(set_abbr, card_num)
                if tcg_id:
                    code_card = await tcg_api_service.get_card_by_id(tcg_id, db)
                    if code_card:
                        code_total_ok = _set_total_plausible(code_card, set_total)
            except Exception:
                code_card = None

        if code_card and code_total_ok:
            # Set code, number and printed total all agree → high confidence.
            candidates.append({**code_card, "_source": "set_number"})
            identification_method = "set_number"
            identified_early = True

        # 0b: number (+ set total) API lookup. Runs when the code path wasn't a
        # confident hit, OR when the code's set total contradicts the OCR'd total
        # — a misread short code (e.g. "RR") can coincidentally be a valid set, so
        # we trust the large, easy-to-read "NNN/TTT" more and surface BOTH options
        # (total-consistent match first) for the user to confirm.
        if not identified_early and card_num:
            try:
                # The collector number + printed total is a near-unique key, so on
                # this fast path we skip the (multi-pass, bilingual) name OCR and
                # only fall back to it when there's no total to disambiguate.
                if not set_total:
                    ocr_name_raw = ocr_service.extract_card_name(cv_img) or ""
                num_matches = await tcg_api_service.find_by_number_total(
                    card_num, set_total, db, ocr_name_raw or None
                )
                seen = {x.get("id") for x in candidates}
                for c in num_matches[:5]:
                    if c.get("id") not in seen:
                        candidates.append(c)
                        seen.add(c.get("id"))
                # Keep the less-trusted code-based card as a secondary option.
                if code_card and code_card.get("id") not in seen:
                    candidates.append({**code_card, "_source": "set_number"})
                if candidates:
                    identification_method = "number_total"
            except Exception:
                pass

        # If the number lookup found nothing, fall back to the code-based card
        # so a readable code still identifies the card (no regression).
        if not identified_early and not candidates and code_card:
            candidates.append({**code_card, "_source": "set_number"})
            identification_method = "set_number"

        # ── Step 1: perceptual hash match ─────────────────────────────────
        # Pure identification fallback — skip the DCT entirely when the set number
        # already gave a confident hit (it's otherwise computed and thrown away).
        hash_match, hamming = None, hash_service.MAX_BITS + 1

        if not identified_early:
            phash = hash_service.compute_phash(cv_img)
            if phash:
                hash_match, hamming = hash_service.find_best_match(phash, db)

            if hash_match and hamming <= HASH_GOOD_MATCH:
                candidates.append(hash_match)
                identification_method = "phash"

        # ── Step 2: OCR (fallback or additional candidates) ───────────────
        if not identified_early and not ocr_name_raw and (
            not candidates or (hamming is not None and hamming > HASH_GOOD_MATCH)
        ):
            ocr_name_raw = ocr_service.extract_card_name(cv_img)
            if ocr_name_raw and identification_method == "none":
                identification_method = "ocr"

        if ocr_name_raw:
            # Detect language from OCR text; translate to English for API search
            if tcg_api_service.is_likely_german(ocr_name_raw):
                detected_language = "DE"
                ocr_name = tcg_api_service.translate_to_english(ocr_name_raw)
            else:
                ocr_name = ocr_name_raw

            try:
                raw, _ = await tcg_api_service.search_cards(ocr_name, set_code, db)
                ranked = tcg_api_service.rank_candidates(ocr_name, raw)
                existing_ids = {c["id"] for c in candidates}
                for c in ranked:
                    if c["id"] not in existing_ids:
                        candidates.append(c)
            except Exception:
                pass

        # ── Step 3: language variants ─────────────────────────────────────
        # Deliberately NOT fetched here — it costs an extra (large) API round-trip
        # on every scan for a panel that's collapsed by default. The frontend loads
        # it lazily via GET /cards/scan/variants once the result is on screen, so
        # the scan response stays fast.
        results.append({
            "filename": file.filename,
            "ocr_name": ocr_name_raw,           # raw OCR (shown in UI subtitle)
            "ocr_name_translated": ocr_name,    # English name used for search
            "detected_language": detected_language,
            "local_image_path": local_path,
            "thumbnail_url": thumbnail_url,
            "identification_method": identification_method,
            "candidates": candidates[:5],
            "language_variants": [],   # loaded lazily; see /cards/scan/variants
            # Lightweight scan diagnostics, surfaced in the ConfirmModal when no
            # candidates are found — lets us see what the OCR actually read in
            # production (crop size, set code, collector number/total).
            "debug": {
                "code": set_abbr,
                "number": card_num,
                "total": set_total,
                "crop": f"{cv_img.shape[1]}x{cv_img.shape[0]}",
                "method": identification_method,
                "n_candidates": len(candidates),
            },
        })

    return {"results": results}


# ── Manual search (multilingual) ──────────────────────────────────────────────

@router.post("/search")
async def manual_search(
    query: str = Query(...),
    set_code: Optional[str] = Query(None),
    language: str = Query("EN"),
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """
    Search for cards.
    - EN: TCG API only.
    - DE/FR/IT/ES: Cardmarket (primary) + TCG API (secondary), merged.
    Returns {candidates, has_more, cm_available}.
    """
    lang = language.upper()

    tcg_results: list[dict] = []
    tcg_has_more = False
    cm_results: list[dict] = []
    cm_has_more = False

    # Always search TCG API (provides canonical IDs and EN data)
    try:
        tcg_raw, tcg_has_more = await tcg_api_service.search_cards(query, set_code, db, page)
        tcg_results = tcg_api_service.rank_candidates(query, tcg_raw)
    except Exception:
        pass

    # Cardmarket for non-EN when credentials are configured
    if lang != "EN" and cardmarket_service.cm_available():
        try:
            cm_results, cm_has_more = cardmarket_service.search_products(query, lang, db, page)
        except Exception:
            pass

    # Merge: CM first for non-EN, TCG API first for EN
    if lang == "EN":
        candidates = tcg_results + cm_results
    else:
        candidates = cm_results + tcg_results

    return {
        "candidates": candidates,
        "has_more": tcg_has_more or cm_has_more,
        "cm_available": cardmarket_service.cm_available(),
    }


# ── Lazy language variants for a scan candidate ───────────────────────────────

@router.get("/scan/variants")
async def get_scan_variants(
    tcg_card_id: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """Other printings of the same Pokémon for a *scan* candidate (not yet saved).

    Kept off the upload hot path so a scan returns fast; the ConfirmModal fetches
    this in the background once the match is on screen.
    """
    if not tcg_card_id or tcg_card_id.startswith("cm-"):
        return {"variants": []}
    try:
        data = await tcg_api_service.get_card_by_id(tcg_card_id, db)
    except Exception:
        return {"variants": []}
    dex_nums = (data or {}).get("nationalPokedexNumbers") or []
    if not dex_nums:
        return {"variants": []}
    variants = await tcg_api_service.get_national_dex_variants(tcg_card_id, dex_nums, db)
    return {"variants": variants}


# ── Confirm & save ────────────────────────────────────────────────────────────

@router.post("/confirm")
async def confirm_card(
    payload: CardConfirm,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    # Enforce the plan's card limit (free tier).
    if not plan_service.can_add_card(db, user):
        limit = plan_service.card_limit(user)
        raise HTTPException(
            status_code=402,
            detail=f"You've reached your plan's limit of {limit} cards. "
                   "Upgrade to Pro for an unlimited collection.",
        )

    # Skip hash-indexing for Cardmarket-only results (they lack TCG image URLs)
    is_cm_only = payload.tcg_card_id.startswith("cm-")

    price_data: dict = {}
    card_detail: Optional[dict] = None
    if not is_cm_only:
        try:
            card_detail = await tcg_api_service.get_card_by_id(payload.tcg_card_id, db)
            if card_detail:
                price_data = tcg_api_service.extract_price(card_detail)
        except Exception:
            pass

    # Store the name in the card's own language (TCG API is English-only, so a
    # German card's "Arboliva" becomes "Olithena"). This propagates to the
    # collection view and the eBay listing title.
    name = payload.name
    if payload.language and payload.language.upper() != "EN":
        try:
            dex = (card_detail or {}).get("nationalPokedexNumbers")
            name = await tcg_api_service.localize_card_name(
                payload.name, dex, payload.language, db
            )
        except Exception:
            name = payload.name

    # Cardmarket prices from dedicated CM API (if product ID known)
    cm_prices: dict = {}
    cm_product_id = payload.cm_product_id
    if cm_product_id:
        try:
            cm_prices = cardmarket_service.get_product_prices(cm_product_id, db)
        except Exception:
            pass

    card = Card(
        user_id=user.id,
        tcg_card_id=payload.tcg_card_id,
        name=name,
        set_name=payload.set_name,
        set_code=payload.set_code,
        rarity=payload.rarity,
        card_type=payload.card_type,
        hp=payload.hp,
        image_url=payload.image_url,
        condition=payload.condition,
        quantity=payload.quantity,
        notes=payload.notes,
        is_foil=payload.is_foil,
        for_trade=payload.for_trade,
        language=payload.language,
        # USD (TCGPlayer)
        market_price_usd=price_data.get("market"),
        price_low_usd=price_data.get("low"),
        price_mid_usd=price_data.get("mid"),
        price_high_usd=price_data.get("high"),
        # EUR (Cardmarket via TCG API embed, or from CM API)
        cm_product_id=cm_product_id or cm_prices.get("cm_product_id"),
        market_price_eur=(
            cm_prices.get("sell_eur")
            or cm_prices.get("avg_eur")
            or price_data.get("market_eur")
        ),
        price_low_eur=cm_prices.get("low_eur") or price_data.get("low_eur"),
        price_trend_eur=cm_prices.get("trend_eur") or price_data.get("trend_eur"),
        price_updated_at=datetime.utcnow() if (price_data or cm_prices) else None,
        # Keep the seller's own scan photo(s) for the eBay listing.
        photo_front=sale_photo_service.adopt_scan_image(payload.scan_front_path),
        photo_back=sale_photo_service.adopt_scan_image(payload.scan_back_path),
    )
    db.add(card)
    db.commit()
    db.refresh(card)

    # Background: index the card's phash for future visual matching
    if not is_cm_only and payload.image_url:
        background.add_task(
            hash_service.index_card,
            tcg_card_id=payload.tcg_card_id,
            name=payload.name,
            set_name=payload.set_name,
            rarity=payload.rarity,
            image_url=payload.image_url,
            db=db,
        )

    return _card_dict(card)


# ── Hash index management ─────────────────────────────────────────────────────

@router.get("/hash-index/stats")
def hash_index_stats(
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    return hash_service.index_stats(db)


@router.post("/hash-index/build")
async def build_hash_index(
    set_code: str = Query(..., description="TCG set ID, e.g. 'sv1'"),
    background: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """Bulk-download and hash all cards in a set (runs as background task)."""
    try:
        cards, _ = await tcg_api_service.search_cards(f"set.id:{set_code}", None, db, page=1)
        # The search query above won't work well — fetch the set properly
        import httpx
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"https://api.pokemontcg.io/v2/cards",
                headers=tcg_api_service._get_headers(),
                params={"q": f"set.id:{set_code}", "pageSize": 200,
                        "select": "id,name,set,rarity,images"},
            )
            resp.raise_for_status()
            set_cards = resp.json().get("data", [])
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"TCG API error: {exc}")

    background.add_task(hash_service.bulk_index_set, set_cards, db)
    return {"queued": len(set_cards), "set_code": set_code}


# ── CRUD ──────────────────────────────────────────────────────────────────────

@router.get("")
def list_cards(
    search: Optional[str] = Query(None),
    set_name: Optional[str] = Query(None),
    rarity: Optional[str] = Query(None),
    condition: Optional[str] = Query(None),
    for_trade: Optional[bool] = Query(None),
    is_foil: Optional[bool] = Query(None),
    sort: str = Query("added_at"),
    order: str = Query("desc"),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    q = db.query(Card).filter(Card.user_id == user.id)
    if search:
        q = q.filter(or_(Card.name.ilike(f"%{search}%"), Card.set_name.ilike(f"%{search}%")))
    if set_name:
        q = q.filter(Card.set_name == set_name)
    if rarity:
        q = q.filter(Card.rarity == rarity)
    if condition:
        q = q.filter(Card.condition == condition)
    if for_trade is not None:
        q = q.filter(Card.for_trade == for_trade)
    if is_foil is not None:
        q = q.filter(Card.is_foil == is_foil)

    sort_col = getattr(Card, sort, Card.added_at)
    q = q.order_by(sort_col.desc() if order == "desc" else sort_col.asc())
    total = q.count()
    cards = q.offset(offset).limit(limit).all()
    return {"total": total, "cards": [_card_dict(c) for c in cards]}


@router.post("/bulk-update")
def bulk_update(
    payload: BulkUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """Update many of the user's cards at once (e.g. mark a batch for sale)."""
    if not payload.ids:
        return {"updated": 0}
    values = {}
    if payload.for_trade is not None:
        values["for_trade"] = payload.for_trade
    if payload.condition is not None:
        values["condition"] = payload.condition
    if not values:
        return {"updated": 0}
    updated = (
        db.query(Card)
        .filter(Card.id.in_(payload.ids), Card.user_id == user.id)
        .update(values, synchronize_session=False)
    )
    db.commit()
    return {"updated": updated}


@router.post("/bulk-delete")
def bulk_delete(
    payload: BulkDelete,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """Delete many of the user's cards at once."""
    if not payload.ids:
        return {"deleted": 0}
    deleted = (
        db.query(Card)
        .filter(Card.id.in_(payload.ids), Card.user_id == user.id)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": deleted}


def _require_feature(user: User, feature: str) -> None:
    if not plan_service.has_feature(user, feature):
        raise HTTPException(
            status_code=402,
            detail="This is a Pro feature. Upgrade to unlock it.",
        )


@router.get("/export/csv")
def export_csv(
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    _require_feature(user, "csv_pdf_export")
    data = export_service.export_csv(db, user.id)
    return Response(
        content=data, media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=cardvault_collection.csv"},
    )


@router.get("/export/pdf")
def export_pdf(
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    _require_feature(user, "csv_pdf_export")
    data = export_service.export_pdf(db, user.id)
    return Response(
        content=bytes(data), media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=cardvault_collection.pdf"},
    )


@router.get("/export/json")
def export_json(
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    _require_feature(user, "csv_pdf_export")
    return export_service.export_json(db, user.id)


@router.get("/localize-name")
async def localize_name(
    name: str = Query(...),
    language: str = Query("EN"),
    dex: Optional[str] = Query(None, description="Comma-separated Pokédex numbers"),
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """Return a card name localized to the given language (for live UI display)."""
    dex_nums = (
        [int(d) for d in dex.split(",") if d.strip().isdigit()] if dex else None
    )
    localized = await tcg_api_service.localize_card_name(name, dex_nums, language, db)
    return {"name": localized}


def _get_owned_card(card_id: int, user: User, db: Session) -> Card:
    card = (
        db.query(Card)
        .filter(Card.id == card_id, Card.user_id == user.id)
        .first()
    )
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return card


@router.get("/{card_id}/tcg-info")
async def get_card_tcg_info(
    card_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    card = _get_owned_card(card_id, user, db)
    if not card.tcg_card_id or card.tcg_card_id.startswith("cm-"):
        raise HTTPException(status_code=404, detail="No TCG API data for this card")
    data = await tcg_api_service.get_card_by_id(card.tcg_card_id, db)
    if not data:
        raise HTTPException(status_code=404, detail="Card not found in TCG API")
    return {
        "attacks": data.get("attacks") or [],
        "abilities": data.get("abilities") or [],
        "weaknesses": data.get("weaknesses") or [],
        "resistances": data.get("resistances") or [],
        "retreat_cost": len(data.get("retreatCost") or []),
        "types": data.get("types") or [],
        "subtypes": data.get("subtypes") or [],
        "rules": data.get("rules") or [],
        "evolves_from": data.get("evolvesFrom"),
        "flavor_text": data.get("flavorText"),
    }


@router.get("/{card_id}/variants")
async def get_card_variants(
    card_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    """Return other printings of the same Pokémon via nationalPokedexNumbers."""
    card = _get_owned_card(card_id, user, db)
    if not card.tcg_card_id or card.tcg_card_id.startswith("cm-"):
        return {"variants": []}
    data = await tcg_api_service.get_card_by_id(card.tcg_card_id, db)
    if not data:
        return {"variants": []}
    dex_nums = data.get("nationalPokedexNumbers") or []
    if not dex_nums:
        return {"variants": []}
    raw = await tcg_api_service.get_national_dex_variants(card.tcg_card_id, dex_nums, db, limit=40)
    return {
        "variants": [
            {
                "id": v["id"],
                "name": v["name"],
                "set_name": (v.get("set") or {}).get("name"),
                "rarity": v.get("rarity"),
                "image_url": (v.get("images") or {}).get("small"),
                "language": v.get("_language", "EN"),
                "series": v.get("_series", ""),
            }
            for v in raw
        ]
    }


@router.get("/{card_id}")
def get_card(
    card_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    return _card_dict(_get_owned_card(card_id, user, db))


@router.put("/{card_id}")
def update_card(
    card_id: int,
    payload: CardUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    card = _get_owned_card(card_id, user, db)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(card, field, value)
    db.commit()
    db.refresh(card)
    return _card_dict(card)


@router.delete("/{card_id}")
def delete_card(
    card_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    card = _get_owned_card(card_id, user, db)
    db.delete(card)
    db.commit()
    return {"ok": True}


# ── Sale photos (seller's own front / back pictures) ──────────────────────────

@router.post("/{card_id}/photo")
async def upload_card_photo(
    card_id: int,
    slot: str = Form(...),                # "front" | "back"
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    if slot not in ("front", "back"):
        raise HTTPException(status_code=400, detail="slot must be 'front' or 'back'")
    card = _get_owned_card(card_id, user, db)
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    rel = sale_photo_service.save_bytes(data, file.filename)
    old = card.photo_front if slot == "front" else card.photo_back
    if slot == "front":
        card.photo_front = rel
    else:
        card.photo_back = rel
    db.commit()
    db.refresh(card)
    sale_photo_service.delete(old)   # free the replaced file
    return _card_dict(card)


@router.delete("/{card_id}/photo/{slot}")
def delete_card_photo(
    card_id: int,
    slot: str,
    db: Session = Depends(get_db),
    user: User = Depends(auth_service.get_current_user),
):
    if slot not in ("front", "back"):
        raise HTTPException(status_code=400, detail="slot must be 'front' or 'back'")
    card = _get_owned_card(card_id, user, db)
    old = card.photo_front if slot == "front" else card.photo_back
    if slot == "front":
        card.photo_front = None
    else:
        card.photo_back = None
    db.commit()
    sale_photo_service.delete(old)
    return _card_dict(card)


# ── Serialiser ────────────────────────────────────────────────────────────────

def _card_dict(c: Card) -> dict:
    return {
        "id": c.id,
        "tcg_card_id": c.tcg_card_id,
        "name": c.name,
        "set_name": c.set_name,
        "set_code": c.set_code,
        "rarity": c.rarity,
        "card_type": c.card_type,
        "hp": c.hp,
        "image_url": c.image_url,
        "local_image_path": c.local_image_path,
        # Seller's own photos (relative paths + public URLs) for the listing.
        "photo_front": c.photo_front,
        "photo_back": c.photo_back,
        "photo_front_url": sale_photo_service.public_url(c.photo_front),
        "photo_back_url": sale_photo_service.public_url(c.photo_back),
        "condition": c.condition,
        "quantity": c.quantity,
        "notes": c.notes,
        "is_foil": c.is_foil,
        "for_trade": c.for_trade,
        "language": c.language or "EN",
        # USD
        "market_price_usd": c.market_price_usd,
        "price_low_usd": c.price_low_usd,
        "price_mid_usd": c.price_mid_usd,
        "price_high_usd": c.price_high_usd,
        # EUR
        "cm_product_id": c.cm_product_id,
        "market_price_eur": c.market_price_eur,
        "price_low_eur": c.price_low_eur,
        "price_trend_eur": c.price_trend_eur,
        "price_updated_at": c.price_updated_at.isoformat() if c.price_updated_at else None,
        "added_at": c.added_at.isoformat() if c.added_at else None,
    }
