import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { TimerProvider }    from './context/TimerContext'
import { ToastProvider }    from './context/ToastContext'
import { AuthProvider }     from './context/AuthContext'
import { StatusesProvider } from './context/StatusesContext'
import ProtectedRoute       from './components/ProtectedRoute'
import Layout               from './components/Layout'
import StandaloneLayout     from './components/StandaloneLayout'
import ServerSetup          from './pages/ServerSetup'
import Bootstrap            from './pages/Bootstrap'
import Register             from './pages/Register'
import RedeemReset          from './pages/RedeemReset'
import Login                from './pages/Login'
import Dashboard            from './pages/Dashboard'
import Engagements          from './pages/Engagements'
import EngagementDetail     from './pages/EngagementDetail'
import EngagementForm       from './pages/EngagementForm'
import TimeTracking         from './pages/TimeTracking'
import Billing              from './pages/Billing'
import Staff                from './pages/Staff'
import StaffDetail          from './pages/StaffDetail'
import Templates            from './pages/Templates'
import Notes                from './pages/Notes'
import AR                   from './pages/AR'
import InvoiceView          from './pages/InvoiceView'
import Settings             from './pages/Settings'
import Reports              from './pages/Reports'
import DueDates             from './pages/DueDates'
import Contacts             from './pages/Contacts'
import ContactDetail        from './pages/ContactDetail'
import Projects             from './pages/Projects'
import ProjectDetail        from './pages/ProjectDetail'
import ProjectForm          from './pages/ProjectForm'
import ByClientView         from './pages/ByClientView'
import { hasServerUrl }     from './config/serverConfig'
import { authApi }          from './api/auth'

// ── Pre-login guard: check server URL → bootstrap state ──────────────────────

/**
 * sharedModuleRoutes() — returns the module sub-routes as a JSX Fragment.
 *
 * Called as a PLAIN FUNCTION (not JSX component) inside each layout's <Route>:
 *   {sharedModuleRoutes()}
 *
 * React Router 6's createRoutesFromChildren transparently flattens Fragments,
 * so all <Route> elements here become direct children of the parent route.
 * If this were called as <SharedModuleRoutes />, RR6 would see an unknown
 * component element and skip all routes inside it — hence the function pattern.
 */
function sharedModuleRoutes() {
  return (
    <>
      {/* Contacts */}
      <Route path="contacts"     element={<Contacts />} />
      <Route path="contacts/:id" element={<ContactDetail />} />

      {/* Projects */}
      <Route path="projects"                       element={<Projects />} />
      <Route path="projects/new"                   element={<ProjectForm />} />
      <Route path="projects/by-client/:clientName" element={<ByClientView />} />
      <Route path="projects/:id/edit"              element={<ProjectForm />} />
      <Route path="projects/:id"                   element={<ProjectDetail />} />

      {/* Engagements (accessed from projects / billing / search) */}
      <Route path="engagements"          element={<Engagements />} />
      <Route path="engagements/new"      element={<EngagementForm />} />
      <Route path="engagements/:id"      element={<EngagementDetail />} />
      <Route path="engagements/:id/edit" element={<EngagementForm />} />

      {/* Core modules */}
      <Route path="time-tracking" element={<TimeTracking />} />
      <Route path="billing"       element={<Billing />} />
      <Route path="staff"         element={<Staff />} />
      <Route path="staff/:name"   element={<StaffDetail />} />
      <Route path="templates"     element={<Templates />} />
      <Route path="notes"         element={<Notes />} />
      <Route path="ar"            element={<AR />} />
      <Route path="invoices/:id"  element={<InvoiceView />} />
      <Route path="reports"       element={<Reports />} />
      <Route path="due-dates"     element={<DueDates />} />

      {/* Settings — admin only */}
      <Route
        path="settings"
        element={
          <ProtectedRoute requiredRole="admin">
            <Settings />
          </ProtectedRoute>
        }
      />
    </>
  )
}

/**
 * Full authenticated app.  AuthProvider only mounts after server-address
 * and bootstrap checks pass.
 *
 * Two parallel layout trees:
 *   /          → Layout (sidebar + topbar)      — existing full-layout experience
 *   /m         → StandaloneLayout (no sidebar)  — Phase 4b Electron windows
 */
function FullApp() {
  return (
    <AuthProvider>
      <StatusesProvider>
      <TimerProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* ── Full layout (sidebar present) ──────────────────────────── */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              {sharedModuleRoutes()}
            </Route>

            {/* ── Standalone layout (no sidebar, /m/...) ─────────────────── */}
            {/*
             * Same page components as above, different wrapper.
             * Each /m/<module> URL renders the module inside StandaloneLayout.
             * Tile clicks on the dashboard navigate here (same tab in 4a).
             * Phase 4b: Electron intercepts tile-clicks to open these in new windows.
             */}
            <Route
              path="/m"
              element={
                <ProtectedRoute>
                  <StandaloneLayout />
                </ProtectedRoute>
              }
            >
              {/* /m with no sub-path → back to main dashboard */}
              <Route index element={<Navigate to="/dashboard" replace />} />
              {sharedModuleRoutes()}
            </Route>

          </Routes>
        </ToastProvider>
      </TimerProvider>
      </StatusesProvider>
    </AuthProvider>
  )
}

/**
 * Async bootstrap check.  Skips the API call if a token is already present.
 */
function BootstrapCheck() {
  const [state, setState] = useState('checking') // 'checking' | 'bootstrap' | 'ok'

  useEffect(() => {
    if (localStorage.getItem('treetop_auth_token')) {
      setState('ok')
      return
    }
    authApi.needsBootstrap()
      .then(d => setState(d.needsBootstrap ? 'bootstrap' : 'ok'))
      .catch(() => setState('ok'))
  }, [])

  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (state === 'bootstrap') return <Navigate to="/bootstrap" replace />
  return <FullApp />
}

/** Top-level guard — server URL first (sync), then bootstrap (async). */
function AppGuard() {
  if (!hasServerUrl()) return <Navigate to="/server-setup" replace />
  return <BootstrapCheck />
}

// ── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Routes>
      <Route path="/server-setup" element={<ServerSetup />} />
      <Route path="/bootstrap"    element={<Bootstrap />} />
      <Route path="/register"       element={<Register />} />
      <Route path="/reset-password" element={<RedeemReset />} />
      <Route path="*"             element={<AppGuard />} />
    </Routes>
  )
}
