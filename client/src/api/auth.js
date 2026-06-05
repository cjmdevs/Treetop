import { getServerUrl } from '../config/serverConfig'

export const authApi = {
  login: async (username, password) => {
    const res = await fetch(`${getServerUrl()}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || 'Login failed')
    }
    return res.json()  // { token, user: { id, username, full_name, role } }
  },

  me: async () => {
    const token = localStorage.getItem('treetop_auth_token')
    if (!token) throw new Error('No token')
    const res = await fetch(`${getServerUrl()}/api/auth/me`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    })
    if (!res.ok) throw new Error('Not authenticated')
    return res.json()
  },
}
