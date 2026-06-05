/**
 * serverConfig.js
 *
 * Single source of truth for the server base URL.  All API modules import
 * getServerUrl() so every request automatically uses the currently stored
 * address — no restarts required after a URL change.
 */

const STORAGE_KEY  = 'treetop_server_url'
const DEFAULT_URL  = 'http://localhost:3001'

// ── Normalization ────────────────────────────────────────────────────────────

/**
 * Normalize user input into a canonical base URL:
 *   - trims whitespace and trailing slashes
 *   - prepends http:// if no scheme is present
 *   - returns null if the result is not a parseable URL
 */
export function normalizeUrl(raw) {
  if (!raw || typeof raw !== 'string') return null
  let url = raw.trim().replace(/\/+$/, '')
  if (!url) return null
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url
  try {
    new URL(url)
    return url
  } catch {
    return null
  }
}

// ── Storage accessors ────────────────────────────────────────────────────────

/**
 * Returns true only when the user has explicitly saved a server URL.
 * Used by the first-launch guard — false means show the setup screen.
 */
export function hasServerUrl() {
  return Boolean(localStorage.getItem(STORAGE_KEY))
}

/**
 * Returns the stored URL, falling back to the dev default.
 * Always use this when building fetch URLs.
 */
export function getServerUrl() {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_URL
}

/** Persist a URL.  Caller should pass a pre-normalized string. */
export function setServerUrl(url) {
  localStorage.setItem(STORAGE_KEY, url)
}

// ── Connectivity test ────────────────────────────────────────────────────────

/**
 * Tests reachability by hitting GET /api/health (unauthenticated endpoint).
 * Returns { ok: true, url } on success or { ok: false, error: string } on failure.
 */
export async function testConnection(rawUrl) {
  const url = normalizeUrl(rawUrl)
  if (!url) return { ok: false, error: 'Invalid address — enter a host like 192.168.1.50:3001' }

  const controller = new AbortController()
  const timeout    = setTimeout(() => controller.abort(), 6000)

  try {
    const res = await fetch(`${url}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (res.ok) return { ok: true, url }
    return { ok: false, error: `Server responded with HTTP ${res.status}` }
  } catch (err) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      return { ok: false, error: 'Connection timed out — server may be unreachable' }
    }
    return { ok: false, error: 'Could not reach server — check the address and that the server is running' }
  }
}
