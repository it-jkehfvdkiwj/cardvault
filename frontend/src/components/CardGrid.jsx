import { Link } from 'react-router-dom'
import RarityBadge from './RarityBadge'
import LanguageBadge from './LanguageBadge'
import { Sparkles, ArrowLeftRight, Check, Layers, SearchX } from 'lucide-react'

export default function CardGrid({ cards, selectable = false, selectedIds = [], onToggleSelect }) {
  if (!cards.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-ink-3">
        <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-4">
          <SearchX className="w-7 h-7 text-ink-4" />
        </div>
        <p className="text-base font-medium text-ink-3">Keine Karten gefunden</p>
        <p className="text-sm text-ink-4 mt-1">Filter anpassen oder neue Karten scannen.</p>
      </div>
    )
  }

  const selected = new Set(selectedIds)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {cards.map((card) => {
        const isSel = selected.has(card.id)
        const priceEur = card.market_price_eur ?? card.price_trend_eur
        const inner = (
          <div className={`panel !p-2 card-hover cursor-pointer flex flex-col gap-2 h-full ${
            isSel ? 'ring-2 ring-accent border-accent/50' : ''
          }`}>
            <div className="relative aspect-[2.5/3.5] rounded-lg overflow-hidden bg-surface-2">
              {card.image_url ? (
                <img src={card.image_url} alt={card.name}
                  className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Layers className="w-8 h-8 text-ink-4" />
                </div>
              )}
              {card.quantity > 1 && (
                <span className="absolute top-1.5 right-1.5 bg-black/75 backdrop-blur-sm text-white text-[11px] font-bold px-1.5 py-0.5 rounded-md border border-white/10">
                  ×{card.quantity}
                </span>
              )}
              {selectable && (
                <span className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                  isSel
                    ? 'bg-accent border-accent text-ink'
                    : 'bg-ink/35 border-white/80 backdrop-blur-sm'
                }`}>
                  {isSel && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                </span>
              )}
              <div className="absolute bottom-1.5 left-1.5 flex gap-1">
                {card.is_foil && (
                  <span title="Foil" className="bg-amber-400/95 text-ink rounded-md p-0.5 shadow">
                    <Sparkles className="w-3 h-3" />
                  </span>
                )}
                {card.for_trade && (
                  <span title="Zum Verkauf" className="bg-sky-500/95 text-ink rounded-md p-0.5 shadow">
                    <ArrowLeftRight className="w-3 h-3" />
                  </span>
                )}
              </div>
              {priceEur != null && (
                <span className="absolute bottom-1.5 right-1.5 bg-black/75 backdrop-blur-sm text-amber-700 text-[11px] font-bold px-1.5 py-0.5 rounded-md border border-white/10">
                  {priceEur.toFixed(2).replace('.', ',')} €
                </span>
              )}
            </div>
            <div className="px-0.5 space-y-1 flex-1 flex flex-col">
              <p className="text-xs font-semibold text-ink leading-tight line-clamp-2">{card.name}</p>
              <p className="text-[11px] text-ink-3 truncate">{card.set_name}</p>
              <div className="flex flex-wrap items-center gap-1 mt-auto pt-0.5">
                <RarityBadge rarity={card.rarity} />
                <LanguageBadge language={card.language} />
                {priceEur == null && card.market_price_usd != null && (
                  <span className="text-[11px] font-bold text-ink-3 ml-auto">
                    ${card.market_price_usd.toFixed(2)}
                  </span>
                )}
                {card.condition && card.condition !== 'Near Mint' && (
                  <span className="text-[10px] text-ink-4 truncate ml-auto">
                    {card.condition.replace(' Played', 'P')}
                  </span>
                )}
              </div>
            </div>
          </div>
        )

        if (selectable) {
          return (
            <button key={card.id} type="button" onClick={() => onToggleSelect?.(card.id)} className="text-left">
              {inner}
            </button>
          )
        }
        return (
          <Link key={card.id} to={`/card/${card.id}`} className="group">{inner}</Link>
        )
      })}
    </div>
  )
}
