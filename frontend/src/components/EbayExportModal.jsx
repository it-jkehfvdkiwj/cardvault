import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { X, Download, Eye, Loader, ShoppingBag, Info } from 'lucide-react'
import { ebayApi, downloadBlob } from '../api/client'

const SITE_LABELS = {
  DE: '🇩🇪 eBay.de (EUR)', AT: '🇦🇹 eBay.at (EUR)', UK: '🇬🇧 eBay.co.uk (GBP)',
  US: '🇺🇸 eBay.com (USD)', FR: '🇫🇷 eBay.fr (EUR)', IT: '🇮🇹 eBay.it (EUR)',
  ES: '🇪🇸 eBay.es (EUR)',
}

export default function EbayExportModal({ onClose, forTradeDefault = false, cardIds = null }) {
  const [status, setStatus] = useState(null)
  const [opts, setOpts] = useState(null)
  const [forTradeOnly, setForTradeOnly] = useState(forTradeDefault)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    ebayApi.status()
      .then(({ data }) => {
        setStatus(data)
        setOpts(data.default_options)
      })
      .catch(() => toast.error('Could not load eBay settings'))
  }, [])

  function set(key, value) {
    setOpts((o) => ({ ...o, [key]: value }))
    setPreview(null)
  }

  function payload() {
    return {
      for_trade_only: forTradeOnly,
      options: opts,
      ...(cardIds && cardIds.length ? { card_ids: cardIds } : {}),
    }
  }

  async function handlePreview() {
    setLoading(true)
    try {
      const { data } = await ebayApi.preview(payload())
      setPreview(data)
    } catch {
      toast.error('Preview failed')
    }
    setLoading(false)
  }

  async function handleDownload() {
    setDownloading(true)
    try {
      const { data } = await ebayApi.exportCsv(payload())
      downloadBlob(data, 'ebay_listings.csv')
      toast.success('eBay CSV downloaded')
    } catch {
      toast.error('Export failed')
    }
    setDownloading(false)
  }

  const currency = preview?.listings?.[0]?.currency || (opts?.site === 'UK' ? 'GBP' : opts?.site === 'US' ? 'USD' : 'EUR')
  const totalValue = preview?.listings?.reduce((s, l) => s + l.price * l.quantity, 0) || 0
  const noPriceCount = preview?.listings?.filter((l) => !l.has_price_data).length || 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-pokemon-card border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div>
            <h2 className="font-bold text-lg flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-pokemon-yellow" /> Sell on eBay
            </h2>
            <p className="text-sm text-gray-400">
              {cardIds && cardIds.length
                ? `Nur ${cardIds.length} ausgewählte Karte(n) exportieren.`
                : 'Generate a bulk-listing CSV for eBay File Exchange / Seller Hub.'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {!opts ? (
            <div className="flex justify-center py-10 text-gray-500">
              <Loader className="w-5 h-5 animate-spin" />
            </div>
          ) : (
            <>
              {/* Marketplace + scope */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Marketplace</label>
                  <select className="input" value={opts.site} onChange={(e) => set('site', e.target.value)}>
                    {(status?.sites || ['DE']).map((s) => (
                      <option key={s} value={s}>{SITE_LABELS[s] || s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">eBay category ID</label>
                  <input className="input" value={opts.category} onChange={(e) => set('category', e.target.value)} />
                </div>
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Price ×</label>
                  <input type="number" step="0.05" min="0.1" className="input"
                    value={opts.price_multiplier}
                    onChange={(e) => set('price_multiplier', Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Min price</label>
                  <input type="number" step="0.01" min="0" className="input"
                    value={opts.min_price}
                    onChange={(e) => set('min_price', Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Shipping</label>
                  <input type="number" step="0.10" min="0" className="input"
                    value={opts.shipping_cost}
                    onChange={(e) => set('shipping_cost', Number(e.target.value))} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={opts.round_99}
                    onChange={(e) => set('round_99', e.target.checked)} className="rounded" />
                  Round to .99
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={forTradeOnly}
                    onChange={(e) => { setForTradeOnly(e.target.checked); setPreview(null) }}
                    className="rounded" />
                  Only cards marked “for trade”
                </label>
              </div>

              {/* Live status note */}
              <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-800/60 rounded-lg px-3 py-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  CSV export works without an eBay account.{' '}
                  {status?.live_listing_available
                    ? 'Live API listing is configured.'
                    : 'Direct API listing is not configured (optional — set EBAY_* env vars later).'}
                  {' '}Verify the category ID for your marketplace and run a draft upload on eBay first.
                </span>
              </div>

              {/* Preview */}
              {preview && (
                <div className="panel space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{preview.count} listing{preview.count !== 1 ? 's' : ''}</span>
                    <span className="text-pokemon-yellow font-bold">
                      ≈ {totalValue.toFixed(2)} {currency}
                    </span>
                  </div>
                  {noPriceCount > 0 && (
                    <p className="text-xs text-amber-500">
                      {noPriceCount} card{noPriceCount !== 1 ? 's' : ''} have no price data → min price used.
                      Refresh prices in Collection for better values.
                    </p>
                  )}
                  <ul className="text-xs space-y-1 max-h-48 overflow-y-auto">
                    {preview.listings.slice(0, 50).map((l) => (
                      <li key={l.id} className="flex items-center justify-between gap-2 border-b border-gray-800 pb-1">
                        <span className="truncate text-gray-300">{l.title}</span>
                        <span className="shrink-0 font-semibold text-pokemon-yellow">
                          {l.price.toFixed(2)} {l.currency}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-700 shrink-0">
          <button onClick={handlePreview} disabled={loading || !opts} className="btn-secondary flex items-center gap-2">
            {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            Preview
          </button>
          <button onClick={handleDownload} disabled={downloading || !opts} className="btn-primary flex items-center gap-2">
            {downloading ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download eBay CSV
          </button>
        </div>
      </div>
    </div>
  )
}
