# Cardeva — Marktplatz-Anbindung (eBay · Whatnot · Vinted)

Stand: Juli 2026. Dieses Dokument beschreibt, was automatisiert ist, was Nutzer
tun müssen und was DU (als Betreiber) einmalig einrichten musst.

## Übersicht der Möglichkeiten

| Plattform | Sofort (ohne Setup) | Mit Konto-Verbindung |
|-----------|--------------------|----------------------|
| **eBay**  | Bulk-CSV (Verkäufer-Cockpit → Hochladen) | Live-Listings per API, Verkaufs-Erkennung, Auto-Delist |
| **Whatnot** | Bulk-CSV (Seller Hub → Bulk Import, landet als Entwürfe) | Live-Listings per Seller-API (GraphQL), Verkaufs-Erkennung, Auto-Delist |
| **Vinted** | Fertige Listing-Texte (Kopieren / .txt) | ❌ nicht möglich — Vinted hat keine öffentliche Verkäufer-API (nur ein allowlisted „Pro"-Programm). Automatisierung per Bot verstößt gegen deren AGB. |

Der „Verkaufen"-Dialog in der App hat jetzt drei Tabs (eBay / Whatnot / Vinted)
mit gemeinsamen Preis-Einstellungen (Faktor, Mindestpreis, .99-Rundung).

## Cross-Listing & Auto-Delist — wie es funktioniert

1. Nutzer verbindet eBay (OAuth) und/oder Whatnot (API-Token).
2. „Live listen" erstellt die Angebote direkt über die jeweilige API.
   Jedes Listing wird in der Tabelle `marketplace_listings` protokolliert
   (SKU = `cardvault-<card_id>`).
3. „Sync" (Button im Dialog) prüft die letzten Bestellungen beider Plattformen.
   Wird eine Karte irgendwo verkauft → alle anderen aktiven Listings dieser
   Karte werden per API beendet.
   → Später per Cron/Webhook automatisierbar (eBay Platform Notifications).

## Einmaliges Betreiber-Setup: eBay-App

1. Kostenlosen Account auf https://developer.ebay.com anlegen.
2. App erstellen → **App ID (Client ID)**, **Cert ID (Client Secret)**.
3. Unter „User Tokens" einen **RuName** (Redirect URL name) anlegen.
   Als „Auth accepted URL" die Callback-URL eintragen:
   `https://<deine-domain>/api/market/ebay/callback`
4. Umgebungsvariablen setzen:
   ```
   EBAY_CLIENT_ID=...
   EBAY_CLIENT_SECRET=...
   EBAY_RU_NAME=...
   EBAY_ENV=production          # oder sandbox zum Testen
   EBAY_MARKETPLACE_ID=EBAY_DE
   ```
5. Optional (empfohlen): Business-Policy-IDs der Verkäufer per Env erzwingen —
   sonst braucht das eBay-Konto des Nutzers eingerichtete Zahlungs-/Versand-/
   Rücknahme-Richtlinien:
   ```
   EBAY_FULFILLMENT_POLICY_ID=...
   EBAY_PAYMENT_POLICY_ID=...
   EBAY_RETURN_POLICY_ID=...
   ```

Danach können Nutzer im Verkaufen-Dialog auf „Verbinden" klicken — der Rest
(OAuth-Consent, Token-Speicherung, Refresh) läuft automatisch.

## Nutzer-Setup: Whatnot

Whatnot-Verkäufer generieren ihren API-Token im **Seller Hub** (Entwickler-/
API-Bereich) und fügen ihn im Whatnot-Tab des Verkaufen-Dialogs ein. Cardeva
validiert den Token sofort (`me`-Query) und zeigt den Benutzernamen an.

Hinweis: Die Whatnot Seller-API ist relativ neu — falls sich das GraphQL-Schema
ändert, liegen alle Aufrufe zentral in `backend/services/whatnot_api_service.py`.

## Vinted — bewusste Entscheidung

Es gibt Drittanbieter (Crosslist, ListPerfectly …), die Vinted per Browser-
Automatisierung befüllen. Das ist AGB-widrig, bruchanfällig und für ein
Abo-Produkt ein rechtliches Risiko. Cardeva liefert stattdessen den
schnellsten legalen Weg: fertige Texte + Preis pro Karte zum Einfügen
(Kopier-Button pro Karte, Gesamt-Export als .txt).

## Neue API-Endpunkte

```
GET    /api/market/status                  Verbindungs- & Feature-Status
POST   /api/market/whatnot/export/csv     Whatnot-Bulk-CSV
POST   /api/market/vinted/preview         Vinted-Texte (JSON)
POST   /api/market/vinted/export/txt      Vinted-Texte (.txt)
GET    /api/market/ebay/connect           eBay-OAuth-URL
GET    /api/market/ebay/callback          OAuth-Redirect (kein Auth-Header)
DELETE /api/market/ebay/connection        eBay trennen
POST   /api/market/whatnot/connection     Whatnot-Token speichern + prüfen
DELETE /api/market/whatnot/connection     Whatnot trennen
POST   /api/market/publish                Live-Cross-Listing
POST   /api/market/sync                   Verkäufe prüfen + Auto-Delist
GET    /api/market/listings               Cross-Listing-Ledger
```

## Performance-Änderungen (gleiche Session)

- Upload-Pipeline: OCR & Bildverarbeitung laufen jetzt in Worker-Threads
  (blockiert den Server nicht mehr) und mehrere Karten parallel.
- Beide Karten-Orientierungen werden gleichzeitig OCR't (Stop-Signal bricht
  die Verlierer-Orientierung ab) → Worst-Case ≈ halbiert.
- Frontend lädt Dateien in parallelen Häppchen hoch; der Bestätigen-Dialog
  öffnet sich, sobald die ERSTE Karte erkannt ist.
- GZip-Kompression für API-Antworten (Sammlung/Exporte ~5–10× kleiner).
