import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import {
  X, Download, Eye, Loader, ShoppingBag, Info, Link2, Copy, Check,
  RefreshCw, Zap, Unlink,
} from 'lucide-react'
import { ebayApi, marketApi, downloadBlob } from '../api/client'

const SITE_LABELS = {
  DE: '🇩🇪 eBay.de (EUR)', AT: '🇦🇹 eBay.at (EUR)', UK: '🇬🇧 eBay.co.uk (GBP)',
  US: '🇺🇸 eBay.com (USD)', FR: '🇫🇷 eBay.fr (EUR)', IT: '🇮🇹 eBay.it (EUR)',
  ES: '🇪🇸 eBay.es (EUR)',
}

const TABS = [
  { id: 'ebay', label: 'eBay' },
  { id: 'whatnot', label: 'Whatnot' },
  { id: 'vinted', label: 'Vinted' },
]

/**
 * Multi-platform selling modal (kept under its historical filename so existing
 * imports keep working): eBay CSV + live listing, Whatnot CSV + API,
 * Vinted copy-paste texts — plus account linking and sold-sync.
 */
export default function EbayExportModal({ onClose, forTradeDefault = false, cardIds = null }) {
  const [tab, setTab] = useState('ebay')
  const [status, setStatus] = useState(null)       // /ebay/status (options + sites)
  const [market, setMarket] = useState(null)       // /market/status (connections)
  const [opts, setOpts] = useState(null)
  const [forTradeOnly, setForTradeOnly] = useState(forTradeDefault)
  const [preview, setPreview] = useState(null)
  const [vinted, setVinted] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [wnToken, setWnToken] = useState('')

  useEffect(() => { refreshStatus() }, [])

  function refreshStatus() {
    ebayApi.status()
      .then(({ data }) => { setStatus(data); setOpts((o) => o || data.default_options) })
      .catch(() => toast.error('Einstellungen konnten nicht geladen werden'))
    marketApi.status().then(({ data }) => setMarket(data)).catch(() => {})
  }

  function set(key, value) {
    setOpts((o) => ({ ...o, [key]: value }))
    setPreview(null)
    setVinted(null)
  }

  function payload() {
    return {
      for_trade_only: forTradeOnly,
      options: opts,
      ...(cardIds && cardIds.length ? { card_ids: cardIds } : {}),
    }
  }

  async function handlePreview() {
    setBusy(true)
    try {
      const { data } = await ebayApi.preview(payload())
      setPreview(data)
    } catch { toast.error('Vorschau fehlgeschlagen') }
    setBusy(false)
  }

  async function download(kind) {
    setBusy(true)
    try {
      if (kind === 'ebay') {
        const { data } = await ebayApi.exportCsv(payload())
        downloadBlob(data, 'ebay_listings.csv')
      } else if (kind === 'whatnot') {
        const { data } = await marketApi.whatnotCsv(payload())
        downloadBlob(data, 'whatnot_listings.csv')
      } else {
        const { data } = await marketApi.vintedTxt(payload())
        downloadBlob(data, 'vinted_listings.txt')
      }
      toast.success('Export heruntergeladen')
    } catch (err) {
      toast.error(err.response?.status === 402 ? 'Pro-Feature — bitte upgraden' : 'Export fehlgeschlagen')
    }
    setBusy(false)
  }

  async function loadVinted() {
    setBusy(true)
    try {
      const { data } = await marketApi.vintedPreview(payload())
      setVinted(data)
    } catch { toast.error('Vorschau fehlgeschlagen') }
    setBusy(false)
  }

  async function copyListing(item) {
    const text = `${item.title}\n\n${item.description}\n\nPreis: ${item.price.toFixed(2)} €`
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(item.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch { toast.error('Kopieren fehlgeschlagen') }
  }

  async function connectEbay() {
    try {
      const { data } = await marketApi.ebayConnect()
      window.open(data.authorize_url, '_blank', 'width=560,height=720')
      toast('Im neuen Fenster bei eBay anmelden, dann hier aktualisieren.', { icon: '🔗' })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'eBay-Verbindung nicht möglich')
    }
  }

  async function connectWhatnot() {
    if (!wnToken.trim()) return
    try {
      const { data } = await marketApi.whatnotConnect(wnToken.trim())
      toast.success(`Whatnot verbunden${data.username ? ` als ${data.username}` : ''}`)
      setWnToken('')
      refreshStatus()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Token ungültig')
    }
  }

  async function publishLive(platforms) {
    if (!cardIds || !cardIds.length) {
      toast('Live-Listing: bitte in der Sammlung Karten auswählen.', { icon: 'ℹ️' })
      return
    }
    setPublishing(true)
    try {
      const { data } = await marketApi.publish({ card_ids: cardIds, platforms, options: opts })
      const ok = data.results.reduce(
        (n, r) => n + Object.values(r.platforms).filter((p) => p.ok).length, 0)
      const failed = data.results.flatMap((r) =>
        Object.entries(r.platforms).filter(([, p]) => !p.ok).map(([pf, p]) => `${pf}: ${p.error}`))
      if (ok) toast.success(`${ok} Listing(s) live!`)
      if (failed.length) toast.error(failed[0], { duration: 6000 })
      refreshStatus()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Listing fehlgeschlagen')
    }
    setPublishing(false)
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const { data } = await marketApi.sync()
      if (data.sold_card_ids.length) {
        toast.success(
          `${data.sold_card_ids.length} Verkauf/Verkäufe erkannt, ${data.delisted.length} Listing(s) beendet`)
      } else {
        toast(`Keine neuen Verkäufe (geprüft: ${data.checked_platforms.join(', ') || '—'})`, { icon: '✅' })
      }
    } catch { toast.error('Sync fehlgeschlagen') }
    setSyncing(false)
  }

  const currency = preview?.listings?.[0]?.currency || (opts?.site === 'UK' ? 'GBP' : opts?.site === 'US' ? 'USD' : 'EUR')
  const totalValue = preview?.listings?.reduce((s, l) => s + l.price * l.quantity, 0) || 0
  const ebayConnected = market?.ebay?.user_connected
  const wnConnected = market?.whatnot?.api_connected
  const scopeLabel = cardIds && cardIds.length
    ? `${cardIds.length} ausgewählte Karte(n)`
    : forTradeOnly ? 'alle „zu verkaufen"-Karten' : 'gesamte Sammlung'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-surface border border-line rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-card">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-line shrink-0">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-accent-ink" /> Verkaufen
            </h2>
            <p className="text-sm text-ink-3">Export: {scopeLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing || (!ebayConnected && !wnConnected)}
              title="Verkäufe prüfen & überall delisten"
              className="btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> Sync
            </button>
            <button onClick={onClose} className="text-ink-3 hover:text-ink">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 shrink-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-t-xl text-sm font-semibold transition-colors border border-b-0 ${
                tab === t.id
                  ? 'bg-surface-2 border-line text-accent-ink'
                  : 'border-transparent text-ink-3 hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 border-t border-line">
          {!opts ? (
            <div className="flex justify-center py-10 text-ink-3">
              <Loader className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <>
              {/* Shared pricing controls */}
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs text-ink-3 mb-1">Preisfaktor ×</label>
                  <input type="number" step="0.05" min="0.1" className="input"
                    value={opts.price_multiplier}
                    onChange={(e) => set('price_multiplier', Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs text-ink-3 mb-1">Mindestpreis</label>
                  <input type="number" step="0.01" min="0" className="input"
                    value={opts.min_price}
                    onChange={(e) => set('min_price', Number(e.target.value))} />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input type="checkbox" checked={opts.round_99}
                      onChange={(e) => set('round_99', e.target.checked)} className="rounded" />
                    .99-Preise
                  </label>
                </div>
              </div>

              {!cardIds?.length && (
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={forTradeOnly}
                    onChange={(e) => { setForTradeOnly(e.target.checked); setPreview(null); setVinted(null) }}
                    className="rounded" />
                  Nur Karten mit Markierung „zu verkaufen"
                </label>
              )}

              {/* ── eBay tab ── */}
              {tab === 'ebay' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-ink-3 mb-1">Marktplatz</label>
                      <select className="input" value={opts.site} onChange={(e) => set('site', e.target.value)}>
                        {(status?.sites || ['DE']).map((s) => (
                          <option key={s} value={s}>{SITE_LABELS[s] || s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-ink-3 mb-1">Versandkosten</label>
                      <input type="number" step="0.10" min="0" className="input"
                        value={opts.shipping_cost}
                        onChange={(e) => set('shipping_cost', Number(e.target.value))} />
                    </div>
                  </div>

                  {/* Account linking */}
                  <div className="panel !p-3 flex items-center gap-3 text-sm">
                    <Link2 className={`w-4 h-4 shrink-0 ${ebayConnected ? 'text-emerald-700' : 'text-ink-3'}`} />
                    {ebayConnected ? (
                      <>
                        <span className="text-emerald-700 font-medium">
                          eBay-Konto verbunden{market?.ebay?.ebay_username ? ` (${market.ebay.ebay_username})` : ''}
                        </span>
                        <button onClick={() => marketApi.ebayDisconnect().then(refreshStatus)}
                          className="ml-auto text-xs text-ink-3 hover:text-rose-600 flex items-center gap-1">
                          <Unlink className="w-3 h-3" /> trennen
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-ink-3">
                          Konto verbinden für Live-Listings & Auto-Delist
                        </span>
                        <button onClick={connectEbay} className="ml-auto btn-secondary text-xs px-3 py-1.5">
                          Verbinden
                        </button>
                      </>
                    )}
                  </div>

                  {preview && (
                    <div className="panel space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold">{preview.count} Listing{preview.count !== 1 ? 's' : ''}</span>
                        <span className="text-accent-ink font-bold">≈ {totalValue.toFixed(2)} {currency}</span>
                      </div>
                      <ul className="text-xs space-y-1 max-h-44 overflow-y-auto">
                        {preview.listings.slice(0, 50).map((l) => (
                          <li key={l.id} className="flex items-center justify-between gap-2 border-b border-line/60 pb-1">
                            <span className="truncate text-ink-2">{l.title}</span>
                            <span className="shrink-0 font-semibold text-accent-ink">{l.price.toFixed(2)} {l.currency}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={handlePreview} disabled={busy} className="btn-secondary flex items-center gap-2">
                      {busy ? <Loader className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                      Vorschau
                    </button>
                    <button onClick={() => download('ebay')} disabled={busy} className="btn-primary flex items-center gap-2">
                      <Download className="w-4 h-4" /> CSV für eBay
                    </button>
                    {ebayConnected && (
                      <button onClick={() => publishLive(['ebay'])} disabled={publishing}
                        className="btn-secondary flex items-center gap-2 border-accent/40 text-accent-ink">
                        {publishing ? <Loader className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                        Live listen
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-ink-3 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    CSV: im eBay Verkäufer-Cockpit unter „Angebote → Hochladen" einlesen.
                    Live-Listing erstellt Angebote direkt über die eBay-API.
                  </p>
                </>
              )}

              {/* ── Whatnot tab ── */}
              {tab === 'whatnot' && (
                <>
                  <div className="panel !p-3 flex items-center gap-3 text-sm">
                    <Link2 className={`w-4 h-4 shrink-0 ${wnConnected ? 'text-emerald-700' : 'text-ink-3'}`} />
                    {wnConnected ? (
                      <>
                        <span className="text-emerald-700 font-medium">
                          Whatnot verbunden{market?.whatnot?.username ? ` (${market.whatnot.username})` : ''}
                        </span>
                        <button onClick={() => marketApi.whatnotDisconnect().then(refreshStatus)}
                          className="ml-auto text-xs text-ink-3 hover:text-rose-600 flex items-center gap-1">
                          <Unlink className="w-3 h-3" /> trennen
                        </button>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col sm:flex-row gap-2">
                        <input
                          className="input !py-1.5 text-xs flex-1"
                          placeholder="Whatnot Seller-API-Token (Seller Hub → Entwickler)"
                          value={wnToken}
                          onChange={(e) => setWnToken(e.target.value)}
                        />
                        <button onClick={connectWhatnot} disabled={!wnToken.trim()}
                          className="btn-secondary text-xs px-3 py-1.5 shrink-0">
                          Verbinden
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => download('whatnot')} disabled={busy} className="btn-primary flex items-center gap-2">
                      <Download className="w-4 h-4" /> CSV für Whatnot
                    </button>
                    {wnConnected && (
                      <button onClick={() => publishLive(['whatnot'])} disabled={publishing}
                        className="btn-secondary flex items-center gap-2 border-accent/40 text-accent-ink">
                        {publishing ? <Loader className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                        Live listen
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-ink-3 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    CSV im Whatnot Seller Hub unter „Listings → Bulk Import" hochladen —
                    die Listings erscheinen dort als Entwürfe zum Prüfen & Veröffentlichen.
                  </p>
                </>
              )}

              {/* ── Vinted tab ── */}
              {tab === 'vinted' && (
                <>
                  <p className="text-xs text-ink-3 bg-surface-2/60 border border-line rounded-xl px-3 py-2 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Vinted bietet keine öffentliche Verkäufer-API. CardVault erstellt dir fertige
                    Listing-Texte zum Kopieren — Titel, Beschreibung & Preis pro Karte.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={loadVinted} disabled={busy} className="btn-secondary flex items-center gap-2">
                      {busy ? <Loader className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                      Texte anzeigen
                    </button>
                    <button onClick={() => download('vinted')} disabled={busy} className="btn-primary flex items-center gap-2">
                      <Download className="w-4 h-4" /> Alle als .txt
                    </button>
                  </div>
                  {vinted && (
                    <ul className="space-y-2 max-h-64 overflow-y-auto">
                      {vinted.listings.map((item) => (
                        <li key={item.id} className="panel !p-3 flex items-center gap-3">
                          {item.image_url && (
                            <img src={item.photo_front_url || item.image_url} alt=""
                              className="w-9 h-12 object-cover rounded-md shrink-0" loading="lazy" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{item.title}</p>
                            <p className="text-xs text-accent-ink font-semibold">{item.price.toFixed(2)} €</p>
                          </div>
                          <button onClick={() => copyListing(item)}
                            className="btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1.5 shrink-0">
                            {copiedId === item.id
                              ? <><Check className="w-3.5 h-3.5 text-emerald-700" /> Kopiert</>
                              : <><Copy className="w-3.5 h-3.5" /> Kopieren</>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
