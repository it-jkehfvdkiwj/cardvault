import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Vault, Loader, Mail, Lock, User as UserIcon, KeyRound, Lock as LockIcon, ShieldCheck, ArrowLeft } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { authApi } from '../api/client'
import { BUILD_STAMP } from '../main'

export default function AuthPage() {
  const { login, register, verify } = useAuth()
  const [params, setParams] = useSearchParams()
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
  // The pending-confirmation step lives in the URL (?verify=<adresse>), not in
  // component state. Ordinary state was being lost between the successful
  // registration and the next render — the request went through, the mail
  // arrived, and the page just sat there. Anything that remounts this screen
  // (a suspense boundary, an auth reset, a stray reload) took the step with it.
  // A query parameter survives all of that, and a refresh lands the user back
  // on the code field instead of an empty form.
  const pendingEmail = params.get('verify') || null

  const [code, setCode] = useState('')
  const [mailSent, setMailSent] = useState(true)
  const [cooldown, setCooldown] = useState(0)

  function startVerification(mail, { sent = true, wait = 60 } = {}) {
    setMailSent(sent)
    setCooldown(wait)
    setCode('')
    setParams({ mode: 'register', verify: mail }, { replace: true })
  }

  function cancelVerification() {
    setCode('')
    setParams({ mode: 'register' }, { replace: true })
  }

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

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
        const res = await register(email, password, displayName, inviteCode)
        // Deliberately loud: this is the exact step that went missing in
        // production, with a 200 on the wire and nothing on screen.
        console.info('[Cardeva] Registrierung beantwortet:', res)
        if (res?.access_token) {
          // Confirmation is switched off on this server — already logged in.
          toast.success('Konto erstellt — willkommen!')
        } else {
          startVerification(res?.email || email, {
            sent: res?.mail_sent !== false,
            wait: res?.resend_in || 60,
          })
          console.info('[Cardeva] Bestaetigungsschritt gestartet fuer', res?.email || email)
        }
      } else {
        await login(email, password)
        toast.success('Willkommen zurück!')
      }
    } catch (err) {
      console.warn('[Cardeva] Anmeldung/Registrierung fehlgeschlagen:', err)
      // A confirmed-account-required refusal is not an error the user can fix
      // by retrying — switch straight to the code step instead of scolding them.
      // Body field first, header only as a fallback: see the note in
      // routes/auth.py on why the header alone was not dependable.
      const data = err.response?.data
      const needsCode =
        err.response?.status === 403 &&
        (data?.needs_verification || err.response.headers?.['x-needs-verification'])
      if (needsCode) {
        startVerification(data?.email || email, { sent: true, wait: 0 })
      } else {
        toast.error(err.response?.data?.detail || 'Etwas ist schiefgelaufen')
      }
    }
    setBusy(false)
  }

  async function handleVerify(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      await verify(pendingEmail, code.trim())
      toast.success('E-Mail bestätigt — willkommen!')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Der Code konnte nicht geprüft werden')
    }
    setBusy(false)
  }

  async function handleResend() {
    if (cooldown > 0 || busy) return
    setBusy(true)
    try {
      const { data } = await authApi.resendVerification(pendingEmail)
      setCooldown(data.resend_in || 60)
      setMailSent(true)
      toast.success('Neuer Code verschickt')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Konnte keinen neuen Code senden')
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

        {pendingEmail ? (
          <div className="panel !p-5 space-y-4">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-accent-ink" />
              <div className="min-w-0">
                <h1 className="font-bold">E-Mail bestätigen</h1>
                <p className="text-xs text-ink-3 mt-1">
                  Wir haben einen 6-stelligen Code an{' '}
                  <strong className="text-ink break-all">{pendingEmail}</strong> geschickt.
                  Er gilt 30 Minuten.
                </p>
              </div>
            </div>

            {!mailSent && (
              <p className="text-xs bg-amber-50 border border-amber-300 text-amber-900 rounded-lg px-3 py-2">
                Die E-Mail konnte nicht zugestellt werden. Prüf die Adresse — oder
                melde dich beim Betreiber, falls sie stimmt.
              </p>
            )}

            <form onSubmit={handleVerify} className="space-y-3">
              <input
                className="input text-center text-2xl tracking-[0.5em] font-bold"
                inputMode="numeric" autoComplete="one-time-code"
                pattern="[0-9]*" maxLength={6} required autoFocus
                aria-label="Bestätigungscode"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <button
                type="submit" disabled={busy || code.length !== 6}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {busy ? <Loader className="w-4 h-4 animate-spin" /> : null}
                Bestätigen und anmelden
              </button>
            </form>

            <div className="flex items-center justify-between text-xs">
              <button
                onClick={handleResend} disabled={cooldown > 0 || busy}
                className="text-ink-3 hover:text-ink disabled:opacity-50"
              >
                {cooldown > 0 ? `Neuer Code in ${cooldown} s` : 'Neuen Code senden'}
              </button>
              <button
                onClick={cancelVerification}
                className="text-ink-3 hover:text-ink flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" /> Andere Adresse
              </button>
            </div>
          </div>
        ) : (
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
        )}

        {!pendingEmail && (
        <p className="text-center text-xs text-ink-4 mt-4">
          {isRegister ? 'Schon ein Konto?' : 'Noch kein Konto?'}{' '}
          <button
            onClick={() => setMode(isRegister ? 'login' : 'register')}
            className="text-accent-ink hover:underline"
          >
            {isRegister ? 'Jetzt anmelden' : 'Jetzt registrieren'}
          </button>
        </p>
        )}
        <p className="text-center text-xs text-ink-4 mt-2">
          <Link to="/" className="hover:text-ink-2">← Zurück zur Startseite</Link>
        </p>
        <p className="text-center text-[10px] text-ink-4/70 mt-3" title="Stand des im Browser laufenden Frontends">
          Build {BUILD_STAMP}
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
