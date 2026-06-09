import { useEffect, useRef, useState } from 'react'
import { reportsApi }    from '../api/reports'
import { payPeriodsApi } from '../api/payPeriods'
import { usersApi }      from '../api/users'
import { engagementsApi } from '../api/engagements'
import { useSortable }   from '../hooks/useSortable'
import { SkeletonTable } from '../components/Skeleton'
import { useAuth }       from '../context/AuthContext'

// ── Report categories + registry ──────────────────────────────────────────────
// hasStaffFilter  — show staff dropdown
// hasClientFilter — show client dropdown
// hasReleaseFilter — show release status select
// periodPicker    — uses period selector instead of date range
const CATEGORIES = [
  {
    key: 'time', label: 'Time',
    reports: [
      { key: 'staff_productivity',   label: 'Staff Productivity',   hasStaffFilter: true, hasClientFilter: true, hasReleaseFilter: true },
      { key: 'time_by_service_code', label: 'Time by Service Code', hasStaffFilter: true, hasClientFilter: true, hasReleaseFilter: true },
      { key: 'time_by_client',       label: 'Time by Client',       hasStaffFilter: true,                        hasReleaseFilter: true },
      { key: 'timesheet',            label: 'Timesheet',            hasStaffFilter: true, periodPicker: true,    hasReleaseFilter: true },
    ],
  },
  {
    key: 'billing', label: 'Billing & AR',
    reports: [
      { key: 'invoice_register', label: 'Invoice Register', hasClientFilter: true },
      { key: 'collections',      label: 'Collections',      hasClientFilter: true },
      { key: 'ar_aging',         label: 'AR Aging',         hasClientFilter: true },
      { key: 'client_balance',   label: 'Client Balances',  hasClientFilter: true },
    ],
  },
  {
    key: 'engagements', label: 'Engagements',
    reports: [
      { key: 'engagement_status', label: 'Engagement Status' },
      { key: 'budget_variance',   label: 'Budget Variance',     hasStaffFilter: true, hasClientFilter: true },
      { key: 'overdue',           label: 'Overdue Engagements', hasStaffFilter: true, hasClientFilter: true },
      { key: 'staff_workload',    label: 'Staff Workload' },
    ],
  },
  {
    key: 'payroll', label: 'Payroll', adminOnly: true,
    reports: [
      { key: 'time_release_summary', label: 'Time Release Summary', hasStaffFilter: true },
      { key: 'unreleased_time',      label: 'Unreleased Time' },
    ],
  },
]

const ENG_TYPES   = ['Tax Return', 'Bookkeeping', 'Audit', 'Advisory', 'Payroll', 'Other']
const TODAY       = new Date().toISOString().split('T')[0]
const MONTH_START = TODAY.slice(0, 8) + '01'
const INPUT_CLS   = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'

function fmtCurrency(n) {
  return '$' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtHours(n) { return (n || 0).toFixed(1) + 'h' }

function exportCsv(columns, rows, filename) {
  const header = columns.map(c => c.label).join(',')
  const body   = rows.map(r => columns.map(c => {
    const v = r[c.key]
    return typeof v === 'string' && v.includes(',') ? `"${v}"` : (v ?? '')
  }).join(',')).join('\n')
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function budgetRowClass(row) {
  if (row.hours_pct == null) return ''
  if (row.hours_pct >= 100) return 'bg-red-50'
  if (row.hours_pct >= 75)  return 'bg-yellow-50'
  return 'bg-green-50'
}

function ReportTable({ columns, rows, rowClass, staffKey, onStaffClick }) {
  const { sorted, toggle, SortIcon } = useSortable(rows)
  if (!rows.length) return <p className="text-sm text-gray-400 py-8 text-center">No data for this period.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {columns.map(c => (
              <th key={c.key}
                onClick={() => toggle(c.key)}
                className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none whitespace-nowrap">
                {c.label}<SortIcon colKey={c.key} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((r, i) => (
            <tr key={i} className={`hover:bg-gray-50 ${rowClass ? rowClass(r) : ''}`}>
              {columns.map(c => (
                <td key={c.key} className={`px-4 py-3 ${c.mono ? 'font-mono' : ''} text-gray-700`}>
                  {staffKey && c.key === staffKey && onStaffClick ? (
                    <button
                      onClick={() => onStaffClick(r[c.key])}
                      className="text-accent hover:underline font-medium text-left"
                    >
                      {r[c.key] ?? '—'}
                    </button>
                  ) : (
                    c.fmt ? c.fmt(r[c.key], r) : (r[c.key] ?? '—')
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const REPORT_CONFIGS = {
  staff_productivity: {
    staffKey: 'staff_member',
    columns: [
      { key: 'staff_member',    label: 'Staff' },
      { key: 'total_hours',     label: 'Total Hrs',    mono: true, fmt: fmtHours },
      { key: 'billable_hours',  label: 'Billable Hrs', mono: true, fmt: fmtHours },
      { key: 'billable_pct',    label: 'Billable %',   mono: true, fmt: v => `${v}%` },
      { key: 'billable_amount', label: 'Billable Amt', mono: true, fmt: fmtCurrency },
      { key: 'utilization',     label: 'Utilization',  mono: true, fmt: v => `${v}%` },
    ],
  },
  time_by_service_code: {
    columns: [
      { key: 'service_code',     label: 'Service Code' },
      { key: 'total_hours',      label: 'Total Hrs',    mono: true, fmt: fmtHours },
      { key: 'billable_amount',  label: 'Billable Amt', mono: true, fmt: fmtCurrency },
      { key: 'engagement_count', label: 'Engagements',  mono: true },
    ],
  },
  time_by_client: {
    columns: [
      { key: 'client_name',     label: 'Client' },
      { key: 'total_hours',     label: 'Total Hrs',    mono: true, fmt: fmtHours },
      { key: 'billable_hours',  label: 'Billable Hrs', mono: true, fmt: fmtHours },
      { key: 'billable_amount', label: 'Billable Amt', mono: true, fmt: fmtCurrency },
    ],
  },
  timesheet: {
    staffKey: 'staff_member',
    columns: [
      { key: 'staff_member',    label: 'Staff' },
      { key: 'date',            label: 'Date',         mono: true },
      { key: 'hours',           label: 'Hours',        mono: true, fmt: fmtHours },
      { key: 'billable_hours',  label: 'Billable',     mono: true, fmt: fmtHours },
      { key: 'billable_amount', label: 'Billable Amt', mono: true, fmt: fmtCurrency },
      { key: 'release_status',  label: 'Status' },
    ],
  },
  invoice_register: {
    columns: [
      { key: 'invoice_number',  label: 'Invoice #',    mono: true },
      { key: 'client_name',     label: 'Client' },
      { key: 'invoice_date',    label: 'Date',         mono: true },
      { key: 'due_date',        label: 'Due',          mono: true },
      { key: 'total',           label: 'Total',        mono: true, fmt: fmtCurrency },
      { key: 'engagement_type', label: 'Type' },
      { key: 'status',          label: 'Status' },
    ],
  },
  collections: {
    columns: [
      { key: 'date',             label: 'Date',       mono: true },
      { key: 'client_name',      label: 'Client' },
      { key: 'amount',           label: 'Amount',     mono: true, fmt: fmtCurrency },
      { key: 'payment_method',   label: 'Method' },
      { key: 'reference_number', label: 'Reference' },
    ],
  },
  ar_aging: {
    columns: [
      { key: 'client_name', label: 'Client' },
      { key: 'current',     label: '0–30d',  mono: true, fmt: fmtCurrency },
      { key: 'days31_60',   label: '31–60d', mono: true, fmt: fmtCurrency },
      { key: 'days61_90',   label: '61–90d', mono: true, fmt: fmtCurrency },
      { key: 'days90plus',  label: '90d+',   mono: true, fmt: fmtCurrency },
      { key: 'total',       label: 'Total',  mono: true, fmt: fmtCurrency },
    ],
  },
  client_balance: {
    columns: [
      { key: 'client_name',  label: 'Client' },
      { key: 'total_billed', label: 'Billed',      mono: true, fmt: fmtCurrency },
      { key: 'total_paid',   label: 'Paid',        mono: true, fmt: fmtCurrency },
      { key: 'outstanding',  label: 'Outstanding', mono: true, fmt: fmtCurrency },
    ],
  },
  engagement_status: {
    columns: [
      { key: 'status',        label: 'Status' },
      { key: 'count',         label: 'Count',         mono: true },
      { key: 'high_priority', label: 'High Priority', mono: true },
    ],
  },
  budget_variance: {
    staffKey: 'assigned_staff',
    columns: [
      { key: 'client_name',     label: 'Client' },
      { key: 'engagement_type', label: 'Type' },
      { key: 'budgeted_hours',  label: 'Budget Hrs', mono: true, fmt: fmtHours },
      { key: 'actual_hours',    label: 'Actual Hrs', mono: true, fmt: fmtHours },
      { key: 'hours_pct',       label: '% Used',     mono: true, fmt: v => v != null ? `${v}%` : '—' },
      { key: 'hours_variance',  label: 'Variance',   mono: true,
        fmt: v => v != null ? (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) + 'h' : '—' },
    ],
  },
  overdue: {
    columns: [
      { key: 'client_name',     label: 'Client' },
      { key: 'engagement_type', label: 'Type' },
      { key: 'assigned_staff',  label: 'Staff' },
      { key: 'due_date',        label: 'Due Date',    mono: true },
      { key: 'days_overdue',    label: 'Days Overdue',mono: true, fmt: v => Math.floor(v) + 'd' },
      { key: 'status',          label: 'Status' },
    ],
  },
  staff_workload: {
    staffKey: 'assigned_staff',
    columns: [
      { key: 'assigned_staff',          label: 'Staff' },
      { key: 'active_engagement_count', label: 'Active Engs',     mono: true },
      { key: 'hours_this_period',       label: 'Hrs This Period', mono: true, fmt: fmtHours },
    ],
  },
  time_release_summary: {
    columns: [
      { key: 'staff_member',    label: 'Staff' },
      { key: 'start_date',      label: 'Start',        mono: true },
      { key: 'end_date',        label: 'End',          mono: true },
      { key: 'total_hours',     label: 'Total Hrs',    mono: true, fmt: fmtHours },
      { key: 'billable_amount', label: 'Billable Amt', mono: true, fmt: fmtCurrency },
      { key: 'released_at',     label: 'Released At',
        fmt: v => v ? new Date(v).toLocaleDateString() : '—' },
    ],
  },
  unreleased_time: {
    columns: [
      { key: 'staff_member',  label: 'Staff' },
      { key: 'earliest_date', label: 'From',      mono: true },
      { key: 'latest_date',   label: 'To',        mono: true },
      { key: 'total_hours',   label: 'Total Hrs', mono: true, fmt: fmtHours },
    ],
  },
  staff_detail: {
    columns: [
      { key: 'date',                label: 'Date',        mono: true },
      { key: 'client_name',         label: 'Client' },
      { key: 'engagement_type',     label: 'Type' },
      { key: 'service_code',        label: 'Service Code' },
      { key: 'service_description', label: 'Description' },
      { key: 'hours',               label: 'Hours',       mono: true, fmt: fmtHours },
      { key: 'billing_rate',        label: 'Rate',        mono: true,
        fmt: v => v != null ? `$${Number(v).toFixed(0)}` : '—' },
      { key: 'amount',              label: 'Amount',      mono: true, fmt: fmtCurrency },
      { key: 'memo',                label: 'Memo' },
    ],
  },
  wip: {
    columns: [
      { key: 'client_name',     label: 'Client' },
      { key: 'engagement_type', label: 'Type' },
      { key: 'assigned_staff',  label: 'Staff' },
      { key: 'hours',           label: 'WIP Hrs', mono: true, fmt: fmtHours },
      { key: 'amount',          label: 'WIP Amt', mono: true, fmt: fmtCurrency },
      { key: 'age_days',        label: 'Age',     mono: true, fmt: v => `${v}d` },
    ],
  },
}

export default function Reports() {
  const { user }   = useAuth()
  const isAdmin    = user?.role === 'admin'

  const [type,          setType]          = useState('staff_productivity')
  const [startDate,     setStartDate]     = useState(MONTH_START)
  const [endDate,       setEndDate]       = useState(TODAY)
  const [staffFilter,   setStaffFilter]   = useState('')
  const [clientFilter,  setClientFilter]  = useState('')
  const [typeFilter,    setTypeFilter]    = useState('')
  const [releaseFilter, setReleaseFilter] = useState('')
  const [periodId,      setPeriodId]      = useState(null)
  const [periods,       setPeriods]       = useState([])
  const [staffList,     setStaffList]     = useState([])   // { id, full_name } for dropdown
  const [result,        setResult]        = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [drill,         setDrill]         = useState(null)  // { staffName, startDate, endDate }

  const activeMeta = CATEGORIES.flatMap(c => c.reports).find(r => r.key === type)
  const usesPeriod = !!activeMeta?.periodPicker

  useEffect(() => {
    payPeriodsApi.list(new Date().getFullYear()).then(ps => {
      setPeriods(ps)
      if (!periodId && ps.length) {
        setPeriodId(ps.find(p => p.status === 'Open')?.id || ps[0]?.id)
      }
    }).catch(() => {})
    // Load staff list for dropdown (active users only)
    usersApi.list().then(us => setStaffList((us || []).filter(u => u.active))).catch(() => {})
  }, [])

  const run = async () => {
    setLoading(true)
    setDrill(null)
    try {
      const params = { type }
      if (usesPeriod) {
        params.periodId = periodId
      } else {
        params.startDate = startDate
        params.endDate   = endDate
      }
      if (staffFilter)                                    params.staff          = staffFilter
      if (clientFilter)                                   params.client         = clientFilter
      if (typeFilter)                                     params.engagementType = typeFilter
      if (releaseFilter && activeMeta?.hasReleaseFilter)  params.releaseFilter  = releaseFilter
      const r = await reportsApi.run(params)
      setResult(r)
    } finally {
      setLoading(false)
    }
  }

  const cfg = REPORT_CONFIGS[type]

  const handleExport = () => {
    if (!result?.data?.length) return
    const suffix = usesPeriod ? `period-${periodId}` : `${startDate}-${endDate}`
    exportCsv(cfg.columns, result.data, `${type}-${suffix}.csv`)
  }

  const visibleCategories = CATEGORIES.filter(c => !c.adminOnly || isAdmin)

  return (
    <div className="flex min-h-screen">
      {/* ── Left Sidebar ── */}
      <div className="w-48 flex-shrink-0 border-r border-gray-200 bg-white py-4">
        {visibleCategories.map(cat => (
          <div key={cat.key} className="mb-5">
            <p className="px-4 mb-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              {cat.label}
            </p>
            {cat.reports.filter(r => !r.adminOnly || isAdmin).map(r => (
              <button key={r.key}
                onClick={() => { setType(r.key); setResult(null); setDrill(null); setStaffFilter(''); setClientFilter(''); setReleaseFilter('') }}
                className={`w-full text-left px-4 py-1.5 text-sm transition-colors ${
                  type === r.key
                    ? 'bg-accent/10 text-accent font-semibold border-r-2 border-accent'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 p-6 overflow-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-4">
          {activeMeta?.label || 'Reports'}
        </h1>

        {/* Filter bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
          <div className="space-y-3">
            {/* Row 1 — date / period pickers + staff + client + type */}
            <div className="flex items-end gap-3 flex-wrap">
              {usesPeriod ? (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Pay Period</label>
                  <select value={periodId || ''} onChange={e => setPeriodId(parseInt(e.target.value))} className={INPUT_CLS}>
                    {periods.map(p => (
                      <option key={p.id} value={p.id}>
                        P{p.period_number}: {p.start_date} – {p.end_date}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={INPUT_CLS} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={INPUT_CLS} />
                  </div>
                </>
              )}

              {/* Staff dropdown — only for reports that use it */}
              {activeMeta?.hasStaffFilter && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Staff</label>
                  <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} className={INPUT_CLS}>
                    <option value="">All Staff</option>
                    {staffList.map(u => (
                      <option key={u.id} value={u.full_name}>{u.full_name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Client autocomplete — type-to-search, server-side, never loads full list */}
              {activeMeta?.hasClientFilter && (
                <ClientAutocomplete key={type} onChange={setClientFilter} />
              )}

              {/* Engagement type — always shown for date-range reports */}
              {!usesPeriod && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Engagement Type</label>
                  <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={INPUT_CLS}>
                    <option value="">All Types</option>
                    {ENG_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              )}

              {/* Release status filter inline */}
              {activeMeta?.hasReleaseFilter && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Release Status</label>
                  <select value={releaseFilter} onChange={e => setReleaseFilter(e.target.value)} className={INPUT_CLS}>
                    <option value="">All Entries</option>
                    <option value="released">Released Only</option>
                    <option value="unreleased">Unreleased Only</option>
                  </select>
                </div>
              )}
            </div>

            {/* Row 2 — Run + Export */}
            <div className="flex justify-end gap-2">
              <button onClick={run} disabled={loading || (usesPeriod && !periodId)}
                className="px-5 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-accent-dark disabled:opacity-50 transition-colors">
                {loading ? 'Running…' : 'Run Report'}
              </button>
              {result?.data?.length > 0 && (
                <button onClick={handleExport}
                  className="px-4 py-2 border border-gray-200 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Export CSV
                </button>
              )}
            </div>
          </div>
        </div>

        {loading && <SkeletonTable rows={6} />}

        {!loading && drill && result && (
          <StaffDrilldown
            staffName={drill.staffName}
            startDate={drill.startDate}
            endDate={drill.endDate}
            onBack={() => setDrill(null)}
          />
        )}

        {!loading && result && !drill && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-200">
              <span className="font-semibold text-gray-900 text-sm">{activeMeta?.label}</span>
              {result.start && (
                <span className="text-xs text-gray-400 ml-3">
                  {result.start} — {result.end} · {result.data.length} rows
                </span>
              )}
              {!result.start && (
                <span className="text-xs text-gray-400 ml-3">{result.data.length} rows</span>
              )}
            </div>
            <ReportTable
              columns={cfg.columns}
              rows={result.data}
              rowClass={type === 'budget_variance' ? budgetRowClass : null}
              staffKey={cfg.staffKey}
              onStaffClick={cfg.staffKey ? (name) => setDrill({ staffName: name, startDate: result.start || startDate, endDate: result.end || endDate }) : null}
            />
            {result.data.length > 0 &&
              cfg.columns.some(c => c.fmt === fmtCurrency || c.fmt === fmtHours) && (
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex flex-wrap gap-6">
                {cfg.columns.filter(c => c.fmt === fmtCurrency).map(c => (
                  <span key={c.key}>
                    <span className="font-medium">{c.label}:</span>{' '}
                    <span className="font-mono font-semibold text-gray-700">
                      {fmtCurrency(result.data.reduce((s, r) => s + (r[c.key] || 0), 0))}
                    </span>
                  </span>
                ))}
                {cfg.columns.filter(c => c.fmt === fmtHours).map(c => (
                  <span key={c.key}>
                    <span className="font-medium">{c.label}:</span>{' '}
                    <span className="font-mono font-semibold text-gray-700">
                      {fmtHours(result.data.reduce((s, r) => s + (r[c.key] || 0), 0))}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && !result && !drill && (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <ChartBarPlaceholder />
            <p className="text-gray-400 mt-3 text-sm">Select a report and run it to see data.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function StaffDrilldown({ staffName, startDate, endDate, onBack }) {
  const cfg = REPORT_CONFIGS['staff_detail']
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    reportsApi.run({ type: 'staff_detail', staff: staffName, startDate, endDate })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [staffName, startDate, endDate])

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="text-sm text-accent hover:underline flex items-center gap-1 font-medium"
        >
          ← Back
        </button>
        <span className="text-gray-300">|</span>
        <h2 className="text-base font-bold text-gray-900">{staffName}</h2>
        <span className="text-sm text-gray-400">{startDate} – {endDate}</span>
      </div>

      {loading && <SkeletonTable rows={6} />}

      {!loading && data && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-200">
            <span className="font-semibold text-gray-900 text-sm">Time Detail: {staffName}</span>
            <span className="text-xs text-gray-400 ml-3">{data.data.length} entries</span>
          </div>
          <ReportTable columns={cfg.columns} rows={data.data} />
          {data.data.length > 0 && (
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex flex-wrap gap-6">
              <span>
                <span className="font-medium">Hours:</span>{' '}
                <span className="font-mono font-semibold text-gray-700">
                  {fmtHours(data.data.reduce((s, r) => s + (r.hours || 0), 0))}
                </span>
              </span>
              <span>
                <span className="font-medium">Amount:</span>{' '}
                <span className="font-mono font-semibold text-gray-700">
                  {fmtCurrency(data.data.reduce((s, r) => s + (r.amount || 0), 0))}
                </span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Client autocomplete ────────────────────────────────────────────────────────
// Type ≥2 chars → debounce 250ms → server-side LIKE search → pick from dropdown.
// Uses key={reportType} in the parent so it remounts (resets) when the report changes.
function ClientAutocomplete({ onChange }) {
  const [query,       setQuery]       = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [selected,    setSelected]    = useState('')
  const [open,        setOpen]        = useState(false)
  const [busy,        setBusy]        = useState(false)
  const timerRef     = useRef(null)
  const containerRef = useRef(null)

  // Close dropdown when clicking outside the widget
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleInput = (e) => {
    const val = e.target.value
    setQuery(val)
    // If user edits after a selection, clear the committed filter
    if (selected) {
      setSelected('')
      onChange('')
    }
    clearTimeout(timerRef.current)
    if (val.length < 2) {
      setSuggestions([])
      setOpen(false)
      return
    }
    timerRef.current = setTimeout(async () => {
      setBusy(true)
      try {
        const res = await engagementsApi.clientNames(val)
        setSuggestions(res?.names || [])
        setOpen(true)
      } catch {
        setSuggestions([])
      } finally {
        setBusy(false)
      }
    }, 250)
  }

  const handleSelect = (name) => {
    setSelected(name)
    setQuery(name)
    setSuggestions([])
    setOpen(false)
    onChange(name)
  }

  const handleClear = () => {
    setSelected('')
    setQuery('')
    setSuggestions([])
    setOpen(false)
    clearTimeout(timerRef.current)
    onChange('')
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs font-medium text-gray-500 mb-1">Client</label>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Search clients…"
          className={`${INPUT_CLS} pr-7 w-44`}
          autoComplete="off"
        />
        {(query || selected) && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-base leading-none"
            aria-label="Clear client filter"
          >×</button>
        )}
      </div>
      {/* Selected badge — shown while a name is committed */}
      {selected && (
        <p className="mt-0.5 text-[10px] text-accent font-semibold truncate max-w-44">✓ {selected}</p>
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-56 bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden max-h-56 overflow-y-auto">
          {busy && (
            <p className="px-3 py-2 text-xs text-gray-400 italic">Searching…</p>
          )}
          {!busy && suggestions.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-400 italic">No matches</p>
          )}
          {!busy && suggestions.map(name => (
            <button
              key={name}
              type="button"
              onClick={() => handleSelect(name)}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-accent/10 hover:text-accent transition-colors"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ChartBarPlaceholder() {
  return (
    <div className="flex items-end justify-center gap-2 h-16">
      {[40, 65, 30, 80, 55, 70, 45].map((h, i) => (
        <div key={i} className="w-6 bg-gray-200 rounded-t" style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}
