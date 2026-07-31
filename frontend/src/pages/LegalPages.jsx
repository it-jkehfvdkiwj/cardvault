import { Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, Vault } from 'lucide-react'
import { LandingFooter } from './LandingPage'

/**
 * Impressum, Datenschutzerklärung und AGB.
 *
 * Alles, was du noch mit eigenen Angaben füllen musst, steht im ANBIETER-Objekt
 * direkt hier drunter oder in eckigen Klammern — sonst nirgends. Solange dort
 * Platzhalter stehen, zeigt jede Seite oben einen Hinweiskasten; sobald du sie
 * ersetzt, verschwindet er von selbst.
 *
 * Das ist eine sorgfältig gebaute Vorlage, aber keine Rechtsberatung. Spätestens
 * wenn echtes Geld fließt, lohnt sich für AGB und Widerrufsbelehrung ein Blick
 * von jemandem mit Zulassung.
 */

// ── HIER DEINE ANGABEN EINTRAGEN ─────────────────────────────────────────────
const ANBIETER = {
  name: '[Dein Vor- und Nachname / Firma]',
  strasse: '[Straße & Hausnummer]',
  plz_ort: '[PLZ Ort]',
  land: 'Deutschland',
  email: '[deine@mail.de]',
  telefon: '[Telefonnummer]',      // '' setzen, wenn du keine angeben willst
  ustIdNr: '',                      // z. B. 'DE123456789'; leer lassen wenn keine
  kleinunternehmer: true,           // § 19 UStG — dann wird keine USt. ausgewiesen
}

const STAND = 'Juli 2026'

const istPlatzhalter = (v) => typeof v === 'string' && v.trim().startsWith('[')
const unvollstaendig = ['name', 'strasse', 'plz_ort', 'email']
  .some((k) => istPlatzhalter(ANBIETER[k]))

function Anschrift() {
  return (
    <p>
      {ANBIETER.name}<br />
      {ANBIETER.strasse}<br />
      {ANBIETER.plz_ort}<br />
      {ANBIETER.land}
    </p>
  )
}

function LegalLayout({ title, children }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 max-w-3xl mx-auto w-full">
        <Link to="/" className="flex items-center gap-2">
          <Vault className="text-pokemon-yellow w-6 h-6" />
          <span className="font-bold text-lg text-pokemon-yellow">Cardeva</span>
        </Link>
        <Link to="/" className="btn-ghost text-sm flex items-center gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Zurück
        </Link>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        <h1 className="text-2xl font-bold mb-1">{title}</h1>
        <p className="text-xs text-ink-3 mb-5">Stand: {STAND}</p>

        {unvollstaendig && (
          <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 mb-6">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Hinweis für den Betreiber: In <code>LegalPages.jsx</code> stehen oben im
              Objekt <code>ANBIETER</code> noch Platzhalter. Bitte vor dem Live-Gang
              ersetzen — dieser Kasten verschwindet dann automatisch.
            </span>
          </div>
        )}

        <div className="space-y-4 text-sm text-ink-2 leading-relaxed [&_h2]:font-semibold [&_h2]:text-ink [&_h2]:pt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
          {children}
        </div>
      </main>

      <LandingFooter />
    </div>
  )
}

// ── Impressum ─────────────────────────────────────────────────────────────────

export function ImpressumPage() {
  return (
    <LegalLayout title="Impressum">
      <h2>Angaben gemäß § 5 DDG</h2>
      <Anschrift />

      <h2>Kontakt</h2>
      <p>
        E-Mail: {ANBIETER.email}
        {ANBIETER.telefon && <><br />Telefon: {ANBIETER.telefon}</>}
      </p>

      <h2>Umsatzsteuer</h2>
      <p>
        {ANBIETER.ustIdNr
          ? <>Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: {ANBIETER.ustIdNr}</>
          : ANBIETER.kleinunternehmer
            ? <>Gemäß § 19 UStG wird keine Umsatzsteuer berechnet und daher auch nicht
                ausgewiesen.</>
            : <>[Umsatzsteuer-Identifikationsnummer nach § 27a UStG eintragen]</>}
      </p>

      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <Anschrift />

      <h2>EU-Streitschlichtung</h2>
      <p>
        Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung
        bereit:{' '}
        <a
          href="https://ec.europa.eu/consumers/odr/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-pokemon-yellow hover:underline"
        >
          ec.europa.eu/consumers/odr
        </a>
        . Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren
        vor einer Verbraucherschlichtungsstelle teilzunehmen.
      </p>

      <h2>Haftung für Inhalte und Links</h2>
      <p>
        Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den
        allgemeinen Gesetzen verantwortlich. Für Inhalte externer Links ist stets der
        jeweilige Anbieter verantwortlich; zum Zeitpunkt der Verlinkung waren keine
        Rechtsverstöße erkennbar. Bei Bekanntwerden von Rechtsverletzungen entfernen
        wir solche Links umgehend.
      </p>

      <h2>Marken Dritter</h2>
      <p>
        Pokémon sowie zugehörige Namen, Bilder und Symbole sind eingetragene Marken
        von Nintendo, Creatures Inc., GAME FREAK inc. und The Pokémon Company.
        Cardeva steht in keiner Verbindung zu diesen Unternehmen und wird von ihnen
        weder betrieben noch unterstützt oder geprüft. Kartendaten und Kartenbilder
        stammen aus öffentlich zugänglichen Quellen (u. a. Pokémon TCG API) und dienen
        ausschließlich der Identifikation der vom Nutzer selbst besessenen Karten.
      </p>
    </LegalLayout>
  )
}

// ── Datenschutz ───────────────────────────────────────────────────────────────

export function DatenschutzPage() {
  return (
    <LegalLayout title="Datenschutzerklärung">
      <h2>1. Verantwortlicher</h2>
      <p>Verantwortlich für die Datenverarbeitung auf dieser Website ist:</p>
      <Anschrift />
      <p>E-Mail: {ANBIETER.email}</p>

      <h2>2. Welche Daten wir verarbeiten</h2>
      <ul>
        <li>
          <strong>Konto:</strong> E-Mail-Adresse, optionaler Anzeigename und dein
          Passwort. Das Passwort wird ausschließlich als bcrypt-Hash gespeichert — wir
          können es weder lesen noch wiederherstellen.
        </li>
        <li>
          <strong>Nutzungsdaten:</strong> Zeitpunkt des letzten Logins sowie dein
          gewählter Tarif.
        </li>
        <li>
          <strong>Inhalte:</strong> die von dir erfassten Karten samt Zustand, Menge,
          Sprache, Notizen und Preisverlauf sowie die von dir hochgeladenen Fotos.
        </li>
        <li>
          <strong>Server-Logs:</strong> beim Aufruf werden technisch notwendige Daten
          wie IP-Adresse, Zeitpunkt, aufgerufene Adresse und Browsertyp verarbeitet.
          Sie dienen dem Betrieb und der Abwehr von Angriffen (Art. 6 Abs. 1 lit. f
          DSGVO) und werden kurzfristig gelöscht.
        </li>
      </ul>

      <h2>3. Zwecke und Rechtsgrundlagen</h2>
      <ul>
        <li>
          <strong>Vertragserfüllung</strong> (Art. 6 Abs. 1 lit. b DSGVO):
          Bereitstellung des Kontos, Speicherung deiner Sammlung, Kartenerkennung,
          Preisabruf, Export.
        </li>
        <li>
          <strong>Berechtigtes Interesse</strong> (Art. 6 Abs. 1 lit. f DSGVO):
          sicherer und stabiler Betrieb, Missbrauchs- und Angriffsabwehr (z. B.
          Begrenzung fehlgeschlagener Login-Versuche).
        </li>
        <li>
          <strong>Rechtliche Verpflichtung</strong> (Art. 6 Abs. 1 lit. c DSGVO):
          steuer- und handelsrechtliche Aufbewahrungspflichten bei Zahlungen.
        </li>
      </ul>

      <h2>4. Bildverarbeitung bei der Kartenerkennung</h2>
      <p>
        Fotografierte oder hochgeladene Karten werden auf unserem Server verarbeitet:
        zugeschnitten, per Texterkennung (OCR) ausgewertet und mit Kartendatenbanken
        abgeglichen. Dabei erzeugte temporäre Dateien werden automatisch spätestens
        nach 24 Stunden gelöscht. Nur Fotos, die du einer Karte bewusst als
        Verkaufsfoto zuordnest, werden dauerhaft gespeichert — und nur so lange, bis
        du sie oder die Karte löschst.
      </p>

      <h2>5. Cookies und lokale Speicherung</h2>
      <p>
        Cardeva setzt <strong>keine Tracking-Cookies</strong> und bindet keine
        Analyse- oder Werbedienste ein. Nach dem Login wird lediglich dein
        Anmelde-Token im <em>localStorage</em> deines Browsers abgelegt, damit du
        angemeldet bleibst. Das ist für den von dir angeforderten Dienst unbedingt
        erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG) und daher nicht einwilligungspflichtig.
        Beim Abmelden wird der Token entfernt.
      </p>

      <h2>6. Empfänger und Drittdienste</h2>
      <ul>
        <li>
          <strong>Hosting:</strong> [Name und Sitz deines Hosters eintragen, z. B.
          „Render Services, Inc., USA" oder „Hetzner Online GmbH, Deutschland"]. Der
          Hoster verarbeitet Daten weisungsgebunden als Auftragsverarbeiter
          (Art. 28 DSGVO); ein entsprechender Vertrag ist geschlossen. Bei Anbietern
          außerhalb der EU erfolgt die Übermittlung auf Grundlage der
          EU-Standardvertragsklauseln.
        </li>
        <li>
          <strong>Pokémon TCG API / PokeAPI:</strong> Abruf von Kartendaten,
          Kartenbildern und Preisen. Übermittelt wird nur die Suchanfrage (z. B.
          Kartenname oder Setnummer), keine Kontodaten.
        </li>
        <li>
          <strong>Cardmarket:</strong> optionaler Abruf europäischer Marktpreise —
          ebenfalls ohne Übermittlung personenbezogener Daten.
        </li>
        <li>
          <strong>Stripe</strong> (Stripe Payments Europe Ltd., Irland): nur wenn du
          ein kostenpflichtiges Abo abschließt. Zahlungsdaten wie Kartennummern werden
          ausschließlich von Stripe verarbeitet und erreichen unsere Server nie. Wir
          speichern lediglich eine Kunden- und Abo-Kennung.
        </li>
        <li>
          <strong>eBay:</strong> nur wenn du selbst einen Export oder eine Verbindung
          deines eBay-Kontos auslöst. Dann werden die von dir ausgewählten Artikeldaten
          und Fotos an eBay übertragen.
        </li>
        <li>
          <strong>E-Mail-Versand:</strong> für Passwort-Reset-Mails nutzen wir [Name
          deines Mailanbieters eintragen].
        </li>
      </ul>
      <p>
        Schriften und Programmcode der Seite werden vollständig von unserem eigenen
        Server ausgeliefert. Es besteht <strong>keine</strong> Verbindung zu Google
        Fonts oder anderen Content-Delivery-Netzwerken.
      </p>

      <h2>7. Speicherdauer</h2>
      <p>
        Konto- und Sammlungsdaten werden gespeichert, solange dein Konto besteht.
        Löschst du dein Konto unter „Konto → Konto löschen", werden alle Karten,
        Wantlist-Einträge, Fotos, Statistiken und Marktplatz-Verknüpfungen sofort und
        unwiderruflich entfernt. Ausgenommen sind Daten, die wir aufgrund gesetzlicher
        Aufbewahrungspflichten (insbesondere Rechnungsdaten, § 147 AO, § 257 HGB)
        weiter vorhalten müssen.
      </p>

      <h2>8. Deine Rechte</h2>
      <p>Dir stehen jederzeit folgende Rechte zu:</p>
      <ul>
        <li>Auskunft über die zu dir gespeicherten Daten (Art. 15 DSGVO)</li>
        <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO)</li>
        <li>Löschung (Art. 17 DSGVO)</li>
        <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
        <li>
          Datenübertragbarkeit (Art. 20 DSGVO) — die Exportfunktion gibt dir deine
          Sammlung jederzeit als CSV, JSON oder PDF heraus
        </li>
        <li>
          Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen
          (Art. 21 DSGVO)
        </li>
      </ul>
      <p>
        Wende dich dafür einfach an {ANBIETER.email}. Außerdem hast du das Recht, dich
        bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO),
        insbesondere in dem Bundesland deines gewöhnlichen Aufenthalts.
      </p>

      <h2>9. Datensicherheit</h2>
      <p>
        Die Übertragung erfolgt ausschließlich verschlüsselt über HTTPS. Passwörter
        werden mit bcrypt gehasht. Der Zugriff auf deine Sammlung ist an dein Konto
        gebunden; öffentlich sichtbar wird sie nur, wenn du die Teilen-Funktion selbst
        aktivierst. Fehlgeschlagene Anmeldeversuche werden begrenzt, um Angriffe auf
        Passwörter zu erschweren.
      </p>

      <h2>10. Keine automatisierte Entscheidungsfindung</h2>
      <p>
        Es findet keine automatisierte Entscheidungsfindung einschließlich Profiling im
        Sinne von Art. 22 DSGVO statt. Die automatische Kartenerkennung dient allein
        deiner Bequemlichkeit und ist von dir jederzeit korrigierbar.
      </p>
    </LegalLayout>
  )
}

// ── AGB ───────────────────────────────────────────────────────────────────────

export function AGBPage() {
  return (
    <LegalLayout title="Allgemeine Geschäftsbedingungen">
      <h2>1. Geltungsbereich und Anbieter</h2>
      <p>
        Diese Bedingungen gelten für die Nutzung des Online-Dienstes Cardeva
        („Dienst"), angeboten von {ANBIETER.name}, {ANBIETER.strasse},{' '}
        {ANBIETER.plz_ort}. Abweichende Bedingungen des Nutzers finden keine Anwendung.
      </p>

      <h2>2. Vertragsschluss</h2>
      <p>
        Der Vertrag kommt mit der Registrierung eines Kontos zustande. Dafür ist eine
        gültige E-Mail-Adresse erforderlich. Der Nutzer muss volljährig sein oder die
        Zustimmung eines Erziehungsberechtigten haben.
      </p>

      <h2>3. Leistungen</h2>
      <p>
        Der Dienst ermöglicht das Erfassen, Verwalten, Bewerten und Exportieren von
        Sammelkarten. Erkennungs- und Preisangaben beruhen auf Daten Dritter und
        erfolgen <strong>ohne Gewähr</strong> — sie sind eine Orientierung, keine
        Wertermittlung und keine Anlageberatung.
      </p>
      <p>
        Es besteht kein Anspruch auf ununterbrochene Verfügbarkeit. Wartungen,
        Weiterentwicklungen und Ausfälle von Drittdiensten können zu vorübergehenden
        Einschränkungen führen.
      </p>

      <h2>4. Pflichten des Nutzers</h2>
      <ul>
        <li>Zugangsdaten sind geheim zu halten und nicht weiterzugeben.</li>
        <li>
          Es dürfen keine rechtsverletzenden Inhalte hochgeladen werden — lade nur
          Fotos hoch, die du selbst aufgenommen hast.
        </li>
        <li>
          Automatisierte Massenabfragen, das Umgehen technischer Beschränkungen und
          Versuche, den Betrieb zu stören, sind untersagt.
        </li>
      </ul>
      <p>
        Bei erheblichen Verstößen dürfen wir das Konto sperren. Der Nutzer wird darüber
        informiert und kann seine Daten zuvor exportieren, soweit dem nichts
        entgegensteht.
      </p>

      <h2>5. Preise und Zahlung</h2>
      <p>
        Während der Einführungsphase ist die Nutzung vollständig kostenlos. Wird später
        ein kostenpflichtiger Tarif eingeführt, gilt: Der Preis wird vor Abschluss klar
        angezeigt, das Abo wird monatlich im Voraus abgerechnet und verlängert sich
        jeweils um einen Monat, bis es gekündigt wird.
        {ANBIETER.kleinunternehmer && !ANBIETER.ustIdNr &&
          ' Alle Preise sind Endpreise; gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen.'}
      </p>
      <p>
        Eine Umstellung auf kostenpflichtige Nutzung erfolgt niemals automatisch:
        bestehende Nutzer werden vorab informiert und müssen aktiv zustimmen.
      </p>

      <h2>6. Laufzeit und Kündigung</h2>
      <p>
        Das kostenlose Konto kann jederzeit ohne Frist gelöscht werden („Konto → Konto
        löschen"). Ein kostenpflichtiges Abo ist jederzeit zum Ende des laufenden
        Abrechnungszeitraums kündbar, direkt im Konto und ohne Angabe von Gründen.
      </p>

      <h2>7. Widerrufsrecht für Verbraucher</h2>
      <div className="border border-line rounded-lg p-4 bg-surface-2/40 space-y-3">
        <p className="font-semibold text-ink">Widerrufsbelehrung</p>
        <p>
          Du hast das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen
          Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des
          Vertragsabschlusses.
        </p>
        <p>
          Um dein Widerrufsrecht auszuüben, musst du uns ({ANBIETER.name},{' '}
          {ANBIETER.strasse}, {ANBIETER.plz_ort}, {ANBIETER.email}) mittels einer
          eindeutigen Erklärung (z. B. per E-Mail) über deinen Entschluss informieren.
          Zur Wahrung der Frist reicht es, die Mitteilung vor Ablauf der Frist
          abzusenden.
        </p>
        <p>
          <strong>Folgen des Widerrufs:</strong> Wenn du diesen Vertrag widerrufst,
          erstatten wir dir alle Zahlungen, die wir von dir erhalten haben, unverzüglich
          und spätestens binnen vierzehn Tagen ab dem Tag des Eingangs deines Widerrufs.
          Für die Rückzahlung verwenden wir dasselbe Zahlungsmittel wie bei der
          ursprünglichen Transaktion; Entgelte werden dir wegen dieser Rückzahlung nicht
          berechnet.
        </p>
        <p>
          <strong>Vorzeitiges Erlöschen:</strong> Verlangst du ausdrücklich, dass wir
          mit der Leistung vor Ablauf der Widerrufsfrist beginnen, hast du uns einen
          angemessenen Betrag für die bis zum Widerruf erbrachte Leistung zu zahlen. Das
          Widerrufsrecht erlischt vorzeitig, wenn wir die Leistung vollständig erbracht
          haben und du dem vor Beginn ausdrücklich zugestimmt und deine Kenntnis vom
          Erlöschen bestätigt hast.
        </p>
        <p className="text-xs text-ink-3">
          Muster-Widerrufsformular: „Hiermit widerrufe(n) ich/wir den von mir/uns
          abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung:
          Cardeva-Abo. Bestellt am: … Name: … Anschrift: … Datum: …"
        </p>
      </div>

      <h2>8. Inhalte des Nutzers</h2>
      <p>
        Alle hochgeladenen Fotos und erfassten Daten bleiben dein Eigentum. Wir erhalten
        lediglich das einfache, auf den Betrieb des Dienstes beschränkte Recht, sie zu
        speichern und dir anzuzeigen — sowie sie an die Plattformen zu übertragen, für
        die du selbst einen Export auslöst. Eine sonstige Nutzung, Weitergabe oder
        Auswertung findet nicht statt.
      </p>

      <h2>9. Haftung</h2>
      <p>
        Wir haften unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei
        Verletzung von Leben, Körper oder Gesundheit. Bei leicht fahrlässiger Verletzung
        wesentlicher Vertragspflichten ist die Haftung auf den vertragstypischen,
        vorhersehbaren Schaden begrenzt. Im Übrigen ist die Haftung ausgeschlossen. Die
        Haftung nach dem Produkthaftungsgesetz bleibt unberührt.
      </p>
      <p>
        Für Verkäufe auf Drittplattformen (z. B. eBay, Whatnot, Vinted) bist du selbst
        verantwortlich; dort gelten allein die Bedingungen des jeweiligen Anbieters.
        Bitte lege regelmäßig eigene Exporte deiner Sammlung an — Sicherungskopien
        liegen in deiner Verantwortung.
      </p>

      <h2>10. Änderungen dieser Bedingungen</h2>
      <p>
        Wir dürfen diese Bedingungen ändern, wenn dies zur Anpassung an eine geänderte
        Rechtslage oder an Weiterentwicklungen des Dienstes erforderlich ist. Änderungen
        werden mindestens sechs Wochen vor Inkrafttreten per E-Mail mitgeteilt.
        Widersprichst du nicht bis zum Wirksamwerden, gelten sie als angenommen; darauf
        weisen wir in der Mitteilung gesondert hin. Im Falle eines Widerspruchs kannst
        du den Vertrag fristlos kündigen.
      </p>

      <h2>11. Schlussbestimmungen</h2>
      <p>
        Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des
        UN-Kaufrechts. Zwingende Verbraucherschutzvorschriften des Staates, in dem der
        Nutzer seinen gewöhnlichen Aufenthalt hat, bleiben unberührt. Sollte eine
        Bestimmung unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen
        unberührt.
      </p>
    </LegalLayout>
  )
}
