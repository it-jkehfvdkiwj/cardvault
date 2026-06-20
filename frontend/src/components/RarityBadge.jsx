const RARITY_COLORS = {
  'Common': 'bg-gray-600 text-gray-200',
  'Uncommon': 'bg-green-700 text-green-100',
  'Rare': 'bg-blue-700 text-blue-100',
  'Rare Holo': 'bg-indigo-700 text-indigo-100',
  'Rare Holo V': 'bg-violet-700 text-violet-100',
  'Rare Holo VMAX': 'bg-purple-700 text-purple-100',
  'Rare Holo VSTAR': 'bg-pink-700 text-pink-100',
  'Ultra Rare': 'bg-yellow-600 text-yellow-100',
  'Secret Rare': 'bg-orange-600 text-orange-100',
  'Amazing Rare': 'bg-red-600 text-red-100',
  'Hyper Rare': 'bg-rose-600 text-rose-100',
}

export default function RarityBadge({ rarity }) {
  if (!rarity) return null
  const cls = RARITY_COLORS[rarity] || 'bg-gray-700 text-gray-300'
  return (
    <span className={`badge ${cls}`}>{rarity}</span>
  )
}
