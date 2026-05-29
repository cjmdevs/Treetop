import { useNavigate } from 'react-router-dom'
import { StatusBadge, PriorityBadge } from './Badge'

function BudgetMeter({ actual, budgeted }) {
  if (!budgeted || budgeted === 0) return null
  const pct = Math.min((actual / budgeted) * 100, 100)
  const color = pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-400' : 'bg-emerald-500'
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{actual.toFixed(1)}h / {budgeted}h budgeted</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function SubtaskProgress({ total, complete }) {
  if (!total || total === 0) return null
  const pct = Math.round((complete / total) * 100)
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>{complete}/{total} steps</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function EngagementCard({ engagement: e }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => navigate(`/engagements/${e.id}`)}
      className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:shadow-md hover:border-accent transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{e.client_name}</p>
          <p className="text-sm text-gray-500 mt-0.5">{e.engagement_type}</p>
        </div>
        <PriorityBadge priority={e.priority} />
      </div>
      <div className="flex items-center justify-between mt-3">
        <StatusBadge status={e.status} />
        <span className="text-xs text-gray-400">
          {e.due_date ? `Due ${e.due_date}` : 'No due date'}
        </span>
      </div>
      {e.assigned_staff && (
        <p className="text-xs text-gray-400 mt-2">{e.assigned_staff}</p>
      )}
      <SubtaskProgress total={e.subtask_count} complete={e.subtask_complete} />
      <BudgetMeter actual={e.actual_hours ?? 0} budgeted={e.budgeted_hours} />
    </div>
  )
}
