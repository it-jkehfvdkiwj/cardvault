import { Link } from 'react-router-dom'
import RarityBadge from './RarityBadge'
import LanguageBadge from './LanguageBadge'
import { Sparkles, ArrowLeftRight, Check } from 'lucide-react'

export default function CardGrid({ cards, selectable = false, selectedIds = [], onToggleSelect }) {
  if (!cards.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-500">
        <span className="text-5xl mb-4">📭</span>
        <p className="text-lg">No cards found</p>
      </div>
    )
  }

  const selected = new Set(selectedIds)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {cards.map((card) => {
        const isSel = selected.has(card.id)
        const inner = (
          <div className={`panel p-2 card-hover cursor-pointer flex flex-col gap-2 ${
            isSel ? 'ring-2 ring-pokemon-yellow' : ''
          }`}>
            <div className="relative aspect-[2.5/3.5] rounded-lg overflow-hidden bg-gray-900">
              {card.image_url ? (
                <img src={card.image_url} alt={card.name} className="w-full h-full object-cover" loading="lazy" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-700 text-4xl">🃏</div>
              )}
              {card.quantity > 1 && (
                <span className="absolute top-1 right-1 bg-black/80 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                  ×{card.quantity}
                </span>
              )}
              {selectable && (
                <span className={`absolute top-1 left-1 w-5 h-5 rounded-md flex items-center justify-center border ${
                  isSel ? 'bg-pokemon-yellow border-pokemon-yellow text-black' : 'bg-black/50 border-gray-400'
                }`}>
                  {isSel && <Check className="w-3.5 h-3.5" />}
                </span>
              )}
              <div className="absolute bottom-1 left-1 flex gap-1">
                {card.is_foil && (
                  <span title="Foil" className="bg-pokemon-yellow/90 text-black rounded p-0.5"><Sparkles className="w-3 h-3" /></span>
                )}
                {card.for_trade && (
                  <span title="For Trade" className="bg-blue-500/90 text-white rounded p-0.5"><ArrowLeftRight className="w-3 h-3" /></span>
                )}
              </div>
            </div>
            <div className="px-0.5 space-y-1">
              <p className="text-xs font-semibold text-white leading-tight line-clamp-2">{card.name}</p>
              <p className="text-xs text-gray-500 truncate">{card.set_name}</p>
              <div className="flex flex-wrap gap-1">
                <RarityBadge rarity={card.rarity} />
                <LanguageBadge language={card.language} />
              </div>
              <div className="flex items-center justify-between gap-1">
                {(card.market_price_eur ?? card.price_trend_eur) != null ? (
                  <p className="text-xs font-bold text-pokemon-yellow">
                    {(card.market_price_eur ?? card.price_trend_eur).toFixed(2).replace('.', ',')} €
                  </p>
                ) : card.market_price_usd != null ? (
                  <p className="text-xs font-bold text-gray-400">${card.market_price_usd.toFixed(2)}</p>
                ) : null}
                {card.condition && card.condition !== 'Near Mint' && (
                  <p className="text-[10px] text-gray-600 truncate shrink-0">{card.condition.replace(' Played', 'P')}</p>
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
