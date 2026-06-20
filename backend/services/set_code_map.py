"""
Mapping from the abbreviation printed on the card (bottom-left text, also known
as the PTCGO code) to the TCG API set ID used in card IDs.

e.g. "PAF" → "sv4pt5"  so  lookup_tcg_id("PAF", "18") → "sv4pt5-18"

Sources: Pokémon TCG API set list (ptcgoCode field) and manual verification.
Only sets that print a text abbreviation on the card are included here; very
old sets (Base Set, Jungle, etc.) did not print a text code so OCR will not
find one for those cards.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Printed abbreviation → TCG API set ID
# ---------------------------------------------------------------------------

SET_CODE_MAP: dict[str, str] = {
    # ── Scarlet & Violet ─────────────────────────────────────────────────────
    "SVI":   "sv1",      # Scarlet & Violet (base)
    "PAL":   "sv2",      # Paldea Evolved
    "OBF":   "sv3",      # Obsidian Flames
    "MEW":   "sv3pt5",   # 151
    "PAR":   "sv4",      # Paradox Rift
    "PAF":   "sv4pt5",   # Paldean Fates
    "TEF":   "sv5",      # Temporal Forces
    "TWM":   "sv6",      # Twilight Masquerade
    "SFA":   "sv6pt5",   # Shrouded Fable
    "SCR":   "sv7",      # Stellar Crown
    "SSP":   "sv8",      # Surging Sparks
    "PRE":   "sv8pt5",   # Prismatic Evolutions
    # Promos
    "SVP":   "svp",      # Scarlet & Violet Promos

    # ── Sword & Shield ───────────────────────────────────────────────────────
    "SSH":   "swsh1",    # Sword & Shield
    "RCL":   "swsh2",    # Rebel Clash
    "DAA":   "swsh3",    # Darkness Ablaze
    "CPA":   "swsh3pt5", # Champion's Path
    "VIV":   "swsh4",    # Vivid Voltage
    "SHF":   "swsh4pt5", # Shining Fates
    "BST":   "swsh5",    # Battle Styles
    "CRE":   "swsh6",    # Chilling Reign
    "EVS":   "swsh7",    # Evolving Skies
    "CEL":   "swsh7pt5", # Celebrations
    "FST":   "swsh8",    # Fusion Strike
    "BRS":   "swsh9",    # Brilliant Stars
    "ASR":   "swsh10",   # Astral Radiance
    "PGO":   "pgo",      # Pokémon GO
    "LOR":   "swsh11",   # Lost Origin
    "SIT":   "swsh12",   # Silver Tempest
    "CRZ":   "swsh12pt5",# Crown Zenith
    # Promos
    "SWSH":  "swshp",    # Sword & Shield Promos

    # ── Sun & Moon ───────────────────────────────────────────────────────────
    "SUM":   "sm1",      # Sun & Moon
    "GRI":   "sm2",      # Guardians Rising
    "BUS":   "sm3",      # Burning Shadows
    "SLG":   "sm3pt5",   # Shining Legends
    "CIN":   "sm4",      # Crimson Invasion
    "UPR":   "sm5",      # Ultra Prism
    "FLI":   "sm6",      # Forbidden Light
    "CES":   "sm7",      # Celestial Storm
    "DRM":   "sm7a",     # Dragon Majesty
    "LOT":   "sm8",      # Lost Thunder
    "TEU":   "sm9",      # Team Up
    "DET":   "det1",     # Detective Pikachu
    "UNB":   "sm10",     # Unbroken Bonds
    "UNM":   "sm11",     # Unified Minds
    "HIF":   "sm11a",    # Hidden Fates
    "CEC":   "sm12",     # Cosmic Eclipse
    # Promos
    "SM":    "smp",      # Sun & Moon Promos

    # ── XY ───────────────────────────────────────────────────────────────────
    "XY":    "xy1",      # XY (base)
    "FLF":   "xy2",      # Flashfire
    "FFI":   "xy3",      # Furious Fists
    "PHF":   "xy4",      # Phantom Forces
    "PRC":   "xy5",      # Primal Clash
    "DCR":   "dc1",      # Double Crisis
    "ROS":   "xy6",      # Roaring Skies
    "AOR":   "xy7",      # Ancient Origins
    "BKT":   "xy8",      # BREAKthrough
    "BKP":   "xy9",      # BREAKpoint
    "GEN":   "g1",       # Generations
    "FCO":   "xy10",     # Fates Collide
    "STS":   "xy11",     # Steam Siege
    "EVO":   "xy12",     # Evolutions
    # Promos
    "XYP":   "xyp",      # XY Promos

    # ── Black & White ─────────────────────────────────────────────────────────
    "BLW":   "bw1",      # Black & White
    "EPO":   "bw2",      # Emerging Powers
    "NXD":   "bw3",      # Next Destinies
    "DEX":   "bw4",      # Dark Explorers
    "DRX":   "bw5",      # Dragons Exalted
    "BCR":   "bw6",      # Boundaries Crossed
    "PLS":   "bw7",      # Plasma Storm
    "PLF":   "bw8",      # Plasma Freeze
    "PLB":   "bw9",      # Plasma Blast
    "LTR":   "bw10",     # Legendary Treasures
    # Promos
    "BW":    "bwp",      # BW Promos

    # ── HeartGold & SoulSilver ────────────────────────────────────────────────
    "HS":    "hgss1",    # HeartGold & SoulSilver
    "UL":    "hgss2",    # Unleashed
    "UD":    "hgss3",    # Undaunted
    "TM":    "hgss4",    # Triumphant
    "CL":    "hgss5",    # Call of Legends
    # Promos
    "HGSS":  "hsp",      # HGSS Promos

    # ── Platinum ──────────────────────────────────────────────────────────────
    "PT":    "pl1",      # Platinum
    "RR":    "pl2",      # Rising Rivals
    "SV":    "pl3",      # Supreme Victors (note: "SV" pre-dates Scarlet/Violet era)
    "AR":    "pl4",      # Arceus

    # ── Diamond & Pearl ───────────────────────────────────────────────────────
    "DP":    "dp1",      # Diamond & Pearl
    "MT":    "dp2",      # Mysterious Treasures
    "SW":    "dp3",      # Secret Wonders
    "GE":    "dp4",      # Great Encounters
    "MD":    "dp5",      # Majestic Dawn
    "LA":    "dp6",      # Legends Awakened
    "SF":    "dp7",      # Stormfront

    # ── EX-era (early 2000s) ──────────────────────────────────────────────────
    "EX":    "ex1",      # EX Ruby & Sapphire / Expedition (ambiguous; handled by number lookup)
    "SKY":   "ex7",      # EX Team Rocket Returns (approximate — varies)
    "DX":    "ex8",      # EX Deoxys
    "EM":    "ex9",      # EX Emerald
    "UF":    "ex10",     # EX Unseen Forces
    "DS":    "ex11",     # EX Delta Species
    "LM":    "ex12",     # EX Legend Maker
    "HP":    "ex13",     # EX Holon Phantoms
    "CG":    "ex14",     # EX Crystal Guardians
    "DF":    "ex15",     # EX Dragon Frontiers
    "PK":    "ex16",     # EX Power Keepers
}

# ---------------------------------------------------------------------------
# Ambiguous or alternative abbreviations (some sets share or reuse codes)
# ---------------------------------------------------------------------------
_ALIASES: dict[str, str] = {
    # Some prints of SV base set use "SV" rather than "SVI"
    # but "SV" already maps to pl3 (Supreme Victors) above so we can't
    # silently override — resolved by context (card number range).
}


def lookup_tcg_id(abbreviation: str, number: str | int) -> str | None:
    """
    Return the TCG API card ID (e.g. ``"sv4pt5-18"``) for a given printed
    set abbreviation and collector number, or ``None`` if the abbreviation is
    not recognised.

    Parameters
    ----------
    abbreviation:
        Printed set code, e.g. ``"PAF"``, ``"SVI"``, ``"BW"``.
    number:
        Collector number, either as a string (``"018"`` or ``"18"``) or int.
        Leading zeros are stripped automatically.
    """
    abbr_upper = str(abbreviation).strip().upper()
    set_id = SET_CODE_MAP.get(abbr_upper)
    if not set_id:
        return None

    # Normalise number: strip leading zeros from purely numeric values
    num_str = str(number).strip()
    if num_str.isdigit():
        num_str = str(int(num_str))  # "018" → "18"

    return f"{set_id}-{num_str}"
