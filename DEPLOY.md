# CardVault – Live schalten (Deployment)

Kurzanleitung, um CardVault als SaaS online zu stellen.

## 1. Pflicht-Konfiguration (Sicherheit!)

In der Produktion **müssen** diese Werte gesetzt sein (Backend-Env):

| Variable | Bedeutung |
|---|---|
| `JWT_SECRET` | Langes Zufallsgeheimnis für Login-Token. **Niemals den Default benutzen.** Generieren: `python -c "import secrets;print(secrets.token_urlsafe(48))"` |
| `ADMIN_EMAILS` | Deine E-Mail(s), kommagetrennt → schaltet das Admin-Panel frei |
| `CORS_ORIGINS` | Deine echte Domain, z. B. `https://cardvault.de` |
| `APP_BASE_URL` | Deine Domain (für Stripe-Weiterleitungen) |
| `ALLOW_DEMO_BILLING` | Auf `false` setzen, sobald Stripe live ist (sonst kann sich jeder gratis auf Pro setzen) |

## 2. HTTPS ist Pflicht

- Die **Kamera-Funktion** und sichere Logins funktionieren nur über `https://`.
- Einfachste Wege: Hosting mit automatischem TLS (Render, Railway, Fly.io) **oder**
  ein Reverse-Proxy mit Let's Encrypt (Caddy/Traefik/nginx + certbot) vor den Containern.

## 3. Deployment mit Docker (empfohlen)

```bash
# .env neben docker-compose.yml anlegen:
#   JWT_SECRET=...
#   ADMIN_EMAILS=deine@mail.de
#   CORS_ORIGINS=https://deine-domain.de
#   APP_BASE_URL=https://deine-domain.de
#   POKEMON_TCG_API_KEY=...        (optional)
docker-compose up --build -d
```
Frontend läuft auf Port 80, Backend auf 8000. Stell einen TLS-Reverse-Proxy davor.

> **Produktion:** In `docker-compose.yml` das Volume `./backend:/app` entfernen
> (das ist nur für die lokale Entwicklung) und die SQLite-DB bzw. einen echten
> Postgres in einem persistenten Volume ablegen. Für mehr Last `DATABASE_URL`
> auf PostgreSQL umstellen.

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

- [ ] `JWT_SECRET` gesetzt (lang & zufällig)
- [ ] `ADMIN_EMAILS` = deine E-Mail, einmal aus-/einloggen → Admin-Panel sichtbar
- [ ] `CORS_ORIGINS` + `APP_BASE_URL` = echte Domain
- [ ] HTTPS aktiv (Kamera testen)
- [ ] Stripe live **oder** bewusst `ALLOW_DEMO_BILLING=true` belassen
- [ ] SMTP für Passwort-Reset-Mails konfiguriert
- [ ] Impressum / Datenschutz / AGB mit echten Angaben gefüllt
- [ ] Datenbank in persistentem Volume / Backup eingerichtet
- [ ] Eine Testkarte hochladen + als Pro eine eBay-CSV exportieren

## Pläne / Limits anpassen

Tarife, Preise und Limits stehen zentral in
`backend/services/plan_service.py` (`PLANS`). Dort z. B. das Free-Karten-Limit
oder den Pro-Preis ändern – Backend und Frontend lesen denselben Wert.
