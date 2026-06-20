/**
 * Pokémon name translation tables and language-detection utilities.
 *
 * Why this file exists
 * --------------------
 * The Pokemon TCG API is English-only. When a user scans a German card the
 * OCR returns "Glurak" instead of "Charizard", making the API search fail.
 * This module translates non-English names → English before we hit the API,
 * and detects which language a card is in so the UI can auto-select the right
 * language tab and expand the relevant variants section.
 */

// ── German (DE) ──────────────────────────────────────────────────────────────
// Complete Gen 1 + Gen 2 starters/legendaries + popular Gen 3–9 entries.
export const GERMAN_TO_EN = {
  // Gen 1 — all 151
  'Bisasam': 'Bulbasaur',    'Bisaknosp': 'Ivysaur',     'Bisaflor': 'Venusaur',
  'Glumanda': 'Charmander',  'Glutexo': 'Charmeleon',    'Glurak': 'Charizard',
  'Schiggy': 'Squirtle',     'Schillok': 'Wartortle',    'Turtok': 'Blastoise',
  'Raupy': 'Caterpie',       'Safcon': 'Metapod',        'Smettbo': 'Butterfree',
  'Hornliu': 'Weedle',       'Kokuna': 'Kakuna',         'Bibor': 'Beedrill',
  'Taubsi': 'Pidgey',        'Tauboga': 'Pidgeotto',     'Tauboss': 'Pidgeot',
  'Rattfratz': 'Rattata',    'Rattikarl': 'Raticate',
  'Habitak': 'Spearow',      'Ibitak': 'Fearow',
  'Rettan': 'Ekans',         'Arbok': 'Arbok',
  'Pikachu': 'Pikachu',      'Raichu': 'Raichu',
  'Sandan': 'Sandshrew',     'Sandamer': 'Sandslash',
  'Nidoran♀': 'Nidoran♀',   'Nidorina': 'Nidorina',    'Nidoqueen': 'Nidoqueen',
  'Nidoran♂': 'Nidoran♂',   'Nidorino': 'Nidorino',    'Nidoking': 'Nidoking',
  'Piepi': 'Clefairy',       'Pixi': 'Clefable',
  'Vulpix': 'Vulpix',        'Vulnona': 'Ninetales',
  'Pummeluff': 'Jigglypuff', 'Knuddeluff': 'Wigglytuff',
  'Zubat': 'Zubat',          'Golbat': 'Golbat',
  'Myrapla': 'Oddish',       'Duflor': 'Gloom',          'Blubana': 'Vileplume',
  'Paras': 'Paras',          'Parasek': 'Parasect',
  'Bluzuk': 'Venonat',       'Omot': 'Venomoth',
  'Digda': 'Diglett',        'Digdri': 'Dugtrio',
  'Mauzi': 'Meowth',         'Snobilikat': 'Persian',
  'Enton': 'Psyduck',        'Entoron': 'Golduck',
  'Menki': 'Mankey',         'Rasaff': 'Primeape',
  'Fukano': 'Growlithe',     'Arkani': 'Arcanine',
  'Quapsel': 'Poliwag',      'Quaputzi': 'Poliwhirl',   'Quappo': 'Poliwrath',
  'Abra': 'Abra',            'Kadabra': 'Kadabra',       'Simsala': 'Alakazam',
  'Maschop': 'Machop',       'Maschock': 'Machoke',      'Machomei': 'Machamp',
  'Knofensa': 'Bellsprout',  'Ultrigaria': 'Weepinbell', 'Sarzenia': 'Victreebel',
  'Tentacha': 'Tentacool',   'Tentoxa': 'Tentacruel',
  'Kleinstein': 'Geodude',   'Georok': 'Graveler',       'Geowaz': 'Golem',
  'Ponita': 'Ponyta',        'Gallopa': 'Rapidash',
  'Flegmon': 'Slowpoke',     'Lahmus': 'Slowbro',
  'Magnetilo': 'Magnemite',  'Magneton': 'Magneton',
  'Dodu': "Farfetch'd",      'Doduo': 'Doduo',           'Dodri': 'Dodrio',
  'Jurob': 'Seel',           'Jugong': 'Dewgong',
  'Sleima': 'Grimer',        'Sleimok': 'Muk',
  'Muschas': 'Shellder',     'Austos': 'Cloyster',
  'Nebulak': 'Gastly',       'Alpollo': 'Haunter',       'Gengar': 'Gengar',
  'Onix': 'Onix',
  'Traumato': 'Drowzee',     'Hypno': 'Hypno',
  'Krabby': 'Krabby',        'Kingler': 'Kingler',
  'Voltobal': 'Voltorb',     'Lektrobal': 'Electrode',
  'Owei': 'Exeggcute',       'Kokowei': 'Exeggutor',
  'Knogga': 'Cubone',        'Wirbelknochen': 'Marowak',
  'Kicklee': 'Hitmonlee',    'Nockchan': 'Hitmonchan',
  'Schlurp': 'Lickitung',
  'Smogon': 'Koffing',       'Smogmog': 'Weezing',
  'Rihorn': 'Rhyhorn',       'Rizeros': 'Rhydon',
  'Chaneira': 'Chansey',     'Tangela': 'Tangela',       'Kangama': 'Kangaskhan',
  'Seeper': 'Horsea',        'Seemon': 'Seadra',
  'Goldini': 'Goldeen',      'Golking': 'Seaking',
  'Sterndu': 'Staryu',       'Starmie': 'Starmie',
  'Pantimos': 'Mr. Mime',    'Sichlor': 'Scyther',
  'Rossana': 'Jynx',         'Elekt': 'Electabuzz',      'Magmar': 'Magmar',
  'Pinsir': 'Pinsir',        'Tauros': 'Tauros',
  'Karpador': 'Magikarp',    'Garados': 'Gyarados',      'Lapras': 'Lapras',
  'Ditto': 'Ditto',
  'Evoli': 'Eevee',          'Aquana': 'Vaporeon',       'Blitza': 'Jolteon',
  'Flamara': 'Flareon',      'Porygon': 'Porygon',
  'Amonitas': 'Omanyte',     'Amoroso': 'Omastar',
  'Kabuto': 'Kabuto',        'Kabutops': 'Kabutops',     'Aerodactyl': 'Aerodactyl',
  'Relaxo': 'Snorlax',
  'Arktos': 'Articuno',      'Zapdos': 'Zapdos',         'Lavados': 'Moltres',
  'Dratini': 'Dratini',      'Dragonir': 'Dragonair',    'Dragoran': 'Dragonite',
  'Mewtu': 'Mewtwo',         'Mew': 'Mew',

  // Gen 2 starters + legendaries + popular
  'Endivie': 'Chikorita',    'Lorbelix': 'Bayleef',      'Meganie': 'Meganium',
  'Feurigel': 'Cyndaquil',   'Igelavar': 'Quilava',      'Tornupto': 'Typhlosion',
  'Karnimani': 'Totodile',   'Tyracroc': 'Croconaw',     'Impergator': 'Feraligatr',
  'Pichu': 'Pichu',          'Togepi': 'Togepi',         'Togetic': 'Togetic',
  'Evoli': 'Eevee',
  'Psiana': 'Espeon',        'Nachtara': 'Umbreon',
  'Lugia': 'Lugia',          'Ho-Oh': 'Ho-Oh',           'Celebi': 'Celebi',
  'Raikou': 'Raikou',        'Entei': 'Entei',           'Suicune': 'Suicune',
  'Relaxo': 'Snorlax',

  // Gen 3 starters + legendaries + popular
  'Geckarbor': 'Treecko',    'Reptain': 'Grovyle',       'Gewaldro': 'Sceptile',
  'Flemmli': 'Torchic',      'Jungglut': 'Combusken',    'Lohgock': 'Blaziken',
  'Hydropi': 'Mudkip',       'Moorabbel': 'Marshtomp',   'Sumpex': 'Swampert',
  'Regice': 'Regice',        'Regirock': 'Regirock',     'Registeel': 'Registeel',
  'Latias': 'Latias',        'Latios': 'Latios',         'Kyogre': 'Kyogre',
  'Groudon': 'Groudon',      'Rayquaza': 'Rayquaza',     'Jirachi': 'Jirachi',
  'Deoxys': 'Deoxys',

  // Gen 4
  'Chelby': 'Turtwig',       'Chelcarain': 'Grotle',     'Chelterrar': 'Torterra',
  'Panflam': 'Chimchar',     'Panpyek': 'Monferno',      'Panferno': 'Infernape',
  'Plinfa': 'Piplup',        'Pliprin': 'Prinplup',      'Impoleon': 'Empoleon',
  'Dialga': 'Dialga',        'Palkia': 'Palkia',         'Giratina': 'Giratina',
  'Arceus': 'Arceus',        'Darkrai': 'Darkrai',       'Shaymin': 'Shaymin',

  // Gen 5
  'Serpifeu': 'Snivy',       'Serpiroyal': 'Servine',    'Serpiroyal': 'Serperior',
  'Floink': 'Tepig',         'Ferzen': 'Pignite',        'Eber': 'Emboar',
  'Ottaro': 'Oshawott',      'Zwottronin': 'Dewott',     'Admurai': 'Samurott',
  'Reshiram': 'Reshiram',    'Zekrom': 'Zekrom',         'Kyurem': 'Kyurem',

  // Gen 6
  'Igamaro': 'Chespin',      'Igastarnish': 'Quilladin',  'Brigaron': 'Chesnaught',
  'Fynx': 'Fennekin',        'Rutena': 'Braixen',         'Fennexis': 'Delphox',
  'Froxy': 'Froakie',        'Frosskex': 'Frogadier',     'Frospino': 'Greninja',
  'Xerneas': 'Xerneas',      'Yveltal': 'Yveltal',       'Zygarde': 'Zygarde',

  // Gen 7+  popular
  'Kleine': 'Rowlet',        'Pfeilspitze': 'Dartrix',   'Silvarro': 'Decidueye',
  'Solekel': 'Litten',       'Torlit': 'Torracat',       'Fuegro': 'Incineroar',
  'Robball': 'Popplio',      'Nagrobball': 'Brionne',    'Primarina': 'Primarina',
  'Solgaleo': 'Solgaleo',    'Lunala': 'Lunala',         'Marshadow': 'Marshadow',
}

// ── French (FR) — key Gen 1 ───────────────────────────────────────────────────
export const FRENCH_TO_EN = {
  'Bulbizarre': 'Bulbasaur',  'Herbizarre': 'Ivysaur',    'Florizarre': 'Venusaur',
  'Salamèche': 'Charmander', 'Reptincel': 'Charmeleon',  'Dracaufeu': 'Charizard',
  'Carapuce': 'Squirtle',    'Carabaffe': 'Wartortle',   'Tortank': 'Blastoise',
  'Chenipan': 'Caterpie',    'Chrysacier': 'Metapod',    'Papilusion': 'Butterfree',
  'Aspicot': 'Weedle',       'Coconfort': 'Kakuna',      'Dardargnan': 'Beedrill',
  'Roucool': 'Pidgey',       'Roucoups': 'Pidgeotto',    'Roucarnage': 'Pidgeot',
  'Rattata': 'Rattata',      'Rattatac': 'Raticate',
  'Pikachu': 'Pikachu',      'Raichu': 'Raichu',
  'Evoli': 'Eevee',          'Aquali': 'Vaporeon',       'Voltali': 'Jolteon',
  'Pyroli': 'Flareon',
  'Dracaufeu': 'Charizard',  'Mewtwo': 'Mewtwo',        'Mew': 'Mew',
  'Lugia': 'Lugia',          'Ho-Oh': 'Ho-Oh',
}

// ── Italian (IT) — key Gen 1 ─────────────────────────────────────────────────
export const ITALIAN_TO_EN = {
  'Bulbasaur': 'Bulbasaur',   'Ivysaur': 'Ivysaur',      'Venusaur': 'Venusaur',
  'Charmander': 'Charmander', 'Charmeleon': 'Charmeleon', 'Charizard': 'Charizard',
  'Squirtle': 'Squirtle',     'Wartortle': 'Wartortle',   'Blastoise': 'Blastoise',
  // Italian names are very close to EN for Gen 1; key differences:
  'Pikachu': 'Pikachu',       'Mewtwo': 'Mewtwo',
}

// ── Spanish (ES) — key Gen 1 ─────────────────────────────────────────────────
export const SPANISH_TO_EN = {
  'Bulbasaur': 'Bulbasaur',   'Venusaur': 'Venusaur',    'Charizard': 'Charizard',
  'Blastoise': 'Blastoise',   'Pikachu': 'Pikachu',      'Mewtwo': 'Mewtwo',
  'Articuno': 'Articuno',     'Zapdos': 'Zapdos',        'Moltres': 'Moltres',
  // Spanish names are identical to EN for most Pokémon
}

// ── Translation map by language code ─────────────────────────────────────────
const LANG_MAP = {
  DE: GERMAN_TO_EN,
  FR: FRENCH_TO_EN,
  IT: ITALIAN_TO_EN,
  ES: SPANISH_TO_EN,
}

/**
 * Translate a Pokémon name to English.
 * Returns the English name if found, or the original if not in the table.
 */
export function translateToEnglish(name, lang = 'EN') {
  if (!name || lang === 'EN') return name
  const table = LANG_MAP[lang.toUpperCase()] || {}
  // Try exact match first, then case-insensitive
  return (
    table[name] ||
    table[Object.keys(table).find((k) => k.toLowerCase() === name.toLowerCase())] ||
    name
  )
}

// ── Language detection ────────────────────────────────────────────────────────

/** True if text contains German-specific characters. */
export function hasGermanChars(text) {
  return /[äöüÄÖÜß]/.test(text)
}

/** True if `name` is a known German Pokémon name. */
export function isKnownGermanName(name) {
  if (!name) return false
  return (
    !!GERMAN_TO_EN[name] ||
    !!Object.keys(GERMAN_TO_EN).find((k) => k.toLowerCase() === name.toLowerCase())
  )
}

/**
 * Detect card language from OCR text and/or filename.
 * Returns a language code (EN/DE/FR/IT/ES/JA) or null if unknown.
 */
export function detectCardLanguage(ocrText = '', filename = '') {
  const combined = `${ocrText} ${filename}`.toLowerCase()

  // German character heuristic
  if (hasGermanChars(ocrText) || isKnownGermanName(ocrText.trim())) return 'DE'

  // French character heuristic
  if (/[àâçéèêëîïôùûüÿœæ]/i.test(ocrText)) return 'FR'

  // Filename hints
  if (/(^|[\s_\-])de[\s_\-]|german|deutsch/.test(combined)) return 'DE'
  if (/(^|[\s_\-])fr[\s_\-]|french|français/.test(combined)) return 'FR'
  if (/(^|[\s_\-])it[\s_\-]|italian|italiano/.test(combined)) return 'IT'
  if (/(^|[\s_\-])es[\s_\-]|spanish|español/.test(combined)) return 'ES'
  if (/(^|[\s_\-])jp[\s_\-]|japanese|japan/.test(combined)) return 'JA'

  return null
}

// ── Language metadata ─────────────────────────────────────────────────────────

export const LANGUAGE_META = {
  EN: { flag: '🇬🇧', label: 'English' },
  DE: { flag: '🇩🇪', label: 'Deutsch' },
  FR: { flag: '🇫🇷', label: 'Français' },
  IT: { flag: '🇮🇹', label: 'Italiano' },
  ES: { flag: '🇪🇸', label: 'Español' },
  JA: { flag: '🇯🇵', label: '日本語' },
  PT: { flag: '🇵🇹', label: 'Português' },
  ZH: { flag: '🇨🇳', label: '中文' },
  KO: { flag: '🇰🇷', label: '한국어' },
}

export function langFlag(code) {
  return (LANGUAGE_META[code] || {}).flag || '🌐'
}

export function langLabel(code) {
  return (LANGUAGE_META[code] || {}).label || code
}
