import { useState, useMemo } from 'react'

export function useSortable(data, defaultKey = '', defaultDir = 'asc') {
  const [sortKey, setSortKey] = useState(defaultKey)
  const [sortDir, setSortDir] = useState(defaultDir)

  const toggle = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return data
    return [...data].sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, sortKey, sortDir])

  function SortIcon({ colKey }) {
    if (sortKey !== colKey) return <span className="ml-1 opacity-30 text-[10px]">↕</span>
    return <span className="ml-1 text-accent text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  return { sorted, toggle, SortIcon, sortKey, sortDir, setSortKey, setSortDir }
}
