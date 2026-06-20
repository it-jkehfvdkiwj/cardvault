import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Layers, Euro, Boxes, ArrowLeftRight, ScanLine, Grid,
  ShoppingBag, Crown, Star, Trophy,
} from 'lucide-react'
import { statsApi, cardsApi } from '../api/client'
import { useAuth } from '../auth/AuthContext'

function Stat({ icon: Icon, label, value, accent }) {
  return (
    <div className="panel">
      <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wider">
        <Icon className="w-4 h-4" /> {label}
      </div>
      <p className={`text-2xl font-bold mt-1 ${accent ? 'text-pokemon-yellow' : ''}`}>{value}</p>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [recent, setRecent] = useState([])

  useEffect(() => {
    statsApi.get().then(({ data }) => setStats(data)).catch(() => {})
    cardsApi.list({ limit: 6, sort: 'added_at', order: 'desc' })
      .then(({ data }) => setRecent(data.cards)).catch(() => {})
  }, [])

  const isPro = (user?.plan || 'free') === 'pro'
  const eur = (n) => `${(n || 0).toFixed(2).replace('.', ',')} €`

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">
          Hallo, {user?.display_name} 👋
        </h1>
        <p className="text-gray-400 text-sm">Überblick über deine Sammlung.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={Layers} label="Karten" value={stats?.total_cards ?? '—'} />
        <Stat icon={Euro} label="Wert (EUR)" value={stats ? eur(stats.total_value_eur) : '—'} accent />
        <Stat icon={Boxes} label="Verschiedene" value={stats?.total_unique ?? '—'} />
        <Stat icon={ArrowLeftRight} label="Zum Verkauf" value={stats?.for_trade_count ?? '—'} />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Schnellaktionen</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickAction to="/upload" icon={ScanLine} label="Karte scannen" primary />
          <QuickAction to="/collection" icon={Grid} label="Sammlung" />
          <QuickAction to="/wantlist" icon={Star} label="Wantlist" />
          {isPro
            ? <QuickAction to="/collection" icon={ShoppingBag} label="Auf eBay verkaufen" />
            : <QuickAction to="/pricing" icon={Crown} label="Auf Pro upgraden" accent />}
        </div>
      </div>

      {/* Top valuable + recent — side by side on wide screens */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Most valuable */}
        {stats?.top_valuable?.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-pokemon-yellow" /> Wertvollste Karten
              </h2>
            </div>
            <div className="space-y-2">
              {stats.top_valuable.map((c, i) => (
                <Link key={c.id} to={`/card/${c.id}`}
                  className="panel flex items-center gap-3 hover:border-gray-600 transition-colors py-2"
                >
                  <span className="text-xs text-gray-600 w-4 shrink-0">{i + 1}</span>
                  {c.image_url
                    ? <img src={c.image_url} alt={c.name} className="w-8 h-11 rounded object-cover shrink-0" />
                    : <div className="w-8 h-11 bg-gray-800 rounded shrink-0 flex items-center justify-center text-sm text-gray-600">🃏</div>}
                  <span className="text-sm font-medium flex-1 truncate">{c.name}</span>
                  <span className="text-sm font-bold text-pokemon-yellow shrink-0">
                    {c.value_eur != null
                      ? `${c.value_eur.toFixed(2).replace('.', ',')} €`
                      : c.value_usd != null ? `$${c.value_usd.toFixed(2)}` : '—'}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent cards */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Zuletzt hinzugefügt</h2>
            <Link to="/collection" className="text-xs text-pokemon-yellow hover:underline">Alle ansehen</Link>
          </div>
          {recent.length === 0 ? (
            <div className="panel text-center py-10">
              <p className="text-gray-400 text-sm">Noch keine Karten.</p>
              <Link to="/upload" className="btn-primary inline-flex items-center gap-2 mt-3">
                <ScanLine className="w-4 h-4" /> Erste Karte scannen
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-3 gap-3">
              {recent.map((c) => (
                <Link key={c.id} to={`/card/${c.id}`} className="group">
                  <div className="aspect-[2.5/3.5] rounded-lg overflow-hidden bg-gray-900 card-hover">
                    {c.image_url
                      ? <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" loading="lazy" />
                      : <div className="w-full h-full flex items-center justify-center text-3xl text-gray-700">🃏</div>}
                  </div>
                  <p className="text-xs text-gray-300 truncate mt-1">{c.name}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function QuickAction({ to, icon: Icon, label, primary, accent }) {
  return (
    <Link
      to={to}
      className={`panel card-hover flex flex-col items-center justify-center gap-2 py-5 text-center ${
        primary ? 'border-pokemon-yellow/50' : accent ? 'border-pokemon-yellow/30 bg-pokemon-yellow/5' : ''
      }`}
    >
      <Icon className={`w-6 h-6 ${primary || accent ? 'text-pokemon-yellow' : 'text-gray-300'}`} />
      <span className="text-sm font-medium">{label}</span>
    </Link>
  )
}
