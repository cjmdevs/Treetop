import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MagnifyingGlassIcon,
  PlusIcon,
  Squares2X2Icon,
  ListBulletIcon,
  EnvelopeIcon,
  PhoneIcon,
  BuildingOffice2Icon,
  UserIcon,
  BookmarkIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { contactsApi } from '../api/contacts'
import { usersApi } from '../api/users'
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

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
      {status ? status.charAt(0).toUpperCase() + status.slice(1) : '—'}
    </span>
  )
}

function TypeBadge({ type }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[type] || 'bg-gray-100 text-gray-600'}`}>
      {type === 'individual' ? 'Individual' : 'Business'}
    </span>
  )
}

function TagPills({ tags = [], max = 3 }) {
  const shown = tags.slice(0, max)
  const extra = tags.length - max
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map(t => (
        <span key={t} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600">{t}</span>
      ))}
      {extra > 0 && <span className="text-xs text-gray-400">+{extra}</span>}
    </div>
  )
}

const DEFAULT_FILTERS = { type: '', status: '', client_type: '', entity_type: '', tag: '', staff_user_id: '', sort: 'name_asc' }

export default function Contacts() {
  const navigate = useNavigate()
  const { addToast } = useToast()

  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS })
  const [users, setUsers] = useState([])
  const [allTags, setAllTags] = useState([])
  const [clientTypes, setClientTypes] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [presets, setPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mgrcpas_contact_filter_presets') || '[]') }
    catch { return [] }
  })
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    usersApi.list().then(d => setUsers(Array.isArray(d) ? d.filter(u => u.active) : []))
    contactsApi.metaTags().then(d => setAllTags(d.tags || []))
    contactsApi.metaClientTypes().then(d => setClientTypes(d.types || []))
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    const params = { ...filters }
    if (debouncedSearch) params.search = debouncedSearch
    Object.keys(params).forEach(k => { if (!params[k]) delete params[k] })
    contactsApi.list(params)
      .then(setContacts)
      .finally(() => setLoading(false))
  }, [filters, debouncedSearch])

  useEffect(() => { load() }, [load])

  function setFilter(key, val) {
    setFilters(f => ({ ...f, [key]: val }))
  }

  const isFilterActive = Object.entries(filters).some(([k, v]) => k !== 'sort' && v !== DEFAULT_FILTERS[k])

  function suggestPresetName() {
    const parts = []
    if (filters.status)        parts.push(filters.status.charAt(0).toUpperCase() + filters.status.slice(1))
    if (filters.client_type)   parts.push(filters.client_type)
    if (filters.type)          parts.push(filters.type.charAt(0).toUpperCase() + filters.type.slice(1))
    if (filters.entity_type)   parts.push(filters.entity_type)
    if (filters.tag)           parts.push(`#${filters.tag}`)
    if (filters.staff_user_id) {
      const u = users.find(u => String(u.id) === String(filters.staff_user_id))
      if (u) parts.push(u.full_name.split(' ')[0])
    }
    return parts.join(' · ') || 'My Filter'
  }

  function openSavePreset() {
    if (!isFilterActive) {
      addToast('Apply some filters first before saving a preset', 'error')
      return
    }
    setPresetName(suggestPresetName())
    setSavingPreset(true)
  }

  function savePreset(name) {
    const trimmed = name.trim()
    if (!trimmed) return
    const updated = [...presets.filter(p => p.name !== trimmed), { name: trimmed, filters: { ...filters } }]
    setPresets(updated)
    localStorage.setItem('mgrcpas_contact_filter_presets', JSON.stringify(updated))
    setSavingPreset(false)
    setPresetName('')
  }

  function deletePreset(name) {
    const updated = presets.filter(p => p.name !== name)
    setPresets(updated)
    localStorage.setItem('mgrcpas_contact_filter_presets', JSON.stringify(updated))
  }

  function applyPreset(preset) {
    setFilters({ ...DEFAULT_FILTERS, ...preset.filters })
  }

  function clearFilters() {
    setFilters({ ...DEFAULT_FILTERS })
  }

  function handleSaved(saved) {
    setShowForm(false)
    if (saved?.id) navigate(`/contacts/${saved.id}`)
    else load()
  }

  const sel = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent bg-white'

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">Contacts</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent w-64"
              placeholder="Search name, code, email, phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={`px-3 py-2 ${view === 'list' ? 'bg-accent text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              title="List view"
            >
              <ListBulletIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('card')}
              className={`px-3 py-2 ${view === 'card' ? 'bg-accent text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              title="Card view"
            >
              <Squares2X2Icon className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            <PlusIcon className="w-4 h-4" />
            New Contact
          </button>
        </div>
      </div>

      {/* Saved filter presets */}
      {presets.length > 0 && (
        <div className="flex items-center gap-2 px-6 py-2 border-b border-gray-100 bg-white flex-shrink-0 flex-wrap">
          <span className="text-xs text-gray-400 flex-shrink-0">Saved filters:</span>
          {presets.map(p => (
            <span
              key={p.name}
              className="inline-flex items-center gap-1 bg-blue-50 text-accent text-xs px-2.5 py-1 rounded-full border border-blue-100 cursor-pointer hover:bg-blue-100 transition-colors"
              onClick={() => applyPreset(p)}
            >
              {p.name}
              <button
                onClick={e => { e.stopPropagation(); deletePreset(p.name) }}
                className="hover:text-red-500 text-blue-400 leading-none ml-0.5 font-medium"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0 flex-wrap">
        <select className={sel} value={filters.type} onChange={e => setFilter('type', e.target.value)}>
          <option value="">All Types</option>
          <option value="individual">Individual</option>
          <option value="business">Business</option>
        </select>
        <select className={sel} value={filters.status} onChange={e => setFilter('status', e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="prospect">Prospect</option>
          <option value="inactive">Inactive</option>
          <option value="former">Former</option>
        </select>
        {clientTypes.length > 0 && (
          <select className={sel} value={filters.client_type} onChange={e => setFilter('client_type', e.target.value)}>
            <option value="">All Client Types</option>
            {clientTypes.map(ct => <option key={ct.code} value={ct.code}>{ct.label}</option>)}
          </select>
        )}
        {filters.type === 'business' && (
          <select className={sel} value={filters.entity_type} onChange={e => setFilter('entity_type', e.target.value)}>
            <option value="">All Entities</option>
            {['LLC','S-Corp','C-Corp','Partnership','Sole Proprietor','Non-Profit','Trust','Estate','Other'].map(et => (
              <option key={et} value={et}>{et}</option>
            ))}
          </select>
        )}
        <select className={sel} value={filters.staff_user_id} onChange={e => setFilter('staff_user_id', e.target.value)}>
          <option value="">Any Staff</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        {allTags.length > 0 && (
          <select className={sel} value={filters.tag} onChange={e => setFilter('tag', e.target.value)}>
            <option value="">Any Tag</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <select className={sel} value={filters.sort} onChange={e => setFilter('sort', e.target.value)}>
          <option value="name_asc">Name A–Z</option>
          <option value="name_desc">Name Z–A</option>
          <option value="client_code">Client Code</option>
          <option value="created_desc">Newest First</option>
          <option value="updated">Last Updated</option>
        </select>

        {/* Save filter — always visible, dims when no filters active */}
        {!savingPreset && (
          <button
            onClick={openSavePreset}
            className={`flex items-center gap-1.5 px-3 py-2 border text-xs rounded-lg transition-colors ${
              isFilterActive
                ? 'border-gray-200 text-gray-500 hover:bg-white bg-transparent'
                : 'border-gray-100 text-gray-300 bg-transparent cursor-default'
            }`}
            title={isFilterActive ? 'Save current filters as a preset' : 'Apply filters first to save a preset'}
          >
            <BookmarkIcon className="w-3.5 h-3.5" />
            Save Filter
          </button>
        )}
        {savingPreset && (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              className="border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-accent w-36 bg-white"
              placeholder="Preset name…"
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') savePreset(presetName)
                if (e.key === 'Escape') { setSavingPreset(false); setPresetName('') }
              }}
            />
            <button
              onClick={() => savePreset(presetName)}
              className="px-2.5 py-2 bg-accent text-white text-xs rounded-lg hover:bg-blue-700"
            >
              Save
            </button>
            <button
              onClick={() => { setSavingPreset(false); setPresetName('') }}
              className="px-2.5 py-2 border border-gray-200 text-gray-500 text-xs rounded-lg hover:bg-white"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Clear filters */}
        {isFilterActive && !savingPreset && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-2.5 py-2 text-xs text-gray-400 hover:text-gray-600 border border-gray-100 rounded-lg hover:bg-white transition-colors"
            title="Clear all filters"
          >
            <XMarkIcon className="w-3.5 h-3.5" />
            Clear
          </button>
        )}

        <span className="text-xs text-gray-400 ml-auto">{contacts.length} contact{contacts.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading…</div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <BuildingOffice2Icon className="w-10 h-10 mb-2 opacity-40" />
            <p className="text-sm">No contacts found</p>
          </div>
        ) : view === 'list' ? (
          <ListView contacts={contacts} navigate={navigate} />
        ) : (
          <CardView contacts={contacts} navigate={navigate} />
        )}
      </div>

      {showForm && (
        <ContactForm contact={null} onSave={handleSaved} onClose={() => setShowForm(false)} />
      )}
    </div>
  )
}

function ListView({ contacts, navigate }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Partner</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tags</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {contacts.map(c => (
            <tr
              key={c.id}
              className="hover:bg-gray-50 cursor-pointer group"
              onClick={() => navigate(`/contacts/${c.id}`)}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold ${c.type === 'individual' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                    {c.type === 'individual' ? <UserIcon className="w-3.5 h-3.5" /> : <BuildingOffice2Icon className="w-3.5 h-3.5" />}
                  </div>
                  <span className="font-medium text-gray-900 group-hover:text-accent">{c.display_name || '—'}</span>
                </div>
              </td>
              <td className="px-4 py-3 text-gray-500 font-mono text-xs">{c.client_code || '—'}</td>
              <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
              <td className="px-4 py-3">
                {c.email_primary ? (
                  <a href={`mailto:${c.email_primary}`} onClick={e => e.stopPropagation()}
                    className="text-accent hover:underline flex items-center gap-1 truncate max-w-[160px]">
                    <EnvelopeIcon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{c.email_primary}</span>
                  </a>
                ) : <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-3">
                {c.phone_1 ? (
                  <a href={`tel:${c.phone_1}`} onClick={e => e.stopPropagation()}
                    className="text-gray-700 hover:text-accent flex items-center gap-1">
                    <PhoneIcon className="w-3.5 h-3.5 flex-shrink-0" />
                    {c.phone_1}
                  </a>
                ) : <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-3 text-gray-600 text-xs">{c.primary_partner || <span className="text-gray-300">—</span>}</td>
              <td className="px-4 py-3"><TagPills tags={c.tags} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CardView({ contacts, navigate }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {contacts.map(c => (
        <div
          key={c.id}
          onClick={() => navigate(`/contacts/${c.id}`)}
          className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-accent hover:shadow-sm transition-all"
        >
          <div className="flex items-start justify-between mb-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${c.type === 'individual' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
              {c.type === 'individual' ? <UserIcon className="w-4 h-4" /> : <BuildingOffice2Icon className="w-4 h-4" />}
            </div>
            <StatusBadge status={c.status} />
          </div>
          <p className="font-semibold text-gray-900 text-sm leading-tight mb-0.5 line-clamp-2">{c.display_name}</p>
          <p className="text-xs text-gray-400 font-mono mb-3">{c.client_code || '—'}</p>
          {c.email_primary && (
            <p className="text-xs text-gray-500 truncate mb-1 flex items-center gap-1">
              <EnvelopeIcon className="w-3 h-3 flex-shrink-0" />{c.email_primary}
            </p>
          )}
          {c.phone_1 && (
            <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <PhoneIcon className="w-3 h-3 flex-shrink-0" />{c.phone_1}
            </p>
          )}
          {c.primary_partner && (
            <p className="text-xs text-gray-400 mt-2">Partner: {c.primary_partner}</p>
          )}
          {c.tags?.length > 0 && <div className="mt-2"><TagPills tags={c.tags} max={2} /></div>}
        </div>
      ))}
    </div>
  )
}
