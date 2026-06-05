import { Routes, Route, Navigate } from 'react-router-dom'
import { TimerProvider }    from './context/TimerContext'
import { ToastProvider }    from './context/ToastContext'
import { AuthProvider }     from './context/AuthContext'
import { StatusesProvider } from './context/StatusesContext'
import ProtectedRoute      from './components/ProtectedRoute'
import Layout              from './components/Layout'
import ServerSetup         from './pages/ServerSetup'
import Login               from './pages/Login'
import Dashboard           from './pages/Dashboard'
import Engagements         from './pages/Engagements'
import EngagementDetail    from './pages/EngagementDetail'
import EngagementForm      from './pages/EngagementForm'
import TimeTracking        from './pages/TimeTracking'
import Billing             from './pages/Billing'
import Staff               from './pages/Staff'
import StaffDetail         from './pages/StaffDetail'
import Templates           from './pages/Templates'
import Notes               from './pages/Notes'
import AR                  from './pages/AR'
import InvoiceView         from './pages/InvoiceView'
import Settings            from './pages/Settings'
import Reports             from './pages/Reports'
import DueDates            from './pages/DueDates'
import Contacts            from './pages/Contacts'
import ContactDetail       from './pages/ContactDetail'
import Projects            from './pages/Projects'
import ProjectDetail       from './pages/ProjectDetail'
import ProjectForm         from './pages/ProjectForm'
import ByClientView        from './pages/ByClientView'
import { hasServerUrl }    from './config/serverConfig'

/**
 * Wraps all routes that require a configured server URL.
 * If no URL has been saved yet, redirects to the first-launch setup screen.
 * This guard runs before AuthProvider so auth calls are never made without
 * a valid server address.
 */
function AppWithServer() {
  if (!hasServerUrl()) {
    return <Navigate to="/server-setup" replace />
  }

  return (
    <AuthProvider>
      <StatusesProvider>
      <TimerProvider>
        <ToastProvider>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />

            {/* Protected — all inside Layout */}
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
              <Route path="projects/new"                   element={<ProjectForm />} />
              <Route path="projects/by-client/:clientName" element={<ByClientView />} />
              <Route path="projects/:id/edit"              element={<ProjectForm />} />
              <Route path="projects/:id"                   element={<ProjectDetail />} />
              {/* Engagement routes kept for direct-link compatibility but not in nav */}
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

export default function App() {
  return (
    <Routes>
      {/* Server setup — always accessible, no auth or server required */}
      <Route path="/server-setup" element={<ServerSetup />} />

      {/* Everything else — guarded: must have a saved server URL first */}
      <Route path="*" element={<AppWithServer />} />
    </Routes>
  )
}
