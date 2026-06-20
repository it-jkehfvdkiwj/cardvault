import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Star, Trash2, Plus, CheckCircle, ExternalLink, TrendingUp, Loader } from 'lucide-react'
import { Link } from 'react-router-dom'
import { wantlistApi, cardsApi, pricesApi } from '../api/client'
import SearchBar from '../components/SearchBar'
import RarityBadge from '../components/RarityBadge'

export default function WantlistPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [addQuery, setAddQuery] = useState('')
  const [addResults, setAddResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [prices, setPrices] = useState({})
  const [loadingPrices, setLoadingPrices] = useState(false)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await wantlistApi.list({ search })
      setItems(data.items)
    } catch {
      toast.error('Failed to load wantlist')
    }
    setLoading(false)
  }, [search])

  useEffect(() => {
    const t = setTimeout(fetchList, 250)
    return () => clearTimeout(t)
  }, [fetchList])

  async function handleSearch() {
    if (!addQuery.trim()) return
    setSearching(true)
    try {
      const { data } = await cardsApi.search(addQuery)
      setAddResults(data.candidates || [])
    } catch {
      setAddResults([])
    }
    setSearching(false)
  }

  async function handleAdd(card) {
    try {
      await wantlistApi.add({
        tcg_card_id: card.id,
        name: card.name,
        set_name: card.set?.name,
        set_code: card.set?.id,
        rarity: card.rarity,
        image_url: card.images?.small,
      })
      toast.success(`${card.name} added to wantlist`)
      fetchList()
    } catch {
      toast.error('Failed to add to wantlist')
    }
  }

  async function loadPrices() {
    if (loadingPrices || !items.length) return
    setLoadingPrices(true)
    const fresh = {}
    for (const item of items) {
      if (!item.tcg_card_id || item.tcg_card_id.startsWith('cm-')) continue
      try {
        const { data } = await pricesApi.get(item.tcg_card_id)
        fresh[item.tcg_card_id] = data.trend_eur ?? data.sell_eur ?? null
      } catch {}
      await new Promise((r) => setTimeout(r, 80))
    }
    setPrices(fresh)
    setLoadingPrices(false)
  }

  async function handleRemove(id, name) {
    try {
      await wantlistApi.remove(id)
      toast.success(`${name} removed`)
      setItems((prev) => prev.filter((i) => i.id !== id))
    } catch {
      toast.error('Failed to remove')
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star className="text-pokemon-yellow w-6 h-6" /> Wantlist
          </h1>
          <p className="text-gray-400 text-sm mt-1">{items.length} card{items.length !== 1 ? 's' : ''} wanted</p>
        </div>
        <div className="flex gap-2">
          {items.length > 0 && (
            <button
              onClick={loadPrices}
              disabled={loadingPrices}
              className="btn-secondary flex items-center gap-2"
              title="Aktuelle Preise von Cardmarket laden"
            >
              {loadingPrices
                ? <Loader className="w-4 h-4 animate-spin" />
                : <TrendingUp className="w-4 h-4" />}
              {loadingPrices ? 'Lädt…' : 'Preise'}
            </button>
          )}
          <button onClick={() => setShowAdd((v) => !v)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Card
          </button>
        </div>
      </div>

      {/* Add panel */}
      {showAdd && (
        <div className="panel space-y-3">
          <h2 className="font-semibold">Search & Add</h2>
          <div className="flex gap-2">
            <input
              value={addQuery}
              onChange={(e) => setAddQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Card name…"
              className="input flex-1"
            />
            <button onClick={handleSearch} disabled={searching} className="btn-primary">
              {searching ? '…' : 'Search'}
            </button>
          </div>
          {addResults.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {addResults.slice(0, 9).map((card) => (
                <div key={card.id} className="bg-gray-800 rounded-lg p-2 flex gap-2">
                  {card.images?.small && (
                    <img src={card.images.small} alt={card.name} className="w-12 h-auto rounded object-cover" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{card.name}</p>
                    <p className="text-xs text-gray-500 truncate">{card.set?.name}</p>
                    <RarityBadge rarity={card.rarity} />
                    <button
                      onClick={() => handleAdd(card)}
                      className="mt-1 text-xs bg-pokemon-yellow/20 text-pokemon-yellow hover:bg-pokemon-yellow/40 px-2 py-0.5 rounded transition-colors"
                    >
                      + Want
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filter */}
      <SearchBar value={search} onChange={setSearch} placeholder="Filter wantlist…" />

      {/* List */}
      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <Star className="w-10 h-10 mx-auto mb-2 text-gray-700" />
          <p>Your wantlist is empty</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={`panel flex items-center gap-4 ${item.in_collection ? 'border-green-900/40' : ''}`}
            >
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} className="w-12 h-auto rounded" />
              ) : (
                <div className="w-12 h-16 bg-gray-800 rounded flex items-center justify-center text-2xl">🃏</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold truncate">{item.name}</p>
                  {item.in_collection ? (
                    <Link
                      to={`/card/${item.owned_card_id}`}
                      className="flex items-center gap-1 text-green-400 text-xs font-semibold hover:text-green-300"
                    >
                      <CheckCircle className="w-3 h-3" /> In Sammlung
                    </Link>
                  ) : (
                    <Link
                      to={`/upload`}
                      className="flex items-center gap-1 text-gray-500 text-xs hover:text-pokemon-yellow"
                      title="Karte scannen"
                    >
                      <ExternalLink className="w-3 h-3" /> Scannen
                    </Link>
                  )}
                </div>
                <p className="text-sm text-gray-400">{item.set_name}</p>
                <RarityBadge rarity={item.rarity} />
              </div>
              {prices[item.tcg_card_id] != null && (
                <span className="text-sm font-bold text-pokemon-yellow shrink-0 mx-2">
                  {prices[item.tcg_card_id].toFixed(2).replace('.', ',')} €
                </span>
              )}
              <button
                onClick={() => handleRemove(item.id, item.name)}
                className="text-gray-600 hover:text-red-400 transition-colors shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
