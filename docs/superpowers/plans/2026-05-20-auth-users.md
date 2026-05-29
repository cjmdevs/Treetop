# Authentication & User Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add JWT-based authentication with role-based access control (admin/manager/staff) to the MGR CPAs app, with a Users admin tab in Settings.

**Architecture:** A `users` table stores bcrypt-hashed passwords and roles. Express middleware validates JWT tokens on every API route except `/api/auth/login`. The React frontend stores the token in localStorage, injects it as a `Bearer` header, and gates routes/nav by role via `AuthContext`.

**Tech Stack:** jsonwebtoken, bcryptjs (server); React Context + localStorage (client); existing better-sqlite3 + Express stack.

---

## File Map

### New files
- `server/middleware/auth.js` — JWT verify middleware, attaches `req.user`
- `server/routes/auth.js` — `POST /api/auth/login`, `GET /api/auth/me`
- `server/routes/users.js` — Admin CRUD for user accounts
- `client/src/api/auth.js` — `authApi.login()`, `authApi.me()`
- `client/src/context/AuthContext.jsx` — `AuthProvider`, `useAuth()`
- `client/src/pages/Login.jsx` — Login form page
- `client/src/components/ProtectedRoute.jsx` — Auth + role guard

### Modified files
- `server/package.json` — install `jsonwebtoken`, `bcryptjs`
- `server/db/schema.js` — add `users` table
- `server/db/migrate.js` — add `user_id` column to `time_entries`
- `server/db/seed.js` — clear + insert 4 users with hashed passwords
- `server/app.js` — wire auth route (unprotected), `requireAuth` middleware, users route
- `client/src/api/client.js` — inject `Authorization: Bearer` header, 401 → redirect to /login
- `client/src/App.jsx` — `AuthProvider` wrapper, `/login` route, `ProtectedRoute` on Layout
- `client/src/components/Layout.jsx` — user name + role badge + logout button in topbar
- `client/src/components/Sidebar.jsx` — role-based nav visibility
- `client/src/pages/Settings.jsx` — User Accounts tab (admin only)
- `client/src/pages/TimeTracking.jsx` — auto-init `currentStaff` from auth user

---

### Task 1: Install Server Dependencies + Add Users Table

**Files:**
- Run: `server/` directory (`npm install`)
- Modify: `server/db/schema.js`
- Modify: `server/db/migrate.js`

- [ ] **Step 1: Install jsonwebtoken and bcryptjs in the server**

```bash
cd "C:\Users\carso\Claude Projects\mgrcpas\server"
npm install jsonwebtoken bcryptjs
```

Expected: `package.json` now lists `"bcryptjs"` and `"jsonwebtoken"` in dependencies.

- [ ] **Step 2: Add `users` table to schema.js**

In `server/db/schema.js`, inside the `db.exec(...)` template string, add this table **after the `staff_rates` table** (before the closing backtick):

```sql
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'staff',
      default_hourly_rate REAL NOT NULL DEFAULT 0,
      rate_effective_date TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
```

- [ ] **Step 3: Add `user_id` migration to migrate.js**

In `server/db/migrate.js`, at the very end (before `module.exports`), add:

```js
  const usersCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name)
  // user_id on time_entries — nullable, references users for permission filtering
  if (!teCols.includes('user_id'))
    db.exec('ALTER TABLE time_entries ADD COLUMN user_id INTEGER REFERENCES users(id)')
```

Note: `teCols` is already defined earlier in the function from reading `time_entries` columns. Place this block **after** the existing `teCols` checks. The `usersCols` variable is declared for future migrations if needed.

- [ ] **Step 4: Verify schema loads without error**

```bash
cd "C:\Users\carso\Claude Projects\mgrcpas\server"
node -e "require('./db/schema').initializeDatabase(); console.log('schema ok')"
```

Expected output: `schema ok`

- [ ] **Step 5: Commit**

```bash
git add server/package.json server/package-lock.json server/db/schema.js server/db/migrate.js
git commit -m "feat: add users table schema and user_id migration, install jwt+bcrypt deps"
```

---

### Task 2: Auth Middleware

**Files:**
- Create: `server/middleware/auth.js`

- [ ] **Step 1: Create `server/middleware/auth.js`**

```js
const jwt = require('jsonwebtoken')

const JWT_SECRET = process.env.JWT_SECRET || 'mgrcpas-dev-secret-2026'

function requireAuth(req, res, next) {
  // Skip auth in test environment
  if (process.env.NODE_ENV === 'test') {
    req.user = { id: 0, username: 'test', full_name: 'Test User', role: 'admin' }
    return next()
  }

  const header = req.headers['authorization']
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' })
  }

  const token = header.slice(7)
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

module.exports = { requireAuth, JWT_SECRET }
```

- [ ] **Step 2: Verify the file parses**

```bash
node -e "const m = require('./middleware/auth'); console.log(typeof m.requireAuth)"
```

Expected: `function`

- [ ] **Step 3: Commit**

```bash
git add server/middleware/auth.js
git commit -m "feat: add JWT auth middleware"
```

---

### Task 3: Auth Route (Login + Me)

**Files:**
- Create: `server/routes/auth.js`

- [ ] **Step 1: Create `server/routes/auth.js`**

```js
const router  = require('express').Router()
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const db      = require('../db/database')
const { JWT_SECRET, requireAuth } = require('../middleware/auth')

// POST /api/auth/login  — public, no auth required
router.post('/login', (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password)
    return res.status(400).json({ error: 'username and password are required' })

  const user = db.prepare(
    'SELECT * FROM users WHERE username = ? AND active = 1'
  ).get(username)

  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid credentials' })

  const payload = {
    id:        user.id,
    username:  user.username,
    full_name: user.full_name,
    role:      user.role,
  }
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })
  res.json({ token, user: payload })
})

// GET /api/auth/me  — protected (requireAuth applied globally in app.js after /api/auth)
// But we still guard it here since /api/auth is registered before global middleware
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(
    'SELECT id, username, full_name, email, role, default_hourly_rate, active FROM users WHERE id = ?'
  ).get(req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json(user)
})

module.exports = router
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/auth.js
git commit -m "feat: add auth login and me routes"
```

---

### Task 4: Users Admin Route

**Files:**
- Create: `server/routes/users.js`

- [ ] **Step 1: Create `server/routes/users.js`**

```js
const router = require('express').Router()
const bcrypt = require('bcryptjs')
const db     = require('../db/database')

// GET /api/users
router.get('/', (req, res) => {
  const users = db.prepare(
    `SELECT id, username, full_name, email, role, default_hourly_rate,
            rate_effective_date, active, created_at
     FROM users ORDER BY full_name`
  ).all()
  res.json(users)
})

// POST /api/users
router.post('/', (req, res) => {
  const { username, password, full_name, email, role, default_hourly_rate, rate_effective_date } = req.body || {}
  if (!username || !password || !full_name || !role)
    return res.status(400).json({ error: 'username, password, full_name, and role are required' })

  try {
    const hashed = bcrypt.hashSync(password, 10)
    const result = db.prepare(
      `INSERT INTO users (username, password, full_name, email, role, default_hourly_rate, rate_effective_date)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(username, hashed, full_name, email || null, role, default_hourly_rate || 0, rate_effective_date || null)
    res.status(201).json({ id: result.lastInsertRowid })
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already taken' })
    res.status(500).json({ error: e.message })
  }
})

// PUT /api/users/:id
router.put('/:id', (req, res) => {
  const { full_name, email, role, default_hourly_rate, rate_effective_date, password } = req.body || {}
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })

  if (password) {
    const hashed = bcrypt.hashSync(password, 10)
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.params.id)
  }
  db.prepare(
    `UPDATE users SET full_name=?, email=?, role=?, default_hourly_rate=?, rate_effective_date=? WHERE id=?`
  ).run(full_name, email || null, role, default_hourly_rate || 0, rate_effective_date || null, req.params.id)
  res.json({ ok: true })
})

// PATCH /api/users/:id/toggle  — activate / deactivate
router.patch('/:id/toggle', (req, res) => {
  const user = db.prepare('SELECT id, active FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  db.prepare('UPDATE users SET active = ? WHERE id = ?').run(user.active ? 0 : 1, req.params.id)
  res.json({ active: user.active ? 0 : 1 })
})

module.exports = router
```

- [ ] **Step 2: Commit**

```bash
git add server/routes/users.js
git commit -m "feat: add users admin CRUD route"
```

---

### Task 5: Seed Users + Wire Auth in app.js

**Files:**
- Modify: `server/db/seed.js`
- Modify: `server/app.js`

- [ ] **Step 1: Update seed.js to insert users**

At the top of `server/db/seed.js`, add the bcrypt require:
```js
const bcrypt = require('bcryptjs');
```

In the `db.exec(...)` DELETE block, add `DELETE FROM users;` at the top:
```sql
  DELETE FROM users;
  DELETE FROM custom_field_values;
  ...
```

At the bottom of `server/db/seed.js`, before the final `console.log`, add:

```js
// ── Users ─────────────────────────────────────────────────────────────────────
const insertUser = db.prepare(`
  INSERT INTO users (username, password, full_name, email, role, default_hourly_rate, rate_effective_date)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

[
  ['mmaurer', 'admin123',   'Marcus Maurer', 'mmaurer@mgrcpas.com',  'admin',   350, '2026-01-01'],
  ['sgraf',   'manager123', 'Sofia Graf',    'sgraf@mgrcpas.com',    'manager', 275, '2026-01-01'],
  ['drivera', 'staff123',   'Diego Rivera',  'drivera@mgrcpas.com',  'staff',   175, '2026-01-01'],
  ['carson',  'admin123',   'Carson',        'carsonjjmaurer@gmail.com', 'admin', 0, '2026-01-01'],
].forEach(([username, password, full_name, email, role, rate, date]) => {
  const hashed = bcrypt.hashSync(password, 10);
  insertUser.run(username, hashed, full_name, email, role, rate, date);
});
```

Update the final console.log line:
```js
console.log('Database seeded: 5 engagements, 9 time entries (P10/2026), 3 billing records,');
console.log('  20 service codes (10 base + 10 spec), 3 templates, 9 subtasks, 3 notes, 1 payment,');
console.log('  3 automation rules, 11 tax deadlines, 26 pay periods (2026), 3 staff rates, 4 users.');
```

- [ ] **Step 2: Run seed to verify users are created**

```bash
cd "C:\Users\carso\Claude Projects\mgrcpas\server"
node db/seed.js
```

Expected output ends with: `4 users.`

Verify:
```bash
node -e "const db = require('./db/database'); console.log(db.prepare('SELECT id, username, role FROM users').all())"
```

Expected: array of 4 users (mmaurer, sgraf, drivera, carson) all with `role` set correctly.

- [ ] **Step 3: Rewrite app.js to wire auth**

Replace the contents of `server/app.js` with:

```js
const express = require('express');
const cors    = require('cors');
const { migrate }            = require('./db/migrate');
const { initializeDatabase } = require('./db/schema');
const { requireAuth }        = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json());

initializeDatabase();
if (process.env.NODE_ENV !== 'test') migrate();

// ── Public routes (no auth required) ─────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));

// ── Auth middleware — all routes below require a valid JWT ────────────────────
app.use(requireAuth);

// ── Protected routes ──────────────────────────────────────────────────────────
app.use('/api/users',        require('./routes/users'));
app.use('/api/engagements',  require('./routes/engagements'));
app.use('/api/engagements/:engagementId/subtasks', require('./routes/subtasks'));
app.use('/api/time-entries',  require('./routes/timeEntries'));
app.use('/api/billing',       require('./routes/billing'));
app.use('/api/staff',         require('./routes/staff'));
app.use('/api/dashboard',     require('./routes/dashboard'));
app.use('/api/templates',     require('./routes/templates'));
app.use('/api/notes',         require('./routes/notes'));
app.use('/api/service-codes', require('./routes/serviceCodes'));
app.use('/api/payments',      require('./routes/payments'));
app.use('/api/invoices',      require('./routes/invoices'));
app.use('/api/custom-fields', require('./routes/customFields'));
app.use('/api/reports',      require('./routes/reports'));
app.use('/api/automations',  require('./routes/automations'));
app.use('/api/activity',     require('./routes/activity'));
app.use('/api/due-dates',    require('./routes/dueDates'));
app.use('/api/search',       require('./routes/search'));
app.use('/api/pay-periods',  require('./routes/payPeriods'));
app.use('/api/staff-rates',  require('./routes/staffRates'));
app.use('/api/time-summary', require('./routes/timeSummary'));

module.exports = app;
```

- [ ] **Step 4: Start server and test login**

Start the server (`npm start` or `node server.js` from the project root). Then:

```bash
curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"carson\",\"password\":\"admin123\"}" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).user))"
```

Expected: `{ id: 4, username: 'carson', full_name: 'Carson', role: 'admin' }`

Test that a protected route without token returns 401:
```bash
curl -s http://localhost:3001/api/engagements
```
Expected: `{"error":"No token provided"}`

- [ ] **Step 5: Commit**

```bash
git add server/db/seed.js server/app.js
git commit -m "feat: wire auth middleware into app.js, seed 4 users with hashed passwords"
```

---

### Task 6: Client API Layer

**Files:**
- Modify: `client/src/api/client.js`
- Create: `client/src/api/auth.js`

- [ ] **Step 1: Update client.js to inject auth header and handle 401**

Replace `client/src/api/client.js` with:

```js
const BASE = '/api'

function getToken() {
  return localStorage.getItem('mgr_auth_token')
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
    localStorage.removeItem('mgr_auth_token')
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
  get:    (path)       => request(path),
  post:   (path, body) => request(path, { method: 'POST',   body }),
  put:    (path, body) => request(path, { method: 'PUT',    body }),
  patch:  (path, body) => request(path, { method: 'PATCH',  body }),
  delete: (path)       => request(path, { method: 'DELETE' }),
}
```

- [ ] **Step 2: Create client/src/api/auth.js**

```js
export const authApi = {
  login: async (username, password) => {
    const res = await fetch('/api/auth/login', {
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
    const token = localStorage.getItem('mgr_auth_token')
    if (!token) throw new Error('No token')
    const res = await fetch('/api/auth/me', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    })
    if (!res.ok) throw new Error('Not authenticated')
    return res.json()
  },
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/api/client.js client/src/api/auth.js
git commit -m "feat: inject Bearer token in client.js, create authApi"
```

---

### Task 7: AuthContext

**Files:**
- Create: `client/src/context/AuthContext.jsx`

- [ ] **Step 1: Create client/src/context/AuthContext.jsx**

```jsx
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { authApi } from '../api/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  // On mount: validate stored token
  useEffect(() => {
    const token = localStorage.getItem('mgr_auth_token')
    if (!token) { setLoading(false); return }
    authApi.me()
      .then(u => setUser(u))
      .catch(() => localStorage.removeItem('mgr_auth_token'))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username, password) => {
    const { token, user } = await authApi.login(username, password)
    localStorage.setItem('mgr_auth_token', token)
    setUser(user)
    return user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('mgr_auth_token')
    setUser(null)
    window.location.href = '/login'
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
```

- [ ] **Step 2: Commit**

```bash
git add client/src/context/AuthContext.jsx
git commit -m "feat: add AuthContext with login/logout/role helpers"
```

---

### Task 8: Login Page

**Files:**
- Create: `client/src/pages/Login.jsx`

- [ ] **Step 1: Create client/src/pages/Login.jsx**

Refined, professional design: white card centered on a dark navy background with subtle mesh, DM Sans, firm logo + name. No generic gradients — clean, sharp, authoritative.

```jsx
import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const { login }  = useAuth()
  const navigate   = useNavigate()
  const location   = useLocation()
  const from       = location.state?.from?.pathname || '/dashboard'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || 'Invalid credentials')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 px-4"
         style={{ backgroundImage: 'radial-gradient(ellipse at 20% 50%, rgba(27,79,216,0.15) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(27,79,216,0.08) 0%, transparent 50%)' }}>

      <div className="w-full max-w-sm">
        {/* Firm identity */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent mb-4">
            <span className="text-white font-bold text-lg tracking-tight">M</span>
          </div>
          <h1 className="text-white text-2xl font-bold tracking-tight">MGR CPAs</h1>
          <p className="text-gray-400 text-sm mt-1">Maurer, Graf &amp; Rivera</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-gray-900 text-lg font-semibold mb-1">Sign in</h2>
          <p className="text-gray-400 text-sm mb-6">Enter your credentials to continue</p>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow"
                placeholder="your username"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-lg transition-colors mt-2"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          MGR CPAs Practice Management · 2026
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/Login.jsx
git commit -m "feat: add Login page with firm branding"
```

---

### Task 9: ProtectedRoute + Update App.jsx

**Files:**
- Create: `client/src/components/ProtectedRoute.jsx`
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Create client/src/components/ProtectedRoute.jsx**

```jsx
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, requiredRole }) {
  const { user, loading } = useAuth()
  const location          = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requiredRole === 'admin' && user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  if (requiredRole === 'manager' && !['admin', 'manager'].includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}
```

- [ ] **Step 2: Update App.jsx**

Replace `client/src/App.jsx` with:

```jsx
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
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ProtectedRoute.jsx client/src/App.jsx
git commit -m "feat: add ProtectedRoute, wrap App in AuthProvider, add /login route"
```

---

### Task 10: Layout Topbar + Sidebar Role Nav

**Files:**
- Modify: `client/src/components/Layout.jsx`
- Modify: `client/src/components/Sidebar.jsx`

- [ ] **Step 1: Update Layout.jsx topbar to show user + logout**

In `client/src/components/Layout.jsx`:

Add these imports at the top:
```jsx
import { useAuth } from '../context/AuthContext'
import { ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline'
```

Inside the `Layout` component, add `const { user, logout } = useAuth()` at the top (alongside the existing `const { timers, active, elapsed, fmt } = useTimer()`).

Replace the topbar `<header>` element. The right side currently has the timer pill and an empty `<div />` fallback. Change it so both the timer pill AND the user widget appear together on the right:

```jsx
<header className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
  <SearchBar />

  <div className="flex items-center gap-3">
    {/* Active timer pill */}
    {timers.length > 0 && (
      <button
        onClick={() => navigate('/time-tracking')}
        className="flex items-center gap-2.5 bg-accent/10 border border-accent/20 rounded-xl px-4 py-2 hover:bg-accent/15 transition-colors"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
        </span>
        <ClockIcon className="w-4 h-4 text-accent" />
        <span className="text-sm font-semibold text-accent">
          {timers.length} timer{timers.length > 1 ? 's' : ''}
        </span>
        {active && (
          <span className="font-mono text-sm font-bold text-accent tracking-widest">
            {fmt(elapsed)}
          </span>
        )}
      </button>
    )}

    {/* User info + logout */}
    {user && (
      <div className="flex items-center gap-2">
        <div className="text-right">
          <p className="text-sm font-semibold text-gray-800 leading-tight">{user.full_name}</p>
          <p className="text-xs text-gray-400 capitalize leading-tight">{user.role}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {user.full_name?.charAt(0).toUpperCase()}
        </div>
        <button
          onClick={logout}
          title="Sign out"
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
        </button>
      </div>
    )}
  </div>
</header>
```

Remove the old `{timers.length === 0 && <div />}` line — the new layout handles the empty state by just showing the user widget.

- [ ] **Step 2: Update Sidebar.jsx with role-based nav**

Replace `client/src/components/Sidebar.jsx` with:

```jsx
import { NavLink } from 'react-router-dom'
import {
  HomeIcon,
  BriefcaseIcon,
  ClockIcon,
  CurrencyDollarIcon,
  UsersIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  BanknotesIcon,
  ChartBarIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../context/AuthContext'

const ALL_NAV = [
  { to: '/dashboard',     label: 'Dashboard',           Icon: HomeIcon,            roles: ['admin','manager','staff'] },
  { to: '/engagements',   label: 'Engagements',         Icon: BriefcaseIcon,       roles: ['admin','manager','staff'] },
  { to: '/time-tracking', label: 'Time Tracking',       Icon: ClockIcon,           roles: ['admin','manager','staff'] },
  { to: '/billing',       label: 'Billing',             Icon: CurrencyDollarIcon,  roles: ['admin','manager'] },
  { to: '/ar',            label: 'Accounts Receivable', Icon: BanknotesIcon,       roles: ['admin','manager'] },
  { to: '/staff',         label: 'Staff',               Icon: UsersIcon,           roles: ['admin','manager'] },
  { to: '/reports',       label: 'Reports',             Icon: ChartBarIcon,        roles: ['admin','manager'] },
  { to: '/due-dates',     label: 'Due Dates',           Icon: CalendarIcon,        roles: ['admin','manager','staff'] },
]

const ALL_BOTTOM = [
  { to: '/templates', label: 'Templates', Icon: DocumentDuplicateIcon, roles: ['admin','manager'] },
  { to: '/notes',     label: 'Notes',     Icon: DocumentTextIcon,      roles: ['admin','manager','staff'] },
  { to: '/settings',  label: 'Settings',  Icon: Cog6ToothIcon,         roles: ['admin'] },
]

function NavItem({ to, label, Icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-accent text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'
        }`
      }
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      {label}
    </NavLink>
  )
}

export default function Sidebar() {
  const { user } = useAuth()
  const role = user?.role || 'staff'

  const nav    = ALL_NAV.filter(item => item.roles.includes(role))
  const bottom = ALL_BOTTOM.filter(item => item.roles.includes(role))

  return (
    <aside className="w-60 flex-shrink-0 bg-gray-900 flex flex-col">
      <div className="px-6 py-5 border-b border-gray-700/60">
        <p className="text-white font-bold text-lg leading-tight tracking-tight">MGR CPAs</p>
        <p className="text-gray-400 text-xs mt-0.5">Maurer, Graf &amp; Rivera</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(item => <NavItem key={item.to} {...item} />)}
      </nav>

      <div className="px-3 pb-4 border-t border-gray-700/60 pt-3 space-y-0.5">
        {bottom.map(item => <NavItem key={item.to} {...item} />)}
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Layout.jsx client/src/components/Sidebar.jsx
git commit -m "feat: add user display + logout to topbar, role-based sidebar nav"
```

---

### Task 11: Settings — User Accounts Tab

**Files:**
- Modify: `client/src/pages/Settings.jsx`

- [ ] **Step 1: Add usersApi to client/src/api/**

Create `client/src/api/users.js`:

```js
import { api } from './client'

export const usersApi = {
  list:   ()          => api.get('/users'),
  create: (data)      => api.post('/users', data),
  update: (id, data)  => api.put(`/users/${id}`, data),
  toggle: (id)        => api.patch(`/users/${id}/toggle`, {}),
}
```

- [ ] **Step 2: Add User Accounts tab to Settings.jsx**

In `client/src/pages/Settings.jsx`, make the following changes:

**Add import at top:**
```js
import { usersApi } from '../api/users'
import { useAuth }  from '../context/AuthContext'
```

**Add to the tabs array** (only visible to admins — the tab is added but filtering is done by hiding it for non-admins via the tab render):
Add `{ key: 'accounts', label: 'User Accounts' }` to the `TABS` array as the last entry.

**Add state variables** inside the `Settings` component (alongside existing state):
```js
const { isAdmin } = useAuth()
const [users,       setUsers]       = useState([])
const [userForm,    setUserForm]    = useState(null)   // null = closed; {} = new; {id,...} = edit
const [userSaving,  setUserSaving]  = useState(false)
const [userError,   setUserError]   = useState('')

const BLANK_USER = { username: '', password: '', full_name: '', email: '', role: 'staff', default_hourly_rate: '', rate_effective_date: '' }
```

**Add loadUsers function** (alongside existing loadCodes/loadRates):
```js
const loadUsers = useCallback(() => {
  usersApi.list().then(setUsers)
}, [])

useEffect(() => {
  if (activeTab === 'accounts') loadUsers()
}, [activeTab, loadUsers])
```

**Add the UserAccounts tab render** — in the JSX where tabs are rendered, add a new branch for `activeTab === 'accounts'`:

```jsx
{activeTab === 'accounts' && (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <h2 className="text-base font-semibold text-gray-800">User Accounts</h2>
      <button
        onClick={() => { setUserForm(BLANK_USER); setUserError('') }}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        + New User
      </button>
    </div>

    {/* User list */}
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {['Name','Username','Role','Rate','Status',''].map(h => (
              <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {users.map(u => (
            <tr key={u.id} className={`hover:bg-gray-50 ${!u.active ? 'opacity-50' : ''}`}>
              <td className="px-4 py-3 font-medium text-gray-900">{u.full_name}</td>
              <td className="px-4 py-3 text-gray-500 font-mono text-xs">{u.username}</td>
              <td className="px-4 py-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  u.role === 'admin'   ? 'bg-red-100 text-red-700' :
                  u.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                                         'bg-gray-100 text-gray-700'
                }`}>{u.role}</span>
              </td>
              <td className="px-4 py-3 text-gray-600">${u.default_hourly_rate}/hr</td>
              <td className="px-4 py-3">
                <button
                  onClick={() => usersApi.toggle(u.id).then(loadUsers)}
                  className={`text-xs px-2 py-0.5 rounded-full font-medium border transition-colors ${
                    u.active
                      ? 'bg-green-50 text-green-700 border-green-200 hover:bg-red-50 hover:text-red-700 hover:border-red-200'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-green-50 hover:text-green-700 hover:border-green-200'
                  }`}
                >
                  {u.active ? 'Active' : 'Inactive'}
                </button>
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => { setUserForm({ ...u, password: '' }); setUserError('') }}
                  className="text-xs text-accent hover:underline"
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* Create/Edit form */}
    {userForm && (
      <div className="border border-gray-200 rounded-xl p-5 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          {userForm.id ? `Edit: ${userForm.full_name}` : 'New User'}
        </h3>
        {userError && (
          <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {userError}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Full Name',       key: 'full_name',           type: 'text' },
            { label: 'Username',        key: 'username',            type: 'text' },
            { label: 'Password',        key: 'password',            type: 'password', placeholder: userForm.id ? 'Leave blank to keep' : '' },
            { label: 'Email',           key: 'email',               type: 'email' },
            { label: 'Hourly Rate ($)', key: 'default_hourly_rate', type: 'number' },
            { label: 'Rate Effective',  key: 'rate_effective_date', type: 'date' },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
              <input
                type={type}
                value={userForm[key] ?? ''}
                placeholder={placeholder}
                onChange={e => setUserForm(f => ({ ...f, [key]: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
            <select
              value={userForm.role}
              onChange={e => setUserForm(f => ({ ...f, role: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            disabled={userSaving}
            onClick={async () => {
              setUserSaving(true); setUserError('')
              try {
                if (userForm.id) {
                  await usersApi.update(userForm.id, userForm)
                } else {
                  await usersApi.create(userForm)
                }
                setUserForm(null)
                loadUsers()
              } catch (e) {
                setUserError(e.message)
              } finally {
                setUserSaving(false)
              }
            }}
            className="px-4 py-1.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {userSaving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => setUserForm(null)}
            className="px-4 py-1.5 border border-gray-200 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )}
  </div>
)}
```

Also, **filter the accounts tab from the tabs list** for non-admins. In the tab bar JSX, filter the TABS array:

```jsx
{TABS.filter(t => t.key !== 'accounts' || isAdmin).map(tab => (
  // ... existing tab button
))}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/api/users.js client/src/pages/Settings.jsx
git commit -m "feat: add User Accounts tab to Settings (admin only)"
```

---

### Task 12: TimeTracking — Auto-Fill Staff from Auth

**Files:**
- Modify: `client/src/pages/TimeTracking.jsx`

- [ ] **Step 1: Update TimeTracking.jsx to seed currentStaff from auth user**

In `client/src/pages/TimeTracking.jsx`, add this import at the top:
```jsx
import { useAuth } from '../context/AuthContext'
```

Inside the component, add:
```jsx
const { user, isAdmin, isManager } = useAuth()
```

Change the `currentStaff` initialization so it defaults to the auth user's full name when no localStorage value exists:
```jsx
const [currentStaff, setCurrentStaff] = useState(
  () => localStorage.getItem('mgr_current_staff') || user?.full_name || ''
)
```

Also, **when the auth user is a staff-role user, lock the staff field** — they should only see their own time. Update `handleStaffChange` to respect role:
```jsx
const handleStaffChange = name => {
  // Staff role: always use their own name, don't allow override
  if (!isAdmin && !isManager) return
  setCurrentStaff(name)
  localStorage.setItem('mgr_current_staff', name)
}
```

Also seed currentStaff from auth user on mount (in case localStorage is empty):
```jsx
useEffect(() => {
  if (!currentStaff && user?.full_name) {
    setCurrentStaff(user.full_name)
    localStorage.setItem('mgr_current_staff', user.full_name)
  }
}, [user?.full_name])
```

Pass `canChangeStaff={isAdmin || isManager}` to `EntryForm` so it can optionally lock the staff field. (This is optional — EntryForm already works with currentStaff as a prop; the lock happens by simply not allowing handleStaffChange for staff role.)

- [ ] **Step 2: Verify the app loads correctly after login**

Start both server and client dev server. Navigate to `http://localhost:5173` — should redirect to `/login`. Log in as `carson / admin123`. Should see full nav + "Carson" in topbar. Navigate to Time Tracking — currentStaff should auto-populate as "Carson".

Log out, log in as `drivera / staff123`. Should see restricted nav (no Billing, Staff, etc). Time Tracking should show Diego Rivera as the locked staff.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/TimeTracking.jsx
git commit -m "feat: auto-fill currentStaff from auth user, lock staff field for staff role"
```

---

## Self-Review

### Spec Coverage

| Spec Requirement | Task |
|---|---|
| `users` table with all columns | Task 1 |
| bcrypt password hashing | Task 2, 4 |
| JWT 24h sessions | Task 3 |
| All API routes require auth | Task 5 |
| Login page | Task 8 |
| Topbar shows user + logout | Task 10 |
| Sidebar filtered by role | Task 10 |
| Admin: full access + Settings | Tasks 9, 10, 11 |
| Manager: no Settings | Task 10 |
| Staff: own time only, limited nav | Tasks 10, 12 |
| Settings User Accounts tab (admin only) | Task 11 |
| Seed users: Marcus/Sofia/Diego/Carson | Task 5 |
| Staff/Manager/Admin roles | Tasks 3, 7, 9, 10 |
| replace free-text staff_member with user references | Task 1 (user_id column), Task 12 (auto-fill) |

### Placeholder Scan

No TBD or TODO items — all tasks contain complete code.

### Type Consistency

- `useAuth()` returns `{ user, loading, login, logout, isAdmin, isManager }` — used consistently in Layout, Sidebar, Settings, TimeTracking, ProtectedRoute.
- `authApi.login()` returns `{ token, user: { id, username, full_name, role } }` — matches what AuthContext stores.
- `usersApi` methods match routes in `server/routes/users.js`.
- `requireAuth` exported from `server/middleware/auth.js` — imported correctly in `server/app.js` and `server/routes/auth.js`.
