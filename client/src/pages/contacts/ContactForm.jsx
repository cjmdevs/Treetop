import { useState, useEffect } from 'react'
import { XMarkIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import { contactsApi } from '../../api/contacts'
import { usersApi } from '../../api/users'
import { customFieldsApi } from '../../api/customFields'
import { useToast } from '../../context/ToastContext'

const ENTITY_TYPES = ['LLC', 'S-Corp', 'C-Corp', 'Partnership', 'Sole Proprietor', 'Non-Profit', 'Trust', 'Estate', 'Other']
const PHONE_LABELS = ['Mobile', 'Office', 'Home', 'Fax']
const STAFF_ROLES = ['Primary Partner', 'Secondary Partner', 'Responsible Person', 'Manager', 'Bill Manager', 'Tax Reviewer', 'Tax Preparer', 'Office']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const STATUS_OPTIONS = ['active', 'prospect', 'inactive', 'former']

function SectionHeader({ children }) {
  return <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-6 first:mt-0">{children}</h3>
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const input = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'
const select = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white'

export default function ContactForm({ contact, onSave, onClose }) {
  const { addToast } = useToast()
  const [users, setUsers] = useState([])
  const [saving, setSaving] = useState(false)
  const [codeError, setCodeError] = useState('')
  const [tagInput, setTagInput] = useState('')

  const isEdit = !!contact
  const [mailingSame, setMailingSame] = useState(false)
  const [clientTypes, setClientTypes] = useState([])
  const [contactFields, setContactFields] = useState([])      // custom field definitions
  const [customValues, setCustomValues] = useState({})        // fieldId → string value

  const [form, setForm] = useState(() => ({
    type: 'individual',
    status: 'active',
    client_type: '',
    first_name: '',
    last_name: '',
    ssn: '',
    spouse_first_name: '',
    spouse_last_name: '',
    spouse_ssn: '',
    date_of_birth: '',
    business_name: '',
    entity_type: '',
    federal_ein: '',
    fye_month: '',
    client_code: '',
    address_1: '',
    address_2: '',
    city: '',
    state: '',
    zip: '',
    country: 'USA',
    mailing_address_1: '',
    mailing_address_2: '',
    mailing_city: '',
    mailing_state: '',
    mailing_zip: '',
    mailing_country: '',
    phone_1: '',
    phone_1_label: 'Mobile',
    phone_2: '',
    phone_2_label: 'Office',
    phone_3: '',
    phone_3_label: 'Home',
    fax: '',
    email_primary: '',
    email_secondary: '',
    website: '',
    referral_source: '',
    naic_code: '',
    line_of_business: '',
    department: '',
    notes: '',
    contact_person: '',
    tags: [],
    assignments: STAFF_ROLES.map(role => ({ role, user_id: '' })),
  }))

  useEffect(() => {
    usersApi.list().then(data => setUsers(Array.isArray(data) ? data.filter(u => u.active) : []))
    contactsApi.metaClientTypes().then(d => setClientTypes(d.types || []))
    customFieldsApi.listContactFields().then(setContactFields).catch(() => {})
  }, [])

  useEffect(() => {
    if (!contact) return
    setForm({
      type: contact.type || 'individual',
      status: contact.status || 'active',
      client_type: contact.client_type || '',
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      ssn: '',
      spouse_first_name: contact.spouse_first_name || '',
      spouse_last_name: contact.spouse_last_name || '',
      spouse_ssn: '',
      date_of_birth: contact.date_of_birth || '',
      business_name: contact.business_name || '',
      entity_type: contact.entity_type || '',
      federal_ein: '',
      fye_month: contact.fye_month || '',
      client_code: contact.client_code || '',
      address_1: contact.address_1 || '',
      address_2: contact.address_2 || '',
      city: contact.city || '',
      state: contact.state || '',
      zip: contact.zip || '',
      country: contact.country || 'USA',
      mailing_address_1: contact.mailing_address_1 || '',
      mailing_address_2: contact.mailing_address_2 || '',
      mailing_city: contact.mailing_city || '',
      mailing_state: contact.mailing_state || '',
      mailing_zip: contact.mailing_zip || '',
      mailing_country: contact.mailing_country || '',
      phone_1: contact.phone_1 || '',
      phone_1_label: contact.phone_1_label || 'Mobile',
      phone_2: contact.phone_2 || '',
      phone_2_label: contact.phone_2_label || 'Office',
      phone_3: contact.phone_3 || '',
      phone_3_label: contact.phone_3_label || 'Home',
      fax: contact.fax || '',
      email_primary: contact.email_primary || '',
      email_secondary: contact.email_secondary || '',
      website: contact.website || '',
      referral_source: contact.referral_source || '',
      naic_code: contact.naic_code || '',
      line_of_business: contact.line_of_business || '',
      department: contact.department || '',
      notes: contact.notes || '',
      contact_person: contact.contact_person || '',
      tags: contact.tags || [],
      assignments: STAFF_ROLES.map(role => {
        const found = (contact.assignments || []).find(a => a.role === role)
        return { role, user_id: found ? String(found.user_id) : '' }
      }),
    })
    // Load existing custom field values for this contact
    if (contact.id) {
      customFieldsApi.getContactValues(contact.id)
        .then(rows => {
          const map = {}
          rows.forEach(r => { map[r.field_definition_id] = r.value ?? '' })
          setCustomValues(map)
        })
        .catch(() => {})
    }
  }, [contact])

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  function suggestCode() {
    if (form.client_code) return
    if (form.type === 'individual' && form.last_name) {
      set('client_code', form.last_name.toUpperCase().replace(/\s/g, '').slice(0, 5) + '001')
    } else if (form.type === 'business' && form.business_name) {
      set('client_code', form.business_name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) + '001')
    }
  }

  function handleMailingSameToggle(checked) {
    setMailingSame(checked)
    if (checked) {
      setForm(f => ({
        ...f,
        mailing_address_1: f.address_1,
        mailing_address_2: f.address_2,
        mailing_city: f.city,
        mailing_state: f.state,
        mailing_zip: f.zip,
        mailing_country: f.country,
      }))
    }
  }

  function addTag(e) {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault()
      const tag = tagInput.trim().replace(/,$/, '')
      if (tag && !form.tags.includes(tag)) {
        set('tags', [...form.tags, tag])
      }
      setTagInput('')
    }
  }

  function removeTag(tag) {
    set('tags', form.tags.filter(t => t !== tag))
  }

  function setAssignment(role, user_id) {
    set('assignments', form.assignments.map(a => a.role === role ? { ...a, user_id } : a))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setCodeError('')

    const payload = {
      ...form,
      fye_month: form.fye_month ? Number(form.fye_month) : null,
      assignments: form.assignments.filter(a => a.user_id).map(a => ({ ...a, user_id: Number(a.user_id) })),
    }

    // Strip empty sensitive fields so we don't overwrite stored values with blank
    if (!payload.ssn) delete payload.ssn
    if (!payload.spouse_ssn) delete payload.spouse_ssn
    if (!payload.federal_ein) delete payload.federal_ein

    setSaving(true)
    try {
      let saved
      if (isEdit) {
        saved = await contactsApi.update(contact.id, payload)
      } else {
        saved = await contactsApi.create(payload)
      }
      // Persist custom field values
      const cfSaves = Object.entries(customValues)
        .filter(([, v]) => v !== '' && v !== null && v !== undefined)
        .map(([fieldId, value]) =>
          customFieldsApi.setContactValue(saved.id, { field_definition_id: Number(fieldId), value })
        )
      try {
        await Promise.all(cfSaves)
      } catch (cfErr) {
        console.error('[ContactForm] custom field save error:', cfErr)
        addToast('Contact saved, but one or more custom fields failed to save', 'error')
      }
      addToast(isEdit ? 'Contact updated' : 'Contact created', 'success')
      onSave(saved)
    } catch (err) {
      if (err.message?.includes('400')) {
        setCodeError('Client code already in use')
      } else {
        addToast('Failed to save contact', 'error')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="w-[540px] bg-white h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit Contact' : 'New Contact'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* ── Basic Info ── */}
          <SectionHeader>Basic Info</SectionHeader>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type" required>
              <select className={select} value={form.type} onChange={e => set('type', e.target.value)}>
                <option value="individual">Individual</option>
                <option value="business">Business</option>
              </select>
            </Field>
            <Field label="Status">
              <select className={select} value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Client Type">
            <select className={select} value={form.client_type} onChange={e => set('client_type', e.target.value)}>
              <option value="">— Select type —</option>
              {clientTypes.map(ct => (
                <option key={ct.code} value={ct.code}>{ct.label}</option>
              ))}
            </select>
          </Field>

          {form.type === 'individual' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="First Name" required>
                  <input className={input} value={form.first_name} onChange={e => set('first_name', e.target.value)} onBlur={suggestCode} required />
                </Field>
                <Field label="Last Name" required>
                  <input className={input} value={form.last_name} onChange={e => set('last_name', e.target.value)} onBlur={suggestCode} required />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date of Birth">
                  <input type="date" className={input} value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} />
                </Field>
                <Field label="SSN">
                  <input className={input} placeholder="XXX-XX-XXXX" value={form.ssn} onChange={e => set('ssn', e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Spouse First Name">
                  <input className={input} value={form.spouse_first_name} onChange={e => set('spouse_first_name', e.target.value)} />
                </Field>
                <Field label="Spouse Last Name">
                  <input className={input} value={form.spouse_last_name} onChange={e => set('spouse_last_name', e.target.value)} />
                </Field>
              </div>
              <Field label="Spouse SSN">
                <input className={input} placeholder="XXX-XX-XXXX" value={form.spouse_ssn} onChange={e => set('spouse_ssn', e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Business Name" required>
                <input className={input} value={form.business_name} onChange={e => set('business_name', e.target.value)} onBlur={suggestCode} required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Entity Type" required>
                  <select className={select} value={form.entity_type} onChange={e => set('entity_type', e.target.value)} required>
                    <option value="">Select…</option>
                    {ENTITY_TYPES.map(et => <option key={et} value={et}>{et}</option>)}
                  </select>
                </Field>
                <Field label="Federal EIN">
                  <input className={input} placeholder="XX-XXXXXXX" value={form.federal_ein} onChange={e => set('federal_ein', e.target.value)} />
                </Field>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Client Code">
              <input className={`${input} ${codeError ? 'border-red-400 focus:ring-red-400' : ''}`} value={form.client_code} onChange={e => { set('client_code', e.target.value); setCodeError('') }} />
              {codeError && <p className="text-xs text-red-500 mt-1">{codeError}</p>}
            </Field>
            <Field label="FYE Month">
              <select className={select} value={form.fye_month} onChange={e => set('fye_month', e.target.value)}>
                <option value="">Select…</option>
                {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </Field>
          </div>

          {/* ── Contact Info ── */}
          <SectionHeader>Contact Info</SectionHeader>

          <Field label="Address Line 1">
            <input className={input} value={form.address_1} onChange={e => set('address_1', e.target.value)} />
          </Field>
          <Field label="Address Line 2">
            <input className={input} value={form.address_2} onChange={e => set('address_2', e.target.value)} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="City">
              <input className={input} value={form.city} onChange={e => set('city', e.target.value)} />
            </Field>
            <Field label="State">
              <input className={input} maxLength={2} value={form.state} onChange={e => set('state', e.target.value.toUpperCase())} />
            </Field>
            <Field label="ZIP">
              <input className={input} value={form.zip} onChange={e => set('zip', e.target.value)} />
            </Field>
          </div>

          {/* Mailing Address */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mailing Address</p>
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-accent focus:ring-accent"
                  checked={mailingSame}
                  onChange={e => handleMailingSameToggle(e.target.checked)}
                />
                Same as client address
              </label>
            </div>
            {mailingSame ? (
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                Using client address above — uncheck to enter a different mailing address.
              </p>
            ) : (
              <>
                <Field label="Mailing Address Line 1">
                  <input className={input} value={form.mailing_address_1} onChange={e => set('mailing_address_1', e.target.value)} />
                </Field>
                <Field label="Mailing Address Line 2">
                  <input className={input} value={form.mailing_address_2} onChange={e => set('mailing_address_2', e.target.value)} />
                </Field>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <Field label="City">
                    <input className={input} value={form.mailing_city} onChange={e => set('mailing_city', e.target.value)} />
                  </Field>
                  <Field label="State">
                    <input className={input} maxLength={2} value={form.mailing_state} onChange={e => set('mailing_state', e.target.value.toUpperCase())} />
                  </Field>
                  <Field label="ZIP">
                    <input className={input} value={form.mailing_zip} onChange={e => set('mailing_zip', e.target.value)} />
                  </Field>
                </div>
              </>
            )}
          </div>

          {[1,2,3].map(n => (
            <div key={n} className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label={`Phone ${n}`}>
                  <input className={input} value={form[`phone_${n}`]} onChange={e => set(`phone_${n}`, e.target.value)} />
                </Field>
              </div>
              <Field label="Label">
                <select className={select} value={form[`phone_${n}_label`]} onChange={e => set(`phone_${n}_label`, e.target.value)}>
                  {PHONE_LABELS.map(l => <option key={l}>{l}</option>)}
                </select>
              </Field>
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Primary Email">
              <input type="email" className={input} value={form.email_primary} onChange={e => set('email_primary', e.target.value)} />
            </Field>
            <Field label="Secondary Email">
              <input type="email" className={input} value={form.email_secondary} onChange={e => set('email_secondary', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Website">
              <input className={input} value={form.website} onChange={e => set('website', e.target.value)} />
            </Field>
            <Field label="Fax">
              <input className={input} value={form.fax} onChange={e => set('fax', e.target.value)} />
            </Field>
          </div>

          {/* ── Firm Assignment ── */}
          <SectionHeader>Firm Assignment</SectionHeader>

          {STAFF_ROLES.map(role => (
            <div key={role} className="grid grid-cols-5 gap-3 items-center">
              <label className="col-span-2 text-sm text-gray-600 leading-tight">{role}</label>
              <select
                className={`${select} col-span-3`}
                value={form.assignments.find(a => a.role === role)?.user_id || ''}
                onChange={e => setAssignment(role, e.target.value)}
              >
                <option value="">— Unassigned —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          ))}

          <Field label="Tags">
            <div className="border border-gray-200 rounded-lg px-3 py-2 min-h-[42px] flex flex-wrap gap-1.5 focus-within:ring-2 focus-within:ring-accent">
              {form.tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 bg-accent-light text-accent text-xs px-2 py-0.5 rounded-full">
                  {tag}
                  <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-500 leading-none">&times;</button>
                </span>
              ))}
              <input
                className="text-sm outline-none flex-1 min-w-[100px] bg-transparent"
                placeholder="Type and press Enter…"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={addTag}
              />
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Referral Source">
              <input className={input} value={form.referral_source} onChange={e => set('referral_source', e.target.value)} />
            </Field>
            <Field label="NAIC Code">
              <input className={input} value={form.naic_code} onChange={e => set('naic_code', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Line of Business">
              <input className={input} value={form.line_of_business} onChange={e => set('line_of_business', e.target.value)} />
            </Field>
            <Field label="Department">
              <input className={input} value={form.department} onChange={e => set('department', e.target.value)} />
            </Field>
          </div>

          <Field label="Notes">
            <textarea className={`${input} h-24 resize-none`} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </Field>

          {/* ── Contact Person ── */}
          <Field label="Contact Person" >
            <input className={input} placeholder="Primary contact name (owner, officer, trustee…)"
              value={form.contact_person} onChange={e => set('contact_person', e.target.value)} />
          </Field>

          {/* ── Custom Contact Fields ── */}
          {contactFields.length > 0 && (
            <>
              <SectionHeader>Custom Fields</SectionHeader>
              {contactFields.map(f => {
                const val = customValues[f.id] ?? ''
                const setVal = v => setCustomValues(prev => ({ ...prev, [f.id]: v }))
                return (
                  <Field key={f.id} label={f.field_name}>
                    {f.field_type === 'Date' && (
                      <input type="date" className={input} value={val} onChange={e => setVal(e.target.value)} />
                    )}
                    {f.field_type === 'Checkbox' && (
                      <div className="flex items-center h-10">
                        <input type="checkbox" className="rounded border-gray-300 text-accent focus:ring-accent h-4 w-4"
                          checked={val === '1' || val === 'true'}
                          onChange={e => setVal(e.target.checked ? '1' : '')} />
                      </div>
                    )}
                    {f.field_type === 'Dropdown' && (() => {
                      let opts = []
                      try { opts = JSON.parse(f.dropdown_options || '[]') } catch {}
                      return (
                        <select className={select} value={val} onChange={e => setVal(e.target.value)}>
                          <option value="">—</option>
                          {opts.map(o => <option key={o}>{o}</option>)}
                        </select>
                      )
                    })()}
                    {(f.field_type === 'Text' || f.field_type === 'Number') && (
                      <input type={f.field_type === 'Number' ? 'number' : 'text'} className={input}
                        value={val} onChange={e => setVal(e.target.value)} />
                    )}
                  </Field>
                )
              })}
            </>
          )}

          <div className="h-4" />
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 text-sm bg-accent text-white rounded-lg hover:bg-accent-dark disabled:opacity-50"
          >
            {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Contact')}
          </button>
        </div>
      </div>
    </div>
  )
}
