import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { Upload, Image as ImageIcon, Loader, CheckCircle, AlertCircle, Camera, Layers } from 'lucide-react'
import { cardsApi, saleApi } from '../api/client'
import ConfirmModal from '../components/ConfirmModal'
import CameraCapture from '../components/CameraCapture'

const ACCEPTED = { 'image/jpeg': [], 'image/png': [], 'image/heic': [], 'image/webp': [] }

export default function UploadPage() {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState([])
  const [currentResultIdx, setCurrentResultIdx] = useState(null)
  const [confirmed, setConfirmed] = useState([])
  const [showCamera, setShowCamera] = useState(false)
  const [ownedMap, setOwnedMap] = useState({})
  const [skipped, setSkipped] = useState(0)
  const [processedCount, setProcessedCount] = useState(0)
  const [pairMode, setPairMode] = useState(false)   // "2er-Pack": front + back per card

  useEffect(() => {
    saleApi.getSettings()
      .then(({ data }) => setPairMode((data.photos_per_card || 1) >= 2))
      .catch(() => {})
  }, [])

  useEffect(() => {
    cardsApi.collectionIds()
      .then(({ data }) => {
        const map = {}
        for (const r of data) map[r.tcg_card_id] = { card_id: r.card_id, quantity: r.quantity }
        setOwnedMap(map)
      })
      .catch(() => {})
  }, [])

  const onDrop = useCallback((accepted) => {
    if (accepted.length + files.length > 50) {
      toast.error('Maximum 50 files per upload batch')
      return
    }
    setFiles((prev) => [...prev, ...accepted])
  }, [files])

  function handleCameraCapture(captured) {
    setFiles((prev) => {
      const merged = [...prev, ...captured]
      if (merged.length > 50) {
        toast.error('Maximum 50 files per upload batch')
        return merged.slice(0, 50)
      }
      return merged
    })
    toast.success(`${captured.length} Aufnahme${captured.length !== 1 ? 'n' : ''} hinzugefügt`)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 50,
  })

  async function togglePairMode() {
    const next = !pairMode
    setPairMode(next)
    try { await saleApi.updateSettings(next ? 2 : 1) } catch {}
  }

  // Parallel chunked upload: instead of ONE request for the whole batch (user
  // stares at a bar until every card is OCR'd), files are sent in small groups
  // over a few parallel connections. Results stream in as each group finishes
  // and the confirm dialog opens with the FIRST identified card while the rest
  // are still processing — dramatically faster perceived (and wall-clock) time.
  async function handleUpload() {
    if (!files.length) return
    setUploading(true)
    setProgress(0)
    setResults([])
    setCurrentResultIdx(null)
    setConfirmed([])
    setSkipped(0)
    setProcessedCount(0)

    const groupSize = pairMode ? 2 : 1
    const groups = []
    for (let i = 0; i < files.length; i += groupSize) groups.push(files.slice(i, i + groupSize))

    const CONCURRENCY = 3
    let nextIdx = 0
    let doneCount = 0
    const grouped = new Array(groups.length)

    const flush = () => {
      // Append in original order: only groups up to the first unfinished one.
      const ready = []
      for (const g of grouped) {
        if (g === undefined) break
        ready.push(...g)
      }
      setResults(ready)
    }

    async function worker() {
      for (;;) {
        const idx = nextIdx++
        if (idx >= groups.length) return
        const fd = new FormData()
        groups[idx].forEach((f) => fd.append('files', f))
        try {
          const { data } = await cardsApi.upload(fd, null, pairMode)
          grouped[idx] = data.results
        } catch (err) {
          grouped[idx] = [{
            filename: groups[idx][0]?.name,
            error: err.response?.data?.detail || 'Upload failed',
          }]
        }
        doneCount += 1
        setProgress(Math.round((doneCount / groups.length) * 100))
        flush()
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, groups.length) }, worker)
    )
    flush()
    setUploading(false)
    setFiles([])
  }

  // Open (or re-open) the confirm dialog as soon as unprocessed results exist.
  useEffect(() => {
    if (currentResultIdx === null && processedCount < results.length) {
      setCurrentResultIdx(processedCount)
    }
  }, [results, currentResultIdx, processedCount])

  async function handleConfirm(payload) {
    try {
      const { data } = await cardsApi.confirm(payload)
      setConfirmed((prev) => [...prev, data])
      toast.success(`${data.name} added to collection!`)
      if (data.tcg_card_id) {
        setOwnedMap((prev) => ({
          ...prev,
          [data.tcg_card_id]: {
            card_id: data.id,
            quantity: (prev[data.tcg_card_id]?.quantity || 0) + (payload.quantity || 1),
          },
        }))
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save card')
    }
    nextResult()
  }

  function nextResult() {
    setProcessedCount((c) => c + 1)
    setCurrentResultIdx((idx) => {
      const next = idx + 1
      return next >= results.length ? null : next
    })
  }

  function skipResult() {
    setSkipped((s) => s + 1)
    nextResult()
  }

  const currentResult = currentResultIdx !== null ? results[currentResultIdx] : null

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="page-title">Karten scannen</h1>
        <p className="text-ink-3 text-sm mt-1">Fotos hierher ziehen oder klicken zum Auswählen — bis zu 50 auf einmal.</p>
      </div>

      {/* 2er-Pack (front + back) toggle */}
      <button
        onClick={togglePairMode}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
          pairMode
            ? 'bg-accent/10 border-accent/60 text-pokemon-yellow'
            : 'border-line text-ink-3 hover:border-ink-4 hover:text-ink'
        }`}
      >
        <Layers className="w-4 h-4 shrink-0" />
        <span className="text-left flex-1">
          2er-Pack {pairMode ? 'an' : 'aus'}
          <span className="block text-xs text-ink-3 font-normal">
            {pairMode
              ? 'Pro Karte: erst Vorderseite, dann Rückseite (in dieser Reihenfolge).'
              : 'Nur Vorderseite pro Karte.'}
          </span>
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${pairMode ? 'bg-accent text-ink' : 'bg-surface-3 text-ink-2'}`}>
          {pairMode ? '2 Fotos' : '1 Foto'}
        </span>
      </button>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-pokemon-yellow bg-accent/5' : 'border-line hover:border-ink-4'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className={`w-12 h-12 mx-auto mb-3 ${isDragActive ? 'text-pokemon-yellow' : 'text-ink-4'}`} />
        {isDragActive ? (
          <p className="text-accent-ink font-semibold">Loslassen zum Hochladen!</p>
        ) : (
          <>
            <p className="text-ink-2 font-semibold">Kartenfotos hierher ziehen</p>
            <p className="text-ink-3 text-sm mt-1">oder klicken zum Auswählen — JPG, PNG, HEIC, WEBP</p>
          </>
        )}
      </div>

      {/* Camera capture */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-surface-2" />
        <span className="text-xs text-ink-4 uppercase tracking-wider">oder</span>
        <div className="flex-1 h-px bg-surface-2" />
      </div>
      <button
        onClick={() => setShowCamera(true)}
        className="btn-secondary w-full flex items-center justify-center gap-2"
      >
        <Camera className="w-4 h-4" />
        Mit Kamera scannen
      </button>

      {/* Staged files */}
      {files.length > 0 && (
        <div className="panel space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold">{files.length} file{files.length !== 1 ? 's' : ''} staged</p>
            <button onClick={() => setFiles([])} className="text-xs text-ink-3 hover:text-ink">Clear all</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-surface-2 rounded-lg px-2 py-1 text-xs">
                <ImageIcon className="w-3 h-3 text-ink-3" />
                <span className="text-ink-2 max-w-[120px] truncate">{f.name}</span>
              </div>
            ))}
          </div>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Uploading & identifying… {progress}%
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload & Identify
              </>
            )}
          </button>
        </div>
      )}

      {/* Progress bar */}
      {uploading && (
        <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Results summary */}
      {!uploading && results.length > 0 && currentResultIdx === null && (
        <div className="panel space-y-2">
          <div className="flex items-center gap-2 font-semibold flex-wrap">
            <CheckCircle className="text-green-700 w-5 h-5" />
            Fertig! {confirmed.length} Karte{confirmed.length !== 1 ? 'n' : ''} hinzugefügt
            {skipped > 0 && (
              <span className="text-ink-3 font-normal text-sm">, {skipped} übersprungen</span>
            )}
          </div>
          <ul className="text-sm space-y-0.5 text-ink-3 max-h-40 overflow-y-auto">
            {confirmed.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <span className="text-green-700">✓</span>
                {c.name} <span className="text-ink-4">({c.set_name})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Confirmation modal */}
      {currentResult && (
        <ConfirmModal
          result={currentResult}
          onConfirm={handleConfirm}
          onSkip={skipResult}
          ownedMap={ownedMap}
        />
      )}

      {/* Camera modal */}
      {showCamera && (
        <CameraCapture
          pairMode={pairMode}
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  )
}
