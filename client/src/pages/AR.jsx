import { useEffect, useState } from 'react'
import { paymentsApi }  from '../api/payments'
import { billingApi }   from '../api/billing'
import { useToast }     from '../context/ToastContext'
import StatCard         from '../components/StatCard'
import { BillingStatusBadge } from '../components/Badge'

const METHODS = ['Check', 'ACH', 'Credit Card', 'Wire', 'Cash', 'Other']
const PAY_BLANK = {
  client_name: '', amount: '', payment_date: new Date().toISOString().split('T')[0],
  payment_method: 'Check', reference_number: '', notes: '',
}

// Compute aging bucket info for an unpaid billing record
function agingInfo(record) {
  const refDate = new Date(record.invoice_date || record.created_at)
  const days    = Math.floor((Date.now() - refDate.getTime()) / 86400000)
  if (days <= 30)  return { days, label: '0–30d',  textCls: 'text-emerald-600', bgCls: 'bg-emerald-50' }
  if (days <= 60)  return { days, label: '31–60d', textCls: 'text-amber-600',   bgCls: 'bg-amber-50' }
  if (days <= 90)  return { days, label: '61–90d', textCls: 'text-orange-600',  bgCls: 'bg-orange-50' }
  return           { days, label: '90+d',  textCls: 'text-red-600',     bgCls: 'bg-red-50' }
}

const inputCls  = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'
const labelCls  = 'block text-sm font-medium text-gray-700 mb-1'
const thCls     = 'pb-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wide'

const TABS = [
  { id: 'outstanding', label: 'Outstanding' },
  { id: 'all',         label: 'All Records' },
  { id: 'paid',        label: 'Paid' },
]

export default function AR() {
  const { toast }  = useToast()

  const [aging,        setAging]       = useState(null)   // { buckets, records } — unpaid only
  const [ledger,       setLedger]      = useState([])     // ALL billing records
  const [payments,     setPayments]    = useState([])
  const [ledgerTab,    setLedgerTab]   = useState('outstanding')
  const [clientSearch, setClientSearch] = useState('')
  const [showPayForm, setShowPayForm] = useState(false)
  const [payForm,   setPayForm]   = useState(PAY_BLANK)
  const [savingPay, setSavingPay] = useState(false)
  const [savingRec, setSavingRec] = useState(null)   // id being status-updated

  const load = () => {
    paymentsApi.aging().then(setAging)
    billingApi.list().then(data => setLedger(Array.isArray(data) ? data : []))
    paymentsApi.list().then(setPayments)
  }
  useEffect(() => { load() }, [])

  // ── Ledger filter ──────────────────────────────────────────────────────────
  const filteredLedger = ledger.filter(r => {
    if (ledgerTab === 'outstanding' && r.status === 'Paid')  return false
    if (ledgerTab === 'paid'        && r.status !== 'Paid')  return false
    if (clientSearch && !r.client_name?.toLowerCase().includes(clientSearch.toLowerCase())) return false
    return true
  })

  // ── Billing record status change ───────────────────────────────────────────
  const handleBillingStatus = async (record, newStatus) => {
    setSavingRec(record.id)
    try {
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
    } catch {
      toast.error('Failed to update status.')
    } finally {
      setSavingRec(null)
    }
  }

  // ── Record payment ─────────────────────────────────────────────────────────
  const setPayField = f => e => setPayForm(v => ({ ...v, [f]: e.target.value }))
  const handlePaySubmit = async e => {
    e.preventDefault()
    setSavingPay(true)
    try {
      await paymentsApi.create({ ...payForm, amount: parseFloat(payForm.amount) })
      setPayForm(PAY_BLANK)
      setShowPayForm(false)
      load()
      toast.success('Payment recorded.')
    } catch {
      toast.error('Failed to record payment.')
    } finally {
      setSavingPay(false)
    }
  }
  const handlePayDelete = async id => {
    if (!confirm('Delete this payment?')) return
    await paymentsApi.delete(id)
    load()
  }

  // ── Derived totals ─────────────────────────────────────────────────────────
  const buckets = aging?.buckets ?? { current: 0, days31_60: 0, days61_90: 0, days90plus: 0 }
  const totalOutstanding = (buckets.current || 0) + (buckets.days31_60 || 0) +
                           (buckets.days61_90 || 0) + (buckets.days90plus || 0)

  const fmt$ = n => `$${Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="p-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accounts Receivable</h1>
          <p className="text-sm text-gray-500 mt-0.5">Billing ledger · aging · payment history</p>
        </div>
        <button
          onClick={() => setShowPayForm(v => !v)}
          className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-dark transition-colors"
        >
          + Record Payment
        </button>
      </div>

      {/* ── Aging stat cards (outstanding only — Unbilled + Invoiced) ── */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard label="Total Outstanding"  value={fmt$(totalOutstanding)}             sub="unpaid receivables" />
        <StatCard label="Current (0–30d)"    value={fmt$(buckets.current)}              sub="outstanding" />
        <StatCard label="31–60 Days"         value={fmt$(buckets.days31_60)}            sub="outstanding" />
        <StatCard label="61–90 Days"         value={fmt$(buckets.days61_90)}            sub="outstanding" />
        <StatCard label="90+ Days"           value={fmt$(buckets.days90plus)}           sub="outstanding" />
      </div>

      {/* ── Record Payment form ── */}
      {showPayForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Record Payment</h2>
          <form onSubmit={handlePaySubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Client Name *</label>
              <input required value={payForm.client_name} onChange={setPayField('client_name')} className={inputCls} placeholder="Client name" />
            </div>
            <div>
              <label className={labelCls}>Amount *</label>
              <input required type="number" step="0.01" min="0.01" value={payForm.amount} onChange={setPayField('amount')} className={inputCls} placeholder="e.g. 1500.00" />
            </div>
            <div>
              <label className={labelCls}>Payment Date *</label>
              <input required type="date" value={payForm.payment_date} onChange={setPayField('payment_date')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Payment Method</label>
              <select value={payForm.payment_method} onChange={setPayField('payment_method')} className={inputCls}>
                {METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Reference Number</label>
              <input value={payForm.reference_number} onChange={setPayField('reference_number')} className={inputCls} placeholder="Check #, ACH ref, etc." />
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <input value={payForm.notes} onChange={setPayField('notes')} className={inputCls} placeholder="Optional notes" />
            </div>
            <div className="col-span-2 flex justify-end gap-3">
              <button type="button" onClick={() => setShowPayForm(false)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button type="submit" disabled={savingPay} className="px-6 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-dark disabled:opacity-50">
                {savingPay ? 'Saving…' : 'Record Payment'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Billing Ledger ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Header + tabs */}
        <div className="px-6 pt-5 pb-0 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Billing Ledger</h2>
            <div className="flex items-center gap-3">
              <input
                type="search"
                value={clientSearch}
                onChange={e => setClientSearch(e.target.value)}
                placeholder="Filter by client…"
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <span className="text-xs text-gray-400">
                {filteredLedger.length} record{filteredLedger.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          {/* Tab bar */}
          <div className="flex gap-1">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setLedgerTab(t.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
                  ledgerTab === t.id
                    ? 'border-accent text-accent bg-accent-light'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.label}
                {t.id === 'outstanding' && (aging?.records?.length > 0) && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full font-semibold">
                    {aging.records.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-gray-500">
              {['Client', 'Type', 'Amount', 'Status', 'Invoice Date', ledgerTab !== 'paid' ? 'Age' : 'Notes', 'Actions'].map(h => (
                <th key={h} className={`px-5 py-3 ${thCls}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredLedger.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                  {ledgerTab === 'outstanding' ? 'No outstanding balances.' : ledgerTab === 'paid' ? 'No paid records yet.' : 'No billing records yet.'}
                </td>
              </tr>
            ) : filteredLedger.map(r => {
              const aging = r.status !== 'Paid' ? agingInfo(r) : null
              return (
                <tr key={r.id} className={`hover:bg-gray-50 ${aging && aging.days > 60 ? (aging.days > 90 ? 'bg-red-50/40' : 'bg-orange-50/40') : ''}`}>
                  <td className="px-5 py-3 font-medium text-gray-900">{r.client_name}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{r.engagement_type}</td>
                  <td className="px-5 py-3 font-mono font-semibold text-gray-900">{fmt$(r.invoice_amount)}</td>
                  <td className="px-5 py-3"><BillingStatusBadge status={r.status} /></td>
                  <td className="px-5 py-3 text-gray-500 text-xs">{r.invoice_date || '—'}</td>
                  {ledgerTab !== 'paid' ? (
                    <td className={`px-5 py-3 text-xs font-semibold ${aging ? aging.textCls : 'text-gray-400'}`}>
                      {aging ? `${aging.days}d · ${aging.label}` : '—'}
                    </td>
                  ) : (
                    <td className="px-5 py-3 text-gray-400 text-xs max-w-xs truncate">{r.notes || '—'}</td>
                  )}
                  <td className="px-5 py-3">
                    <div className="flex flex-col gap-1">
                      {savingRec === r.id ? (
                        <span className="text-xs text-gray-400">Saving…</span>
                      ) : (
                        <>
                          {r.status === 'Unbilled' && (
                            <button
                              onClick={() => handleBillingStatus(r, 'Invoiced')}
                              className="text-xs text-accent hover:text-accent-dark font-medium transition-colors"
                            >
                              Mark Invoiced
                            </button>
                          )}
                          {r.status === 'Invoiced' && (
                            <button
                              onClick={() => handleBillingStatus(r, 'Paid')}
                              className="text-xs text-green-600 hover:text-green-800 font-medium transition-colors"
                            >
                              Mark Paid
                            </button>
                          )}
                          {r.status === 'Paid' && (
                            <span className="text-xs text-gray-400">Collected</span>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Payment History ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Payment History</h2>
          <p className="text-xs text-gray-400 mt-0.5">Cash receipts — separate from billing record status</p>
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
            {payments.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-gray-400">No payments recorded yet.</td>
              </tr>
            ) : payments.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">{p.client_name}</td>
                <td className="px-5 py-3 font-mono text-emerald-700 font-semibold">{fmt$(p.amount)}</td>
                <td className="px-5 py-3 text-gray-600">{p.payment_date}</td>
                <td className="px-5 py-3 text-gray-500">{p.payment_method}</td>
                <td className="px-5 py-3 text-gray-400">{p.reference_number || '—'}</td>
                <td className="px-5 py-3 text-gray-400 max-w-xs truncate">{p.notes || '—'}</td>
                <td className="px-5 py-3">
                  <button onClick={() => handlePayDelete(p.id)} className="text-xs text-red-400 hover:text-red-600 transition-colors">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
