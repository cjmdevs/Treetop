import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { DASHBOARD_NAV, NAV_MAIN, NAV_BOTTOM } from '../config/modules'

/**
 * NavItem — renders differently in expanded vs collapsed (icon-rail) mode.
 *
 * Collapsed:  icon only, centered, with native `title` tooltip.
 * Expanded:   icon + label, standard left-aligned layout.
 */
function NavItem({ to, label, Icon, collapsed }) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        [
          'flex items-center rounded-lg transition-colors',
          collapsed
            ? 'justify-center p-2.5'
            : 'gap-3 px-3 py-2 text-sm font-medium',
          isActive
            ? 'bg-accent text-white'
            : 'text-gray-300 hover:text-white hover:bg-white/10',
        ].join(' ')
      }
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      {!collapsed && label}
    </NavLink>
  )
}

/**
 * Sidebar — collapsible navigation panel.
 *
 * collapsed=false  →  w-60, full labels visible
 * collapsed=true   →  w-14 icon rail, labels hidden, tooltips on hover
 *
 * The `collapsed` prop and toggle state live in Layout.jsx so the topbar's
 * hamburger button can control it without needing a shared context.
 */
export default function Sidebar({ collapsed = false }) {
  const { user } = useAuth()
  const role = user?.role || 'staff'

  const topItems    = [DASHBOARD_NAV, ...NAV_MAIN].filter(item => item.roles.includes(role))
  const bottomItems = NAV_BOTTOM.filter(item => item.roles.includes(role))

  return (
    <aside
      className={[
        'flex-shrink-0 bg-sidebar flex flex-col overflow-hidden',
        'transition-all duration-200 ease-in-out',
        collapsed ? 'w-14' : 'w-60',
      ].join(' ')}
    >
      {/* ── Brand / logo area ────────────────────────────────────────────── */}
      {collapsed ? (
        <div className="h-[61px] border-b border-white/10 flex items-center justify-center flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-accent/25 flex items-center justify-center">
            <span className="text-white font-bold text-sm select-none">T</span>
          </div>
        </div>
      ) : (
        <div className="px-6 py-5 border-b border-white/10 flex-shrink-0">
          <p className="text-white font-bold text-lg leading-tight tracking-tight">Treetop</p>
          <p className="text-secondary text-xs mt-0.5 font-medium tracking-wide uppercase">Management</p>
        </div>
      )}

      {/* ── Main nav ─────────────────────────────────────────────────────── */}
      <nav className={['flex-1 py-4 space-y-0.5', collapsed ? 'px-1.5' : 'px-3'].join(' ')}>
        {topItems.map(item => (
          <NavItem key={item.to} {...item} collapsed={collapsed} />
        ))}
      </nav>

      {/* ── Bottom nav (Templates / Notes / Settings) ────────────────────── */}
      <div
        className={[
          'pb-4 border-t border-white/10 pt-3 space-y-0.5',
          collapsed ? 'px-1.5' : 'px-3',
        ].join(' ')}
      >
        {bottomItems.map(item => (
          <NavItem key={item.to} {...item} collapsed={collapsed} />
        ))}
      </div>
    </aside>
  )
}
