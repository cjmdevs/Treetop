import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { projectsApi } from '../api/projects'
import { prefsApi } from '../api/userPreferences'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { PROJECT_STATUSES } from '../config/projectStatuses'
import {
  AdjustmentsHorizontalIcon,
  TableCellsIcon,
  ViewColumnsIcon,
  MagnifyingGlassIcon,
  BookmarkIcon,
  PlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { BookmarkIcon as BookmarkSolid } from '@heroicons/react/24/solid'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_STYLE = {
  'Not Started':     { bg: 'bg-gray-100',    text: 'text-gray-600',   dot: 'bg-gray-400',   border: 'border-t-gray-300' },
  'In Progress':     { bg: 'bg-blue-50',     text: 'text-blue-700',   dot: 'bg-blue-500',   border: 'border-t-blue-500' },
  'Awaiting Client': { bg: 'bg-amber-50',    text: 'text-amber-700',  dot: 'bg-amber-500',  border: 'border-t-amber-400' },
  'In Review':       { bg: 'bg-purple-50',   text: 'text-purple-700', dot: 'bg-purple-500', border: 'border-t-purple-500' },
  'Extension Filed': { bg: 'bg-orange-50',   text: 'text-orange-700', dot: 'bg-orange-500', border: 'border-t-orange-400' },
  'Completed':       { bg: 'bg-emerald-50',  text: 'text-emerald-700',dot: 'bg-emerald-500',border: 'border-t-emerald-500' },
  'Delivered':       { bg: 'bg-teal-50',     text: 'text-teal-700',   dot: 'bg-teal-500',   border: 'border-t-teal-500' },
}

const PRIORITY_STYLE = {
  Low:    'bg-gray-100 text-gray-500',
  Normal: 'bg-blue-50 text-blue-600',
  High:   'bg-red-100 text-red-600',
}

const PROJECT_TYPES = ['1040','1041','1065','1120','1120S','Bookkeeping','Audit','Advisory','Payroll','Other']
const ENTITY_TYPES  = ['Individual','SMLLC','LLC','S-Corp','C-Corp','Partnership','Trust','Non-Profit','Other']
const PRIORITIES    = ['Low','Normal','High']

const ALL_COLUMNS = [
  { key: 'period_label',    label: 'Period',           group: 'default' },
  { key: 'client_name',     label: 'Client',           group: 'default' },
  { key: 'project_type',    label: 'Project Type',     group: 'default' },
  { key: 'entity_type',     label: 'Entity Type',      group: 'default' },
  { key: 'status',          label: 'Status',           group: 'default' },
  { key: 'original_due',    label: 'Original Due',     group: 'default' },
  { key: 'current_due',     label: 'Current Due',      group: 'default' },
  { key: 'delivered_date',  label: 'Delivered',        group: 'default' },
  { key: 'in_charge',       label: 'In Charge',        group: 'default' },
  { key: 'client_number',   label: 'Client #',         group: 'default' },
  { key: 'engagement_number',label:'Eng #',            group: 'default' },
  { key: 'primary_partner', label: 'Primary Partner',  group: 'roles' },
  { key: 'manager',         label: 'Manager',          group: 'roles' },
  { key: 'preparer',        label: 'Preparer',         group: 'roles' },
  { key: 'reviewer',        label: 'Reviewer',         group: 'roles' },
  { key: 'start_date',      label: 'Start Date',       group: 'dates' },
  { key: 'completed_date',  label: 'Completed Date',   group: 'dates' },
  { key: 'fiscal_year_end', label: 'Fiscal Year End',  group: 'dates' },
  { key: 'budgeted_hours',  label: 'Budget Hours',     group: 'budget' },
  { key: 'budgeted_amount', label: 'Budget $',         group: 'budget' },
  { key: 'actual_hours',    label: 'Actual Hours',     group: 'budget' },
  { key: 'actual_amount',   label: 'Actual $',         group: 'budget' },
  { key: 'extended',        label: 'Extension Filed',  group: 'other' },
  { key: 'priority',        label: 'Priority',         group: 'other' },
]

const DEFAULT_COLS = ['period_label','client_name','project_type','entity_type','status','original_due','current_due','delivered_date','in_charge','client_number','engagement_number']

const TODAY = new Date().toISOString().split('T')[0]
const WEEK_END = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split('T')[0] })()

// ── Small shared components ───────────────────────────────────────────────────

function StatusBadge({ status, small }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE['Not Started']
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ${s.bg} ${s.text} ${small ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'}`}>
      <span className={`rounded-full flex-shrink-0 ${s.dot} ${small ? 'w-1.5 h-1.5' : 'w-2 h-2'}`} />
      {status}
    </span>
  )
}

function Initials({ name, size = 'sm' }) {
  if (!name) return null
  const parts = name.trim().split(/\s+/)
  const ini = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name[0]
  const sz = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'
  return (
    <div className={`${sz} rounded-full bg-accent/10 text-accent font-semibold flex items-center justify-center flex-shrink-0`}>
      {ini.toUpperCase()}
    </div>
  )
}

function isOverdue(project) {
  return project.current_due && project.current_due < TODAY &&
    project.status !== 'Completed' && project.status !== 'Delivered'
}

function DueDate({ date, project }) {
  if (!date) return <span className="text-gray-400">—</span>
  const over = isOverdue(project)
  return (
    <span className={`font-mono text-xs flex items-center gap-1 ${over && date === project.current_due ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
      {over && date === project.current_due && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
      {date}
    </span>
  )
}

function PriorityBadge({ priority }) {
  if (!priority || priority === 'Normal') return null
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${PRIORITY_STYLE[priority] || ''}`}>
      {priority}
    </span>
  )
}

function renderCell(key, project) {
  switch (key) {
    case 'status':        return <StatusBadge status={project.status} small />
    case 'original_due':  return <DueDate date={project.original_due} project={project} />
    case 'current_due':   return <DueDate date={project.current_due} project={project} />
    case 'delivered_date':return project.delivered_date ? <span className="font-mono text-xs text-gray-600">{project.delivered_date}</span> : <span className="text-gray-300">—</span>
    case 'start_date':    return project.start_date ? <span className="font-mono text-xs text-gray-600">{project.start_date}</span> : <span className="text-gray-300">—</span>
    case 'completed_date':return project.completed_date ? <span className="font-mono text-xs text-gray-600">{project.completed_date}</span> : <span className="text-gray-300">—</span>
    case 'fiscal_year_end':return project.fiscal_year_end ? <span className="font-mono text-xs text-gray-600">{project.fiscal_year_end}</span> : <span className="text-gray-300">—</span>
    case 'budgeted_hours':return project.budgeted_hours ? <span className="font-mono text-xs text-gray-700">{project.budgeted_hours}h</span> : <span className="text-gray-300">—</span>
    case 'actual_hours':  return project.actual_hours ? <span className="font-mono text-xs text-gray-700">{Number(project.actual_hours).toFixed(1)}h</span> : <span className="text-gray-300">—</span>
    case 'budgeted_amount':return project.budgeted_amount ? <span className="font-mono text-xs text-gray-700">${project.budgeted_amount.toLocaleString()}</span> : <span className="text-gray-300">—</span>
    case 'actual_amount': return project.actual_amount ? <span className="font-mono text-xs text-gray-700">${Number(project.actual_amount).toLocaleString()}</span> : <span className="text-gray-300">—</span>
    case 'extended':      return project.extended ? <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded font-medium">EXT</span> : <span className="text-gray-300">—</span>
    case 'priority':      return <PriorityBadge priority={project.priority} />
    case 'client_name':   return <span className="font-medium text-gray-900 text-sm">{project.client_name}</span>
    case 'period_label':  return <span className="font-mono text-xs font-semibold text-gray-700">{project.period_label || '—'}</span>
    case 'in_charge':     return project.in_charge ? <div className="flex items-center gap-1.5"><Initials name={project.in_charge} /><span className="text-xs text-gray-600">{project.in_charge.split(' ')[0]}</span></div> : <span className="text-gray-300">—</span>
    default:              return <span className="text-xs text-gray-600">{project[key] || <span className="text-gray-300">—</span>}</span>
  }
}

// ── Column Customizer Modal ───────────────────────────────────────────────────

function ColumnCustomizer({ selected, onChange, onClose }) {
  const [avail, setAvail] = useState(ALL_COLUMNS.filter(c => !selected.includes(c.key)))
  const [sel, setSel] = useState(ALL_COLUMNS.filter(c => selected.includes(c.key)).sort((a, b) => selected.indexOf(a.key) - selected.indexOf(b.key)))
  const [availSearch, setAvailSearch] = useState('')
  const [highlightAvail, setHighlightAvail] = useState(null)
  const [highlightSel, setHighlightSel] = useState(null)
  const dragRef = useRef(null)

  const filteredAvail = avail.filter(c => c.label.toLowerCase().includes(availSearch.toLowerCase()))

  const addCol = (col) => {
    setAvail(a => a.filter(c => c.key !== col.key))
    setSel(s => [...s, col])
    setHighlightSel(col.key)
    setHighlightAvail(null)
  }

  const removeCol = (col) => {
    setSel(s => s.filter(c => c.key !== col.key))
    setAvail(a => {
      const next = [...a, col]
      return ALL_COLUMNS.filter(c => next.some(n => n.key === c.key))
    })
    setHighlightAvail(col.key)
    setHighlightSel(null)
  }

  const moveUp = (idx) => {
    if (idx === 0) return
    setSel(s => { const n = [...s]; [n[idx-1], n[idx]] = [n[idx], n[idx-1]]; return n })
    setHighlightSel(sel[idx].key)
  }

  const moveDown = (idx) => {
    if (idx === sel.length - 1) return
    setSel(s => { const n = [...s]; [n[idx], n[idx+1]] = [n[idx+1], n[idx]]; return n })
    setHighlightSel(sel[idx].key)
  }

  const resetDefault = () => {
    setSel(ALL_COLUMNS.filter(c => DEFAULT_COLS.includes(c.key)).sort((a,b) => DEFAULT_COLS.indexOf(a.key) - DEFAULT_COLS.indexOf(b.key)))
    setAvail(ALL_COLUMNS.filter(c => !DEFAULT_COLS.includes(c.key)))
  }

  const apply = () => { onChange(sel.map(c => c.key)); onClose() }

  // Drag reorder in selected list
  const onDragStart = (idx) => { dragRef.current = idx }
  const onDragOver = (e, idx) => { e.preventDefault() }
  const onDrop = (idx) => {
    const from = dragRef.current
    if (from === idx || from === null) return
    setSel(s => {
      const n = [...s]
      const [item] = n.splice(from, 1)
      n.splice(idx, 0, item)
      return n
    })
    dragRef.current = null
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Column Setup</h2>
            <p className="text-xs text-gray-400 mt-0.5">Drag to reorder • Double-click to toggle</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={resetDefault} className="text-xs text-gray-400 hover:text-gray-600 underline">Reset to default</button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XMarkIcon className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-0 divide-x divide-gray-100">
          {/* Available */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <MagnifyingGlassIcon className="w-3.5 h-3.5 text-gray-400" />
              <input
                value={availSearch}
                onChange={e => setAvailSearch(e.target.value)}
                placeholder="Search columns..."
                className="flex-1 text-xs outline-none text-gray-700 placeholder-gray-300"
              />
            </div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Available ({filteredAvail.length})</p>
            <div className="space-y-0.5 max-h-72 overflow-y-auto">
              {filteredAvail.map(col => (
                <button
                  key={col.key}
                  onDoubleClick={() => addCol(col)}
                  onClick={() => setHighlightAvail(col.key)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${highlightAvail === col.key ? 'bg-accent/10 text-accent' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  {col.label}
                  <span className="ml-2 text-xs text-gray-300 capitalize">{col.group}</span>
                </button>
              ))}
              {filteredAvail.length === 0 && <p className="text-xs text-gray-300 px-3 py-4">All columns selected</p>}
            </div>
          </div>

          {/* Selected */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-3 h-6">
              {highlightAvail && (
                <button onClick={() => { const c = avail.find(c => c.key === highlightAvail); if(c) addCol(c) }}
                  className="text-xs text-accent hover:text-blue-700 font-medium">→ Add</button>
              )}
              {highlightSel && (
                <button onClick={() => { const c = sel.find(c => c.key === highlightSel); if(c) removeCol(c) }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium ml-auto">← Remove</button>
              )}
            </div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Selected ({sel.length})</p>
            <div className="space-y-0.5 max-h-72 overflow-y-auto">
              {sel.map((col, idx) => (
                <div
                  key={col.key}
                  draggable
                  onDragStart={() => onDragStart(idx)}
                  onDragOver={e => onDragOver(e, idx)}
                  onDrop={() => onDrop(idx)}
                  onDoubleClick={() => removeCol(col)}
                  onClick={() => setHighlightSel(col.key)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm cursor-grab active:cursor-grabbing transition-colors ${highlightSel === col.key ? 'bg-accent/10 text-accent' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  <span className="text-gray-300 text-xs">⠿</span>
                  <span className="flex-1">{col.label}</span>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                    <button onClick={e => { e.stopPropagation(); moveUp(idx) }} className="p-0.5 hover:text-accent disabled:opacity-30" disabled={idx === 0}>↑</button>
                    <button onClick={e => { e.stopPropagation(); moveDown(idx) }} className="p-0.5 hover:text-accent disabled:opacity-30" disabled={idx === sel.length - 1}>↓</button>
                  </div>
                </div>
              ))}
              {sel.length === 0 && <p className="text-xs text-gray-300 px-3 py-4">No columns selected</p>}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button onClick={apply} className="px-5 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700">Apply</button>
        </div>
      </div>
    </div>
  )
}

// ── Board Card ────────────────────────────────────────────────────────────────

function BoardCard({ project, onDragStart, onClick }) {
  const over = isOverdue(project)
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(project.id) }}
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-xl p-3 cursor-pointer hover:shadow-sm hover:border-gray-300 transition-all select-none group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{project.client_name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {project.project_type}{project.entity_type ? ` · ${project.entity_type}` : ''}
          </p>
        </div>
        {project.priority === 'High' && (
          <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 mt-1" title="High priority" />
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className={`font-mono text-xs flex items-center gap-1 ${over ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
            {over && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
            {project.current_due || '—'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-gray-300">{project.period_label}</span>
          {project.in_charge && <Initials name={project.in_charge} />}
        </div>
      </div>
    </div>
  )
}

// ── Board View ────────────────────────────────────────────────────────────────

function BoardView({ projects, onStatusChange, navigate }) {
  const [dragging, setDragging] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  const byStatus = useMemo(() =>
    Object.fromEntries(PROJECT_STATUSES.map(s => [s.key, projects.filter(p => p.status === s.key)])),
    [projects]
  )

  const handleDrop = (e, status) => {
    e.preventDefault()
    setDragOver(null)
    if (dragging && dragging !== status) {
      onStatusChange(dragging, status)
    }
    setDragging(null)
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-6 min-h-[600px]">
      {PROJECT_STATUSES.map(({ key: status }) => {
        const style = STATUS_STYLE[status] || STATUS_STYLE['Not Started']
        const cards = byStatus[status] || []
        const isDragOver = dragOver === status
        return (
          <div
            key={status}
            className="flex-shrink-0 w-64"
            onDragOver={e => { e.preventDefault(); setDragOver(status) }}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => handleDrop(e, status)}
          >
            <div className={`border-t-2 ${style.border} rounded-xl overflow-hidden h-full flex flex-col transition-all ${isDragOver ? 'ring-2 ring-accent/30 bg-accent/5' : 'bg-gray-50'}`}>
              <div className="px-3 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                  <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{status}</h3>
                </div>
                <span className="text-xs font-mono text-gray-400">{cards.length}</span>
              </div>
              <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                {cards.map(p => (
                  <BoardCard
                    key={p.id}
                    project={p}
                    onDragStart={setDragging}
                    onClick={() => navigate(`/projects/${p.id}`)}
                  />
                ))}
                {cards.length === 0 && (
                  <div className={`flex items-center justify-center h-20 rounded-xl border-2 border-dashed transition-colors ${isDragOver ? 'border-accent/40 bg-accent/5' : 'border-gray-200'}`}>
                    <p className="text-xs text-gray-300">Drop here</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Grid View ─────────────────────────────────────────────────────────────────

function GridView({ projects, selectedCols, navigate }) {
  const [sortKey, setSortKey] = useState('original_due')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50

  const sorted = useMemo(() => {
    if (!sortKey) return projects
    return [...projects].sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [projects, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const cols = ALL_COLUMNS.filter(c => selectedCols.includes(c.key))
    .sort((a, b) => selectedCols.indexOf(a.key) - selectedCols.indexOf(b.key))

  const SortIndicator = ({ colKey }) => {
    if (sortKey !== colKey) return <span className="ml-1 opacity-20 text-[9px]">↕</span>
    return <span className="ml-1 text-accent text-[9px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {cols.map(col => (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none whitespace-nowrap"
                  >
                    {col.label}<SortIndicator colKey={col.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paged.map(p => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  className={`cursor-pointer transition-colors hover:bg-blue-50/30 ${isOverdue(p) ? 'bg-red-50/20' : ''}`}
                >
                  {cols.map(col => (
                    <td key={col.key} className="px-3 py-2 whitespace-nowrap">
                      {renderCell(col.key, p)}
                    </td>
                  ))}
                </tr>
              ))}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={cols.length} className="px-4 py-16 text-center text-gray-400">
                    <ExclamationCircleIcon className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                    No projects match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <div className="flex items-center gap-3">
          <span className="font-medium">Projects Listed: {sorted.length}</span>
          {sorted.filter(isOverdue).length > 0 && (
            <span className="flex items-center gap-1 text-red-600">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {sorted.filter(isOverdue).length} overdue
            </span>
          )}
          {sorted.filter(p => p.current_due && p.current_due >= TODAY && p.current_due <= WEEK_END && !['Completed','Delivered'].includes(p.status)).length > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              {sorted.filter(p => p.current_due && p.current_due >= TODAY && p.current_due <= WEEK_END && !['Completed','Delivered'].includes(p.status)).length} due this week
            </span>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50">
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 text-sm text-gray-600">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1.5 border border-gray-200 rounded-lg disabled:opacity-30 hover:bg-gray-50">
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Projects Page ────────────────────────────────────────────────────────

const EMPTY_FILTERS = {
  client_name: '', project_type: '', entity_type: '', status: '', primary_partner: '',
  manager: '', preparer: '', reviewer: '', in_charge: '', priority: '',
  due_from: '', due_to: '',
}

export default function Projects() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [projects, setProjects]           = useState([])
  const [loading, setLoading]             = useState(true)
  const [view, setView]                   = useState('grid')
  const [filters, setFilters]             = useState(EMPTY_FILTERS)
  const [showCompleted, setShowCompleted] = useState(false)
  const [showDelivered, setShowDelivered] = useState(false)
  const [showRelated, setShowRelated]     = useState(false)
  const [selectedCols, setSelectedCols]   = useState(DEFAULT_COLS)
  const [showColConfig, setShowColConfig] = useState(false)
  const [showFilters, setShowFilters]     = useState(true)
  const [savedViews, setSavedViews]       = useState([])
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [newViewName, setNewViewName]     = useState('')
  const prefsLoaded = useRef(false)

  // Load per-user column pref from server
  useEffect(() => {
    if (!user?.id || prefsLoaded.current) return
    prefsLoaded.current = true
    prefsApi.get('projects_columns').then(r => { if (r.value) setSelectedCols(r.value) }).catch(() => {})
    prefsApi.get('projects_saved_views').then(r => { if (r.value) setSavedViews(r.value) }).catch(() => {})
  }, [user?.id])

  const saveColPref = (cols) => {
    setSelectedCols(cols)
    prefsApi.set('projects_columns', cols).catch(() => {})
  }

  const saveSavedViews = (views) => {
    setSavedViews(views)
    prefsApi.set('projects_saved_views', views).catch(() => {})
  }

  // For staff, inject their own name as default role filter
  const effectiveFilters = useMemo(() => {
    if (user?.role !== 'staff') return filters
    // If staff hasn't set any role filter, default to showing their projects
    const hasRoleFilter = filters.preparer || filters.reviewer || filters.in_charge
    if (hasRoleFilter) return filters
    return { ...filters, _staff_name: user.full_name }
  }, [filters, user])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
        show_completed: showCompleted ? 'true' : 'false',
        show_delivered: showDelivered ? 'true' : 'false',
        ...(showRelated && filters.client_name ? { show_related: 'true' } : {}),
      }
      // Staff: fetch by each of their roles and merge
      if (user?.role === 'staff') {
        const hasRoleFilter = filters.preparer || filters.reviewer || filters.in_charge
        if (!hasRoleFilter) {
          const [p, r, i] = await Promise.all([
            projectsApi.list({ ...params, preparer: user.full_name }),
            projectsApi.list({ ...params, reviewer: user.full_name }),
            projectsApi.list({ ...params, in_charge: user.full_name }),
          ])
          const seen = new Set()
          const merged = [...p, ...r, ...i].filter(pr => { if (seen.has(pr.id)) return false; seen.add(pr.id); return true })
          setProjects(merged)
          return
        }
      }
      const data = await projectsApi.list(params)
      setProjects(data)
    } catch {
      toast.error('Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [filters, showCompleted, showDelivered, showRelated, user])

  useEffect(() => { load() }, [load])

  const setFilter = (k) => (e) => setFilters(f => ({ ...f, [k]: e.target.value }))
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setShowRelated(false) }
  const hasActiveFilters = Object.values(filters).some(v => v)

  const handleStatusChange = async (projectId, newStatus) => {
    // Optimistic update
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: newStatus } : p))
    try {
      await projectsApi.setStatus(projectId, newStatus)
      toast.success(`Status updated`)
    } catch {
      toast.error('Failed to update status')
      load()
    }
  }

  const saveView = () => {
    if (!newViewName.trim()) return
    const view = {
      id: Date.now(),
      name: newViewName.trim(),
      filters,
      showCompleted,
      showDelivered,
    }
    const next = [...savedViews, view]
    saveSavedViews(next)
    setNewViewName('')
    setShowSaveModal(false)
    toast.success('View saved')
  }

  const loadView = (sv) => {
    setFilters(sv.filters || EMPTY_FILTERS)
    setShowCompleted(sv.showCompleted || false)
    setShowDelivered(sv.showDelivered || false)
  }

  const deleteView = (id) => {
    saveSavedViews(savedViews.filter(v => v.id !== id))
  }

  const selectCls = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-accent'
  const inputCls  = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-accent'

  const staffNames = ['Marcus Maurer','Sofia Graf','Diego Rivera','Carson']

  return (
    <div className="flex flex-col h-full">
      {/* ─ Page header ─ */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Projects</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {loading ? 'Loading…' : `${projects.length} projects · ${projects.filter(isOverdue).length} overdue`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Saved views dropdown */}
            {savedViews.length > 0 && (
              <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden">
                {savedViews.map(sv => (
                  <div key={sv.id} className="group relative flex items-center">
                    <button onClick={() => loadView(sv)} className="px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 flex items-center gap-1.5">
                      <BookmarkSolid className="w-3 h-3 text-amber-400" />{sv.name}
                    </button>
                    <button onClick={() => deleteView(sv.id)} className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 pr-1.5 text-gray-300 hover:text-red-400 text-xs">×</button>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setShowSaveModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
              <BookmarkIcon className="w-3.5 h-3.5" /> Save View
            </button>

            {/* View toggle */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button onClick={() => setView('grid')}
                className={`p-2 transition-colors ${view === 'grid' ? 'bg-accent text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                title="Grid view">
                <TableCellsIcon className="w-4 h-4" />
              </button>
              <button onClick={() => setView('board')}
                className={`p-2 transition-colors ${view === 'board' ? 'bg-accent text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                title="Board view">
                <ViewColumnsIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Column config (grid only) */}
            {view === 'grid' && (
              <button onClick={() => setShowColConfig(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                <AdjustmentsHorizontalIcon className="w-4 h-4" /> Columns
              </button>
            )}

            <button onClick={() => navigate('/projects/new')}
              className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              <PlusIcon className="w-4 h-4" /> New Project
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mt-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                value={filters.client_name}
                onChange={setFilter('client_name')}
                placeholder="Search client…"
                className={inputCls + ' pl-7 w-44'}
              />
            </div>

            <select value={filters.project_type} onChange={setFilter('project_type')} className={selectCls}>
              <option value="">All Types</option>
              {PROJECT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <select value={filters.entity_type} onChange={setFilter('entity_type')} className={selectCls}>
              <option value="">All Entities</option>
              {ENTITY_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <select value={filters.status} onChange={setFilter('status')} className={selectCls}>
              <option value="">All Statuses</option>
              {PROJECT_STATUSES.map(s => <option key={s.key}>{s.key}</option>)}
            </select>
            <select value={filters.in_charge} onChange={setFilter('in_charge')} className={selectCls}>
              <option value="">All In-Charge</option>
              {staffNames.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={filters.preparer} onChange={setFilter('preparer')} className={selectCls}>
              <option value="">All Preparers</option>
              {staffNames.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={filters.priority} onChange={setFilter('priority')} className={selectCls}>
              <option value="">All Priorities</option>
              {PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </select>

            <div className="flex items-center gap-1 ml-1">
              <span className="text-xs text-gray-400">Due:</span>
              <input type="date" value={filters.due_from} onChange={setFilter('due_from')} className={inputCls} />
              <span className="text-xs text-gray-300">–</span>
              <input type="date" value={filters.due_to} onChange={setFilter('due_to')} className={inputCls} />
            </div>

            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={showCompleted} onChange={e => setShowCompleted(e.target.checked)} className="rounded border-gray-300 accent-accent" />
              Show Completed
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={showDelivered} onChange={e => setShowDelivered(e.target.checked)} className="rounded border-gray-300 accent-accent" />
              Show Delivered
            </label>

            <label className={`flex items-center gap-1.5 text-xs cursor-pointer select-none ${filters.client_name ? 'text-gray-600' : 'text-gray-300 cursor-not-allowed'}`}>
              <input
                type="checkbox"
                checked={showRelated}
                disabled={!filters.client_name}
                onChange={e => setShowRelated(e.target.checked)}
                className="rounded border-gray-300 accent-accent"
              />
              Show all related
            </label>

            {hasActiveFilters && (
              <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700">
                <XMarkIcon className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─ Content ─ */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400">Loading projects…</div>
        ) : view === 'board' ? (
          <BoardView projects={projects} onStatusChange={handleStatusChange} navigate={navigate} />
        ) : (
          <GridView projects={projects} selectedCols={selectedCols} navigate={navigate} />
        )}
      </div>

      {/* ─ Column customizer modal ─ */}
      {showColConfig && (
        <ColumnCustomizer
          selected={selectedCols}
          onChange={saveColPref}
          onClose={() => setShowColConfig(false)}
        />
      )}

      {/* ─ Save view modal ─ */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-80 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Save Current View</h3>
            <input
              autoFocus
              value={newViewName}
              onChange={e => setNewViewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveView()}
              placeholder="View name…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowSaveModal(false)} className="flex-1 px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={saveView} className="flex-1 px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
