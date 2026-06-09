const STATUS_CLS = {
  // Core workflow statuses
  'Not Started':     'bg-gray-100 text-gray-700',
  'In Progress':     'bg-blue-100 text-blue-700',
  'In Review':       'bg-yellow-100 text-yellow-700',
  'Complete':        'bg-green-100 text-green-700',
  'Completed':       'bg-green-100 text-green-700',
  'On Hold':         'bg-red-100 text-red-700',
  'Cancelled':       'bg-red-100 text-red-700',
  // Project-specific statuses
  'Active':          'bg-blue-100 text-blue-700',
  'Extension Filed': 'bg-orange-100 text-orange-700',
  'Delivered':       'bg-green-100 text-green-700',
}

const PRIORITY_CLS = {
  Low:    'bg-gray-100 text-gray-600',
  Medium: 'bg-orange-100 text-orange-700',
  High:   'bg-red-100 text-red-700',
}

const BILLING_CLS = {
  Unbilled: 'bg-gray-100 text-gray-700',
  Invoiced: 'bg-blue-100 text-blue-700',
  Paid:     'bg-green-100 text-green-700',
}

function Chip({ cls, label }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

export function StatusBadge({ status }) {
  return <Chip cls={STATUS_CLS[status] ?? 'bg-gray-100 text-gray-700'} label={status} />
}

export function PriorityBadge({ priority }) {
  return <Chip cls={PRIORITY_CLS[priority] ?? 'bg-gray-100 text-gray-600'} label={priority} />
}

export function BillingStatusBadge({ status }) {
  return <Chip cls={BILLING_CLS[status] ?? 'bg-gray-100 text-gray-700'} label={status} />
}
