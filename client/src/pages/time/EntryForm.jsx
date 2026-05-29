import { useEffect, useRef, useState } from 'react'
import { CheckIcon } from '@heroicons/react/24/solid'
import { timeEntriesApi } from '../../api/timeEntries'
import { useAuth } from '../../context/AuthContext'

const TODAY = () => new Date().toISOString().split('T')[0]

// Searchable select — filters by searchText (supports number, abbreviation, description)
function SearchSelect({ options, value, onChange, placeholder, disabled }) {
  const [open, setOpen] = useState(false)
  const [q, setQ]       = useState('')
  const wrapRef         = useRef(null)
  const chosen          = options.find(o => o.value === value)

  useEffect(() => {
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = q
    ? options.filter(o => o.searchText.toLowerCase().includes(q.toLowerCase()))
    : options

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(v => !v); setQ('') }}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-accent bg-white disabled:opacity-50 disabled:cursor-not-allowed truncate"
      >
        {chosen ? chosen.label : <span className="text-gray-400">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search..."
              className="w-full text-sm px-2 py-1 outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-gray-400">No results</p>
            )}
            {filtered.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); setQ('') }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${o.value === value ? 'text-accent font-medium' : 'text-gray-700'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const BLANK = (rate) => ({
  date:          TODAY(),
  engagement_id: '',
  service_code:  '',
  hours:         '',
  billing_rate:  rate ? String(rate) : '',
  notes:         '',
  billable:      true,
  internal_memo: false,
})

export default function EntryForm({
  prefill,
  engagements = [],
  serviceCodes = [],
  onSaved,
}) {
  const { user } = useAuth()
  const defaultRate = user?.default_hourly_rate || ''

  const [form, setForm]     = useState(() => BLANK(defaultRate))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  // Apply prefill when a timer stops and pre-fills the form
  useEffect(() => {
    if (prefill) {
      setForm(f => ({
        ...f,
        engagement_id: String(prefill.engagementId || ''),
        hours:         String(prefill.hours || ''),
      }))
    }
  }, [prefill])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleServiceCode = code => {
    set('service_code', code)
  }

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.engagement_id || !form.hours) return
    setSaving(true)
    try {
      await timeEntriesApi.create({
        engagement_id: parseInt(form.engagement_id),
        date:          form.date,
        hours:         parseFloat(form.hours),
        billing_rate:  form.billing_rate ? parseFloat(form.billing_rate) : null,
        notes:         form.notes || null,
        billable:      form.billable,
        service_code:  form.service_code || null,
        internal_memo: form.internal_memo,
        entry_status:  'draft',
      })
      setForm(BLANK(defaultRate))
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  // Engagement options — searchable by client name + type + tax year
  const engOptions = engagements.map(e => ({
    value:      String(e.id),
    label:      `${e.client_name} — ${e.engagement_type}${e.tax_year ? ` (${e.tax_year})` : ''}`,
    searchText: `${e.client_name} ${e.engagement_type} ${e.tax_year || ''}`,
  }))

  // Service code options — searchable by number, abbreviation, or description
  const codeOptions = serviceCodes.map(c => ({
    value:      c.code,
    label:      `${c.number} — ${c.code} — ${c.description}`,
    searchText: `${c.number} ${c.code} ${c.description}`,
  }))

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <form onSubmit={handleSubmit}>
        {/* Row 1: date + engagement + service code */}
        <div className="grid grid-cols-12 gap-3 mb-3">
          <div className="col-span-2">
            <label className={labelCls}>Date</label>
            <input
              type="date"
              required
              value={form.date}
              onChange={e => set('date', e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="col-span-5">
            <label className={labelCls}>Client / Engagement *</label>
            <SearchSelect
              options={engOptions}
              value={form.engagement_id}
              onChange={v => set('engagement_id', v)}
              placeholder="Search client or engagement..."
            />
          </div>
          <div className="col-span-5">
            <label className={labelCls}>Service Code</label>
            <SearchSelect
              options={codeOptions}
              value={form.service_code}
              onChange={handleServiceCode}
              placeholder="Search by 101, TAX-PREP, or Tax Preparation..."
            />
          </div>
        </div>

        {/* Row 2: hours + rate + memo + billable + internal + save */}
        <div className="grid grid-cols-12 gap-3 items-end">
          <div className="col-span-1">
            <label className={labelCls}>Hours *</label>
            <input
              required
              type="number"
              step="0.25"
              min="0.25"
              value={form.hours}
              onChange={e => set('hours', e.target.value)}
              placeholder="1.5"
              className={inputCls}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Rate ($/hr)</label>
            <input
              type="number"
              step="0.01"
              value={form.billing_rate}
              readOnly
              tabIndex={-1}
              placeholder="Auto-filled"
              className={`${inputCls} bg-gray-50 text-gray-500 cursor-default`}
            />
          </div>
          <div className="col-span-6">
            <label className={labelCls}>Memo</label>
            <input
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Work description..."
              className={inputCls}
            />
          </div>
          <div className="col-span-2 flex items-center gap-4 pb-0.5">
            <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={form.billable}
                onChange={e => set('billable', e.target.checked)}
                className="rounded accent-[#1B4FD8]"
              />
              Billable
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer whitespace-nowrap" title="Internal memos never appear on client invoices">
              <input
                type="checkbox"
                checked={form.internal_memo}
                onChange={e => set('internal_memo', e.target.checked)}
                className="rounded accent-[#1B4FD8]"
              />
              Internal
            </label>
          </div>
          <div className="col-span-1">
            <button
              type="submit"
              disabled={saving || !form.engagement_id || !form.hours}
              className="w-full py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
            >
              {saved ? <><CheckIcon className="w-4 h-4" /> Saved</> : saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
