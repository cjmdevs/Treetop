import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { engagementsApi } from '../api/engagements'
import { staffApi } from '../api/staff'
import { templatesApi } from '../api/templates'

const TYPES       = ['Tax Return', 'Bookkeeping', 'Audit', 'Advisory', 'Payroll', 'Other']
const STATUSES    = ['Not Started', 'In Progress', 'In Review', 'Complete', 'On Hold']
const PRIORITIES  = ['Low', 'Medium', 'High']
const RECURRENCES = ['None', 'Monthly', 'Quarterly', 'Annually']

const BLANK = {
  client_name: '', engagement_type: 'Tax Return', tax_year: '',
  due_date: '', status: 'Not Started', assigned_staff: '', priority: 'Medium', notes: '',
  budgeted_hours: '', budgeted_amount: '', recurrence_frequency: 'None', template_id: '',
}

export default function EngagementForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [form, setForm] = useState(BLANK)
  const [staff, setStaff] = useState([])
  const [templates, setTemplates] = useState([])
  const [saving, setSaving] = useState(false)
  const isEdit = !!id

  useEffect(() => {
    staffApi.list().then(setStaff)
    templatesApi.list().then(setTemplates)
    if (isEdit) {
      engagementsApi.get(id).then(d =>
        setForm({
          client_name:          d.client_name          ?? '',
          engagement_type:      d.engagement_type      ?? 'Tax Return',
          tax_year:             d.tax_year             ?? '',
          due_date:             d.due_date             ?? '',
          status:               d.status               ?? 'Not Started',
          assigned_staff:       d.assigned_staff       ?? '',
          priority:             d.priority             ?? 'Medium',
          notes:                d.notes                ?? '',
          budgeted_hours:       d.budgeted_hours       ?? '',
          budgeted_amount:      d.budgeted_amount      ?? '',
          recurrence_frequency: d.recurrence_frequency ?? 'None',
          template_id:          d.template_id          ?? '',
        })
      )
    }
  }, [id, isEdit])

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        tax_year:        form.tax_year        ? parseInt(form.tax_year)         : null,
        budgeted_hours:  form.budgeted_hours  ? parseFloat(form.budgeted_hours)  : null,
        budgeted_amount: form.budgeted_amount ? parseFloat(form.budgeted_amount) : null,
        template_id:     form.template_id     ? parseInt(form.template_id)       : null,
      }
      if (isEdit) {
        await engagementsApi.update(id, payload)
        navigate(`/engagements/${id}`)
      } else {
        const created = await engagementsApi.create(payload)
        navigate(`/engagements/${created.id}`)
      }
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="p-8 max-w-2xl">
      <button onClick={() => navigate(-1)} className="text-sm text-gray-400 hover:text-gray-600 mb-4">
        ← Back
      </button>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {isEdit ? 'Edit Engagement' : 'New Engagement'}
      </h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div>
          <label className={labelCls}>Client Name *</label>
          <input required value={form.client_name} onChange={set('client_name')} className={inputCls} placeholder="Client name" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Engagement Type *</label>
            <select required value={form.engagement_type} onChange={set('engagement_type')} className={inputCls}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Tax Year</label>
            <input type="number" value={form.tax_year} onChange={set('tax_year')} className={inputCls} placeholder="e.g. 2024" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Due Date</label>
            <input type="date" value={form.due_date} onChange={set('due_date')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select value={form.status} onChange={set('status')} className={inputCls}>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Assigned Staff</label>
            <input
              value={form.assigned_staff} onChange={set('assigned_staff')}
              list="staff-suggestions" className={inputCls} placeholder="Staff member name"
            />
            <datalist id="staff-suggestions">
              {staff.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div>
            <label className={labelCls}>Priority</label>
            <select value={form.priority} onChange={set('priority')} className={inputCls}>
              {PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Budget & Recurrence</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Budgeted Hours</label>
              <input type="number" step="0.5" min="0" value={form.budgeted_hours} onChange={set('budgeted_hours')} className={inputCls} placeholder="e.g. 20" />
            </div>
            <div>
              <label className={labelCls}>Budgeted Amount ($)</label>
              <input type="number" step="0.01" min="0" value={form.budgeted_amount} onChange={set('budgeted_amount')} className={inputCls} placeholder="e.g. 5000" />
            </div>
          </div>
          <div className="mt-4">
            <label className={labelCls}>Recurrence</label>
            <select value={form.recurrence_frequency} onChange={set('recurrence_frequency')} className={inputCls}>
              {RECURRENCES.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
        </div>

        {!isEdit && templates.length > 0 && (
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Workflow Template</p>
            <label className={labelCls}>Apply Template (optional)</label>
            <select value={form.template_id} onChange={set('template_id')} className={inputCls}>
              <option value="">No template</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.subtasks.length} steps)
                </option>
              ))}
            </select>
            {form.template_id && (() => {
              const t = templates.find(t => String(t.id) === String(form.template_id))
              return t ? (
                <ul className="mt-2 space-y-1">
                  {t.subtasks.map(s => (
                    <li key={s.id} className="text-xs text-gray-500 flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full border border-gray-300 inline-block flex-shrink-0" />
                      {s.title}
                    </li>
                  ))}
                </ul>
              ) : null
            })()}
          </div>
        )}

        <div>
          <label className={labelCls}>Notes</label>
          <textarea value={form.notes} onChange={set('notes')} rows={4} className={`${inputCls} resize-none`} placeholder="Optional notes..." />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="px-6 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Engagement'}
          </button>
        </div>
      </form>
    </div>
  )
}
