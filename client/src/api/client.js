const BASE = '/api'

function getToken() {
  return localStorage.getItem('treetop_auth_token')
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...options,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (res.status === 401) {
    localStorage.removeItem('treetop_auth_token')
    // Only redirect if not already on login page
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
