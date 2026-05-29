const PROJECT_STATUSES = [
  { key: 'Not Started',     label: 'Not Started',     weight: 0, color: 'gray' },
  { key: 'In Progress',     label: 'In Progress',     weight: 1, color: 'blue' },
  { key: 'Awaiting Client', label: 'Awaiting Client', weight: 2, color: 'yellow' },
  { key: 'In Review',       label: 'In Review',       weight: 3, color: 'purple' },
  { key: 'Extension Filed', label: 'Extension Filed', weight: 4, color: 'orange' },
  { key: 'Completed',       label: 'Completed',       weight: 5, color: 'green' },
  { key: 'Delivered',       label: 'Delivered',       weight: 6, color: 'teal' },
];

const STATUS_KEYS = PROJECT_STATUSES.map(s => s.key);

module.exports = { PROJECT_STATUSES, STATUS_KEYS };
