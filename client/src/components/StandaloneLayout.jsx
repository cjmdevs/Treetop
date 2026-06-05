/**
 * StandaloneLayout — renders a module with NO sidebar.
 *
 * Topbar:
 *   Left  — "← Dashboard" back button (browser only, hidden in Electron)
 *             + divider + brand mark + module name
 *   Right — current user info + logout
 *
 * "← Dashboard" is hidden in Electron because each module is its own OS window;
 * the dashboard is a separate window the user can click over to — an in-tab
 * "back" button would be confusing.  In the browser (single tab), it's the
 * only way to return to the launcher so we show it.
 *
 * All window.__treetop__ accesses are guarded — never throws in a browser.
 */

import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  ArrowLeftIcon,
  ArrowRightStartOnRectangleIcon,
} from '@heroicons/react/24/outline'
import { ALL_MODULES, STANDALONE_PREFIX } from '../config/modules'

/** Resolve the human-readable module name from the current /m/... path */
function useModuleLabel() {
  const { pathname } = useLocation()
  const withoutPrefix = pathname.slice(STANDALONE_PREFIX.length)   // '/contacts/123'
  const firstSegment  = withoutPrefix.split('/').filter(Boolean)[0] // 'contacts'
  const mod = ALL_MODULES.find(m => m.key === firstSegment)
  return mod?.label ?? 'Treetop Management'
}

export default function StandaloneLayout() {
  const { user, logout } = useAuth()
  const navigate         = useNavigate()
  const moduleLabel      = useModuleLabel()

  // In Electron, each module runs in its own OS window — the back button is
  // not useful (and would navigate this window to /dashboard, which is wrong).
  const isElectron = Boolean(window.__treetop__?.isElectron)

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">

      {/* ── Standalone topbar ──────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between gap-4">

        {/* Left: [← Dashboard (browser only)] + divider + brand mark + module name */}
        <div className="flex items-center gap-3 min-w-0">

          {/* Back button — shown in browser, hidden in Electron */}
          {!isElectron && (
            <>
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-1.5 text-sm font-medium text-gray-500
                           hover:text-gray-900 hover:bg-gray-100 px-2.5 py-1.5 rounded-lg
                           transition-colors flex-shrink-0"
              >
                <ArrowLeftIcon className="w-3.5 h-3.5" />
                Dashboard
              </button>
              <div className="w-px h-5 bg-gray-200 flex-shrink-0" />
            </>
          )}

          {/* Brand mark + module name — always visible */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-white text-xs font-bold select-none">T</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 truncate">{moduleLabel}</span>
          </div>
        </div>

        {/* Right: user chip + logout */}
        {user && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-800 leading-tight">{user.full_name}</p>
              <p className="text-xs text-gray-400 capitalize leading-tight">{user.role}</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center
                            text-white text-xs font-bold flex-shrink-0 select-none">
              {user.full_name?.charAt(0).toUpperCase()}
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
            </button>
          </div>
        )}
      </header>

      {/* ── Module content ─────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

    </div>
  )
}
