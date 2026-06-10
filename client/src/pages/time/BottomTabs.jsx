import { useEffect, useState } from 'react'
import { timeSummaryApi } from '../../api/timeSummary'
import { releasesApi }    from '../../api/releases'
import { payPeriodsApi }  from '../../api/payPeriods'
import { usersApi }       from '../../api/users'
import { useAuth }        from '../../context/AuthContext'
import { useToast }       from '../../context/ToastContext'

const ALL_TABS = [
  { id: 'mtd',     label: 'MTD Hours' },
  { id: 'period',  label: 'Period Summary', adminOnly: true },
  { id: 'release', label: 'Time Release' },
  { id: 'alerts',  label: 'Alerts',          adminOnly: true },
]

function fmtH(n) { return n != null ? `${Number(n).toFixed(2)}h` : '—' }
function fmt$(n) { return n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—' }

// ── Mini CSS bar chart ────────────────────────────────────────────────────────
function MiniBarChart({ daily, dates }) {
  const values = dates.map(d => daily[d] || 0)
  const maxVal  = Math.max(...values, 8)
  const isWknd  = d => { const day = new Date(d + 'T12:00:00').getDay(); return day === 0 || day === 6 }

  return (
    <div className="flex items-end gap-px" style={{ height: 52 }}>
      {dates.map((d, i) => {
        const h   = values[i]
        const pct = (h / maxVal) * 100
        const wknd = isWknd(d)
        return (
          <div key={d} className="flex flex-col items-center flex-1 min-w-0 group relative">
            <div
              className={`w-full rounded-t transition-all ${
                h === 0 ? 'bg-gray-100' : wknd ? 'bg-blue-200' : 'bg-accent/70 group-hover:bg-accent'
              }`}
              style={{ height: `${Math.max(pct, h > 0 ? 8 : 2)}%` }}
            />
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
              {new Date(d + 'T12:00:00').getDate()}: {h.toFixed(1)}h
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Category color map ────────────────────────────────────────────────────────
const CAT_COLORS = {
  Tax:           'bg-blue-50 text-blue-700',
  Audit:         'bg-purple-50 text-purple-700',
  Bookkeeping:   'bg-teal-50 text-teal-700',
  Advisory:      'bg-amber-50 text-amber-700',
  Admin:         'bg-gray-100 text-gray-600',
  Other:         'bg-gray-100 text-gray-500',
  Uncategorized: 'bg-gray-100 text-gray-400',
}

// ── MTD Hours ─────────────────────────────────────────────────────────────────
function MtdTab() {
  const { user } = useAuth()
  const currentStaff = user?.full_name
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    timeSummaryApi.mtd(currentStaff || undefined)
      .then(setData)
      .finally(() => setLoading(false))
  }, [currentStaff])

  if (loading) return <p className="text-gray-400 text-sm py-4">Loading…</p>
  if (!data)   return <p className="text-gray-400 text-sm py-4">No data.</p>

  const totalHrs = data.totals?.total_hours || 0

  return (
    <div className="py-2 space-y-3">
      {/* Summary header */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="text-gray-500">
          {data.period.start} – {data.period.end}
        </span>
        <span className="text-gray-500">
          Total: <span className="font-bold font-mono text-accent">{fmtH(data.totals?.total_hours)}</span>
        </span>
        <span className="text-gray-500">
          Billable: <span className="font-mono text-green-700">{fmtH(data.totals?.billable_hours)}</span>
        </span>
        <span className="text-gray-500">
          Non-Bill: <span className="font-mono text-gray-600">{fmtH(data.totals?.nonbillable_hours)}</span>
        </span>
        <span className="text-gray-500">
          Billable $: <span className="font-mono font-semibold text-gray-800">{fmt$(data.totals?.billable_amount)}</span>
        </span>
      </div>

      {/* By category */}
      {data.byCategory.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">By Category</h4>
          <div className="space-y-2">
            {data.byCategory.map(r => {
              const catPct = totalHrs > 0 ? Math.round((r.total_hours / totalHrs) * 100) : 0
              return (
                <div key={r.category} className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold w-20 text-center flex-shrink-0 ${CAT_COLORS[r.category] || CAT_COLORS.Uncategorized}`}>
                    {r.category}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden min-w-0">
                    <div className="h-1.5 bg-accent/60 rounded-full transition-all" style={{ width: `${catPct}%` }} />
                  </div>
                  <span className="text-xs font-mono text-gray-700 w-10 text-right">{fmtH(r.total_hours)}</span>
                  <span className="text-xs font-mono text-gray-400 w-14 text-right">{fmt$(r.billable_amount)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Period Summary ────────────────────────────────────────────────────────────
function PeriodSummaryTab({ period }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    if (period?.id) timeSummaryApi.period(period.id).then(setData)
  }, [period?.id])

  if (!period) return <p className="text-gray-400 text-sm py-4">No current period.</p>
  if (!data)   return <p className="text-gray-400 text-sm py-4">Loading…</p>

  const pt = data.periodTotals || {}

  return (
    <div className="py-2 space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span className="font-semibold text-gray-800">
          Period {data.period.period_number}: {data.period.start_date} – {data.period.end_date}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          data.period.status === 'Released'  ? 'bg-green-100 text-green-700' :
          data.period.status === 'Locked'    ? 'bg-red-100 text-red-700' :
          data.period.status === 'Submitted' ? 'bg-yellow-100 text-yellow-700' :
                                               'bg-blue-100 text-blue-700'}`}>
          {data.period.status}
        </span>
        <span className="text-gray-500">
          Total: <span className="font-bold font-mono text-accent">{fmtH(pt.total_hours)}</span>
        </span>
        <span className="text-gray-500">
          Billable: <span className="font-mono text-green-700">{fmtH(pt.billable_hours)}</span>
        </span>
        <span className="text-gray-500">
          Non-Bill: <span className="font-mono text-gray-600">{fmtH(pt.nonbillable_hours)}</span>
        </span>
        <span className="text-gray-500">
          Amt: <span className="font-mono font-semibold text-gray-800">{fmt$(pt.billable_amount)}</span>
        </span>
      </div>

      {/* Daily bar chart */}
      {data.dates.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Daily Hours</h4>
          <MiniBarChart daily={data.colTotals} dates={data.dates} />
          <div className="flex gap-px mt-0.5">
            {data.dates.map((d, i) => (
              <div key={d} className="flex-1 text-center text-[9px] text-gray-400 leading-none">
                {i % 2 === 0 ? new Date(d + 'T12:00:00').getDate() : ''}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Staff grid */}
      {data.staffRows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-1.5 border border-gray-200 min-w-[130px]">Staff</th>
                {data.dates.map(d => (
                  <th key={d} className="text-center text-xs font-medium text-gray-500 px-1 py-1.5 border border-gray-200 min-w-[34px]">
                    {new Date(d + 'T12:00:00').getDate()}
                  </th>
                ))}
                <th className="text-right text-xs font-semibold text-gray-700 px-3 py-1.5 border border-gray-200">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.staffRows.map(r => (
                <tr key={r.staff_member} className="hover:bg-gray-50">
                  <td className="text-sm font-medium text-gray-900 px-3 py-1.5 border border-gray-200">{r.staff_member}</td>
                  {data.dates.map(d => (
                    <td key={d} className="text-center text-sm font-mono px-1 py-1.5 border border-gray-200">
                      {r.daily[d]
                        ? <span className="text-gray-800">{Number(r.daily[d]).toFixed(1)}</span>
                        : <span className="text-gray-200">—</span>}
                    </td>
                  ))}
                  <td className="text-right font-bold font-mono text-accent px-3 py-1.5 border border-gray-200">
                    {Number(r.total).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-gray-400 text-sm">No time logged this period.</p>
      )}
    </div>
  )
}

// ── Time Release ──────────────────────────────────────────────────────────────
function TimeReleaseTab() {
  const { user, isAdmin } = useAuth()
  const toast             = useToast()

  const today      = new Date().toISOString().split('T')[0]
  const monthStart = today.slice(0, 8) + '01'

  const [startDate,  setStartDate]  = useState(monthStart)
  const [endDate,    setEndDate]    = useState(today)
  const [preview,    setPreview]    = useState(null)
  const [releases,   setReleases]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [previewing, setPreviewing] = useState(false)
  const [releasing,  setReleasing]  = useState(false)

  // ── Admin: release a specific user's time by date range ─────────────────
  const [staffUsers,      setStaffUsers]      = useState([])
  const [adminUserId,     setAdminUserId]      = useState('')
  const [adminStartDate,  setAdminStartDate]  = useState(monthStart)
  const [adminEndDate,    setAdminEndDate]    = useState(today)
  const [adminReleasing,  setAdminReleasing]  = useState(false)

  useEffect(() => {
    if (!isAdmin) return
    usersApi.list().then(us => setStaffUsers((us || []).filter(u => u.active)))
  }, [isAdmin])

  const handleAdminRelease = async () => {
    if (!adminUserId || !adminStartDate || !adminEndDate) return
    const targetUser = staffUsers.find(u => String(u.id) === String(adminUserId))
    if (!confirm(`Release time for ${targetUser?.full_name} from ${adminStartDate} to ${adminEndDate}?`)) return
    setAdminReleasing(true)
    try {
      const result  = await payPeriodsApi.releaseUser(0, adminUserId, { startDate: adminStartDate, endDate: adminEndDate })
      const billing = result?.autoBilling
      if (billing?.created?.length > 0) {
        const count = billing.created.length
        const total = billing.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        toast.success(`Released ${result.updated} entr${result.updated !== 1 ? 'ies' : 'y'} for ${targetUser?.full_name} — ${count} billing record${count !== 1 ? 's' : ''} created ($${total})`)
      } else {
        toast.success(`Released ${result.updated} entr${result.updated !== 1 ? 'ies' : 'y'} for ${targetUser?.full_name} — no billable entries.`)
      }
      loadReleases()
    } catch {
      toast.error('Release failed.')
    } finally {
      setAdminReleasing(false)
    }
  }

  const loadReleases = () => {
    setLoading(true)
    releasesApi.list()
      .then(setReleases)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadReleases() }, [])

  const handlePreview = async () => {
    setPreviewing(true)
    setPreview(null)
    try {
      const r = await releasesApi.preview(startDate, endDate)
      setPreview(r)
    } catch {
      toast.error('Preview failed.')
    } finally {
      setPreviewing(false)
    }
  }

  const handleRelease = async () => {
    if (!preview || preview.entry_count === 0) return
    if (!confirm(`Release ${Number(preview.total_hours).toFixed(2)}h for ${startDate} – ${endDate}?`)) return
    setReleasing(true)
    try {
      const result   = await releasesApi.create(startDate, endDate)
      const billing  = result?.autoBilling
      if (billing?.created?.length > 0) {
        const count = billing.created.length
        const total = billing.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        toast.success(`Time released — ${count} billing record${count !== 1 ? 's' : ''} created totaling $${total}`)
      } else {
        toast.success('Time released — no billable entries, no billing records created.')
      }
      setPreview(null)
      loadReleases()
    } catch {
      toast.error('Release failed.')
    } finally {
      setReleasing(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this release record?')) return
    try {
      await releasesApi.delete(id)
      toast.success('Release deleted.')
      loadReleases()
    } catch {
      toast.error('Delete failed.')
    }
  }

  const inputCls = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent'

  return (
    <div className="py-2 space-y-4">

      {/* ── Admin: Release Staff Time by Date Range ─────────────────────────── */}
      {isAdmin && (
        <div className="bg-accent-light border border-accent/20 rounded-lg px-4 py-3">
          <p className="text-xs font-semibold text-accent uppercase tracking-wide mb-2">Admin — Release Staff Time</p>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Staff Member</label>
              <select
                value={adminUserId}
                onChange={e => setAdminUserId(e.target.value)}
                className={inputCls}
              >
                <option value="">Select staff…</option>
                {staffUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
              <input
                type="date"
                value={adminStartDate}
                onChange={e => setAdminStartDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
              <input
                type="date"
                value={adminEndDate}
                onChange={e => setAdminEndDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <button
              onClick={handleAdminRelease}
              disabled={adminReleasing || !adminUserId || !adminStartDate || !adminEndDate}
              className="px-4 py-1.5 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent-dark disabled:opacity-50 transition-colors"
            >
              {adminReleasing ? 'Releasing…' : 'Release Time'}
            </button>
          </div>
        </div>
      )}

      {/* Date range + preview form */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
          <input type="date" value={startDate}
            onChange={e => { setStartDate(e.target.value); setPreview(null) }}
            className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
          <input type="date" value={endDate}
            onChange={e => { setEndDate(e.target.value); setPreview(null) }}
            className={inputCls} />
        </div>
        <button onClick={handlePreview} disabled={previewing}
          className="px-4 py-1.5 border border-gray-200 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
          {previewing ? 'Previewing…' : 'Preview'}
        </button>
        {preview && preview.entry_count > 0 && (
          <button onClick={handleRelease} disabled={releasing}
            className="px-4 py-1.5 bg-green-500 text-white text-sm font-semibold rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors">
            {releasing ? 'Releasing…' : 'Confirm Release'}
          </button>
        )}
      </div>

      {/* Preview result */}
      {preview && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          preview.entry_count === 0
            ? 'bg-gray-50 border border-gray-200 text-gray-500'
            : 'bg-green-50 border border-green-200'
        }`}>
          {preview.entry_count === 0 ? (
            <p>No unreleased entries found for this date range.</p>
          ) : (
            <div className="flex items-center gap-6 flex-wrap">
              <span className="text-green-800 font-medium">{preview.entry_count} entries</span>
              <span className="text-green-800">
                Total: <span className="font-mono font-semibold">{fmtH(preview.total_hours)}</span>
              </span>
              <span className="text-green-800">
                Billable: <span className="font-mono font-semibold">{fmt$(preview.total_amount)}</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Release history */}
      <div>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Release History</h4>
        {loading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : releases.length === 0 ? (
          <p className="text-gray-400 text-sm">No releases recorded yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200">
              <tr>
                {[
                  ...(isAdmin ? ['Staff'] : []),
                  'Period', 'Hours', 'Billable $', 'Released', '',
                ].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2 pr-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {releases.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  {isAdmin && (
                    <td className="py-2 pr-3 font-medium text-gray-900">{r.full_name}</td>
                  )}
                  <td className="py-2 pr-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                    {r.start_date} – {r.end_date}
                  </td>
                  <td className="py-2 pr-3 font-mono font-semibold text-gray-900">{fmtH(r.total_hours)}</td>
                  <td className="py-2 pr-3 font-mono text-green-700">{fmt$(r.billable_amount)}</td>
                  <td className="py-2 pr-3 text-xs text-gray-500">
                    {new Date(r.released_at).toLocaleDateString()}
                  </td>
                  <td className="py-2">
                    {isAdmin && (
                      <button onClick={() => handleDelete(r.id)}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors">
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Alerts ────────────────────────────────────────────────────────────────────
function AlertsTab({ period }) {
  const { user } = useAuth()
  const currentStaff = user?.full_name
  const [alerts, setAlerts] = useState(null)
  const [daily,  setDaily]  = useState(null)

  useEffect(() => { timeSummaryApi.alerts().then(setAlerts) }, [])

  useEffect(() => {
    if (!period || !currentStaff) { setDaily(null); return }
    timeSummaryApi.dailyHours(currentStaff, period.start_date, period.end_date)
      .then(r => setDaily(r.daily || {}))
      .catch(() => setDaily(null))
  }, [period?.id, currentStaff])

  if (!alerts) return <p className="text-gray-400 text-sm py-4">Loading…</p>

  const today = new Date().toISOString().split('T')[0]
  const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  const missingDays = daily
    ? Object.entries(daily).filter(([d, h]) => d <= today && h === 0).map(([d]) => d)
    : []
  const lowDays = daily
    ? Object.entries(daily).filter(([d, h]) => d <= today && h > 0 && h < 4).map(([d]) => d)
    : []

  const allClear =
    !alerts.unreleasedPeriods.length &&
    !alerts.lowHoursStaff.length &&
    !alerts.missingStaff.length &&
    !alerts.overBudget.length &&
    missingDays.length === 0 &&
    lowDays.length === 0

  return (
    <div className="py-2 space-y-4">
      {allClear && (
        <p className="text-green-600 text-sm font-medium">No alerts. Everything looks good! ✓</p>
      )}

      {missingDays.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-red-600 uppercase tracking-wide mb-2">
            🚫 Missing Time — {currentStaff || 'You'} ({missingDays.length} day{missingDays.length !== 1 ? 's' : ''})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {missingDays.map(d => (
              <span key={d} className="text-xs bg-red-50 text-red-700 border border-red-200 rounded px-2 py-0.5 font-mono">
                {fmtDate(d)}
              </span>
            ))}
          </div>
        </div>
      )}

      {lowDays.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-yellow-600 uppercase tracking-wide mb-2">
            ⚡ Low Hours (&lt;4h) — {currentStaff || 'You'} ({lowDays.length} day{lowDays.length !== 1 ? 's' : ''})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {lowDays.map(d => (
              <span key={d} className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 rounded px-2 py-0.5 font-mono">
                {fmtDate(d)}: {(daily[d] || 0).toFixed(1)}h
              </span>
            ))}
          </div>
        </div>
      )}

      {alerts.unreleasedPeriods.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-orange-600 uppercase tracking-wide mb-2">
            ⚠ Unreleased Periods ({alerts.unreleasedPeriods.length})
          </h4>
          {alerts.unreleasedPeriods.map(p => (
            <div key={p.id} className="text-sm text-gray-700 py-1">
              Period {p.period_number}: {p.start_date} – {p.end_date}
              <span className="ml-2 text-xs text-orange-500">({p.status})</span>
            </div>
          ))}
        </div>
      )}

      {alerts.missingStaff.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-red-600 uppercase tracking-wide mb-2">
            ✗ No Entries This Period ({alerts.missingStaff.length})
          </h4>
          {alerts.missingStaff.map(s => (
            <div key={s} className="text-sm text-gray-700 py-0.5">{s}</div>
          ))}
        </div>
      )}

      {alerts.lowHoursStaff.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-yellow-600 uppercase tracking-wide mb-2">
            ⚡ Low Period Hours (&lt;40h total)
          </h4>
          {alerts.lowHoursStaff.map(r => (
            <div key={r.staff_member} className="text-sm text-gray-700 py-0.5">
              {r.staff_member}: <span className="font-mono font-semibold">{fmtH(r.total_hours)}</span>
            </div>
          ))}
        </div>
      )}

      {alerts.overBudget.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-red-600 uppercase tracking-wide mb-2">
            💰 Over Budget ({alerts.overBudget.length})
          </h4>
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200">
              <tr>
                {['Client', 'Engagement', 'Budget', 'Logged', '%'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase pb-1.5 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {alerts.overBudget.map(e => (
                <tr key={e.id} className="hover:bg-red-50">
                  <td className="py-1.5 pr-4 text-gray-900">{e.client_name}</td>
                  <td className="py-1.5 pr-4 text-gray-600">{e.engagement_type}</td>
                  <td className="py-1.5 pr-4 font-mono text-gray-600">{fmtH(e.budgeted_hours)}</td>
                  <td className="py-1.5 pr-4 font-mono font-semibold text-red-700">{fmtH(e.logged_hours)}</td>
                  <td className="py-1.5 font-mono font-bold text-red-600">{e.pct_used}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Shell ─────────────────────────────────────────────────────────────────────
export default function BottomTabs({ period }) {
  const { isAdmin } = useAuth()
  const [tab,  setTab]  = useState(0)
  const [open, setOpen] = useState(true)

  const tabs = ALL_TABS.filter(t => !t.adminOnly || isAdmin)

  // Keep active tab index in bounds after role-based filtering
  const activeTab = tabs[tab] ?? tabs[0]

  return (
    <div className={`bg-white border-t border-gray-200 flex-shrink-0 transition-all ${open ? '' : 'h-10'}`}>
      {/* Tab strip */}
      <div className="flex items-center border-b border-gray-200 px-4">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            onClick={() => { setTab(i); setOpen(true) }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === i && open
                ? 'border-accent text-accent'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={() => setOpen(v => !v)}
          className="ml-auto text-xs text-gray-400 hover:text-gray-600 px-2 py-2"
        >
          {open ? '▼ Hide' : '▲ Show'}
        </button>
      </div>

      {open && (
        <div className="px-6 py-2 overflow-y-auto" style={{ maxHeight: 280 }}>
          {activeTab?.id === 'mtd'     && <MtdTab />}
          {activeTab?.id === 'period'  && <PeriodSummaryTab period={period} />}
          {activeTab?.id === 'release' && <TimeReleaseTab />}
          {activeTab?.id === 'alerts'  && <AlertsTab period={period} />}
        </div>
      )}
    </div>
  )
}
