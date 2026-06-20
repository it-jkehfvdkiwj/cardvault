import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Vault, Loader, Mail, Lock, User as UserIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'

export default function AuthPage() {
  const { login, register } = useAuth()
  const [params] = useSearchParams()
  const [mode, setMode] = useState(
    params.get('mode') === 'register' ? 'register' : 'login',
  ) // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)

  const isRegister = mode === 'register'

  async function handleSubmit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      if (isRegister) {
        await register(email, password, displayName)
        toast.success('Konto erstellt — willkommen!')
      } else {
        await login(email, password)
        toast.success('Willkommen zurück!')
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Etwas ist schiefgelaufen')
    }
    setBusy(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Vault className="text-pokemon-yellow w-8 h-8" />
          <span className="font-bold text-2xl tracking-wide text-pokemon-yellow">CardVault</span>
        </div>

        <div className="panel">
          <div className="flex mb-5 rounded-lg bg-gray-800/60 p-1 text-sm">
            {['login', 'register'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-1.5 rounded-md font-medium transition-colors ${
                  mode === m ? 'bg-pokemon-red text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {m === 'login' ? 'Anmelden' : 'Registrieren'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {isRegister && (
              <Field icon={UserIcon}>
                <input
                  className="input pl-9" placeholder="Anzeigename (optional)"
                  value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="nickname"
                />
              </Field>
            )}
            <Field icon={Mail}>
              <input
                className="input pl-9" type="email" placeholder="E-Mail" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            <Field icon={Lock}>
              <input
                className="input pl-9" type="password" placeholder="Passwort"
                required minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
            </Field>
            {isRegister && (
              <p className="text-xs text-gray-500">Mindestens 8 Zeichen.</p>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full flex items-center justify-center gap-2">
              {busy ? <Loader className="w-4 h-4 animate-spin" /> : null}
              {isRegister ? 'Konto erstellen' : 'Anmelden'}
            </button>
          </form>

          {!isRegister && (
            <p className="text-center text-xs text-gray-500 mt-3">
              <Link to="/forgot-password" className="hover:text-gray-300">Passwort vergessen?</Link>
            </p>
          )}
        </div>

        <p className="text-center text-xs text-gray-600 mt-4">
          {isRegister ? 'Schon ein Konto?' : 'Noch kein Konto?'}{' '}
          <button
            onClick={() => setMode(isRegister ? 'login' : 'register')}
            className="text-pokemon-yellow hover:underline"
          >
            {isRegister ? 'Jetzt anmelden' : 'Jetzt registrieren'}
          </button>
        </p>
        <p className="text-center text-xs text-gray-600 mt-2">
          <Link to="/" className="hover:text-gray-400">← Zurück zur Startseite</Link>
        </p>
        <p className="text-center text-xs text-gray-700 mt-4 space-x-3">
          <Link to="/impressum" className="hover:text-gray-400">Impressum</Link>
          <Link to="/datenschutz" className="hover:text-gray-400">Datenschutz</Link>
          <Link to="/agb" className="hover:text-gray-400">AGB</Link>
        </p>
      </div>
    </div>
  )
}

function Field({ icon: Icon, children }) {
  return (
    <div className="relative">
      <Icon className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      {children}
    </div>
  )
}
