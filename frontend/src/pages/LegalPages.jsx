import { Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, Vault } from 'lucide-react'
import { LandingFooter } from './LandingPage'

function LegalLayout({ title, children }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 max-w-3xl mx-auto w-full">
        <Link to="/" className="flex items-center gap-2">
          <Vault className="text-pokemon-yellow w-6 h-6" />
          <span className="font-bold text-lg text-pokemon-yellow">CardVault</span>
        </Link>
        <Link to="/" className="btn-ghost text-sm flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Zurück
        </Link>
      </header>
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        <h1 className="text-2xl font-bold mb-4">{title}</h1>
        <div className="flex items-start gap-2 text-xs text-amber-500/90 bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-2 mb-6">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Platzhalter — bitte vor dem Live-Gang mit deinen echten Angaben füllen
            und ggf. rechtlich prüfen lassen.</span>
        </div>
        <div className="space-y-4 text-sm text-gray-300 leading-relaxed">{children}</div>
      </main>
      <LandingFooter />
    </div>
  )
}

export function ImpressumPage() {
  return (
    <LegalLayout title="Impressum">
      <p>Angaben gemäß § 5 DDG (ehem. § 5 TMG):</p>
      <p>
        [Dein Name / Firma]<br />
        [Straße & Hausnummer]<br />
        [PLZ Ort]<br />
        Deutschland
      </p>
      <h2 className="font-semibold text-white">Kontakt</h2>
      <p>Telefon: [Telefonnummer]<br />E-Mail: [deine@mail.de]</p>
      <h2 className="font-semibold text-white">Umsatzsteuer-ID</h2>
      <p>[falls vorhanden, USt-IdNr. nach § 27a UStG]</p>
      <h2 className="font-semibold text-white">Verantwortlich für den Inhalt</h2>
      <p>[Name, Anschrift wie oben]</p>
    </LegalLayout>
  )
}

export function DatenschutzPage() {
  return (
    <LegalLayout title="Datenschutzerklärung">
      <h2 className="font-semibold text-white">1. Verantwortlicher</h2>
      <p>[Name, Anschrift, E-Mail — siehe Impressum]</p>
      <h2 className="font-semibold text-white">2. Welche Daten wir verarbeiten</h2>
      <p>
        Bei der Registrierung: E-Mail-Adresse und (gehashtes) Passwort. Beim Nutzen
        des Dienstes: die von dir hinzugefügten Karten und zugehörige Daten. Bei
        einem Abo: Zahlungsdaten werden ausschließlich beim Zahlungsdienstleister
        (Stripe) verarbeitet — wir speichern keine Kartendaten.
      </p>
      <h2 className="font-semibold text-white">3. Zweck & Rechtsgrundlage</h2>
      <p>
        Verarbeitung zur Bereitstellung des Dienstes (Art. 6 Abs. 1 lit. b DSGVO)
        sowie zur Abrechnung. Hochgeladene Bilder werden zur Karten­erkennung
        verarbeitet.
      </p>
      <h2 className="font-semibold text-white">4. Drittdienste</h2>
      <p>Pokémon TCG API, Cardmarket, PokeAPI (Karten-/Preisdaten), Stripe (Zahlungen),
        eBay (nur beim Export durch dich). [Bitte ergänzen/prüfen.]</p>
      <h2 className="font-semibold text-white">5. Deine Rechte</h2>
      <p>
        Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und
        Widerspruch. Du kannst dein Konto jederzeit unter „Konto" selbst löschen.
      </p>
      <h2 className="font-semibold text-white">6. Speicherdauer</h2>
      <p>Daten werden gespeichert, solange dein Konto besteht, und nach Löschung
        entfernt (gesetzliche Aufbewahrungsfristen bleiben unberührt).</p>
    </LegalLayout>
  )
}

export function AGBPage() {
  return (
    <LegalLayout title="Allgemeine Geschäftsbedingungen">
      <h2 className="font-semibold text-white">1. Geltungsbereich</h2>
      <p>Diese AGB gelten für die Nutzung von CardVault („Dienst").</p>
      <h2 className="font-semibold text-white">2. Leistungen</h2>
      <p>Der Dienst bietet das Scannen, Verwalten und den Export von Sammelkarten.
        Es besteht kein Anspruch auf ununterbrochene Verfügbarkeit.</p>
      <h2 className="font-semibold text-white">3. Abo & Preise</h2>
      <p>
        Das Pro-Abo wird monatlich abgerechnet und verlängert sich automatisch, bis
        es gekündigt wird. Die Kündigung ist jederzeit zum Ende des
        Abrechnungszeitraums über „Konto" möglich.
      </p>
      <h2 className="font-semibold text-white">4. Widerrufsrecht</h2>
      <p>[Verbrauchern steht ein gesetzliches Widerrufsrecht zu — Widerrufsbelehrung
        hier einfügen.]</p>
      <h2 className="font-semibold text-white">5. Haftung</h2>
      <p>Erkennungs- und Preisangaben erfolgen ohne Gewähr. Für Verkäufe auf
        Drittplattformen (z. B. eBay) bist du selbst verantwortlich.</p>
      <h2 className="font-semibold text-white">6. Schlussbestimmungen</h2>
      <p>Es gilt deutsches Recht. [Gerichtsstand etc. ergänzen.]</p>
    </LegalLayout>
  )
}
