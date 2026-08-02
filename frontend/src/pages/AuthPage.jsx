import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Vault, Loader, Mail, Lock, User as UserIcon, KeyRound, Lock as LockIcon } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { authApi } from '../api/client'

export default function AuthPage() {
  const { login, register } = useAuth()
  const [params] = useSearchParams()
  const [mode, setMode] = useState(
    params.get('mode') === 'register' ? 'register' : 'login',
  ) // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [busy, setBusy] = useState(false)
  // Whether registration is currently invite-only. Asked once on mount so the
  // form can say so upfront instead of rejecting a filled-in form with a 403.
  const [privateBeta, setPrivateBeta] = useState(false)

  useEffect(() => {
    authApi.config()
      .then(({ data }) => setPrivateBeta(Boolean(data.private_beta)))
      .catch(() => {})
  }, [])

  const isRegister = mode === 'register'

  async function handleSubmit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      if (isRegister) {
        await register(email, password, displayName, inviteCode)
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
        <div className="flex items-center justify-center gap-2.5 mb-7">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-300 to-amber-500 flex items-center justify-center shadow-glow">
            <Vault className="w-5 h-5 text-ink" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-2xl tracking-tight font-display">
            Cardeva
          </span>
        </div>

        <div className="panel !p-5">
          <div className="flex mb-5 rounded-xl bg-surface-2 border border-line p-1 text-sm">
            {['login', 'register'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-1.5 rounded-lg font-semibold transition-colors ${
                  mode === m
                    ? 'bg-accent text-ink'
                    : 'text-ink-3 hover:text-ink'
                }`}
              >
                {m === 'login' ? 'Anmelden' : 'Registrieren'}
              </button>
            ))}
          </div>

          {privateBeta && isRegister && (
            <div className="flex items-start gap-2 text-xs text-ink-3 bg-surface-2 border border-line rounded-lg px-3 py-2 mb-4">
              <LockIcon className="w-3.5 h-3.5 shrink-0 mt-0.5 text-pokemon-yellow" />
              <span>
                Cardeva ist gerade in einer <strong className="text-ink">geschlossenen
                Testphase</strong>. Zum Registrieren brauchst du einen Einladungscode.
              </span>
            </div>
          )}

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
            {/* name/id und der "username"-Token sind nötig, damit iOS und Android
                das Feldpaar als Anmeldeformular erkennen. Ohne sie bietet Safari
                beim Registrieren kein sicheres Passwort an und speichert es
                hinterher auch nicht im Schlüsselbund. */}
            <Field icon={Mail}>
              <input
                id="email" name="email"
                className="input pl-9" type="email" placeholder="E-Mail" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              />
            </Field>
            <Field icon={Lock}>
              <input
                id={isRegister ? 'new-password' : 'current-password'} name="password"
                className="input pl-9" type="password" placeholder="Passwort"
                required minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
            </Field>
            {isRegister && (
              <p className="text-xs text-ink-3">Mindestens 8 Zeichen.</p>
            )}
            {isRegister && privateBeta && (
              <Field icon={KeyRound}>
                <input
                  className="input pl-9" placeholder="Einladungscode" required
                  value={inviteCode} onChange={(e) => setInviteCode(e.target.value)}
                  autoComplete="off" spellCheck={false}
                />
              </Field>
            )}

            <button type="submit" disabled={busy} className="btn-primary w-full flex items-center justify-center gap-2">
              {busy ? <Loader className="w-4 h-4 animate-spin" /> : null}
              {isRegister ? 'Konto erstellen' : 'Anmelden'}
            </button>
          </form>

          {!isRegister && (
            <p className="text-center text-xs text-ink-3 mt-3">
              <Link to="/forgot-password" className="hover:text-ink-2">Passwort vergessen?</Link>
            </p>
          )}
        </div>

        <p className="text-center text-xs text-ink-4 mt-4">
          {isRegister ? 'Schon ein Konto?' : 'Noch kein Konto?'}{' '}
          <button
            onClick={() => setMode(isRegister ? 'login' : 'register')}
            className="text-accent-ink hover:underline"
          >
            {isRegister ? 'Jetzt anmelden' : 'Jetzt registrieren'}
          </button>
        </p>
        <p className="text-center text-xs text-ink-4 mt-2">
          <Link to="/" className="hover:text-ink-2">← Zurück zur Startseite</Link>
        </p>
        <p className="text-center text-xs text-ink-4 mt-4 space-x-3">
          <Link to="/impressum" className="hover:text-ink-2">Impressum</Link>
          <Link to="/datenschutz" className="hover:text-ink-2">Datenschutz</Link>
          <Link to="/agb" className="hover:text-ink-2">AGB</Link>
        </p>
      </div>
    </div>
  )
}

function Field({ icon: Icon, children }) {
  return (
    <div className="relative">
      <Icon className="w-4 h-4 text-ink-3 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      {children}
    </div>
  )
}
