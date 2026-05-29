import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { engagementsApi } from '../api/engagements'
import { staffApi } from '../api/staff'
import EngagementCard from '../components/EngagementCard'
import KanbanBoard from '../components/KanbanBoard'
import { useSortable } from '../hooks/useSortable'
import { usePagination } from '../hooks/usePagination'
import { StatusBadge, PriorityBadge } from '../components/Badge'

const STATUSES = ['Not Started', 'In Progress', 'In Review', 'Complete', 'On Hold']
const TYPES    = ['Tax Return', 'Bookkeeping', 'Audit', 'Advisory', 'Payroll', 'Other']

export default function Engagements() {
  const [engagements, setEngagements] = useState([])
  const [staff, setStaff]             = useState([])
  const [filters, setFilters]         = useState({ status: '', type: '', assigned_staff: '' })
  const [view, setView]               = useState('list')
  const [selected, setSelected]       = useState(new Set())
  const [bulkStatus, setBulkStatus]   = useState('')
  const [bulkStaff, setBulkStaff]     = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const navigate = useNavigate()

  const load = () => {
    const active = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
    engagementsApi.list(active).then(setEngagements)
    staffApi.list().then(setStaff)
  }

  useEffect(() => { load() }, [filters])

  const setFilter = k => e => setFilters(f => ({ ...f, [k]: e.target.value }))

  const { sorted, toggle, SortIcon } = useSortable(engagements, 'due_date', 'asc')
  const { paged, page, setPage, totalPages, reset } = usePagination(sorted, 25)

  const toggleSelect = id => {
    setSelected(s => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === paged.length) setSelected(new Set())
    else setSelected(new Set(paged.map(e => e.id)))
  }

  const applyBulk = async () => {
    if (!selected.size || (!bulkStatus && !bulkStaff)) return
    setBulkLoading(true)
    try {
      if (bulkStatus) await engagementsApi.bulk({ ids: [...selected], status: bulkStatus })
      if (bulkStaff)  await engagementsApi.bulk({ ids: [...selected], assigned_staff: bulkStaff })
      setSelected(new Set()); setBulkStatus(''); setBulkStaff('')
      load()
    } finally { setBulkLoading(false) }
  }

  const selectCls = 'border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-accent'

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Engagements</h1>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {['list', 'kanban'].map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${view === v ? 'bg-accent text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {v}
              </button>
            ))}
          </div>
          <button onClick={() => navigate('/engagements/new')}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            + New Engagement
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-6">
        <select value={filters.status} onChange={setFilter('status')} className={selectCls}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filters.type} onChange={setFilter('type')} className={selectCls}>
          <option value="">All Types</option>
          {TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={filters.assigned_staff} onChange={setFilter('assigned_staff')} className={selectCls}>
          <option value="">All Staff</option>
          {staff.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && view === 'list' && (
        <div className="flex items-center gap-3 mb-4 bg-accent/10 border border-accent/20 rounded-xl px-4 py-3">
          <span className="text-sm font-medium text-accent">{selected.size} selected</span>
          <div className="flex items-center gap-2 ml-2">
            <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)} className={selectCls + ' text-sm py-1.5'}>
              <option value="">Change Status…</option>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={bulkStaff} onChange={e => setBulkStaff(e.target.value)} className={selectCls + ' text-sm py-1.5'}>
              <option value="">Reassign To…</option>
              {staff.map(s => <option key={s}>{s}</option>)}
            </select>
            <button onClick={applyBulk} disabled={bulkLoading || (!bulkStatus && !bulkStaff)}
              className="px-4 py-1.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {bulkLoading ? 'Applying...' : 'Apply'}
            </button>
            <button onClick={() => setSelected(new Set())} className="text-sm text-gray-500 hover:text-gray-700 px-2">Clear</button>
          </div>
        </div>
      )}

      {view === 'kanban' ? (
        <KanbanBoard engagements={engagements} />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={paged.length > 0 && selected.size === paged.length}
                      onChange={toggleAll} className="rounded border-gray-300" />
                  </th>
                  {[
                    { key: 'client_name',     label: 'Client' },
                    { key: 'engagement_type', label: 'Type' },
                    { key: 'assigned_staff',  label: 'Staff' },
                    { key: 'due_date',        label: 'Due Date' },
                    { key: 'status',          label: 'Status' },
                    { key: 'priority',        label: 'Priority' },
                  ].map(col => (
                    <th key={col.key} onClick={() => toggle(col.key)}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700">
                      {col.label}<SortIcon colKey={col.key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paged.map(e => (
                  <tr key={e.id} className={`hover:bg-gray-50 cursor-pointer ${selected.has(e.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-3" onClick={ev => ev.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSelect(e.id)}
                        className="rounded border-gray-300" />
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900" onClick={() => navigate(`/engagements/${e.id}`)}>
                      {e.client_name}
                    </td>
                    <td className="px-4 py-3 text-gray-500" onClick={() => navigate(`/engagements/${e.id}`)}>
                      {e.engagement_type}
                    </td>
                    <td className="px-4 py-3 text-gray-500" onClick={() => navigate(`/engagements/${e.id}`)}>
                      {e.assigned_staff || '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-500" onClick={() => navigate(`/engagements/${e.id}`)}>
                      {e.due_date || '—'}
                    </td>
                    <td className="px-4 py-3" onClick={() => navigate(`/engagements/${e.id}`)}>
                      <StatusBadge status={e.status} />
                    </td>
                    <td className="px-4 py-3" onClick={() => navigate(`/engagements/${e.id}`)}>
                      <PriorityBadge priority={e.priority} />
                    </td>
                  </tr>
                ))}
                {paged.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                      No engagements match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-gray-400">{sorted.length} total · page {page} of {totalPages}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">←</button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    className={`px-3 py-1.5 text-sm border rounded-lg ${page === p ? 'bg-accent text-white border-accent' : 'border-gray-200 hover:bg-gray-50'}`}>
                    {p}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">→</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
