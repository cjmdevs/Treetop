import { useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, TrashIcon, PlayIcon } from '@heroicons/react/24/outline'
import { timeEntriesApi } from '../../api/timeEntries'
import { useTimer } from '../../context/TimerContext'

function fmt$(n) { return n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—' }
function fmtH(n) { return n != null ? `${Number(n).toFixed(2)}h` : '—' }

function prevDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]
}
function nextDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]
}
function displayDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

const thCls = 'py-2.5 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide'
const tdCls = 'py-2.5 px-3 text-sm text-gray-700'

export default function DailyGrid({ entries = [], selectedDate, onDateChange, onEdit, onRefresh, serviceCodes = [] }) {
  const [deleting, setDeleting] = useState(null)
  const { startTimer, timers }  = useTimer()

  const today = new Date().toISOString().split('T')[0]
  const dayEntries = entries.filter(e => e.date === selectedDate)

  // Build lookup: code → { number, description }
  const codeMap = Object.fromEntries(serviceCodes.map(c => [c.code, c]))

  const handleDelete = async id => {
    if (!confirm('Delete this time entry?')) return
    setDeleting(id)
    try { await timeEntriesApi.delete(id); onRefresh?.() }
    finally { setDeleting(null) }
  }

  const handleStartTimer = e => {
    startTimer(e.engagement_id, `${e.client_name} — ${e.engagement_type}`)
  }

  const billable    = dayEntries.filter(e => e.billable)
  const nonBillable = dayEntries.filter(e => !e.billable)
  const billHrs     = billable.reduce((s, e) => s + e.hours, 0)
  const billAmt     = billable.reduce((s, e) => s + e.hours * (e.billing_rate || 0), 0)
  const nonBillHrs  = nonBillable.reduce((s, e) => s + e.hours, 0)
  const totalHrs    = dayEntries.reduce((s, e) => s + e.hours, 0)

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Date navigation */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => onDateChange(prevDay(selectedDate))}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
        </button>
        <h2 className="text-sm font-semibold text-gray-800 flex-1">{displayDate(selectedDate)}</h2>
        <button
          onClick={() => onDateChange(nextDay(selectedDate))}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <ChevronRightIcon className="w-4 h-4 text-gray-600" />
        </button>
        {selectedDate !== today && (
          <button
            onClick={() => onDateChange(today)}
            className="px-3 py-1.5 text-xs font-semibold text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors"
          >
            Today
          </button>
        )}
      </div>

      {/* Entries table */}
      <div className="bg-white rounded-xl border border-gray-200 flex-1 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className={thCls}>Client</th>
                <th className={thCls}>Engagement</th>
                <th className={thCls}>Service Code</th>
                <th className={thCls + ' text-right'}>Hours</th>
                <th className={thCls + ' text-right'}>Rate</th>
                <th className={thCls + ' text-right'}>Amount</th>
                <th className={thCls}>Memo</th>
                <th className={thCls} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dayEntries.map(e => {
                const amount    = e.hours * (e.billing_rate || 0)
                const isRunning = timers.some(t => t.engagementId === e.engagement_id)
                const sc        = codeMap[e.service_code]
                const scLabel   = sc
                  ? `${sc.number} — ${sc.description}`
                  : e.service_code || null

                return (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors group">
                    <td className={tdCls + ' font-medium text-gray-900'}>{e.client_name}</td>
                    <td className={tdCls}>
                      <span className="text-gray-700">{e.engagement_type}</span>
                      {e.tax_year && <span className="text-gray-400 ml-1">({e.tax_year})</span>}
                    </td>
                    <td className={tdCls}>
                      {scLabel
                        ? <span className="text-xs text-gray-700 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{scLabel}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={tdCls + ' text-right font-mono font-semibold'}>{fmtH(e.hours)}</td>
                    <td className={tdCls + ' text-right font-mono text-gray-500'}>{e.billing_rate ? fmt$(e.billing_rate) : '—'}</td>
                    <td className={tdCls + ' text-right font-mono font-semibold text-gray-900'}>{e.billing_rate ? fmt$(amount) : '—'}</td>
                    <td className={tdCls + ' max-w-[200px]'}>
                      <div className="flex items-center gap-1.5">
                        {e.internal_memo ? (
                          <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded uppercase tracking-wide">Internal</span>
                        ) : null}
                        <span title={e.notes || ''} className="truncate text-gray-500 text-sm">
                          {e.notes || <span className="text-gray-300">—</span>}
                        </span>
                      </div>
                    </td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleStartTimer(e)}
                          disabled={isRunning}
                          title={isRunning ? 'Timer running' : 'Start timer'}
                          className="p-1 rounded hover:bg-accent/10 text-accent disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                        >
                          <PlayIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onEdit?.(e)}
                          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                        >
                          <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(e.id)}
                          disabled={deleting === e.id}
                          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {dayEntries.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">
              No time entries for {selectedDate}
            </div>
          )}
        </div>
      </div>

      {/* Daily summary bar */}
      <div className="mt-2 flex items-center gap-6 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm">
        <div>
          <span className="text-gray-500">Billable: </span>
          <span className="font-semibold text-gray-900 font-mono">{fmtH(billHrs)}</span>
          <span className="text-gray-400 font-mono ml-1">/ {fmt$(billAmt)}</span>
        </div>
        <div className="w-px h-4 bg-gray-300" />
        <div>
          <span className="text-gray-500">Non-Billable: </span>
          <span className="font-semibold text-gray-900 font-mono">{fmtH(nonBillHrs)}</span>
        </div>
        <div className="w-px h-4 bg-gray-300" />
        <div>
          <span className="text-gray-500">Total: </span>
          <span className="font-bold text-accent font-mono">{fmtH(totalHrs)}</span>
        </div>
      </div>
    </div>
  )
}
