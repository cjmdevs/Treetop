import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { projectsApi } from '../api/projects'
import { contactsApi } from '../api/contacts'
import { engagementsApi } from '../api/engagements'
import { useToast } from '../context/ToastContext'
import { PROJECT_STATUSES } from '../config/projectStatuses'
import {
  MagnifyingGlassIcon, ArrowLeftIcon, UserIcon, BuildingOffice2Icon, CheckIcon,
} from '@heroicons/react/24/outline'

const PROJECT_TYPES = ['1040','1041','1065','1120','1120S','Bookkeeping','Audit','Advisory','Payroll','Other']
const ENTITY_TYPES  = ['Individual','SMLLC','LLC','S-Corp','C-Corp','Partnership','Trust','Non-Profit','Other']
const PRIORITIES    = ['Low','Normal','High']
const STAFF_NAMES   = ['Marcus Maurer','Sofia Graf','Diego Rivera','Carson']

const BLANK = {
  project_type: '1040', entity_type: '', period_label: '', fiscal_year_end: '',
  status: 'Not Started', original_due: '', current_due: '', priority: 'Normal',
  primary_partner: '', manager: '', preparer: '', reviewer: '', in_charge: '',
  client_number: '', engagement_number: '',
  budgeted_hours: '', budgeted_amount: '',
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'
const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

export default function ProjectNew() {
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [step, setStep] = useState(1) // 1=pick client, 2=fill form
  const [form, setForm] = useState(BLANK)

  // Client search
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState([])
  const [selectedContact, setSelectedContact] = useState(null)
  const [clientLoading, setClientLoading] = useState(false)
  const searchRef = useRef(null)

  // Engagement
  const [engagements, setEngagements] = useState([])
  const [engagementId, setEngagementId] = useState('')

  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!clientSearch.trim()) { setClientResults([]); return }
    const t = setTimeout(() => {
      setClientLoading(true)
      contactsApi.list({ search: clientSearch })
        .then(setClientResults)
        .finally(() => setClientLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [clientSearch])

  useEffect(() => {
    if (!selectedContact) return
    engagementsApi.list({ client_name: selectedContact.display_name })
      .then(data => {
        setEngagements(data)
        if (data.length === 1) setEngagementId(String(data[0].id))
      })
  }, [selectedContact])

  function pickContact(c) {
    setSelectedContact(c)
    setClientSearch(c.display_name)
    setClientResults([])
    setForm(f => ({ ...f, client_number: c.client_code || '' }))
    setStep(2)
  }

  const set = f => e => setForm(prev => ({ ...prev, [f]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!engagementId) { addToast('Select an engagement first', 'error'); return }
    setSaving(true)
    try {
      const payload = {
        engagement_id: parseInt(engagementId),
        client_name:   selectedContact.display_name,
        contact_id:    selectedContact.id,
        project_type:  form.project_type || null,
        entity_type:   form.entity_type  || null,
        period_label:  form.period_label || null,
        fiscal_year_end: form.fiscal_year_end || null,
        status:        form.status || 'Not Started',
        original_due:  form.original_due || null,
        current_due:   form.current_due  || form.original_due || null,
        priority:      form.priority     || 'Normal',
        primary_partner: form.primary_partner || null,
        manager:       form.manager      || null,
        preparer:      form.preparer     || null,
        reviewer:      form.reviewer     || null,
        in_charge:     form.in_charge    || null,
        client_number: form.client_number || null,
        engagement_number: form.engagement_number || null,
        budgeted_hours:  form.budgeted_hours  ? parseFloat(form.budgeted_hours)  : null,
        budgeted_amount: form.budgeted_amount ? parseFloat(form.budgeted_amount) : null,
      }
      const proj = await projectsApi.create(payload)
      addToast('Project created', 'success')
      navigate(`/projects/${proj.id}`)
    } catch (err) {
      addToast(err.message || 'Failed to create project', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/projects')} className="text-gray-400 hover:text-gray-600">
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">New Project</h1>
          <p className="text-sm text-gray-400">Step {step} of 2 — {step === 1 ? 'Select client' : 'Project details'}</p>
        </div>
      </div>

      {/* Step 1 — client picker */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Client</p>
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={searchRef}
            value={clientSearch}
            onChange={e => { setClientSearch(e.target.value); if (selectedContact) { setSelectedContact(null); setStep(1) } }}
            placeholder="Search contacts…"
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
          {selectedContact && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
              <CheckIcon className="w-4 h-4" />
            </span>
          )}
        </div>

        {clientResults.length > 0 && (
          <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden shadow-lg z-10 bg-white">
            {clientResults.slice(0, 8).map(c => (
              <button
                key={c.id}
                onClick={() => pickContact(c)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent/5 text-left transition-colors"
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${c.type === 'individual' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                  {c.type === 'individual' ? <UserIcon className="w-4 h-4" /> : <BuildingOffice2Icon className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{c.display_name}</p>
                  {c.client_code && <p className="text-xs text-gray-400 font-mono">{c.client_code}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
        {clientLoading && <p className="text-xs text-gray-400 mt-2">Searching…</p>}

        {selectedContact && (
          <div className="mt-3 flex items-center gap-3 bg-accent/5 border border-accent/20 rounded-lg px-4 py-2.5">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${selectedContact.type === 'individual' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
              {selectedContact.type === 'individual' ? <UserIcon className="w-4 h-4" /> : <BuildingOffice2Icon className="w-4 h-4" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{selectedContact.display_name}</p>
              {selectedContact.client_code && <p className="text-xs text-gray-400 font-mono">{selectedContact.client_code}</p>}
            </div>
            <CheckIcon className="w-4 h-4 text-emerald-500 ml-auto" />
          </div>
        )}
      </div>

      {/* Step 2 — project details (only when client selected) */}
      {selectedContact && (
        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

            {/* Engagement */}
            <div>
              <label className={labelCls}>Engagement *</label>
              {engagements.length === 0 ? (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  No engagements found for this client. Create an engagement first.
                </p>
              ) : (
                <select required value={engagementId} onChange={e => setEngagementId(e.target.value)} className={inputCls}>
                  <option value="">Select engagement…</option>
                  {engagements.map(eng => (
                    <option key={eng.id} value={eng.id}>
                      {eng.engagement_type}{eng.tax_year ? ` — ${eng.tax_year}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Row 1 */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Project Type</label>
                <select value={form.project_type} onChange={set('project_type')} className={inputCls}>
                  {PROJECT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Entity Type</label>
                <select value={form.entity_type} onChange={set('entity_type')} className={inputCls}>
                  <option value="">—</option>
                  {ENTITY_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Period Label</label>
                <input value={form.period_label} onChange={set('period_label')} className={inputCls} placeholder="2025 or Q1 2025" />
              </div>
            </div>

            {/* Row 2 */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Original Due</label>
                <input type="date" value={form.original_due} onChange={set('original_due')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Current Due</label>
                <input type="date" value={form.current_due} onChange={set('current_due')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select value={form.status} onChange={set('status')} className={inputCls}>
                  {PROJECT_STATUSES.map(s => <option key={s.key}>{s.key}</option>)}
                </select>
              </div>
            </div>

            {/* Staff */}
            <div className="grid grid-cols-3 gap-4">
              {[
                ['in_charge',      'In Charge'],
                ['preparer',       'Preparer'],
                ['reviewer',       'Reviewer'],
                ['manager',        'Manager'],
                ['primary_partner','Primary Partner'],
              ].map(([key, label]) => (
                <div key={key}>
                  <label className={labelCls}>{label}</label>
                  <select value={form[key]} onChange={set(key)} className={inputCls}>
                    <option value="">—</option>
                    {STAFF_NAMES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label className={labelCls}>Priority</label>
                <select value={form.priority} onChange={set('priority')} className={inputCls}>
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* Budget + client # */}
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Client #</label>
                <input value={form.client_number} onChange={set('client_number')} className={inputCls} placeholder="e.g. 1042" />
              </div>
              <div>
                <label className={labelCls}>Engagement #</label>
                <input value={form.engagement_number} onChange={set('engagement_number')} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Budget Hours</label>
                <input type="number" min="0" step="0.5" value={form.budgeted_hours} onChange={set('budgeted_hours')} className={inputCls} placeholder="0" />
              </div>
              <div>
                <label className={labelCls}>Budget $</label>
                <input type="number" min="0" step="0.01" value={form.budgeted_amount} onChange={set('budgeted_amount')} className={inputCls} placeholder="0" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <button type="button" onClick={() => navigate('/projects')} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || engagements.length === 0}
              className="px-6 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
