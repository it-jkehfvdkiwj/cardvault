import { useState, useEffect } from 'react'
import { statsApi } from '../api/client'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import { TrendingUp, Layers, Trophy, Gem, PieChart as PieIcon, CheckCircle2 } from 'lucide-react'

// Harmonized chart palette (matches the app's amber/sky/violet accent system)
const CHART_COLORS = [
  '#E0A317', '#0284C7', '#7C5CD6', '#0E9F6E', '#EA6C0B',
  '#DB2777', '#4F46E5', '#0D9488', '#B45309', '#64748B',
]

const TOOLTIP_STYLE = {
  background: '#FFFFFF',
  border: '1px solid #E4E1D9',
  borderRadius: '12px',
  fontSize: 12,
  color: '#1A1A17',
}

const TINTS = {
  sky: 'bg-sky-400/12 text-sky-700',
  amber: 'bg-amber-400/12 text-amber-700',
  violet: 'bg-violet-400/12 text-violet-700',
  rose: 'bg-rose-400/12 text-rose-700',
}

function StatCard({ icon: Icon, label, value, sub, tint = 'amber' }) {
  return (
    <div className="panel flex items-start gap-3 h-full">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${TINTS[tint]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-ink-3 uppercase tracking-wider">{label}</p>
        <p className="text-lg font-bold truncate">{value}</p>
        {sub && <p className="text-xs text-ink-3 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  )
}

export default function StatsPage() {
  const [stats, setStats] = useState(null)
  const [setsProgress, setSetsProgress] = useState([])
  const [showAllSets, setShowAllSets] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    statsApi.get().then(({ data }) => setStats(data)).finally(() => setLoading(false))
    statsApi.setsProgress()
      .then(({ data }) => setSetsProgress(data.sets || []))
      .catch(() => {})
  }, [])

  if (loading) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
        <h1 className="page-title">Statistiken</h1>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-20" />)}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="skeleton h-72" />
          <div className="skeleton h-72" />
        </div>
      </div>
    )
  }
  if (!stats) return <div className="p-8 text-ink-3">Keine Daten verfügbar.</div>

  const rarityData = Object.entries(stats.by_rarity)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }))

  const setData = Object.entries(stats.by_set)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([name, d]) => ({
      name: name.length > 20 ? name.slice(0, 18) + '…' : name,
      count: d.count,
      value: +d.value.toFixed(2),
    }))

  const condData = Object.entries(stats.by_condition)
    .map(([name, value]) => ({ name, value }))

  const LANG_FLAGS = { EN: '🇬🇧', DE: '🇩🇪', FR: '🇫🇷', IT: '🇮🇹', ES: '🇪🇸', JA: '🇯🇵', KO: '🇰🇷', ZH: '🇨🇳' }
  const langData = Object.entries(stats.by_language || {})
    .sort((a, b) => b[1] - a[1])
    .map(([code, value]) => ({ name: `${LANG_FLAGS[code] || ''} ${code}`, value }))

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="page-title">Statistiken</h1>
        <p className="text-ink-3 text-sm mt-0.5">Zahlen, Verteilungen und Highlights deiner Sammlung.</p>
      </div>

      {/* Summary cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Layers}
          label="Karten gesamt"
          value={stats.total_cards}
          sub={`${stats.total_unique} verschiedene`}
          tint="sky"
        />
        <StatCard
          icon={TrendingUp}
          label="Sammlungswert"
          value={`${stats.total_value_eur.toFixed(2).replace('.', ',')} €`}
          sub={`ca. $${stats.total_value_usd.toFixed(2)} USD`}
          tint="amber"
        />
        {stats.rarest_card && (
          <Link to={`/card/${stats.rarest_card.id}`} className="block">
            <StatCard
              icon={Gem}
              label="Seltenste Karte"
              value={stats.rarest_card.name}
              sub={stats.rarest_card.rarity}
              tint="violet"
            />
          </Link>
        )}
        {stats.most_valuable_card && (
          <Link to={`/card/${stats.most_valuable_card.id}`} className="block">
            <StatCard
              icon={Trophy}
              label="Wertvollste Karte"
              value={stats.most_valuable_card.name}
              sub={stats.most_valuable_card.market_price_usd != null ? `$${stats.most_valuable_card.market_price_usd.toFixed(2)}` : ''}
              tint="rose"
            />
          </Link>
        )}
      </div>

      {/* Set completion progress */}
      {setsProgress.length > 0 && (
        <div className="panel">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-accent-ink" /> Set-Fortschritt
            </h2>
            <span className="text-xs text-ink-3">
              {setsProgress.length} Set{setsProgress.length !== 1 ? 's' : ''} angefangen
            </span>
          </div>
          <div className="space-y-3">
            {(showAllSets ? setsProgress : setsProgress.slice(0, 8)).map((s) => {
              const pct = s.percent ?? 0
              const complete = pct >= 100
              return (
                <div key={s.set_id} className="flex items-center gap-3">
                  {s.symbol ? (
                    <img src={s.symbol} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-6 h-6 rounded bg-surface-3 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <p className="text-sm font-medium truncate">
                        {s.name}
                        {s.series && <span className="text-xs text-ink-4 ml-1.5">{s.series}</span>}
                      </p>
                      <p className="text-xs shrink-0 tabular-nums">
                        <span className={complete ? 'text-emerald-700 font-semibold' : 'text-ink-2 font-semibold'}>
                          {s.owned}
                        </span>
                        <span className="text-ink-4">/{s.total || '?'}</span>
                        {s.percent != null && (
                          <span className={`ml-1.5 ${complete ? 'text-emerald-700' : 'text-ink-3'}`}>
                            {complete
                              ? <CheckCircle2 className="w-3.5 h-3.5 inline -mt-0.5" />
                              : `${s.percent.toFixed(0)} %`}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          complete
                            ? 'bg-emerald-400'
                            : 'bg-gradient-to-r from-yellow-300 to-amber-500'
                        }`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {setsProgress.length > 8 && (
            <button
              onClick={() => setShowAllSets((v) => !v)}
              className="text-xs text-accent-ink hover:underline mt-3"
            >
              {showAllSets ? 'Weniger anzeigen' : `Alle ${setsProgress.length} Sets anzeigen`}
            </button>
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Rarity distribution */}
        {rarityData.length > 0 && (
          <div className="panel">
            <h2 className="font-semibold mb-4">Karten nach Seltenheit</h2>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={rarityData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  label={({ name, percent }) => `${name.split(' ').pop()} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {rarityData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="#FFFFFF" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v} Karten`, 'Anzahl']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Condition breakdown */}
        {condData.length > 0 && (
          <div className="panel">
            <h2 className="font-semibold mb-4">Karten nach Zustand</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={condData} layout="vertical">
                <XAxis type="number" tick={{ fill: '#6B6B63', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fill: '#6B6B63', fontSize: 11 }} width={110} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(26,26,23,.04)' }} formatter={(v) => [`${v} Karten`, 'Anzahl']} />
                <Bar dataKey="value" fill="#0284C7" radius={[0, 6, 6, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Language breakdown */}
        {langData.length > 1 && (
          <div className="panel">
            <h2 className="font-semibold mb-4">Karten nach Sprache</h2>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={langData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {langData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="#FFFFFF" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v} Karten`, 'Anzahl']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Sets breakdown */}
        {setData.length > 0 && (
          <div className="panel lg:col-span-2">
            <h2 className="font-semibold mb-4">Top-Sets nach Kartenanzahl</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={setData}>
                <XAxis dataKey="name" tick={{ fill: '#6B6B63', fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6B6B63', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: 'rgba(26,26,23,.04)' }}
                  formatter={(v, name) => [name === 'count' ? `${v} Karten` : `${v} €`, name === 'count' ? 'Karten' : 'Wert']}
                />
                <Bar dataKey="count" fill="#E0A317" radius={[5, 5, 0, 0]} name="count" maxBarSize={26} />
                <Bar dataKey="value" fill="#0284C7" radius={[5, 5, 0, 0]} name="value" maxBarSize={26} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
