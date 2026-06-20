import { langFlag, langLabel } from '../data/nameTranslations'

/**
 * Small badge showing a country flag and language code.
 * Only renders if language is non-English (or if `forceShow` is true).
 */
export default function LanguageBadge({ language = 'EN', forceShow = false, className = '' }) {
  if (language === 'EN' && !forceShow) return null
  return (
    <span
      title={langLabel(language)}
      className={`inline-flex items-center gap-0.5 badge bg-gray-700 text-gray-200 text-[11px] ${className}`}
    >
      {langFlag(language)} {language}
    </span>
  )
}
