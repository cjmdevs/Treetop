import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { projectsApi } from '../api/projects'
import { contactsApi } from '../api/contacts'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useStatuses } from '../context/StatusesContext'
import { ArrowLeftIcon, UsersIcon } from '@heroicons/react/24/outline'

const PROJECT_TYPES = ['1040','1041','1065','1120','1120S','Bookkeeping','Audit','Advisory','Payroll','Other']
const ENTITY_TYPES  = ['Individual','SMLLC','LLC','S-Corp','C-Corp','Partnership','Trust','Non-Profit','Other']
const ENG_TYPES     = ['Tax Return','Bookkeeping','Audit','Advisory','Payroll','Other']
const RECURRENCE    = ['Annually','Quarterly','Monthly','None']
const STAFF_NAMES   = ['Marcus Maurer','Sofia Graf','Diego Rivera','Carson']
const PRIORITIES    = ['Low','Normal','High']

const EMPTY = {
  client_name: '',
  engagement_type: 'Tax Return',
  recurrence_frequency: 'Annually',
  project_type: '1040',
  entity_type: 'Individual',
  period_label: String(new Date().getFullYear()),
  status: 'Not Started',
  original_due: '',
  current_due: '',
  priority: 'Normal',
  primary_partner: '',
  manager: '',
  preparer: '',
  reviewer: '',
  in_charge: '',
  budgeted_hours: '',
  budgeted_amount: '',
  client_number: '',
  engagement_number: '',
  fiscal_year_end: '',
  extended: false,
}

export default function ProjectForm() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const { activeStatuses, defaultStatus } = useStatuses()

  // Group picker state
  const [groups, setGroups] = useState([])
  const [groupSearch, setGroupSearch] = useState('')
  const [groupResults, setGroupResults] = useState([])

  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(!isNew)

  // Pre-fill preparer + default status for new projects
  useEffect(() => {
    if (isNew) {
      setForm(f => ({
        ...f,
        preparer: user?.full_name || f.preparer,
        status: defaultStatus || f.status,
      }))
    }
  }, [isNew, user?.full_name, defaultStatus])

  // Load groups for picker
  useEffect(() => { contactsApi.groups().then(setGroups).catch(() => {}) }, [])

  const searchGroups = async (q) => {
    setGroupSearch(q)
    if (!q.trim()) { setGroupResults([]); return }
    const res = await contactsApi.list({ search: q })
    setGroupResults(res.filter(c => c.client_group_id).slice(0, 8))
  }

  // Load existing project for edit
  useEffect(() => {
    if (!isNew && id) {
      setFetching(true)
      projectsApi.get(id)
        .then(data => {
          setForm({
            client_name:          data.client_name        || '',
            engagement_type:      data.engagement_type    || 'Tax Return',
            recurrence_frequency: data.recurrence_frequency || 'Annually',
            project_type:         data.project_type       || '',
            entity_type:          data.entity_type        || '',
            period_label:         data.period_label       || '',
            status:               data.status             || 'Not Started',
            original_due:         data.original_due       || '',
            current_due:          data.current_due        || '',
            priority:             data.priority           || 'Normal',
            primary_partner:      data.primary_partner    || '',
            manager:              data.manager            || '',
            preparer:             data.preparer           || '',
            reviewer:             data.reviewer           || '',
            in_charge:            data.in_charge          || '',
            budgeted_hours:       data.budgeted_hours     ?? '',
            budgeted_amount:      data.budgeted_amount    ?? '',
            client_number:        data.client_number      || '',
            engagement_number:    data.engagement_number  || '',
            fiscal_year_end:      data.fiscal_year_end    || '',
            extended:             !!data.extended,
          })
        })
        .catch(() => toast.error('Failed to load project'))
        .finally(() => setFetching(false))
    }
  }, [id, isNew])

  const set = (k) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm(f => ({ ...f, [k]: val }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.client_name.trim()) {
      toast.error('Client name is required')
      return
    }
    setLoading(true)
    try {
      const { _client_group_id, _group_label, ...formData } = form
      const payload = {
        ...formData,
        budgeted_hours:  formData.budgeted_hours  !== '' ? Number(formData.budgeted_hours)  : null,
        budgeted_amount: formData.budgeted_amount !== '' ? Number(formData.budgeted_amount) : null,
        extended:        formData.extended ? 1 : 0,
        current_due:     formData.current_due || formData.original_due || null,
      }
      if (isNew) {
        const created = await projectsApi.create(payload)
        // If a group was picked, find/create the contact for this client and assign group
        if (_client_group_id && formData.client_name) {
          const contacts = await contactsApi.list({ search: formData.client_name })
          const match = contacts.find(c => (c.display_name || c.business_name)?.toLowerCase() === formData.client_name.toLowerCase())
          if (match) await contactsApi.setGroup(match.id, _client_group_id)
        }
        toast.success('Project created')
        navigate(`/projects/${created.id}`)
      } else {
        await projectsApi.update(id, payload)
        toast.success('Project saved')
        navigate(`/projects/${id}`)
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to save project')
    } finally {
      setLoading(false)
    }
  }

  const inp = 'border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-accent bg-white'
  const sel = inp
  const lbl = 'text-xs font-medium text-gray-500 mb-1 block'

  if (fetching) {
    return <div className="p-8 text-gray-400">Loading…</div>
  }

  return (
    <div className="p-8 max-w-3xl">
      <button
        onClick={() => navigate(isNew ? '/projects' : `/projects/${id}`)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4"
      >
        <ArrowLeftIcon className="w-3.5 h-3.5" />
        {isNew ? 'All Projects' : 'Back to Project'}
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{isNew ? 'New Project' : 'Edit Project'}</h1>
        {isNew && <p className="text-sm text-gray-400 mt-1">The engagement container is created automatically.</p>}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Client + engagement */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm uppercase tracking-wide">Client & Service</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={lbl}>Client Name *</label>
              <input value={form.client_name} onChange={set('client_name')} required
                placeholder="e.g. Apex Industries LLC"
                className={inp} />
            </div>
            {/* Client group picker */}
            <div className="col-span-2">
              <label className={lbl}>
                <UsersIcon className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
                Client Group <span className="text-gray-300 font-normal">(optional — links this entity to related clients)</span>
              </label>
              <div className="relative">
                <input
                  value={groupSearch}
                  onChange={e => searchGroups(e.target.value)}
                  placeholder="Search by existing client name to join their group…"
                  className={inp}
                />
                {groupResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    {groupResults.map(c => (
                      <button type="button" key={c.id}
                        onClick={() => {
                          setForm(f => ({ ...f, _client_group_id: c.client_group_id, _group_label: c.display_name || c.business_name }))
                          setGroupSearch(c.display_name || c.business_name || '')
                          setGroupResults([])
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
                        <span className="text-gray-900">{c.display_name || c.business_name}</span>
                        <span className="text-xs text-gray-400">Group {c.client_group_id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {form._client_group_id && (
                <p className="mt-1 text-xs text-accent">
                  Will join group {form._client_group_id} with {form._group_label}
                  <button type="button" onClick={() => { setForm(f => ({ ...f, _client_group_id: null, _group_label: '' })); setGroupSearch('') }}
                    className="ml-2 text-gray-400 hover:text-red-500">×</button>
                </p>
              )}
            </div>
            <div>
              <label className={lbl}>Engagement Type</label>
              <select value={form.engagement_type} onChange={set('engagement_type')} className={sel}>
                {ENG_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Recurrence</label>
              <select value={form.recurrence_frequency} onChange={set('recurrence_frequency')} className={sel}>
                {RECURRENCE.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Project Type (Form)</label>
              <select value={form.project_type} onChange={set('project_type')} className={sel}>
                <option value="">— Select —</option>
                {PROJECT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Entity Type</label>
              <select value={form.entity_type} onChange={set('entity_type')} className={sel}>
                <option value="">— Select —</option>
                {ENTITY_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Period + dates */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm uppercase tracking-wide">Period & Dates</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={lbl}>Period / Year</label>
              <input value={form.period_label} onChange={set('period_label')}
                placeholder="e.g. 2025, Q2 2026, May 2026"
                className={inp} />
            </div>
            <div>
              <label className={lbl}>Original Due</label>
              <input type="date" value={form.original_due} onChange={set('original_due')} className={inp} />
            </div>
            <div>
              <label className={lbl}>Current Due</label>
              <input type="date" value={form.current_due} onChange={set('current_due')} className={inp} />
            </div>
            <div>
              <label className={lbl}>Fiscal Year End</label>
              <input type="date" value={form.fiscal_year_end} onChange={set('fiscal_year_end')} className={inp} />
            </div>
            <div>
              <label className={lbl}>Status</label>
              <select value={form.status} onChange={set('status')} className={sel}>
                {activeStatuses.map(s => <option key={s.label}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Priority</label>
              <select value={form.priority} onChange={set('priority')} className={sel}>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input type="checkbox" id="extended" checked={form.extended} onChange={set('extended')}
              className="rounded border-gray-300 accent-accent" />
            <label htmlFor="extended" className="text-sm text-gray-700 cursor-pointer">Extension Filed</label>
          </div>
        </div>

        {/* Team */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm uppercase tracking-wide">Team</h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              ['primary_partner','Primary Partner'],
              ['manager','Manager'],
              ['preparer','Preparer'],
              ['reviewer','Reviewer'],
              ['in_charge','In Charge'],
            ].map(([k, label]) => (
              <div key={k}>
                <label className={lbl}>{label}</label>
                <select value={form[k]} onChange={set(k)} className={sel}>
                  <option value="">—</option>
                  {STAFF_NAMES.map(n => <option key={n}>{n}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* Budget + IDs */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm uppercase tracking-wide">Budget & Reference</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Budgeted Hours</label>
              <input type="number" min="0" step="0.5" value={form.budgeted_hours} onChange={set('budgeted_hours')}
                placeholder="0" className={inp} />
            </div>
            <div>
              <label className={lbl}>Budgeted Amount ($)</label>
              <input type="number" min="0" step="100" value={form.budgeted_amount} onChange={set('budgeted_amount')}
                placeholder="0" className={inp} />
            </div>
            <div>
              <label className={lbl}>Client #</label>
              <input value={form.client_number} onChange={set('client_number')}
                placeholder="e.g. APEX001" className={inp} />
            </div>
            <div>
              <label className={lbl}>Engagement #</label>
              <input value={form.engagement_number} onChange={set('engagement_number')}
                placeholder="e.g. 001" className={inp} />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pb-8">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-accent text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Saving…' : isNew ? 'Create Project' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={() => navigate(isNew ? '/projects' : `/projects/${id}`)}
            className="px-4 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
