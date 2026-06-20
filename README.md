# CardVault 🃏

A full-stack Pokémon card collection management app. Upload card photos, auto-identify them via the Pokémon TCG API, track condition & prices, and manage your wantlist.

---

## Screenshots

> _Add screenshots here after first run_

---

## Features

- **Drag-and-drop upload** — up to 50 card images at once (JPG, PNG, HEIC)
- **Robust auto-identification** — three-stage pipeline:
  1. **Set code + collector number OCR** (e.g. `PAF 018/091`) → direct TCG API ID.
     This is *language independent*, so **German / French / Italian / Spanish cards
     identify perfectly** even though the TCG API itself is English-only.
  2. **Perceptual-hash** visual matching against previously confirmed cards.
  3. **Name OCR** (German + English Tesseract models) with fuzzy matching, used
     as a fallback; German names are auto-translated to English for the API.
- **Sell on eBay** — generate a bulk-listing CSV (eBay File Exchange / Seller Hub)
  with auto-built titles, HTML descriptions, condition mapping and Cardmarket-based
  pricing. No eBay account required for CSV; optional live-listing API scaffold included.
- **Top candidate modal** — review matches side-by-side before saving
- **Collection dashboard** — grid view with filters (set, rarity, condition), search, and sort
- **Card detail** — condition, quantity, foil flag, trade toggle, notes, and live price refresh
- **Live pricing** — market / low / mid / high prices in USD (+ EUR via Cardmarket)
- **Wantlist** — track desired cards, with visual "Owned" indicator for overlap
- **Stats page** — charts for rarity distribution, condition breakdown, top sets (Recharts)
- **Export** — CSV, PDF (formatted by set), or JSON

---

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy, SQLite |
| Image | OpenCV, Pillow, pytesseract |
| Card data | [Pokémon TCG API](https://pokemontcg.io) |
| Frontend | React 18, Vite, Tailwind CSS, Recharts |
| Deploy | Docker Compose |

---

## Quick Start (Docker)

```bash
# 1. Clone & enter
git clone <repo> cardvault && cd cardvault

# 2. (Optional) Set your TCG API key for higher rate limits
echo "POKEMON_TCG_API_KEY=your_key_here" > .env

# 3. Run the stack
docker-compose up --build

# App is available at http://localhost
# API docs at http://localhost:8000/docs
```

---

## Local Development

### Backend

```bash
# Prerequisites:
#  - Python 3.12  (NOT 3.13/3.14 — some CV wheels lag behind; this repo is tested on 3.12)
#  - Tesseract OCR binary installed on the system
#      Windows: https://github.com/UB-Mannheim/tesseract/wiki
#      macOS:   brew install tesseract
#      Linux:   sudo apt install tesseract-ocr
#  - German + English trained data: bundled in backend/tessdata/
#      (eng.traineddata + deu.traineddata, the "fast" models — fast & accurate
#       enough for card text). No system-level language packs required.

cd cardvault
py -3.12 -m venv .venv            # Windows;  python3.12 -m venv .venv elsewhere
.venv/Scripts/activate            # Windows;  source .venv/bin/activate elsewhere
pip install -r requirements.txt

cp backend/.env.example backend/.env
# Edit backend/.env: optional TCG API key, eBay export defaults, Cardmarket keys

cd backend
uvicorn main:app --reload --port 8000
# API docs: http://localhost:8000/docs
```

> **Tesseract path / language data** are auto-detected. Override with the
> `TESSERACT_CMD`, `TESSDATA_DIR` and `OCR_NAME_LANGS` env vars if needed.

### Frontend

```bash
cd frontend
npm install
npm run dev
# App: http://localhost:5173
```

---

## API Reference

| Method | Path | Description |
|---|---|---|
| POST | `/api/cards/upload` | Upload images, run OCR, return candidates |
| POST | `/api/cards/search` | Manual card name search |
| POST | `/api/cards/confirm` | Confirm match + save to DB |
| GET | `/api/cards` | List collection (supports `search`, `rarity`, `condition`, `sort`) |
| GET | `/api/cards/{id}` | Get single card |
| PUT | `/api/cards/{id}` | Update condition / notes / quantity |
| DELETE | `/api/cards/{id}` | Remove card |
| GET | `/api/cards/export/csv` | Export as CSV |
| GET | `/api/cards/export/pdf` | Export as PDF |
| GET | `/api/cards/export/json` | Export as JSON |
| GET | `/api/prices/{card_api_id}` | Fetch & cache live prices |
| GET | `/api/wantlist` | List wantlist |
| POST | `/api/wantlist` | Add to wantlist |
| DELETE | `/api/wantlist/{id}` | Remove from wantlist |
| GET | `/api/stats` | Collection stats summary |
| GET | `/api/ebay/status` | eBay capabilities + default export options |
| POST | `/api/ebay/preview` | Preview listing titles + computed prices |
| POST | `/api/ebay/export/csv` | Download eBay File Exchange bulk-listing CSV |
| POST | `/api/ebay/list` | Create a live eBay listing (API scaffold) |

---

## Selling on eBay

1. Open **Collection → Sell on eBay**.
2. Pick the marketplace (default **eBay.de / EUR**), pricing factor, min price,
   shipping cost and `.99` rounding. Optionally limit to cards marked *for trade*.
3. **Preview** the generated titles and prices, then **Download eBay CSV**.
4. On eBay: **Verkäufer-Cockpit → Angebote hochladen (File Exchange)** (or Seller
   Hub → Reports → Upload) and upload the CSV. Run a **draft** first so eBay can
   validate, and **verify the leaf category ID** for your marketplace
   (`EBAY_CATEGORY`, default `183454` for Pokémon Einzelkarten on ebay.de).

Prices come from each card's stored Cardmarket EUR price (refresh prices in the
Collection for accurate values). Direct live listing via the eBay Sell API is
scaffolded in `backend/services/ebay_api_service.py` — set the `EBAY_*` env vars
to enable it later.

---

## Pokémon TCG API Key

CardVault works **without an API key** (public rate limit: ~1000 req/day).  
For higher limits, get a free key at [pokemontcg.io](https://pokemontcg.io) and set `POKEMON_TCG_API_KEY` in `.env`.

API responses are cached in SQLite for 24 hours to minimise requests.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `POKEMON_TCG_API_KEY` | _(empty)_ | Optional TCG API key |
| `DATABASE_URL` | `sqlite:///./cardvault.db` | SQLAlchemy DB URL |
| `UPLOAD_DIR` | `uploads` | Where card images are stored |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Allowed CORS origins |

---

## Project Structure

```
cardvault/
├── backend/
│   ├── main.py               # FastAPI app, CORS, static files
│   ├── models.py             # SQLAlchemy models (Card, Wantlist, ApiCache)
│   ├── database.py           # Engine + session factory
│   ├── routes/
│   │   ├── cards.py          # Upload, confirm, CRUD, export
│   │   ├── prices.py         # Live price fetch
│   │   ├── wantlist.py       # Wantlist CRUD
│   │   └── stats.py          # Collection stats
│   ├── services/
│   │   ├── ocr_service.py    # pytesseract card name extraction
│   │   ├── image_service.py  # OpenCV preprocessing + crop
│   │   ├── tcg_api_service.py# TCG API wrapper + 24h cache
│   │   └── export_service.py # CSV / PDF / JSON export
│   └── uploads/              # Stored card images
├── frontend/
│   ├── src/
│   │   ├── pages/            # Upload, Collection, CardDetail, Wantlist, Stats
│   │   ├── components/       # CardGrid, ConfirmModal, SearchBar, badges
│   │   └── api/client.js     # Axios API wrapper
│   ├── vite.config.js
│   └── tailwind.config.js
├── requirements.txt
├── docker-compose.yml
└── README.md
```
