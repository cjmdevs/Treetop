import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { staffApi } from '../api/staff'
import { StatusBadge } from '../components/Badge'
import { Breadcrumbs } from '../components/Breadcrumbs'

const EVENT_ICONS = {
  engagement_created: '📋',
  status_changed:     '🔄',
  staff_assigned:     '👤',
  subtask_completed:  '✓',
  time_entry_added:   '⏱',
  billing_created:    '💰',
  billing_updated:    '💳',
  payment_received:   '💵',
  note_added:         '📝',
}

function MeterBar({ pct, color = 'bg-accent' }) {
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function WeekChart({ byDay }) {
  if (!byDay.length) return <p className="text-xs text-gray-400">No entries this week.</p>

  const max = Math.max(...byDay.map(d => d.hours), 0.1)
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

  const padded = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay() + 1 + i)
    const dateStr = d.toISOString().split('T')[0]
    const entry = byDay.find(e => e.date === dateStr)
    return { label: days[i], dateStr, hours: entry?.hours || 0, billable: entry?.billable_hours || 0 }
  })

  return (
    <div className="flex items-end gap-2 h-20">
      {padded.map(d => {
        const pct = (d.hours / max) * 100
        const bPct = d.hours > 0 ? (d.billable / d.hours) * 100 : 0
        const today = d.dateStr === new Date().toISOString().split('T')[0]
        return (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col justify-end h-14 relative">
              <div title={`${d.hours}h total`} className="w-full bg-gray-200 rounded-t absolute bottom-0"
                style={{ height: `${Math.max(pct, 2)}%` }} />
              <div title={`${d.billable}h billable`} className="w-full bg-accent rounded-t absolute bottom-0"
                style={{ height: `${Math.max((pct * bPct) / 100, 0)}%` }} />
            </div>
            <span className={`text-xs font-medium ${today ? 'text-accent' : 'text-gray-400'}`}>{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function TrendLine({ trend }) {
  if (!trend.length) return null
  const max = Math.max(...trend.map(t => t.hours), 0.1)
  const w = 280, h = 60, pad = 10
  const pts = trend.map((t, i) => ({
    x: pad + (i / (trend.length - 1)) * (w - pad * 2),
    y: h - pad - (t.hours / max) * (h - pad * 2),
  }))
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const area = `${path} L ${pts[pts.length-1].x} ${h-pad} L ${pts[0].x} ${h-pad} Z`

  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">8-week billable hours trend</p>
      <svg width={w} height={h} className="overflow-visible">
        <defs>
          <linearGradient id="trend-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1B4FD8" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#1B4FD8" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#trend-grad)" />
        <path d={path} fill="none" stroke="#1B4FD8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#1B4FD8" />
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        {trend.map(t => (
          <span key={t.label} className="text-xs text-gray-300">{t.label}</span>
        ))}
      </div>
    </div>
  )
}

export default function StaffDetail() {
  const { name } = useParams()
  const navigate  = useNavigate()
  const decodedName = decodeURIComponent(name)
  const [data, setData] = useState(null)

  useEffect(() => {
    staffApi.detail(decodedName).then(setData)
  }, [decodedName])

  if (!data) return <div className="p-8 text-gray-400">Loading...</div>

  const billPct   = data.monthly?.total_hours > 0
    ? Math.round((data.monthly.billable_hours / data.monthly.total_hours) * 100) : 0
  const utilColor = data.utilization_pct >= 90 ? 'bg-red-500' : data.utilization_pct >= 70 ? 'bg-amber-400' : 'bg-accent'

  return (
    <div className="p-8 max-w-5xl">
      <Breadcrumbs crumbs={[
        { to: '/staff', label: 'Staff' },
        { label: decodedName },
      ]} />

      <div className="flex items-center gap-4 mb-8">
        <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
          {decodedName.split(' ').map(n => n[0]).join('')}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{decodedName}</h1>
          <p className="text-gray-400 text-sm">{data.engagements.length} active engagements</p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Hours This Month',    value: `${(data.monthly?.total_hours || 0).toFixed(1)}h`, mono: true },
          { label: 'Billable Hours',      value: `${(data.monthly?.billable_hours || 0).toFixed(1)}h`, mono: true },
          { label: 'Billable Amount',     value: `$${(data.monthly?.billable_amount || 0).toLocaleString()}`, mono: true },
          { label: 'Utilization',         value: `${data.utilization_pct}%`, mono: true },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 mb-1">{s.label}</p>
            <p className={`text-xl font-bold text-gray-900 ${s.mono ? 'font-mono' : ''}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Weekly hours chart */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 text-sm mb-4">This Week</h2>
          <WeekChart byDay={data.byDay} />
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-accent rounded inline-block" />Billable</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-gray-200 rounded inline-block" />Non-billable</span>
          </div>
        </div>

        {/* Utilization + billable split */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-500">Monthly Utilization</span>
              <span className="font-mono font-semibold text-gray-900">{data.utilization_pct}%</span>
            </div>
            <MeterBar pct={data.utilization_pct} color={utilColor} />
            <p className="text-xs text-gray-400 mt-1">vs 160h target</p>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-500">Billable Split</span>
              <span className="font-mono font-semibold text-gray-900">{billPct}%</span>
            </div>
            <MeterBar pct={billPct} color="bg-emerald-500" />
            <p className="text-xs text-gray-400 mt-1">
              {(data.monthly?.billable_hours || 0).toFixed(1)}h billable / {(data.monthly?.nonbillable_hours || 0).toFixed(1)}h non-billable
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* 8-week trend */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 text-sm mb-4">8-Week Trend</h2>
          <TrendLine trend={data.trend} />
        </div>

        {/* Top clients */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 text-sm mb-4">Top Clients (This Month)</h2>
          <div className="space-y-3">
            {data.topClients.map((c, i) => {
              const maxHours = data.topClients[0]?.hours || 1
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-700 font-medium truncate">{c.client_name}</span>
                    <span className="font-mono text-gray-500 flex-shrink-0 ml-2">{c.hours.toFixed(1)}h</span>
                  </div>
                  <MeterBar pct={(c.hours / maxHours) * 100} />
                </div>
              )
            })}
            {data.topClients.length === 0 && <p className="text-xs text-gray-400">No time logged this month.</p>}
          </div>
        </div>

        {/* Active engagements */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 text-sm mb-4">Active Engagements</h2>
          <div className="space-y-2">
            {data.engagements.map(e => (
              <div key={e.id} onClick={() => navigate(`/engagements/${e.id}`)}
                className="rounded-lg bg-gray-50 hover:bg-gray-100 p-3 cursor-pointer transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 truncate">{e.client_name}</span>
                  <StatusBadge status={e.status} />
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{e.engagement_type}</span>
                  {e.due_date && <span>Due {e.due_date}</span>}
                </div>
                {e.budgeted_hours && (
                  <div className="mt-1.5">
                    <MeterBar pct={(e.actual_hours / e.budgeted_hours) * 100}
                      color={e.actual_hours / e.budgeted_hours >= 0.9 ? 'bg-amber-400' : 'bg-accent'} />
                  </div>
                )}
              </div>
            ))}
            {data.engagements.length === 0 && <p className="text-xs text-gray-400">No active engagements.</p>}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 text-sm mb-4">Recent Activity</h2>
        {data.activity.length === 0 ? (
          <p className="text-sm text-gray-400">No activity recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {data.activity.map(a => (
              <div key={a.id} className="flex items-start gap-3">
                <span className="text-base flex-shrink-0 leading-none mt-0.5">{EVENT_ICONS[a.event_type] || '•'}</span>
                <div>
                  <p className="text-sm text-gray-700">{a.description}</p>
                  <p className="text-xs text-gray-400">{new Date(a.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
