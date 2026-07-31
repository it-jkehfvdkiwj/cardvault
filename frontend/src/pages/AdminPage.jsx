import { useState, useEffect, useCallback, Fragment } from 'react'
import toast from 'react-hot-toast'
import {
  Users, Crown, Layers, Search, Shield, ShieldOff, Trash2, RefreshCw, Database,
  Play, Ticket, Plus, Copy, Check, ChevronDown, Activity, Lock,
  ArrowUp, ArrowDown, Mail,
} from 'lucide-react'
import { adminApi, cardsApi } from '../api/client'
import { useAuth } from '../auth/AuthContext'

// ── Helpers ───────────────────────────────────────────────────────────────────

const eur = (n) => `${(n || 0).toFixed(2).replace('.', ',')} €`

/** "vor 3 Tagen" / "gerade eben" — far easier to scan than a timestamp. */
function relTime(iso) {
  if (!iso) return null
  const then = new Date(iso)
  const mins = Math.round((Date.now() - then.getTime()) / 60000)
  if (mins < 1) return 'gerade eben'
  if (mins < 60) return `vor ${mins} Min.`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `vor ${hours} Std.`
  const days = Math.round(hours / 24)
  if (days < 31) return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`
  const months = Math.round(days / 30)
  return months < 12 ? `vor ${months} Mon.` : `vor ${Math.round(months / 12)} J.`
}

const dateStr = (iso) =>
  iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="panel">
      <div className="flex items-center gap-2 text-ink-3 text-xs uppercase tracking-wider">
        <Icon className="w-4 h-4 shrink-0" /> <span className="truncate">{label}</span>
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-ink-3 mt-0.5">{sub}</p>}
    </div>
  )
}

function CopyButton({ text, className = '' }) {
  const [done, setDone] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch { toast.error('Kopieren nicht möglich') }
      }}
      className={`p-1.5 text-ink-3 hover:text-ink transition-colors ${className}`}
      title="Kopieren"
    >
      {done ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

// ── Invite codes ──────────────────────────────────────────────────────────────

function InvitePanel() {
  const [data, setData] = useState(null)
  const [label, setLabel] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(true)

  const load = useCallback(() => {
    adminApi.invites().then(({ data }) => setData(data)).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])

  async function create() {
    setBusy(true)
    try {
      const { data: created } = await adminApi.createInvite({
        label: label.trim() || undefined,
        max_uses: maxUses ? Number(maxUses) : undefined,
      })
      toast.success(`Code ${created.code} erstellt`)
      setLabel(''); setMaxUses(''); load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Anlegen fehlgeschlagen')
    }
    setBusy(false)
  }

  async function toggle(inv) {
    try {
      await adminApi.updateInvite(inv.id, { is_active: !inv.is_active })
      load()
    } catch { toast.error('Änderung fehlgeschlagen') }
  }

  async function remove(inv) {
    if (!confirm(`Code ${inv.code} löschen? Bereits angelegte Konten bleiben bestehen.`)) return
    try {
      await adminApi.deleteInvite(inv.id)
      toast.success('Code gelöscht'); load()
    } catch { toast.error('Löschen fehlgeschlagen') }
  }

  const invites = data?.invites || []

  return (
    <div className="panel space-y-3">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full text-left">
        <Ticket className="w-4 h-4 text-pokemon-yellow shrink-0" />
        <h2 className="font-semibold text-sm flex-1">Einladungscodes</h2>
        {data && !data.private_beta && (
          <span className="badge bg-surface-3 text-ink-2 text-[10px]">Registrierung offen</span>
        )}
        <ChevronDown className={`w-4 h-4 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {data && !data.private_beta && (
            <p className="text-xs text-amber-800">
              PRIVATE_BETA ist aus — jeder kann sich ohne Code registrieren. Die Codes
              unten haben gerade keine Wirkung.
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="input text-sm flex-1" placeholder="Wofür? (z. B. für Max)"
              value={label} onChange={(e) => setLabel(e.target.value)}
            />
            <input
              className="input text-sm sm:w-36" type="number" min="1"
              placeholder="max. Nutzungen"
              value={maxUses} onChange={(e) => setMaxUses(e.target.value)}
            />
            <button onClick={create} disabled={busy}
              className="btn-primary text-sm flex items-center justify-center gap-1.5 shrink-0">
              <Plus className="w-4 h-4" /> Code erzeugen
            </button>
          </div>

          <div className="space-y-1.5">
            {invites.map((inv) => (
              <div
                key={inv.id ?? `env-${inv.code}`}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-surface-2/50 px-3 py-2 ${
                  !inv.is_active || inv.exhausted ? 'opacity-50' : ''
                }`}
              >
                <code className="font-mono text-sm text-pokemon-yellow tracking-wide">{inv.code}</code>
                <CopyButton text={inv.code} />
                <span className="text-xs text-ink-3 flex-1 min-w-0 truncate">
                  {inv.label || '—'}
                </span>
                <span className="text-xs text-ink-3 whitespace-nowrap">
                  {inv.uses}{inv.max_uses ? ` / ${inv.max_uses}` : ''} genutzt
                </span>
                {inv.from_env ? (
                  <span className="badge bg-surface-3 text-ink-3 text-[10px]">Env</span>
                ) : (
                  <div className="flex items-center gap-1">
                    <button onClick={() => toggle(inv)}
                      className="text-xs text-ink-3 hover:text-ink px-1.5 py-0.5">
                      {inv.is_active ? 'Deaktivieren' : 'Aktivieren'}
                    </button>
                    <button onClick={() => remove(inv)}
                      className="p-1 text-ink-3 hover:text-pokemon-red">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!invites.length && (
              <p className="text-xs text-ink-3 py-2">
                Noch keine Codes. Erzeug einen und schick ihn deinem Tester.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Hash index (unchanged behaviour) ──────────────────────────────────────────

function HashIndexPanel() {
  const [indexStats, setIndexStats] = useState(null)
  const [setCode, setSetCode] = useState('')
  const [building, setBuilding] = useState(false)
  const [open, setOpen] = useState(false)

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
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full text-left">
        <Database className="w-4 h-4 text-ink-3 shrink-0" />
        <h2 className="font-semibold text-sm flex-1">Visueller Hash-Index</h2>
        {indexStats && (
          <span className="text-xs text-ink-3">{indexStats.indexed_cards} Karten</span>
        )}
        <ChevronDown className={`w-4 h-4 text-ink-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {indexStats && !indexStats.imagehash_available && (
            <p className="text-xs text-amber-800">ImageHash nicht installiert</p>
          )}
          <div className="flex gap-2">
            <input
              value={setCode} onChange={(e) => setSetCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && build()}
              placeholder="Set-ID (z.B. sv8, swsh1)" className="input text-sm flex-1"
            />
            <button onClick={build} disabled={building || !setCode.trim()}
              className="btn-primary flex items-center gap-1.5 text-sm shrink-0 disabled:opacity-50">
              <Play className="w-3.5 h-3.5" />
              {building ? 'Läuft…' : 'Indizieren'}
            </button>
          </div>
          <p className="text-xs text-ink-4">
            Lädt alle Karten eines Sets herunter und berechnet perceptual hashes für
            visuelles Matching. Läuft im Hintergrund.
          </p>
        </>
      )}
    </div>
  )
}

// ── User detail (shared by the table row and the mobile card) ─────────────────

function UserDetail({ userId, onClose }) {
  const [detail, setDetail] = useState(null)
  const [resetLink, setResetLink] = useState(null)

  useEffect(() => {
    setDetail(null)
    adminApi.userDetail(userId).then(({ data }) => setDetail(data)).catch(() => {})
  }, [userId])

  async function sendReset() {
    try {
      const { data } = await adminApi.sendPasswordReset(userId)
      if (data.sent) toast.success('Reset-Link per E-Mail verschickt')
      else { setResetLink(data.link); toast('Kein SMTP konfiguriert — Link zum Weitergeben:', { icon: 'ℹ️' }) }
    } catch { toast.error('Konnte keinen Link erzeugen') }
  }

  if (!detail) {
    return <div className="text-xs text-ink-3 px-1 py-3">Lädt…</div>
  }

  const s = detail.stats
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ['Karten', s.cards_total],
          ['davon einzigartig', s.cards_unique],
          ['Sammlungswert', eur(s.collection_value_eur)],
          ['Wantlist', s.wantlist],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-surface-2/60 border border-line px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-ink-3">{label}</p>
            <p className="font-semibold mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      <div className="text-xs text-ink-3 space-y-1">
        <p>Registriert: {dateStr(detail.created_at)} ({relTime(detail.created_at)})</p>
        <p>Letzter Login: {detail.last_login_at
          ? `${dateStr(detail.last_login_at)} (${relTime(detail.last_login_at)})`
          : 'noch nie'}</p>
        <p>Letzte Karte: {s.last_card_added ? relTime(s.last_card_added) : 'noch keine'}</p>
        {detail.invite_code && (
          <p>Einladungscode: <code className="text-pokemon-yellow">{detail.invite_code}</code></p>
        )}
      </div>

      {detail.recent_cards?.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-3 mb-1.5">Zuletzt hinzugefügt</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {detail.recent_cards.map((c) => (
              <div key={c.id} className="shrink-0 w-16" title={`${c.name} · ${c.set_name || ''}`}>
                {c.image_url
                  ? <img src={c.image_url} alt={c.name} loading="lazy"
                      className="w-16 rounded border border-line" />
                  : <div className="w-16 h-[88px] rounded border border-line bg-surface-2" />}
                <p className="text-[10px] text-ink-3 truncate mt-0.5">{c.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button onClick={sendReset} className="btn-secondary text-xs py-1.5 flex items-center gap-1.5">
          <Mail className="w-3.5 h-3.5" /> Passwort-Reset schicken
        </button>
        {onClose && (
          <button onClick={onClose} className="btn-ghost text-xs py-1.5">Schließen</button>
        )}
      </div>

      {resetLink && (
        <div className="flex items-center gap-1 rounded-lg bg-surface-2 border border-line px-2 py-1.5">
          <code className="text-[10px] text-ink-3 flex-1 truncate">{resetLink}</code>
          <CopyButton text={resetLink} />
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const SORTS = [
  { key: 'created_at', label: 'Registriert' },
  { key: 'last_login_at', label: 'Letzter Login' },
  { key: 'cards', label: 'Karten' },
  { key: 'email', label: 'E-Mail' },
]

export default function AdminPage() {
  const { user: me } = useAuth()
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('created_at')
  const [order, setOrder] = useState('desc')
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, u] = await Promise.all([adminApi.stats(), adminApi.users(search, sort, order)])
      setStats(s.data)
      setUsers(u.data.users)
    } catch {
      toast.error('Admin-Daten konnten nicht geladen werden')
    }
    setLoading(false)
  }, [search, sort, order])

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  function setSorting(key) {
    if (key === sort) setOrder(order === 'desc' ? 'asc' : 'desc')
    else { setSort(key); setOrder(key === 'email' ? 'asc' : 'desc') }
  }

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
    if (!confirm(`Nutzer ${u.email} und alle Karten löschen? Das lässt sich nicht rückgängig machen.`)) return
    try {
      await adminApi.deleteUser(u.id)
      toast.success('Nutzer gelöscht')
      load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Löschen fehlgeschlagen')
    }
  }

  const SortArrow = ({ k }) => k !== sort ? null
    : order === 'desc' ? <ArrowDown className="w-3 h-3 inline ml-0.5" />
      : <ArrowUp className="w-3 h-3 inline ml-0.5" />

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-pokemon-yellow shrink-0" /> Admin
          </h1>
          <p className="text-ink-3 text-sm">Nutzer, Einladungen und Plattform-Statistiken.</p>
        </div>
        <button onClick={load} className="btn-ghost shrink-0" title="Aktualisieren">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Mode banners — so you always know which switches are currently on. */}
      {stats && (stats.private_beta || stats.free_launch) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {stats.private_beta && (
            <span className="badge bg-surface-2 border border-line text-ink-2 flex items-center gap-1.5">
              <Lock className="w-3 h-3 text-pokemon-yellow" /> Geschlossene Testphase
            </span>
          )}
          {stats.free_launch && (
            <span className="badge bg-surface-2 border border-line text-ink-2 flex items-center gap-1.5">
              <Crown className="w-3 h-3 text-pokemon-yellow" /> Alle Pro-Funktionen frei
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Nutzer" value={stats.total_users}
            sub={`+${stats.new_users_7d} diese Woche`} />
          <StatCard icon={Activity} label="Aktiv (7 Tage)" value={stats.logged_in_7d}
            sub={stats.never_logged_in ? `${stats.never_logged_in} nie eingeloggt` : 'alle waren schon da'} />
          <StatCard icon={Layers} label="Karten gesamt" value={stats.total_cards}
            sub={`+${stats.cards_added_7d} diese Woche`} />
          {stats.free_launch
            ? <StatCard icon={Crown} label="Tarife" value="frei"
                sub="Launch-Phase, niemand zahlt" />
            : <StatCard icon={Crown} label="Pro-Abos" value={stats.pro_users}
                sub={`${eur(stats.estimated_mrr_eur)} MRR`} />}
        </div>
      )}

      <InvitePanel />

      {/* Search + sort */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input pl-9" placeholder="Name, E-Mail oder Code suchen…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {/* Mobile sort picker; the desktop table sorts via its headers. */}
        <select
          className="input sm:hidden text-sm"
          value={`${sort}:${order}`}
          onChange={(e) => { const [k, o] = e.target.value.split(':'); setSort(k); setOrder(o) }}
        >
          {SORTS.map((s) => [
            <option key={`${s.key}:desc`} value={`${s.key}:desc`}>{s.label} ↓</option>,
            <option key={`${s.key}:asc`} value={`${s.key}:asc`}>{s.label} ↑</option>,
          ])}
        </select>
      </div>

      {/* ── Mobile: one card per user ───────────────────────────────────────── */}
      <div className="sm:hidden space-y-2">
        {users.map((u) => (
          <div key={u.id} className="panel !p-3 space-y-2">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink flex items-center gap-1.5 truncate">
                  {u.display_name}
                  {u.is_admin && <Shield className="w-3 h-3 text-pokemon-yellow shrink-0" />}
                  {!u.is_active && <span className="text-[10px] text-pokemon-red">gesperrt</span>}
                </p>
                <p className="text-xs text-ink-3 truncate">{u.email}</p>
              </div>
              <button
                onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                className="btn-ghost !px-2 !py-1 shrink-0"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${expanded === u.id ? 'rotate-180' : ''}`} />
              </button>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
              <span>{u.card_count} Karten</span>
              <span>seit {dateStr(u.created_at)}</span>
              <span>{u.last_login_at ? `aktiv ${relTime(u.last_login_at)}` : 'nie eingeloggt'}</span>
              {u.invite_code && (
                <span className="text-pokemon-yellow/80 font-mono">{u.invite_code}</span>
              )}
            </div>

            {expanded === u.id && (
              <div className="pt-2 border-t border-line space-y-3">
                <UserDetail userId={u.id} />
                <div className="flex flex-wrap gap-1.5">
                  <button onClick={() => patch(u.id, { is_admin: !u.is_admin }, 'Admin-Status geändert')}
                    className="btn-secondary text-xs py-1.5 flex items-center gap-1.5">
                    {u.is_admin ? <ShieldOff className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                    {u.is_admin ? 'Admin entziehen' : 'Zu Admin machen'}
                  </button>
                  {u.id !== me?.id && (
                    <>
                      <button onClick={() => patch(u.id, { is_active: !u.is_active }, u.is_active ? 'Gesperrt' : 'Entsperrt')}
                        className="btn-secondary text-xs py-1.5">
                        {u.is_active ? 'Sperren' : 'Entsperren'}
                      </button>
                      <button onClick={() => remove(u)}
                        className="btn-danger text-xs py-1.5 flex items-center gap-1.5">
                        <Trash2 className="w-3.5 h-3.5" /> Löschen
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {!users.length && (
          <p className="text-center text-ink-3 py-8 text-sm">Keine Nutzer</p>
        )}
      </div>

      {/* ── Desktop: table ──────────────────────────────────────────────────── */}
      <div className="hidden sm:block panel overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-3 border-b border-line">
              <th className="px-4 py-2 font-medium">
                <button onClick={() => setSorting('email')} className="hover:text-ink-2">
                  Nutzer <SortArrow k="email" />
                </button>
              </th>
              <th className="px-4 py-2 font-medium">
                <button onClick={() => setSorting('cards')} className="hover:text-ink-2">
                  Karten <SortArrow k="cards" />
                </button>
              </th>
              <th className="px-4 py-2 font-medium">
                <button onClick={() => setSorting('created_at')} className="hover:text-ink-2">
                  Registriert <SortArrow k="created_at" />
                </button>
              </th>
              <th className="px-4 py-2 font-medium">
                <button onClick={() => setSorting('last_login_at')} className="hover:text-ink-2">
                  Letzter Login <SortArrow k="last_login_at" />
                </button>
              </th>
              <th className="px-4 py-2 font-medium">Code</th>
              <th className="px-4 py-2 font-medium text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              // Fragment carries the key: the row and its detail row are two
              // siblings that must stay one list item.
              <Fragment key={u.id}>
                <tr className="border-b border-line hover:bg-surface-2">
                  <td className="px-4 py-2">
                    <button
                      onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                      className="text-left group"
                    >
                      <div className="font-medium text-ink flex items-center gap-1.5">
                        <ChevronDown className={`w-3 h-3 text-ink-4 group-hover:text-ink-2 transition-transform ${
                          expanded === u.id ? 'rotate-180' : ''}`} />
                        {u.display_name}
                        {u.is_admin && <Shield className="w-3 h-3 text-pokemon-yellow" title="Admin" />}
                        {!u.is_active && <span className="text-[10px] text-pokemon-red">gesperrt</span>}
                      </div>
                      <div className="text-xs text-ink-3 pl-4">{u.email}</div>
                    </button>
                  </td>
                  <td className="px-4 py-2 text-ink-3">{u.card_count}</td>
                  <td className="px-4 py-2 text-ink-3 whitespace-nowrap" title={u.created_at || ''}>
                    {dateStr(u.created_at)}
                  </td>
                  <td className="px-4 py-2 text-ink-3 whitespace-nowrap" title={u.last_login_at || ''}>
                    {u.last_login_at ? relTime(u.last_login_at)
                      : <span className="text-ink-4">nie</span>}
                  </td>
                  <td className="px-4 py-2">
                    {u.invite_code
                      ? <code className="text-xs text-pokemon-yellow/80">{u.invite_code}</code>
                      : <span className="text-ink-4 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => patch(u.id, { is_admin: !u.is_admin }, 'Admin-Status geändert')}
                        className="p-1.5 text-ink-3 hover:text-pokemon-yellow"
                        title={u.is_admin ? 'Admin entziehen' : 'Zu Admin machen'}
                      >
                        {u.is_admin ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                      </button>
                      {u.id !== me?.id && (
                        <>
                          <button
                            onClick={() => patch(u.id, { is_active: !u.is_active }, u.is_active ? 'Gesperrt' : 'Entsperrt')}
                            className="px-2 py-1 text-xs text-ink-3 hover:text-ink"
                          >
                            {u.is_active ? 'Sperren' : 'Entsperren'}
                          </button>
                          <button onClick={() => remove(u)}
                            className="p-1.5 text-ink-3 hover:text-pokemon-red" title="Löschen">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                {expanded === u.id && (
                  <tr className="border-b border-line bg-surface-2/30">
                    <td colSpan={6} className="px-4 py-3">
                      <UserDetail userId={u.id} onClose={() => setExpanded(null)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!users.length && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-3">Keine Nutzer</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <HashIndexPanel />
    </div>
  )
}
