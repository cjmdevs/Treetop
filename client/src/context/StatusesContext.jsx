import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { projectStatusesApi } from '../api/projectStatuses'
// Fallback if API hasn't loaded yet (matches the seeded defaults)
import { PROJECT_STATUSES as FALLBACK } from '../config/projectStatuses'

const StatusesContext = createContext(null)

// Convert hex color to lightweight style helpers used throughout the app
export function makeStatusStyle(color) {
  return {
    // Inline style objects — used instead of Tailwind for dynamic colors
    bgStyle:     { backgroundColor: color + '1a' },
    textStyle:   { color },
    dotStyle:    { backgroundColor: color },
    borderStyle: { borderTopColor: color, borderTopWidth: 2, borderTopStyle: 'solid' },
  }
}

export function StatusesProvider({ children }) {
  const [statuses, setStatuses] = useState(() =>
    FALLBACK.map((s, i) => ({
      id: i + 1,
      label: s.key,
      color: s.color === 'gray'   ? '#94A3B8'
           : s.color === 'blue'   ? '#3B82F6'
           : s.color === 'yellow' ? '#F59E0B'
           : s.color === 'purple' ? '#8B5CF6'
           : s.color === 'orange' ? '#F97316'
           : s.color === 'green'  ? '#10B981'
           : s.color === 'teal'   ? '#14B8A6'
           : '#94A3B8',
      sort_order: i,
      is_active: 1,
      is_default: i === 0 ? 1 : 0,
    }))
  )
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(() => {
    projectStatusesApi.list({ include_inactive: 'true' })
      .then(rows => { setStatuses(rows); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Map label → status row for fast lookup
  const byLabel = Object.fromEntries(statuses.map(s => [s.label, s]))
  const activeStatuses = statuses.filter(s => s.is_active)
  const defaultStatus = statuses.find(s => s.is_default)?.label || statuses[0]?.label || 'Not Started'

  return (
    <StatusesContext.Provider value={{ statuses, activeStatuses, byLabel, defaultStatus, loaded, refresh }}>
      {children}
    </StatusesContext.Provider>
  )
}

export function useStatuses() {
  const ctx = useContext(StatusesContext)
  if (!ctx) throw new Error('useStatuses must be inside StatusesProvider')
  return ctx
}
