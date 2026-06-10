import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { authApi } from '../api/auth'
import { clearAllTimers } from './TimerContext'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  // ── On mount: validate stored token ────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('treetop_auth_token')
    if (!token) { setLoading(false); return }
    authApi.me()
      .then(u => setUser(u))
      .catch(() => localStorage.removeItem('treetop_auth_token'))
      .finally(() => setLoading(false))
  }, [])

  // ── Electron: listen for force-logout from the main process ────────────────
  // Fires when ANOTHER window (e.g. a module window) called logoutAll().
  // The main process sends 'force-logout' to every window that didn't initiate
  // the logout — this window needs to clear auth state and return to login.
  // Guarded: window.__treetop__ only exists inside Electron.
  useEffect(() => {
    if (!window.__treetop__?.isElectron) return

    const cleanup = window.__treetop__.onForceLogout(() => {
      clearAllTimers()
      localStorage.removeItem('treetop_auth_token')
      setUser(null)
      // Hash-only redirect — safe under file:// (see client.js comment)
      window.location.hash = '/login'
    })

    return cleanup  // removes the ipcRenderer listener on unmount
  }, [])

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (username, password) => {
    const { token, user } = await authApi.login(username, password)
    localStorage.setItem('treetop_auth_token', token)
    setUser(user)
    return user
  }, [])

  // ── Logout ─────────────────────────────────────────────────────────────────
  // 1. Clear local auth state immediately.
  // 2. In Electron: tell main process to close all module windows.
  //    Main sends 'force-logout' to every OTHER window (handled above).
  //    This window handles its own redirect here.
  // 3. Navigate to login.
  //
  // Browser: __treetop__ doesn't exist — the guard makes the Electron call a no-op.
  const logout = useCallback(() => {
    clearAllTimers()
    localStorage.removeItem('treetop_auth_token')
    setUser(null)
    if (window.__treetop__?.isElectron) {
      window.__treetop__.logoutAll()
    }
    // Hash-only redirect — safe under file:// (see client.js comment)
    window.location.hash = '/login'
  }, [])

  const isAdmin   = user?.role === 'admin'
  const isManager = user?.role === 'admin' || user?.role === 'manager'

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isManager }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
