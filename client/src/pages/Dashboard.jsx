import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardApi }    from '../api/dashboard'
import { timeSummaryApi }  from '../api/timeSummary'
import { useAuth }         from '../context/AuthContext'
import StatCard from '../components/StatCard'
import { StatusBadge } from '../components/Badge'
import {
  ExclamationTriangleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'

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

function UtilizationBar({ name, hours }) {
  const pct = Math.min((hours / 40) * 100, 100)
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-accent'
  const initials = name.split(' ').map(n => n[0]).join('')
  return (
    <div className="flex items-center gap-3">
      <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
        {initials}
      </div>
      <div className="flex-1">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-700 font-medium">{name}</span>
          <span className="font-mono text-gray-500">{hours.toFixed(1)}h / 40h</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

function AdminAlerts() {
  const [alerts, setAlerts] = useState(null)
  const navigate = useNavigate()
  useEffect(() => { timeSummaryApi.alerts().then(setAlerts).catch(() => {}) }, [])
  if (!alerts) return null
  const hasIssues = (alerts.unreleasedPeriods?.length > 0) ||
                    (alerts.overBudget?.length > 0)
  if (!hasIssues) return null
  return (
    <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
        <ExclamationTriangleIcon className="w-4 h-4 text-amber-600" />
        Admin Alerts
      </h2>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {alerts.unreleasedPeriods?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-amber-700 mb-2">
              Unreleased Periods ({alerts.unreleasedPeriods.length})
            </p>
            <div className="space-y-1">
              {alerts.unreleasedPeriods.slice(0, 3).map(p => (
                <div key={p.id} className="text-xs text-amber-800 bg-amber-100 rounded px-2 py-1">
                  P{p.period_number}: {p.start_date} – {p.end_date}
                </div>
              ))}
              {alerts.unreleasedPeriods.length > 3 && (
                <p className="text-xs text-amber-600">+{alerts.unreleasedPeriods.length - 3} more</p>
              )}
            </div>
          </div>
        )}
        {alerts.overBudget?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-amber-700 mb-2">
              Over Budget ({alerts.overBudget.length})
            </p>
            <div className="space-y-1">
              {alerts.overBudget.slice(0, 3).map(e => (
                <div key={e.id}
                  onClick={() => navigate(`/engagements/${e.id}`)}
                  className="flex justify-between text-xs text-amber-800 bg-amber-100 rounded px-2 py-1 cursor-pointer hover:bg-amber-200 transition-colors">
                  <span className="truncate mr-1">{e.client_name}</span>
                  <span className="font-mono font-semibold flex-shrink-0">
                    {Math.round((e.actual_hours / e.budgeted_hours) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const { user }  = useAuth()
  const navigate  = useNavigate()

  useEffect(() => { dashboardApi.stats().then(setStats).catch(console.error) }, [])

  if (!stats) return <div className="p-8 text-gray-400">Loading...</div>

  const totalAR = Object.values(stats.arBuckets || {}).reduce((a, b) => a + b, 0)

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {user?.role === 'admin' && <AdminAlerts />}

      {/* KPI strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Engagements" value={stats.activeEngagements} />
        <StatCard label="Due This Week"       value={stats.dueThisWeek} />
        <StatCard label="Unbilled Hours"      value={`${stats.unbilledHours.toFixed(1)}h`} />
        <StatCard label="Unbilled Amount"     value={`$${(stats.unbilledAmount || 0).toLocaleString()}`} />
      </div>

      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* AR Aging */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm">AR Aging</h2>
          <div className="space-y-2">
            {[
              { label: '0–30 days',  val: stats.arBuckets?.current    || 0, color: 'text-emerald-600' },
              { label: '31–60 days', val: stats.arBuckets?.days31_60  || 0, color: 'text-amber-600' },
              { label: '61–90 days', val: stats.arBuckets?.days61_90  || 0, color: 'text-orange-600' },
              { label: '90+ days',   val: stats.arBuckets?.days90plus || 0, color: 'text-red-600' },
            ].map(({ label, val, color }) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-gray-500">{label}</span>
                <span className={`font-mono font-semibold ${color}`}>${val.toLocaleString()}</span>
              </div>
            ))}
            <div className="border-t border-gray-100 pt-2 flex justify-between text-sm font-semibold">
              <span className="text-gray-700">Total AR</span>
              <span className="font-mono text-gray-900">${totalAR.toLocaleString()}</span>
            </div>
          </div>
          <button onClick={() => navigate('/ar')} className="mt-3 text-xs text-accent hover:text-accent-dark font-medium">
            View full AR →
          </button>
        </div>

        {/* Staff Utilization */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm">Staff Utilization (This Week)</h2>
          <div className="space-y-3">
            {(stats.staffUtilization || []).map(s => (
              <UtilizationBar key={s.staff_member} name={s.staff_member} hours={s.hours_this_week} />
            ))}
            {(!stats.staffUtilization || stats.staffUtilization.length === 0) && (
              <p className="text-xs text-gray-400">No time logged this week.</p>
            )}
          </div>
        </div>

        {/* Budget Alerts */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm flex items-center gap-2">
            <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
            Budget Alerts
          </h2>
          <div className="space-y-3">
            {(stats.budgetAlerts || []).map(e => {
              const pct = Math.round((e.actual_hours / e.budgeted_hours) * 100)
              return (
                <div key={e.id} onClick={() => navigate(`/engagements/${e.id}`)}
                  className="cursor-pointer hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-gray-800 truncate">{e.client_name}</span>
                    <span className={`font-mono font-semibold flex-shrink-0 ml-2 ${pct >= 100 ? 'text-red-600' : 'text-amber-600'}`}>{pct}%</span>
                  </div>
                  <p className="text-xs text-gray-400">{e.actual_hours.toFixed(1)}h of {e.budgeted_hours}h</p>
                </div>
              )
            })}
            {(!stats.budgetAlerts || stats.budgetAlerts.length === 0) && (
              <p className="text-xs text-gray-400">All engagements within budget.</p>
            )}
          </div>
        </div>
      </div>

      {/* Overdue Engagements */}
      {stats.overdueEngagements?.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6">
          <h2 className="font-semibold text-red-700 mb-3 flex items-center gap-2 text-sm">
            <ClockIcon className="w-4 h-4" />
            Overdue ({stats.overdueEngagements.length})
          </h2>
          <div className="space-y-2">
            {stats.overdueEngagements.map(e => (
              <div key={e.id} onClick={() => navigate(`/engagements/${e.id}`)}
                className="flex items-center justify-between cursor-pointer hover:bg-red-100 rounded-lg px-3 py-2 transition-colors">
                <div>
                  <span className="text-sm font-medium text-red-800">{e.client_name}</span>
                  <span className="text-xs text-red-500 ml-2">{e.engagement_type}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-500">{e.assigned_staff || '—'}</span>
                  <span className="text-xs font-mono text-red-700 font-semibold">Due {e.due_date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Due This Week */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm">Due This Week</h2>
          {(stats.dueThisWeekDetail || []).length === 0 ? (
            <p className="text-sm text-gray-400">Nothing due this week.</p>
          ) : (
            <div className="space-y-2">
              {stats.dueThisWeekDetail.map(e => (
                <div key={e.id} onClick={() => navigate(`/engagements/${e.id}`)}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{e.client_name}</p>
                    <p className="text-xs text-gray-400">{e.engagement_type} · {e.assigned_staff || '—'}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="text-xs font-mono text-gray-600">{e.due_date}</p>
                    <StatusBadge status={e.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm">Recent Activity</h2>
          {(stats.recentActivity || []).length === 0 ? (
            <p className="text-sm text-gray-400">No activity yet.</p>
          ) : (
            <div className="space-y-3 overflow-y-auto max-h-60">
              {stats.recentActivity.map(a => (
                <div key={a.id} className="flex items-start gap-2.5">
                  <span className="text-sm flex-shrink-0 leading-none mt-0.5">{EVENT_ICONS[a.event_type] || '•'}</span>
                  <div>
                    <p className="text-xs text-gray-700 leading-snug">{a.description}</p>
                    <p className="text-xs text-gray-400">{new Date(a.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Engagements */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Engagements</h2>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {stats.recentEngagements.map(e => (
          <div key={e.id} onClick={() => navigate(`/engagements/${e.id}`)}
            className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors">
            <div>
              <p className="font-medium text-gray-900">{e.client_name}</p>
              <p className="text-sm text-gray-500">
                {e.engagement_type}{e.tax_year ? ` · ${e.tax_year}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={e.status} />
              <span className="text-sm text-gray-400 w-32 text-right truncate">{e.assigned_staff || '—'}</span>
            </div>
          </div>
        ))}
        {stats.recentEngagements.length === 0 && (
          <p className="px-5 py-8 text-center text-gray-400">No engagements yet.</p>
        )}
      </div>
    </div>
  )
}
