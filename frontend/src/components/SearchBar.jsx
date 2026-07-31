import { Search, X } from 'lucide-react'

export default function SearchBar({ value, onChange, placeholder = 'Search cards…' }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input pl-9 pr-8"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
