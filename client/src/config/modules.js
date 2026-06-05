/**
 * modules.js — single source of truth for navigable modules.
 *
 * Consumed by:
 *   • Sidebar.jsx          — builds the nav link list
 *   • Dashboard.jsx        — builds the launcher tile grid
 *   • StandaloneLayout.jsx — resolves the current module's display name
 *
 * Role gating lives here once and is imported everywhere — no divergent copies.
 *
 * STANDALONE_PREFIX: routes under /m/... render inside StandaloneLayout (no sidebar).
 * Phase 4b: Electron intercepts tile-clicks to open /m/... routes in new windows.
 */

import {
  HomeIcon,
  ClockIcon,
  CurrencyDollarIcon,
  UsersIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  BanknotesIcon,
  ChartBarIcon,
  CalendarIcon,
  BuildingOffice2Icon,
  FolderOpenIcon,
} from '@heroicons/react/24/outline'

export const STANDALONE_PREFIX = '/m'

/**
 * All navigable modules (not including the dashboard itself).
 *
 * `key`         — first path segment, used by StandaloneLayout for title lookup
 * `to`          — normal route path  (e.g. '/contacts')
 * `standalone`  — standalone route   (e.g. '/m/contacts') — derived, not stored
 * `roles`       — who can see/access this module
 * `description` — one-liner for launcher tiles
 */
export const ALL_MODULES = [
  {
    key: 'contacts',
    to: '/contacts',
    label: 'Contacts',
    description: 'Clients & contacts',
    Icon: BuildingOffice2Icon,
    roles: ['admin', 'manager', 'staff'],
  },
  {
    key: 'projects',
    to: '/projects',
    label: 'Projects',
    description: 'Manage client work',
    Icon: FolderOpenIcon,
    roles: ['admin', 'manager', 'staff'],
  },
  {
    key: 'time-tracking',
    to: '/time-tracking',
    label: 'Time Tracking',
    description: 'Log & review hours',
    Icon: ClockIcon,
    roles: ['admin', 'manager', 'staff'],
  },
  {
    key: 'billing',
    to: '/billing',
    label: 'Billing',
    description: 'Invoices & billing',
    Icon: CurrencyDollarIcon,
    roles: ['admin', 'manager'],
  },
  {
    key: 'ar',
    to: '/ar',
    label: 'Accounts Receivable',
    description: 'Outstanding balances',
    Icon: BanknotesIcon,
    roles: ['admin', 'manager'],
  },
  {
    key: 'staff',
    to: '/staff',
    label: 'Staff',
    description: 'Team & rates',
    Icon: UsersIcon,
    roles: ['admin', 'manager'],
  },
  {
    key: 'reports',
    to: '/reports',
    label: 'Reports',
    description: 'Analytics & exports',
    Icon: ChartBarIcon,
    roles: ['admin', 'manager'],
  },
  {
    key: 'due-dates',
    to: '/due-dates',
    label: 'Due Dates',
    description: 'Deadlines & calendar',
    Icon: CalendarIcon,
    roles: ['admin', 'manager', 'staff'],
  },
  {
    key: 'templates',
    to: '/templates',
    label: 'Templates',
    description: 'Workflow templates',
    Icon: DocumentDuplicateIcon,
    roles: ['admin', 'manager'],
  },
  {
    key: 'notes',
    to: '/notes',
    label: 'Notes',
    description: 'Client & work notes',
    Icon: DocumentTextIcon,
    roles: ['admin', 'manager', 'staff'],
  },
  {
    key: 'settings',
    to: '/settings',
    label: 'Settings',
    description: 'System configuration',
    Icon: Cog6ToothIcon,
    roles: ['admin'],
  },
]

/** Dashboard link — sidebar-only, not a launcher tile (we're already there) */
export const DASHBOARD_NAV = {
  key: 'dashboard',
  to: '/dashboard',
  label: 'Dashboard',
  Icon: HomeIcon,
  roles: ['admin', 'manager', 'staff'],
}

/** Split matching the sidebar's two visual groups */
export const NAV_MAIN   = ALL_MODULES.filter(m => !['templates', 'notes', 'settings'].includes(m.key))
export const NAV_BOTTOM = ALL_MODULES.filter(m =>  ['templates', 'notes', 'settings'].includes(m.key))
