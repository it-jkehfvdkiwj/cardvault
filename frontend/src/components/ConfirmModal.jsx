import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Check, ChevronDown, ChevronUp, Globe, Loader, ExternalLink, Layers, ScanLine, AlertTriangle } from 'lucide-react'
import RarityBadge from './RarityBadge'
import LanguageBadge from './LanguageBadge'
import { ConditionSelect } from './ConditionBadge'
import { cardsApi } from '../api/client'
import {
  detectCardLanguage,
  langFlag,
  langLabel,
  translateToEnglish,
  LANGUAGE_META,
} from '../data/nameTranslations'

// ── Constants ─────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'EN', label: 'English', flag: '🇬🇧' },
  { code: 'DE', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'FR', label: 'Français', flag: '🇫🇷' },
  { code: 'IT', label: 'Italiano', flag: '🇮🇹' },
  { code: 'ES', label: 'Español', flag: '🇪🇸' },
]

const LANG_STORAGE_KEY = 'cardvault_search_language'
function loadStoredLang() {
  try { return localStorage.getItem(LANG_STORAGE_KEY) || 'EN' } catch { return 'EN' }
}
function saveLang(code) {
  try { localStorage.setItem(LANG_STORAGE_KEY, code) } catch {}
}

// Remember the physical-card language separately so sellers of (e.g.) German
// cards don't have to re-pick "DE" on every single card.
const CARD_LANG_STORAGE_KEY = 'cardvault_card_language'
function loadStoredCardLang() {
  try { return localStorage.getItem(CARD_LANG_STORAGE_KEY) || 'EN' } catch { return 'EN' }
}
function saveCardLang(code) {
  try { localStorage.setItem(CARD_LANG_STORAGE_KEY, code) } catch {}
}

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ source }) {
  if (source === 'set_number')
    return <span className="badge bg-emerald-800 text-emerald-200 text-[10px]">🔢 Set#</span>
  if (source === 'number_total')
    return <span className="badge bg-teal-800 text-teal-200 text-[10px]">🔢 #/Total</span>
  if (source === 'phash')
    return <span className="badge bg-emerald-800 text-emerald-200 text-[10px]">📸 Visual</span>
  if (source === 'cardmarket')
    return <span className="badge bg-blue-800 text-blue-200 text-[10px]">CM</span>
  if (source === 'tcg_variant')
    return <span className="badge bg-purple-800 text-purple-200 text-[10px]">Variant</span>
  return <span className="badge bg-gray-700 text-gray-400 text-[10px]">TCG</span>
}

// ── Single result row ─────────────────────────────────────────────────────────

function CandidateRow({ card, isSelected, onSelect, showLang = false }) {
  const imgUrl = card.images?.small || card.images?.large
  const price = card.price_trend_eur ?? card.price_sell_eur

  return (
    <button
      onClick={() => onSelect(card)}
      className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all border-2 ${
        isSelected
          ? 'border-pokemon-yellow bg-pokemon-yellow/5'
          : 'border-transparent hover:border-gray-600 hover:bg-white/5'
      }`}
    >
      {/* Thumbnail */}
      <div className="shrink-0 w-10 h-14 rounded overflow-hidden bg-gray-900 flex items-center justify-center">
        {imgUrl ? (
          <img src={imgUrl} alt={card.name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="text-gray-700 text-lg">🃏</span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-sm text-white leading-tight">
            {card.loc_name && card.loc_name !== card.name
              ? `${card.loc_name} / ${card.name}`
              : card.name}
          </span>
          {isSelected && <Check className="w-3 h-3 text-pokemon-yellow shrink-0" />}
        </div>
        <p className="text-xs text-gray-400 truncate">{card.set?.name}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <RarityBadge rarity={card.rarity} />
          <SourceBadge source={card._source} />
          {showLang && card._language && card._language !== 'EN' && (
            <LanguageBadge language={card._language} forceShow />
          )}
          {card._confidence != null && (
            <span className="badge bg-gray-700 text-gray-400 text-[10px]">{card._confidence}%</span>
          )}
        </div>
      </div>

      {/* Price */}
      {price != null && (
        <div className="shrink-0 text-right">
          <p className="text-xs text-gray-500">Trend</p>
          <p className="text-sm font-bold text-pokemon-yellow">€{price.toFixed(2)}</p>
        </div>
      )}
      {card.cm_url && (
        <a
          href={card.cm_url} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-gray-500 hover:text-blue-400"
          title="View on Cardmarket"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </button>
  )
}

// ── Language variants section ─────────────────────────────────────────────────

function LanguageVariantsSection({ variants, active, onSelect, autoExpand }) {
  const [expanded, setExpanded] = useState(autoExpand)
  const [filterLang, setFilterLang] = useState('ALL')
  const deRef = useRef(null)

  // Auto-scroll to DE row when auto-expanding due to detected German card
  useEffect(() => {
    if (autoExpand && expanded && deRef.current) {
      deRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [autoExpand, expanded])

  if (!variants || variants.length === 0) return null

  // Group by language
  const grouped = {}
  for (const card of variants) {
    const lang = card._language || 'EN'
    if (!grouped[lang]) grouped[lang] = []
    grouped[lang].push(card)
  }

  const langOrder = ['JA', 'DE', 'FR', 'IT', 'ES', 'EN']
  const sortedLangs = Object.keys(grouped).sort(
    (a, b) => langOrder.indexOf(a) - langOrder.indexOf(b)
  )

  const displayLangs = filterLang === 'ALL' ? sortedLangs : sortedLangs.filter((l) => l === filterLang)

  return (
    <div className="border-t border-gray-800 pt-4" ref={autoExpand ? deRef : null}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white font-medium w-full"
      >
        <Layers className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left">
          Other language versions
          <span className="ml-2 text-gray-600 font-normal">({variants.length})</span>
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Language filter pills */}
          {sortedLangs.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilterLang('ALL')}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  filterLang === 'ALL'
                    ? 'bg-gray-600 border-gray-600 text-white'
                    : 'border-gray-700 text-gray-500 hover:border-gray-500'
                }`}
              >
                All
              </button>
              {sortedLangs.map((lang) => (
                <button
                  key={lang}
                  onClick={() => setFilterLang(lang)}
                  className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                    filterLang === lang
                      ? 'bg-gray-600 border-gray-600 text-white'
                      : 'border-gray-700 text-gray-500 hover:border-gray-500'
                  }`}
                >
                  {langFlag(lang)} {lang}
                  <span className="ml-1 text-gray-600">({grouped[lang].length})</span>
                </button>
              ))}
            </div>
          )}

          {/* Cards per language group */}
          {displayLangs.map((lang) => (
            <div key={lang}>
              <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-1 px-1">
                {langFlag(lang)} {langLabel(lang)}
              </p>
              <div className="space-y-0.5">
                {grouped[lang].slice(0, 8).map((card) => (
                  <CandidateRow
                    key={card.id}
                    card={card}
                    isSelected={active?.id === card.id}
                    onSelect={onSelect}
                    showLang
                  />
                ))}
                {grouped[lang].length > 8 && (
                  <p className="text-xs text-gray-600 px-3 py-1">
                    + {grouped[lang].length - 8} more printings
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function ConfirmModal({ result, onConfirm, onSkip, ownedMap = {} }) {
  const [selected, setSelected] = useState(null)
  const [condition, setCondition] = useState('Near Mint')
  const [isFoil, setIsFoil] = useState(false)
  const [quantity, setQuantity] = useState(1)

  // ── Language of the physical card being added ─────────────────────────────
  // Auto-set from backend detection; user can override.
  const [cardLanguage, setCardLanguageState] = useState(() => {
    // Backend-detected language wins; otherwise fall back to the seller's last
    // chosen card language (handy when cards are identified by set number and
    // no language could be detected from the name).
    const detected = result?.detected_language
    if (detected && detected !== 'EN') return detected
    return loadStoredCardLang()
  })
  // Persist the choice so the next card defaults to the same language.
  function setCardLanguage(code) {
    setCardLanguageState(code)
    saveCardLang(code)
  }

  // ── Search UI language (for manual search) ────────────────────────────────
  const [searchLang, setSearchLang] = useState(loadStoredLang)

  // Manual search — auto-open and pre-fill when we couldn't auto-detect anything,
  // so a bad photo immediately lands on a searchable guess.
  const [showSearch, setShowSearch] = useState(
    () => (result?.candidates?.length ?? 0) === 0,
  )
  const [searchQuery, setSearchQuery] = useState(
    () => result?.ocr_name_translated || result?.ocr_name || '',
  )
  const [searchSetCode, setSearchSetCode] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchPage, setSearchPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [searching, setSearching] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [cmAvailable, setCmAvailable] = useState(false)
  const [sets, setSets] = useState([])
  const setsLoadedRef = useRef(false)

  const candidates = result?.candidates || []
  const active = selected ?? candidates[0] ?? searchResults[0] ?? null

  // Language variants are fetched lazily (kept off the scan hot path so the scan
  // returns fast); they fill the collapsed "Other language versions" panel a
  // moment after the match is on screen.
  const [languageVariants, setLanguageVariants] = useState(result?.language_variants || [])
  useEffect(() => {
    if (languageVariants.length) return
    const id = candidates[0]?.id
    if (!id || String(id).startsWith('cm-')) return
    let cancelled = false
    cardsApi.scanVariants(id)
      .then(({ data }) => { if (!cancelled) setLanguageVariants(data.variants || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Localized name of the active card for the chosen card language (the TCG API
  // is English-only, so e.g. "Arboliva" → "Olithena" for a German card).
  const [localizedName, setLocalizedName] = useState(null)
  useEffect(() => {
    setLocalizedName(null)
    if (!active?.name || cardLanguage === 'EN') return
    if (String(active.id || '').startsWith('cm-')) return // CM names already local
    const dex = (active.nationalPokedexNumbers || []).join(',')
    let cancelled = false
    cardsApi.localizeName(active.name, cardLanguage, dex)
      .then(({ data }) => { if (!cancelled && data?.name) setLocalizedName(data.name) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [active?.id, cardLanguage])

  // Auto-expand variants section when the backend detected a non-EN card
  const autoExpandVariants = !!(result?.detected_language && result.detected_language !== 'EN')

  // Load sets lazily
  useEffect(() => {
    if (showSearch && !setsLoadedRef.current) {
      setsLoadedRef.current = true
      cardsApi.sets().then(({ data }) => setSets(data.sets || [])).catch(() => {})
    }
  }, [showSearch])

  function handleSearchLangChange(code) {
    setSearchLang(code)
    saveLang(code)
    if (showSearch && searchQuery.trim()) {
      runSearch(searchQuery, searchSetCode, code, 1, false)
    }
  }

  async function runSearch(query, setCode, lang, page, append) {
    if (!query.trim()) return
    if (append) setLoadingMore(true)
    else setSearching(true)

    // When DE (or other non-EN) is selected but Cardmarket is not configured,
    // fall back to the TCG API using a German→English translation so results
    // still appear instead of returning nothing.
    const effectiveLang = (!cmAvailable && lang !== 'EN') ? 'EN' : lang
    const effectiveQuery = (effectiveLang === 'EN' && lang !== 'EN')
      ? translateToEnglish(query.trim(), lang)
      : query.trim()

    try {
      const { data } = await cardsApi.search(effectiveQuery, {
        setCode: setCode || undefined,
        language: effectiveLang,
        page,
      })
      const incoming = data.candidates || []
      setSearchResults((prev) => append ? [...prev, ...incoming] : incoming)
      setHasMore(data.has_more || false)
      setCmAvailable(data.cm_available || false)
      setSearchPage(page)
    } catch {
      if (!append) setSearchResults([])
    }
    setSearching(false)
    setLoadingMore(false)
  }

  function handleSearch() { runSearch(searchQuery, searchSetCode, searchLang, 1, false) }
  function handleLoadMore() { runSearch(searchQuery, searchSetCode, searchLang, searchPage + 1, true) }

  const handleConfirm = useCallback(() => {
    if (!active) return
    onConfirm({
      tcg_card_id: active.id,
      name: localizedName || active.name,
      set_name: active.set?.name,
      set_code: active.set?.id,
      rarity: active.rarity,
      card_type: active.types?.join(', '),
      hp: active.hp,
      image_url: active.images?.large || active.images?.small,
      condition,
      quantity,
      is_foil: isFoil,
      for_trade: false,
      language: cardLanguage,
      cm_product_id: active.cm_id || null,
    })
  }, [active, localizedName, condition, quantity, isFoil, cardLanguage, onConfirm])

  // Keyboard shortcuts: Enter = confirm, Escape = skip
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
      if (e.key === 'Enter' && active) { e.preventDefault(); handleConfirm() }
      if (e.key === 'Escape') { e.preventDefault(); onSkip() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, handleConfirm, onSkip])

  const owned = active?.id ? ownedMap[active.id] : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-pokemon-card border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            {result?.thumbnail_url && (
              <img
                src={result.thumbnail_url}
                alt="Uploaded card"
                className="w-10 h-14 rounded object-cover border border-gray-700 shrink-0"
              />
            )}
            <div className="min-w-0">
              <h2 className="font-bold text-lg">Confirm Card Match</h2>
              <p className="text-sm text-gray-400 truncate">
                {result?.filename}
                {result?.identification_method === 'set_number' ? null : (
                  <>
                    {result?.ocr_name ? ` · OCR: "${result.ocr_name}"` : ''}
                    {result?.ocr_name_translated && result.ocr_name_translated !== result.ocr_name
                      ? <span className="text-blue-400"> → "{result.ocr_name_translated}"</span>
                      : null}
                    {result?.identification_method === 'phash' && (
                      <span className="ml-1 text-emerald-400 font-medium">· visual match</span>
                    )}
                  </>
                )}
              </p>
              {result?.identification_method === 'set_number' && (
                <span className="inline-flex items-center gap-1 mt-0.5 text-xs font-semibold text-emerald-400 bg-emerald-900/40 border border-emerald-700/50 rounded-full px-2.5 py-0.5">
                  <ScanLine className="w-3 h-3" />
                  ✓ Identified from card number
                </span>
              )}
            </div>
          </div>
          <button onClick={onSkip} className="ml-3 text-gray-500 hover:text-white shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* ── Card language selector (language of the physical card) ── */}
          <div className="flex items-center gap-2 flex-wrap">
            <Globe className="w-4 h-4 text-gray-500 shrink-0" />
            <span className="text-xs text-gray-400">Card language:</span>
            {Object.entries(LANGUAGE_META).map(([code, { flag, label }]) => (
              <button
                key={code}
                onClick={() => setCardLanguage(code)}
                title={label}
                className={`text-xs px-2 py-1 rounded-full font-medium transition-colors border ${
                  cardLanguage === code
                    ? 'bg-pokemon-yellow text-black border-pokemon-yellow'
                    : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
                }`}
              >
                {flag} {code}
              </button>
            ))}
          </div>

          {/* ── Auto-detected candidates ── */}
          {candidates.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                {result?.identification_method === 'set_number'
                  ? '✓ Matched card'
                  : candidates.length > 1
                    ? `Possible matches — pick your card (${candidates.length})`
                    : 'Best guess — confirm or search below'}
              </p>
              {result?.identification_method !== 'set_number' && candidates.length > 1 && (
                <p className="text-[11px] text-gray-500 mb-2 px-1">
                  Not 100% sure on this photo. Compare the thumbnails and select the
                  one that matches your card, or search manually below.
                </p>
              )}
              <div className="space-y-1">
                {candidates.map((card) => (
                  <CandidateRow
                    key={card.id}
                    card={card}
                    isSelected={active?.id === card.id}
                    onSelect={setSelected}
                  />
                ))}
              </div>
              {result?.identification_method === 'set_number' && (
                <p className="text-[11px] text-emerald-600/80 mt-1.5 px-1">
                  Card identified with high confidence via printed set code and collector number.
                  Just click <span className="font-semibold">Add to Collection</span> to confirm.
                </p>
              )}
            </div>
          ) : (
            <p className="text-center text-gray-500 py-4 text-sm">
              No auto-detected candidates — use manual search below.
            </p>
          )}

          {/* ── Language variants (same Pokémon, other printings) ── */}
          <LanguageVariantsSection
            variants={languageVariants}
            active={active}
            onSelect={setSelected}
            autoExpand={autoExpandVariants}
          />

          {/* ── Manual search ── */}
          <div className="border-t border-gray-800 pt-4">
            <button
              onClick={() => setShowSearch((v) => !v)}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white font-medium"
            >
              {showSearch ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Search manually
            </button>

            {showSearch && (
              <div className="mt-3 space-y-3">
                {/* Search language pills */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-500">Search via:</span>
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => handleSearchLangChange(l.code)}
                      title={l.label}
                      className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                        searchLang === l.code
                          ? 'bg-gray-600 border-gray-500 text-white'
                          : 'border-gray-700 text-gray-500 hover:border-gray-500'
                      }`}
                    >
                      {l.flag} {l.code}
                    </button>
                  ))}
                  {searchLang !== 'EN' && !cmAvailable && (
                    <p className="text-xs text-amber-600/80 leading-snug mt-1">
                      Deutsche Karten werden über die TCG API gesucht.{' '}
                      Für Cardmarket-Preise später API-Key hinterlegen.
                    </p>
                  )}
                </div>

                {/* Search input */}
                <div className="flex gap-2">
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Card name…"
                    className="input flex-1 min-w-0"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={searching || !searchQuery.trim()}
                    className="btn-primary flex items-center gap-1.5 shrink-0"
                  >
                    {searching ? <Loader className="w-4 h-4 animate-spin" /> : 'Search'}
                  </button>
                </div>

                {/* Set filter */}
                <select
                  value={searchSetCode}
                  onChange={(e) => setSearchSetCode(e.target.value)}
                  className="input text-sm"
                >
                  <option value="">All Sets</option>
                  {sets.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.series})</option>
                  ))}
                </select>

                {/* Results */}
                {searchResults.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
                      Search results
                      {searchLang !== 'EN' && cmAvailable && (
                        <span className="ml-2 text-blue-400 normal-case font-normal">
                          Cardmarket + TCG API
                        </span>
                      )}
                    </p>
                    {searchResults.map((card) => (
                      <CandidateRow
                        key={card.id}
                        card={card}
                        isSelected={active?.id === card.id}
                        onSelect={setSelected}
                      />
                    ))}
                    {hasMore && (
                      <button
                        onClick={handleLoadMore}
                        disabled={loadingMore}
                        className="w-full py-2 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        {loadingMore
                          ? <><Loader className="w-4 h-4 animate-spin" /> Loading…</>
                          : 'Load more results'}
                      </button>
                    )}
                  </div>
                )}
                {showSearch && searchQuery && !searching && searchResults.length === 0 && (
                  <p className="text-center text-sm text-gray-500 py-3">No results found</p>
                )}
              </div>
            )}
          </div>

          {/* ── Card options ── */}
          <div className="border-t border-gray-800 pt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Condition</label>
                <ConditionSelect value={condition} onChange={setCondition} />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Quantity</label>
                <input
                  type="number" min={1} max={999} value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="input"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox" checked={isFoil}
                onChange={(e) => setIsFoil(e.target.checked)}
                className="rounded"
              />
              ✨ Foil / Holo
            </label>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-gray-700 shrink-0">
          {owned && (
            <div className="flex items-center gap-2 px-5 py-2 bg-amber-900/20 border-b border-amber-700/30">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-300">
                Du besitzt diese Karte bereits ({owned.quantity}×). Trotzdem hinzufügen?
              </p>
            </div>
          )}
          <div className="flex items-center justify-between px-5 py-4">
            <div className="text-xs text-gray-500 truncate max-w-[60%]">
              {active ? (
                <>
                  Selected: <span className="text-white font-medium">{localizedName || active.name}</span>
                  {localizedName && localizedName !== active.name && (
                    <span className="text-gray-500"> ({active.name})</span>
                  )}
                  {cardLanguage !== 'EN' && (
                    <span className="ml-1">{langFlag(cardLanguage)}</span>
                  )}
                </>
              ) : 'No card selected'}
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={onSkip} className="btn-secondary">Skip</button>
              <button
                onClick={handleConfirm}
                disabled={!active}
                className={`btn-primary ${owned ? 'bg-amber-600 hover:bg-amber-500' : ''}`}
                title="Enter"
              >
                {owned ? 'Trotzdem hinzufügen' : 'Add to Collection'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
