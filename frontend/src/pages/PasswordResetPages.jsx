import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Vault, Loader, Mail, Lock, CheckCircle } from 'lucide-react'
import { authApi } from '../api/client'

function Shell({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center justify-center gap-2 mb-6">
          <Vault className="text-pokemon-yellow w-8 h-8" />
          <span className="font-bold text-2xl tracking-wide text-pokemon-yellow">CardVault</span>
        </Link>
        <div className="panel">{children}</div>
      </div>
    </div>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch {
      setSent(true) // never reveal whether the account exists
    }
    setBusy(false)
  }

  if (sent) {
    return (
      <Shell>
        <div className="text-center space-y-3">
          <CheckCircle className="w-10 h-10 text-green-400 mx-auto" />
          <h1 className="font-bold text-lg">E-Mail unterwegs</h1>
          <p className="text-sm text-gray-400">
            Falls ein Konto mit dieser Adresse existiert, haben wir einen Link zum
            Zurücksetzen gesendet. Schau auch im Spam-Ordner.
          </p>
          <Link to="/login" className="btn-primary inline-block">Zurück zum Login</Link>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1 className="font-bold text-lg mb-1">Passwort vergessen?</h1>
      <p className="text-sm text-gray-400 mb-4">Wir senden dir einen Link zum Zurücksetzen.</p>
      <form onSubmit={submit} className="space-y-3">
        <div className="relative">
          <Mail className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input pl-9" type="email" placeholder="E-Mail" required
            value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <button className="btn-primary w-full flex items-center justify-center gap-2" disabled={busy}>
          {busy ? <Loader className="w-4 h-4 animate-spin" /> : null} Link senden
        </button>
      </form>
      <p className="text-center text-xs text-gray-600 mt-4">
        <Link to="/login" className="text-pokemon-yellow hover:underline">Zurück zum Login</Link>
      </p>
    </Shell>
  )
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await authApi.resetPassword(token, password)
      toast.success('Passwort gesetzt — bitte einloggen')
      navigate('/login')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Zurücksetzen fehlgeschlagen')
    }
    setBusy(false)
  }

  if (!token) {
    return (
      <Shell>
        <p className="text-center text-sm text-gray-400">
          Ungültiger Link. <Link to="/forgot-password" className="text-pokemon-yellow hover:underline">Neuen anfordern</Link>
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      <h1 className="font-bold text-lg mb-4">Neues Passwort setzen</h1>
      <form onSubmit={submit} className="space-y-3">
        <div className="relative">
          <Lock className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className="input pl-9" type="password" placeholder="Neues Passwort (min. 8 Zeichen)"
            required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password" />
        </div>
        <button className="btn-primary w-full flex items-center justify-center gap-2" disabled={busy}>
          {busy ? <Loader className="w-4 h-4 animate-spin" /> : null} Passwort speichern
        </button>
      </form>
    </Shell>
  )
}
