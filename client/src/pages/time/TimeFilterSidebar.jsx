import { ChevronLeftIcon, ChevronRightIcon, FunnelIcon } from '@heroicons/react/24/outline'
import CalendarWidget from './CalendarWidget'

const labelCls = 'block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1'
const inputCls = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent'
const selCls   = inputCls

const BILLABLE_OPTS = [
  { value: '', label: 'All' },
  { value: 'true', label: 'Billable only' },
  { value: 'false', label: 'Non-billable only' },
]
const STATUS_OPTS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'released', label: 'Released' },
]

export default function TimeFilterSidebar({
  filters,
  onChange,
  onClear,
  engagements  = [],
  serviceCodes = [],
  payPeriods   = [],
  entryDates   = [],
  missingDates = [],
  lowDates     = [],
  isOpen,
  onToggle,
}) {
  const set = (k, v) => onChange({ ...filters, [k]: v })

  // Clicking a calendar date sets date_from + date_to to that day
  const handleCalDate = dateStr => {
    onChange({ ...filters, date_from: dateStr, date_to: dateStr })
  }

  const activeCount = Object.values(filters).filter(v => v !== '' && v != null).length

  return (
    <div className="relative flex-shrink-0">
      {/* Collapse toggle strip */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="flex flex-col items-center justify-center w-8 h-full bg-white border-r border-gray-200 hover:bg-gray-50 transition-colors group"
          title="Show filters"
        >
          <FunnelIcon className="w-4 h-4 text-gray-400 group-hover:text-accent mb-1" />
          {activeCount > 0 && (
            <span className="w-4 h-4 rounded-full bg-accent text-white text-[10px] font-bold flex items-center justify-center">
              {activeCount}
            </span>
          )}
          <ChevronRightIcon className="w-3 h-3 text-gray-300 mt-2" />
        </button>
      )}

      {isOpen && (
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <FunnelIcon className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-800">Filters</span>
              {activeCount > 0 && (
                <span className="text-xs bg-accent text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {activeCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {activeCount > 0 && (
                <button onClick={onClear} className="text-xs text-accent hover:underline mr-1">
                  Clear
                </button>
              )}
              <button onClick={onToggle} className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors">
                <ChevronLeftIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Calendar */}
          <div className="px-3 pt-3 pb-2">
            <CalendarWidget
              selectedDate={filters.date_from || ''}
              onSelect={handleCalDate}
              entryDates={entryDates}
              missingDates={missingDates}
              lowDates={lowDates}
            />
          </div>

          {/* Filter fields */}
          <div className="px-4 py-2 space-y-3 flex-1">
            <div>
              <label className={labelCls}>Staff Member</label>
              <input
                value={filters.staff_member || ''}
                onChange={e => set('staff_member', e.target.value)}
                placeholder="Filter by staff..."
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Client</label>
              <input
                value={filters.client || ''}
                onChange={e => set('client', e.target.value)}
                placeholder="Filter by client..."
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Engagement</label>
              <select value={filters.engagement_id || ''} onChange={e => set('engagement_id', e.target.value)} className={selCls}>
                <option value="">All engagements</option>
                {engagements.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.client_name} — {e.engagement_type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Service Code</label>
              <select value={filters.service_code || ''} onChange={e => set('service_code', e.target.value)} className={selCls}>
                <option value="">All codes</option>
                {serviceCodes.map(c => (
                  <option key={c.id} value={c.code}>{c.code} — {c.description}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Date Range</label>
              <div className="space-y-1.5">
                <input type="date" value={filters.date_from || ''} onChange={e => set('date_from', e.target.value)} className={inputCls} />
                <input type="date" value={filters.date_to || ''} onChange={e => set('date_to', e.target.value)} className={inputCls} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Billable</label>
              <select value={filters.billable || ''} onChange={e => set('billable', e.target.value)} className={selCls}>
                {BILLABLE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls}>Pay Period</label>
              <select value={filters.pay_period_id || ''} onChange={e => set('pay_period_id', e.target.value)} className={selCls}>
                <option value="">All periods</option>
                {payPeriods.map(p => (
                  <option key={p.id} value={p.id}>
                    P{p.period_number}: {p.start_date} – {p.end_date}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Entry Status</label>
              <select value={filters.entry_status || ''} onChange={e => set('entry_status', e.target.value)} className={selCls}>
                {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
