# CardVault – lokal starten

## Jeden Tag: App starten

Zwei Terminals im Ordner `C:\Users\quiri\Pokemon\cardvault` öffnen.

**Terminal 1 – Backend:**
```powershell
cd C:\Users\quiri\Pokemon\cardvault\backend
..\.venv\Scripts\python.exe -m uvicorn main:app --port 8000
```

**Terminal 2 – Frontend:**
```powershell
cd C:\Users\quiri\Pokemon\cardvault\frontend
npm.cmd run dev
```

Dann im Browser öffnen: **http://localhost:5173**

> ⚠️ `localhost` benutzen, **nicht** `127.0.0.1` (Vite läuft hier über IPv6).

> 💡 **Fehlermeldung „Ausführung von Skripts ist deaktiviert"?**
> Windows blockiert PowerShell-Skripte wie `npm` und `activate`. Zwei Lösungen:
> - **Schnell:** `npm.cmd` statt `npm` schreiben, und beim Backend das venv-Python
>   direkt aufrufen (`..\.venv\Scripts\python.exe ...`) — kein `activate` nötig.
> - **Dauerhaft (empfohlen):** einmalig `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`
>   ausführen; danach funktionieren `npm run dev` und `activate` normal.

Stoppen: in beiden Terminals `Strg + C`.

---

## Nur einmal nötig (ist bei dir schon erledigt)

Falls du das Projekt neu aufsetzt oder auf einen anderen PC ziehst:

```powershell
# 1. Python-3.12-Umgebung anlegen + Pakete installieren
py -3.12 -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt

# 2. Konfiguration anlegen
copy backend\.env.example backend\.env

# 3. Frontend-Pakete installieren
cd frontend
npm install
cd ..
```

Voraussetzungen: **Python 3.12** (nicht 3.14), **Node.js**, und das **Tesseract-Programm**
(Windows: https://github.com/UB-Mannheim/tesseract/wiki).
Die Sprachdaten (Englisch + Deutsch) liegen bereits in `backend\tessdata\`.

---

## Bedienung in Kürze

0. **Beim ersten Mal: Konto anlegen.** Beim Öffnen erscheint ein Login —
   auf „Registrieren" wechseln, E-Mail + Passwort (min. 8 Zeichen) eingeben.
   Danach bleibst du angemeldet (Abmelden links unten in der Seitenleiste).
   Jedes Konto hat seine **eigene, getrennte Sammlung**.
1. **Upload** → Kartenfotos reinziehen → „Upload & Identify".
2. Im Dialog Treffer prüfen, Sprache/Zustand wählen → „Add to Collection".
3. **Collection → Sell on eBay** → Optionen wählen → „Preview" → „Download eBay CSV".
4. Die CSV bei eBay hochladen: **Verkäufer-Cockpit → Angebote hochladen (File Exchange)**
   (erst als Entwurf testen, Kategorie-ID prüfen).

## Wenn etwas klemmt

- **Seite lädt nicht / „API Error":** Läuft Terminal 1 (Backend auf Port 8000)? Test: http://localhost:8000/health
- **Scannen findet nichts:** Ist das Tesseract-Programm installiert? Foto möglichst gerade, gute Beleuchtung, ganze Karte im Bild.
- **Port belegt:** anderen Port nehmen, z. B. `uvicorn main:app --port 8001` (dann in `frontend\vite.config.js` das `target` ebenfalls auf 8001 ändern).
