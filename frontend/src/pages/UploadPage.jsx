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

  async function handleUpload() {
    if (!files.length) return
    setUploading(true)
    setProgress(0)
    setResults([])
    setCurrentResultIdx(null)
    setConfirmed([])
    setSkipped(0)

    const fd = new FormData()
    files.forEach((f) => fd.append('files', f))

    try {
      const { data } = await cardsApi.upload(fd, (ev) => {
        if (ev.total) setProgress(Math.round((ev.loaded / ev.total) * 100))
      }, pairMode)
      setResults(data.results)
      setCurrentResultIdx(0)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed')
    }
    setUploading(false)
    setFiles([])
  }

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
        <h1 className="text-2xl font-bold">Upload Cards</h1>
        <p className="text-gray-400 text-sm mt-1">Drag & drop card images or click to browse. Up to 50 at once.</p>
      </div>

      {/* 2er-Pack (front + back) toggle */}
      <button
        onClick={togglePairMode}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-colors ${
          pairMode
            ? 'bg-pokemon-yellow/10 border-pokemon-yellow/40 text-pokemon-yellow'
            : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
        }`}
      >
        <Layers className="w-4 h-4 shrink-0" />
        <span className="text-left flex-1">
          2er-Pack {pairMode ? 'an' : 'aus'}
          <span className="block text-xs text-gray-500 font-normal">
            {pairMode
              ? 'Pro Karte: erst Vorderseite, dann Rückseite (in dieser Reihenfolge).'
              : 'Nur Vorderseite pro Karte.'}
          </span>
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${pairMode ? 'bg-pokemon-yellow text-black' : 'bg-gray-700 text-gray-300'}`}>
          {pairMode ? '2 Fotos' : '1 Foto'}
        </span>
      </button>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-pokemon-yellow bg-pokemon-yellow/5' : 'border-gray-700 hover:border-gray-500'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className={`w-12 h-12 mx-auto mb-3 ${isDragActive ? 'text-pokemon-yellow' : 'text-gray-600'}`} />
        {isDragActive ? (
          <p className="text-pokemon-yellow font-semibold">Drop it!</p>
        ) : (
          <>
            <p className="text-gray-300 font-semibold">Drag & drop card images here</p>
            <p className="text-gray-500 text-sm mt-1">or click to browse — JPG, PNG, HEIC, WEBP</p>
          </>
        )}
      </div>

      {/* Camera capture */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-800" />
        <span className="text-xs text-gray-600 uppercase tracking-wider">oder</span>
        <div className="flex-1 h-px bg-gray-800" />
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
            <button onClick={() => setFiles([])} className="text-xs text-gray-500 hover:text-white">Clear all</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2 py-1 text-xs">
                <ImageIcon className="w-3 h-3 text-gray-400" />
                <span className="text-gray-300 max-w-[120px] truncate">{f.name}</span>
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
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-pokemon-yellow transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Results summary */}
      {results.length > 0 && currentResultIdx === null && (
        <div className="panel space-y-2">
          <div className="flex items-center gap-2 font-semibold flex-wrap">
            <CheckCircle className="text-green-400 w-5 h-5" />
            Fertig! {confirmed.length} Karte{confirmed.length !== 1 ? 'n' : ''} hinzugefügt
            {skipped > 0 && (
              <span className="text-gray-400 font-normal text-sm">, {skipped} übersprungen</span>
            )}
          </div>
          <ul className="text-sm space-y-0.5 text-gray-400 max-h-40 overflow-y-auto">
            {confirmed.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <span className="text-green-400">✓</span>
                {c.name} <span className="text-gray-600">({c.set_name})</span>
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
