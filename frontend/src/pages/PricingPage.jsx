import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Check, Loader, Crown, Sparkles } from 'lucide-react'
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
      toast.success('Welcome to Pro! 🎉')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upgrade failed')
    }
    setBusy(false)
  }

  async function cancel() {
    if (!confirm('Cancel Pro and return to the Free plan?')) return
    setBusy(true)
    try {
      await billingApi.cancel()
      await refreshUser()
      toast.success('Subscription canceled')
    } catch {
      toast.error('Could not cancel')
    }
    setBusy(false)
  }

  const plans = data?.plans || []

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Upgrade your collection</h1>
        <p className="text-gray-400 text-sm mt-1">
          Start free, go Pro when you're ready to sell.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {plans.map((plan) => {
          const current = (user?.plan || 'free') === plan.id
          const pro = plan.id === 'pro'
          return (
            <div
              key={plan.id}
              className={`panel relative flex flex-col ${pro ? 'border-pokemon-yellow/60' : ''}`}
            >
              {pro && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-pokemon-yellow text-black text-[10px] font-bold px-2 py-0.5 rounded-full">
                  BELIEBT
                </span>
              )}
              <div className="flex items-center gap-2">
                {pro ? <Crown className="w-5 h-5 text-pokemon-yellow" /> : <Sparkles className="w-5 h-5 text-gray-400" />}
                <h2 className="font-bold text-lg">{plan.name}</h2>
                {current && (
                  <span className="ml-auto badge bg-gray-700 text-gray-300 text-[10px]">Dein Plan</span>
                )}
              </div>
              <div className="mt-2 mb-4">
                <span className="text-3xl font-bold">
                  {plan.price_eur === 0 ? '0 €' : `${plan.price_eur.toFixed(2).replace('.', ',')} €`}
                </span>
                <span className="text-gray-500 text-sm">{plan.price_eur === 0 ? '' : ' / Monat'}</span>
              </div>
              <ul className="space-y-2 text-sm flex-1">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2">
                    <Check className={`w-4 h-4 mt-0.5 shrink-0 ${pro ? 'text-pokemon-yellow' : 'text-green-400'}`} />
                    <span className="text-gray-300">{h}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-5">
                {plan.id === 'free' ? (
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

      {!data?.stripe_enabled && !isPro && (
        <p className="text-center text-xs text-amber-600/80">
          Test-Modus: Das Upgrade erfolgt ohne Zahlung, bis Stripe konfiguriert ist.
        </p>
      )}
    </div>
  )
}
