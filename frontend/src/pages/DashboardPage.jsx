import { useState, useEffect, lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import {
  Layers, Euro, Boxes, ArrowLeftRight, ScanLine, Grid,
  ShoppingBag, Crown, Star, Trophy, ArrowRight, TrendingUp, TrendingDown,
} from 'lucide-react'
import { statsApi, cardsApi } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { isPro as hasProFeatures } from '../lib/plan'

// Recharts is by far the heaviest dependency and the chart only renders once a
// user has two days of history — load it on demand instead of on every visit.
const ValueChart = lazy(() => import('../components/ValueChart'))

const TINTS = {
  amber: { chip: 'bg-amber-400/12 text-amber-700', value: 'text-amber-700' },
  sky: { chip: 'bg-sky-400/12 text-sky-700', value: '' },
  violet: { chip: 'bg-violet-400/12 text-violet-700', value: '' },
  emerald: { chip: 'bg-emerald-400/12 text-emerald-700', value: '' },
}

function Stat({ icon: Icon, label, value, tint = 'sky', loading }) {
  const t = TINTS[tint] || TINTS.sky
  return (
    <div className="panel flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.chip}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-ink-3 uppercase tracking-wider truncate">{label}</p>
        {loading ? (
          <div className="skeleton h-6 w-16 mt-1" />
        ) : (
          <p className={`text-xl font-bold truncate ${t.value}`}>{value}</p>
        )}
      </div>
    </div>
  )
}

const RANK_STYLE = [
  'bg-amber-400/15 text-amber-700 border-amber-400/30',       // 1
  'bg-surface-2 text-ink-2 border-line',           // 2
  'bg-orange-400/10 text-orange-700 border-orange-400/25',     // 3
]

function CardThumb({ card, className = '' }) {
  return card.image_url ? (
    <img src={card.image_url} alt={card.name} loading="lazy"
      className={`object-cover rounded-md shrink-0 ${className}`} />
  ) : (
    <div className={`rounded-md shrink-0 bg-surface-3 border border-line flex items-center justify-center ${className}`}>
      <Layers className="w-3.5 h-3.5 text-ink-4" />
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)
  const [recent, setRecent] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // stats first (it records today's snapshot), then the history chart.
    statsApi.get()
      .then(({ data }) => setStats(data))
      .catch(() => {})
      .finally(() => {
        setLoading(false)
        statsApi.history(90).then(({ data }) => setHistory(data.history)).catch(() => {})
      })
    cardsApi.list({ limit: 6, sort: 'added_at', order: 'desc' })
      .then(({ data }) => setRecent(data.cards)).catch(() => {})
  }, [])

  const isPro = hasProFeatures(user)
  const eur = (n) => `${(n || 0).toFixed(2).replace('.', ',')} €`
  const today = new Date().toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  return (
    <div className="p-4 sm:p-6 space-y-7 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-ink-3 capitalize">{today}</p>
          <h1 className="page-title mt-0.5">
            Hallo, {user?.display_name || 'Sammler'}
          </h1>
        </div>
        <Link to="/upload" className="btn-primary flex items-center gap-2 text-sm">
          <ScanLine className="w-4 h-4" /> Karte scannen
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={Layers} label="Karten" value={stats?.total_cards ?? '—'} tint="sky" loading={loading} />
        <Stat icon={Euro} label="Sammlungswert" value={stats ? eur(stats.total_value_eur) : '—'} tint="amber" loading={loading} />
        <Stat icon={Boxes} label="Verschiedene" value={stats?.total_unique ?? '—'} tint="violet" loading={loading} />
        <Stat icon={ArrowLeftRight} label="Zum Verkauf" value={stats?.for_trade_count ?? '—'} tint="emerald" loading={loading} />
      </div>

      {/* Value history (portfolio chart) — appears once ≥2 daily snapshots exist */}
      {history.length >= 2 && (() => {
        const first = history[0].total_value_eur || 0
        const last = history[history.length - 1].total_value_eur || 0
        const delta = last - first
        const deltaPct = first > 0 ? (delta / first) * 100 : null
        const up = delta >= 0
        const chartData = history.map((h) => ({
          day: h.day.slice(5).split('-').reverse().join('.'),   // "22.07"
          value: h.total_value_eur,
        }))
        return (
          <div className="panel">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h2 className="text-xs font-semibold text-ink-3 uppercase tracking-wider">
                Wertentwicklung
              </h2>
              <div className={`flex items-center gap-1.5 text-sm font-semibold ${
                up ? 'text-emerald-700' : 'text-rose-600'
              }`}>
                {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {up ? '+' : ''}{delta.toFixed(2).replace('.', ',')} €
                {deltaPct != null && (
                  <span className="text-xs text-ink-3 font-normal">
                    ({up ? '+' : ''}{deltaPct.toFixed(1).replace('.', ',')} % · {history.length} Tage)
                  </span>
                )}
              </div>
            </div>
            <Suspense fallback={<div className="h-40" />}>
              <ValueChart data={chartData} />
            </Suspense>
          </div>
        )
      })()}

      {/* Quick actions */}
      <div>
        <h2 className="text-xs font-semibold text-ink-3 uppercase tracking-wider mb-2.5">Schnellaktionen</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickAction to="/upload" icon={ScanLine} label="Karte scannen" primary />
          <QuickAction to="/collection" icon={Grid} label="Sammlung" />
          <QuickAction to="/wantlist" icon={Star} label="Wantlist" />
          {isPro
            ? <QuickAction to="/collection" icon={ShoppingBag} label="Verkaufen" />
            : <QuickAction to="/pricing" icon={Crown} label="Auf Pro upgraden" accent />}
        </div>
      </div>

      {/* Top valuable + recent */}
      <div className="grid lg:grid-cols-2 gap-6">
        {stats?.top_valuable?.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-ink-3 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-700" /> Wertvollste Karten
            </h2>
            <div className="panel !p-2 divide-y divide-line/60">
              {stats.top_valuable.map((c, i) => (
                <Link key={c.id} to={`/card/${c.id}`}
                  className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface-2 transition-colors"
                >
                  <span className={`w-6 h-6 rounded-lg border text-[11px] font-bold flex items-center justify-center shrink-0 ${
                    RANK_STYLE[i] || 'border-line text-ink-3'
                  }`}>
                    {i + 1}
                  </span>
                  <CardThumb card={c} className="w-8 h-11" />
                  <span className="text-sm font-medium flex-1 truncate">{c.name}</span>
                  <span className="text-sm font-bold text-amber-700 shrink-0">
                    {c.value_eur != null
                      ? eur(c.value_eur)
                      : c.value_usd != null ? `$${c.value_usd.toFixed(2)}` : '—'}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-xs font-semibold text-ink-3 uppercase tracking-wider">Zuletzt hinzugefügt</h2>
            <Link to="/collection" className="text-xs text-accent-ink hover:underline flex items-center gap-1">
              Alle ansehen <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="panel text-center py-10">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-accent-soft flex items-center justify-center mb-3">
                <ScanLine className="w-6 h-6 text-accent-ink" />
              </div>
              <p className="text-ink-3 text-sm">Noch keine Karten in deiner Sammlung.</p>
              <Link to="/upload" className="btn-primary inline-flex items-center gap-2 mt-4 text-sm">
                <ScanLine className="w-4 h-4" /> Erste Karte scannen
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-3 gap-3">
              {recent.map((c) => (
                <Link key={c.id} to={`/card/${c.id}`} className="group">
                  <div className="aspect-[2.5/3.5] rounded-xl overflow-hidden bg-surface-2 border border-line/60 card-hover">
                    {c.image_url ? (
                      <img src={c.image_url} alt={c.name}
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                        loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Layers className="w-6 h-6 text-ink-4" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-ink-2 truncate mt-1.5">{c.name}</p>
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
      className={`panel card-hover flex flex-col items-center justify-center gap-2.5 py-5 text-center ${
        primary ? 'border-accent/40' : accent ? 'border-accent/50 bg-accent/[.04]' : ''
      }`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
        primary || accent ? 'bg-accent-soft text-accent-ink' : 'bg-surface-2 text-ink-2'
      }`}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  )
}
