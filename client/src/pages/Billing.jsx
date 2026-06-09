import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { billingApi } from '../api/billing'
import { engagementsApi } from '../api/engagements'
import { invoicesApi } from '../api/invoices'
import { BillingStatusBadge } from '../components/Badge'
import StatCard from '../components/StatCard'

const BLANK = {
  engagement_id: '', invoice_amount: '', status: 'Unbilled', invoice_date: '', notes: '',
}

export default function Billing() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [summary, setSummary] = useState(null)
  const [engagements, setEngagements] = useState([])
  const [form, setForm] = useState(BLANK)
  const [showForm,      setShowForm]      = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [generatingId,  setGeneratingId]  = useState(null)
  const [clientSearch,  setClientSearch]  = useState('')

  const load = () => {
    billingApi.list().then(setRecords)
    billingApi.summary().then(setSummary)
    engagementsApi.list().then(setEngagements)
  }

  useEffect(() => { load() }, [])

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      await billingApi.create({
        ...form,
        engagement_id:  parseInt(form.engagement_id),
        invoice_amount: parseFloat(form.invoice_amount),
      })
      setForm(BLANK)
      setShowForm(false)
      load()
    } finally { setSaving(false) }
  }

  const handleGenerateInvoice = async (record) => {
    setGeneratingId(record.id)
    try {
      const inv = await invoicesApi.generate(record.id, {})
      navigate(`/invoices/${inv.id}`)
    } finally { setGeneratingId(null) }
  }

  const handleStatusChange = async (record, newStatus) => {
    await billingApi.update(record.id, {
      engagement_id:  record.engagement_id,
      invoice_amount: record.invoice_amount,
      notes:          record.notes,
      status:         newStatus,
      invoice_date:
        newStatus === 'Invoiced' && !record.invoice_date
          ? new Date().toISOString().split('T')[0]
          : record.invoice_date,
    })
    load()
  }

  const filteredRecords = clientSearch
    ? records.filter(r => r.client_name?.toLowerCase().includes(clientSearch.toLowerCase()))
    : records

  const inputCls =
    'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-dark transition-colors"
        >
          + New Record
        </button>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard
            label="Unbilled"
            value={`$${(summary.unbilled_total || 0).toLocaleString()}`}
            sub={`${summary.unbilled_count} record${summary.unbilled_count !== 1 ? 's' : ''}`}
          />
          <StatCard
            label="Invoiced"
            value={`$${(summary.invoiced_total || 0).toLocaleString()}`}
            sub={`${summary.invoiced_count} record${summary.invoiced_count !== 1 ? 's' : ''}`}
          />
          <StatCard
            label="Paid"
            value={`$${(summary.paid_total || 0).toLocaleString()}`}
            sub={`${summary.paid_count} record${summary.paid_count !== 1 ? 's' : ''}`}
          />
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">New Billing Record</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Engagement *</label>
              <select
                required
                value={form.engagement_id}
                onChange={set('engagement_id')}
                className={inputCls}
              >
                <option value="">Select engagement...</option>
                {engagements.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.client_name} — {e.engagement_type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Invoice Amount *</label>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={form.invoice_amount}
                onChange={set('invoice_amount')}
                className={inputCls}
                placeholder="e.g. 1500.00"
              />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={set('status')} className={inputCls}>
                {['Unbilled', 'Invoiced', 'Paid'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Invoice Date</label>
              <input
                type="date"
                value={form.invoice_date}
                onChange={set('invoice_date')}
                className={inputCls}
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Notes</label>
              <input
                value={form.notes}
                onChange={set('notes')}
                className={inputCls}
                placeholder="Optional notes"
              />
            </div>
            <div className="col-span-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-dark disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Record'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}
            {clientSearch ? ` matching "${clientSearch}"` : ''}
          </span>
          <input
            type="search"
            value={clientSearch}
            onChange={e => setClientSearch(e.target.value)}
            placeholder="Filter by client…"
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-gray-500">
              {['Client', 'Type', 'Amount', 'Status', 'Invoice Date', 'Notes', 'Actions'].map(h => (
                <th key={h} className="px-5 py-3 text-xs font-medium uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredRecords.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{r.client_name}</td>
                <td className="px-5 py-3 text-gray-500">{r.engagement_type}</td>
                <td className="px-5 py-3 text-gray-900">${r.invoice_amount.toLocaleString()}</td>
                <td className="px-5 py-3"><BillingStatusBadge status={r.status} /></td>
                <td className="px-5 py-3 text-gray-500">{r.invoice_date || '—'}</td>
                <td className="px-5 py-3 text-gray-400 max-w-xs truncate">{r.notes || '—'}</td>
                <td className="px-5 py-3">
                  <div className="flex flex-col gap-1">
                    {r.status === 'Unbilled' && (
                      <>
                        <button onClick={() => handleStatusChange(r, 'Invoiced')} className="text-xs text-accent hover:text-accent-dark font-medium">
                          Mark Invoiced
                        </button>
                        <button
                          onClick={() => handleGenerateInvoice(r)}
                          disabled={generatingId === r.id}
                          className="text-xs text-gray-500 hover:text-gray-700 font-medium disabled:opacity-50"
                        >
                          {generatingId === r.id ? 'Generating…' : 'Gen Invoice'}
                        </button>
                      </>
                    )}
                    {r.status === 'Invoiced' && (
                      <button onClick={() => handleStatusChange(r, 'Paid')} className="text-xs text-green-600 hover:text-green-800 font-medium">
                        Mark Paid
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredRecords.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                  {clientSearch ? `No records matching "${clientSearch}".` : 'No billing records yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
