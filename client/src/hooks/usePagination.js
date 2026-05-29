import { useState, useMemo } from 'react'

export function usePagination(data, pageSize = 25) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(data.length / pageSize))
  const paged = useMemo(
    () => data.slice((page - 1) * pageSize, page * pageSize),
    [data, page, pageSize]
  )
  const reset = () => setPage(1)
  return { paged, page, setPage, totalPages, reset }
}
