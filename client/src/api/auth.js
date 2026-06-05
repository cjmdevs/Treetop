import { getServerUrl } from '../config/serverConfig'

// ── Shared fetch helper (public endpoints — no auth token needed) ────────────
async function publicPost(path, body) {
  const res = await fetch(`${getServerUrl()}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

export const authApi = {
  // ── Login ──────────────────────────────────────────────────────────────────
  login: (username, password) =>
    publicPost('/api/auth/login', { username, password }),

  // ── Token refresh / validate ───────────────────────────────────────────────
  me: async () => {
    const token = localStorage.getItem('treetop_auth_token')
    if (!token) throw new Error('No token')
    const res = await fetch(`${getServerUrl()}/api/auth/me`, {
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
    })
    if (!res.ok) throw new Error('Not authenticated')
    return res.json()
  },

  // ── Bootstrap: first-admin setup ──────────────────────────────────────────
  needsBootstrap: async () => {
    const res = await fetch(`${getServerUrl()}/api/auth/needs-bootstrap`, { cache: 'no-store' })
    return res.json()   // { needsBootstrap: true | false }
  },

  bootstrap: (data) =>
    publicPost('/api/auth/bootstrap', data),  // { token, username, full_name, email, password }

  // ── Invite key redemption ──────────────────────────────────────────────────
  redeem: (data) =>
    publicPost('/api/auth/redeem', data),     // { key, password }
}
