import { useState, useEffect, useRef, useCallback } from 'react'
import toast from 'react-hot-toast'
import { X, Camera, SwitchCamera, Check, Trash2, Loader } from 'lucide-react'

/**
 * Live camera capture for scanning cards directly with a webcam / phone camera.
 *
 * Uses getUserMedia, which the browser only allows in a secure context — that
 * includes http://localhost, so it works in local dev. (Accessing the dev
 * server from a phone over the LAN would require HTTPS.)
 *
 * Captured frames are returned as JPEG File objects via onCapture, so they flow
 * through the exact same upload/identify pipeline as drag-and-dropped images.
 */
export default function CameraCapture({ onCapture, onClose, pairMode = false }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  const [devices, setDevices] = useState([])
  const [deviceIndex, setDeviceIndex] = useState(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [shots, setShots] = useState([]) // { url, file }

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const startStream = useCallback(async (deviceId) => {
    setReady(false)
    setError(null)
    stopStream()
    try {
      // Request the highest resolution the device offers — small/blurry frames
      // are the #1 reason a scan fails, so we want as much detail as possible.
      const hi = { width: { ideal: 2560 }, height: { ideal: 1440 } }
      const constraints = {
        video: deviceId
          ? { deviceId: { exact: deviceId }, ...hi }
          : { facingMode: 'environment', ...hi },
        audio: false,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setReady(true)

      // Enumerate cameras (labels only available after permission granted).
      const all = await navigator.mediaDevices.enumerateDevices()
      setDevices(all.filter((d) => d.kind === 'videoinput'))
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Kamerazugriff verweigert. Bitte im Browser erlauben und neu laden.')
      } else if (err.name === 'NotFoundError') {
        setError('Keine Kamera gefunden.')
      } else {
        setError('Kamera konnte nicht gestartet werden: ' + err.message)
      }
    }
  }, [stopStream])

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Dieser Browser unterstützt keinen Kamerazugriff.')
      return
    }
    startStream()
    return stopStream
  }, [startStream, stopStream])

  function switchCamera() {
    if (devices.length < 2) return
    const next = (deviceIndex + 1) % devices.length
    setDeviceIndex(next)
    startStream(devices[next].deviceId)
  }

  function capture() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !video.videoWidth) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)

    // Warn (don't block) on clearly out-of-focus / motion-blurred frames.
    if (sharpness(canvas) < 18) {
      toast('⚠️ Aufnahme wirkt unscharf – ruhiger halten, näher ran & gute Beleuchtung.',
        { icon: '📷' })
    }

    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' })
        setShots((prev) => [...prev, { url: URL.createObjectURL(blob), file }])
      },
      'image/jpeg',
      0.95,
    )
  }

  /** Rough focus metric: variance of the Laplacian on a downscaled grayscale
   *  copy. Low value ≈ blurry. Used only for a soft warning. */
  function sharpness(canvas) {
    const maxW = 480
    const scale = Math.min(1, maxW / canvas.width)
    const w = Math.max(1, Math.round(canvas.width * scale))
    const h = Math.max(1, Math.round(canvas.height * scale))
    const tmp = document.createElement('canvas')
    tmp.width = w; tmp.height = h
    const ctx = tmp.getContext('2d')
    ctx.drawImage(canvas, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)
    const g = new Float64Array(w * h)
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      g[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    }
    let sum = 0, sum2 = 0, n = 0
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x
        const lap = 4 * g[idx] - g[idx - 1] - g[idx + 1] - g[idx - w] - g[idx + w]
        sum += lap; sum2 += lap * lap; n++
      }
    }
    if (!n) return 999
    return sum2 / n - (sum / n) ** 2
  }

  function removeShot(idx) {
    setShots((prev) => {
      const copy = [...prev]
      URL.revokeObjectURL(copy[idx].url)
      copy.splice(idx, 1)
      return copy
    })
  }

  function finish() {
    if (!shots.length) {
      toast.error('Noch keine Aufnahme gemacht')
      return
    }
    onCapture(shots.map((s) => s.file))
    stopStream()
    onClose()
  }

  function handleClose() {
    shots.forEach((s) => URL.revokeObjectURL(s.url))
    stopStream()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-pokemon-card border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[94vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Camera className="w-5 h-5 text-pokemon-yellow" /> Karte scannen
          </h2>
          <button onClick={handleClose} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {error ? (
            <div className="text-center text-red-400 py-10 px-4 text-sm">{error}</div>
          ) : (
            <>
              {/* Live preview with card-shaped framing guide */}
              <div className="relative bg-black rounded-xl overflow-hidden aspect-video flex items-center justify-center">
                <video ref={videoRef} playsInline muted className="w-full h-full object-contain" />
                {!ready && (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                    <Loader className="w-6 h-6 animate-spin" />
                  </div>
                )}
                {/* Card aspect-ratio guide (2.5 : 3.5) */}
                {ready && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="border-2 border-pokemon-yellow/80 rounded-lg h-[85%] aspect-[5/7]" />
                  </div>
                )}
              </div>

              {pairMode && (
                <div className="text-center">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-pokemon-yellow/15 text-pokemon-yellow border border-pokemon-yellow/30">
                    2er-Pack · Nächste Aufnahme: {shots.length % 2 === 0 ? '🃏 Vorderseite' : '🔄 Rückseite'}
                  </span>
                </div>
              )}
              <p className="text-xs text-gray-400 text-center">
                Karte gerade und formatfüllend in den gelben Rahmen halten. Gute Beleuchtung,
                keine Spiegelungen — am wichtigsten ist die Set-Nummer unten (z. B. 018/091).
              </p>

              {/* Captured thumbnails */}
              {shots.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {shots.map((s, i) => (
                    <div key={i} className="relative group">
                      <img src={s.url} alt={`Aufnahme ${i + 1}`} className="w-16 h-24 object-cover rounded-lg border border-gray-700" />
                      {pairMode && (
                        <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-center text-gray-200 rounded-b-lg py-0.5">
                          {i % 2 === 0 ? 'Vorder' : 'Rück'}
                        </span>
                      )}
                      <button
                        onClick={() => removeShot(i)}
                        className="absolute -top-1.5 -right-1.5 bg-pokemon-red text-white rounded-full p-0.5 opacity-90 hover:opacity-100"
                        title="Entfernen"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer / controls */}
        {!error && (
          <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-gray-700 shrink-0">
            <button
              onClick={switchCamera}
              disabled={devices.length < 2}
              className="btn-ghost flex items-center gap-2 disabled:opacity-30"
              title="Kamera wechseln"
            >
              <SwitchCamera className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <button onClick={capture} disabled={!ready} className="btn-secondary flex items-center gap-2">
                <Camera className="w-4 h-4" /> Aufnehmen
              </button>
              <button onClick={finish} disabled={!shots.length} className="btn-primary flex items-center gap-2">
                <Check className="w-4 h-4" />
                {shots.length > 0 ? `${shots.length} übernehmen` : 'Übernehmen'}
              </button>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  )
}
