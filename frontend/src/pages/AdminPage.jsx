import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Users, Crown, CreditCard, Layers, Search, Shield, ShieldOff, Trash2, RefreshCw, Database, Play } from 'lucide-react'
import { adminApi, cardsApi } from '../api/client'
import { useAuth } from '../auth/AuthContext'

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="panel">
      <div className="flex items-center gap-2 text-gray-400 text-xs uppercase tracking-wider">
        <Icon className="w-4 h-4" /> {label}
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function HashIndexPanel() {
  const [indexStats, setIndexStats] = useState(null)
  const [setCode, setSetCode] = useState('')
  const [building, setBuilding] = useState(false)

  useEffect(() => {
    cardsApi.hashIndexStats().then(({ data }) => setIndexStats(data)).catch(() => {})
  }, [])

  async function build() {
    if (!setCode.trim()) return
    setBuilding(true)
    try {
      const { data } = await cardsApi.buildHashIndex(setCode.trim().toLowerCase())
      toast.success(`${data.queued} Karten in ${data.set_code} werden indiziert…`)
      setSetCode('')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Build fehlgeschlagen')
    }
    setBuilding(false)
  }

  return (
    <div className="panel space-y-3">
      <h2 className="font-semibold flex items-center gap-2 text-sm">
        <Database className="w-4 h-4 text-gray-400" /> Visueller Hash-Index
      </h2>
      {indexStats && (
        <p className="text-xs text-gray-500">
          {indexStats.indexed_cards} Karten indiziert
          {!indexStats.imagehash_available && (
            <span className="ml-2 text-amber-500">· ImageHash nicht installiert</span>
          )}
        </p>
      )}
      <div className="flex gap-2">
        <input
          value={setCode}
          onChange={(e) => setSetCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && build()}
          placeholder="Set-ID (z.B. sv8, swsh1)"
          className="input text-sm flex-1"
        />
        <button
          onClick={build}
          disabled={building || !setCode.trim()}
          className="btn-primary flex items-center gap-1.5 text-sm shrink-0 disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5" />
          {building ? 'Läuft…' : 'Indizieren'}
        </button>
      </div>
      <p className="text-xs text-gray-600">
        Lädt alle Karten eines Sets herunter und berechnet perceptual hashes für
        visuelles Matching. Läuft im Hintergrund.
      </p>
    </div>
  )
}

export default function AdminPage() {
  const { user: me } = useAuth()
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, u] = await Promise.all([adminApi.stats(), adminApi.users(search)])
      setStats(s.data)
      setUsers(u.data.users)
    } catch {
      toast.error('Admin-Daten konnten nicht geladen werden')
    }
    setLoading(false)
  }, [search])

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  async function patch(id, payload, msg) {
    try {
      await adminApi.updateUser(id, payload)
      toast.success(msg)
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Aktion fehlgeschlagen')
    }
  }

  async function remove(u) {
    if (!confirm(`Nutzer ${u.email} und alle Karten löschen?`)) return
    try {
      await adminApi.deleteUser(u.id)
      toast.success('Nutzer gelöscht')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Löschen fehlgeschlagen')
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="w-6 h-6 text-pokemon-yellow" /> Admin</h1>
          <p className="text-gray-400 text-sm">Nutzer, Abos und Plattform-Statistiken.</p>
        </div>
        <button onClick={load} className="btn-ghost" title="Aktualisieren">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Nutzer" value={stats.total_users} sub={`${stats.active_users} aktiv`} />
          <StatCard icon={Crown} label="Pro-Abos" value={stats.pro_users} sub={`${stats.free_users} Free`} />
          <StatCard icon={CreditCard} label="MRR (geschätzt)" value={`${stats.estimated_mrr_eur} €`} sub="pro Monat" />
          <StatCard icon={Layers} label="Karten gesamt" value={stats.total_cards} sub={`+${stats.new_users_7d} Nutzer/Woche`} />
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input className="input pl-9" placeholder="Nutzer suchen…" value={search}
          onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Hash index */}
      <HashIndexPanel />

      {/* User table */}
      <div className="panel overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-800">
              <th className="px-4 py-2 font-medium">Nutzer</th>
              <th className="px-4 py-2 font-medium">Plan</th>
              <th className="px-4 py-2 font-medium">Karten</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-800/60 hover:bg-white/5">
                <td className="px-4 py-2">
                  <div className="font-medium text-white flex items-center gap-1.5">
                    {u.display_name}
                    {u.is_admin && <Shield className="w-3 h-3 text-pokemon-yellow" title="Admin" />}
                  </div>
                  <div className="text-xs text-gray-500">{u.email}</div>
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => patch(u.id, { plan: u.plan === 'pro' ? 'free' : 'pro' },
                      `${u.email} → ${u.plan === 'pro' ? 'Free' : 'Pro'}`)}
                    className={`badge text-[10px] ${u.plan === 'pro' ? 'bg-pokemon-yellow text-black' : 'bg-gray-700 text-gray-300'}`}
                    title="Plan umschalten"
                  >
                    {u.plan === 'pro' ? '★ Pro' : 'Free'}
                  </button>
                </td>
                <td className="px-4 py-2 text-gray-400">{u.card_count}</td>
                <td className="px-4 py-2">
                  {u.is_active
                    ? <span className="text-emerald-400 text-xs">aktiv</span>
                    : <span className="text-pokemon-red text-xs">gesperrt</span>}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => patch(u.id, { is_admin: !u.is_admin }, 'Admin-Status geändert')}
                      className="p-1.5 text-gray-500 hover:text-pokemon-yellow" title={u.is_admin ? 'Admin entziehen' : 'Zu Admin machen'}
                    >
                      {u.is_admin ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                    </button>
                    {u.id !== me?.id && (
                      <>
                        <button
                          onClick={() => patch(u.id, { is_active: !u.is_active }, u.is_active ? 'Gesperrt' : 'Entsperrt')}
                          className="px-2 py-1 text-xs text-gray-400 hover:text-white"
                        >
                          {u.is_active ? 'Sperren' : 'Entsperren'}
                        </button>
                        <button onClick={() => remove(u)} className="p-1.5 text-gray-500 hover:text-pokemon-red" title="Löschen">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!users.length && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Keine Nutzer</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
