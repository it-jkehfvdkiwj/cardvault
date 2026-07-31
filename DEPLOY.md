# CardVault – Live schalten (Deployment)

Kurzanleitung, um CardVault online zu stellen.

## 0. Geschlossene Testphase (der aktuelle Modus)

Standardmäßig läuft CardVault als **privater Test**, nicht als öffentliches
Angebot:

| Variable | Wert | Wirkung |
|---|---|---|
| `PRIVATE_BETA` | `true` | Registrierung nur mit Einladungscode |
| `INVITE_CODES` | z. B. `sammler-2026,kumpel-x9` | Notfall-Codes, kommagetrennt |

> `INVITE_CODES` ist nur der Notnagel: unbegrenzt gültig, damit du auch mit
> leerer Datenbank reinkommst. Im **Admin-Panel** legst du bequemere Codes an —
> mit Beschriftung („für Max"), Nutzungslimit und Abschalter.

Solange `PRIVATE_BETA=true` ist:

- kann sich **niemand ohne Code** registrieren (Adressen aus `ADMIN_EMAILS`
  kommen immer rein — du sperrst dich also nie selbst aus),
- liefert `robots.txt` ein vollständiges `Disallow: /` aus und jede Antwort trägt
  `X-Robots-Tag: noindex, nofollow` — die Seite landet in keiner Suchmaschine,
- weisen Startseite und Registrierung sichtbar auf die geschlossene Testphase hin.

Bestehende Konten und Logins sind davon nicht betroffen.

### Admin-Panel

Trag deine Adresse in `ADMIN_EMAILS` ein und logge dich einmal aus und wieder
ein — dann erscheint **Admin** in der Seitenleiste. Dort siehst du:

- wer sich wann registriert hat und wann er zuletzt online war,
- mit welchem Einladungscode jemand gekommen ist,
- pro Nutzer aufklappbar: Sammlungsgröße, Sammlungswert, letzte Karten,
- Einladungscodes anlegen, beschriften, begrenzen und wieder abschalten,
- Konten sperren, löschen oder einen Passwort-Reset-Link verschicken.

Sobald `SMTP_*` gesetzt ist, bekommst du außerdem bei **jeder neuen
Registrierung eine E-Mail**. Ohne SMTP landet die Meldung im Server-Log.

**Warum das rechtlich hilft:** Eine Seite, die nur persönlich eingeladene Tester
erreichen können, ist kein an die Allgemeinheit gerichtetes Angebot. Sobald du
`PRIVATE_BETA=false` setzt, ändert sich das — dann müssen Impressum und
Datenschutzerklärung mit echten Angaben gefüllt sein (siehe Abschnitt 6).
Beides schaltet sich beim Umlegen des Schalters automatisch von „gesperrt" auf
„öffentlich" um; du musst keine Datei von Hand anfassen.

## 1. Pflicht-Konfiguration (Sicherheit!)

In der Produktion **müssen** diese Werte gesetzt sein (Backend-Env):

| Variable | Bedeutung |
|---|---|
| `APP_ENV` | `production` — aktiviert die strengen Checks, HSTS und blendet `/docs` aus |
| `JWT_SECRET` | Langes Zufallsgeheimnis für Login-Token. **Niemals den Default benutzen.** Generieren: `python -c "import secrets;print(secrets.token_urlsafe(48))"` |
| `ADMIN_EMAILS` | Deine E-Mail(s), kommagetrennt → schaltet das Admin-Panel frei |
| `CORS_ORIGINS` | Deine echte Domain, z. B. `https://cardvault.de` (exakt, ohne Slash am Ende) |
| `APP_BASE_URL` | Deine Domain (für Reset-Links, Stripe-Weiterleitungen, Foto-URLs) |
| `ALLOW_DEMO_BILLING` | Muss `false` bleiben — sonst kann sich **jeder Nutzer selbst dauerhaft auf Pro setzen** |
| `FREE_LAUNCH` | `true` = alle Pro-Funktionen sind für alle gratis (Launch-Phase, kein Stripe nötig). Auf `false` stellen, sobald du abrechnen willst |

> **Eingebauter Schutz:** Startet die App in der Produktion mit fehlendem oder
> unsicherem `JWT_SECRET` bzw. `CORS_ORIGINS=*`, **bricht sie mit einer klaren
> Fehlermeldung ab**, statt unsicher hochzufahren. Produktion wird auch dann
> erkannt, wenn `APP_ENV` fehlt (Render/Fly/Railway oder eine echte
> https-Domain in `APP_BASE_URL`/`CORS_ORIGINS`).

### Gratis-Launch vs. Stripe

`FREE_LAUNCH=true` schaltet alle Pro-Funktionen für alle frei, **ohne** in der
Datenbank herumzuschreiben. Wenn du später auf `false` stellst, gilt sofort
wieder die normale Free/Pro-Trennung — niemand behält versehentlich einen
Gratis-Pro-Account. Genau deshalb ist der alte „Demo-Upgrade"-Button jetzt
standardmäßig aus: der hat `plan=pro` **dauerhaft** gespeichert.

## 2. HTTPS ist Pflicht

- Die **Kamera-Funktion** und sichere Logins funktionieren nur über `https://`.
- Einfachste Wege: Hosting mit automatischem TLS (Render, Railway, Fly.io) **oder**
  ein Reverse-Proxy mit Let's Encrypt (Caddy/Traefik/nginx + certbot) vor den Containern.

## 3. Deployment

### Variante A: Render (am schnellsten)

`render.yaml` ist fertig konfiguriert (Docker, Postgres, Health-Check, Region
Frankfurt).

1. Repo zu GitHub pushen.
2. render.com → **New → Blueprint** → dieses Repo wählen.
3. Render fragt nach `APP_BASE_URL`, `CORS_ORIGINS` und `POKEMON_TCG_API_KEY`.
   Beim allerersten Deploy kennst du die URL noch nicht — irgendetwas eintragen,
   nach dem Deploy auf die echte URL (z. B. `https://cardvault.onrender.com`)
   korrigieren und neu deployen.
4. Einmal aus- und einloggen → Admin-Panel ist da.

**Grenzen des Free-Plans:** Der Dienst schläft nach ~15 Min Leerlauf ein (die
nächste Anfrage dauert dann ~30 s), und die kostenlose Postgres-Instanz läuft
nach 30 Tagen ab. Für einen echten Launch beides auf **Starter** stellen.

### Variante B: Eigener Server mit Docker

**→ Für Hetzner gibt es eine vollständige Schritt-für-Schritt-Anleitung zum
Abhaken: [HETZNER.md](HETZNER.md).**

Kurzfassung:

```bash
cp .env.production.example .env    # ausfüllen (JWT_SECRET, SITE_DOMAIN, …)
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up --build -d
```

Caddy holt automatisch ein Let's-Encrypt-Zertifikat für `SITE_DOMAIN` und
erneuert es selbst. App und Backend sind nur über localhost erreichbar — nach
außen geht ausschließlich Caddy über 443.

Ohne Domain (rein lokal) lässt du das Caddy-Overlay weg; die App liegt dann auf
`http://localhost:8080`. Beachte: **der Kamera-Scanner funktioniert nur über
https oder localhost** — auf einem Server ohne TLS bleibt er dunkel.

Für lokale Entwicklung stattdessen `docker compose -f docker-compose.dev.yml up`
— nur dort wird der Quellcode ins Image gemountet.

> Datenbank und Uploads liegen in benannten Volumes (`db_data`, `uploads_data`)
> und überleben ein `--build`. Für mehr Last die auskommentierte `db`-Section in
> `docker-compose.yml` aktivieren und `DATABASE_URL` auf Postgres stellen.

## 4. Echte Zahlungen mit Stripe (optional)

1. `pip install stripe` ist bereits in `requirements.txt`.
2. Bei https://dashboard.stripe.com ein **Produkt „Pro" mit monatlichem Preis** anlegen → `STRIPE_PRICE_ID` kopieren.
3. Env setzen: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, und `ALLOW_DEMO_BILLING=false`.
4. **Webhook** in Stripe anlegen → Ziel `https://deine-domain.de/api/billing/webhook`,
   Events: `checkout.session.completed`, `customer.subscription.updated/deleted`,
   `invoice.paid`, `invoice.payment_failed` → `STRIPE_WEBHOOK_SECRET` setzen.

Danach läuft der „Upgrade"-Button automatisch über Stripe Checkout.

## 5. E-Mail (Passwort-Reset)

Damit „Passwort vergessen"-Mails real verschickt werden, SMTP-Daten setzen:
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`.
Ohne SMTP wird der Reset-Link nur in die Server-Konsole geschrieben (nur Dev).

## 5b. Verkaufs-Fotos dauerhaft speichern (Cloudflare R2)

Ohne Objektspeicher liegen die eigenen Karten-Fotos auf dem (bei Render-Free
flüchtigen) Container-Dateisystem. Für dauerhafte Fotos **Cloudflare R2** (10 GB
gratis, keine Egress-Gebühren) einrichten:

1. Cloudflare-Konto → **R2** → **Create bucket** (z. B. `cardvault-photos`).
2. Bucket → **Settings → Public access** → **R2.dev subdomain** aktivieren
   (oder eine Custom Domain verbinden). Du erhältst eine öffentliche Basis-URL
   wie `https://pub-xxxxxxxx.r2.dev` — das ist `R2_PUBLIC_URL`.
3. R2 → **Manage R2 API Tokens** → **Create API token** (Berechtigung
   *Object Read & Write* für den Bucket). Notiere **Access Key ID** + **Secret**.
   Die **Account ID** steht in der R2-Übersicht.
4. Im Render-Web-Service diese Env-Variablen setzen:

| Variable | Wert |
|---|---|
| `R2_ACCOUNT_ID` | deine Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | Access Key ID des API-Tokens |
| `R2_SECRET_ACCESS_KEY` | Secret des API-Tokens |
| `R2_BUCKET` | Bucket-Name (z. B. `cardvault-photos`) |
| `R2_PUBLIC_URL` | öffentliche Basis-URL (z. B. `https://pub-xxxx.r2.dev`) |

Sind alle fünf gesetzt, lädt die App Fotos automatisch nach R2 (sonst lokal).
Status sichtbar unter **Konto → Verkaufs-Fotos** („☁️ Dauerhafter Speicher aktiv").

## 6. Rechtstexte

Vor dem Launch in `frontend/src/pages/LegalPages.jsx` **Impressum, Datenschutz
und AGB** mit deinen echten Angaben füllen (in Deutschland Pflicht) und im Zweifel
rechtlich prüfen lassen. Die Seiten sind über den Footer der Startseite erreichbar.

## 7. Pre-Launch-Checkliste

**Sicherheit**
- [ ] `JWT_SECRET` gesetzt (lang & zufällig) — die App startet sonst nicht
- [ ] `APP_ENV=production`
- [ ] `ALLOW_DEMO_BILLING=false`
- [ ] `CORS_ORIGINS` + `APP_BASE_URL` = echte Domain, exakt geschrieben
- [ ] HTTPS aktiv (Kamera-Scan auf dem Handy testen — geht nur über https)

**Inhalte** (erst nötig, wenn `PRIVATE_BETA=false`)
- [ ] Impressum / Datenschutz / AGB mit echten Angaben gefüllt
      (Objekt `ANBIETER` oben in `frontend/src/pages/LegalPages.jsx`)
- [ ] In `frontend/public/robots.txt` und `sitemap.xml`
      `REPLACE-WITH-YOUR-DOMAIN` durch deine Domain ersetzen
- [ ] Link-Vorschau prüfen: URL in WhatsApp an dich selbst schicken →
      `og-image.png` sollte erscheinen

**Betrieb**
- [ ] `ADMIN_EMAILS` = deine E-Mail, einmal aus-/einloggen → Admin-Panel sichtbar
- [ ] SMTP für Passwort-Reset-Mails konfiguriert (sonst landet der Link nur im Log)
- [ ] Datenbank in persistentem Volume + Backup eingerichtet
- [ ] Cloudflare R2 eingerichtet, falls Verkaufsfotos dauerhaft bleiben sollen

**Funktionstest mit einem frischen Konto**
- [ ] Registrieren, ausloggen, wieder einloggen
- [ ] „Passwort vergessen" → Mail kommt an → neues Passwort funktioniert
- [ ] Karte per Handy-Kamera scannen und bestätigen
- [ ] eBay-CSV exportieren
- [ ] Konto löschen (danach ist wirklich nichts mehr da)

## Pläne / Limits anpassen

Tarife, Preise und Limits stehen zentral in
`backend/services/plan_service.py` (`PLANS`). Dort z. B. das Free-Karten-Limit
oder den Pro-Preis ändern – Backend und Frontend lesen denselben Wert.
