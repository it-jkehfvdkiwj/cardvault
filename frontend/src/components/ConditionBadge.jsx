const CONDITIONS = [
  'Mint',
  'Near Mint',
  'Lightly Played',
  'Moderately Played',
  'Heavily Played',
  'Damaged',
]

const COLORS = {
  'Mint': 'bg-emerald-700 text-emerald-100',
  'Near Mint': 'bg-green-700 text-green-100',
  'Lightly Played': 'bg-lime-700 text-lime-100',
  'Moderately Played': 'bg-yellow-700 text-yellow-100',
  'Heavily Played': 'bg-orange-700 text-orange-100',
  'Damaged': 'bg-red-700 text-red-100',
}

export function ConditionBadge({ condition }) {
  const cls = COLORS[condition] || 'bg-gray-700 text-gray-300'
  return <span className={`badge ${cls}`}>{condition}</span>
}

export function ConditionSelect({ value, onChange, className = '' }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`input ${className}`}
    >
      {CONDITIONS.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  )
}

export { CONDITIONS }
