import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Vault, Loader, ArrowLeftRight, Sparkles, Euro, Search } from 'lucide-react'
import { publicApi } from '../api/client'
import RarityBadge from '../components/RarityBadge'
import LanguageBadge from '../components/LanguageBadge'

export default function PublicCollectionPage() {
  const { slug } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [tradeOnly, setTradeOnly] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    setLoading(true)
    publicApi.get(slug, tradeOnly)
      .then(({ data }) => setData(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [slug, tradeOnly])

  const eur = (n) => `${(n || 0).toFixed(2).replace('.', ',')} €`

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto w-full">
        <Link to="/" className="flex items-center gap-2">
          <Vault className="text-pokemon-yellow w-6 h-6" />
          <span className="font-bold text-lg text-pokemon-yellow">CardVault</span>
        </Link>
        <Link to="/login?mode=register" className="btn-primary text-sm">Eigene Sammlung starten</Link>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-4">
        {loading ? (
          <div className="flex justify-center py-24 text-gray-500"><Loader className="w-6 h-6 animate-spin" /></div>
        ) : error || !data ? (
          <div className="text-center py-24">
            <p className="text-5xl mb-4">🔒</p>
            <h1 className="text-xl font-bold">Sammlung nicht gefunden</h1>
            <p className="text-gray-400 text-sm mt-1">Dieser Link ist ungültig oder die Sammlung ist privat.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
              <div>
                <h1 className="text-2xl font-bold">{data.owner_name}s Sammlung</h1>
                <p className="text-gray-400 text-sm">
                  {data.card_count} Karten · {data.unique_count} verschieden
                  {data.total_value_eur > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-pokemon-yellow font-semibold">
                      <Euro className="w-3.5 h-3.5" /> {eur(data.total_value_eur)}
                    </span>
                  )}
                </p>
              </div>
              {data.for_trade_count > 0 && (
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={tradeOnly} onChange={(e) => setTradeOnly(e.target.checked)} className="rounded" />
                  Nur zum Verkauf ({data.for_trade_count})
                </label>
              )}
            </div>

            {/* Search */}
            <div className="relative mb-5">
              <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="input pl-9 w-full max-w-xs"
                placeholder="Karte suchen…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {(() => {
              const q = query.trim().toLowerCase()
              const visible = q
                ? data.cards.filter(
                    (c) => c.name.toLowerCase().includes(q) || (c.set_name || '').toLowerCase().includes(q)
                  )
                : data.cards
              return visible.length === 0 ? (
                <p className="text-center text-gray-500 py-16">
                  {q ? `Keine Karten für „${query}"` : 'Keine Karten zu zeigen.'}
                </p>
              ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {visible.map((c) => (
                  <div key={c.id} className="panel p-2 flex flex-col gap-2">
                    <div className="relative aspect-[2.5/3.5] rounded-lg overflow-hidden bg-gray-900">
                      {c.image_url
                        ? <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                        : <div className="w-full h-full flex items-center justify-center text-4xl text-gray-700">🃏</div>}
                      {c.quantity > 1 && (
                        <span className="absolute top-1 right-1 bg-black/80 text-white text-xs font-bold px-1.5 py-0.5 rounded">×{c.quantity}</span>
                      )}
                      <div className="absolute bottom-1 left-1 flex gap-1">
                        {c.is_foil && <span className="bg-pokemon-yellow/90 text-black rounded p-0.5"><Sparkles className="w-3 h-3" /></span>}
                        {c.for_trade && <span className="bg-blue-500/90 text-white rounded p-0.5"><ArrowLeftRight className="w-3 h-3" /></span>}
                      </div>
                    </div>
                    <div className="px-0.5 space-y-1">
                      <p className="text-xs font-semibold text-white leading-tight line-clamp-2">{c.name}</p>
                      <p className="text-xs text-gray-500 truncate">{c.set_name}</p>
                      <div className="flex flex-wrap gap-1">
                        <RarityBadge rarity={c.rarity} />
                        <LanguageBadge language={c.language} />
                      </div>
                      {c.price_eur != null && (
                        <p className="text-xs font-bold text-pokemon-yellow">{eur(c.price_eur)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              )
            })()}
          </>
        )}
      </main>

      <footer className="border-t border-gray-800 px-6 py-5 text-center text-xs text-gray-600">
        Erstellt mit <Link to="/" className="text-pokemon-yellow hover:underline">CardVault</Link>
      </footer>
    </div>
  )
}
