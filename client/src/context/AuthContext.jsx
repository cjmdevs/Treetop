import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { authApi } from '../api/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  // On mount: validate stored token
  useEffect(() => {
    const token = localStorage.getItem('treetop_auth_token')
    if (!token) { setLoading(false); return }
    authApi.me()
      .then(u => setUser(u))
      .catch(() => localStorage.removeItem('treetop_auth_token'))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username, password) => {
    const { token, user } = await authApi.login(username, password)
    localStorage.setItem('treetop_auth_token', token)
    setUser(user)
    return user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('treetop_auth_token')
    setUser(null)
    window.location.href = '/#/login'
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
