import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { projectsApi } from '../api/projects'
import { subtasksApi } from '../api/subtasks'
import { notesApi } from '../api/notes'
import { activityApi } from '../api/activity'
import { timeEntriesApi } from '../api/timeEntries'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useStatuses, makeStatusStyle } from '../context/StatusesContext'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  PencilSquareIcon,
  CheckCircleIcon,
  PlusIcon,
  ChevronRightIcon,
  DocumentDuplicateIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'

// ── Status badge ─────────────────────────────────────────────────────────────

// Legacy fallback colors — only used if context hasn't loaded yet
const FALLBACK_COLORS = {
  'Not Started': '#94A3B8', 'In Progress': '#3B82F6', 'Awaiting Client': '#F59E0B',
  'In Review': '#8B5CF6', 'Extension Filed': '#F97316', 'Completed': '#10B981', 'Delivered': '#14B8A6',
}

function StatusBadge({ status }) {
  const { byLabel } = useStatuses()
  const color = byLabel[status]?.color || FALLBACK_COLORS[status] || '#94A3B8'
  const s = makeStatusStyle(color)
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium"
      style={{ ...s.bgStyle, ...s.textStyle }}>
      <span className="w-2 h-2 rounded-full" style={s.dotStyle} />
      {status}
    </span>
  )
}

function InlineStatusBadge({ status }) {
  const { byLabel } = useStatuses()
  const color = byLabel[status]?.color || FALLBACK_COLORS[status] || '#94A3B8'
  const s = makeStatusStyle(color)
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ ...s.bgStyle, ...s.textStyle }}>
      {status}
    </span>
  )
}

const TODAY = new Date().toISOString().split('T')[0]

function isOverdue(project) {
  return project?.current_due && project.current_due < TODAY &&
    project.status !== 'Completed' && project.status !== 'Delivered'
}

// ── Budget panel (reused from EngagementDetail) ───────────────────────────────

function BudgetPanel({ budgetedHours, budgetedAmount, actualHours, actualAmount }) {
  if (!budgetedHours && !budgetedAmount) return null
  const pct = (a, b) => b ? Math.min((a / b) * 100, 100) : 0
  const hPct = pct(actualHours, budgetedHours)
  const aPct = pct(actualAmount, budgetedAmount)
  const color = p => p >= 100 ? 'bg-red-500' : p >= 80 ? 'bg-amber-400' : 'bg-emerald-500'
  const textColor = p => p >= 100 ? 'text-red-600' : p >= 80 ? 'text-amber-600' : 'text-emerald-600'
  return (
    <div className="grid grid-cols-2 gap-4">
      {budgetedHours && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>Hours</span>
            <span className={`font-mono font-medium ${textColor(hPct)}`}>{(actualHours||0).toFixed(1)} / {budgetedHours}h ({Math.round(hPct)}%)</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${color(hPct)} transition-all`} style={{ width: `${hPct}%` }} />
          </div>
        </div>
      )}
      {budgetedAmount && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>Fees</span>
            <span className={`font-mono font-medium ${textColor(aPct)}`}>${(actualAmount||0).toLocaleString()} / ${budgetedAmount.toLocaleString()} ({Math.round(aPct)}%)</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${color(aPct)} transition-all`} style={{ width: `${aPct}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

function MilestonesPanel({ project }) {
  const toast = useToast()
  const [fields, setFields] = useState([])
  const [values, setValues] = useState({})  // fieldId → value string
  const saveTimer = useRef({})

  useEffect(() => {
    projectsApi.milestoneFields().then(setFields).catch(() => {})
    projectsApi.getMilestones(project.id)
      .then(rows => {
        const map = {}
        rows.forEach(r => { map[r.field_definition_id] = r.value ?? '' })
        setValues(map)
      })
      .catch(() => {})
  }, [project.id])

  const saveVal = (fieldId, val) => {
    clearTimeout(saveTimer.current[fieldId])
    saveTimer.current[fieldId] = setTimeout(() => {
      projectsApi.saveMilestone(project.id, fieldId, val || null)
        .catch(() => toast.error('Failed to save milestone'))
    }, 600)
  }

  const handleChange = (fieldId, val) => {
    setValues(v => ({ ...v, [fieldId]: val }))
    saveVal(fieldId, val)
  }

  if (fields.length === 0) return null

  const inp = 'border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-accent'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mt-4">
      <h3 className="font-medium text-gray-900 mb-4">Milestones</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {fields.map(f => {
          const val = values[f.id] ?? ''
          return (
            <div key={f.id} className="flex items-center justify-between gap-3">
              <label className="text-xs text-gray-400 flex-shrink-0 w-36">{f.field_name}</label>
              {f.field_type === 'Date' && (
                <input type="date" value={val} onChange={e => handleChange(f.id, e.target.value)} className={inp} />
              )}
              {f.field_type === 'Checkbox' && (
                <input type="checkbox" checked={val === '1' || val === 'true' || val === 'Yes'}
                  onChange={e => handleChange(f.id, e.target.checked ? '1' : '')}
                  className="rounded border-gray-300 accent-accent h-4 w-4" />
              )}
              {f.field_type === 'Dropdown' && (() => {
                let opts = []
                try { opts = JSON.parse(f.dropdown_options || '[]') } catch {}
                return (
                  <select value={val} onChange={e => handleChange(f.id, e.target.value)} className={inp}>
                    <option value="">—</option>
                    {opts.map(o => <option key={o}>{o}</option>)}
                  </select>
                )
              })()}
              {f.field_type === 'Text' && (
                <input type="text" value={val} onChange={e => handleChange(f.id, e.target.value)}
                  placeholder="—" className={inp} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function OverviewTab({ project, onUpdate }) {
  const navigate = useNavigate()

  const Field = ({ label, value }) => (
    <div className="flex items-start justify-between py-2 border-b border-gray-50 last:border-0">
      <dt className="text-xs text-gray-400 w-36 flex-shrink-0 pt-0.5">{label}</dt>
      <dd className="text-sm text-gray-800 text-right">{value || <span className="text-gray-300">—</span>}</dd>
    </div>
  )

  const over = isOverdue(project)

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Left: Details */}
      <div className="col-span-2 space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gray-900">Project Details</h3>
            <button onClick={() => navigate(`/projects/${project.id}/edit`)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-accent">
              <PencilSquareIcon className="w-3.5 h-3.5" /> Edit
            </button>
          </div>
          <dl>
            <Field label="Client" value={<Link to={`/projects/by-client/${encodeURIComponent(project.client_name)}`} className="text-accent hover:underline">{project.client_name}</Link>} />
            <Field label="Project Type" value={project.project_type} />
            <Field label="Entity Type" value={project.entity_type} />
            <Field label="Period / Year" value={project.period_label} />
            <Field label="Client #" value={project.client_number} />
            <Field label="Engagement #" value={project.engagement_number} />
            <Field label="Fiscal Year End" value={project.fiscal_year_end} />
            <Field label="Priority" value={project.priority} />
            <Field label="Extension Filed" value={project.extended ? <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded font-medium">Yes — Extension Filed</span> : 'No'} />
          </dl>
        </div>

        {/* Dates */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-medium text-gray-900 mb-3">Dates</h3>
          <dl>
            <Field label="Original Due" value={project.original_due} />
            <Field label="Current Due" value={
              <span className={over ? 'text-red-600 font-medium flex items-center gap-1 justify-end' : ''}>
                {over && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                {project.current_due}
                {over && <span className="text-xs text-red-500 ml-1">(overdue)</span>}
              </span>
            } />
            <Field label="Start Date" value={project.start_date} />
            <Field label="Completed" value={project.completed_date} />
            <Field label="Delivered" value={project.delivered_date} />
          </dl>
        </div>

        {/* Milestones */}
        <MilestonesPanel project={project} />

        {/* Budget */}
        {(project.budgeted_hours || project.budgeted_amount) && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-medium text-gray-900 mb-4">Budget</h3>
            <BudgetPanel
              budgetedHours={project.budgeted_hours}
              budgetedAmount={project.budgeted_amount}
              actualHours={project.timeSummary?.total_hours || 0}
              actualAmount={project.timeSummary?.total_amount || 0}
            />
          </div>
        )}
      </div>

      {/* Right: Roles + Status */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-medium text-gray-900 mb-3">Status</h3>
          <StatusChanger project={project} onUpdate={onUpdate} />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-medium text-gray-900 mb-3">Team</h3>
          <dl className="space-y-2.5">
            {[
              ['Primary Partner', project.primary_partner],
              ['Manager', project.manager],
              ['Preparer', project.preparer],
              ['Reviewer', project.reviewer],
              ['In Charge', project.in_charge],
            ].map(([role, name]) => (
              <div key={role} className="flex items-center justify-between">
                <dt className="text-xs text-gray-400">{role}</dt>
                <dd className="text-xs text-gray-700 font-medium">{name || <span className="text-gray-300">—</span>}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Time summary */}
        {project.timeSummary && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-medium text-gray-900 mb-3">Time</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-2xl font-bold font-mono text-gray-900">{(project.timeSummary.total_hours || 0).toFixed(1)}</p>
                <p className="text-xs text-gray-400">Hours</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-mono text-gray-900">${(project.timeSummary.total_amount || 0).toLocaleString()}</p>
                <p className="text-xs text-gray-400">Billable</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusChanger({ project, onUpdate }) {
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  const change = async (status) => {
    if (status === project.status) return
    setLoading(true)
    try {
      const updated = await projectsApi.setStatus(project.id, status)
      onUpdate(updated)
      toast.success(`Status → ${status}`)
    } catch {
      toast.error('Failed to update status')
    } finally {
      setLoading(false)
    }
  }

  const { activeStatuses } = useStatuses()
  return (
    <div className="space-y-1.5">
      {activeStatuses.map(({ label, color }) => {
        const s = makeStatusStyle(color)
        const active = project.status === label
        return (
          <button
            key={label}
            onClick={() => change(label)}
            disabled={loading}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all text-left ${active ? 'ring-2 ring-offset-1' : 'text-gray-500 hover:bg-gray-50'}`}
            style={active ? { ...s.bgStyle, ...s.textStyle } : {}}
          >
            <span className="w-2 h-2 rounded-full" style={s.dotStyle} />
            {label}
            {active && <span className="ml-auto text-xs">✓</span>}
          </button>
        )
      })}
    </div>
  )
}

function TasksTab({ project, onUpdate }) {
  const toast = useToast()
  const [subtasks, setSubtasks] = useState(project.subtasks || [])
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')

  const load = async () => {
    const data = await projectsApi.get(project.id)
    setSubtasks(data.subtasks || [])
  }

  const toggle = async (s) => {
    try {
      await subtasksApi.update(project.engagement_id, s.id, {
        ...s, status: s.status === 'Complete' ? 'Not Started' : 'Complete'
      })
      load()
    } catch { toast.error('Failed to update task') }
  }

  const addTask = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    try {
      await subtasksApi.create(project.engagement_id, {
        title, project_id: project.id, sort_order: subtasks.length
      })
      setTitle(''); setAdding(false); load()
    } catch { toast.error('Failed to add task') }
  }

  const deleteTask = async (id) => {
    try {
      await subtasksApi.delete(project.engagement_id, id)
      load()
    } catch { toast.error('Failed to delete task') }
  }

  const complete = subtasks.filter(s => s.status === 'Complete').length
  const pct = subtasks.length > 0 ? Math.round((complete / subtasks.length) * 100) : 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gray-900">Checklist</h3>
          {subtasks.length > 0 && (
            <span className="text-xs text-gray-400 font-mono">{complete}/{subtasks.length} · {pct}%</span>
          )}
        </div>
        <button onClick={() => setAdding(v => !v)} className="flex items-center gap-1 text-xs text-accent hover:text-blue-700">
          <PlusIcon className="w-4 h-4" /> Add step
        </button>
      </div>

      {subtasks.length > 0 && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-5">
          <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      )}

      <div className="space-y-1">
        {subtasks.map(s => (
          <div key={s.id} className="flex items-center gap-3 py-2 group">
            <button onClick={() => toggle(s)} className="flex-shrink-0">
              {s.status === 'Complete'
                ? <CheckCircleSolid className="w-5 h-5 text-accent" />
                : <CheckCircleIcon className="w-5 h-5 text-gray-300 hover:text-gray-400" />}
            </button>
            <span className={`text-sm flex-1 ${s.status === 'Complete' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
              {s.title}
            </span>
            {s.assigned_staff && (
              <span className="text-xs text-gray-300 opacity-0 group-hover:opacity-100">{s.assigned_staff}</span>
            )}
            <button onClick={() => deleteTask(s.id)} className="text-gray-300 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
          </div>
        ))}
        {subtasks.length === 0 && !adding && (
          <p className="text-sm text-gray-400 py-4 text-center">No checklist steps yet.</p>
        )}
      </div>

      {adding && (
        <form onSubmit={addTask} className="flex gap-2 mt-3">
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Step title…"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
          <button type="submit" className="px-3 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-blue-700">Add</button>
          <button type="button" onClick={() => setAdding(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
        </form>
      )}
    </div>
  )
}

function TimeTab({ project }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    timeEntriesApi.list({ project_id: project.id })
      .then(setEntries)
      .finally(() => setLoading(false))
  }, [project.id])

  const thCls = 'pb-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide'
  const tdCls = 'py-2.5 text-sm text-gray-700'

  if (loading) return <div className="text-sm text-gray-400 p-4">Loading…</div>

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-4">Time Entries ({entries.length})</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-400">No time entries linked to this project yet.</p>
      ) : (
        <>
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100">
              <tr>{['Date','Staff','Hours','Code','Rate','Billable','Status','Notes'].map(h => (
                <th key={h} className={thCls}>{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.map(t => (
                <tr key={t.id}>
                  <td className={`${tdCls} font-mono`}>{t.date}</td>
                  <td className={tdCls}>{t.staff_member}</td>
                  <td className={`${tdCls} font-mono`}>{t.hours}h</td>
                  <td className={tdCls}>{t.service_code || '—'}</td>
                  <td className={`${tdCls} font-mono`}>{t.billing_rate ? `$${t.billing_rate}/hr` : '—'}</td>
                  <td className="py-2.5"><span className={t.billable ? 'text-emerald-600 text-sm' : 'text-gray-400 text-sm'}>{t.billable ? 'Yes' : 'No'}</span></td>
                  <td className="py-2.5">
                    <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">{t.entry_status}</span>
                  </td>
                  <td className="py-2.5 text-sm text-gray-500 max-w-[200px] truncate">{t.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 pt-4 border-t border-gray-100 flex gap-6 text-sm">
            <span className="text-gray-500">Total: <span className="font-mono font-semibold text-gray-900">{entries.reduce((s, e) => s + e.hours, 0).toFixed(1)}h</span></span>
            <span className="text-gray-500">Billable: <span className="font-mono font-semibold text-gray-900">${entries.filter(e => e.billable).reduce((s, e) => s + e.hours * (e.billing_rate || 0), 0).toLocaleString()}</span></span>
          </div>
        </>
      )}
    </div>
  )
}

const EVENT_ICONS = {
  project_created: '📋', status_changed: '🔄', project_rolled_forward: '↻',
  subtask_completed: '✓', note_added: '📝',
}

function NotesActivityTab({ project }) {
  const [items, setItems]   = useState([])
  const [text, setText]     = useState('')
  const [category, setCat]  = useState('General')
  const CATS = ['General','Tax','Client','Internal','Billing']

  const load = async () => {
    const [acts, notes] = await Promise.all([
      activityApi.list({ entity_type: 'project', entity_id: project.id }),
      notesApi.list({ entity_type: 'project', entity_id: project.id }),
    ])
    const merged = [
      ...acts.map(a => ({ ...a, _kind: 'activity', _time: new Date(a.created_at) })),
      ...notes.map(n => ({ ...n, _kind: 'note', _time: new Date(n.created_at) })),
    ].sort((a, b) => b._time - a._time)
    setItems(merged)
  }

  useEffect(() => { load() }, [project.id])

  const addNote = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    await notesApi.create({ entity_type: 'project', entity_id: project.id, note_text: text, category })
    setText(''); load()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-5">Notes & Activity</h3>

      <form onSubmit={addNote} className="flex gap-2 mb-6">
        <select value={category} onChange={e => setCat(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent">
          {CATS.map(c => <option key={c}>{c}</option>)}
        </select>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Add a note…"
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
        <button type="submit" className="px-3 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-blue-700">Add</button>
      </form>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400">No activity yet.</p>
      ) : (
        <div className="space-y-4">
          {items.map((item, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-sm">
                {item._kind === 'note' ? '📝' : (EVENT_ICONS[item.event_type] || '•')}
              </div>
              <div className="flex-1 min-w-0">
                {item._kind === 'note' ? (
                  <div className={`rounded-lg p-3 border ${item.pinned ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}>
                    <p className="text-sm text-gray-700">{item.note_text}</p>
                    <p className="text-xs text-gray-400 mt-1">{item.category} · {item.created_by || '—'}</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700">{item.description}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">{item._time.toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function HistoryTab({ project }) {
  const navigate = useNavigate()
  const [chain, setChain] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const buildChain = async () => {
      // Get all projects for this client, sorted by period
      try {
        const all = await projectsApi.byClient(project.client_name)
        // Filter to same engagement
        const forEng = all
          .filter(p => p.engagement_id === project.engagement_id)
          .sort((a, b) => String(a.period_label).localeCompare(String(b.period_label), undefined, { numeric: true }))
        setChain(forEng)
      } catch {}
      setLoading(false)
    }
    buildChain()
  }, [project.id, project.client_name, project.engagement_id])

  if (loading) return <div className="text-sm text-gray-400 p-4">Loading…</div>

  // HistoryTab uses context-driven colors for status badges

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="font-semibold text-gray-900 mb-2">Engagement History</h3>
      <p className="text-xs text-gray-400 mb-6">{project.client_name} · {project.engagement_type} · All periods</p>

      {chain.length === 0 ? (
        <p className="text-sm text-gray-400">No prior periods found.</p>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />

          <div className="space-y-4">
            {chain.map((p, idx) => {
              const isCurrent = p.id === project.id
              const isLast = idx === chain.length - 1
              return (
                <div key={p.id} className="relative flex items-start gap-4 pl-10">
                  {/* Dot */}
                  <div className={`absolute left-2.5 mt-2 w-3 h-3 rounded-full border-2 border-white ${isCurrent ? 'bg-accent ring-2 ring-accent/30' : 'bg-gray-300'}`} />

                  <button
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className={`flex-1 text-left rounded-xl border p-4 transition-all ${
                      isCurrent ? 'border-accent/30 bg-accent/5 shadow-sm' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-sm text-gray-900">{p.period_label}</span>
                        {isCurrent && <span className="text-xs text-accent font-medium">← current</span>}
                        {p.extended === 1 && <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-medium">EXT</span>}
                      </div>
                      <InlineStatusBadge status={p.status} />
                    </div>
                    <div className="flex gap-4 mt-2 text-xs text-gray-400">
                      {p.original_due && <span>Due: <span className="text-gray-600">{p.original_due}</span></span>}
                      {p.delivered_date && <span>Delivered: <span className="text-gray-600">{p.delivered_date}</span></span>}
                      {p.preparer && <span>Preparer: <span className="text-gray-600">{p.preparer}</span></span>}
                    </div>
                  </button>

                  {!isLast && (
                    <div className="absolute left-3.5 bottom-0 -mb-3">
                      <ChevronRightIcon className="w-3 h-3 text-gray-300 rotate-90" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ProjectDetail ────────────────────────────────────────────────────────

const TABS = [
  { key: 'overview',  label: 'Overview' },
  { key: 'tasks',     label: 'Tasks' },
  { key: 'time',      label: 'Time' },
  { key: 'notes',     label: 'Notes & Activity' },
  { key: 'history',   label: 'History' },
]

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const [project, setProject] = useState(null)
  const [tab, setTab] = useState('overview')
  const [rolling, setRolling] = useState(false)
  const [dupOpen, setDupOpen]   = useState(false)
  const [dupPeriod, setDupPeriod] = useState('')
  const [dupSaving, setDupSaving] = useState(false)

  useEffect(() => {
    projectsApi.get(id).then(data => {
      setProject({ ...data, engagement_id: data.engagement_id })
    })
  }, [id])

  const handleRollForward = async () => {
    if (!confirm(`Roll ${project.client_name} (${project.period_label}) forward to the next period?`)) return
    setRolling(true)
    try {
      const next = await projectsApi.rollForward(project.id)
      toast.addToast(`Created ${next.period_label} project`, 'success')
      navigate(`/projects/${next.id}`)
    } catch {
      toast.addToast('Roll-forward failed', 'error')
    } finally {
      setRolling(false)
    }
  }

  const handleDuplicate = async (e) => {
    e.preventDefault()
    const period = dupPeriod.trim()
    if (!period) return
    setDupSaving(true)
    try {
      const next = await projectsApi.rollForward(project.id, { target_period: period })
      toast.addToast(`Duplicated to ${next.period_label} — edit to fill in details`, 'success')
      setDupOpen(false)
      setDupPeriod('')
      navigate(`/projects/${next.id}/edit`)
    } catch {
      toast.addToast('Duplication failed', 'error')
    } finally {
      setDupSaving(false)
    }
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>
    )
  }

  const over = isOverdue(project)

  return (
    <div className="flex flex-col h-full">
      {/* ─ Header ─ */}
      <div className="px-6 pt-5 pb-0 border-b border-gray-100 bg-white flex-shrink-0">
        <button onClick={() => navigate('/projects')} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-3">
          <ArrowLeftIcon className="w-3.5 h-3.5" /> All Projects
        </button>

        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold text-gray-900">{project.client_name}</h1>
              <StatusBadge status={project.status} />
              {project.extended === 1 && (
                <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full font-medium">Extension Filed</span>
              )}
            </div>
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <span>{project.project_type}{project.entity_type ? ` · ${project.entity_type}` : ''}</span>
              {project.period_label && <span className="font-mono">· {project.period_label}</span>}
            </p>
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
              {project.original_due && <span>Original Due: <span className="text-gray-600 font-mono">{project.original_due}</span></span>}
              {project.current_due && (
                <span className={over ? 'text-red-600 font-medium flex items-center gap-1' : ''}>
                  {over && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                  Current Due: <span className="font-mono ml-1">{project.current_due}</span>
                  {over && ' (overdue)'}
                </span>
              )}
              {project.engagement_type && <span>Type: <span className="text-gray-600">{project.engagement_type}</span></span>}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { setDupPeriod(''); setDupOpen(true) }}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              title="Copy this project to any past or future period"
            >
              <DocumentDuplicateIcon className="w-4 h-4" />
              Duplicate to year
            </button>
            <button
              onClick={handleRollForward}
              disabled={rolling}
              className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <ArrowPathIcon className={`w-4 h-4 ${rolling ? 'animate-spin' : ''}`} />
              Roll Forward
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
              }`}
            >
              {t.label}
              {t.key === 'tasks' && project.subtasks && (
                <span className="ml-1.5 text-xs text-gray-400 font-mono">
                  {project.subtasks.filter(s => s.status === 'Complete').length}/{project.subtasks.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ─ Tab content ─ */}
      <div className="flex-1 overflow-auto p-6">
        {tab === 'overview'  && <OverviewTab project={project} onUpdate={setProject} />}
        {tab === 'tasks'     && <TasksTab project={project} onUpdate={setProject} />}
        {tab === 'time'      && <TimeTab project={project} />}
        {tab === 'notes'     && <NotesActivityTab project={project} />}
        {tab === 'history'   && <HistoryTab project={project} />}
      </div>

      {/* ─ Duplicate to year modal ─ */}
      {dupOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Duplicate to another year</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Copies <span className="font-medium text-gray-700">{project.client_name}</span> · {project.project_type} setup to a new period
                </p>
              </div>
              <button onClick={() => setDupOpen(false)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleDuplicate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Target period <span className="text-red-400">*</span>
                </label>
                <input
                  autoFocus
                  required
                  value={dupPeriod}
                  onChange={e => setDupPeriod(e.target.value)}
                  placeholder="e.g. 2022 · Q1 2025 · Jan 2026"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <p className="text-xs text-gray-400 mt-1.5">
                  Copies type, entity, roles, budget. Dates cleared — fill them in after.
                </p>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setDupOpen(false)}
                  className="flex-1 px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={dupSaving || !dupPeriod.trim()}
                  className="flex-1 px-4 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {dupSaving ? 'Creating…' : 'Duplicate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
