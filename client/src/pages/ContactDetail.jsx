import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  EnvelopeIcon, PhoneIcon, GlobeAltIcon, PencilIcon, PlusIcon, TrashIcon,
  EyeIcon, EyeSlashIcon, ClipboardDocumentIcon, ArrowLeftIcon,
  PhoneArrowDownLeftIcon, CalendarDaysIcon, ChatBubbleLeftIcon, VideoCameraIcon,
  BuildingOffice2Icon, UserIcon, TagIcon, CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { contactsApi } from '../api/contacts'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import ContactForm from './contacts/ContactForm'

const STATUS_COLORS = {
  active:   'bg-green-100 text-green-700',
  prospect: 'bg-yellow-100 text-yellow-700',
  inactive: 'bg-gray-100 text-gray-600',
  former:   'bg-red-100 text-red-600',
}

const TYPE_COLORS = {
  individual: 'bg-purple-50 text-purple-700',
  business:   'bg-blue-50 text-blue-700',
}

const STAFF_ROLES = ['Primary Partner','Secondary Partner','Responsible Person','Manager','Bill Manager','Tax Reviewer','Tax Preparer','Office']

const ACTIVITY_ICONS = {
  note:          { Icon: ChatBubbleLeftIcon,     color: 'text-gray-500',  bg: 'bg-gray-100' },
  call:          { Icon: PhoneArrowDownLeftIcon, color: 'text-green-600', bg: 'bg-green-100' },
  email:         { Icon: EnvelopeIcon,           color: 'text-blue-600',  bg: 'bg-blue-100' },
  meeting:       { Icon: VideoCameraIcon,        color: 'text-purple-600',bg: 'bg-purple-100' },
  status_change: { Icon: CheckCircleIcon,        color: 'text-orange-600',bg: 'bg-orange-100' },
  field_edit:    { Icon: PencilIcon,             color: 'text-gray-500',  bg: 'bg-gray-100' },
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function Badge({ label, colorClass }) {
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>{label}</span>
}

function CopyBtn({ value }) {
  const { addToast } = useToast()
  function copy() {
    navigator.clipboard.writeText(value)
    addToast('Copied', 'success')
  }
  return (
    <button onClick={copy} className="text-gray-300 hover:text-gray-500 transition-colors" title="Copy">
      <ClipboardDocumentIcon className="w-3.5 h-3.5" />
    </button>
  )
}

function formatAddress(c) {
  const parts = [c.address_1, c.address_2, c.address_3].filter(Boolean)
  const cityLine = [c.city, c.state, c.zip].filter(Boolean).join(', ')
  if (cityLine) parts.push(cityLine)
  if (c.country && c.country !== 'USA') parts.push(c.country)
  return parts
}

function formatAddressParts(c) {
  const streetLines = [c.address_1, c.address_2, c.address_3].filter(Boolean)
  const cityLine = [c.city, c.state, c.zip].filter(Boolean).join(', ')
  const country = c.country && c.country !== 'USA' ? c.country : null
  return { streetLines, cityLine, country }
}

function formatMailingAddressParts(c) {
  const streetLines = [c.mailing_address_1, c.mailing_address_2].filter(Boolean)
  const cityLine = [c.mailing_city, c.mailing_state, c.mailing_zip].filter(Boolean).join(', ')
  const country = c.mailing_country && c.mailing_country !== 'USA' ? c.mailing_country : null
  return { streetLines, cityLine, country }
}

function relativeTime(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hrs = Math.floor(mins / 60)
  const days = Math.floor(hrs / 24)
  if (days > 30) return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (days > 0) return `${days}d ago`
  if (hrs > 0) return `${hrs}h ago`
  if (mins > 0) return `${mins}m ago`
  return 'just now'
}

export default function ContactDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()

  const [contact, setContact] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [showEdit, setShowEdit] = useState(false)
  // Reveal state
  const [revealed, setRevealed] = useState({})
  const [sensitive, setSensitive] = useState(null)

  // Log activity
  const [logOpen, setLogOpen] = useState(false)
  const [logForm, setLogForm] = useState({ activity_type: 'note', title: '', body: '' })
  const [logSaving, setLogSaving] = useState(false)

  // Add affiliate
  const [affOpen, setAffOpen] = useState(false)
  const [affSearch, setAffSearch] = useState('')
  const [affResults, setAffResults] = useState([])
  const [affLabel, setAffLabel] = useState('')
  const [affSelected, setAffSelected] = useState(null)

  // Inline tag add
  const [tagInput, setTagInput] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    contactsApi.get(id).then(setContact).finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  async function revealSensitive() {
    if (sensitive) { setSensitive(null); setRevealed({}); return }
    const data = await contactsApi.revealSensitive(id)
    setSensitive(data)
    setRevealed({ ssn: true, spouse_ssn: true, federal_ein: true })
  }

  async function handleDelete() {
    if (!confirm('Mark this contact as Former? This is reversible by editing the status.')) return
    await contactsApi.delete(id)
    addToast('Contact marked as Former', 'success')
    navigate('/contacts')
  }

  async function handleLogActivity(e) {
    e.preventDefault()
    if (!logForm.title.trim()) return
    setLogSaving(true)
    const entry = await contactsApi.logActivity(id, logForm)
    setContact(c => ({ ...c, activity: [entry, ...(c.activity || [])] }))
    setLogForm({ activity_type: 'note', title: '', body: '' })
    setLogOpen(false)
    setLogSaving(false)
    addToast('Activity logged', 'success')
  }

  async function handleAddTag(e) {
    if (e.key !== 'Enter') return
    const tag = tagInput.trim()
    if (!tag) return
    const res = await contactsApi.addTag(id, tag)
    setContact(c => ({ ...c, tags: res.tags }))
    setTagInput('')
    setShowTagInput(false)
  }

  async function handleRemoveTag(tag) {
    const res = await contactsApi.removeTag(id, tag)
    setContact(c => ({ ...c, tags: res.tags }))
  }

  async function searchAffiliates() {
    if (!affSearch.trim()) { setAffResults([]); return }
    const results = await contactsApi.list({ search: affSearch })
    setAffResults(results.filter(r => r.id !== Number(id) && !contact.affiliates?.some(a => a.affiliated_contact_id === r.id)))
  }

  async function handleAddAffiliate() {
    if (!affSelected) return
    const aff = await contactsApi.addAffiliate(id, { affiliated_contact_id: affSelected.id, relationship_label: affLabel || null })
    setContact(c => ({ ...c, affiliates: [...(c.affiliates || []), aff] }))
    setAffOpen(false); setAffSearch(''); setAffResults([]); setAffLabel(''); setAffSelected(null)
    addToast('Affiliate added', 'success')
  }

  async function handleRemoveAffiliate(relId) {
    await contactsApi.removeAffiliate(id, relId)
    setContact(c => ({ ...c, affiliates: c.affiliates.filter(a => a.id !== relId) }))
    addToast('Affiliate removed', 'success')
  }

  function handleEditSaved(saved) {
    setShowEdit(false)
    load()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading…</div>
  )
  if (!contact) return (
    <div className="flex items-center justify-center h-full text-gray-400 text-sm">Contact not found.</div>
  )

  const isAdmin = user?.role === 'admin'

  const tabs = ['overview', 'engagements', 'time & billing', 'affiliates', 'activity']

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left Summary Panel ── */}
      <aside className="w-72 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-y-auto">
        {/* Back + actions */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <button onClick={() => navigate('/contacts')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeftIcon className="w-4 h-4" /> Contacts
          </button>
          {isAdmin && (
            <button onClick={handleDelete} className="text-gray-300 hover:text-red-500" title="Mark as Former">
              <TrashIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-5 pt-5 pb-4">
          {/* Avatar */}
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${contact.type === 'individual' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
            {contact.type === 'individual' ? <UserIcon className="w-6 h-6" /> : <BuildingOffice2Icon className="w-6 h-6" />}
          </div>

          <h2 className="text-base font-bold text-gray-900 leading-tight mb-2">{contact.display_name}</h2>

          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Badge label={contact.type === 'individual' ? 'Individual' : 'Business'} colorClass={TYPE_COLORS[contact.type] || 'bg-gray-100 text-gray-600'} />
            <Badge label={contact.status ? contact.status.charAt(0).toUpperCase() + contact.status.slice(1) : '—'} colorClass={STATUS_COLORS[contact.status] || 'bg-gray-100 text-gray-600'} />
            {contact.client_type && (
              <Badge label={contact.client_type} colorClass="bg-indigo-50 text-indigo-700" />
            )}
          </div>

          {contact.client_code && (
            <p className="text-xs font-mono text-gray-400 mb-3">{contact.client_code}</p>
          )}

          {/* Contact info */}
          <div className="space-y-2 text-sm">
            {contact.email_primary && (
              <div className="flex items-center gap-2">
                <EnvelopeIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <a href={`mailto:${contact.email_primary}`} className="text-accent hover:underline truncate text-xs">{contact.email_primary}</a>
                <CopyBtn value={contact.email_primary} />
              </div>
            )}
            {contact.phone_1 && (
              <div className="flex items-center gap-2">
                <PhoneIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <a href={`tel:${contact.phone_1}`} className="text-gray-700 hover:text-accent text-xs">{contact.phone_1}</a>
                <span className="text-xs text-gray-300">{contact.phone_1_label}</span>
              </div>
            )}
            {contact.website && (
              <div className="flex items-center gap-2">
                <GlobeAltIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <a href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`} target="_blank" rel="noreferrer" className="text-accent hover:underline text-xs truncate">{contact.website}</a>
              </div>
            )}
          </div>
        </div>

        {/* Staff assignments */}
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Assigned Staff</p>
          {STAFF_ROLES.map(role => {
            const a = contact.assignments?.find(x => x.role === role)
            return (
              <div key={role} className="flex items-center justify-between py-1">
                <span className="text-xs text-gray-500">{role}</span>
                <span className="text-xs font-medium text-gray-700">{a ? a.full_name : <span className="text-gray-300">—</span>}</span>
              </div>
            )
          })}
        </div>

        {/* Tags */}
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {(contact.tags || []).map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">
                {tag}
                <button onClick={() => handleRemoveTag(tag)} className="hover:text-red-500 leading-none text-gray-400">&times;</button>
              </span>
            ))}
            {showTagInput ? (
              <input
                autoFocus
                className="text-xs border border-gray-200 rounded-full px-2 py-0.5 outline-none focus:ring-1 focus:ring-accent w-24"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                onBlur={() => setShowTagInput(false)}
                placeholder="Add…"
              />
            ) : (
              <button onClick={() => setShowTagInput(true)} className="text-xs text-gray-300 hover:text-accent flex items-center gap-0.5 border border-dashed border-gray-200 rounded-full px-2 py-0.5">
                <PlusIcon className="w-3 h-3" /> Add
              </button>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-gray-100 space-y-2 mt-auto">
          <button
            onClick={() => setShowEdit(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            <PencilIcon className="w-4 h-4" /> Edit Contact
          </button>
          <button
            onClick={() => { setActiveTab('activity'); setLogOpen(true) }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            <PlusIcon className="w-4 h-4" /> Log Activity
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-white px-6 flex-shrink-0">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-accent text-accent'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {activeTab === 'overview' && (
            <OverviewTab
              contact={contact}
              sensitive={sensitive}
              revealed={revealed}
              onReveal={revealSensitive}
              onNotesChange={notes => setContact(c => ({ ...c, notes }))}
              onNotesSave={notes => contactsApi.update(id, { notes })}
            />
          )}
          {activeTab === 'engagements' && <EngagementsTab contact={contact} />}
          {activeTab === 'time & billing' && <TimeBillingTab contact={contact} />}
          {activeTab === 'affiliates' && (
            <AffiliatesTab
              contact={contact}
              affOpen={affOpen}
              setAffOpen={setAffOpen}
              affSearch={affSearch}
              setAffSearch={setAffSearch}
              affResults={affResults}
              affLabel={affLabel}
              setAffLabel={setAffLabel}
              affSelected={affSelected}
              setAffSelected={setAffSelected}
              onSearch={searchAffiliates}
              onAdd={handleAddAffiliate}
              onRemove={handleRemoveAffiliate}
              navigate={navigate}
            />
          )}
          {activeTab === 'activity' && (
            <ActivityTab
              contact={contact}
              logOpen={logOpen}
              setLogOpen={setLogOpen}
              logForm={logForm}
              setLogForm={setLogForm}
              onLog={handleLogActivity}
              logSaving={logSaving}
            />
          )}
        </div>
      </div>

      {/* Edit slide-over */}
      {showEdit && (
        <ContactForm contact={contact} onSave={handleEditSaved} onClose={() => setShowEdit(false)} />
      )}
    </div>
  )
}

// ── Tab: Overview ─────────────────────────────────────────────────────────────

function OverviewTab({ contact, sensitive, revealed, onReveal, onNotesChange, onNotesSave }) {
  const [notesDraft, setNotesDraft] = useState(contact.notes || '')
  const [notesSaving, setNotesSaving] = useState(false)

  async function saveNotes() {
    setNotesSaving(true)
    await onNotesSave(notesDraft)
    setNotesSaving(false)
  }

  const ssnValue = revealed.ssn && sensitive ? (sensitive.ssn || '—') : (contact.ssn || '—')
  const spouseSsnValue = revealed.spouse_ssn && sensitive ? (sensitive.spouse_ssn || '—') : (contact.spouse_ssn || '—')
  const einValue = revealed.federal_ein && sensitive ? (sensitive.federal_ein || '—') : (contact.federal_ein || '—')

  const { streetLines, cityLine, country } = formatAddressParts(contact)
  const hasAddress = streetLines.length > 0 || !!cityLine
  const allAddressLines = [...streetLines, ...(cityLine ? [cityLine] : []), ...(country ? [country] : [])]

  const { streetLines: bStreetLines, cityLine: bCityLine, country: bCountry } = formatMailingAddressParts(contact)
  const hasBillingAddress = bStreetLines.length > 0 || !!bCityLine
  const allBillingLines = [...bStreetLines, ...(bCityLine ? [bCityLine] : []), ...(bCountry ? [bCountry] : [])]

  return (
    <div className="grid grid-cols-2 gap-5">
      {/* Address */}
      {hasAddress && (
        <Card title="Address" action={<CopyBtn value={allAddressLines.join('\n')} />}>
          {streetLines.length > 0 && (
            <div className="flex items-start justify-between gap-2 mb-1">
              <div>
                {streetLines.map((l, i) => <p key={i} className="text-sm text-gray-700">{l}</p>)}
              </div>
              <CopyBtn value={streetLines.join('\n')} />
            </div>
          )}
          {cityLine && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-gray-700">{cityLine}</p>
              <CopyBtn value={cityLine} />
            </div>
          )}
          {country && <p className="text-sm text-gray-700 mt-1">{country}</p>}
        </Card>
      )}

      {/* Mailing Address */}
      {hasBillingAddress && (
        <Card title="Mailing Address" action={<CopyBtn value={allBillingLines.join('\n')} />}>
          {bStreetLines.length > 0 && (
            <div className="flex items-start justify-between gap-2 mb-1">
              <div>
                {bStreetLines.map((l, i) => <p key={i} className="text-sm text-gray-700">{l}</p>)}
              </div>
              <CopyBtn value={bStreetLines.join('\n')} />
            </div>
          )}
          {bCityLine && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-gray-700">{bCityLine}</p>
              <CopyBtn value={bCityLine} />
            </div>
          )}
          {bCountry && <p className="text-sm text-gray-700 mt-1">{bCountry}</p>}
        </Card>
      )}

      {/* Additional Info */}
      <Card title="Additional Info">
        <InfoRow label="FYE Month" value={contact.fye_month ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][contact.fye_month - 1] : null} />
        {contact.type === 'business' && <InfoRow label="Entity Type" value={contact.entity_type} />}
        <InfoRow label="NAIC Code" value={contact.naic_code} />
        <InfoRow label="Line of Business" value={contact.line_of_business} />
        <InfoRow label="Department" value={contact.department} />
        <InfoRow label="Referral Source" value={contact.referral_source} />
        {contact.referred_by_contact && (
          <div className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
            <span className="text-xs text-gray-500">Referred By</span>
            <Link to={`/contacts/${contact.referred_by_contact.id}`} className="text-xs text-accent hover:underline">
              {contact.referred_by_contact.display_name}
            </Link>
          </div>
        )}
      </Card>

      {/* Individual: sensitive info */}
      {contact.type === 'individual' && (
        <Card title="Personal Info" action={
          <button onClick={onReveal} className="flex items-center gap-1 text-xs text-gray-400 hover:text-accent">
            {revealed.ssn ? <EyeSlashIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
            {revealed.ssn ? 'Hide' : 'Reveal'}
          </button>
        }>
          <InfoRow label="Date of Birth" value={contact.date_of_birth} />
          <div className="flex items-center justify-between py-1 border-b border-gray-50">
            <span className="text-xs text-gray-500">SSN</span>
            <span className={`text-xs font-mono ${revealed.ssn ? 'text-gray-900' : 'text-gray-400'}`}>{ssnValue}</span>
          </div>
          {(contact.spouse_first_name || contact.spouse_last_name) && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider pt-2 pb-1">Spouse</p>
              <InfoRow label="Name" value={[contact.spouse_first_name, contact.spouse_last_name].filter(Boolean).join(' ')} />
              <div className="flex items-center justify-between py-1 border-b border-gray-50">
                <span className="text-xs text-gray-500">Spouse SSN</span>
                <span className={`text-xs font-mono ${revealed.spouse_ssn ? 'text-gray-900' : 'text-gray-400'}`}>{spouseSsnValue}</span>
              </div>
            </>
          )}
        </Card>
      )}

      {/* Business: EIN */}
      {contact.type === 'business' && (
        <Card title="Tax Info" action={
          <button onClick={onReveal} className="flex items-center gap-1 text-xs text-gray-400 hover:text-accent">
            {revealed.federal_ein ? <EyeSlashIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
            {revealed.federal_ein ? 'Hide' : 'Reveal'}
          </button>
        }>
          <div className="flex items-center justify-between py-1">
            <span className="text-xs text-gray-500">Federal EIN</span>
            <span className={`text-xs font-mono ${revealed.federal_ein ? 'text-gray-900' : 'text-gray-400'}`}>{einValue}</span>
          </div>
        </Card>
      )}

      {/* Contact Info */}
      {(contact.phone_2 || contact.email_secondary || contact.fax) && (
        <Card title="Additional Contact">
          {contact.phone_2 && <InfoRow label={contact.phone_2_label || 'Phone 2'} value={contact.phone_2} />}
          {contact.phone_3 && <InfoRow label={contact.phone_3_label || 'Phone 3'} value={contact.phone_3} />}
          {contact.email_secondary && <InfoRow label="Email 2" value={contact.email_secondary} />}
          {contact.fax && <InfoRow label="Fax" value={contact.fax} />}
        </Card>
      )}

      {/* Notes */}
      <div className="col-span-2">
        <Card title="Notes">
          <textarea
            className="w-full text-sm text-gray-700 resize-none focus:outline-none min-h-[80px]"
            value={notesDraft}
            onChange={e => setNotesDraft(e.target.value)}
            onBlur={saveNotes}
            placeholder="Add notes about this contact…"
          />
          {notesSaving && <p className="text-xs text-gray-400 mt-1">Saving…</p>}
        </Card>
      </div>
    </div>
  )
}

// ── Tab: Engagements ─────────────────────────────────────────────────────────

function EngagementsTab({ contact }) {
  const navigate = useNavigate()
  const engs = contact.engagements || []
  const open = engs.filter(e => !['Complete','Cancelled'].includes(e.status)).length

  const STATUS_COLORS_ENG = {
    'Not Started': 'bg-gray-100 text-gray-600',
    'In Progress':  'bg-blue-100 text-blue-700',
    'In Review':    'bg-yellow-100 text-yellow-700',
    'Complete':     'bg-green-100 text-green-700',
    'Cancelled':    'bg-red-100 text-red-600',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gray-900">Engagements</h3>
          <span className="text-xs text-gray-400">{engs.length} total · {open} open</span>
        </div>
        <button
          onClick={() => navigate(`/engagements/new?client=${encodeURIComponent(contact.display_name)}`)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-blue-700"
        >
          <PlusIcon className="w-3.5 h-3.5" /> New Engagement
        </button>
      </div>

      {engs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center h-32 text-gray-400 text-sm">
          No engagements yet
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Engagement</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Year</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Due</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Hours</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {engs.map(e => (
                <tr key={e.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/engagements/${e.id}`)}>
                  <td className="px-4 py-3 font-medium text-gray-900">{e.engagement_type}</td>
                  <td className="px-4 py-3 text-gray-500">{e.tax_year || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS_ENG[e.status] || 'bg-gray-100 text-gray-600'}`}>{e.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.due_date || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{(e.actual_hours || 0).toFixed(1)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">${(e.actual_amount || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab: Time & Billing ───────────────────────────────────────────────────────

function TimeBillingTab({ contact }) {
  const engs = contact.engagements || []
  const totalHours  = engs.reduce((s, e) => s + (e.actual_hours || 0), 0)
  const totalBill   = engs.reduce((s, e) => s + (e.actual_amount || 0), 0)

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <SummaryCard label="Total Hours" value={totalHours.toFixed(1) + ' hrs'} />
        <SummaryCard label="Total Billable" value={'$' + totalBill.toLocaleString()} />
        <SummaryCard label="Engagements" value={engs.length} />
      </div>

      {engs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center h-32 text-gray-400 text-sm">No time entries yet</div>
      ) : (
        <div className="space-y-3">
          {engs.map(e => (
            <div key={e.id} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-900 text-sm">{e.engagement_type} {e.tax_year ? `(${e.tax_year})` : ''}</p>
                <span className="text-xs text-gray-400">{(e.actual_hours || 0).toFixed(1)} hrs · ${(e.actual_amount || 0).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab: Affiliates ───────────────────────────────────────────────────────────

function AffiliatesTab({ contact, affOpen, setAffOpen, affSearch, setAffSearch, affResults, affLabel, setAffLabel, affSelected, setAffSelected, onSearch, onAdd, onRemove, navigate }) {
  const affiliates = contact.affiliates || []

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Affiliated Contacts</h3>
        <button
          onClick={() => setAffOpen(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-blue-700"
        >
          <PlusIcon className="w-3.5 h-3.5" /> Add Affiliate
        </button>
      </div>

      {affOpen && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
          <div className="flex gap-2 mb-3">
            <input
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Search contacts…"
              value={affSearch}
              onChange={e => setAffSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSearch()}
            />
            <button onClick={onSearch} className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200">Search</button>
          </div>
          {affResults.length > 0 && (
            <div className="border border-gray-100 rounded-lg mb-3 divide-y divide-gray-50 max-h-40 overflow-y-auto">
              {affResults.map(r => (
                <button
                  key={r.id}
                  onClick={() => setAffSelected(r)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${affSelected?.id === r.id ? 'bg-blue-50 text-accent' : 'text-gray-800'}`}
                >
                  <span className="font-medium">{r.display_name}</span>
                  <span className="text-xs text-gray-400 ml-2">{r.client_code}</span>
                </button>
              ))}
            </div>
          )}
          {affSelected && (
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                placeholder={`Relationship label (e.g. Owner, Trustee)…`}
                value={affLabel}
                onChange={e => setAffLabel(e.target.value)}
              />
              <button onClick={onAdd} className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-blue-700">Add</button>
            </div>
          )}
        </div>
      )}

      {affiliates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center h-32 text-gray-400 text-sm">No affiliates linked</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Relationship</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {affiliates.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button onClick={() => navigate(`/contacts/${a.affiliated_contact_id}`)} className="font-medium text-gray-900 hover:text-accent text-left">
                      {a.display_name}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[a.type] || 'bg-gray-100 text-gray-600'}`}>
                      {a.type === 'individual' ? 'Individual' : 'Business'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-sm">{a.relationship_label || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{a.email_primary || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => onRemove(a.id)} className="text-gray-300 hover:text-red-500">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Tab: Activity ─────────────────────────────────────────────────────────────

function ActivityTab({ contact, logOpen, setLogOpen, logForm, setLogForm, onLog, logSaving }) {
  const activity = contact.activity || []

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Activity Timeline</h3>
        <button
          onClick={() => setLogOpen(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-blue-700"
        >
          <PlusIcon className="w-3.5 h-3.5" /> Log Activity
        </button>
      </div>

      {logOpen && (
        <form onSubmit={onLog} className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
          <div className="flex gap-3 mb-3">
            {['note','call','email','meeting'].map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setLogForm(f => ({ ...f, activity_type: type }))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  logForm.activity_type === type ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          <input
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Title (required)"
            value={logForm.title}
            onChange={e => setLogForm(f => ({ ...f, title: e.target.value }))}
            required
          />
          <textarea
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-accent"
            placeholder="Notes (optional)…"
            value={logForm.body}
            onChange={e => setLogForm(f => ({ ...f, body: e.target.value }))}
          />
          <div className="flex justify-end gap-2 mt-3">
            <button type="button" onClick={() => setLogOpen(false)} className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={logSaving} className="px-4 py-2 text-sm bg-accent text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {logSaving ? 'Saving…' : 'Log'}
            </button>
          </div>
        </form>
      )}

      {activity.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 flex items-center justify-center h-32 text-gray-400 text-sm">No activity yet</div>
      ) : (
        <div className="space-y-3">
          {activity.map(item => {
            const cfg = ACTIVITY_ICONS[item.activity_type] || ACTIVITY_ICONS.note
            const { Icon } = cfg
            return (
              <div key={item.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-gray-900 text-sm">{item.title}</p>
                    <span className="text-xs text-gray-400 flex-shrink-0">{relativeTime(item.created_at)}</span>
                  </div>
                  {item.body && <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{item.body}</p>}
                  <p className="text-xs text-gray-400 mt-1">{item.logged_by}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Card({ title, action, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        {action}
      </div>
      {children}
    </div>
  )
}

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs text-gray-700 font-medium">{value}</span>
    </div>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  )
}
