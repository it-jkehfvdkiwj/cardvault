import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Vault, ScanLine, ShoppingBag, Globe, Check, Camera, BarChart2,
  ArrowRight, RefreshCw, FileSpreadsheet, ChevronDown, Lock, TrendingUp,
} from 'lucide-react'
import { authApi, billingApi } from '../api/client'
import ScanShowcase from '../components/ScanShowcase'

const STEPS = [
  {
    n: '1',
    title: 'Fotografieren',
    text: 'Karte mit Handy oder Webcam aufnehmen — einzeln oder bis zu 50 auf einmal, Vorder- und Rückseite.',
    icon: Camera,
  },
  {
    n: '2',
    title: 'Automatisch erkennen',
    text: 'Cardeva liest Set-Nummer und Namen direkt von der Karte — sprachunabhängig, deutsche Karten inklusive.',
    icon: ScanLine,
  },
  {
    n: '3',
    title: 'Verkaufen',
    text: 'Fertige Listings mit Titel, Beschreibung, Preis und Fotos für eBay, Whatnot und Vinted.',
    icon: ShoppingBag,
  },
]

const FEATURES = [
  { icon: ScanLine, title: 'Karten-Scanner', text: 'Foto rein, Karte erkannt — über Set-Nummer, Bilderkennung und Name. Funktioniert mit ganz normalen Handy-Fotos.' },
  { icon: Globe, title: 'Alle Sprachen', text: 'Deutsche, englische, französische und weitere Karten. Namen werden automatisch übersetzt — aus Charizard wird Glurak.' },
  { icon: TrendingUp, title: 'Live-Preise', text: 'Aktuelle Cardmarket- und TCGplayer-Preise für jede Karte. Dein Sammlungswert immer im Blick.' },
  { icon: FileSpreadsheet, title: 'Multi-Plattform-Export', text: 'Bulk-Listings für eBay und Whatnot als CSV, fertige Texte für Vinted. Preise, Fotos und Beschreibung inklusive.' },
  { icon: RefreshCw, title: 'Cross-Listing', text: 'eBay- und Whatnot-Konto verbinden, Karten live listen — verkauft sich eine Karte, verschwindet sie überall.' },
  { icon: BarChart2, title: 'Statistiken & Wantlist', text: 'Wertentwicklung, Seltenheiten, Set-Fortschritt und deine Suchliste an einem Ort.' },
]

const FAQ = [
  {
    q: 'Erkennt Cardeva auch deutsche Karten?',
    a: 'Ja. Die Erkennung läuft über die aufgedruckte Set-Nummer (z. B. „PAF 018/091") und ist damit sprachunabhängig. Namen werden automatisch übersetzt — aus „Charizard" wird „Glurak".',
  },
  {
    q: 'Wie funktioniert der Verkauf auf eBay?',
    a: 'Zwei Wege: sofort per CSV-Export — Datei bei eBay hochladen, fertig. Oder du verbindest dein eBay-Konto und Cardeva erstellt die Listings direkt, inklusive automatischem Beenden nach dem Verkauf.',
  },
  {
    q: 'Was ist mit Vinted?',
    a: 'Vinted bietet keine öffentliche Verkäufer-Schnittstelle. Cardeva erstellt dir daher fertige Listing-Texte zum Einfügen — das Schnellste, was auf Vinted möglich ist.',
  },
  {
    q: 'Woher kommen die Preise?',
    a: 'Von Cardmarket (EUR) und TCGplayer (USD) über die Pokémon-TCG-Datenbank. Beim Export legst du Preisfaktor, Mindestpreis und .99-Rundung selbst fest.',
  },
  {
    q: 'Was passiert mit meinen Daten?',
    a: 'Deine Sammlung gehört dir. Du kannst sie jederzeit als CSV, JSON oder PDF exportieren und dein Konto mit einem Klick vollständig löschen — dann ist wirklich nichts mehr da. Es gibt keine Tracking-Cookies und keine Analyse-Dienste.',
  },
]

function Logo() {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center shrink-0">
        <Vault className="w-4 h-4 text-ink" strokeWidth={2.5} />
      </div>
      <span className="font-bold text-xl tracking-tight truncate font-display">
        Cardeva
      </span>
    </div>
  )
}

export default function LandingPage() {
  // The page adapts to how the deployment is actually configured, instead of
  // promising things the app doesn't currently do: during the closed test it
  // stops presenting itself as an open offer, and the plan cards read their
  // numbers from the API rather than repeating hardcoded ones that drift.
  const [privateBeta, setPrivateBeta] = useState(false)
  const [plans, setPlans] = useState(null)
  const [freeLaunch, setFreeLaunch] = useState(false)

  useEffect(() => {
    authApi.config()
      .then(({ data }) => setPrivateBeta(Boolean(data.private_beta)))
      .catch(() => {})
    billingApi.publicPlans()
      .then(({ data }) => { setPlans(data.plans); setFreeLaunch(Boolean(data.free_launch)) })
      .catch(() => {})
  }, [])

  const ctaLabel = privateBeta ? 'Einladungscode einlösen' : 'Kostenlos starten'

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 backdrop-blur-lg bg-pokemon-dark/80 border-b border-line">
        <div className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 max-w-6xl mx-auto w-full">
          <Logo />
          <div className="flex items-center gap-2 shrink-0">
            <Link to="/login" className="btn-ghost text-sm px-3 sm:px-4">Anmelden</Link>
            <Link to="/login?mode=register" className="btn-primary text-sm px-3 sm:px-4 whitespace-nowrap">
              {privateBeta ? 'Code einlösen' : 'Kostenlos starten'}
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="px-6 pt-14 pb-12 sm:pt-20 sm:pb-16 max-w-6xl mx-auto w-full">
        <div className="grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-14 items-center">
          <div className="animate-fade-up">
            <span className="badge bg-accent-soft text-accent-ink mb-5">
              Für Sammler in Deutschland
            </span>
            <h1 className="text-4xl sm:text-5xl xl:text-[3.5rem] font-extrabold leading-[1.07] tracking-tight font-display">
              Was ist deine Sammlung{' '}
              <span className="relative whitespace-nowrap">
                wert?
                {/* Underline instead of gradient text — amber lettering on white
                    can't reach a readable contrast ratio at any size. */}
                <span aria-hidden="true" className="absolute left-0 right-0 bottom-1 h-3 bg-accent/45 -z-10 rounded-sm" />
              </span>
            </h1>
            <p className="text-ink-2 mt-5 text-lg leading-relaxed max-w-xl">
              Karten abfotografieren, automatisch erkennen und bepreisen lassen —
              und als fertige Listings auf eBay, Whatnot und Vinted verkaufen.
              Auch deutsche Karten.
            </p>

            <div className="flex flex-wrap items-center gap-3 mt-8">
              <Link to="/login?mode=register" className="btn-primary text-base px-6 py-3 flex items-center gap-2">
                {ctaLabel} <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/login" className="btn-secondary px-5 py-3">Ich habe schon ein Konto</Link>
            </div>

            {privateBeta ? (
              <p className="text-sm text-ink-3 mt-4 flex items-start gap-1.5">
                <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5 text-accent-ink" />
                Geschlossene Testphase — die Registrierung ist gerade nur mit
                Einladungscode möglich.
              </p>
            ) : (
              <p className="text-sm text-ink-3 mt-4">
                Kostenlos starten · keine Kreditkarte · Konto jederzeit löschbar
              </p>
            )}
          </div>

          {/* Now visible on every screen size, not just desktop. */}
          <div className="animate-fade-up" style={{ animationDelay: '.1s' }}>
            <ScanShowcase />
          </div>
        </div>
      </section>

      {/* ── Steps ────────────────────────────────────────────────────────── */}
      <section className="px-6 py-14 border-y border-line bg-surface">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center tracking-tight font-display">
            So funktioniert's
          </h2>
          <div className="grid sm:grid-cols-3 gap-5 mt-10">
            {STEPS.map(({ n, title, text, icon: Icon }) => (
              <div key={n} className="panel card-hover relative overflow-hidden">
                <span aria-hidden="true" className="absolute -top-3 -right-1 text-[80px] font-extrabold text-ink/[.04] leading-none select-none">
                  {n}
                </span>
                <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center mb-3">
                  <Icon className="w-5 h-5 text-accent-ink" />
                </div>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-ink-2 mt-1.5 leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="px-6 py-16 max-w-5xl mx-auto w-full">
        <h2 className="text-2xl sm:text-3xl font-bold text-center tracking-tight font-display">
          Alles, was deine Sammlung braucht
        </h2>
        <p className="text-ink-3 text-center mt-2 max-w-xl mx-auto">
          Vom ersten Scan bis zum verkauften Listing — ein Werkzeug statt fünf.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-10">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="panel card-hover">
              <Icon className="w-6 h-6 text-accent-ink mb-2.5" />
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-ink-2 mt-1 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section className="px-6 py-14 border-t border-line bg-surface">
        <div className="max-w-3xl mx-auto w-full">
          <h2 className="text-2xl sm:text-3xl font-bold text-center tracking-tight font-display">
            {freeLaunch ? 'Gerade kostenlos' : 'Einfache Preise'}
          </h2>

          {freeLaunch ? (
            <div className="panel mt-8 text-center max-w-lg mx-auto">
              <p className="text-lg font-semibold">
                In der Startphase sind alle Funktionen für alle frei.
              </p>
              <p className="text-ink-2 mt-2 text-sm leading-relaxed">
                Unbegrenzt Karten, eBay-Export, Cross-Listing und alle Exporte —
                ohne Zahlungsdaten und ohne Abo. Wenn später Tarife eingeführt
                werden, sagen wir vorher Bescheid; niemand wird automatisch in
                etwas Kostenpflichtiges überführt.
              </p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-5 mt-8">
              {(plans || []).map((plan) => {
                const pro = plan.id === 'pro'
                return (
                  <div key={plan.id} className={`panel relative ${pro ? 'border-accent shadow-glow' : ''}`}>
                    {pro && (
                      <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-accent text-ink text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                        BELIEBT
                      </span>
                    )}
                    <h3 className="font-bold text-lg">{plan.name}</h3>
                    <p className="text-4xl font-extrabold my-3 font-display">
                      {plan.price_eur === 0
                        ? '0 €'
                        : <>{plan.price_eur.toFixed(2).replace('.', ',')} €
                            <span className="text-ink-3 text-sm font-medium"> / Monat</span></>}
                    </p>
                    <ul className="space-y-2 text-sm text-ink-2">
                      {plan.highlights.map((h) => (
                        <li key={h} className="flex gap-2">
                          <Check className={`w-4 h-4 mt-0.5 shrink-0 ${pro ? 'text-accent-ink' : 'text-emerald-700'}`} />
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
              {!plans && (
                <p className="sm:col-span-2 text-center text-ink-3 text-sm">
                  Tarife werden geladen…
                </p>
              )}
            </div>
          )}

          <div className="text-center mt-8">
            <Link to="/login?mode=register" className="btn-primary px-6 py-3">{ctaLabel}</Link>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="px-6 py-16 max-w-3xl mx-auto w-full">
        <h2 className="text-2xl sm:text-3xl font-bold text-center tracking-tight font-display">
          Häufige Fragen
        </h2>
        <div className="mt-8 space-y-3">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="panel group">
              <summary className="flex items-center justify-between font-semibold text-sm list-none select-none cursor-pointer">
                {q}
                <ChevronDown className="w-4 h-4 text-ink-3 group-open:rotate-180 transition-transform shrink-0 ml-3" />
              </summary>
              <p className="text-sm text-ink-2 mt-3 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="px-6 pb-20">
        <div className="max-w-4xl mx-auto rounded-3xl border border-line bg-surface p-10 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight font-display">
            Deine Sammlung wartet.
          </h2>
          <p className="text-ink-2 mt-2">
            In zwei Minuten registriert, erste Karte in unter zehn Sekunden gescannt.
          </p>
          <div className="mt-6">
            <Link to="/login?mode=register" className="btn-accent px-8 py-3 text-base">
              {ctaLabel}
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}

export function LandingFooter() {
  return (
    <footer className="border-t border-line px-6 py-6 text-center text-xs text-ink-3 space-x-4">
      <span>© {new Date().getFullYear()} Cardeva</span>
      <Link to="/impressum" className="hover:text-ink">Impressum</Link>
      <Link to="/datenschutz" className="hover:text-ink">Datenschutz</Link>
      <Link to="/agb" className="hover:text-ink">AGB</Link>
    </footer>
  )
}
