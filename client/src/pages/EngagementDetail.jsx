import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { engagementsApi } from '../api/engagements'
import { subtasksApi } from '../api/subtasks'
import { notesApi } from '../api/notes'
import { activityApi } from '../api/activity'
import { StatusBadge, PriorityBadge, BillingStatusBadge } from '../components/Badge'
import { CheckCircleIcon, PlusIcon } from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckCircleSolid } from '@heroicons/react/24/solid'

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

function BudgetPanel({ budgetedHours, budgetedAmount, actualHours, actualAmount }) {
  if (!budgetedHours && !budgetedAmount) return null
  const hoursPct  = budgetedHours  ? Math.min((actualHours  / budgetedHours)  * 100, 100) : 0
  const amountPct = budgetedAmount ? Math.min((actualAmount / budgetedAmount) * 100, 100) : 0
  const meterColor = pct => pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-400' : 'bg-emerald-500'
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <h2 className="font-semibold text-gray-900 mb-4">Budget</h2>
      <div className="grid grid-cols-2 gap-6">
        {budgetedHours && (
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-500">Hours</span>
              <span className="font-mono font-medium text-gray-900">
                {actualHours.toFixed(1)} / {budgetedHours}h
                <span className={`ml-2 text-xs ${hoursPct >= 100 ? 'text-red-600' : hoursPct >= 75 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  ({Math.round(hoursPct)}%)
                </span>
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${meterColor(hoursPct)}`} style={{ width: `${hoursPct}%` }} />
            </div>
          </div>
        )}
        {budgetedAmount && (
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-500">Fees</span>
              <span className="font-mono font-medium text-gray-900">
                ${actualAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} / ${budgetedAmount.toLocaleString()}
                <span className={`ml-2 text-xs ${amountPct >= 100 ? 'text-red-600' : amountPct >= 75 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  ({Math.round(amountPct)}%)
                </span>
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${meterColor(amountPct)}`} style={{ width: `${amountPct}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SubtasksPanel({ engagementId }) {
  const [subtasks, setSubtasks] = useState([])
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const load = () => subtasksApi.list(engagementId).then(setSubtasks)
  useEffect(() => { load() }, [engagementId])
  const toggle = async s => {
    await subtasksApi.update(engagementId, s.id, { ...s, status: s.status === 'Complete' ? 'Not Started' : 'Complete' })
    load()
  }
  const addSubtask = async e => {
    e.preventDefault()
    if (!title.trim()) return
    await subtasksApi.create(engagementId, { title, sort_order: subtasks.length })
    setTitle(''); setAdding(false); load()
  }
  const deleteSubtask = async id => { await subtasksApi.delete(engagementId, id); load() }
  const complete = subtasks.filter(s => s.status === 'Complete').length
  const pct = subtasks.length > 0 ? Math.round((complete / subtasks.length) * 100) : 0
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-gray-900">Checklist</h2>
          {subtasks.length > 0 && <span className="text-xs text-gray-400">{complete}/{subtasks.length} · {pct}%</span>}
        </div>
        <button onClick={() => setAdding(v => !v)} className="text-accent hover:text-blue-700 text-sm flex items-center gap-1">
          <PlusIcon className="w-4 h-4" /> Add step
        </button>
      </div>
      {subtasks.length > 0 && (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-4">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="space-y-1">
        {subtasks.map(s => (
          <div key={s.id} className="flex items-center gap-3 py-1.5 group">
            <button onClick={() => toggle(s)} className="flex-shrink-0">
              {s.status === 'Complete'
                ? <CheckCircleSolid className="w-5 h-5 text-accent" />
                : <CheckCircleIcon className="w-5 h-5 text-gray-300 hover:text-gray-400" />}
            </button>
            <span className={`text-sm flex-1 ${s.status === 'Complete' ? 'line-through text-gray-400' : 'text-gray-700'}`}>{s.title}</span>
            {s.assigned_staff && <span className="text-xs text-gray-400 hidden group-hover:inline">{s.assigned_staff}</span>}
            <button onClick={() => deleteSubtask(s.id)} className="text-gray-300 hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">×</button>
          </div>
        ))}
      </div>
      {adding && (
        <form onSubmit={addSubtask} className="flex gap-2 mt-3">
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Step title..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
          <button type="submit" className="px-3 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-blue-700">Add</button>
          <button type="button" onClick={() => setAdding(false)} className="px-3 py-1.5 text-sm text-gray-500">Cancel</button>
        </form>
      )}
      {subtasks.length === 0 && !adding && <p className="text-sm text-gray-400">No checklist steps yet.</p>}
    </div>
  )
}

function NotesPanel({ engagementId }) {
  const [notes, setNotes] = useState([])
  const [text, setText] = useState('')
  const [category, setCategory] = useState('General')
  const load = () => notesApi.list({ entity_type: 'engagement', entity_id: engagementId }).then(setNotes)
  useEffect(() => { load() }, [engagementId])
  const addNote = async e => {
    e.preventDefault()
    if (!text.trim()) return
    await notesApi.create({ entity_type: 'engagement', entity_id: engagementId, note_text: text, category })
    setText(''); load()
  }
  const togglePin = async n => { await notesApi.update(n.id, { ...n, pinned: !n.pinned }); load() }
  const deleteNote = async id => { await notesApi.delete(id); load() }
  const CATS = ['General', 'Tax', 'Client', 'Internal', 'Billing']
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <h2 className="font-semibold text-gray-900 mb-4">Notes</h2>
      <div className="space-y-3 mb-4">
        {notes.map(n => (
          <div key={n.id} className={`rounded-lg p-3 text-sm group border ${n.pinned ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-gray-700 flex-1">{n.note_text}</p>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button onClick={() => togglePin(n)} className={`text-xs ${n.pinned ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500'}`}>📌</button>
                <button onClick={() => deleteNote(n.id)} className="text-gray-300 hover:text-red-400 text-xs">×</button>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs text-gray-400">{n.category}</span>
              {n.created_by && <span className="text-xs text-gray-400">· {n.created_by}</span>}
              <span className="text-xs text-gray-300">· {new Date(n.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
        {notes.length === 0 && <p className="text-sm text-gray-400">No notes yet.</p>}
      </div>
      <form onSubmit={addNote} className="flex gap-2">
        <select value={category} onChange={e => setCategory(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent">
          {CATS.map(c => <option key={c}>{c}</option>)}
        </select>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Add a note..."
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
        <button type="submit" className="px-3 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-blue-700">Add</button>
      </form>
    </div>
  )
}

function ActivityPanel({ engagementId }) {
  const [items, setItems] = useState([])
  const [notes, setNotes] = useState([])

  useEffect(() => {
    Promise.all([
      activityApi.list({ entity_type: 'engagement', entity_id: engagementId }),
      notesApi.list({ entity_type: 'engagement', entity_id: engagementId }),
    ]).then(([acts, nts]) => {
      const merged = [
        ...acts.map(a => ({ ...a, _kind: 'activity', _time: new Date(a.created_at) })),
        ...nts.map(n => ({ ...n, _kind: 'note', _time: new Date(n.created_at) })),
      ].sort((a, b) => b._time - a._time)
      setItems(merged)
    })
  }, [engagementId])

  if (items.length === 0) return <p className="text-sm text-gray-400">No activity yet.</p>

  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={i} className="flex gap-3 items-start">
          <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 text-sm">
            {item._kind === 'note'
              ? '📝'
              : (EVENT_ICONS[item.event_type] || '•')}
          </div>
          <div className="flex-1">
            {item._kind === 'note' ? (
              <div className={`rounded-lg p-3 border ${item.pinned ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50'}`}>
                <p className="text-sm text-gray-700">{item.note_text}</p>
                <p className="text-xs text-gray-400 mt-1">{item.category} · {item.created_by || '—'}</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-700">{item.description}</p>
                {item.staff_member && <p className="text-xs text-gray-400">{item.staff_member}</p>}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">{item._time.toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function EngagementDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('overview')

  useEffect(() => { engagementsApi.get(id).then(setData) }, [id])

  if (!data) return <div className="p-8 text-gray-400">Loading...</div>

  const handleDelete = async () => {
    if (!confirm(`Delete engagement for ${data.client_name}?`)) return
    await engagementsApi.delete(id)
    navigate('/engagements')
  }

  const thCls = 'pb-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide'
  const tdCls = 'py-2.5 text-sm text-gray-700'

  return (
    <div className="p-8 max-w-4xl">
      <button onClick={() => navigate('/engagements')} className="text-sm text-gray-400 hover:text-gray-600 mb-3">
        ← All Engagements
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{data.client_name}</h1>
          <p className="text-gray-500 mt-1">
            {data.engagement_type}{data.tax_year ? ` · ${data.tax_year}` : ''}
            {data.recurrence_frequency !== 'None' && (
              <span className="ml-2 text-xs bg-blue-50 text-accent px-2 py-0.5 rounded-full">↻ {data.recurrence_frequency}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/engagements/${id}/edit`)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Edit</button>
          <button onClick={handleDelete} className="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">Delete</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {[['overview','Overview'],['activity','Activity']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === key ? 'border-accent text-accent' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'activity' ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-5">Activity Timeline</h2>
          <ActivityPanel engagementId={id} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Details</h2>
              <dl className="space-y-3 text-sm">
                {[
                  ['Status',      <StatusBadge status={data.status} />],
                  ['Priority',    <PriorityBadge priority={data.priority} />],
                  ['Assigned To', data.assigned_staff || '—'],
                  ['Due Date',    data.due_date || '—'],
                  ['Created',     new Date(data.created_at).toLocaleDateString()],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between items-center">
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="text-gray-900">{val}</dd>
                  </div>
                ))}
              </dl>
              {data.notes && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-sm text-gray-700">{data.notes}</p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Time Summary</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-2xl font-bold font-mono text-gray-900">{data.totalHours.toFixed(1)}h</p>
                  <p className="text-sm text-gray-500">Total Hours</p>
                </div>
                <div>
                  <p className="text-2xl font-bold font-mono text-gray-900">${data.totalBillable.toLocaleString()}</p>
                  <p className="text-sm text-gray-500">Billable Amount</p>
                </div>
              </div>
            </div>
          </div>

          <BudgetPanel budgetedHours={data.budgeted_hours} budgetedAmount={data.budgeted_amount}
            actualHours={data.totalHours} actualAmount={data.totalBillable} />
          <SubtasksPanel engagementId={id} />
          <NotesPanel engagementId={id} />

          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-4">Time Entries</h2>
            {data.timeEntries.length === 0 ? (
              <p className="text-sm text-gray-400">No time entries yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100">
                  <tr>{['Date','Staff','Hours','Code','Rate','Billable','Notes'].map(h => <th key={h} className={thCls}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.timeEntries.map(t => (
                    <tr key={t.id}>
                      <td className={tdCls}>{t.date}</td>
                      <td className={tdCls}>{t.staff_member}</td>
                      <td className={`${tdCls} font-mono`}>{t.hours}h</td>
                      <td className={tdCls}>{t.service_code || '—'}</td>
                      <td className={`${tdCls} font-mono`}>{t.billing_rate ? `$${t.billing_rate}/hr` : '—'}</td>
                      <td className="py-2.5"><span className={t.billable ? 'text-green-600 text-sm' : 'text-gray-400 text-sm'}>{t.billable ? 'Yes' : 'No'}</span></td>
                      <td className="py-2.5 text-sm text-gray-500">{t.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Billing Records</h2>
            {data.billing.length === 0 ? (
              <p className="text-sm text-gray-400">No billing records yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100">
                  <tr>{['Status','Amount','Invoice Date','Notes'].map(h => <th key={h} className={thCls}>{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.billing.map(b => (
                    <tr key={b.id}>
                      <td className="py-2.5"><BillingStatusBadge status={b.status} /></td>
                      <td className={`${tdCls} font-mono`}>${b.invoice_amount.toLocaleString()}</td>
                      <td className={tdCls}>{b.invoice_date || '—'}</td>
                      <td className="py-2.5 text-sm text-gray-500">{b.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
