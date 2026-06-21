"""
Pokemon TCG API wrapper.

Extra capabilities added in this file
--------------------------------------
• GERMAN_TO_EN       – translates OCR output from German cards to English
                       so the search query reaches the (English-only) API.
• translate_to_english() – public helper used by the upload endpoint.
• _detect_set_language() – heuristic: returns "JA" for Japanese cards,
                           "EN" for everything else (TCG API is EN-primary).
• get_national_dex_variants() – given a card's national Pokédex numbers,
                                fetches ALL other printings of the same
                                Pokémon and tags each with a detected language.
"""

import json
import os
import re
from datetime import datetime, timedelta

import httpx
from rapidfuzz import fuzz
from sqlalchemy.orm import Session

from models import ApiCache

TCG_API_BASE = "https://api.pokemontcg.io/v2"
CACHE_TTL_HOURS = 24
PAGE_SIZE = 20

# ── Shared HTTP client ────────────────────────────────────────────────────────
# A single pooled AsyncClient keeps TCP+TLS connections alive across calls instead
# of paying a fresh handshake per request. Identifying one card hits several
# endpoints back-to-back, so connection reuse is the biggest single latency win.
_CLIENT: httpx.AsyncClient | None = None


def _client() -> httpx.AsyncClient:
    global _CLIENT
    if _CLIENT is None or _CLIENT.is_closed:
        _CLIENT = httpx.AsyncClient(
            timeout=httpx.Timeout(15.0, connect=5.0),
            limits=httpx.Limits(max_keepalive_connections=10, max_connections=20),
            headers={"User-Agent": "CardVault/1.0"},
        )
    return _CLIENT


async def aclose_client() -> None:
    """Close the shared client on app shutdown."""
    global _CLIENT
    if _CLIENT is not None and not _CLIENT.is_closed:
        await _CLIENT.aclose()
    _CLIENT = None

# ── German Pokémon name → English name ───────────────────────────────────────
# Used to translate OCR output from German cards before hitting the TCG API.
GERMAN_TO_EN: dict[str, str] = {
    # Gen 1 — all 151
    "Bisasam": "Bulbasaur",    "Bisaknosp": "Ivysaur",     "Bisaflor": "Venusaur",
    "Glumanda": "Charmander",  "Glutexo": "Charmeleon",    "Glurak": "Charizard",
    "Schiggy": "Squirtle",     "Schillok": "Wartortle",    "Turtok": "Blastoise",
    "Raupy": "Caterpie",       "Safcon": "Metapod",        "Smettbo": "Butterfree",
    "Hornliu": "Weedle",       "Kokuna": "Kakuna",         "Bibor": "Beedrill",
    "Taubsi": "Pidgey",        "Tauboga": "Pidgeotto",     "Tauboss": "Pidgeot",
    "Rattfratz": "Rattata",    "Rattikarl": "Raticate",
    "Habitak": "Spearow",      "Ibitak": "Fearow",
    "Rettan": "Ekans",         "Arbok": "Arbok",
    "Pikachu": "Pikachu",      "Raichu": "Raichu",
    "Sandan": "Sandshrew",     "Sandamer": "Sandslash",
    "Nidoran♀": "Nidoran♀",   "Nidorina": "Nidorina",    "Nidoqueen": "Nidoqueen",
    "Nidoran♂": "Nidoran♂",   "Nidorino": "Nidorino",    "Nidoking": "Nidoking",
    "Piepi": "Clefairy",       "Pixi": "Clefable",
    "Vulpix": "Vulpix",        "Vulnona": "Ninetales",
    "Pummeluff": "Jigglypuff", "Knuddeluff": "Wigglytuff",
    "Zubat": "Zubat",          "Golbat": "Golbat",
    "Myrapla": "Oddish",       "Duflor": "Gloom",          "Blubana": "Vileplume",
    "Paras": "Paras",          "Parasek": "Parasect",
    "Bluzuk": "Venonat",       "Omot": "Venomoth",
    "Digda": "Diglett",        "Digdri": "Dugtrio",
    "Mauzi": "Meowth",         "Snobilikat": "Persian",
    "Enton": "Psyduck",        "Entoron": "Golduck",
    "Menki": "Mankey",         "Rasaff": "Primeape",
    "Fukano": "Growlithe",     "Arkani": "Arcanine",
    "Quapsel": "Poliwag",      "Quaputzi": "Poliwhirl",   "Quappo": "Poliwrath",
    "Abra": "Abra",            "Kadabra": "Kadabra",       "Simsala": "Alakazam",
    "Maschop": "Machop",       "Maschock": "Machoke",      "Machomei": "Machamp",
    "Knofensa": "Bellsprout",  "Ultrigaria": "Weepinbell", "Sarzenia": "Victreebel",
    "Tentacha": "Tentacool",   "Tentoxa": "Tentacruel",
    "Kleinstein": "Geodude",   "Georok": "Graveler",       "Geowaz": "Golem",
    "Ponita": "Ponyta",        "Gallopa": "Rapidash",
    "Flegmon": "Slowpoke",     "Lahmus": "Slowbro",
    "Magnetilo": "Magnemite",  "Magneton": "Magneton",
    "Dodu": "Farfetch'd",      "Doduo": "Doduo",           "Dodri": "Dodrio",
    "Jurob": "Seel",           "Jugong": "Dewgong",
    "Sleima": "Grimer",        "Sleimok": "Muk",
    "Muschas": "Shellder",     "Austos": "Cloyster",
    "Nebulak": "Gastly",       "Alpollo": "Haunter",       "Gengar": "Gengar",
    "Onix": "Onix",
    "Traumato": "Drowzee",     "Hypno": "Hypno",
    "Krabby": "Krabby",        "Kingler": "Kingler",
    "Voltobal": "Voltorb",     "Lektrobal": "Electrode",
    "Owei": "Exeggcute",       "Kokowei": "Exeggutor",
    "Knogga": "Cubone",        "Wirbelknochen": "Marowak",
    "Kicklee": "Hitmonlee",    "Nockchan": "Hitmonchan",
    "Schlurp": "Lickitung",
    "Smogon": "Koffing",       "Smogmog": "Weezing",
    "Rihorn": "Rhyhorn",       "Rizeros": "Rhydon",
    "Chaneira": "Chansey",     "Tangela": "Tangela",       "Kangama": "Kangaskhan",
    "Seeper": "Horsea",        "Seemon": "Seadra",
    "Goldini": "Goldeen",      "Golking": "Seaking",
    "Sterndu": "Staryu",       "Starmie": "Starmie",
    "Pantimos": "Mr. Mime",    "Sichlor": "Scyther",
    "Rossana": "Jynx",         "Elekt": "Electabuzz",      "Magmar": "Magmar",
    "Pinsir": "Pinsir",        "Tauros": "Tauros",
    "Karpador": "Magikarp",    "Garados": "Gyarados",      "Lapras": "Lapras",
    "Ditto": "Ditto",
    "Evoli": "Eevee",          "Aquana": "Vaporeon",       "Blitza": "Jolteon",
    "Flamara": "Flareon",      "Porygon": "Porygon",
    "Amonitas": "Omanyte",     "Amoroso": "Omastar",
    "Kabuto": "Kabuto",        "Kabutops": "Kabutops",     "Aerodactyl": "Aerodactyl",
    "Relaxo": "Snorlax",
    "Arktos": "Articuno",      "Zapdos": "Zapdos",         "Lavados": "Moltres",
    "Dratini": "Dratini",      "Dragonir": "Dragonair",    "Dragoran": "Dragonite",
    "Mewtu": "Mewtwo",         "Mew": "Mew",
    # Gen 2
    "Endivie": "Chikorita",    "Lorbelix": "Bayleef",      "Meganie": "Meganium",
    "Feurigel": "Cyndaquil",   "Igelavar": "Quilava",      "Tornupto": "Typhlosion",
    "Karnimani": "Totodile",   "Tyracroc": "Croconaw",     "Impergator": "Feraligatr",
    "Pichu": "Pichu",          "Togepi": "Togepi",         "Togetic": "Togetic",
    "Psiana": "Espeon",        "Nachtara": "Umbreon",
    "Lugia": "Lugia",          "Celebi": "Celebi",
    "Raikou": "Raikou",        "Entei": "Entei",           "Suicune": "Suicune",
    # Gen 3
    "Glurak": "Charizard",  # repeated because it's the most scanned
    "Latias": "Latias",        "Latios": "Latios",
    "Kyogre": "Kyogre",        "Groudon": "Groudon",       "Rayquaza": "Rayquaza",
    # Gen 4
    "Dialga": "Dialga",        "Palkia": "Palkia",         "Giratina": "Giratina",
    "Arceus": "Arceus",        "Darkrai": "Darkrai",
    # Gen 5+
    "Reshiram": "Reshiram",    "Zekrom": "Zekrom",
    "Xerneas": "Xerneas",      "Yveltal": "Yveltal",
    "Solgaleo": "Solgaleo",    "Lunala": "Lunala",
}

# Build a lowercase lookup for case-insensitive matching
_GERMAN_LOWER: dict[str, str] = {k.lower(): v for k, v in GERMAN_TO_EN.items()}


def translate_to_english(name: str) -> str:
    """
    Translate a German Pokémon name to English.
    Returns the English name if known, else the original (untranslated).
    Also handles mixed-case OCR output.
    """
    if not name:
        return name
    return (
        GERMAN_TO_EN.get(name)
        or _GERMAN_LOWER.get(name.lower())
        or name
    )


def is_likely_german(name: str) -> bool:
    """Return True if name appears to be a German Pokémon name."""
    return (
        name in GERMAN_TO_EN
        or name.lower() in _GERMAN_LOWER
        or any(c in name for c in "äöüÄÖÜß")
    )


# ── Cache helpers ─────────────────────────────────────────────────────────────

def _get_headers() -> dict:
    key = os.getenv("POKEMON_TCG_API_KEY", "")
    return {"X-Api-Key": key} if key else {}


def _cache_get(db: Session, key: str):
    entry = db.query(ApiCache).filter(ApiCache.cache_key == key).first()
    if not entry:
        return None
    expiry = entry.cached_at + timedelta(hours=CACHE_TTL_HOURS)
    if datetime.utcnow() > expiry:
        db.delete(entry)
        db.commit()
        return None
    return json.loads(entry.response_json)


def _cache_set(db: Session, key: str, data) -> None:
    entry = db.query(ApiCache).filter(ApiCache.cache_key == key).first()
    if entry:
        entry.response_json = json.dumps(data)
        entry.cached_at = datetime.utcnow()
    else:
        entry = ApiCache(cache_key=key, response_json=json.dumps(data))
        db.add(entry)
    db.commit()


# ── Language detection heuristic ─────────────────────────────────────────────

def _detect_set_language(set_data: dict, card_name: str = "") -> str:
    """
    Heuristic to guess the language of a card from its set metadata and name.

    The pokemontcg.io API is primarily English.  A small number of Japanese
    promotional sets exist; we detect them via set/series name keywords and the
    presence of CJK characters in the card name.

    Returns: "JA" | "EN"  (extend as needed if the API gains more languages)
    """
    set_name = (set_data.get("name") or "").lower()
    series = (set_data.get("series") or "").lower()

    # Explicit Japanese keywords in set name
    jp_keywords = ("japanese", "(jp)", "japanisch")
    if any(kw in set_name for kw in jp_keywords):
        return "JA"

    # CJK characters in the card name → Japanese (or Chinese/Korean promo)
    if card_name and any(
        "　" <= c <= "鿿"    # CJK Unified / Katakana / Hiragana
        or "＀" <= c <= "￯"  # Fullwidth forms
        for c in card_name
    ):
        return "JA"

    return "EN"


# ── Core API functions ────────────────────────────────────────────────────────

_CARD_ID_RE = re.compile(r"^[a-z0-9]+-[0-9]+$", re.IGNORECASE)


async def search_cards(
    query: str,
    set_code: str | None,
    db: Session,
    page: int = 1,
) -> tuple[list[dict], bool]:
    """
    Search TCG API cards by name + optional set. Returns (cards, has_more).

    If *query* looks like a card ID (e.g. "paf-18", "base1-4") the function
    calls get_card_by_id() directly and returns a single-item list so the
    caller gets an exact match immediately without a name-search round-trip.
    """
    # ── Card-ID shortcut ──────────────────────────────────────────────────
    if _CARD_ID_RE.match(query.strip()) and not set_code:
        card = await get_card_by_id(query.strip().lower(), db)
        if card:
            return [card], False
        return [], False

    # ── Name search ───────────────────────────────────────────────────────
    q = f'name:"{query}"'
    if set_code:
        q += f" set.id:{set_code}"
    cache_key = f"search:{q}:p{page}"

    cached = _cache_get(db, cache_key)
    if cached is not None:
        return cached["items"], cached["has_more"]

    resp = await _client().get(
        f"{TCG_API_BASE}/cards",
        headers=_get_headers(),
        params={
            "q": q,
            "page": page,
            "pageSize": PAGE_SIZE + 1,
            "select": "id,name,set,rarity,types,hp,images,tcgplayer,cardmarket,nationalPokedexNumbers",
        },
    )
    resp.raise_for_status()
    raw = resp.json().get("data", [])

    has_more = len(raw) > PAGE_SIZE
    data = raw[:PAGE_SIZE]
    _cache_set(db, cache_key, {"items": data, "has_more": has_more})
    return data, has_more


async def get_card_by_id(card_id: str, db: Session) -> dict | None:
    cache_key = f"card:{card_id}"
    cached = _cache_get(db, cache_key)
    if cached:
        return cached

    resp = await _client().get(
        f"{TCG_API_BASE}/cards/{card_id}",
        headers=_get_headers(),
    )
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    data = resp.json().get("data", {})

    _cache_set(db, cache_key, data)
    return data


async def get_national_dex_variants(
    primary_card_id: str,
    national_dex_nums: list[int],
    db: Session,
    limit: int = 30,
) -> list[dict]:
    """
    Return all TCG API printings of the same Pokémon (same national Pokédex
    number), excluding the primary match already shown to the user.

    Results are tagged with:
      _language  – detected language code ("EN" or "JA")
      _source    – "tcg_variant"
      _series    – set series for grouping in the UI

    Results are sorted: JA first (rarest / most interesting), then EN by
    release date descending (newest first).
    """
    if not national_dex_nums:
        return []

    dex_num = national_dex_nums[0]
    cache_key = f"variants:dex:{dex_num}"

    cached = _cache_get(db, cache_key)
    if cached is not None:
        # Exclude primary from cached results too
        return [c for c in cached if c.get("id") != primary_card_id][:limit]

    try:
        resp = await _client().get(
            f"{TCG_API_BASE}/cards",
            headers=_get_headers(),
            params={
                "q": f"nationalPokedexNumbers:{dex_num}",
                "pageSize": 100,
                "select": "id,name,set,rarity,images,nationalPokedexNumbers",
            },
        )
        resp.raise_for_status()
        raw = resp.json().get("data", [])
    except Exception:
        return []

    # Tag and annotate every card
    tagged: list[dict] = []
    for card in raw:
        lang = _detect_set_language(card.get("set") or {}, card.get("name") or "")
        tagged.append({
            **card,
            "_language": lang,
            "_source": "tcg_variant",
            "_series": (card.get("set") or {}).get("series", ""),
            "_confidence": None,
        })

    # Sort: JA first (interesting), then EN newest → oldest
    def _sort_key(c: dict):
        lang_order = 0 if c["_language"] == "JA" else 1
        release = (c.get("set") or {}).get("releaseDate", "")
        return (lang_order, "" if lang_order == 0 else f"{chr(0xff)}{release}"[::-1])

    tagged.sort(key=_sort_key)
    _cache_set(db, cache_key, tagged)

    return [c for c in tagged if c.get("id") != primary_card_id][:limit]


# ── Localized Pokémon names (PokeAPI) ────────────────────────────────────────
# The TCG API is English-only, so a German card shows "Arboliva" instead of
# "Olithena". PokeAPI provides official localized species names for every
# Pokémon, keyed by National Pokédex number. We cache results in ApiCache.

POKEAPI_BASE = "https://pokeapi.co/api/v2"

# Our language code → PokeAPI language code.
_POKEAPI_LANG = {
    "EN": "en", "DE": "de", "FR": "fr", "IT": "it", "ES": "es",
    "JA": "ja", "KO": "ko", "ZH": "zh-Hant",
}


async def get_localized_pokemon_name(
    dex: int, language: str, db: Session
) -> str | None:
    """Return the official localized species name for a Pokédex number, or None."""
    lang_code = _POKEAPI_LANG.get(language.upper())
    if not lang_code or not dex:
        return None

    cache_key = f"pokename:{dex}"
    names = _cache_get(db, cache_key)
    if names is None:
        try:
            resp = await _client().get(f"{POKEAPI_BASE}/pokemon-species/{dex}")
            resp.raise_for_status()
            data = resp.json()
            names = {
                n["language"]["name"]: n["name"]
                for n in data.get("names", [])
            }
        except Exception:
            names = {}
        _cache_set(db, cache_key, names)

    return names.get(lang_code)


async def localize_card_name(
    english_name: str, dex_nums: list[int] | None, language: str, db: Session
) -> str:
    """
    Translate a card's English name into the given language, preserving suffixes
    like " ex", " V", " VMAX" (e.g. "Charizard ex" → "Glurak ex").

    Falls back to the static German table, then to the original English name.
    """
    if not english_name or language.upper() == "EN":
        return english_name

    dex = (dex_nums or [None])[0]
    if dex:
        loc = await get_localized_pokemon_name(dex, language, db)
        en = await get_localized_pokemon_name(dex, "EN", db)
        if loc:
            if en and en in english_name:
                return english_name.replace(en, loc)
            return loc

    # Static fallback (German only) using the reverse of GERMAN_TO_EN.
    if language.upper() == "DE":
        rev = {v.lower(): k for k, v in GERMAN_TO_EN.items()}
        for token in english_name.split():
            de = rev.get(token.lower())
            if de:
                return english_name.replace(token, de)
    return english_name


async def find_by_number_total(
    number: str,
    total: str | None,
    db: Session,
    name_hint: str | None = None,
) -> list[dict]:
    """
    Find cards by collector number, narrowed by the printed set total.

    This is the rescue path when the printed 3-letter set code can't be OCR'd but
    the large "NNN/TTT" collector number can: e.g. number=21, total=197 →
    Obsidian Flames #21.  The set total is a strong discriminator, so this is
    reliable even across many sets sharing the same collector number.

    Results are ranked by name similarity to ``name_hint`` when one is provided.
    """
    if not number:
        return []

    cache_key = f"numtotal:{number}:{total}"
    cached = _cache_get(db, cache_key)
    if cached is None:
        try:
            resp = await _client().get(
                f"{TCG_API_BASE}/cards",
                headers=_get_headers(),
                params={
                    "q": f"number:{number}",
                    "pageSize": 250,
                    "select": "id,name,set,rarity,types,hp,images,"
                              "tcgplayer,cardmarket,nationalPokedexNumbers",
                },
            )
            resp.raise_for_status()
            raw = resp.json().get("data", [])
        except Exception:
            return []

        _cache_set(db, cache_key, raw)
        cached = raw

    # Rank: cards whose printed total matches the OCR'd total come first (strong
    # signal), then by recency. We keep non-matching ones too so a slightly
    # misread total still surfaces the right card among the choices.
    t = int(total) if total and total.isdigit() else None

    def total_matches(c: dict) -> bool:
        s = c.get("set") or {}
        return t is not None and (s.get("printedTotal") == t or s.get("total") == t)

    results = [{**c, "_source": "number_total"} for c in cached]
    if name_hint:
        results = rank_candidates(name_hint, results)

    results.sort(key=lambda c: (
        0 if total_matches(c) else 1,           # total match first
        -(c.get("_confidence") or 0),           # then best name similarity
    ))
    return results


async def list_sets(db: Session) -> list[dict]:
    """Return all TCG sets sorted by release date (newest first), cached 24 h."""
    cache_key = "sets:all"
    cached = _cache_get(db, cache_key)
    if cached is not None:
        return cached

    resp = await _client().get(
        f"{TCG_API_BASE}/sets",
        headers=_get_headers(),
        params={"pageSize": 250, "select": "id,name,series,releaseDate"},
    )
    resp.raise_for_status()
    sets = resp.json().get("data", [])

    sets.sort(key=lambda s: s.get("releaseDate", ""), reverse=True)
    _cache_set(db, cache_key, sets)
    return sets


# ── Scoring / price helpers ───────────────────────────────────────────────────

def rank_candidates(ocr_name: str, candidates: list[dict]) -> list[dict]:
    scored = []
    for card in candidates:
        score = fuzz.token_sort_ratio(ocr_name.lower(), card.get("name", "").lower())
        scored.append({**card, "_confidence": score, "_source": "tcg"})
    scored.sort(key=lambda x: x["_confidence"], reverse=True)
    return scored


def extract_price(card_data: dict) -> dict:
    prices: dict = {}

    tcgplayer = card_data.get("tcgplayer") or {}
    for variant in ("normal", "holofoil", "reverseHolofoil", "1stEditionNormal", "1stEditionHolofoil"):
        vp = (tcgplayer.get("prices") or {}).get(variant, {})
        if vp:
            prices.update({
                "market": vp.get("market"),
                "low": vp.get("low"),
                "mid": vp.get("mid"),
                "high": vp.get("high"),
            })
            break

    cm = card_data.get("cardmarket") or {}
    cm_prices = cm.get("prices") or {}
    prices["market_eur"] = cm_prices.get("averageSellPrice")
    prices["trend_eur"] = cm_prices.get("trendPrice")
    prices["low_eur"] = cm_prices.get("lowPrice")

    return prices
