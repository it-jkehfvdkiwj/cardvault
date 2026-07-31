# CardVault auf einem Hetzner-Server — Schritt für Schritt

Zum Abhaken. Plan etwa eine Stunde ein, davon ist die Hälfte Warten.

Am Ende läuft CardVault unter deiner eigenen Domain mit HTTPS, in der
geschlossenen Testphase, und startet nach einem Neustart des Servers von selbst
wieder.

**Was du vorher brauchst:** einen Hetzner-Account, eine Domain (oder kaufst sie
in Schritt 3), und ein Terminal. Unter Windows nimmst du PowerShell — `ssh` ist
dort seit Jahren eingebaut, du brauchst kein PuTTY.

---

## 1. SSH-Schlüssel erzeugen

Mit Schlüssel statt Passwort einzuloggen ist bequemer *und* sicherer: ein
Passwort kann durchprobiert werden, ein Schlüssel praktisch nicht.

```powershell
ssh-keygen -t ed25519 -C "cardvault"
```

Dreimal Enter (kein Passwort nötig, wenn nur du an den Rechner kommst). Dann den
öffentlichen Teil anzeigen und kopieren:

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub
```

- [ ] Schlüssel erzeugt und die `ssh-ed25519 …`-Zeile kopiert

---

## 2. Server anlegen

Auf [console.hetzner.com](https://console.hetzner.com) → **New Server**:

| Einstellung | Wahl |
|---|---|
| Location | **Falkenstein** oder **Nürnberg** |
| Image | **Ubuntu 26.04** (24.04 geht genauso) |
| Type | **Shared vCPU · x86** → **CX23** (mind. 4 GB RAM) |
| Networking | IPv4 **und** IPv6 anlassen |
| SSH-Key | den aus Schritt 1 einfügen |
| Name | `cardvault` |

Nicht die CAX-Reihe (ARM) nehmen — OpenCV und Tesseract laufen dort zwar, aber
du handelst dir eine Fehlerquelle ein, die bei dem Preisunterschied nicht lohnt.

Zur Ubuntu-Version: Beide LTS-Fassungen funktionieren, Docker unterstützt 26.04
offiziell. Das Wirtsystem stellt hier ohnehin nur Kernel und Docker bereit —
Python, OpenCV und Tesseract bringt der Container selbst mit. 26.04 wird bis
April 2031 gepflegt, 24.04 bis April 2029.

Notiere dir die **IPv4-Adresse**, die dir angezeigt wird.

- [ ] Server läuft, IP notiert

### Firewall

In der Console links unter **Firewalls** → **Create Firewall**, eingehend nur:

| Port | Protokoll | Quelle |
|---|---|---|
| 22 | TCP | deine IP (oder `0.0.0.0/0`, wenn deine IP wechselt) |
| 80 | TCP | `0.0.0.0/0`, `::/0` |
| 443 | TCP | `0.0.0.0/0`, `::/0` |

Dem Server zuweisen. Port 80 muss offen bleiben, sonst kann Let's Encrypt das
Zertifikat nicht ausstellen.

- [ ] Firewall aktiv und zugewiesen

---

## 3. Domain verbinden

Domain kaufen (z. B. bei Netcup oder INWX, ca. 2–5 €/Jahr). Dann beim
Domain-Anbieter zwei DNS-Einträge setzen:

| Typ | Name | Wert |
|---|---|---|
| A | `@` | die IPv4 deines Servers |
| AAAA | `@` | die IPv6 deines Servers |

Mach das **jetzt**, nicht später: DNS-Änderungen brauchen bis zu ein paar
Stunden, und Caddy holt das Zertifikat erst, wenn die Domain zeigt.

Prüfen (funktioniert, sobald es durch ist):

```powershell
nslookup deine-domain.de
```

- [ ] DNS zeigt auf den Server

---

## 4. Einloggen und absichern

```powershell
ssh root@DEINE-SERVER-IP
```

Beim ersten Mal `yes` tippen. Dann auf dem Server:

```bash
# Alles aktualisieren
apt update && apt upgrade -y

# Sicherheitsupdates künftig automatisch einspielen
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades      # zweimal <Ja>

# Passwort-Logins abschalten — ab jetzt geht nur noch dein Schlüssel
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

> Schließe dieses Fenster **nicht**, bevor du in einem zweiten Fenster geprüft
> hast, dass der Login noch klappt. Sonst sperrst du dich aus.

- [ ] Updates eingespielt, Passwort-Login aus, zweiter Login getestet

---

## 5. Docker installieren

```bash
curl -fsSL https://get.docker.com | sh
docker --version
```

- [ ] `docker --version` gibt eine Version aus

---

## 6. CardVault holen und konfigurieren

```bash
apt install -y git
git clone https://github.com/it-jkehfvdkiwj/cardvault.git /opt/cardvault
cd /opt/cardvault
cp .env.production.example .env

# JWT-Secret erzeugen und gleich eintragen
echo "JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')" >> .env

nano .env
```

In `nano` diese Werte setzen (die doppelte `JWT_SECRET`-Zeile oben löschen, die
untere ist die richtige):

```
SITE_DOMAIN=deine-domain.de
ACME_EMAIL=quirin06@mail.de
APP_BASE_URL=https://deine-domain.de
CORS_ORIGINS=https://deine-domain.de
ADMIN_EMAILS=quirin06@mail.de
PRIVATE_BETA=true
INVITE_CODES=denk-dir-was-schwer-erratbares-aus
FREE_LAUNCH=true
```

Speichern mit `Strg+O`, `Enter`, `Strg+X`.

> **Wichtig:** `CORS_ORIGINS` und `APP_BASE_URL` genau so schreiben — mit
> `https://`, ohne Schrägstrich am Ende. Stimmt das nicht, startet die App
> absichtlich nicht oder Logins schlagen fehl.

- [ ] `.env` ausgefüllt

---

## 7. Starten

```bash
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up --build -d
```

Der erste Durchlauf dauert 5–10 Minuten (React-Build und Python-Pakete).
Danach:

```bash
docker compose logs -f
```

Wenn dort `Uvicorn running` steht und Caddy `certificate obtained successfully`
meldet, ist alles gut. Mit `Strg+C` verlässt du die Log-Ansicht (die Container
laufen weiter).

Ruf jetzt `https://deine-domain.de` auf.

- [ ] Seite lädt mit gültigem Zertifikat (Schloss-Symbol)

### Wenn etwas nicht geht

| Symptom | Ursache |
|---|---|
| App startet nicht, Log sagt „refuses to start" | `JWT_SECRET` fehlt oder `CORS_ORIGINS` ist `*` — das ist Absicht, korrigiere die `.env` |
| Caddy bekommt kein Zertifikat | DNS zeigt noch nicht auf den Server, oder Port 80 ist in der Firewall zu |
| Seite lädt, aber Login schlägt fehl | `CORS_ORIGINS` stimmt nicht exakt mit der aufgerufenen Adresse überein |

Nach jeder `.env`-Änderung:
`docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d`

---

## 8. Erstes Konto und Admin-Zugang

1. Auf der Seite registrieren — mit **derselben** Adresse, die in
   `ADMIN_EMAILS` steht. Die braucht keinen Einladungscode.
2. Einmal ab- und wieder anmelden.
3. In der Seitenleiste erscheint **Admin**.
4. Dort unter *Einladungscodes* einen Code für deinen Freund erzeugen.

- [ ] Admin-Panel sichtbar, Code für den Tester erstellt

---

## 9. Fotos dauerhaft speichern (Cloudflare R2)

Optional, aber sinnvoll: Verkaufsfotos liegen sonst im Container und wären nach
einem `docker compose down -v` weg. R2 ist bis 10 GB kostenlos. Die fünf
Umgebungsvariablen stehen in **DEPLOY.md §5b** — in die `.env` eintragen und neu
starten.

- [ ] R2 eingerichtet *oder* bewusst übersprungen

---

## 10. Backups

Zwei Ebenen, beide sind fünf Minuten Arbeit:

**Snapshots bei Hetzner** — in der Console beim Server **Backups** aktivieren.
Kostet einen Aufpreis, sichert aber die ganze Maschine.

**Datenbank-Kopie** — reicht für den Test und kostet nichts:

```bash
cat >/etc/cron.daily/cardvault-backup <<'EOF'
#!/bin/sh
mkdir -p /var/backups/cardvault
docker run --rm \
  -v cardvault_db_data:/data:ro \
  -v /var/backups/cardvault:/backup \
  alpine tar czf /backup/db-$(date +\%F).tar.gz -C /data .
# Nur die letzten 14 Tage behalten
find /var/backups/cardvault -name 'db-*.tar.gz' -mtime +14 -delete
EOF
chmod +x /etc/cron.daily/cardvault-backup
/etc/cron.daily/cardvault-backup && ls -la /var/backups/cardvault
```

Der letzte Befehl führt das Backup gleich einmal aus, damit du siehst, dass es
funktioniert — ein Backup, das nie getestet wurde, ist kein Backup.

- [ ] Backup läuft und hat eine Datei erzeugt

---

## Laufender Betrieb

**Neue Version einspielen** (nachdem du Änderungen gepusht hast):

```bash
cd /opt/cardvault
git pull
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up --build -d
```

**Logs ansehen:** `docker compose logs -f --tail 100`
**Status:** `docker compose ps`
**Neustarten:** `docker compose restart`

Der Server startet die Container nach einem Reboot automatisch wieder
(`restart: unless-stopped`).

---

## Vor dem öffentlichen Start

Wenn du die geschlossene Testphase beendest, in dieser Reihenfolge:

1. `ANBIETER`-Objekt in `frontend/src/pages/LegalPages.jsx` mit deinen echten
   Angaben füllen.
2. In `frontend/public/robots.txt` und `sitemap.xml` `REPLACE-WITH-YOUR-DOMAIN`
   durch deine Domain ersetzen.
3. In der Datenschutzerklärung als Hoster **Hetzner Online GmbH, Deutschland**
   eintragen und den Auftragsverarbeitungsvertrag in der Hetzner-Console
   abschließen (Console → *Rechtliches* → *AV-Vertrag*).
4. Gewerbe anmelden.
5. Erst dann `PRIVATE_BETA=false` setzen und neu starten.

Die vollständige Liste steht in **DEPLOY.md**, Abschnitt 7.
