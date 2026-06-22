import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ArrowLeft, RefreshCw, Trash2, Sparkles, ArrowLeftRight,
  Save, ExternalLink, Euro, DollarSign, ShoppingBag, Zap, Star,
  ImagePlus, Loader,
} from 'lucide-react'
import { cardsApi, pricesApi, wantlistApi } from '../api/client'
import RarityBadge from '../components/RarityBadge'
import LanguageBadge from '../components/LanguageBadge'
import { ConditionSelect } from '../components/ConditionBadge'
import EbayExportModal from '../components/EbayExportModal'

const TYPE_COLORS = {
  Fire: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  Water: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Grass: 'bg-green-500/20 text-green-300 border-green-500/30',
  Lightning: 'bg-yellow-400/20 text-yellow-300 border-yellow-400/30',
  Psychic: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Fighting: 'bg-amber-700/20 text-amber-400 border-amber-700/30',
  Darkness: 'bg-gray-700/40 text-gray-300 border-gray-600/30',
  Metal: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  Dragon: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  Colorless: 'bg-gray-700/20 text-gray-400 border-gray-600/30',
  Fairy: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
}

function EnergyPip({ type }) {
  const cls = TYPE_COLORS[type] || 'bg-gray-700/20 text-gray-400 border-gray-600/30'
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${cls}`}>
      {type?.charAt(0) || '?'}
    </span>
  )
}

function TcgInfoSection({ cardId }) {
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    cardsApi.tcgInfo(cardId)
      .then(({ data }) => setInfo(data))
      .catch(() => setInfo(null))
      .finally(() => setLoading(false))
  }, [cardId])

  if (loading) return null
  if (!info) return null

  const hasGameContent =
    info.attacks.length > 0 ||
    info.abilities.length > 0 ||
    info.rules.length > 0

  if (!hasGameContent) return null

  return (
    <div className="panel space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-pokemon-yellow" />
        <h2 className="font-semibold text-sm">Card Info</h2>
        {info.evolves_from && (
          <span className="text-xs text-gray-500 ml-auto">Evolves from {info.evolves_from}</span>
        )}
      </div>

      {/* Abilities */}
      {info.abilities.map((ab, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-900/40 text-red-300 border border-red-700/40 uppercase tracking-wide">
              {ab.type || 'Ability'}
            </span>
            <span className="font-semibold text-sm">{ab.name}</span>
          </div>
          {ab.text && <p className="text-xs text-gray-400 leading-relaxed">{ab.text}</p>}
        </div>
      ))}

      {/* Attacks */}
      {info.attacks.map((atk, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-0.5">
              {(atk.cost || []).map((e, j) => <EnergyPip key={j} type={e} />)}
            </div>
            <span className="font-semibold text-sm">{atk.name}</span>
            {atk.damage && (
              <span className="ml-auto text-pokemon-yellow font-bold text-sm">{atk.damage}</span>
            )}
          </div>
          {atk.text && <p className="text-xs text-gray-400 leading-relaxed">{atk.text}</p>}
        </div>
      ))}

      {/* Weaknesses / Resistances / Retreat */}
      {(info.weaknesses.length > 0 || info.resistances.length > 0 || info.retreat_cost > 0) && (
        <div className="flex gap-4 pt-1 border-t border-gray-800 text-xs">
          {info.weaknesses.length > 0 && (
            <div>
              <p className="text-gray-500 mb-1">Weakness</p>
              {info.weaknesses.map((w, i) => (
                <span key={i} className="font-semibold">{w.type} {w.value}</span>
              ))}
            </div>
          )}
          {info.resistances.length > 0 && (
            <div>
              <p className="text-gray-500 mb-1">Resistance</p>
              {info.resistances.map((r, i) => (
                <span key={i} className="font-semibold">{r.type} {r.value}</span>
              ))}
            </div>
          )}
          {info.retreat_cost > 0 && (
            <div>
              <p className="text-gray-500 mb-1">Retreat</p>
              <div className="flex gap-0.5">
                {Array.from({ length: info.retreat_cost }).map((_, i) => (
                  <EnergyPip key={i} type="Colorless" />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rules box (Trainer / Rule Box Pokémon) */}
      {info.rules.map((rule, i) => (
        <p key={i} className="text-xs text-gray-400 italic border-t border-gray-800 pt-3 leading-relaxed">
          {rule}
        </p>
      ))}

      {/* Flavor text */}
      {info.flavor_text && (
        <p className="text-xs text-gray-500 italic border-t border-gray-800 pt-3 leading-relaxed">
          {info.flavor_text}
        </p>
      )}
    </div>
  )
}

function OtherPrintingsSection({ cardId }) {
  const [variants, setVariants] = useState(null)

  useEffect(() => {
    cardsApi.variants(cardId)
      .then(({ data }) => setVariants(data.variants))
      .catch(() => setVariants([]))
  }, [cardId])

  if (!variants || variants.length === 0) return null

  return (
    <div className="panel space-y-3">
      <h2 className="font-semibold text-sm text-gray-400 uppercase tracking-wider">
        Other Printings ({variants.length})
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {variants.map((v) => (
          <a
            key={v.id}
            href={`https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(v.name)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 group"
            title={`${v.name} · ${v.set_name} · ${v.rarity || ''}`}
          >
            <div className="w-16 h-[89px] rounded-lg overflow-hidden bg-gray-900 border border-gray-800 group-hover:border-gray-500 transition-colors">
              {v.image_url
                ? <img src={v.image_url} alt={v.name} className="w-full h-full object-cover" loading="lazy" />
                : <div className="w-full h-full flex items-center justify-center text-2xl text-gray-700">🃏</div>}
            </div>
            {v.language !== 'EN' && (
              <p className="text-[9px] text-center text-gray-600 mt-0.5">{v.language}</p>
            )}
          </a>
        ))}
      </div>
    </div>
  )
}

function SalePhotos({ card, onChange }) {
  const [busy, setBusy] = useState(null)   // 'front' | 'back' while uploading
  const frontRef = useRef(null)
  const backRef = useRef(null)

  async function upload(slot, file) {
    if (!file) return
    setBusy(slot)
    try {
      const { data } = await cardsApi.uploadPhoto(card.id, slot, file)
      onChange(data)
      toast.success(slot === 'front' ? 'Vorderseite gespeichert' : 'Rückseite gespeichert')
    } catch { toast.error('Upload fehlgeschlagen') }
    setBusy(null)
  }

  async function remove(slot) {
    try {
      const { data } = await cardsApi.deletePhoto(card.id, slot)
      onChange(data)
    } catch { toast.error('Konnte Foto nicht löschen') }
  }

  const slots = [
    { key: 'front', label: 'Vorderseite', url: card.photo_front_url, ref: frontRef },
    { key: 'back', label: 'Rückseite', url: card.photo_back_url, ref: backRef },
  ]

  return (
    <div className="panel space-y-2">
      <h2 className="font-semibold text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
        <ShoppingBag className="w-3.5 h-3.5" /> Verkaufs-Fotos
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {slots.map((s) => (
          <div key={s.key} className="space-y-1">
            <div className="aspect-[2.5/3.5] rounded-lg overflow-hidden bg-gray-900 border border-gray-800 relative group">
              {s.url ? (
                <img src={s.url} alt={s.label} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-700 text-[11px] gap-1">
                  <ImagePlus className="w-5 h-5" /> kein Foto
                </div>
              )}
              {s.url && (
                <button
                  onClick={() => remove(s.key)}
                  className="absolute top-1 right-1 bg-black/70 rounded p-1 text-gray-300 hover:text-pokemon-red opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Entfernen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => s.ref.current?.click()}
              disabled={busy === s.key}
              className="btn-secondary w-full text-xs py-1 flex items-center justify-center gap-1"
            >
              {busy === s.key ? <Loader className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
              {s.url ? 'Ändern' : s.label}
            </button>
            <input
              ref={s.ref} type="file" accept="image/*" className="hidden"
              onChange={(e) => { upload(s.key, e.target.files?.[0]); e.target.value = '' }}
            />
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-600">
        Kommen ins eBay-Listing (Vorderseite zuerst). Das Scan-Foto ist automatisch die Vorderseite.
      </p>
    </div>
  )
}

function getStoredLang() {
  try { return localStorage.getItem('cardvault_search_language') || 'EN' } catch { return 'EN' }
}

function PriceBox({ label, value, currency = '' }) {
  return (
    <div className="bg-gray-900 rounded-lg p-2.5 text-center">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="font-bold text-sm mt-0.5">
        {value != null
          ? <span className="text-pokemon-yellow">{currency}{typeof value === 'number' ? value.toFixed(2) : value}</span>
          : <span className="text-gray-600">–</span>}
      </p>
    </div>
  )
}

export default function CardDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [card, setCard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshingPrice, setRefreshingPrice] = useState(false)
  const [cmUrl, setCmUrl] = useState(null)
  const [edits, setEdits] = useState({})
  const [showEbay, setShowEbay] = useState(false)
  const [wantlisting, setWantlisting] = useState(false)
  const [onWantlist, setOnWantlist] = useState(false)

  useEffect(() => {
    cardsApi.get(id)
      .then(({ data }) => {
        setCard(data)
        setEdits({
          condition: data.condition,
          quantity: data.quantity,
          notes: data.notes || '',
          is_foil: data.is_foil,
          for_trade: data.for_trade,
        })
        // Derive CM URL if we have a product ID
        if (data.cm_product_id) {
          const lang = getStoredLang().toLowerCase()
          setCmUrl(
            `https://www.cardmarket.com/${lang}/Pokemon/Products/Singles/-/${data.cm_product_id}`
          )
        }
      })
      .catch(() => toast.error('Card not found'))
      .finally(() => setLoading(false))
  }, [id])

  async function handleSave() {
    setSaving(true)
    try {
      const { data } = await cardsApi.update(id, edits)
      setCard(data)
      toast.success('Saved!')
    } catch {
      toast.error('Save failed')
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm(`Remove "${card.name}" from your collection?`)) return
    await cardsApi.delete(id)
    toast.success('Removed from collection')
    navigate('/collection')
  }

  async function handleRefreshPrice() {
    if (!card?.tcg_card_id) return
    setRefreshingPrice(true)
    try {
      const lang = getStoredLang()
      const { data } = await pricesApi.get(card.tcg_card_id, lang)
      setCard((prev) => ({
        ...prev,
        market_price_usd: data.market_usd,
        price_low_usd: data.low_usd,
        price_mid_usd: data.mid_usd,
        price_high_usd: data.high_usd,
        market_price_eur: data.sell_eur,
        price_low_eur: data.low_eur,
        price_trend_eur: data.trend_eur,
      }))
      if (data.cm_url) setCmUrl(data.cm_url)
      toast.success('Prices refreshed')
    } catch {
      toast.error('Price refresh failed')
    }
    setRefreshingPrice(false)
  }

  async function handleAddToWantlist() {
    if (!card || wantlisting) return
    setWantlisting(true)
    try {
      await wantlistApi.add({
        tcg_card_id: card.tcg_card_id,
        name: card.name,
        set_name: card.set_name,
        set_code: card.set_code,
        rarity: card.rarity,
        image_url: card.image_url,
      })
      setOnWantlist(true)
      toast.success(`${card.name} zur Wantlist hinzugefügt`)
    } catch (err) {
      const msg = err.response?.data?.detail || ''
      if (msg.toLowerCase().includes('already')) {
        setOnWantlist(true)
        toast('Bereits auf der Wantlist', { icon: 'ℹ️' })
      } else {
        toast.error('Wantlist-Fehler')
      }
    }
    setWantlisting(false)
  }

  if (loading) return <div className="p-8 text-gray-400">Loading…</div>
  if (!card) return <div className="p-8 text-gray-400">Card not found</div>

  const hasEurPrices = card.market_price_eur != null || card.price_trend_eur != null || card.price_low_eur != null
  const hasUsdPrices = card.market_price_usd != null || card.price_low_usd != null

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Link to="/collection" className="flex items-center gap-1 text-gray-400 hover:text-white text-sm">
        <ArrowLeft className="w-4 h-4" /> Back to Collection
      </Link>

      <div className="grid md:grid-cols-[280px,1fr] gap-6">
        {/* Card image */}
        <div className="space-y-3">
          <div className="aspect-[2.5/3.5] rounded-xl overflow-hidden bg-gray-900">
            {card.image_url ? (
              <img src={card.image_url} alt={card.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl text-gray-700">🃏</div>
            )}
          </div>
          <p className="text-xs text-center text-gray-600">
            {card.tcg_card_id}
            {card.cm_product_id && (
              <span className="ml-2 text-blue-600">CM #{card.cm_product_id}</span>
            )}
          </p>

          {/* Seller's own photos for eBay */}
          <SalePhotos card={card} onChange={setCard} />
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Title */}
          <div>
            <h1 className="text-2xl font-bold">{card.name}</h1>
            <div className="flex flex-wrap gap-2 mt-2">
              <RarityBadge rarity={card.rarity} />
              <LanguageBadge language={card.language} forceShow />
              {card.hp && <span className="badge bg-red-900 text-red-200">HP {card.hp}</span>}
              {card.card_type && <span className="badge bg-gray-700 text-gray-300">{card.card_type}</span>}
            </div>
            <p className="text-gray-400 text-sm mt-1">{card.set_name}</p>
          </div>

          {/* ── EUR Prices (Cardmarket) ── PRIMARY ────────────────── */}
          <div className="panel space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Euro className="w-4 h-4 text-blue-400" />
                <h2 className="font-semibold text-sm">Cardmarket Prices (EUR)</h2>
              </div>
              <div className="flex items-center gap-2">
                {cmUrl && (
                  <a
                    href={cmUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                  >
                    <ExternalLink className="w-3 h-3" /> View listing
                  </a>
                )}
                <button
                  onClick={handleRefreshPrice}
                  disabled={refreshingPrice}
                  className="btn-ghost text-xs flex items-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${refreshingPrice ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>

            {hasEurPrices ? (
              <div className="grid grid-cols-3 gap-2">
                <PriceBox label="Sell" value={card.market_price_eur} currency="€" />
                <PriceBox label="Trend" value={card.price_trend_eur} currency="€" />
                <PriceBox label="Low" value={card.price_low_eur} currency="€" />
              </div>
            ) : (
              <p className="text-sm text-gray-600 italic">
                No EUR prices —{' '}
                {card.cm_product_id
                  ? 'click Refresh to load from Cardmarket'
                  : 'Cardmarket product ID not linked yet'}
              </p>
            )}
          </div>

          {/* ── USD Prices (TCGPlayer) ── SECONDARY ───────────────── */}
          <div className="panel space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-400" />
              <h2 className="font-semibold text-sm">TCGPlayer Prices (USD)</h2>
            </div>

            {hasUsdPrices ? (
              <div className="grid grid-cols-4 gap-2">
                <PriceBox label="Market" value={card.market_price_usd} currency="$" />
                <PriceBox label="Low" value={card.price_low_usd} currency="$" />
                <PriceBox label="Mid" value={card.price_mid_usd} currency="$" />
                <PriceBox label="High" value={card.price_high_usd} currency="$" />
              </div>
            ) : (
              <p className="text-sm text-gray-600 italic">No USD prices — click Refresh</p>
            )}

            {card.price_updated_at && (
              <p className="text-[10px] text-gray-600">
                Updated: {new Date(card.price_updated_at).toLocaleString()}
              </p>
            )}
          </div>

          {/* ── TCG game info ───────────────────────────────────────── */}
          <TcgInfoSection cardId={id} />

          {/* ── Other printings ─────────────────────────────────────── */}
          <OtherPrintingsSection cardId={id} />

          {/* ── Your copy ───────────────────────────────────────────── */}
          <div className="panel space-y-4">
            <h2 className="font-semibold text-sm text-gray-400 uppercase tracking-wider">Your Copy</h2>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Condition</label>
                <ConditionSelect
                  value={edits.condition}
                  onChange={(v) => setEdits((e) => ({ ...e, condition: v }))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Quantity</label>
                <input
                  type="number" min={1} max={999}
                  value={edits.quantity}
                  onChange={(ev) => setEdits((e) => ({ ...e, quantity: Number(ev.target.value) }))}
                  className="input"
                />
              </div>
            </div>

            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={edits.is_foil}
                  onChange={(ev) => setEdits((e) => ({ ...e, is_foil: ev.target.checked }))}
                />
                <Sparkles className="w-4 h-4 text-pokemon-yellow" /> Foil / Holo
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={edits.for_trade}
                  onChange={(ev) => setEdits((e) => ({ ...e, for_trade: ev.target.checked }))}
                />
                <ArrowLeftRight className="w-4 h-4 text-blue-400" /> For Trade
              </label>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1">Notes</label>
              <textarea
                rows={3}
                value={edits.notes}
                onChange={(ev) => setEdits((e) => ({ ...e, notes: ev.target.value }))}
                placeholder="Personal notes…"
                className="input resize-none"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary flex items-center gap-2 flex-1 justify-center"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              <button onClick={handleDelete} className="btn-ghost text-red-400 hover:text-red-300">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setShowEbay(true)}
                className="btn-secondary flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-4 h-4" /> eBay
              </button>
              <button
                onClick={handleAddToWantlist}
                disabled={wantlisting || onWantlist || !card?.tcg_card_id}
                className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  onWantlist
                    ? 'bg-pokemon-yellow/20 text-pokemon-yellow border border-pokemon-yellow/30'
                    : 'btn-ghost border border-gray-700'
                }`}
              >
                <Star className={`w-4 h-4 ${onWantlist ? 'fill-pokemon-yellow text-pokemon-yellow' : ''}`} />
                {onWantlist ? 'Auf Wantlist' : 'Wantlist'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showEbay && (
        <EbayExportModal cardIds={[Number(id)]} onClose={() => setShowEbay(false)} />
      )}
    </div>
  )
}
