import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Check, Loader, Crown, Sparkles, Gift } from 'lucide-react'
import { billingApi } from '../api/client'
import { useAuth } from '../auth/AuthContext'

export default function PricingPage() {
  const { user, refreshUser } = useAuth()
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [searchParams] = useSearchParams()

  useEffect(() => {
    billingApi.plans().then(({ data }) => setData(data)).catch(() => {})
    if (searchParams.get('canceled') === '1') {
      toast('Zahlung abgebrochen — du kannst es jederzeit erneut versuchen.', { icon: 'ℹ️' })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // During the launch phase every feature is unlocked for everyone, so the
  // page becomes a preview of the future plans rather than a checkout.
  const freeLaunch = data?.free_launch ?? user?.free_launch ?? false
  const isPro = (user?.plan || 'free') === 'pro'

  async function upgrade() {
    setBusy(true)
    try {
      if (data?.stripe_enabled) {
        const { data: res } = await billingApi.checkout()
        window.location.href = res.url
        return
      }
      await billingApi.demoUpgrade()
      await refreshUser()
      toast.success('Willkommen bei Pro! 🎉')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upgrade fehlgeschlagen')
    }
    setBusy(false)
  }

  async function cancel() {
    if (!confirm('Pro kündigen und zum Free-Tarif zurückkehren?')) return
    setBusy(true)
    try {
      await billingApi.cancel()
      await refreshUser()
      toast.success('Abo gekündigt')
    } catch {
      toast.error('Kündigung fehlgeschlagen')
    }
    setBusy(false)
  }

  const plans = data?.plans || []

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="page-title">Hol mehr aus deiner Sammlung</h1>
        <p className="text-ink-3 text-sm mt-1">
          {freeLaunch
            ? 'Zum Start ist alles kostenlos — ohne Zahlungsdaten, ohne Abo.'
            : 'Kostenlos starten, auf Pro wechseln sobald du verkaufst.'}
        </p>
      </div>

      {freeLaunch && (
        <div className="panel flex items-start gap-3 border-green-300 bg-green-50">
          <Gift className="w-5 h-5 text-green-700 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-green-800">
              Launch-Phase: alle Pro-Funktionen sind für dich freigeschaltet.
            </p>
            <p className="text-ink-3 mt-1">
              Unbegrenzt Karten, eBay-Export und Bulk-Preisupdate — nichts zu bezahlen.
              Die Tarife unten zeigen, wie es später aussehen wird. Bestehende
              Sammlungen bleiben selbstverständlich erhalten.
            </p>
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {plans.map((plan) => {
          const current = !freeLaunch && (user?.plan || 'free') === plan.id
          const pro = plan.id === 'pro'
          return (
            <div
              key={plan.id}
              className={`panel relative flex flex-col ${pro ? 'border-accent' : ''} ${
                freeLaunch ? 'opacity-80' : ''
              }`}
            >
              {pro && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-accent text-ink text-[10px] font-bold px-2 py-0.5 rounded-full">
                  BELIEBT
                </span>
              )}
              <div className="flex items-center gap-2">
                {pro ? <Crown className="w-5 h-5 text-pokemon-yellow" /> : <Sparkles className="w-5 h-5 text-ink-3" />}
                <h2 className="font-bold text-lg">{plan.name}</h2>
                {current && (
                  <span className="ml-auto badge bg-surface-3 text-ink-2 text-[10px]">Dein Plan</span>
                )}
              </div>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-bold">
                  {plan.price_eur === 0 ? '0 €' : `${plan.price_eur.toFixed(2).replace('.', ',')} €`}
                </span>
                <span className="text-ink-3 text-sm">{plan.price_eur === 0 ? '' : ' / Monat'}</span>
              </div>
              <ul className="space-y-2 text-sm flex-1">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2">
                    <Check className={`w-4 h-4 mt-0.5 shrink-0 ${pro ? 'text-pokemon-yellow' : 'text-green-700'}`} />
                    <span className="text-ink-2">{h}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                {freeLaunch ? (
                  <button disabled className="btn-secondary w-full opacity-60 cursor-default">
                    {pro ? 'Aktuell für alle frei' : 'Basis'}
                  </button>
                ) : plan.id === 'free' ? (
                  <button disabled className="btn-secondary w-full opacity-60 cursor-default">
                    {current ? 'Aktiv' : 'Basis'}
                  </button>
                ) : current ? (
                  <button onClick={cancel} disabled={busy} className="btn-secondary w-full">
                    {busy ? <Loader className="w-4 h-4 animate-spin mx-auto" /> : 'Pro kündigen'}
                  </button>
                ) : (
                  <button onClick={upgrade} disabled={busy} className="btn-primary w-full flex items-center justify-center gap-2">
                    {busy ? <Loader className="w-4 h-4 animate-spin" /> : <Crown className="w-4 h-4" />}
                    Auf Pro upgraden
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {!freeLaunch && !data?.stripe_enabled && !isPro && data?.demo_enabled && (
        <p className="text-center text-xs text-amber-600/80">
          Test-Modus: Das Upgrade erfolgt ohne Zahlung, bis Stripe konfiguriert ist.
        </p>
      )}
    </div>
  )
}
