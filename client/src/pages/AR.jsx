import { useEffect, useState } from 'react'
import { paymentsApi } from '../api/payments'
import StatCard from '../components/StatCard'

const METHODS = ['Check', 'ACH', 'Credit Card', 'Wire', 'Cash', 'Other']

const BLANK = { client_name: '', amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'Check', reference_number: '', notes: '' }

export default function AR() {
  const [aging, setAging] = useState(null)
  const [payments, setPayments] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)

  const load = () => {
    paymentsApi.aging().then(setAging)
    paymentsApi.list().then(setPayments)
  }
  useEffect(() => { load() }, [])

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      await paymentsApi.create({ ...form, amount: parseFloat(form.amount) })
      setForm(BLANK)
      setShowForm(false)
      load()
    } finally { setSaving(false) }
  }

  const handleDelete = async id => {
    if (!confirm('Delete this payment?')) return
    await paymentsApi.delete(id)
    load()
  }

  const bucketLabel = b => ({ current: '0–30 days', '31-60': '31–60 days', '61-90': '61–90 days', '90+': '90+ days' }[b] || b)
  const bucketColor = b => ({ current: 'text-emerald-600', '31-60': 'text-amber-600', '61-90': 'text-orange-600', '90+': 'text-red-600' }[b] || 'text-gray-600')
  const rowColor = b => ({ current: '', '31-60': 'bg-amber-50', '61-90': 'bg-orange-50', '90+': 'bg-red-50' }[b] || '')

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const thCls = 'pb-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide'

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Accounts Receivable</h1>
        <button onClick={() => setShowForm(v => !v)} className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          + Record Payment
        </button>
      </div>

      {aging && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard label="Current (0–30d)"  value={`$${(aging.buckets.current    || 0).toLocaleString()}`} sub="outstanding" />
          <StatCard label="31–60 Days"        value={`$${(aging.buckets.days31_60  || 0).toLocaleString()}`} sub="outstanding" />
          <StatCard label="61–90 Days"        value={`$${(aging.buckets.days61_90  || 0).toLocaleString()}`} sub="outstanding" />
          <StatCard label="90+ Days"          value={`$${(aging.buckets.days90plus || 0).toLocaleString()}`} sub="outstanding" />
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Record Payment</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Client Name *</label>
              <input required value={form.client_name} onChange={set('client_name')} className={inputCls} placeholder="Client name" />
            </div>
            <div>
              <label className={labelCls}>Amount *</label>
              <input required type="number" step="0.01" min="0.01" value={form.amount} onChange={set('amount')} className={inputCls} placeholder="e.g. 1500.00" />
            </div>
            <div>
              <label className={labelCls}>Payment Date *</label>
              <input required type="date" value={form.payment_date} onChange={set('payment_date')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Payment Method</label>
              <select value={form.payment_method} onChange={set('payment_method')} className={inputCls}>
                {METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Reference Number</label>
              <input value={form.reference_number} onChange={set('reference_number')} className={inputCls} placeholder="Check #, ACH ref, etc." />
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <input value={form.notes} onChange={set('notes')} className={inputCls} placeholder="Optional notes" />
            </div>
            <div className="col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" disabled={saving} className="px-6 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Record Payment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {aging && aging.records.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Outstanding Balances</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-left text-gray-500">
                {['Client', 'Type', 'Amount', 'Age', 'Bucket', 'Status'].map(h => (
                  <th key={h} className={`px-5 py-3 ${thCls}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {aging.records.map(r => (
                <tr key={r.id} className={rowColor(r.bucket)}>
                  <td className="px-5 py-3 font-medium text-gray-900">{r.client_name}</td>
                  <td className="px-5 py-3 text-gray-500">{r.engagement_type}</td>
                  <td className="px-5 py-3 font-mono text-gray-900">${r.invoice_amount.toLocaleString()}</td>
                  <td className={`px-5 py-3 font-mono font-medium ${bucketColor(r.bucket)}`}>{r.days_outstanding}d</td>
                  <td className={`px-5 py-3 text-xs font-semibold ${bucketColor(r.bucket)}`}>{bucketLabel(r.bucket)}</td>
                  <td className="px-5 py-3 text-gray-500 capitalize">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Payment History</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-gray-500">
              {['Client', 'Amount', 'Date', 'Method', 'Reference', 'Notes', ''].map(h => (
                <th key={h} className={`px-5 py-3 ${thCls}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payments.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{p.client_name}</td>
                <td className="px-5 py-3 font-mono text-emerald-700 font-semibold">${p.amount.toLocaleString()}</td>
                <td className="px-5 py-3 text-gray-600">{p.payment_date}</td>
                <td className="px-5 py-3 text-gray-500">{p.payment_method}</td>
                <td className="px-5 py-3 text-gray-400">{p.reference_number || '—'}</td>
                <td className="px-5 py-3 text-gray-400 max-w-xs truncate">{p.notes || '—'}</td>
                <td className="px-5 py-3">
                  <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-600 text-xs">Delete</button>
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400">No payments recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
