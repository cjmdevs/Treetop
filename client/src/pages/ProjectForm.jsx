import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { projectsApi } from '../api/projects'
import { contactsApi } from '../api/contacts'
import { usersApi }    from '../api/users'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { useStatuses } from '../context/StatusesContext'
import { ArrowLeftIcon, UsersIcon, PlusCircleIcon } from '@heroicons/react/24/outline'
import ContactForm from './contacts/ContactForm'

const PROJECT_TYPES = ['1040','1041','1065','1120','1120S','Bookkeeping','Audit','Advisory','Payroll','Other']
const ENTITY_TYPES  = ['Individual','SMLLC','LLC','S-Corp','C-Corp','Partnership','Trust','Non-Profit','Other']
const ENG_TYPES     = ['Tax Return','Bookkeeping','Audit','Advisory','Payroll','Other']
const RECURRENCE    = ['Annually','Quarterly','Monthly','None']
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

  // ── Client typeahead state ────────────────────────────────────────────────
  // selectedContactId is the contact.id chosen via the picker.
  // For new projects we require a selection; edits pre-populate from the project.
  const [showNewContactForm, setShowNewContactForm] = useState(false)
  const [selectedContactId, setSelectedContactId] = useState(null)
  const [clientSearch, setClientSearch]           = useState('')
  const [clientDropOpen, setClientDropOpen]       = useState(false)
  const [clientDropPos, setClientDropPos]         = useState(null)
  const clientInputRef = useRef(null)

  // ── Client-group state ────────────────────────────────────────────────────
  // The group lives on the CONTACT record (contacts.client_group_id).
  // We read it when loading an existing project, display it, and write via
  // PATCH /api/contacts/:id/group on submit.
  const [projectContactId, setProjectContactId] = useState(null)
  const [contactGroupId, setContactGroupId]     = useState(null)
  const [contactGroupMembers, setContactGroupMembers] = useState([])
  // pendingGroup: what the user has chosen but not yet saved
  //   { type: 'join', target: {...contact} }  — link with another client
  //   { type: 'remove' }                       — remove from group
  //   null                                      — no change
  const [pendingGroup, setPendingGroup] = useState(null)
  // Picker UI
  const [pickerOpen, setPickerOpen]       = useState(false)
  const [pickerSearch, setPickerSearch]   = useState('')
  const [pickerAll, setPickerAll]         = useState([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerError, setPickerError]     = useState('')
  const [pickerDropPos, setPickerDropPos] = useState(null)
  const pickerInputRef  = useRef(null)
  const pickerLoadedRef = useRef(false)

  const [staffNames, setStaffNames] = useState([])

  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(!isNew)

  useEffect(() => {
    usersApi.list().then(users => setStaffNames(users.filter(u => u.active).map(u => u.full_name))).catch(() => {})
  }, [])

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

  // Fetch all contacts on first picker focus (not preloaded — avoids stale data)
  const loadPickerCandidates = async () => {
    if (pickerLoadedRef.current) return
    setPickerLoading(true)
    setPickerError('')
    try {
      const all = await contactsApi.list({})
      setPickerAll(all)
      pickerLoadedRef.current = true
    } catch {
      setPickerError('Could not load contacts.')
    } finally {
      setPickerLoading(false)
    }
  }

  const handleClientFocus = () => {
    const el = clientInputRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      setClientDropPos({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    setClientDropOpen(true)
    loadPickerCandidates()
  }

  const handleClientSelect = (contact) => {
    const name = contact.display_name || contact.business_name || ''
    setForm(f => ({ ...f, client_name: name }))
    setSelectedContactId(contact.id)
    setClientSearch('')
    setClientDropOpen(false)
  }

  const handleClientClear = () => {
    setSelectedContactId(null)
    setForm(f => ({ ...f, client_name: '' }))
    setClientSearch('')
    setTimeout(() => clientInputRef.current?.focus(), 50)
  }

  const handleNewContactSaved = (saved) => {
    setShowNewContactForm(false)
    // Inject the new contact into the already-loaded picker list
    setPickerAll(prev => [...prev, saved])
    pickerLoadedRef.current = true
    // Auto-select it in the project form
    handleClientSelect(saved)
  }

  const handlePickerFocus = () => {
    const el = pickerInputRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      setPickerDropPos({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    setPickerOpen(true)
    loadPickerCandidates()
  }

  // Load existing project for edit — also fetches the contact's group
  useEffect(() => {
    if (!isNew && id) {
      setFetching(true)
      projectsApi.get(id)
        .then(async (data) => {
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
          // Read the client's group from their contact record
          let resolvedContactId = data.contact_id || null
          if (!resolvedContactId && data.client_name) {
            // Fallback: project pre-dates contact_id column — look up by name
            try {
              const hits = await contactsApi.list({ search: data.client_name })
              const match = hits.find(c =>
                (c.display_name || c.business_name || '').toLowerCase() === data.client_name.toLowerCase()
              )
              if (match) resolvedContactId = match.id
            } catch {}
          }
          if (resolvedContactId) {
            setProjectContactId(resolvedContactId)
            setSelectedContactId(resolvedContactId)
            try {
              const contact = await contactsApi.get(resolvedContactId)
              setContactGroupId(contact.client_group_id)
              if (contact.client_group_id) {
                const members = await contactsApi.groupMembers(resolvedContactId)
                setContactGroupMembers(members)
              }
            } catch { /* non-fatal */ }
          } else if (data.client_name) {
            // Orphaned project — pre-fill search so user can re-link
            setClientSearch(data.client_name)
          }
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
    const resolvedContactId = selectedContactId || projectContactId || null
    if (isNew && !resolvedContactId) {
      toast.error('Please select an existing client from the list')
      return
    }
    if (!form.client_name.trim()) { toast.error('Client name is required'); return }
    setLoading(true)
    try {
      const payload = {
        contact_id:           resolvedContactId,
        client_name:          form.client_name,
        engagement_type:      form.engagement_type,
        recurrence_frequency: form.recurrence_frequency,
        project_type:         form.project_type,
        entity_type:          form.entity_type,
        period_label:         form.period_label,
        status:               form.status,
        original_due:         form.original_due || null,
        current_due:          form.current_due || form.original_due || null,
        fiscal_year_end:      form.fiscal_year_end || null,
        priority:             form.priority,
        extended:             form.extended ? 1 : 0,
        primary_partner:      form.primary_partner || null,
        manager:              form.manager || null,
        preparer:             form.preparer || null,
        reviewer:             form.reviewer || null,
        in_charge:            form.in_charge || null,
        budgeted_hours:       form.budgeted_hours  !== '' ? Number(form.budgeted_hours)  : null,
        budgeted_amount:      form.budgeted_amount !== '' ? Number(form.budgeted_amount) : null,
        client_number:        form.client_number || null,
        engagement_number:    form.engagement_number || null,
      }

      let savedProjectId = id
      let clientContactId = projectContactId

      if (isNew) {
        const created = await projectsApi.create(payload)
        savedProjectId = created.id
        // Use contact_id from the created project (server auto-links it)
        if (created.contact_id) {
          clientContactId = created.contact_id
        } else {
          // Fallback: look up by name
          try {
            const hits = await contactsApi.list({ search: form.client_name })
            const match = hits.find(c =>
              (c.display_name || c.business_name || '').toLowerCase() === form.client_name.toLowerCase()
            )
            if (match) clientContactId = match.id
          } catch {}
        }
      } else {
        await projectsApi.update(id, payload)
        // Fallback: if contact_id wasn't on this project, look up by name now
        if (!clientContactId && form.client_name) {
          try {
            const hits = await contactsApi.list({ search: form.client_name })
            const match = hits.find(c =>
              (c.display_name || c.business_name || '').toLowerCase() === form.client_name.toLowerCase()
            )
            if (match) clientContactId = match.id
          } catch {}
        }
      }

      // Apply group change (both new and edit)
      if (pendingGroup && clientContactId) {
        if (pendingGroup.type === 'remove') {
          await contactsApi.setGroup(clientContactId, null)
          toast.success('Removed from client group')
        } else if (pendingGroup.type === 'join') {
          const target = pendingGroup.target
          const groupId = target.client_group_id || 'new'
          await contactsApi.setGroup(clientContactId, groupId)
          if (!target.client_group_id) {
            // Both had no group — fetch the new group_id assigned to our client, put target in it
            const refreshed = await contactsApi.get(clientContactId)
            if (refreshed.client_group_id) {
              await contactsApi.setGroup(target.id, refreshed.client_group_id)
            }
          }
          toast.success('Client group saved')
        }
      }

      toast.success(isNew ? 'Project created' : 'Project saved')
      navigate(`/projects/${savedProjectId}`)
    } catch (err) {
      console.error('[ProjectForm] save error:', err)
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
              <label className={lbl}>Client *</label>
              {selectedContactId ? (
                <div className="flex items-center gap-2 px-3 py-2 border border-accent-light bg-accent-light rounded-lg">
                  <p className="text-sm font-medium text-gray-900 flex-1 truncate">{form.client_name}</p>
                  <span className="text-xs font-medium text-accent bg-white px-2 py-0.5 rounded-full flex-shrink-0">Linked</span>
                  <button type="button" onClick={handleClientClear}
                    className="text-xs text-gray-400 hover:text-gray-600 underline flex-shrink-0">Change</button>
                </div>
              ) : (
                <>
                  <input
                    ref={clientInputRef}
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    onFocus={handleClientFocus}
                    onBlur={() => setTimeout(() => setClientDropOpen(false), 160)}
                    placeholder="Search existing clients…"
                    className={inp}
                  />
                  {clientDropOpen && clientDropPos && createPortal(
                    <div className="fixed bg-white border border-gray-200 rounded-xl shadow-2xl z-[9999] overflow-y-auto"
                      style={{ top: clientDropPos.top, left: clientDropPos.left, width: clientDropPos.width, maxHeight: 260 }}>
                      {pickerLoading ? (
                        <div className="px-4 py-3 text-xs text-gray-400 flex items-center gap-2">
                          <span className="w-3 h-3 border-2 border-gray-200 border-t-accent rounded-full animate-spin" />
                          Loading clients…
                        </div>
                      ) : (() => {
                        const q = clientSearch.toLowerCase().trim()
                        const rows = pickerAll
                          .filter(c => !q ||
                            (c.display_name || '').toLowerCase().includes(q) ||
                            (c.business_name || '').toLowerCase().includes(q) ||
                            (c.client_code || '').toLowerCase().includes(q))
                          .slice(0, 8)
                        return (
                          <>
                            {rows.length === 0
                              ? <div className="px-4 py-3 text-xs text-gray-400">No matching clients.</div>
                              : rows.map(c => (
                                <button key={c.id} type="button"
                                  onClick={() => handleClientSelect(c)}
                                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent-light flex items-center justify-between gap-3 border-b border-gray-50 last:border-0 transition-colors">
                                  <div className="min-w-0">
                                    <p className="font-medium text-gray-900 truncate">{c.display_name || c.business_name}</p>
                                    {c.client_code && <p className="text-xs text-gray-400 font-mono">{c.client_code}</p>}
                                  </div>
                                </button>
                              ))
                            }
                            <div className="border-t border-gray-100">
                              <button type="button"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => { setClientDropOpen(false); setShowNewContactForm(true) }}
                                className="w-full text-left px-4 py-2.5 text-sm text-accent hover:bg-accent-light flex items-center gap-2 font-medium transition-colors">
                                <PlusCircleIcon className="w-4 h-4 flex-shrink-0" />
                                New client
                              </button>
                            </div>
                          </>
                        )
                      })()}
                    </div>,
                    document.body
                  )}
                </>
              )}
            </div>
            {/* Client group — reads/writes contacts.client_group_id via contact_id */}
            <div className="col-span-2">
              <label className={lbl}>
                <UsersIcon className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
                Client Group
                <span className="text-gray-300 font-normal ml-1">(links related entities for combined project view)</span>
              </label>

              {/* Pending removal */}
              {pendingGroup?.type === 'remove' ? (
                <div className="flex items-center gap-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm">
                  <span className="text-red-600 flex-1">Will remove from group on save</span>
                  <button type="button" onClick={() => setPendingGroup(null)}
                    className="text-xs text-gray-500 hover:text-gray-700 underline">Undo</button>
                </div>

              /* Pending join */
              ) : pendingGroup?.type === 'join' ? (
                <div className="flex items-center gap-3 px-3 py-2 bg-accent-light border border-accent-light rounded-lg">
                  <UsersIcon className="w-4 h-4 text-accent flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-accent-dark truncate">
                      Will group with {pendingGroup.target.display_name || pendingGroup.target.business_name}
                    </p>
                    <p className="text-xs text-accent/70">Saved when you click Save Changes</p>
                  </div>
                  <button type="button" onClick={() => setPendingGroup(null)}
                    className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">Cancel</button>
                </div>

              /* Currently in a group (loaded from contact) */
              ) : contactGroupId ? (
                <div className="flex items-center gap-3 px-3 py-2 bg-accent-light border border-accent-light rounded-lg">
                  <UsersIcon className="w-4 h-4 text-accent flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-accent-dark">Group {contactGroupId}</p>
                    {contactGroupMembers.length > 0 && (
                      <p className="text-xs text-accent truncate">
                        With: {contactGroupMembers.map(m => m.display_name || m.business_name).join(', ')}
                      </p>
                    )}
                  </div>
                  <button type="button" onClick={() => setPendingGroup({ type: 'remove' })}
                    className="text-xs text-red-400 hover:text-red-600 flex-shrink-0">Remove</button>
                </div>

              /* No group — show picker */
              ) : (
                <>
                  <input
                    ref={pickerInputRef}
                    value={pickerSearch}
                    onChange={e => setPickerSearch(e.target.value)}
                    onFocus={handlePickerFocus}
                    onBlur={() => setTimeout(() => setPickerOpen(false), 160)}
                    placeholder="Click to pick another client to link into a group…"
                    className={inp}
                  />
                  {pickerOpen && pickerDropPos && createPortal(
                    <div className="fixed bg-white border border-gray-200 rounded-xl shadow-2xl z-[9999]"
                      style={{ top: pickerDropPos.top, left: pickerDropPos.left, width: pickerDropPos.width, maxHeight: 260 }}>
                      <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
                        {pickerLoading && (
                          <div className="px-4 py-3 text-xs text-gray-400 flex items-center gap-2">
                            <span className="w-3 h-3 border-2 border-gray-200 border-t-accent rounded-full animate-spin" />
                            Loading contacts…
                          </div>
                        )}
                        {!pickerLoading && pickerError && (
                          <div className="px-4 py-3 text-xs text-red-500">{pickerError}</div>
                        )}
                        {!pickerLoading && !pickerError && (() => {
                          const q = pickerSearch.toLowerCase().trim()
                          const clientLower = form.client_name.toLowerCase()
                          const rows = pickerAll
                            .filter(c =>
                              (c.display_name || c.business_name || '').toLowerCase() !== clientLower &&
                              (!q ||
                                (c.display_name || '').toLowerCase().includes(q) ||
                                (c.business_name || '').toLowerCase().includes(q) ||
                                (c.client_code || '').toLowerCase().includes(q))
                            )
                            .slice(0, 9)
                          return rows.length === 0
                            ? <div className="px-4 py-3 text-xs text-gray-400">No contacts found.</div>
                            : rows.map(c => (
                              <button key={c.id} type="button"
                                onClick={() => { setPendingGroup({ type: 'join', target: c }); setPickerSearch(''); setPickerOpen(false) }}
                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent-light flex items-center justify-between gap-3 border-b border-gray-50 last:border-0 transition-colors">
                                <div className="min-w-0">
                                  <p className="font-medium text-gray-900 truncate">{c.display_name || c.business_name}</p>
                                  {c.client_code && <p className="text-xs text-gray-400 font-mono">{c.client_code}</p>}
                                </div>
                                <span className={`text-xs flex-shrink-0 px-2 py-0.5 rounded-full font-medium ${c.client_group_id ? 'bg-accent-light text-accent' : 'bg-gray-100 text-gray-500'}`}>
                                  {c.client_group_id ? `Join group ${c.client_group_id}` : 'New group'}
                                </span>
                              </button>
                            ))
                        })()}
                      </div>
                    </div>,
                    document.body
                  )}
                </>
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
                  {staffNames.map(n => <option key={n}>{n}</option>)}
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
            className="px-6 py-2.5 bg-accent text-white font-medium rounded-lg hover:bg-accent-dark disabled:opacity-50 transition-colors"
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

      {showNewContactForm && (
        <ContactForm
          contact={null}
          onSave={handleNewContactSaved}
          onClose={() => setShowNewContactForm(false)}
        />
      )}
    </div>
  )
}
