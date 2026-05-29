import { NavLink } from 'react-router-dom'
import {
  HomeIcon,
  BriefcaseIcon,
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
import { useAuth } from '../context/AuthContext'

const ALL_NAV = [
  { to: '/dashboard',     label: 'Dashboard',           Icon: HomeIcon,             roles: ['admin','manager','staff'] },
  { to: '/contacts',      label: 'Contacts',            Icon: BuildingOffice2Icon,  roles: ['admin','manager','staff'] },
  { to: '/projects',      label: 'Projects',            Icon: FolderOpenIcon,       roles: ['admin','manager','staff'] },
  { to: '/engagements',   label: 'Engagements',         Icon: BriefcaseIcon,        roles: ['admin','manager','staff'] },
  { to: '/time-tracking', label: 'Time Tracking',       Icon: ClockIcon,            roles: ['admin','manager','staff'] },
  { to: '/billing',       label: 'Billing',             Icon: CurrencyDollarIcon,   roles: ['admin','manager'] },
  { to: '/ar',            label: 'Accounts Receivable', Icon: BanknotesIcon,        roles: ['admin','manager'] },
  { to: '/staff',         label: 'Staff',               Icon: UsersIcon,            roles: ['admin','manager'] },
  { to: '/reports',       label: 'Reports',             Icon: ChartBarIcon,         roles: ['admin','manager'] },
  { to: '/due-dates',     label: 'Due Dates',           Icon: CalendarIcon,         roles: ['admin','manager','staff'] },
]

const ALL_BOTTOM = [
  { to: '/templates', label: 'Templates', Icon: DocumentDuplicateIcon, roles: ['admin','manager'] },
  { to: '/notes',     label: 'Notes',     Icon: DocumentTextIcon,      roles: ['admin','manager','staff'] },
  { to: '/settings',  label: 'Settings',  Icon: Cog6ToothIcon,         roles: ['admin'] },
]

function NavItem({ to, label, Icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-accent text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'
        }`
      }
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      {label}
    </NavLink>
  )
}

export default function Sidebar() {
  const { user } = useAuth()
  const role = user?.role || 'staff'

  const nav    = ALL_NAV.filter(item => item.roles.includes(role))
  const bottom = ALL_BOTTOM.filter(item => item.roles.includes(role))

  return (
    <aside className="w-60 flex-shrink-0 bg-gray-900 flex flex-col">
      <div className="px-6 py-5 border-b border-gray-700/60">
        <p className="text-white font-bold text-lg leading-tight tracking-tight">MGR CPAs</p>
        <p className="text-gray-400 text-xs mt-0.5">Maurer, Graf &amp; Rivera</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(item => <NavItem key={item.to} {...item} />)}
      </nav>

      <div className="px-3 pb-4 border-t border-gray-700/60 pt-3 space-y-0.5">
        {bottom.map(item => <NavItem key={item.to} {...item} />)}
      </div>
    </aside>
  )
}
