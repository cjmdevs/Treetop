import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffApi } from '../api/staff'
import { StatusBadge } from '../components/Badge'

export default function Staff() {
  const [staffData, setStaffData] = useState([])
  const navigate = useNavigate()

  useEffect(() => { staffApi.dashboard().then(setStaffData) }, [])

  const goToDetail = (e, name) => {
    e.stopPropagation()
    navigate(`/staff/${encodeURIComponent(name)}`)
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Staff</h1>

      <div className="space-y-6">
        {staffData.map(member => (
          <div key={member.name} className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                  {member.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <button onClick={e => goToDetail(e, member.name)}
                    className="font-semibold text-gray-900 hover:text-accent transition-colors">
                    {member.name}
                  </button>
                  <p className="text-sm text-gray-500">
                    {member.activeCount} active engagement{member.activeCount !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-gray-900">{member.weeklyHours.toFixed(1)}h</p>
                <p className="text-xs text-gray-400">logged this week</p>
              </div>
            </div>

            {member.engagements.length > 0 ? (
              <div className="space-y-2 border-t border-gray-100 pt-4">
                {member.engagements.map(e => (
                  <div
                    key={e.id}
                    onClick={() => navigate(`/engagements/${e.id}`)}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{e.client_name}</p>
                      <p className="text-xs text-gray-500">
                        {e.engagement_type}{e.due_date ? ` · Due ${e.due_date}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={e.status} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 border-t border-gray-100 pt-4">
                No active engagements.
              </p>
            )}
          </div>
        ))}

        {staffData.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            No staff found. Add engagements with staff names to populate this view.
          </div>
        )}
      </div>
    </div>
  )
}
