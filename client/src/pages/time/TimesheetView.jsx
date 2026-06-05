import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '@heroicons/react/24/outline'
import { timeSummaryApi } from '../../api/timeSummary'
import { timeEntriesApi } from '../../api/timeEntries'
import { useAuth } from '../../context/AuthContext'

function fmtH(n) { return n ? Number(n).toFixed(2) : '' }
function colLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return { day: d.toLocaleDateString('en-US', { weekday: 'short' }), date: d.getDate() }
}
function isWeekend(dateStr) {
  const d = new Date(dateStr + 'T12:00:00').getDay()
  return d === 0 || d === 6
}

// Inline-editable cell
function HoursCell({ hours, onSave, disabled }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(fmtH(hours))
  const inputRef              = useRef(null)

  useEffect(() => { setVal(fmtH(hours)) }, [hours])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const commit = () => {
    setEditing(false)
    const num = parseFloat(val)
    const clean = isNaN(num) || num <= 0 ? 0 : Math.round(num * 4) / 4
    setVal(clean ? fmtH(clean) : '')
    if (clean !== (hours || 0)) onSave(clean)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setEditing(false); setVal(fmtH(hours)) }
        }}
        className="w-full text-center text-sm font-mono bg-accent/5 border border-accent rounded outline-none py-1"
        style={{ minWidth: 52 }}
      />
    )
  }

  return (
    <button
      disabled={disabled}
      onClick={() => !disabled && setEditing(true)}
      className={`w-full text-center text-sm font-mono py-1.5 rounded transition-colors
        ${hours ? 'text-gray-900 font-semibold' : 'text-gray-300'}
        ${!disabled ? 'hover:bg-accent/5 cursor-pointer' : 'cursor-default'}
      `}
    >
      {hours ? fmtH(hours) : <span className="opacity-30 group-hover:opacity-100">·</span>}
    </button>
  )
}

// Add Row Modal
function AddRowModal({ engagements, serviceCodes, onAdd, onClose }) {
  const [engId, setEngId]   = useState('')
  const [code,  setCode]    = useState('')
  const selCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-96">
        <h3 className="font-semibold text-gray-900 mb-4">Add Row to Timesheet</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Engagement</label>
            <select value={engId} onChange={e => setEngId(e.target.value)} className={selCls}>
              <option value="">Select engagement...</option>
              {engagements.map(e => (
                <option key={e.id} value={e.id}>{e.client_name} — {e.engagement_type}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Service Code</label>
            <select value={code} onChange={e => setCode(e.target.value)} className={selCls}>
              <option value="">No code</option>
              {serviceCodes.map(c => (
                <option key={c.id} value={c.code}>{c.number} — {c.code} — {c.description}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
          <button
            disabled={!engId}
            onClick={() => onAdd(parseInt(engId), code || null)}
            className="flex-1 py-2 text-sm font-semibold text-white bg-accent rounded-lg hover:bg-accent-dark disabled:opacity-50"
          >
            Add Row
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TimesheetView({ period, onPeriodChange, engagements, serviceCodes }) {
  const { user } = useAuth()
  const [grid, setGrid]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  // Extra rows added this session (engagement_id + service_code combos not yet in grid)
  const [extraRows, setExtraRows] = useState([])

  const loadGrid = useCallback(async () => {
    if (!period?.id) return
    setLoading(true)
    try { setGrid(await timeSummaryApi.myPeriod(period.id)) }
    finally { setLoading(false) }
  }, [period?.id])

  useEffect(() => { loadGrid(); setExtraRows([]) }, [loadGrid])

  if (!period) return <div className="p-8 text-gray-400 text-center">No pay period loaded.</div>
  if (loading) return <div className="p-8 text-gray-400 text-center">Loading timesheet…</div>

  const dates       = grid?.dates  || []
  const fetchedRows = grid?.rows   || []
  const colTotals   = grid?.colTotals || {}
  const grandTotal  = grid?.grandTotal || 0

  // Merge fetched rows + extra (blank) rows added this session
  const seen = new Set(fetchedRows.map(r => `${r.engagement_id}::${r.service_code || ''}`))
  const allRows = [
    ...fetchedRows,
    ...extraRows.filter(er => !seen.has(`${er.engagement_id}::${er.service_code || ''}`)),
  ]

  const handleCellSave = async (row, date, hours) => {
    const engagement_id = row.engagement_id
    const service_code  = row.service_code || null
    if (!engagement_id) return
    if (hours > 0) {
      await timeEntriesApi.create({
        engagement_id,
        date,
        hours,
        service_code,
        billable:     true,
        billing_rate: user?.default_hourly_rate || null,
        entry_status: 'draft',
      })
    }
    loadGrid()
  }

  const handleAddRow = (engId, code) => {
    const k = `${engId}::${code || ''}`
    if (!seen.has(k) && !extraRows.find(r => r.engagement_id === engId && r.service_code === (code || null))) {
      const eng = engagements.find(e => e.id === engId)
      const sc  = serviceCodes.find(c => c.code === code)
      setExtraRows(r => [...r, {
        engagement_id: engId, service_code: code || null,
        client_name: eng?.client_name || '?', engagement_type: eng?.engagement_type || '?',
        tax_year: eng?.tax_year,
        sc_number: sc?.number, sc_description: sc?.description,
        daily: {}, total: 0,
      }])
    }
    setShowAdd(false)
  }

  const rowLabel = row => {
    const engPart  = `${row.client_name} — ${row.engagement_type}${row.tax_year ? ` (${row.tax_year})` : ''}`
    const codePart = row.sc_number
      ? `${row.sc_number} — ${row.sc_description || row.service_code}`
      : row.service_code || ''
    return codePart ? `${engPart} · ${codePart}` : engPart
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Period navigation */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => onPeriodChange('prev')} className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex-1 text-center">
          <span className="text-sm font-semibold text-gray-800">
            Period {period.period_number}: {period.start_date} – {period.end_date}
          </span>
          <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium
            ${period.status === 'Released' ? 'bg-green-100 text-green-700' :
              period.status === 'Locked'   ? 'bg-red-100 text-red-700' :
              period.status === 'Submitted'? 'bg-yellow-100 text-yellow-700' :
                                             'bg-blue-100 text-blue-700'}`}>
            {period.status}
          </span>
        </div>
        <button onClick={() => onPeriodChange('current')} className="px-2.5 py-1.5 text-xs font-semibold text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors">
          Current
        </button>
        <button onClick={() => onPeriodChange('next')} className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <ChevronRightIcon className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {/* Spreadsheet grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto flex-1">
        <table className="border-collapse" style={{ minWidth: '100%' }}>
          <thead>
            <tr className="bg-gray-50">
              <th className="sticky left-0 z-10 bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5 border-b border-r border-gray-200 min-w-[280px]">
                Engagement / Code
              </th>
              {dates.map(d => {
                const { day, date } = colLabel(d)
                return (
                  <th key={d} className={`text-center text-xs font-medium px-1 py-2 border-b border-gray-200 min-w-[52px] ${isWeekend(d) ? 'bg-gray-100 text-gray-400' : 'text-gray-600'}`}>
                    <div className="font-semibold">{day}</div>
                    <div className="text-gray-400">{date}</div>
                  </th>
                )
              })}
              <th className="text-right text-xs font-semibold text-gray-700 uppercase tracking-wide px-3 py-2.5 border-b border-l border-gray-200 min-w-[64px] bg-gray-50">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {allRows.length === 0 && (
              <tr>
                <td colSpan={dates.length + 2} className="text-center py-8 text-gray-400 text-sm">
                  No time logged this period. Use "Add Row" to start.
                </td>
              </tr>
            )}
            {allRows.map(row => (
              <tr key={`${row.engagement_id}::${row.service_code || ''}`} className="group hover:bg-gray-50/50 transition-colors">
                <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50/50 text-sm font-medium text-gray-900 px-4 py-1.5 border-r border-gray-100 truncate max-w-[280px]" title={rowLabel(row)}>
                  {rowLabel(row)}
                </td>
                {dates.map(d => (
                  <td key={d} className={`text-center p-0.5 ${isWeekend(d) ? 'bg-gray-50' : ''}`}>
                    <HoursCell
                      hours={row.daily?.[d] || 0}
                      disabled={false}
                      onSave={h => handleCellSave(row, d, h)}
                    />
                  </td>
                ))}
                <td className="text-right text-sm font-bold font-mono text-gray-900 px-3 py-1.5 border-l border-gray-100 bg-gray-50/50">
                  {row.total ? fmtH(row.total) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-200">
              <td className="sticky left-0 z-10 bg-gray-50 text-xs font-bold text-gray-700 uppercase tracking-wide px-4 py-2.5 border-r border-gray-200">
                Daily Total
              </td>
              {dates.map(d => (
                <td key={d} className={`text-center text-sm font-bold font-mono text-gray-900 py-2.5 ${isWeekend(d) ? 'bg-gray-100' : ''}`}>
                  {colTotals[d] ? fmtH(colTotals[d]) : <span className="text-gray-300">—</span>}
                </td>
              ))}
              <td className="text-right text-sm font-bold font-mono text-accent px-3 py-2.5 border-l border-gray-200">
                {fmtH(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Add row + grand total */}
      <div className="mt-2 flex items-center justify-between">
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 text-sm text-accent font-medium hover:underline"
        >
          <PlusIcon className="w-4 h-4" /> Add Row
        </button>
        {grandTotal > 0 && (
          <p className="text-sm text-gray-500 ml-auto">
            Period total: <span className="font-bold font-mono text-gray-900">{fmtH(grandTotal)}h</span>
          </p>
        )}
      </div>

      {showAdd && (
        <AddRowModal
          engagements={engagements}
          serviceCodes={serviceCodes}
          onAdd={handleAddRow}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}
