import { useState, useMemo } from 'react'

export function useSortable(data, defaultKey = null, defaultDir = 'asc') {
  const [sort, setSort] = useState({ key: defaultKey, dir: defaultDir })

  const sorted = useMemo(() => {
    if (!sort.key) return data
    return [...data].sort((a, b) => {
      const av = a[sort.key] ?? ''
      const bv = b[sort.key] ?? ''
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [data, sort])

  const toggle = key =>
    setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))

  const SortIcon = ({ colKey }) => {
    if (sort.key !== colKey) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-accent ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>
  }

  return { sorted, toggle, sort, SortIcon }
}
