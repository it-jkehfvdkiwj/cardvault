import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

/**
 * Catches render-time crashes anywhere below it.
 *
 * Without this, a single thrown error in any component unmounts the whole tree
 * and the user is left staring at a blank white page with no way forward — the
 * worst possible first impression for a paid product. Here they get an
 * explanation and a working way out.
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Kept in the console so a user can copy it into a bug report.
    console.error('[Cardeva] Unerwarteter Fehler:', error, info?.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="panel max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-300 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6 text-amber-700" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Da ist etwas schiefgelaufen</h1>
            <p className="text-sm text-ink-3 mt-1.5">
              Deine Sammlung ist sicher — nur die Anzeige hat sich verschluckt.
              Ein Neuladen behebt das meistens.
            </p>
          </div>

          <div className="flex gap-2 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="btn-primary flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Neu laden
            </button>
            <button
              onClick={() => { window.location.href = '/dashboard' }}
              className="btn-secondary"
            >
              Zur Übersicht
            </button>
          </div>

          <details className="text-left">
            <summary className="text-xs text-ink-3 cursor-pointer hover:text-ink-2">
              Technische Details
            </summary>
            <pre className="mt-2 text-[11px] text-ink-3 whitespace-pre-wrap break-words max-h-40 overflow-auto">
              {String(error?.message || error)}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}
