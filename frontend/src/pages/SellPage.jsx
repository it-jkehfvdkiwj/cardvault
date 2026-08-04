import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  ShoppingBag, Loader, Download, AlertTriangle, Check, Images, ImagePlus,
  Trash2, Truck, FileText, Tag, RefreshCw, ChevronDown, ChevronRight,
} from 'lucide-react'
import { ebayApi, saleApi, cardsApi, downloadBlob } from '../api/client'

const SITE_LABELS = {
  DE: '🇩🇪 eBay.de (EUR)', AT: '🇦🇹 eBay.at (EUR)', UK: '🇬🇧 eBay.co.uk (GBP)',
  US: '🇺🇸 eBay.com (USD)', FR: '🇫🇷 eBay.fr (EUR)', IT: '🇮🇹 eBay.it (EUR)',
  ES: '🇪🇸 eBay.es (EUR)',
}

const eur = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} €`

/** Collapsible section. Everything below the pricing table starts closed so the
 *  page opens on the job you came to do, not on a wall of settings. */
function Section({ icon: Icon, title, hint, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="panel">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full text-left"
        aria-expanded={open}
      >
        <Icon className="w-4 h-4 text-ink-3 shrink-0" />
        <span className="font-semibold">{title}</span>
        <span className="ml-auto flex items-center gap-2 text-xs text-ink-3">
          {hint}
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </button>
      {open && <div className="mt-4 space-y-4">{children}</div>}
    </div>
  )
}

export default function SellPage() {
  const [preview, setPreview] = useState(null)
  const [opts, setOpts] = useState(null)
  const [sites, setSites] = useState(['DE'])
  const [sale, setSale] = useState(null)          // text blocks + photo plan
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [edits, setEdits] = useState({})          // card id -> typed string
  const [saving, setSaving] = useState(false)
  const tplRef = useRef(null)

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setBusy(true)
    try {
      const { data } = await ebayApi.preview({ for_trade_only: true })
      setPreview(data)
      setEdits({})
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Vorschau fehlgeschlagen')
    }
    setBusy(false)
  }, [])

  useEffect(() => {
    Promise.all([
      ebayApi.getOptions().then(({ data }) => {
        setOpts(data.options)
        setSites(data.sites || ['DE'])
      }).catch(() => {}),
      saleApi.getSettings().then(({ data }) => setSale(data)).catch(() => {}),
      saleApi.listTemplates().then(({ data }) => setTemplates(data.templates || [])).catch(() => {}),
      load(),
    ]).finally(() => setLoading(false))
  }, [load])

  // ── Pricing table ─────────────────────────────────────────────────────────
  const rows = preview?.listings || []
  const dirty = Object.keys(edits).length > 0

  const total = useMemo(() => rows.reduce((sum, r) => {
    const typed = edits[r.id]
    const value = typed !== undefined && typed !== ''
      ? Number(String(typed).replace(',', '.'))
      : r.price
    return sum + (Number.isFinite(value) ? value : r.price) * (r.quantity || 1)
  }, 0), [rows, edits])

  async function savePrices() {
    const payload = Object.entries(edits).map(([id, raw]) => {
      const text = String(raw).trim().replace(',', '.')
      return { card_id: Number(id), price: text === '' ? null : Number(text) }
    }).filter((p) => p.price === null || Number.isFinite(p.price))

    if (!payload.length) return
    setSaving(true)
    try {
      const { data } = await ebayApi.setPrices(payload)
      toast.success(`${data.changed} Preis${data.changed !== 1 ? 'e' : ''} gespeichert`)
      await load()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Speichern fehlgeschlagen')
    }
    setSaving(false)
  }

  async function saveOption(patch) {
    const next = { ...opts, ...patch }
    setOpts(next)
    try {
      await ebayApi.setOptions(patch)
      await load()          // prices are derived from these, so refresh
    } catch {
      toast.error('Einstellung konnte nicht gespeichert werden')
    }
  }

  async function saveText() {
    try {
      await saleApi.updateSettings({
        sale_intro: sale?.sale_intro || '',
        sale_outro: sale?.sale_outro || '',
      })
      toast.success('Texte gespeichert')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Speichern fehlgeschlagen')
    }
  }

  async function savePlan(plan) {
    setSale((s) => ({ ...s, photo_plan: plan }))
    try {
      await saleApi.updateSettings({ photo_plan: plan })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Fotoplan nicht gespeichert')
    }
  }

  async function addTemplate(e) {
    const file = e.target.files?.[0]
    if (file) {
      try {
        const { data } = await saleApi.addTemplate(file, { position: templates.length + 3 })
        setTemplates((t) => [...t, data])
      } catch { toast.error('Upload fehlgeschlagen') }
    }
    e.target.value = ''
  }

  async function download() {
    if (dirty) {
      toast.error('Erst die geänderten Preise speichern.')
      return
    }
    setBusy(true)
    try {
      const { data } = await ebayApi.exportCsv({ for_trade_only: true })
      downloadBlob(data, 'ebay_angebote.csv')
      toast.success('Datei erstellt — jetzt bei eBay hochladen')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Export fehlgeschlagen')
    }
    setBusy(false)
  }

  if (loading) {
    return (
      <div className="p-6 flex justify-center text-ink-3">
        <Loader className="w-5 h-5 animate-spin" />
      </div>
    )
  }

  const plan = sale?.photo_plan?.length ? sale.photo_plan : ['Vorderseite']

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="page-title">Verkaufen</h1>
        <p className="text-ink-3 text-sm mt-1">
          Preise setzen, Datei erzeugen, bei eBay hochladen. Alles auf einer Seite.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="panel text-center py-10 space-y-2">
          <ShoppingBag className="w-8 h-8 mx-auto text-ink-4" />
          <p className="font-semibold">Keine Karte zum Verkauf markiert</p>
          <p className="text-sm text-ink-3">
            Markier in der Sammlung Karten mit „zu verkaufen“ — sie erscheinen dann hier.
          </p>
        </div>
      ) : (
        <>
          {/* ── The actual job: prices ───────────────────────────────────── */}
          <div className="panel space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="font-semibold flex items-center gap-2">
                  <Tag className="w-4 h-4 text-ink-3" />
                  {rows.length} Karte{rows.length !== 1 ? 'n' : ''} zum Verkauf
                </h2>
                <p className="text-xs text-ink-3 mt-0.5">
                  Leer lassen heißt: Vorschlag verwenden. Nur überschreiben, was nicht passt.
                </p>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-accent-ink">{eur(total)}</div>
                <div className="text-xs text-ink-3">Summe</div>
              </div>
            </div>

            {preview?.n_with_warnings > 0 && (
              <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-amber-900">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {preview.n_with_warnings} Karte{preview.n_with_warnings !== 1 ? 'n haben' : ' hat'} offene
                  Punkte — meist ein fehlendes eigenes Foto. Die Zeilen sind unten markiert.
                </span>
              </div>
            )}

            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-3 border-b border-line">
                    <th className="py-2 px-1 font-medium">Karte</th>
                    <th className="py-2 px-1 font-medium text-right w-24">Vorschlag</th>
                    <th className="py-2 px-1 font-medium text-right w-32">Dein Preis</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-line/60">
                      <td className="py-1.5 px-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {r.warnings?.length > 0 && (
                            <AlertTriangle
                              className="w-3.5 h-3.5 text-amber-600 shrink-0"
                              aria-label={r.warnings.join(' ')}
                            />
                          )}
                          <div className="min-w-0">
                            <div className="font-medium truncate">{r.name || r.title}</div>
                            <div className="text-xs text-ink-3 truncate">
                              {r.set_name} · {r.condition}
                              {r.quantity > 1 && ` · ${r.quantity}×`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-1.5 px-1 text-right text-ink-3 tabular-nums">
                        {eur(r.suggested_price)}
                      </td>
                      <td className="py-1.5 px-1">
                        <input
                          type="text" inputMode="decimal"
                          className="input text-right tabular-nums !py-1"
                          aria-label={`Preis für ${r.name || r.title}`}
                          placeholder={r.suggested_price?.toFixed(2).replace('.', ',')}
                          value={
                            edits[r.id] !== undefined
                              ? edits[r.id]
                              : (r.own_price != null ? String(r.own_price).replace('.', ',') : '')
                          }
                          onChange={(e) => setEdits((s) => ({ ...s, [r.id]: e.target.value }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={savePrices} disabled={!dirty || saving}
                className="btn-secondary flex items-center gap-2"
              >
                {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Preise speichern
              </button>
              {dirty && (
                <button onClick={() => setEdits({})} className="text-xs text-ink-3 hover:text-ink underline">
                  Änderungen verwerfen
                </button>
              )}
              <button
                onClick={() => load(true)} disabled={busy}
                className="ml-auto text-xs text-ink-3 hover:text-ink flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Neu berechnen
              </button>
            </div>
          </div>

          {/* ── Description and photos ───────────────────────────────────── */}
          <Section
            icon={FileText} title="Beschreibung und Fotos"
            hint={`${plan.length} Aufnahme${plan.length !== 1 ? 'n' : ''} · ${templates.length} feste`}
          >
            <div>
              <label className="block text-xs text-ink-3 mb-1.5">
                Fotoplan — diese Aufnahmen machst du pro Karte
              </label>
              <div className="flex flex-wrap gap-1.5 items-center">
                {plan.map((label, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-surface-2 border border-line rounded-lg pl-2 pr-1 py-1 text-xs">
                    {i + 1}. {label}
                    {plan.length > 1 && (
                      <button
                        onClick={() => savePlan(plan.filter((_, j) => j !== i))}
                        className="text-ink-4 hover:text-rose-600" aria-label={`${label} entfernen`}
                      >×</button>
                    )}
                  </span>
                ))}
                {plan.length < (sale?.max_slots || 8) && (
                  <>
                    {(sale?.suggested_labels || [])
                      .filter((x) => !plan.includes(x)).slice(0, 3).map((x) => (
                        <button
                          key={x} onClick={() => savePlan([...plan, x])}
                          className="text-xs px-2 py-1 rounded-lg border border-line text-ink-3 hover:border-ink-4 hover:text-ink"
                        >+ {x}</button>
                      ))}
                  </>
                )}
              </div>
              <p className="text-xs text-ink-4 mt-1.5">
                Beim Scannen fragt die Kamera diese Aufnahmen der Reihe nach ab.
              </p>
            </div>

            <div>
              <label htmlFor="sell-intro" className="block text-xs text-ink-3 mb-1">
                Text über den Kartendaten
              </label>
              <textarea
                id="sell-intro" rows={2} className="input" maxLength={2000}
                placeholder="z. B. Du kaufst {name} aus {set} in {zustand}."
                value={sale?.sale_intro || ''}
                onChange={(e) => setSale((s) => ({ ...s, sale_intro: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="sell-outro" className="block text-xs text-ink-3 mb-1">
                Text darunter
              </label>
              <textarea
                id="sell-outro" rows={2} className="input" maxLength={2000}
                placeholder="z. B. Versand als Großbrief. Mehrere Karten kombiniert."
                value={sale?.sale_outro || ''}
                onChange={(e) => setSale((s) => ({ ...s, sale_outro: e.target.value }))}
              />
            </div>
            <p className="text-xs text-ink-3">
              Platzhalter:{' '}
              {Object.keys(sale?.placeholders || {}).map((p) => (
                <code key={p} className="bg-surface-2 rounded px-1 mr-1">{p}</code>
              ))}
            </p>
            <button onClick={saveText} className="btn-secondary text-xs px-3 py-1.5">
              Texte speichern
            </button>

            <div className="pt-2 border-t border-line">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-ink-3 flex items-center gap-1.5">
                  <Images className="w-3.5 h-3.5" /> Feste Zusatzfotos in jedem Angebot
                </span>
                <button onClick={() => tplRef.current?.click()} className="btn-secondary text-xs px-3 py-1 flex items-center gap-1.5">
                  <ImagePlus className="w-3.5 h-3.5" /> Hinzufügen
                </button>
                <input ref={tplRef} type="file" accept="image/*" className="hidden" onChange={addTemplate} />
              </div>
              {templates.length === 0 ? (
                <p className="text-xs text-ink-4">
                  Noch keine — typisch ist ein Bild mit Versandhinweisen an Position 4.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {templates.map((t) => (
                    <div key={t.id} className="relative">
                      <img src={t.url} alt={t.label || 'Zusatzfoto'}
                           className="w-14 h-20 object-cover rounded border border-line" />
                      <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-center text-white py-0.5">
                        Pos. {t.position}
                      </span>
                      <button
                        onClick={async () => {
                          try {
                            await saleApi.deleteTemplate(t.id)
                            setTemplates((x) => x.filter((y) => y.id !== t.id))
                          } catch { toast.error('Konnte nicht löschen') }
                        }}
                        className="absolute -top-1.5 -right-1.5 bg-white border border-line rounded-full p-0.5 text-ink-3 hover:text-rose-600"
                        aria-label="Zusatzfoto entfernen"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Section>

          {/* ── Shipping and terms ───────────────────────────────────────── */}
          <Section
            icon={Truck} title="Versand und Konditionen"
            hint={opts ? `${SITE_LABELS[opts.site]?.split(' ')[1] || opts.site} · ${eur(opts.shipping_cost)}` : ''}
          >
            {opts && (
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-ink-3 mb-1">Marktplatz</label>
                  <select className="input" value={opts.site}
                          onChange={(e) => saveOption({ site: e.target.value })}>
                    {sites.map((s) => <option key={s} value={s}>{SITE_LABELS[s] || s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-ink-3 mb-1">Versandkosten</label>
                  <input type="number" step="0.10" min="0" className="input"
                         value={opts.shipping_cost}
                         onChange={(e) => setOpts({ ...opts, shipping_cost: e.target.value })}
                         onBlur={(e) => saveOption({ shipping_cost: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs text-ink-3 mb-1">Versandart</label>
                  <input className="input" value={opts.shipping_service}
                         onChange={(e) => setOpts({ ...opts, shipping_service: e.target.value })}
                         onBlur={(e) => saveOption({ shipping_service: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs text-ink-3 mb-1">Standort</label>
                  <input className="input" value={opts.location}
                         onChange={(e) => setOpts({ ...opts, location: e.target.value })}
                         onBlur={(e) => saveOption({ location: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs text-ink-3 mb-1">Preisfaktor auf den Marktpreis</label>
                  <input type="number" step="0.05" min="0.1" className="input"
                         value={opts.price_multiplier}
                         onChange={(e) => setOpts({ ...opts, price_multiplier: e.target.value })}
                         onBlur={(e) => saveOption({ price_multiplier: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs text-ink-3 mb-1">Mindestpreis</label>
                  <input type="number" step="0.01" min="0" className="input"
                         value={opts.min_price}
                         onChange={(e) => setOpts({ ...opts, min_price: e.target.value })}
                         onBlur={(e) => saveOption({ min_price: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none sm:col-span-2">
                  <input type="checkbox" checked={Boolean(opts.round_99)}
                         onChange={(e) => saveOption({ round_99: e.target.checked })} />
                  Preise auf ,99 aufrunden
                </label>
              </div>
            )}
            <p className="text-xs text-ink-4">
              Diese Angaben gelten für jeden Export — du stellst sie einmal ein.
              Auf bereits von dir gesetzte Preise wirkt der Faktor nicht.
            </p>
          </Section>

          {/* ── Export ───────────────────────────────────────────────────── */}
          <div className="panel flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{rows.length} Angebote · {eur(total)}</p>
              <p className="text-xs text-ink-3">
                Datei bei eBay unter Verkäufer-Cockpit → Angebote → Hochladen einspielen.
              </p>
            </div>
            <button
              onClick={download} disabled={busy || dirty}
              className="btn-primary ml-auto flex items-center gap-2"
              title={dirty ? 'Erst die geänderten Preise speichern' : undefined}
            >
              {busy ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Datei für eBay
            </button>
          </div>
        </>
      )}
    </div>
  )
}
