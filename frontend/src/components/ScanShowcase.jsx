import { Check, Sparkles } from 'lucide-react'

/**
 * The hero's product visual: a card being scanned, and the result it produces.
 *
 * Replaces the old placeholder (an icon in a grey box) — which was both
 * unconvincing and, worse, hidden below `lg`, so most visitors on a phone saw
 * no product at all. This is drawn entirely in CSS: no image request, nothing
 * to go stale when card artwork changes, and it scales down instead of
 * disappearing.
 */

function CardFace({ className = '' }) {
  return (
    <div className={`rounded-xl bg-accent p-[5px] shadow-lift ${className}`}>
      <div className="h-full rounded-lg bg-[#FDFBF4] p-2 flex flex-col">
        <div className="flex items-baseline justify-between">
          <span className="text-[9px] font-bold text-ink">Pikachu</span>
          <span className="text-[7px] text-ink-3">60 HP</span>
        </div>
        {/* Artwork window */}
        <div className="mt-1 rounded bg-gradient-to-br from-sky-200 via-sky-100 to-amber-100 flex-1 min-h-[52px] flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-amber-500/70" />
        </div>
        <div className="mt-1.5 space-y-1">
          <div className="h-[3px] rounded bg-ink/10" />
          <div className="h-[3px] rounded bg-ink/10 w-3/4" />
        </div>
        <div className="mt-auto pt-1.5 flex items-center justify-between">
          <span className="text-[6px] text-ink-4">PAF 018/091</span>
          <span className="text-[6px] text-ink-4">DE</span>
        </div>
      </div>
    </div>
  )
}

export default function ScanShowcase() {
  return (
    <div className="flex items-center justify-center gap-4 sm:gap-6">
      {/* Left: the card in the viewfinder */}
      <div className="relative shrink-0">
        <CardFace className="w-[104px] h-[145px] sm:w-[124px] sm:h-[173px]" />

        {/* Viewfinder brackets */}
        <span className="absolute -top-2 -left-2 w-5 h-5 border-t-2 border-l-2 border-sky-500 rounded-tl" />
        <span className="absolute -top-2 -right-2 w-5 h-5 border-t-2 border-r-2 border-sky-500 rounded-tr" />
        <span className="absolute -bottom-2 -left-2 w-5 h-5 border-b-2 border-l-2 border-sky-500 rounded-bl" />
        <span className="absolute -bottom-2 -right-2 w-5 h-5 border-b-2 border-r-2 border-sky-500 rounded-br" />

        {/* Scan line. Decorative, so it respects reduced-motion via Tailwind's
            motion-safe variant rather than animating unconditionally. */}
        <span
          aria-hidden="true"
          className="motion-safe:animate-scan absolute inset-x-[-6px] top-0 h-[2px] bg-sky-500/80 rounded-full"
        />
      </div>

      <span aria-hidden="true" className="text-ink-4 text-xl sm:text-2xl shrink-0">→</span>

      {/* Right: what CardVault made of it */}
      <div className="panel !p-3 sm:!p-4 min-w-0 flex-1 max-w-[230px]">
        <div className="flex items-center gap-1.5">
          <span className="badge bg-emerald-50 text-emerald-800 !text-[10px]">
            <Check className="w-3 h-3 mr-1" /> Erkannt
          </span>
          <span className="text-[10px] text-ink-4">1,4 s</span>
        </div>
        <p className="font-bold mt-2 leading-tight">Pikachu</p>
        <p className="text-[11px] text-ink-3 leading-snug">Paldean Fates · Deutsch</p>
        <p className="text-2xl font-extrabold text-ink mt-2 font-display">12,40 €</p>
        <p className="text-[10px] text-ink-4 -mt-0.5">Cardmarket Trend</p>
        <div className="flex flex-wrap gap-1 mt-2.5">
          {['eBay', 'Whatnot', 'Vinted'].map((p) => (
            <span key={p} className="badge bg-surface-2 text-ink-2 !text-[10px] border border-line">
              {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
