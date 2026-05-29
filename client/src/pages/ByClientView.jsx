import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { projectsApi } from '../api/projects'
import { ArrowLeftIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { useToast } from '../context/ToastContext'

const STATUS_STYLE = {
  'Not Started':     { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400'   },
  'In Progress':     { bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500'   },
  'Awaiting Client': { bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-500'  },
  'In Review':       { bg: 'bg-purple-50',  text: 'text-purple-700', dot: 'bg-purple-500' },
  'Extension Filed': { bg: 'bg-orange-50',  text: 'text-orange-700', dot: 'bg-orange-500' },
  'Completed':       { bg: 'bg-emerald-50', text: 'text-emerald-700',dot: 'bg-emerald-500'},
  'Delivered':       { bg: 'bg-teal-50',    text: 'text-teal-700',   dot: 'bg-teal-500'   },
}

function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE['Not Started']
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  )
}

const TODAY = new Date().toISOString().split('T')[0]

export default function ByClientView() {
  const { clientName } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  const client = decodeURIComponent(clientName)

  const load = async () => {
    try {
      const data = await projectsApi.byClient(client)
      setProjects(data)
    } catch {
      toast.error('Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [client])

  // Group by engagement (engagement_type)
  const byEngagement = projects.reduce((acc, p) => {
    const key = `${p.engagement_id}-${p.engagement_type}`
    if (!acc[key]) acc[key] = { type: p.engagement_type, projects: [] }
    acc[key].projects.push(p)
    return acc
  }, {})

  const handleRollForward = async (project) => {
    try {
      const next = await projectsApi.rollForward(project.id)
      toast.success(`Created ${next.period_label} project`)
      load()
    } catch {
      toast.error('Roll-forward failed')
    }
  }

  const thCls = 'px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide'
  const tdCls = 'px-4 py-3 text-sm'

  return (
    <div className="p-8 max-w-5xl">
      <button onClick={() => navigate('/projects')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4">
        <ArrowLeftIcon className="w-3.5 h-3.5" /> All Projects
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{client}</h1>
        <p className="text-sm text-gray-400 mt-1">All projects across all engagement types and periods</p>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : projects.length === 0 ? (
        <div className="text-sm text-gray-400">No projects found for this client.</div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byEngagement).map(([key, group]) => (
            <div key={key}>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent" />{group.type}
                <span className="font-mono text-gray-300">· {group.projects.length} period{group.projects.length !== 1 ? 's' : ''}</span>
              </h2>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className={thCls}>Period</th>
                      <th className={thCls}>Status</th>
                      <th className={thCls}>Original Due</th>
                      <th className={thCls}>Current Due</th>
                      <th className={thCls}>Delivered</th>
                      <th className={thCls}>Preparer</th>
                      <th className={thCls}>Ext</th>
                      <th className={thCls}></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {group.projects
                      .sort((a, b) => String(b.period_label).localeCompare(String(a.period_label), undefined, { numeric: true }))
                      .map(p => {
                        const over = p.current_due && p.current_due < TODAY && !['Completed','Delivered'].includes(p.status)
                        return (
                          <tr key={p.id}
                            onClick={() => navigate(`/projects/${p.id}`)}
                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                          >
                            <td className={`${tdCls} font-mono font-semibold text-gray-900`}>{p.period_label || '—'}</td>
                            <td className={tdCls}><StatusBadge status={p.status} /></td>
                            <td className={`${tdCls} font-mono text-gray-600 text-xs`}>{p.original_due || '—'}</td>
                            <td className={`${tdCls} font-mono text-xs`}>
                              <span className={`flex items-center gap-1 ${over ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                                {over && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                                {p.current_due || '—'}
                              </span>
                            </td>
                            <td className={`${tdCls} font-mono text-xs text-gray-400`}>{p.delivered_date || '—'}</td>
                            <td className={`${tdCls} text-gray-600`}>{p.preparer || '—'}</td>
                            <td className={tdCls}>
                              {p.extended ? <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">EXT</span> : null}
                            </td>
                            <td className={tdCls} onClick={e => e.stopPropagation()}>
                              {['Completed','Delivered'].includes(p.status) && (
                                <button
                                  onClick={() => handleRollForward(p)}
                                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-accent transition-colors"
                                  title="Roll forward"
                                >
                                  <ArrowPathIcon className="w-3.5 h-3.5" /> Roll
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
