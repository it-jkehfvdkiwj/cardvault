import { useState, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import {
  Upload, Image as ImageIcon, Loader, CheckCircle, Camera, Layers,
  Grid3x3, CreditCard, AlertTriangle, Pencil, ShoppingBag, X,
} from 'lucide-react'
import { cardsApi, saleApi } from '../api/client'
import ConfirmModal from '../components/ConfirmModal'
import CameraCapture from '../components/CameraCapture'
import EbayExportModal from '../components/EbayExportModal'

const ACCEPTED = { 'image/jpeg': [], 'image/png': [], 'image/heic': [], 'image/webp': [] }

const CONDITIONS = [
  'Mint', 'Near Mint', 'Lightly Played',
  'Moderately Played', 'Heavily Played', 'Damaged',
]

const MODES = [
  {
    id: 'single', icon: CreditCard, label: 'Nur ein Foto',
    hint: 'Ein Foto pro Karte, egal was im Fotoplan steht.',
  },
  {
    id: 'plan', icon: Layers, label: 'Nach Fotoplan',
    hint: 'Alle Aufnahmen deines Plans pro Karte, in dieser Reihenfolge.',
  },
  {
    id: 'binder', icon: Grid3x3, label: 'Ganze Mappenseite',
    hint: 'Ein Foto der Seite, alle Karten darauf werden einzeln erkannt.',
  },
]

/**
 * How much we trust a scan result.
 *
 * `set_number` means the printed set code, collector number *and* the printed
 * total all agreed — that is effectively a unique key, so those cards are safe
 * to add in bulk. Everything else gets pre-selected too (the user asked for as
 * few clicks as possible) but is visibly marked, and anything with no candidate
 * at all is never selected automatically.
 */
function confidenceOf(r) {
  if (r.error) return 'error'
  if (!r.candidates?.length) return 'unknown'
  if (r.identification_method === 'set_number') return 'sure'
  return 'likely'
}

const CONF_STYLE = {
  sure: { label: 'Sicher', cls: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  likely: { label: 'Wahrscheinlich', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
  unknown: { label: 'Prüfen', cls: 'bg-rose-50 text-rose-800 border-rose-300' },
  error: { label: 'Fehler', cls: 'bg-rose-50 text-rose-800 border-rose-300' },
}

export default function UploadPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('single')
  const [plan, setPlan] = useState(['Vorderseite'])
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState([])
  const [picks, setPicks] = useState({})        // idx -> { on, candIdx }
  const [condition, setCondition] = useState('Near Mint')
  const [forTrade, setForTrade] = useState(false)
  const [modalIdx, setModalIdx] = useState(null)
  const [confirmed, setConfirmed] = useState([])
  const [savedIdx, setSavedIdx] = useState({})  // idx -> saved card
  const [saving, setSaving] = useState(0)       // 0 = idle, else cards left
  const [showCamera, setShowCamera] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [ownedMap, setOwnedMap] = useState({})

  useEffect(() => {
    saleApi.getSettings()
      .then(({ data }) => {
        const p = data.photo_plan?.length ? data.photo_plan : ['Vorderseite']
        setPlan(p)
        if (p.length >= 2) setMode('plan')
      })
      .catch(() => {})
    cardsApi.collectionIds()
      .then(({ data }) => {
        const map = {}
        for (const r of data) map[r.tcg_card_id] = { card_id: r.card_id, quantity: r.quantity }
        setOwnedMap(map)
      })
      .catch(() => {})
  }, [])

  const onDrop = useCallback((accepted) => {
    setFiles((prev) => {
      const merged = [...prev, ...accepted]
      if (merged.length > 50) {
        toast.error('Höchstens 50 Fotos auf einmal')
        return merged.slice(0, 50)
      }
      return merged
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: ACCEPTED, maxFiles: 50,
  })

  // The mode is a per-upload choice now; the plan itself is edited in the
  // settings, so nothing is persisted here. Changing it used to silently
  // rewrite the saved plan down to one or two shots.
  function changeMode(next) { setMode(next) }

  function handleCameraCapture(captured) {
    onDrop(captured)
    toast.success(`${captured.length} Aufnahme${captured.length !== 1 ? 'n' : ''} hinzugefügt`)
  }

  // Parallel chunked upload: files go out in small groups over a few parallel
  // connections, so results appear while the rest is still being identified.
  async function handleUpload() {
    if (!files.length) return
    setUploading(true)
    setProgress(0)
    setResults([])
    setPicks({})
    setConfirmed([])
    setSavedIdx({})

    // A binder page is expensive to process, so send those one photo at a time;
    // pair mode must keep front+back together in the same request.
    const shotsPerCard = mode === 'plan' ? plan.length : 1
    const groupSize = shotsPerCard
    const groups = []
    for (let i = 0; i < files.length; i += groupSize) groups.push(files.slice(i, i + groupSize))

    const CONCURRENCY = mode === 'binder' ? 2 : 3
    let nextIdx = 0
    let doneCount = 0
    const grouped = new Array(groups.length)

    const flush = () => {
      const ready = []
      for (const g of grouped) {
        if (g === undefined) break
        ready.push(...g)
      }
      setResults(ready)
      setPicks((prev) => {
        const next = { ...prev }
        ready.forEach((r, i) => {
          if (next[i] === undefined) {
            const conf = confidenceOf(r)
            next[i] = { on: conf === 'sure' || conf === 'likely', candIdx: 0 }
          }
        })
        return next
      })
    }

    async function worker() {
      for (;;) {
        const idx = nextIdx++
        if (idx >= groups.length) return
        const fd = new FormData()
        groups[idx].forEach((f) => fd.append('files', f))
        try {
          const { data } = await cardsApi.upload(fd, null, {
            shots: shotsPerCard,
            binder: mode === 'binder',
          })
          grouped[idx] = data.results
        } catch (err) {
          grouped[idx] = [{
            filename: groups[idx][0]?.name,
            error: err.response?.data?.detail || 'Upload fehlgeschlagen',
          }]
        }
        doneCount += 1
        setProgress(Math.round((doneCount / groups.length) * 100))
        flush()
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, groups.length) }, worker))
    flush()
    setUploading(false)
    setFiles([])
  }

  function payloadFor(r, cand) {
    return {
      tcg_card_id: cand.id,
      name: cand.name,
      set_name: cand.set?.name,
      set_code: cand.set?.id,
      rarity: cand.rarity,
      card_type: cand.types?.join(', '),
      hp: cand.hp,
      image_url: cand.images?.large || cand.images?.small,
      condition,
      quantity: 1,
      is_foil: false,
      for_trade: forTrade,
      language: r.detected_language || 'EN',
      cm_product_id: cand.cm_id || null,
      scan_front_path: r.local_image_path || null,
      scan_back_path: r.back_local_path || null,
      scan_paths: [r.local_image_path, ...(r.extra_local_paths || [])].filter(Boolean),
    }
  }

  function noteSaved(idx, data) {
    setConfirmed((prev) => [...prev, data])
    setSavedIdx((prev) => ({ ...prev, [idx]: data }))
    if (data.tcg_card_id) {
      setOwnedMap((prev) => ({
        ...prev,
        [data.tcg_card_id]: {
          card_id: data.id,
          quantity: (prev[data.tcg_card_id]?.quantity || 0) + 1,
        },
      }))
    }
  }

  const selectedIdxs = useMemo(
    () => results
      .map((_, i) => i)
      .filter((i) => picks[i]?.on && !savedIdx[i] && results[i].candidates?.length),
    [results, picks, savedIdx],
  )

  async function saveSelected() {
    if (!selectedIdxs.length) return
    setSaving(selectedIdxs.length)
    let failed = 0
    for (const i of selectedIdxs) {
      const r = results[i]
      const cand = r.candidates[picks[i]?.candIdx || 0]
      try {
        const { data } = await cardsApi.confirm(payloadFor(r, cand))
        noteSaved(i, data)
      } catch {
        failed += 1
      }
      setSaving((n) => n - 1)
    }
    setSaving(0)
    const ok = selectedIdxs.length - failed
    if (ok) toast.success(`${ok} Karte${ok !== 1 ? 'n' : ''} zur Sammlung hinzugefügt`)
    if (failed) toast.error(`${failed} Karte${failed !== 1 ? 'n' : ''} konnte${failed !== 1 ? 'n' : ''} nicht gespeichert werden`)
  }

  async function handleModalConfirm(payload) {
    const idx = modalIdx
    try {
      const { data } = await cardsApi.confirm({ ...payload, for_trade: forTrade })
      noteSaved(idx, data)
      toast.success(`${data.name} hinzugefügt`)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Karte konnte nicht gespeichert werden')
    }
    setModalIdx(null)
  }

  const counts = useMemo(() => {
    const c = { sure: 0, likely: 0, unknown: 0, error: 0 }
    for (const r of results) c[confidenceOf(r)] += 1
    return c
  }, [results])

  const openCount = results.filter((_, i) => !savedIdx[i]).length
  const reviewing = results.length > 0 && !uploading

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="page-title">Karten scannen</h1>
        <p className="text-ink-3 text-sm mt-1">
          Fotos hierher ziehen oder aufnehmen — bis zu 50 auf einmal.
        </p>
      </div>

      {/* Mode picker */}
      <div className="grid sm:grid-cols-3 gap-2">
        {MODES.map((m) => {
          const Icon = m.icon
          const active = mode === m.id
          return (
            <button
              key={m.id}
              onClick={() => changeMode(m.id)}
              aria-pressed={active}
              className={`text-left p-3 rounded-xl border transition-colors ${
                active
                  ? 'bg-accent/10 border-accent'
                  : 'border-line hover:border-ink-4'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-accent-ink' : 'text-ink-3'}`} />
                <span className="font-semibold text-sm">{m.label}</span>
              </div>
              <p className="text-xs text-ink-3 mt-1 leading-snug">{m.hint}</p>
              {m.id === 'plan' && (
                <p className="text-[11px] text-ink-4 mt-1 truncate">
                  {plan.join(' → ')}
                </p>
              )}
              {/* The plan editor used to live only in the account settings,
                  which is why nobody found it and everyone stayed on two
                  photos. The way in belongs where the plan is visible. */}
              {m.id === 'plan' && mode === 'plan' && (
                <span
                  role="link" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); navigate('/sell') }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.stopPropagation(); navigate('/sell') }
                  }}
                  className="text-[11px] text-accent-ink hover:underline mt-1 inline-block cursor-pointer"
                >
                  Aufnahmen ändern →
                </span>
              )}
            </button>
          )
        })}
      </div>

      {mode === 'plan' && files.length > 0 && files.length % plan.length !== 0 && (
        <div className="panel !py-3 flex items-start gap-2.5 text-xs bg-amber-50 border-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
          <p className="text-amber-900">
            {files.length} Fotos lassen sich nicht in Gruppen zu {plan.length} teilen.
            Die letzte Karte bekäme zu wenige Aufnahmen — es fehlen{' '}
            {plan.length - (files.length % plan.length)}.
          </p>
        </div>
      )}

      {mode === 'binder' && (
        <div className="panel !py-3 flex items-start gap-2.5 text-xs text-ink-2 bg-surface-2">
          <Grid3x3 className="w-4 h-4 shrink-0 mt-0.5 text-accent-ink" />
          <p>
            Leg die Mappe flach hin und fotografier die Seite möglichst gerade von
            oben — der ganze Seitenrand sollte im Bild sein. Reflexionen auf der
            Folie sind der häufigste Grund, warum eine Karte nicht gefunden wird.
          </p>
        </div>
      )}

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-pokemon-yellow bg-accent/5' : 'border-line hover:border-ink-4'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className={`w-10 h-10 mx-auto mb-3 ${isDragActive ? 'text-pokemon-yellow' : 'text-ink-4'}`} />
        {isDragActive ? (
          <p className="text-accent-ink font-semibold">Loslassen zum Hochladen</p>
        ) : (
          <>
            <p className="text-ink-2 font-semibold">
              {mode === 'binder' ? 'Fotos der Mappenseiten hierher ziehen' : 'Kartenfotos hierher ziehen'}
            </p>
            <p className="text-ink-3 text-sm mt-1">oder klicken zum Auswählen — JPG, PNG, HEIC, WEBP</p>
          </>
        )}
      </div>

      <button onClick={() => setShowCamera(true)} className="btn-secondary w-full flex items-center justify-center gap-2">
        <Camera className="w-4 h-4" />
        Mit Kamera aufnehmen
      </button>

      {/* Staged files */}
      {files.length > 0 && (
        <div className="panel space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold">
              {files.length} Foto{files.length !== 1 ? 's' : ''} bereit
              {mode === 'plan' && plan.length > 1 && (
                <span className="text-ink-3 font-normal">
                  {' '}· {Math.ceil(files.length / plan.length)} Karte
                  {Math.ceil(files.length / plan.length) !== 1 ? 'n' : ''}
                </span>
              )}
            </p>
            <button onClick={() => setFiles([])} className="text-xs text-ink-3 hover:text-ink">
              Alle entfernen
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-surface-2 rounded-lg px-2 py-1 text-xs">
                <ImageIcon className="w-3 h-3 text-ink-3" />
                <span className="text-ink-2 max-w-[120px] truncate">{f.name}</span>
              </div>
            ))}
          </div>
          <button onClick={handleUpload} disabled={uploading} className="btn-primary w-full flex items-center justify-center gap-2">
            {uploading ? (
              <><Loader className="w-4 h-4 animate-spin" /> Wird erkannt… {progress}%</>
            ) : (
              <><Upload className="w-4 h-4" /> Hochladen und erkennen</>
            )}
          </button>
        </div>
      )}

      {uploading && (
        <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* ── Review: everything at once, instead of one dialog per card ──────── */}
      {reviewing && (
        <div className="panel space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-bold">{results.length} Karte{results.length !== 1 ? 'n' : ''} erkannt</h2>
              <p className="text-xs text-ink-3 mt-0.5">
                {counts.sure} sicher
                {counts.likely > 0 && `, ${counts.likely} wahrscheinlich`}
                {counts.unknown > 0 && `, ${counts.unknown} zu prüfen`}
                {counts.error > 0 && `, ${counts.error} fehlgeschlagen`}
              </p>
            </div>
            {openCount > 0 && (
              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => setPicks((p) => {
                    const n = { ...p }
                    results.forEach((r, i) => { if (r.candidates?.length) n[i] = { ...n[i], on: true } })
                    return n
                  })}
                  className="text-ink-3 hover:text-ink underline"
                >Alle auswählen</button>
                <button
                  onClick={() => setPicks((p) => {
                    const n = { ...p }
                    results.forEach((_, i) => { n[i] = { ...n[i], on: false } })
                    return n
                  })}
                  className="text-ink-3 hover:text-ink underline"
                >Keine</button>
              </div>
            )}
          </div>

          {/* Bulk settings — applied to every card saved from here */}
          {openCount > 0 && (
            <div className="grid sm:grid-cols-2 gap-3 pb-1">
              <div>
                <label className="block text-xs text-ink-3 mb-1" htmlFor="bulk-condition">
                  Zustand für alle
                </label>
                <select
                  id="bulk-condition" className="input" value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                >
                  {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <label className="flex items-end gap-2 text-sm cursor-pointer select-none pb-2">
                <input
                  type="checkbox" checked={forTrade}
                  onChange={(e) => setForTrade(e.target.checked)}
                />
                <span className="flex items-center gap-1.5">
                  <ShoppingBag className="w-4 h-4 text-ink-3" />
                  Direkt zum Verkauf markieren
                </span>
              </label>
            </div>
          )}

          <ul className="divide-y divide-line -mx-1">
            {results.map((r, i) => {
              const conf = confidenceOf(r)
              const style = CONF_STYLE[conf]
              const cand = r.candidates?.[picks[i]?.candIdx || 0]
              const saved = savedIdx[i]
              return (
                <li key={i} className="flex items-center gap-3 py-2 px-1">
                  {saved ? (
                    <CheckCircle className="w-4 h-4 text-green-700 shrink-0" />
                  ) : (
                    <input
                      type="checkbox"
                      className="shrink-0"
                      disabled={!r.candidates?.length}
                      checked={Boolean(picks[i]?.on && r.candidates?.length)}
                      onChange={(e) => setPicks((p) => ({ ...p, [i]: { ...p[i], on: e.target.checked } }))}
                      aria-label={`${cand?.name || r.filename} auswählen`}
                    />
                  )}

                  {r.thumbnail_url ? (
                    <img
                      src={r.thumbnail_url} alt=""
                      className="w-9 h-12 object-cover rounded border border-line shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-9 h-12 rounded bg-surface-2 border border-line shrink-0 flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4 text-ink-4" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold truncate ${saved ? 'text-ink-3 line-through' : ''}`}>
                      {saved?.name || cand?.name || r.error || 'Nicht erkannt'}
                    </p>
                    <p className="text-xs text-ink-3 truncate">
                      {cand?.set?.name || r.ocr_name || r.filename}
                      {r.region_count > 1 && ` · Fach ${r.region_index + 1}/${r.region_count}`}
                    </p>
                  </div>

                  {!saved && (
                    <>
                      <span className={`badge border !text-[10px] shrink-0 ${style.cls}`}>
                        {style.label}
                      </span>
                      {!r.error && (
                        <button
                          onClick={() => setModalIdx(i)}
                          className="p-1.5 rounded-lg hover:bg-surface-2 shrink-0"
                          title="Karte einzeln prüfen"
                        >
                          <Pencil className="w-3.5 h-3.5 text-ink-3" />
                        </button>
                      )}
                    </>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="flex gap-2 pt-1">
            <button
              onClick={saveSelected}
              disabled={!selectedIdxs.length || saving > 0}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              {saving > 0 ? (
                <><Loader className="w-4 h-4 animate-spin" /> Noch {saving}…</>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  {selectedIdxs.length} Karte{selectedIdxs.length !== 1 ? 'n' : ''} übernehmen
                </>
              )}
            </button>
            <button
              onClick={() => { setResults([]); setPicks({}); setSavedIdx({}) }}
              className="btn-secondary flex items-center gap-2"
            >
              <X className="w-4 h-4" /> Schließen
            </button>
          </div>

          {confirmed.length > 0 && (
            <div className="pt-3 border-t border-line space-y-2">
              <p className="text-sm text-ink-3">
                {confirmed.length} Karte{confirmed.length !== 1 ? 'n' : ''} in der Sammlung
              </p>
              {/* Straight from scanning to the listing file — without this the
                  route was: collection → select the right cards again → export. */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setShowExport(true)}
                  className="btn-primary flex items-center gap-2"
                >
                  <ShoppingBag className="w-4 h-4" />
                  Diese {confirmed.length} bei eBay einstellen
                </button>
                <button onClick={() => navigate('/collection')} className="btn-secondary">
                  Zur Sammlung
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {modalIdx !== null && results[modalIdx] && (
        <ConfirmModal
          result={results[modalIdx]}
          onConfirm={handleModalConfirm}
          onSkip={() => setModalIdx(null)}
          ownedMap={ownedMap}
        />
      )}

      {showCamera && (
        <CameraCapture
          plan={mode === 'plan' ? plan : ['Foto']}
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}

      {showExport && (
        <EbayExportModal
          cardIds={confirmed.map((c) => c.id)}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}
