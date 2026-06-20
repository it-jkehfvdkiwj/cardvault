import { useState, useEffect } from 'react'
import { statsApi } from '../api/client'
import { Link } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { TrendingUp, Layers, Trophy, Gem } from 'lucide-react'

const RARITY_COLORS = [
  '#6b7280', '#16a34a', '#2563eb', '#4f46e5', '#7c3aed',
  '#9333ea', '#db2777', '#ea580c', '#eab308', '#dc2626',
]

function StatCard({ icon: Icon, label, value, sub, color = 'text-pokemon-yellow' }) {
  return (
    <div className="panel flex items-start gap-3">
      <div className={`p-2 rounded-lg bg-white/5 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function StatsPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    statsApi.get().then(({ data }) => setStats(data)).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-gray-400">Loading stats…</div>
  if (!stats) return <div className="p-8 text-gray-400">No data</div>

  const rarityData = Object.entries(stats.by_rarity)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value }))

  const setData = Object.entries(stats.by_set)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([name, d]) => ({ name: name.length > 20 ? name.slice(0, 18) + '…' : name, count: d.count, value: +d.value.toFixed(2) }))

  const condData = Object.entries(stats.by_condition)
    .map(([name, value]) => ({ name, value }))

  const LANG_FLAGS = { EN: '🇬🇧', DE: '🇩🇪', FR: '🇫🇷', IT: '🇮🇹', ES: '🇪🇸', JA: '🇯🇵', KO: '🇰🇷', ZH: '🇨🇳' }
  const langData = Object.entries(stats.by_language || {})
    .sort((a, b) => b[1] - a[1])
    .map(([code, value]) => ({ name: `${LANG_FLAGS[code] || ''} ${code}`, value }))

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold">Collection Stats</h1>

      {/* Summary cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Layers}
          label="Total Cards"
          value={stats.total_cards}
          sub={`${stats.total_unique} unique`}
          color="text-blue-400"
        />
        <StatCard
          icon={TrendingUp}
          label="Sammlungswert"
          value={`${stats.total_value_eur.toFixed(2).replace('.', ',')} €`}
          sub={`ca. $${stats.total_value_usd.toFixed(2)} USD`}
          color="text-pokemon-yellow"
        />
        {stats.rarest_card && (
          <Link to={`/card/${stats.rarest_card.id}`} className="block">
            <StatCard
              icon={Gem}
              label="Rarest Card"
              value={stats.rarest_card.name}
              sub={stats.rarest_card.rarity}
              color="text-purple-400"
            />
          </Link>
        )}
        {stats.most_valuable_card && (
          <Link to={`/card/${stats.most_valuable_card.id}`} className="block">
            <StatCard
              icon={Trophy}
              label="Most Valuable"
              value={stats.most_valuable_card.name}
              sub={stats.most_valuable_card.market_price_usd != null ? `$${stats.most_valuable_card.market_price_usd.toFixed(2)}` : ''}
              color="text-pokemon-red"
            />
          </Link>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Rarity distribution */}
        {rarityData.length > 0 && (
          <div className="panel">
            <h2 className="font-semibold mb-4">Cards by Rarity</h2>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={rarityData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, percent }) => `${name.split(' ').pop()} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {rarityData.map((_, i) => (
                    <Cell key={i} fill={RARITY_COLORS[i % RARITY_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [`${v} cards`, 'Count']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Condition breakdown */}
        {condData.length > 0 && (
          <div className="panel">
            <h2 className="font-semibold mb-4">Cards by Condition</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={condData} layout="vertical">
                <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fill: '#9ca3af', fontSize: 11 }} width={110} />
                <Tooltip
                  contentStyle={{ background: '#16213e', border: '1px solid #374151' }}
                  formatter={(v) => [`${v} cards`, 'Count']}
                />
                <Bar dataKey="value" fill="#CC0000" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Language breakdown */}
        {langData.length > 1 && (
          <div className="panel">
            <h2 className="font-semibold mb-4">Cards by Language</h2>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={langData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {langData.map((_, i) => (
                    <Cell key={i} fill={RARITY_COLORS[i % RARITY_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [`${v} cards`, 'Count']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Sets breakdown */}
        {setData.length > 0 && (
          <div className="panel lg:col-span-2">
            <h2 className="font-semibold mb-4">Top Sets by Card Count</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={setData}>
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#16213e', border: '1px solid #374151' }}
                  formatter={(v, name) => [name === 'count' ? `${v} cards` : `$${v}`, name === 'count' ? 'Cards' : 'Value']}
                />
                <Bar dataKey="count" fill="#FFCB05" radius={[4, 4, 0, 0]} name="count" />
                <Bar dataKey="value" fill="#CC0000" radius={[4, 4, 0, 0]} name="value" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
