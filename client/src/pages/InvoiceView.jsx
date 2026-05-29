import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { invoicesApi } from '../api/invoices'
import { PrinterIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'

export default function InvoiceView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [inv, setInv] = useState(null)

  useEffect(() => { invoicesApi.get(id).then(setInv) }, [id])

  if (!inv) return <div className="p-8 text-gray-400">Loading...</div>

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600">
          <ArrowLeftIcon className="w-4 h-4" /> Back
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
          <PrinterIcon className="w-4 h-4" /> Print / Save PDF
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">MGR CPAs</h1>
            <p className="text-sm text-gray-500 mt-0.5">Maurer, Graf & Rivera</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold font-mono text-accent">{inv.invoice_number}</p>
            <p className="text-sm text-gray-500 mt-1">Invoice</p>
          </div>
        </div>

        {/* Bill to / Dates */}
        <div className="grid grid-cols-2 gap-8 mb-10">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Bill To</p>
            <p className="font-semibold text-gray-900">{inv.client_name}</p>
          </div>
          <div className="text-right">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-8">
                <dt className="text-gray-500">Invoice Date</dt>
                <dd className="text-gray-900">{inv.invoice_date}</dd>
              </div>
              <div className="flex justify-between gap-8">
                <dt className="text-gray-500">Due Date</dt>
                <dd className="text-gray-900 font-medium">{inv.due_date || '—'}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Line Items */}
        <table className="w-full text-sm mb-8">
          <thead>
            <tr className="border-b-2 border-gray-900 text-left">
              <th className="pb-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">Description</th>
              <th className="pb-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">Date</th>
              <th className="pb-2 text-xs font-semibold text-gray-700 uppercase tracking-wide">Code</th>
              <th className="pb-2 text-xs font-semibold text-gray-700 uppercase tracking-wide text-right">Hrs</th>
              <th className="pb-2 text-xs font-semibold text-gray-700 uppercase tracking-wide text-right">Rate</th>
              <th className="pb-2 text-xs font-semibold text-gray-700 uppercase tracking-wide text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {inv.line_items.map(li => (
              <tr key={li.id}>
                <td className="py-3 text-gray-700">{li.description}</td>
                <td className="py-3 text-gray-500">{li.date || '—'}</td>
                <td className="py-3 text-gray-500">{li.service_code || '—'}</td>
                <td className="py-3 font-mono text-gray-700 text-right">{li.hours != null ? li.hours : '—'}</td>
                <td className="py-3 font-mono text-gray-700 text-right">{li.rate ? `$${li.rate}` : '—'}</td>
                <td className="py-3 font-mono font-medium text-gray-900 text-right">${li.amount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-64 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-mono text-gray-900">${inv.subtotal.toLocaleString()}</span>
            </div>
            {inv.tax_rate > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-500">Tax ({inv.tax_rate}%)</span>
                <span className="font-mono text-gray-900">${inv.tax_amount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-gray-900 pt-2 font-semibold text-base">
              <span>Total</span>
              <span className="font-mono">${inv.total.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {inv.notes && (
          <div className="mt-10 pt-6 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
            <p className="text-sm text-gray-600">{inv.notes}</p>
          </div>
        )}

        <div className="mt-10 pt-6 border-t border-gray-100 text-xs text-gray-400 text-center">
          Thank you for your business. Payment due within 30 days.
        </div>
      </div>
    </div>
  )
}
