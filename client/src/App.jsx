import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { TimerProvider }    from './context/TimerContext'
import { ToastProvider }    from './context/ToastContext'
import { AuthProvider }     from './context/AuthContext'
import { StatusesProvider } from './context/StatusesContext'
import ProtectedRoute       from './components/ProtectedRoute'
import Layout               from './components/Layout'
import ServerSetup          from './pages/ServerSetup'
import Bootstrap            from './pages/Bootstrap'
import Register             from './pages/Register'
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
import { hasServerUrl, getServerUrl } from './config/serverConfig'
import { authApi }          from './api/auth'

// ── Pre-login guard: check server URL → bootstrap state ──────────────────────

/**
 * Renders the full authenticated app.  Separated so AuthProvider only mounts
 * after both server-address and bootstrap checks pass.
 */
function FullApp() {
  return (
    <AuthProvider>
      <StatusesProvider>
      <TimerProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard"            element={<Dashboard />} />
              <Route path="contacts"             element={<Contacts />} />
              <Route path="contacts/:id"         element={<ContactDetail />} />
              <Route path="projects"                           element={<Projects />} />
              <Route path="projects/new"                       element={<ProjectForm />} />
              <Route path="projects/by-client/:clientName"     element={<ByClientView />} />
              <Route path="projects/:id/edit"                  element={<ProjectForm />} />
              <Route path="projects/:id"                       element={<ProjectDetail />} />
              <Route path="engagements"          element={<Engagements />} />
              <Route path="engagements/new"      element={<EngagementForm />} />
              <Route path="engagements/:id"      element={<EngagementDetail />} />
              <Route path="engagements/:id/edit" element={<EngagementForm />} />
              <Route path="time-tracking"        element={<TimeTracking />} />
              <Route path="billing"              element={<Billing />} />
              <Route path="staff"                element={<Staff />} />
              <Route path="staff/:name"          element={<StaffDetail />} />
              <Route path="templates"            element={<Templates />} />
              <Route path="notes"                element={<Notes />} />
              <Route path="ar"                   element={<AR />} />
              <Route path="invoices/:id"         element={<InvoiceView />} />
              <Route path="reports"              element={<Reports />} />
              <Route path="due-dates"            element={<DueDates />} />
              <Route
                path="settings"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <Settings />
                  </ProtectedRoute>
                }
              />
            </Route>
          </Routes>
        </ToastProvider>
      </TimerProvider>
      </StatusesProvider>
    </AuthProvider>
  )
}

/**
 * Async bootstrap check.  If there's already a token in localStorage the user
 * is authenticated and we skip the API call entirely (no flicker).
 * Otherwise we hit /api/auth/needs-bootstrap to decide whether to show the
 * bootstrap screen or proceed to the normal login/app flow.
 */
function BootstrapCheck() {
  const [state, setState] = useState('checking') // 'checking' | 'bootstrap' | 'ok'

  useEffect(() => {
    // Already have a session — skip bootstrap check entirely
    if (localStorage.getItem('treetop_auth_token')) {
      setState('ok')
      return
    }
    authApi.needsBootstrap()
      .then(d => setState(d.needsBootstrap ? 'bootstrap' : 'ok'))
      .catch(() => setState('ok')) // If check fails, proceed to login
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

/**
 * Top-level guard — checks server URL first (sync), then bootstrap (async).
 */
function AppGuard() {
  if (!hasServerUrl()) return <Navigate to="/server-setup" replace />
  return <BootstrapCheck />
}

// ── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Routes>
      {/* Pre-login public screens — accessible with no auth and no server URL */}
      <Route path="/server-setup" element={<ServerSetup />} />
      <Route path="/bootstrap"    element={<Bootstrap />} />
      <Route path="/register"     element={<Register />} />

      {/* Everything else goes through the guard chain */}
      <Route path="*" element={<AppGuard />} />
    </Routes>
  )
}
