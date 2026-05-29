import EngagementCard from './EngagementCard'

const COLUMNS = ['Not Started', 'In Progress', 'In Review', 'Complete', 'On Hold']
const COL_BORDER = {
  'Not Started': 'border-gray-300',
  'In Progress': 'border-blue-400',
  'In Review':   'border-yellow-400',
  'Complete':    'border-green-400',
  'On Hold':     'border-red-400',
}

export default function KanbanBoard({ engagements }) {
  const byStatus = Object.fromEntries(
    COLUMNS.map(s => [s, engagements.filter(e => e.status === s)])
  )

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {COLUMNS.map(status => (
        <div key={status} className="flex-shrink-0 w-72">
          <div className={`border-t-2 ${COL_BORDER[status]} bg-gray-50 rounded-xl p-3`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-gray-700">{status}</h3>
              <span className="bg-gray-200 text-gray-600 text-xs rounded-full px-2 py-0.5">
                {byStatus[status].length}
              </span>
            </div>
            <div className="space-y-3">
              {byStatus[status].map(e => (
                <EngagementCard key={e.id} engagement={e} />
              ))}
              {byStatus[status].length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">Empty</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
