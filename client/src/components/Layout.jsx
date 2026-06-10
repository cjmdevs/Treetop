import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Sidebar from './Sidebar'
import { useAuth } from '../context/AuthContext'
import {
  ArrowRightStartOnRectangleIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline'

const SIDEBAR_KEY = 'treetop_sidebar_collapsed'

// ── Layout ────────────────────────────────────────────────────────────────────

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate         = useNavigate()
  const { pathname }     = useLocation()

  // ── Sidebar collapsed state ───────────────────────────────────────────────
  // Default: collapsed on /dashboard (launcher is the focus), expanded elsewhere.
  // User's manual toggle is persisted to localStorage and respected on every
  // subsequent visit regardless of route.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY)
    if (stored !== null) return stored === 'true'
    return pathname === '/dashboard'
  })

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev
      localStorage.setItem(SIDEBAR_KEY, String(next))
      return next
    })
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
      if (e.key === 'n' || e.key === 'N') navigate('/engagements/new')
      if (e.key === 't' || e.key === 'T') navigate('/time-tracking')
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [navigate])

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <Sidebar collapsed={sidebarCollapsed} />

      {/* ── Main column ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Topbar */}
        <header className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3">

          {/* Left: hamburger toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSidebar}
              title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              <Bars3Icon className="w-5 h-5" />
            </button>
          </div>

          {/* Right: user info + logout */}
          {user && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-800 leading-tight">{user.full_name}</p>
                <p className="text-xs text-gray-400 capitalize leading-tight">{user.role}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold flex-shrink-0 select-none">
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

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
