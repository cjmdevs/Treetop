import { getServerUrl } from '../config/serverConfig'

function getToken() {
  return localStorage.getItem('treetop_auth_token')
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${getServerUrl()}/api${path}`, {
      headers,
      ...options,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch (networkErr) {
    // Network / unreachable error (fetch itself threw — not an HTTP response).
    // Route to the server-setup screen so the user can fix the address.
    // Distinct from 401 (valid connection, bad credentials).
    if (!window.location.pathname.startsWith('/server-setup')) {
      window.location.href = '/server-setup?error=unreachable'
    }
    throw networkErr
  }

  if (res.status === 401) {
    localStorage.removeItem('treetop_auth_token')
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
  }

  if (!res.ok) throw new Error(`API ${res.status} ${path}`)
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  // cache: 'no-store' prevents 304 / stale responses after a save
  get:    (path)       => request(path, { cache: 'no-store' }),
  post:   (path, body) => request(path, { method: 'POST',   body }),
  put:    (path, body) => request(path, { method: 'PUT',    body }),
  patch:  (path, body) => request(path, { method: 'PATCH',  body }),
  delete: (path)       => request(path, { method: 'DELETE' }),
}
