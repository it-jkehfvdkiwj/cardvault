import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { User as UserIcon, Lock, Crown, Trash2, Loader, Share2, Copy, ExternalLink } from 'lucide-react'
import { accountApi } from '../api/client'
import { useAuth } from '../auth/AuthContext'

export default function AccountPage() {
  const { user, refreshUser, logout } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [displayName, setDisplayName] = useState(user?.display_name || '')
  const [savingProfile, setSavingProfile] = useState(false)

  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  const [delPw, setDelPw] = useState('')
  const [deleting, setDeleting] = useState(false)

  const [sharingBusy, setSharingBusy] = useState(false)
  const publicUrl = user?.public_slug ? `${window.location.origin}/u/${user.public_slug}` : ''

  async function toggleSharing(enabled) {
    setSharingBusy(true)
    try {
      await accountApi.updateSharing(enabled)
      await refreshUser()
      toast.success(enabled ? 'Öffentlicher Link aktiv' : 'Sammlung wieder privat')
    } catch {
      toast.error('Konnte Sichtbarkeit nicht ändern')
    }
    setSharingBusy(false)
  }

  function copyLink() {
    navigator.clipboard?.writeText(publicUrl)
    toast.success('Link kopiert')
  }

  // Refresh on open so usage (cards used) and plan are current.
  // When coming back from Stripe Checkout (?upgraded=1) the webhook may not have
  // fired yet — show a notice and poll once after a short delay.
  useEffect(() => {
    refreshUser()
    if (searchParams.get('upgraded') === '1') {
      toast.success('Zahlung erfolgreich! Dein Plan wird in Kürze aktualisiert.')
      navigate('/account', { replace: true })
      const t = setTimeout(() => refreshUser(), 4000)
      return () => clearTimeout(t)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const isPro = (user?.plan || 'free') === 'pro'
  const usage = user?.usage || {}

  async function saveProfile(e) {
    e.preventDefault()
    setSavingProfile(true)
    try {
      await accountApi.updateProfile({ display_name: displayName })
      await refreshUser()
      toast.success('Profil gespeichert')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Speichern fehlgeschlagen')
    }
    setSavingProfile(false)
  }

  async function savePassword(e) {
    e.preventDefault()
    setSavingPw(true)
    try {
      await accountApi.changePassword({ current_password: curPw, new_password: newPw })
      setCurPw(''); setNewPw('')
      toast.success('Passwort geändert')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Änderung fehlgeschlagen')
    }
    setSavingPw(false)
  }

  async function deleteAccount() {
    if (!confirm('Konto und ALLE Karten endgültig löschen? Das kann nicht rückgängig gemacht werden.')) return
    setDeleting(true)
    try {
      await accountApi.deleteAccount(delPw)
      toast.success('Konto gelöscht')
      logout()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Löschen fehlgeschlagen')
    }
    setDeleting(false)
  }

  const pct = usage.card_limit
    ? Math.min(100, Math.round((usage.cards_used / usage.card_limit) * 100))
    : 0

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold">Konto</h1>

      {/* Subscription */}
      <div className="panel space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className={`w-5 h-5 ${isPro ? 'text-pokemon-yellow' : 'text-gray-500'}`} />
            <span className="font-semibold">{isPro ? 'Pro' : 'Free'} Plan</span>
            {isPro && user?.subscription_status && (
              <span className="badge bg-emerald-800 text-emerald-200 text-[10px]">{user.subscription_status}</span>
            )}
          </div>
          <button onClick={() => navigate('/pricing')} className={isPro ? 'btn-secondary' : 'btn-primary'}>
            {isPro ? 'Plan verwalten' : 'Upgrade'}
          </button>
        </div>
        {!isPro && usage.card_limit != null && (
          <div>
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Karten</span>
              <span>{usage.cards_used} / {usage.card_limit}</span>
            </div>
            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full ${pct >= 90 ? 'bg-pokemon-red' : 'bg-pokemon-yellow'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
        {isPro && <p className="text-sm text-gray-400">Unbegrenzte Sammlung · eBay-Export · CSV/PDF-Export</p>}
      </div>

      {/* Public sharing */}
      <div className="panel space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2"><Share2 className="w-4 h-4" /> Sammlung teilen</h2>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={!!user?.is_public} disabled={sharingBusy}
              onChange={(e) => toggleSharing(e.target.checked)} className="rounded" />
            Öffentlich
          </label>
        </div>
        <p className="text-sm text-gray-400">
          Erstelle einen öffentlichen, schreibgeschützten Link zu deiner Sammlung —
          ideal zum Zeigen oder Verkaufen (Karten „zum Verkauf" werden hervorgehoben).
        </p>
        {user?.is_public && publicUrl && (
          <div className="flex items-center gap-2">
            <input className="input text-sm flex-1" value={publicUrl} readOnly onClick={(e) => e.target.select()} />
            <button onClick={copyLink} className="btn-secondary shrink-0" title="Kopieren"><Copy className="w-4 h-4" /></button>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary shrink-0" title="Öffnen"><ExternalLink className="w-4 h-4" /></a>
          </div>
        )}
      </div>

      {/* Profile */}
      <form onSubmit={saveProfile} className="panel space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><UserIcon className="w-4 h-4" /> Profil</h2>
        <div>
          <label className="block text-xs text-gray-400 mb-1">E-Mail</label>
          <input className="input opacity-60" value={user?.email || ''} disabled />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Anzeigename</label>
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <button className="btn-primary" disabled={savingProfile}>
          {savingProfile ? <Loader className="w-4 h-4 animate-spin" /> : 'Speichern'}
        </button>
      </form>

      {/* Password */}
      <form onSubmit={savePassword} className="panel space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Lock className="w-4 h-4" /> Passwort ändern</h2>
        <input className="input" type="password" placeholder="Aktuelles Passwort" value={curPw}
          onChange={(e) => setCurPw(e.target.value)} required autoComplete="current-password" />
        <input className="input" type="password" placeholder="Neues Passwort (min. 8 Zeichen)" value={newPw}
          onChange={(e) => setNewPw(e.target.value)} required minLength={8} autoComplete="new-password" />
        <button className="btn-primary" disabled={savingPw}>
          {savingPw ? <Loader className="w-4 h-4 animate-spin" /> : 'Passwort ändern'}
        </button>
      </form>

      {/* Danger zone */}
      <div className="panel border-pokemon-red/40 space-y-3">
        <h2 className="font-semibold flex items-center gap-2 text-pokemon-red">
          <Trash2 className="w-4 h-4" /> Konto löschen
        </h2>
        <p className="text-sm text-gray-400">Löscht dein Konto und alle deine Karten unwiderruflich.</p>
        <input className="input" type="password" placeholder="Passwort zur Bestätigung" value={delPw}
          onChange={(e) => setDelPw(e.target.value)} autoComplete="current-password" />
        <button onClick={deleteAccount} disabled={deleting || !delPw}
          className="bg-pokemon-red hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50">
          {deleting ? 'Lösche…' : 'Konto endgültig löschen'}
        </button>
      </div>
    </div>
  )
}
