import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardApi } from '../api/dashboard'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const TODAY = new Date().toISOString().split('T')[0]

function daysUntil(dateStr) {
  return Math.ceil((new Date(dateStr) - new Date(TODAY)) / 86400000)
}

function urgencyColor(days) {
  if (days < 0)   return { dot: 'bg-red-500',   badge: 'bg-red-50 text-red-700 border-red-200',    label: 'Overdue' }
  if (days <= 7)  return { dot: 'bg-red-500',   badge: 'bg-red-50 text-red-700 border-red-200',    label: `${days}d` }
  if (days <= 14) return { dot: 'bg-orange-400',badge: 'bg-orange-50 text-orange-700 border-orange-200', label: `${days}d` }
  if (days <= 30) return { dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700 border-amber-200',    label: `${days}d` }
  return           { dot: 'bg-emerald-400',badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',   label: `${days}d` }
}

function CalendarGrid({ year, month, engagements, taxDeadlines }) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []

  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const engByDate = {}
  engagements.forEach(e => {
    if (!e.due_date) return
    const [y, m, d] = e.due_date.split('-').map(Number)
    if (y === year && m - 1 === month) {
      engByDate[d] = engByDate[d] || []
      engByDate[d].push(e)
    }
  })

  const taxByDate = {}
  taxDeadlines.forEach(t => {
    if (t.month - 1 === month) {
      taxByDate[t.day] = taxByDate[t.day] || []
      taxByDate[t.day].push(t)
    }
  })

  const isToday = (d) => {
    const now = new Date()
    return now.getFullYear() === year && now.getMonth() === month && now.getDate() === d
  }

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-gray-200 mb-1">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-100">
        {cells.map((d, i) => (
          <div key={i} className={`min-h-[72px] p-1.5 bg-white ${d ? '' : 'opacity-0'}`}>
            {d && (
              <>
                <div className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1
                  ${isToday(d) ? 'bg-accent text-white' : 'text-gray-600'}`}>
                  {d}
                </div>
                {(engByDate[d] || []).slice(0, 2).map(e => {
                  const days = daysUntil(e.due_date)
                  const { dot } = urgencyColor(days)
                  return (
                    <div key={e.id} className="flex items-center gap-1 mb-0.5 truncate">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                      <span className="text-xs text-gray-600 truncate leading-tight">{e.client_name}</span>
                    </div>
                  )
                })}
                {(taxByDate[d] || []).map((t, ti) => (
                  <div key={ti} className="flex items-center gap-1 mb-0.5">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-purple-400" />
                    <span className="text-xs text-purple-600 truncate leading-tight">{t.form_types}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function DueDates() {
  const [data, setData]       = useState(null)
  const [taxDl, setTaxDl]     = useState([])
  const [view, setView]       = useState('list')
  const [days, setDays]       = useState(90)
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [calYear, setCalYear]  = useState(new Date().getFullYear())
  const navigate              = useNavigate()

  useEffect(() => {
    dashboardApi.stats().then(d => setData(d))
    fetch('/api/due-dates/tax-deadlines').then(r => r.json()).then(setTaxDl)
  }, [])

  if (!data) return <div className="p-8 text-gray-400">Loading...</div>

  const upcoming = (data.dueThisWeekDetail || [])
  const allEngagements = upcoming

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) }
    else setCalMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) }
    else setCalMonth(m => m + 1)
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Due Dates</h1>
        <div className="flex items-center gap-3">
          {view === 'list' && (
            <select value={days} onChange={e => setDays(Number(e.target.value))}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent">
              <option value={30}>Next 30 days</option>
              <option value={60}>Next 60 days</option>
              <option value={90}>Next 90 days</option>
            </select>
          )}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {['list','calendar'].map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${view === v ? 'bg-accent text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={`grid gap-6 ${view === 'list' ? 'grid-cols-3' : 'grid-cols-4'}`}>

        <div className={view === 'list' ? 'col-span-2' : 'col-span-3'}>
          {view === 'list' ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Overdue */}
              {(data.overdueEngagements || []).length > 0 && (
                <div className="border-b border-gray-200">
                  <div className="px-5 py-3 bg-red-50 border-b border-red-100">
                    <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">
                      Overdue ({data.overdueEngagements.length})
                    </span>
                  </div>
                  {data.overdueEngagements.slice(0, 10).map(e => {
                    const days = daysUntil(e.due_date)
                    const { badge } = urgencyColor(days)
                    return (
                      <div key={e.id} onClick={() => navigate(`/engagements/${e.id}`)}
                        className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{e.client_name}</p>
                          <p className="text-xs text-gray-400">{e.engagement_type} · {e.assigned_staff || 'Unassigned'}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-gray-500">{e.due_date}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${badge}`}>
                            {Math.abs(Math.floor(days))}d overdue
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {/* Upcoming */}
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Upcoming ({(data.dueThisWeekDetail || []).length})
                </span>
              </div>
              {(data.dueThisWeekDetail || []).length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-400">No engagements due in this period.</p>
              ) : (
                (data.dueThisWeekDetail || []).map(e => {
                  const d = daysUntil(e.due_date)
                  const { badge } = urgencyColor(d)
                  return (
                    <div key={e.id} onClick={() => navigate(`/engagements/${e.id}`)}
                      className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{e.client_name}</p>
                        <p className="text-xs text-gray-400">{e.engagement_type} · {e.assigned_staff || 'Unassigned'}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-gray-500">{e.due_date}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${badge}`}>{d}d</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <button onClick={prevMonth} className="text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">←</button>
                <span className="font-semibold text-gray-900">{MONTHS[calMonth]} {calYear}</span>
                <button onClick={nextMonth} className="text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100">→</button>
              </div>
              <div className="p-3">
                <CalendarGrid year={calYear} month={calMonth} engagements={data.dueThisWeekDetail || []} taxDeadlines={taxDl} />
              </div>
              <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Overdue / &lt;7d</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />&lt;14d</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />&lt;30d</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />&gt;30d</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />IRS Deadline</span>
              </div>
            </div>
          )}
        </div>

        {/* IRS Deadlines panel */}
        <div className="col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden sticky top-4">
            <div className="px-5 py-3.5 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 text-sm">IRS Deadlines</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {taxDl.map((t, i) => (
                <div key={i} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono text-xs font-semibold text-purple-600">
                      {MONTHS[t.month - 1]} {t.day}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">{t.form_types}</span>
                  </div>
                  <p className="text-xs text-gray-700">{t.description}</p>
                  <p className="text-xs text-gray-400">{t.applies_to}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
