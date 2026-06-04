import { useCallback, useEffect, useState } from 'react'
import { customFieldsApi }       from '../api/customFields'
import { serviceCodesApi }       from '../api/serviceCodes'
import { staffRatesApi }         from '../api/staffRates'
import { automationsApi }        from '../api/automations'
import { usersApi }              from '../api/users'
import { contactClientTypesApi } from '../api/contactClientTypes'
import { projectStatusesApi }    from '../api/projectStatuses'
import { useAuth }               from '../context/AuthContext'
import { useStatuses }           from '../context/StatusesContext'
import { TrashIcon, PencilIcon, MagnifyingGlassIcon, SwatchIcon } from '@heroicons/react/24/outline'

const FIELD_TYPES  = ['Text', 'Number', 'Date', 'Dropdown', 'Checkbox']
const CATEGORIES   = ['Tax', 'Audit', 'Bookkeeping', 'Advisory', 'Admin', 'Other']

const BLANK_FIELD = { field_name: '', field_type: 'Text', dropdown_options: '', sort_order: 0 }
const BLANK_CODE  = {
  code: '', description: '', number: '', category: 'Other',
  subcategory: '', default_rate: '', billable_default: true,
}
const BLANK_RATE  = { staff_member: '', hourly_rate: '', effective_date: '' }

const TRIGGER_TYPES = ['status_changed', 'subtask_completed', 'due_date_within', 'budget_exceeded']
const ACTION_TYPES  = ['change_status', 'reassign_staff', 'set_priority', 'add_note']

const BLANK_RULE = {
  name: '', trigger_type: 'status_changed', action_type: 'change_status', active: true,
  trigger_config: {}, action_config: {},
}

const BLANK_USER = {
  username: '', password: '', full_name: '', email: '',
  role: 'staff', default_hourly_rate: '', rate_effective_date: '',
}

const BLANK_CT = { code: '', label: '', sort_order: '' }

function TriggerConfigForm({ triggerType, value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v })
  if (triggerType === 'status_changed')
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-1">To Status</label>
        <input value={value.to_status || ''} onChange={e => set('to_status', e.target.value)}
          placeholder="In Review" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
      </div>
    )
  if (triggerType === 'subtask_completed')
    return (
      <div className="flex items-center gap-2">
        <input type="checkbox" id="all_complete" checked={!!value.all_complete}
          onChange={e => set('all_complete', e.target.checked)} />
        <label htmlFor="all_complete" className="text-sm text-gray-700">Only when ALL subtasks are complete</label>
      </div>
    )
  if (triggerType === 'due_date_within')
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-1">Days Before Due</label>
        <input type="number" value={value.days || ''} onChange={e => set('days', parseInt(e.target.value))}
          placeholder="3" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
      </div>
    )
  if (triggerType === 'budget_exceeded')
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-1">Threshold %</label>
        <input type="number" value={value.pct || ''} onChange={e => set('pct', parseInt(e.target.value))}
          placeholder="90" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
      </div>
    )
  return null
}

function ActionConfigForm({ actionType, value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v })
  if (actionType === 'change_status')
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-1">New Status</label>
        <input value={value.status || ''} onChange={e => set('status', e.target.value)}
          placeholder="Complete" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
      </div>
    )
  if (actionType === 'reassign_staff')
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-1">Assign To</label>
        <input value={value.staff_member || ''} onChange={e => set('staff_member', e.target.value)}
          placeholder="Staff name" className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
      </div>
    )
  if (actionType === 'set_priority')
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-1">Priority</label>
        <select value={value.priority || 'High'} onChange={e => set('priority', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent">
          {['Low','Medium','High'].map(p => <option key={p}>{p}</option>)}
        </select>
      </div>
    )
  if (actionType === 'add_note')
    return (
      <div>
        <label className="block text-xs text-gray-500 mb-1">Note Text</label>
        <input value={value.note_text || ''} onChange={e => set('note_text', e.target.value)}
          placeholder="Automated note..." className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
      </div>
    )
  return null
}

const BLANK_STATUS = { label: '', color: '#3B82F6', is_default: false }

export default function Settings() {
  const [tab, setTab] = useState('statuses')
  const { isAdmin } = useAuth()
  const { refresh: refreshStatuses } = useStatuses()

  // ── Custom fields ──────────────────────────────────────────────────────────
  const [fields,       setFields]       = useState([])
  const [editingField, setEditingField] = useState(null)
  const [fieldForm,    setFieldForm]    = useState(BLANK_FIELD)

  // ── Service codes ──────────────────────────────────────────────────────────
  const [codes,       setCodes]       = useState([])
  const [codeSearch,  setCodeSearch]  = useState('')
  const [editingCode, setEditingCode] = useState(null)
  const [codeForm,    setCodeForm]    = useState(BLANK_CODE)

  // ── Staff rates ────────────────────────────────────────────────────────────
  const [staffRates,   setStaffRates]  = useState([])
  const [editingRate,  setEditingRate] = useState(null)
  const [rateForm,     setRateForm]    = useState(BLANK_RATE)

  // ── Automations ────────────────────────────────────────────────────────────
  const [rules,       setRules]       = useState([])
  const [editingRule, setEditingRule] = useState(null)
  const [ruleForm,    setRuleForm]    = useState(BLANK_RULE)

  // ── Client types ────────────────────────────────────────────────────────────
  const [clientTypes,  setClientTypes]  = useState([])
  const [editingCT,    setEditingCT]    = useState(null)
  const [ctForm,       setCtForm]       = useState(BLANK_CT)
  const [ctError,      setCtError]      = useState('')

  // ── User accounts ──────────────────────────────────────────────────────────
  const [users,      setUsers]      = useState([])
  const [userForm,   setUserForm]   = useState(null)  // null=closed; {...}=open
  const [userSaving, setUserSaving] = useState(false)
  const [userError,  setUserError]  = useState('')

  // ── Project statuses ───────────────────────────────────────────────────────
  const [psRows,       setPsRows]       = useState([])
  const [editingPS,    setEditingPS]    = useState(null) // null | 'new' | id
  const [psForm,       setPsForm]       = useState(BLANK_STATUS)
  const [psError,      setPsError]      = useState('')

  // ── Custom field scope — derived from nav selection ───────────────────────
  const fieldScope = tab === 'project-fields' ? 'project' : 'engagement'

  const [saving, setSaving] = useState(false)

  const loadFields      = () => customFieldsApi.listDefinitions().then(setFields)
  const loadCodes       = () => serviceCodesApi.listAll().then(setCodes)
  const loadRates       = () => staffRatesApi.list().then(setStaffRates)
  const loadRules       = () => automationsApi.list().then(setRules)
  const loadClientTypes = () => contactClientTypesApi.list({ include_inactive: true }).then(r => setClientTypes(r.types ?? []))
  const loadUsers       = useCallback(() => usersApi.list().then(setUsers), [])
  const loadStatuses    = () => projectStatusesApi.list({ include_inactive: 'true' }).then(setPsRows)
  useEffect(() => { loadFields(); loadCodes(); loadRates(); loadRules(); loadClientTypes(); loadStatuses() }, [])
  useEffect(() => { if (tab === 'accounts' || tab === 'rates') loadUsers() }, [tab, loadUsers])

  const setF = field => e => setFieldForm(f => ({ ...f, [field]: e.target.value }))
  const setC = field => e => setCodeForm(c => ({ ...c, [field]: e.target.value }))
  const setR = field => e => setRateForm(r => ({ ...r, [field]: e.target.value }))

  // ── Save handlers ──────────────────────────────────────────────────────────
  const saveField = async e => {
    e.preventDefault(); setSaving(true)
    try {
      const payload = {
        ...fieldForm,
        scope: fieldForm.scope || fieldScope || 'engagement',
        sort_order: parseInt(fieldForm.sort_order) || 0,
        dropdown_options: fieldForm.field_type === 'Dropdown'
          ? fieldForm.dropdown_options.split(',').map(s => s.trim()).filter(Boolean) : null,
      }
      if (editingField === 'new') await customFieldsApi.createDefinition(payload)
      else await customFieldsApi.updateDefinition(editingField, payload)
      setEditingField(null); loadFields()
    } finally { setSaving(false) }
  }

  const deleteField = async id => {
    if (!confirm('Delete this custom field? All values will be lost.')) return
    await customFieldsApi.deleteDefinition(id); loadFields()
  }

  // ── Status save handlers ────────────────────────────────────────────────────
  const saveStatus = async e => {
    e.preventDefault(); setPsError(''); setSaving(true)
    try {
      if (editingPS === 'new') {
        await projectStatusesApi.create(psForm)
      } else {
        await projectStatusesApi.update(editingPS, psForm)
      }
      setEditingPS(null); setPsForm(BLANK_STATUS)
      loadStatuses(); refreshStatuses()
    } catch (err) {
      setPsError(err?.message || 'Failed to save status')
    } finally { setSaving(false) }
  }

  const toggleStatusActive = async (row) => {
    await projectStatusesApi.update(row.id, { is_active: row.is_active ? 0 : 1 })
    loadStatuses(); refreshStatuses()
  }

  const setDefaultStatus = async (row) => {
    await projectStatusesApi.update(row.id, { is_default: 1 })
    loadStatuses(); refreshStatuses()
  }

  const deleteStatus = async (row) => {
    setPsError('')
    try {
      await projectStatusesApi.delete(row.id)
      loadStatuses(); refreshStatuses()
    } catch (err) {
      setPsError(err?.message || 'Cannot delete this status')
    }
  }

  const moveStatus = async (idx, dir) => {
    const sorted = [...psRows].sort((a, b) => a.sort_order - b.sort_order)
    const target = idx + dir
    if (target < 0 || target >= sorted.length) return
    const order = sorted.map((r, i) => ({ id: r.id, sort_order: i }))
    const tmp = order[idx].sort_order; order[idx].sort_order = order[target].sort_order; order[target].sort_order = tmp
    await projectStatusesApi.reorder(order)
    loadStatuses(); refreshStatuses()
  }

  const saveCode = async e => {
    e.preventDefault(); setSaving(true)
    try {
      const payload = {
        ...codeForm,
        code: codeForm.code.toUpperCase(),
        default_rate: codeForm.default_rate !== '' ? parseFloat(codeForm.default_rate) : null,
        billable_default: codeForm.billable_default ? 1 : 0,
      }
      if (editingCode === 'new') await serviceCodesApi.create(payload)
      else await serviceCodesApi.update(editingCode, payload)
      setEditingCode(null); loadCodes()
    } finally { setSaving(false) }
  }

  const toggleCode = async id => {
    await serviceCodesApi.toggle(id); loadCodes()
  }

  const deleteCode = async id => {
    if (!confirm('Delete this service code?')) return
    try {
      await serviceCodesApi.delete(id); loadCodes()
    } catch (err) {
      alert('Cannot delete — this code is used in time entries. Deactivate it instead.')
    }
  }

  const saveRate = async e => {
    e.preventDefault(); setSaving(true)
    try {
      await staffRatesApi.create({
        ...rateForm,
        hourly_rate: parseFloat(rateForm.hourly_rate),
      })
      setEditingRate(null); setRateForm(BLANK_RATE); loadRates()
    } finally { setSaving(false) }
  }

  const deleteRate = async id => {
    if (!confirm('Delete this staff rate?')) return
    await staffRatesApi.delete(id); loadRates()
  }

  const saveRule = async e => {
    e.preventDefault(); setSaving(true)
    try {
      const payload = {
        name: ruleForm.name, trigger_type: ruleForm.trigger_type, action_type: ruleForm.action_type,
        trigger_config: ruleForm.trigger_config, action_config: ruleForm.action_config,
        active: ruleForm.active,
      }
      if (editingRule === 'new') await automationsApi.create(payload)
      else await automationsApi.update(editingRule, payload)
      setEditingRule(null); loadRules()
    } finally { setSaving(false) }
  }

  const deleteRule = async id => {
    if (!confirm('Delete this automation rule?')) return
    await automationsApi.delete(id); loadRules()
  }

  const toggleRule = async id => {
    await automationsApi.toggle(id); loadRules()
  }

  const saveCT = async e => {
    e.preventDefault(); setSaving(true); setCtError('')
    try {
      const payload = {
        code:       ctForm.code.toUpperCase(),
        label:      ctForm.label,
        sort_order: parseInt(ctForm.sort_order) || 0,
      }
      if (editingCT === 'new') await contactClientTypesApi.create(payload)
      else await contactClientTypesApi.update(editingCT, payload)
      setEditingCT(null); loadClientTypes()
    } catch (err) {
      setCtError(err.message || 'Failed to save client type.')
    } finally { setSaving(false) }
  }

  const deleteCT = async id => {
    if (!confirm('Delete this client type?')) return
    try {
      await contactClientTypesApi.delete(id); loadClientTypes()
    } catch (err) {
      alert('Cannot delete — this type is assigned to one or more contacts. Deactivate it instead.')
    }
  }

  const toggleCT = async ct => {
    await contactClientTypesApi.update(ct.id, { active: ct.active ? 0 : 1 }); loadClientTypes()
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  const TRIGGER_LABELS = {
    status_changed: 'Status Changed', subtask_completed: 'Subtask Completed',
    due_date_within: 'Due Date Within', budget_exceeded: 'Budget Exceeded',
  }
  const ACTION_LABELS = {
    change_status: 'Change Status', reassign_staff: 'Reassign Staff',
    set_priority: 'Set Priority', add_note: 'Add Note',
  }

  // Filtered codes for display
  const filteredCodes = codeSearch.trim()
    ? codes.filter(c =>
        c.code.toLowerCase().includes(codeSearch.toLowerCase()) ||
        c.description.toLowerCase().includes(codeSearch.toLowerCase()) ||
        (c.category || '').toLowerCase().includes(codeSearch.toLowerCase())
      )
    : codes

  // Sort by numeric number column (codes without a number sort last)
  const sortedCodes = [...filteredCodes].sort((a, b) => {
    const na = parseInt(a.number) || 9999
    const nb = parseInt(b.number) || 9999
    return na - nb
  })

  // Group staff rates by member (latest first per member)
  const staffRatesByMember = staffRates.reduce((acc, r) => {
    if (!acc[r.staff_member]) acc[r.staff_member] = []
    acc[r.staff_member].push(r)
    return acc
  }, {})

  const navSections = [
    { label: 'Projects', items: [
      { key: 'statuses',       label: 'Project Statuses', visible: true },
      { key: 'project-fields', label: 'Project Fields',   visible: true },
      { key: 'automations',    label: 'Automations',      visible: true },
    ]},
    { label: 'Contacts / Clients', items: [
      { key: 'client-types',   label: 'Client Types',   visible: isAdmin },
      { key: 'contact-fields', label: 'Contact Fields', visible: true },
    ]},
    { label: 'Time & Billing', items: [
      { key: 'codes', label: 'Service Codes', visible: true },
      { key: 'rates', label: 'Staff Rates',   visible: true },
    ]},
    { label: 'System / Admin', items: [
      { key: 'accounts', label: 'User Accounts', visible: isAdmin },
    ]},
  ]

  return (
    <div className="flex h-full overflow-hidden">
      <aside className="w-52 flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
        <div className="px-4 py-6">
          <h1 className="text-base font-bold text-gray-900 mb-6">Settings</h1>
          {navSections.map(section => {
            const anyVisible = section.items.some(i => i.visible)
            if (!anyVisible) return null
            return (
              <div key={section.label} className="mb-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 px-2">{section.label}</p>
                {section.items.filter(i => i.visible).map(item => (
                  <button key={item.key} onClick={() => setTab(item.key)}
                    className={`w-full text-left px-3 py-2 text-sm rounded-lg mb-0.5 transition-colors ${
                      tab === item.key ? 'bg-accent/10 text-accent font-medium' : 'text-gray-600 hover:bg-gray-100'
                    }`}>
                    {item.label}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </aside>
      <div className="flex-1 overflow-y-auto p-8 min-w-0">
      <div className="max-w-4xl">

      {/* ── Custom Fields ────────────────────────────────────────────────────── */}
      {(tab === 'project-fields' || tab === 'contact-fields') && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">
              {fieldScope === 'project' ? 'Add custom columns to the Projects grid.' : 'Add custom fields to every engagement / contact.'}
            </p>
            <button onClick={() => { setEditingField('new'); setFieldForm({ ...BLANK_FIELD, sort_order: fields.filter(f => (f.scope||'engagement')===fieldScope).length, scope: fieldScope }) }}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
              + Add Field
            </button>
          </div>

          {editingField && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
              <form onSubmit={saveField} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-1">
                    <label className={labelCls}>Field Name *</label>
                    <input required value={fieldForm.field_name} onChange={setF('field_name')} className={inputCls} placeholder="e.g. Entity Type" />
                  </div>
                  <div>
                    <label className={labelCls}>Field Type</label>
                    <select value={fieldForm.field_type} onChange={setF('field_type')} className={inputCls}>
                      {FIELD_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Sort Order</label>
                    <input type="number" value={fieldForm.sort_order} onChange={setF('sort_order')} className={inputCls} />
                  </div>
                </div>
                {fieldForm.field_type === 'Dropdown' && (
                  <div>
                    <label className={labelCls}>Options (comma-separated)</label>
                    <input value={fieldForm.dropdown_options} onChange={setF('dropdown_options')} className={inputCls} placeholder="Option A, Option B, Option C" />
                  </div>
                )}
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setEditingField(null)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
                  <button type="submit" disabled={saving} className="px-6 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save Field'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-gray-500">
                  {['#', 'Field Name', 'Type', 'Options', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-xs font-medium uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {fields.filter(f => (f.scope || 'engagement') === fieldScope).map(f => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-400">{f.sort_order}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{f.field_name}</td>
                    <td className="px-5 py-3 text-gray-500">{f.field_type}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs">
                      {f.dropdown_options ? JSON.parse(f.dropdown_options).join(', ') : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingField(f.id); setFieldForm({ ...f, dropdown_options: f.dropdown_options ? JSON.parse(f.dropdown_options).join(', ') : '' }) }}
                          className="text-gray-400 hover:text-gray-600"><PencilIcon className="w-4 h-4" /></button>
                        <button onClick={() => deleteField(f.id)} className="text-gray-400 hover:text-red-500"><TrashIcon className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {fields.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">No {fieldScope === 'project' ? 'project columns' : 'custom fields'} defined yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Project Statuses ──────────────────────────────────────────────────── */}
      {tab === 'statuses' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">Define project workflow statuses. These power the Kanban board and grid badges.</p>
            <button onClick={() => { setEditingPS('new'); setPsForm(BLANK_STATUS); setPsError('') }}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
              + Add Status
            </button>
          </div>

          {psError && <p className="mb-3 text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg">{psError}</p>}

          {editingPS && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">
                {editingPS === 'new' ? 'New Status' : 'Edit Status'}
              </h3>
              <form onSubmit={saveStatus} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className={labelCls}>Label *</label>
                    <input required value={psForm.label}
                      onChange={e => setPsForm(f => ({ ...f, label: e.target.value }))}
                      className={inputCls} placeholder="e.g. Needs Info" />
                  </div>
                  <div>
                    <label className={labelCls}>Color</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={psForm.color}
                        onChange={e => setPsForm(f => ({ ...f, color: e.target.value }))}
                        className="h-9 w-14 rounded border border-gray-200 cursor-pointer p-0.5" />
                      <input value={psForm.color}
                        onChange={e => setPsForm(f => ({ ...f, color: e.target.value }))}
                        className={inputCls + ' font-mono text-xs'} placeholder="#3B82F6" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={!!psForm.is_default}
                      onChange={e => setPsForm(f => ({ ...f, is_default: e.target.checked }))}
                      className="rounded border-gray-300 accent-accent" />
                    Set as default (for new projects)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Preview:</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{ backgroundColor: psForm.color + '1a', color: psForm.color }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: psForm.color }} />
                    {psForm.label || 'Status Label'}
                  </span>
                </div>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => { setEditingPS(null); setPsForm(BLANK_STATUS); setPsError('') }}
                    className="px-4 py-2 text-sm text-gray-600">Cancel</button>
                  <button type="submit" disabled={saving}
                    className="px-6 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save Status'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-gray-500">
                  {['Order', 'Status', 'Color', 'Active', 'Default', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-xs font-medium uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...psRows].sort((a,b) => a.sort_order - b.sort_order).map((row, idx, arr) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => moveStatus(idx, -1)} disabled={idx === 0}
                          className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs">▲</button>
                        <button onClick={() => moveStatus(idx, 1)} disabled={idx === arr.length - 1}
                          className="text-gray-300 hover:text-gray-600 disabled:opacity-20 text-xs">▼</button>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: row.color + '1a', color: row.color }}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />
                        {row.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-500">{row.color}</td>
                    <td className="px-5 py-3">
                      <button onClick={() => toggleStatusActive(row)}
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {row.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      {row.is_default ? (
                        <span className="text-xs text-accent font-medium">✓ Default</span>
                      ) : (
                        <button onClick={() => setDefaultStatus(row)} className="text-xs text-gray-400 hover:text-accent">
                          Set default
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingPS(row.id); setPsForm({ label: row.label, color: row.color, is_default: !!row.is_default }); setPsError('') }}
                          className="text-gray-400 hover:text-gray-600"><PencilIcon className="w-4 h-4" /></button>
                        <button onClick={() => deleteStatus(row)} className="text-gray-400 hover:text-red-500">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {psRows.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">No statuses defined.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Service Codes ─────────────────────────────────────────────────────── */}
      {tab === 'codes' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">Service codes categorize time entries for billing and reporting.</p>
            <button onClick={() => { setEditingCode('new'); setCodeForm(BLANK_CODE) }}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
              + Add Code
            </button>
          </div>

          {editingCode && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
              <form onSubmit={saveCode} className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>Code * <span className="text-xs text-gray-400 font-normal">(e.g. TAX-PREP)</span></label>
                    <input
                      required value={codeForm.code}
                      onChange={e => setCodeForm(c => ({ ...c, code: e.target.value.toUpperCase() }))}
                      className={inputCls + ' font-mono'} placeholder="TAX-PREP"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Number <span className="text-xs text-gray-400 font-normal">(billing #)</span></label>
                    <input value={codeForm.number || ''} onChange={setC('number')} className={inputCls} placeholder="1040" />
                  </div>
                  <div>
                    <label className={labelCls}>Category</label>
                    <select value={codeForm.category || 'Other'} onChange={setC('category')} className={inputCls}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <label className={labelCls}>Description *</label>
                    <input required value={codeForm.description} onChange={setC('description')} className={inputCls} placeholder="Tax Preparation" />
                  </div>
                  <div>
                    <label className={labelCls}>Subcategory</label>
                    <input value={codeForm.subcategory || ''} onChange={setC('subcategory')} className={inputCls} placeholder="e.g. Individual" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 items-end">
                  <div>
                    <label className={labelCls}>Default Rate <span className="text-xs text-gray-400 font-normal">($/hr)</span></label>
                    <input
                      type="number" min="0" step="0.01"
                      value={codeForm.default_rate ?? ''}
                      onChange={setC('default_rate')}
                      className={inputCls} placeholder="200.00"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Billable by Default</label>
                    <div className="flex items-center h-[38px]">
                      <button
                        type="button"
                        onClick={() => setCodeForm(c => ({ ...c, billable_default: !c.billable_default }))}
                        className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${codeForm.billable_default ? 'bg-accent' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${codeForm.billable_default ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                      <span className="ml-2 text-sm text-gray-600">{codeForm.billable_default ? 'Yes' : 'No'}</span>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => setEditingCode(null)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
                    <button type="submit" disabled={saving} className="px-6 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                      {saving ? 'Saving...' : 'Save Code'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* Search */}
          <div className="relative mb-3">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={codeSearch}
              onChange={e => setCodeSearch(e.target.value)}
              placeholder="Search codes..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-gray-500">
                  {['Code', 'Description', 'Category', 'Default Rate', 'Billable', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-medium uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedCodes.map(c => (
                  <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${!c.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2.5">
                      <span className="font-mono font-semibold text-gray-900">{c.code}</span>
                      {c.number && <span className="ml-1.5 text-xs text-gray-400">#{c.number}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">
                      {c.description}
                      {c.subcategory && <span className="ml-1.5 text-xs text-gray-400">({c.subcategory})</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                        ${{
                          Tax:         'bg-blue-50 text-blue-700',
                          Audit:       'bg-purple-50 text-purple-700',
                          Bookkeeping: 'bg-teal-50 text-teal-700',
                          Advisory:    'bg-amber-50 text-amber-700',
                          Admin:       'bg-gray-100 text-gray-600',
                          Other:       'bg-gray-100 text-gray-500',
                        }[c.category] || 'bg-gray-100 text-gray-500'}`}>
                        {c.category || 'Other'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-gray-700">
                      {c.default_rate != null ? `$${Number(c.default_rate).toFixed(2)}` : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block w-2 h-2 rounded-full ${c.billable_default ? 'bg-green-400' : 'bg-gray-300'}`} />
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => toggleCode(c.id)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium border transition-colors
                          ${c.active
                            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                            : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}
                      >
                        {c.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingCode(c.id)
                            setCodeForm({
                              code:             c.code,
                              description:      c.description,
                              number:           c.number || '',
                              category:         c.category || 'Other',
                              subcategory:      c.subcategory || '',
                              default_rate:     c.default_rate ?? '',
                              billable_default: !!c.billable_default,
                            })
                          }}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteCode(c.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCodes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-gray-400">
                      {codeSearch ? 'No codes match your search.' : 'No service codes yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
              {codes.filter(c => c.active).length} active · {codes.filter(c => !c.active).length} inactive
            </div>
          </div>
        </div>
      )}

      {/* ── Staff Rates ───────────────────────────────────────────────────────── */}
      {tab === 'rates' && (
        <div>
          {/* User Rates Overview */}
          {users.filter(u => u.active).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700">User Rates Overview</h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-100">
                    <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wide">Name</th>
                    <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wide">Role</th>
                    <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wide">Current Rate</th>
                    <th className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wide">Effective Since</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.filter(u => u.active && ['admin','manager','staff'].includes(u.role)).map(u => {
                    const memberRates = staffRates.filter(r => r.staff_member === u.full_name)
                    const current = memberRates.length
                      ? [...memberRates].sort((a, b) => b.effective_date.localeCompare(a.effective_date))[0]
                      : null
                    return (
                      <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-3 font-medium text-gray-900">{u.full_name}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            u.role === 'admin'   ? 'bg-red-100 text-red-700' :
                            u.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                                                   'bg-gray-100 text-gray-700'
                          }`}>{u.role}</span>
                        </td>
                        <td className="px-5 py-3 font-mono font-semibold text-accent">
                          {current ? `$${Number(current.hourly_rate).toFixed(2)}/hr` : <span className="text-gray-300 font-normal">—</span>}
                        </td>
                        <td className="px-5 py-3 text-gray-500 font-mono text-xs">
                          {current ? current.effective_date : '—'}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => {
                              setEditingRate('new')
                              setRateForm({
                                staff_member:   u.full_name,
                                hourly_rate:    current ? current.hourly_rate : '',
                                effective_date: new Date().toISOString().split('T')[0],
                              })
                            }}
                            className="text-xs text-accent hover:underline font-medium"
                          >
                            Edit Rate
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">Hourly billing rates per staff member. Multiple rates are tracked with effective dates.</p>
            <button
              onClick={() => { setEditingRate('new'); setRateForm({ ...BLANK_RATE, effective_date: new Date().toISOString().split('T')[0] }) }}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              + Add Rate
            </button>
          </div>

          {editingRate && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">New Staff Rate</h3>
              <form onSubmit={saveRate} className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Staff Member *</label>
                  <input
                    required value={rateForm.staff_member}
                    onChange={setR('staff_member')}
                    className={inputCls} placeholder="e.g. Marcus Johnson"
                  />
                </div>
                <div>
                  <label className={labelCls}>Hourly Rate * ($/hr)</label>
                  <input
                    required type="number" min="0" step="0.01"
                    value={rateForm.hourly_rate}
                    onChange={setR('hourly_rate')}
                    className={inputCls} placeholder="200.00"
                  />
                </div>
                <div>
                  <label className={labelCls}>Effective Date *</label>
                  <input
                    required type="date"
                    value={rateForm.effective_date}
                    onChange={setR('effective_date')}
                    className={inputCls}
                  />
                </div>
                <div className="col-span-3 flex justify-end gap-3">
                  <button type="button" onClick={() => { setEditingRate(null); setRateForm(BLANK_RATE) }} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
                  <button type="submit" disabled={saving} className="px-6 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save Rate'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {Object.keys(staffRatesByMember).length === 0 && !editingRate ? (
            <div className="bg-white rounded-xl border border-gray-200 px-5 py-12 text-center text-gray-400 text-sm">
              No staff rates configured yet. Add rates to enable billing calculations.
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(staffRatesByMember).map(([member, memberRates]) => {
                const sorted = [...memberRates].sort((a, b) => b.effective_date.localeCompare(a.effective_date))
                const current = sorted[0]
                return (
                  <div key={member} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-gray-900">{member}</span>
                        <span className="ml-3 text-sm font-mono text-accent font-bold">
                          ${Number(current.hourly_rate).toFixed(2)}/hr
                        </span>
                        <span className="ml-1.5 text-xs text-gray-400">current</span>
                      </div>
                      <span className="text-xs text-gray-400">{sorted.length} rate{sorted.length !== 1 ? 's' : ''}</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="px-5 py-2 text-xs font-medium uppercase tracking-wide">Effective Date</th>
                          <th className="px-5 py-2 text-xs font-medium uppercase tracking-wide">Rate ($/hr)</th>
                          <th className="px-5 py-2 text-xs font-medium uppercase tracking-wide">Added</th>
                          <th className="px-5 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {sorted.map((r, i) => (
                          <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-2.5 font-mono text-gray-700">{r.effective_date}</td>
                            <td className="px-5 py-2.5">
                              <span className={`font-mono font-semibold ${i === 0 ? 'text-accent' : 'text-gray-500'}`}>
                                ${Number(r.hourly_rate).toFixed(2)}
                              </span>
                              {i === 0 && <span className="ml-2 text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded font-medium">Current</span>}
                            </td>
                            <td className="px-5 py-2.5 text-xs text-gray-400">
                              {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                            </td>
                            <td className="px-5 py-2.5 text-right">
                              <button onClick={() => deleteRate(r.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── User Accounts ────────────────────────────────────────────────────── */}
      {tab === 'accounts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">User Accounts</h2>
            <button
              onClick={() => { setUserForm({ ...BLANK_USER }); setUserError('') }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              + New User
            </button>
          </div>

          {/* User list */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Name','Username','Role','Rate','Status',''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.id} className={`hover:bg-gray-50 transition-colors ${!u.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{u.full_name}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{u.username}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        u.role === 'admin'   ? 'bg-red-100 text-red-700' :
                        u.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                                               'bg-gray-100 text-gray-700'
                      }`}>{u.role}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">${u.default_hourly_rate}/hr</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => usersApi.toggle(u.id).then(loadUsers)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium border transition-colors ${
                          u.active
                            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
                            : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200'
                        }`}
                      >
                        {u.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => { setUserForm({ ...u, password: '' }); setUserError('') }}
                        className="text-xs text-accent hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Create/Edit form */}
          {userForm && (
            <div className="border border-gray-200 rounded-xl p-5 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">
                {userForm.id ? `Edit: ${userForm.full_name}` : 'New User'}
              </h3>
              {userError && (
                <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {userError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Full Name',       key: 'full_name',           type: 'text' },
                  { label: 'Username',        key: 'username',            type: 'text' },
                  { label: 'Password',        key: 'password',            type: 'password', placeholder: userForm.id ? 'Leave blank to keep' : '' },
                  { label: 'Email',           key: 'email',               type: 'email' },
                  { label: 'Hourly Rate ($)', key: 'default_hourly_rate', type: 'number' },
                  { label: 'Rate Effective',  key: 'rate_effective_date', type: 'date' },
                ].map(({ label, key, type, placeholder }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                    <input
                      type={type}
                      value={userForm[key] ?? ''}
                      placeholder={placeholder || ''}
                      onChange={e => setUserForm(f => ({ ...f, [key]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
                  <select
                    value={userForm.role}
                    onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="staff">Staff</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  disabled={userSaving}
                  onClick={async () => {
                    setUserSaving(true); setUserError('')
                    try {
                      if (userForm.id) await usersApi.update(userForm.id, userForm)
                      else              await usersApi.create(userForm)
                      setUserForm(null)
                      loadUsers()
                    } catch (e) {
                      setUserError(e.message)
                    } finally {
                      setUserSaving(false)
                    }
                  }}
                  className="px-4 py-1.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
                >
                  {userSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setUserForm(null)}
                  className="px-4 py-1.5 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Client Types ─────────────────────────────────────────────────────── */}
      {tab === 'client-types' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">
              Client types categorize contacts for filtering and reporting (e.g. 1040, 1120, Advisory).
            </p>
            <button
              onClick={() => { setEditingCT('new'); setCtForm({ ...BLANK_CT, sort_order: clientTypes.length }); setCtError('') }}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              + Add Type
            </button>
          </div>

          {editingCT && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">
                {editingCT === 'new' ? 'New Client Type' : 'Edit Client Type'}
              </h3>
              {ctError && (
                <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{ctError}</div>
              )}
              <form onSubmit={saveCT} className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Code * <span className="text-xs text-gray-400 font-normal">(e.g. 1040)</span></label>
                  <input
                    required value={ctForm.code}
                    onChange={e => setCtForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    className={inputCls + ' font-mono'} placeholder="1040"
                  />
                </div>
                <div>
                  <label className={labelCls}>Label *</label>
                  <input
                    required value={ctForm.label}
                    onChange={e => setCtForm(f => ({ ...f, label: e.target.value }))}
                    className={inputCls} placeholder="Individual Income Tax"
                  />
                </div>
                <div>
                  <label className={labelCls}>Sort Order</label>
                  <input
                    type="number" value={ctForm.sort_order}
                    onChange={e => setCtForm(f => ({ ...f, sort_order: e.target.value }))}
                    className={inputCls} placeholder="0"
                  />
                </div>
                <div className="col-span-3 flex justify-end gap-3">
                  <button type="button" onClick={() => { setEditingCT(null); setCtError('') }} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
                  <button type="submit" disabled={saving} className="px-6 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save Type'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-gray-500">
                  {['Code', 'Label', 'Sort', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-medium uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...clientTypes].sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)).map(ct => (
                  <tr key={ct.id} className={`hover:bg-gray-50 transition-colors ${!ct.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2.5">
                      <span className="font-mono font-semibold text-gray-900">{ct.code}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{ct.label}</td>
                    <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{ct.sort_order}</td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => toggleCT(ct)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium border transition-colors
                          ${ct.active
                            ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                            : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100'}`}
                      >
                        {ct.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingCT(ct.id)
                            setCtForm({ code: ct.code, label: ct.label, sort_order: ct.sort_order })
                            setCtError('')
                          }}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteCT(ct.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {clientTypes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-gray-400">No client types defined yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
              {clientTypes.filter(ct => ct.active).length} active · {clientTypes.filter(ct => !ct.active).length} inactive
            </div>
          </div>
        </div>
      )}

      {/* ── Automations ──────────────────────────────────────────────────────── */}
      {tab === 'automations' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-gray-500">Rules run automatically when triggers fire during normal operations.</p>
            <button onClick={() => { setEditingRule('new'); setRuleForm(BLANK_RULE) }}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
              + Add Rule
            </button>
          </div>

          {editingRule && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
              <form onSubmit={saveRule} className="space-y-4">
                <div>
                  <label className={labelCls}>Rule Name *</label>
                  <input required value={ruleForm.name}
                    onChange={e => setRuleForm(r => ({ ...r, name: e.target.value }))}
                    className={inputCls} placeholder="e.g. Auto-complete when all tasks done" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Trigger</label>
                    <select value={ruleForm.trigger_type}
                      onChange={e => setRuleForm(r => ({ ...r, trigger_type: e.target.value, trigger_config: {} }))}
                      className={inputCls}>
                      {TRIGGER_TYPES.map(t => <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Action</label>
                    <select value={ruleForm.action_type}
                      onChange={e => setRuleForm(r => ({ ...r, action_type: e.target.value, action_config: {} }))}
                      className={inputCls}>
                      {ACTION_TYPES.map(t => <option key={t} value={t}>{ACTION_LABELS[t]}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Trigger Config</label>
                    <TriggerConfigForm triggerType={ruleForm.trigger_type}
                      value={ruleForm.trigger_config}
                      onChange={tc => setRuleForm(r => ({ ...r, trigger_config: tc }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Action Config</label>
                    <ActionConfigForm actionType={ruleForm.action_type}
                      value={ruleForm.action_config}
                      onChange={ac => setRuleForm(r => ({ ...r, action_config: ac }))} />
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <button type="button" onClick={() => setEditingRule(null)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
                  <button type="submit" disabled={saving} className="px-6 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {saving ? 'Saving...' : 'Save Rule'}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-gray-500">
                  {['Rule', 'Trigger', 'Action', 'Active', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-xs font-medium uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rules.map(r => {
                  const tc = typeof r.trigger_config === 'string' ? JSON.parse(r.trigger_config) : r.trigger_config
                  const ac = typeof r.action_config  === 'string' ? JSON.parse(r.action_config)  : r.action_config
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{r.name}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">
                        <div>{TRIGGER_LABELS[r.trigger_type] || r.trigger_type}</div>
                        <div className="text-gray-400">{Object.entries(tc || {}).map(([k,v]) => `${k}: ${v}`).join(', ')}</div>
                      </td>
                      <td className="px-5 py-3 text-gray-500 text-xs">
                        <div>{ACTION_LABELS[r.action_type] || r.action_type}</div>
                        <div className="text-gray-400">{Object.entries(ac || {}).map(([k,v]) => `${k}: ${v}`).join(', ')}</div>
                      </td>
                      <td className="px-5 py-3">
                        <button onClick={() => toggleRule(r.id)}
                          className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${r.active ? 'bg-accent' : 'bg-gray-300'}`}>
                          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5 ${r.active ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                        </button>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => {
                            const tc = typeof r.trigger_config === 'string' ? JSON.parse(r.trigger_config) : r.trigger_config
                            const ac = typeof r.action_config  === 'string' ? JSON.parse(r.action_config)  : r.action_config
                            setEditingRule(r.id)
                            setRuleForm({ ...r, trigger_config: tc, action_config: ac })
                          }} className="text-gray-400 hover:text-gray-600"><PencilIcon className="w-4 h-4" /></button>
                          <button onClick={() => deleteRule(r.id)} className="text-gray-400 hover:text-red-500"><TrashIcon className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {rules.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">No automation rules yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>
      </div>
    </div>
  )
}
