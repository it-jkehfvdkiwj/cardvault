import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Download, RefreshCw, ShoppingBag, ScanLine, Crown,
  CheckSquare, Tag, Trash2, X, TrendingUp, Sparkles,
} from 'lucide-react'
import { cardsApi, pricesApi, downloadBlob } from '../api/client'
import CardGrid from '../components/CardGrid'
import SearchBar from '../components/SearchBar'
import EbayExportModal from '../components/EbayExportModal'
import { useAuth } from '../auth/AuthContext'

const SORTS = [
  { value: 'added_at', label: 'Datum' },
  { value: 'name', label: 'Name' },
  { value: 'market_price_eur', label: 'Wert (EUR)' },
  { value: 'market_price_usd', label: 'Wert (USD)' },
  { value: 'rarity', label: 'Seltenheit' },
]

const RARITIES = [
  'Common', 'Uncommon', 'Rare', 'Rare Holo', 'Rare Holo V',
  'Rare Holo VMAX', 'Rare Holo VSTAR', 'Ultra Rare', 'Secret Rare',
  'Amazing Rare', 'Hyper Rare',
]

const CONDITIONS = ['Mint', 'Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged']

export default function CollectionPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [cards, setCards] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [rarity, setRarity] = useState(searchParams.get('rarity') || '')
  const [condition, setCondition] = useState(searchParams.get('condition') || '')
  const [sort, setSort] = useState('added_at')
  const [order, setOrder] = useState('desc')
  const [forTradeOnly, setForTradeOnly] = useState(false)
  const [foilOnly, setFoilOnly] = useState(false)
  const [showEbay, setShowEbay] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [ebayCardIds, setEbayCardIds] = useState(null)
  const [refreshingPrices, setRefreshingPrices] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [ownedSets, setOwnedSets] = useState([])
  const [setFilter, setSetFilter] = useState('')

  const PAGE = 200

  useEffect(() => {
    cardsApi.setsOwned().then(({ data }) => setOwnedSets(data)).catch(() => {})
  }, [])

  const fetchCards = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await cardsApi.list({
        search, rarity, condition, sort, order, limit: PAGE,
        ...(setFilter ? { set_name: setFilter } : {}),
        ...(forTradeOnly ? { for_trade: true } : {}),
        ...(foilOnly ? { is_foil: true } : {}),
      })
      setCards(data.cards)
      setTotal(data.total)
    } catch {
      toast.error('Failed to load collection')
    }
    setLoading(false)
  }, [search, rarity, condition, sort, order, setFilter, forTradeOnly, foilOnly])

  async function loadMoreCards() {
    setLoadingMore(true)
    try {
      const { data } = await cardsApi.list({
        search, rarity, condition, sort, order,
        limit: PAGE, offset: cards.length,
        ...(setFilter ? { set_name: setFilter } : {}),
        ...(forTradeOnly ? { for_trade: true } : {}),
        ...(foilOnly ? { is_foil: true } : {}),
      })
      setCards((prev) => [...prev, ...data.cards])
    } catch {
      toast.error('Laden fehlgeschlagen')
    }
    setLoadingMore(false)
  }

  useEffect(() => {
    const t = setTimeout(fetchCards, 250)
    return () => clearTimeout(t)
  }, [fetchCards])

  async function handleExport(format) {
    try {
      if (format === 'csv') {
        const { data } = await cardsApi.exportCsv()
        downloadBlob(data, 'cardvault_collection.csv')
      } else if (format === 'pdf') {
        const { data } = await cardsApi.exportPdf()
        downloadBlob(data, 'cardvault_collection.pdf')
      } else {
        const { data } = await cardsApi.exportJson()
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        downloadBlob(blob, 'cardvault_collection.json')
      }
      toast.success(`Exported as ${format.toUpperCase()}`)
    } catch {
      toast.error('Export failed')
    }
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }
  function clearSelection() { setSelectedIds([]); setSelectMode(false) }
  function selectAll() { setSelectedIds(cards.map((c) => c.id)) }

  async function bulkSetTrade(forTrade) {
    try {
      await cardsApi.bulkUpdate({ ids: selectedIds, for_trade: forTrade })
      toast.success(`${selectedIds.length} Karte(n) ${forTrade ? 'zum Verkauf markiert' : 'aus Verkauf entfernt'}`)
      clearSelection(); fetchCards()
    } catch { toast.error('Aktion fehlgeschlagen') }
  }

  async function bulkDelete() {
    if (!confirm(`${selectedIds.length} Karte(n) wirklich löschen?`)) return
    try {
      await cardsApi.bulkDelete(selectedIds)
      toast.success(`${selectedIds.length} Karte(n) gelöscht`)
      clearSelection(); fetchCards()
    } catch { toast.error('Löschen fehlgeschlagen') }
  }

  function exportSelected() {
    if (!selectedIds.length) return
    setEbayCardIds(selectedIds)
    setShowEbay(true)
  }

  async function bulkRefreshPrices() {
    if (refreshingPrices) return
    const ids = selectedIds.length ? selectedIds : null
    const label = ids ? `${ids.length} Karten` : 'alle Karten'
    setRefreshingPrices(true)
    const toastId = toast.loading(`Preise werden aktualisiert (${label})…`)
    try {
      const { data } = await pricesApi.bulkRefresh(ids)
      toast.success(
        `${data.refreshed} von ${data.unique_cards} Karten aktualisiert` +
        (data.errors ? ` · ${data.errors} Fehler` : ''),
        { id: toastId },
      )
      fetchCards()
      if (selectMode) clearSelection()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Preisabfrage fehlgeschlagen', { id: toastId })
    }
    setRefreshingPrices(false)
  }

  const totalValueEur = cards.reduce(
    (sum, c) => sum + ((c.market_price_eur || c.price_trend_eur || 0) * c.quantity), 0
  )

  // Use server-computed usage (always reflects real card count, ignores active filters)
  const cardLimit = user?.usage?.card_limit ?? null
  const remaining = user?.usage?.cards_remaining ?? null
  const hasFilters = !!(search || rarity || condition || setFilter || forTradeOnly || foilOnly)
  const isEmptyCollection = !loading && total === 0 && !hasFilters

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Collection</h1>
          <p className="text-gray-400 text-sm">
            {total} Karte{total !== 1 ? 'n' : ''} · Sammlungswert{' '}
            <span className="text-pokemon-yellow font-semibold">
              {totalValueEur.toFixed(2).replace('.', ',')} €
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchCards} className="btn-ghost" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {user?.features?.bulk_price_refresh ? (
            <button
              onClick={bulkRefreshPrices}
              disabled={refreshingPrices}
              className="btn-secondary flex items-center gap-2"
              title="Preise aller Karten aktualisieren (Pro)"
            >
              <TrendingUp className={`w-4 h-4 ${refreshingPrices ? 'animate-pulse' : ''}`} />
              Preise
            </button>
          ) : (
            <Link to="/pricing" className="btn-ghost flex items-center gap-1.5 text-sm text-gray-500" title="Pro: Preise aktualisieren">
              <TrendingUp className="w-4 h-4" />
            </Link>
          )}
          <button
            onClick={() => { setSelectMode((v) => !v); setSelectedIds([]) }}
            className={selectMode ? 'btn-primary flex items-center gap-2' : 'btn-secondary flex items-center gap-2'}
          >
            <CheckSquare className="w-4 h-4" /> {selectMode ? 'Fertig' : 'Auswählen'}
          </button>
          <button onClick={() => { setEbayCardIds(null); setShowEbay(true) }} className="btn-primary flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" /> Sell on eBay
          </button>
          <div className="relative group">
            <button className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" /> Export
            </button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 min-w-[120px]">
              {['csv', 'pdf', 'json'].map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => handleExport(fmt)}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-700 first:rounded-t-lg last:rounded-b-lg"
                >
                  {fmt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Plan limit banner (free users near/at the cap) */}
      {remaining != null && remaining <= 10 && (
        <div className={`panel flex items-center justify-between gap-3 ${
          remaining <= 0 ? 'border-pokemon-red/50' : 'border-pokemon-yellow/40'
        }`}>
          <p className="text-sm text-gray-300">
            {remaining <= 0
              ? `Du hast dein Limit von ${cardLimit} Karten erreicht.`
              : `Nur noch ${remaining} von ${cardLimit} Karten frei.`}{' '}
            <span className="text-gray-400">Upgrade auf Pro für unbegrenzte Karten.</span>
          </p>
          <Link to="/pricing" className="btn-primary shrink-0 flex items-center gap-1.5 text-sm">
            <Crown className="w-4 h-4" /> Upgrade
          </Link>
        </div>
      )}

      {/* Selection toolbar */}
      {selectMode && (
        <div className="panel sticky top-2 z-20 flex flex-wrap items-center gap-2 border-pokemon-yellow/40">
          <span className="text-sm font-semibold">{selectedIds.length} ausgewählt</span>
          <button onClick={selectAll} className="text-xs text-gray-400 hover:text-white">Alle</button>
          <button onClick={() => setSelectedIds([])} className="text-xs text-gray-400 hover:text-white">Keine</button>
          <div className="flex-1" />
          <button onClick={() => bulkSetTrade(true)} disabled={!selectedIds.length} className="btn-secondary text-sm flex items-center gap-1.5 disabled:opacity-40">
            <Tag className="w-4 h-4" /> Zum Verkauf
          </button>
          <button onClick={() => bulkSetTrade(false)} disabled={!selectedIds.length} className="btn-ghost text-sm disabled:opacity-40">
            Aus Verkauf
          </button>
          {user?.features?.bulk_price_refresh && (
            <button
              onClick={bulkRefreshPrices}
              disabled={!selectedIds.length || refreshingPrices}
              className="btn-ghost text-sm flex items-center gap-1.5 disabled:opacity-40"
            >
              <TrendingUp className="w-4 h-4" /> Preise
            </button>
          )}
          <button onClick={exportSelected} disabled={!selectedIds.length} className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-40">
            <ShoppingBag className="w-4 h-4" /> eBay ({selectedIds.length})
          </button>
          <button onClick={bulkDelete} disabled={!selectedIds.length} className="text-sm text-pokemon-red hover:text-red-400 flex items-center gap-1.5 disabled:opacity-40 px-2">
            <Trash2 className="w-4 h-4" /> Löschen
          </button>
          <button onClick={clearSelection} className="text-gray-500 hover:text-white px-1"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <SearchBar value={search} onChange={setSearch} />
        </div>
        {ownedSets.length > 1 && (
          <select value={setFilter} onChange={(e) => setSetFilter(e.target.value)} className="input w-48">
            <option value="">All Sets</option>
            {ownedSets.map((s) => (
              <option key={s.code || s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        )}
        <select value={rarity} onChange={(e) => setRarity(e.target.value)} className="input w-44">
          <option value="">All Rarities</option>
          {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={condition} onChange={(e) => setCondition(e.target.value)} className="input w-44">
          <option value="">All Conditions</option>
          {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={`${sort}:${order}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split(':')
            setSort(s)
            setOrder(o)
          }}
          className="input w-44"
        >
          {SORTS.map(({ value, label }) => (
            <>
              <option key={`${value}:desc`} value={`${value}:desc`}>{label} ↓</option>
              <option key={`${value}:asc`} value={`${value}:asc`}>{label} ↑</option>
            </>
          ))}
        </select>
        <button
          onClick={() => setForTradeOnly((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
            forTradeOnly
              ? 'bg-blue-900/40 border-blue-500/60 text-blue-300'
              : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
          }`}
        >
          <Tag className="w-4 h-4" /> Zum Verkauf
        </button>
        <button
          onClick={() => setFoilOnly((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
            foilOnly
              ? 'bg-pokemon-yellow/20 border-pokemon-yellow/60 text-pokemon-yellow'
              : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
          }`}
        >
          <Sparkles className="w-4 h-4" /> Foil
        </button>
      </div>

      {loading && !cards.length ? (
        <div className="flex justify-center py-20 text-gray-500">Loading…</div>
      ) : isEmptyCollection ? (
        <div className="flex flex-col items-center justify-center text-center py-20 px-4">
          <div className="w-16 h-16 rounded-2xl bg-pokemon-yellow/15 flex items-center justify-center mb-4">
            <ScanLine className="w-8 h-8 text-pokemon-yellow" />
          </div>
          <h2 className="text-xl font-bold">Deine Sammlung ist noch leer</h2>
          <p className="text-gray-400 text-sm mt-1 max-w-sm">
            Scanne deine erste Karte — per Foto-Upload oder direkt mit der Kamera.
            Wir erkennen sie automatisch und holen den aktuellen Wert.
          </p>
          <Link to="/upload" className="btn-primary mt-5 flex items-center gap-2">
            <ScanLine className="w-4 h-4" /> Erste Karte scannen
          </Link>
        </div>
      ) : (
        <>
          <CardGrid
            cards={cards}
            selectable={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
          />
          {cards.length < total && (
            <div className="flex flex-col items-center gap-1 pt-2">
              <p className="text-xs text-gray-500">{cards.length} von {total} Karten geladen</p>
              <button
                onClick={loadMoreCards}
                disabled={loadingMore}
                className="btn-secondary flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loadingMore ? 'animate-spin' : ''}`} />
                {loadingMore ? 'Lädt…' : `Weitere ${Math.min(PAGE, total - cards.length)} laden`}
              </button>
            </div>
          )}
        </>
      )}

      {showEbay && (
        <EbayExportModal
          cardIds={ebayCardIds}
          forTradeDefault={false}
          onClose={() => { setShowEbay(false); setEbayCardIds(null) }}
        />
      )}
    </div>
  )
}
