import { Routes, Route, Navigate } from 'react-router-dom'
import { TimerProvider }   from './context/TimerContext'
import { ToastProvider }   from './context/ToastContext'
import { AuthProvider }    from './context/AuthContext'
import ProtectedRoute      from './components/ProtectedRoute'
import Layout              from './components/Layout'
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

export default function App() {
  return (
    <AuthProvider>
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
    </AuthProvider>
  )
}
