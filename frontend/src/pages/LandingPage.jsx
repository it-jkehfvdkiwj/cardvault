import { Link } from 'react-router-dom'
import {
  Vault, ScanLine, ShoppingBag, Globe, Crown, Check, Camera, BarChart2,
} from 'lucide-react'

const FEATURES = [
  { icon: ScanLine, title: 'Karten scannen', text: 'Foto rein, Karte erkannt — über Set-Nummer & Name, sprachunabhängig.' },
  { icon: Globe, title: 'Alle Sprachen', text: 'Deutsche, englische & weitere Karten. Namen werden lokalisiert (Glurak ↔ Charizard).' },
  { icon: Camera, title: 'Direkt mit Kamera', text: 'Per Webcam oder Handy abfotografieren und sofort hinzufügen.' },
  { icon: ShoppingBag, title: 'Auf eBay verkaufen', text: 'Bulk-Listing-CSV mit Titel, Preis & Bild — direkt bei eBay hochladen.' },
  { icon: BarChart2, title: 'Sammlung im Blick', text: 'Werte, Seltenheiten, Statistiken und Wantlist an einem Ort.' },
  { icon: Crown, title: 'Live-Preise', text: 'Aktuelle Cardmarket- & TCGplayer-Preise für jede Karte.' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between gap-2 px-4 sm:px-6 py-4 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2 min-w-0">
          <Vault className="text-pokemon-yellow w-7 h-7 shrink-0" />
          <span className="font-bold text-xl tracking-wide text-pokemon-yellow truncate">CardVault</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link to="/login" className="btn-ghost text-sm px-3 sm:px-4">Anmelden</Link>
          <Link to="/login?mode=register" className="btn-primary text-sm px-3 sm:px-4 whitespace-nowrap">Kostenlos starten</Link>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16 max-w-3xl mx-auto">
        <span className="badge bg-pokemon-yellow/15 text-pokemon-yellow border border-pokemon-yellow/30 mb-4">
          Pokémon-Karten scannen & verkaufen
        </span>
        <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight">
          Deine Pokémon-Sammlung,{' '}
          <span className="text-pokemon-yellow">digital & verkaufsfertig.</span>
        </h1>
        <p className="text-gray-400 mt-4 text-lg">
          Karten abfotografieren, automatisch erkennen lassen, Werte verfolgen und mit
          einem Klick als eBay-Listing exportieren — auch deutsche Karten.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
          <Link to="/login?mode=register" className="btn-primary flex items-center gap-2">
            <ScanLine className="w-4 h-4" /> Jetzt kostenlos loslegen
          </Link>
          <Link to="/login" className="btn-secondary">Ich habe schon ein Konto</Link>
        </div>
        <p className="text-xs text-gray-600 mt-3">Kostenlos starten · keine Kreditkarte nötig</p>
      </section>

      {/* Features */}
      <section className="px-6 py-12 bg-white/5 border-y border-gray-800">
        <div className="max-w-5xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="panel">
              <Icon className="w-6 h-6 text-pokemon-yellow mb-2" />
              <h3 className="font-semibold">{title}</h3>
              <p className="text-sm text-gray-400 mt-1">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="px-6 py-14 max-w-3xl mx-auto w-full">
        <h2 className="text-2xl font-bold text-center mb-6">Einfache Preise</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="panel">
            <h3 className="font-bold text-lg">Free</h3>
            <p className="text-3xl font-bold my-2">0 €</p>
            <ul className="space-y-1.5 text-sm text-gray-300">
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-400 mt-0.5" /> Bis zu 50 Karten</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-green-400 mt-0.5" /> Scannen & Live-Preise</li>
            </ul>
          </div>
          <div className="panel border-pokemon-yellow/60 relative">
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-pokemon-yellow text-black text-[10px] font-bold px-2 py-0.5 rounded-full">BELIEBT</span>
            <h3 className="font-bold text-lg flex items-center gap-1.5"><Crown className="w-5 h-5 text-pokemon-yellow" /> Pro</h3>
            <p className="text-3xl font-bold my-2">4,99 €<span className="text-gray-500 text-sm"> / Monat</span></p>
            <ul className="space-y-1.5 text-sm text-gray-300">
              <li className="flex gap-2"><Check className="w-4 h-4 text-pokemon-yellow mt-0.5" /> Unbegrenzte Karten</li>
              <li className="flex gap-2"><Check className="w-4 h-4 text-pokemon-yellow mt-0.5" /> eBay-Export & CSV/PDF</li>
            </ul>
          </div>
        </div>
        <div className="text-center mt-8">
          <Link to="/login?mode=register" className="btn-primary">Konto erstellen</Link>
        </div>
      </section>

      <LandingFooter />
    </div>
  )
}

export function LandingFooter() {
  return (
    <footer className="border-t border-gray-800 px-6 py-6 text-center text-xs text-gray-600 space-x-4">
      <span>© {new Date().getFullYear()} CardVault</span>
      <Link to="/impressum" className="hover:text-gray-400">Impressum</Link>
      <Link to="/datenschutz" className="hover:text-gray-400">Datenschutz</Link>
      <Link to="/agb" className="hover:text-gray-400">AGB</Link>
    </footer>
  )
}
