# Phase C Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement six improvements to Treetop Management: remove topbar search, add password reset key flow, notes client picker, user initials on activity, activity log completeness, and multi-timer rework.

**Architecture:** Express + SQLite server (`server/`), React 18 + Vite client (`client/`). Schema changes go in `server/db/migrate.js` with PRAGMA guards. Tests use Jest + supertest with in-memory SQLite (`server/tests/`). The existing invite-key pattern (single-use, SHA-256 hashed, revocable) is the model for C2.

**Tech Stack:** Node.js/Express 4, better-sqlite3, bcryptjs, jsonwebtoken, React 18, Tailwind CSS, Jest, supertest

---

### Task 1: C1 — Remove global topbar search

**Files:**
- Modify: `client/src/components/Layout.jsx`

The `SearchBar` component (lines 16–97), its `TYPE_LABELS` constant, and the `searchApi` import are all to be deleted. The `/api/search` server route is left intact (harmless, future use).

- [ ] **Step 1: Edit Layout.jsx — remove SearchBar**

Remove these imports:
```jsx
// DELETE these lines
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ...
}
import { searchApi } from '../api/search'
```

Keep only:
```jsx
import {
  ArrowRightStartOnRectangleIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline'
```

Delete the entire `const TYPE_LABELS = ...` line and the full `function SearchBar() { ... }` component.

In the topbar JSX, the left side currently renders:
```jsx
<div className="flex items-center gap-2">
  <button onClick={toggleSidebar} ... ><Bars3Icon className="w-5 h-5" /></button>
  <SearchBar />
</div>
```

Remove `<SearchBar />` — keep only the hamburger button:
```jsx
<div className="flex items-center gap-2">
  <button
    onClick={toggleSidebar}
    title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
  >
    <Bars3Icon className="w-5 h-5" />
  </button>
</div>
```

- [ ] **Step 2: Verify no regressions, commit**

Start client dev server (`cd client && npm run dev`). Log in. The topbar should show the hamburger and user profile only — no search input. Click around a few pages to confirm nothing breaks.

```bash
git add client/src/components/Layout.jsx
git commit -m "feat(c1): remove global topbar search bar"
```

---

### Task 2: C2 — Password reset via key

**Files:**
- Modify: `server/db/migrate.js` — add `password_reset_keys` table
- Modify: `server/routes/users.js` — add reset-key generate/revoke endpoints; remove direct password from PUT
- Modify: `server/routes/auth.js` — add public POST /api/auth/redeem-reset
- Create: `client/src/api/passwordResetKeys.js`
- Modify: `client/src/api/users.js` — add generateResetKey / revokeResetKey
- Create: `client/src/pages/RedeemReset.jsx`
- Modify: `client/src/App.jsx` — add /reset-password public route
- Modify: `client/src/pages/Settings.jsx` — replace password field with reset key button in edit form
- Create: `server/tests/password-reset.test.js`

#### Step 1: Add password_reset_keys table to migrate.js

- [ ] In `server/db/migrate.js`, at the end of the `migrate()` function, just before `}` and `module.exports`, add:

```js
  // password_reset_keys table (added 2026-06-10 phase-C2)
  const prkTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='password_reset_keys'").get();
  if (!prkTable) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS password_reset_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_hash TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_by INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        redeemed_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);
  }
```

#### Step 2: Add reset-key endpoints to users.js and remove direct password reset

- [ ] Add `generateToken` and `hashToken` to the imports at the top of `server/routes/users.js`:

```js
const { hashToken, generateToken } = require('../utils/crypto')
```

- [ ] Add two new handlers after the existing `PATCH /:id/toggle` handler:

```js
// POST /api/users/:id/reset-key — admin only
// Generates a single-use hashed password-reset key for the target user.
// Returns the raw key ONCE — never stored, never returned again.
router.post('/:id/reset-key', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT id, username, full_name FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })

  const rawKey  = generateToken(18)
  const keyHash = hashToken(rawKey)

  db.prepare(`
    INSERT INTO password_reset_keys (key_hash, user_id, status, created_by)
    VALUES (?, ?, 'pending', ?)
  `).run(keyHash, user.id, req.user.id)

  res.json({
    key: rawKey,
    user: { id: user.id, username: user.username, full_name: user.full_name },
    message: 'Share this key with the user — it will not be shown again.',
  })
})

// POST /api/users/:id/reset-key/revoke — admin only
// Revokes the most-recent pending reset key for this user.
router.post('/:id/reset-key/revoke', requireAdmin, (req, res) => {
  const pending = db.prepare(
    "SELECT id FROM password_reset_keys WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1"
  ).get(req.params.id)
  if (!pending) return res.status(404).json({ error: 'No pending reset key found for this user.' })
  db.prepare("UPDATE password_reset_keys SET status = 'revoked' WHERE id = ?").run(pending.id)
  res.json({ ok: true })
})
```

- [ ] In the `PUT /api/users/:id` handler, **remove the password block**. Find and delete:

```js
// DELETE these lines from PUT /:id:
if (password) {
  const hashed = bcrypt.hashSync(password, 10)
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, req.params.id)
}
```

Also update the destructuring at the top of that handler to exclude `password`:
```js
const { full_name, email, role, default_hourly_rate, rate_effective_date } = req.body || {}
```

#### Step 3: Add redeem-reset endpoint to auth.js

- [ ] In `server/routes/auth.js`, append this handler at the end (before `module.exports`):

```js
// ── POST /api/auth/redeem-reset ───────────────────────────────────────────────
// Public — redeem a single-use password-reset key to update the user's password.
router.post('/redeem-reset', (req, res) => {
  const { key, newPassword } = req.body || {}
  if (!key) return res.status(400).json({ error: 'Reset key is required.' })

  const pwError = validatePassword(newPassword)
  if (pwError) return res.status(400).json({ error: pwError })

  const keyHash  = hashToken(key)
  const resetKey = db.prepare('SELECT * FROM password_reset_keys WHERE key_hash = ?').get(keyHash)

  if (!resetKey)
    return res.status(400).json({ error: 'Reset key not found.' })
  if (resetKey.status === 'redeemed')
    return res.status(400).json({ error: 'This reset key has already been used.' })
  if (resetKey.status === 'revoked')
    return res.status(400).json({ error: 'This reset key has been revoked.' })

  const user = db.prepare('SELECT id FROM users WHERE id = ? AND active = 1').get(resetKey.user_id)
  if (!user) return res.status(400).json({ error: 'Target user not found or is inactive.' })

  const hashed = bcrypt.hashSync(newPassword, 10)
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, resetKey.user_id)

  db.prepare(`
    UPDATE password_reset_keys SET status = 'redeemed', redeemed_at = datetime('now') WHERE id = ?
  `).run(resetKey.id)

  res.json({ ok: true, message: 'Password updated. You can now log in with your new password.' })
})
```

#### Step 4: Create client API files

- [ ] Create `client/src/api/passwordResetKeys.js`:

```js
import { api } from './client'

export const passwordResetKeysApi = {
  redeem: (data) => api.post('/auth/redeem-reset', data),
}
```

- [ ] Replace `client/src/api/users.js` with:

```js
import { api } from './client'

export const usersApi = {
  list:             ()         => api.get('/users'),
  create:           (data)     => api.post('/users', data),
  update:           (id, data) => api.put(`/users/${id}`, data),
  toggle:           (id)       => api.patch(`/users/${id}/toggle`, {}),
  generateResetKey: (id)       => api.post(`/users/${id}/reset-key`, {}),
  revokeResetKey:   (id)       => api.post(`/users/${id}/reset-key/revoke`, {}),
}
```

#### Step 5: Create RedeemReset.jsx

- [ ] Create `client/src/pages/RedeemReset.jsx`:

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { passwordResetKeysApi } from '../api/passwordResetKeys'

export default function RedeemReset() {
  const [key, setKey]           = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const navigate                = useNavigate()

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    try {
      await passwordResetKeysApi.redeem({ key: key.trim(), newPassword: password })
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Failed to reset password.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'

  if (success) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-8 w-full max-w-md text-center">
        <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Password updated</h1>
        <p className="text-sm text-gray-500 mb-6">Your password has been reset. Sign in with your new password.</p>
        <button onClick={() => navigate('/login')}
          className="px-6 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-dark transition-colors">
          Go to login
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-8 w-full max-w-md">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Reset your password</h1>
        <p className="text-sm text-gray-500 mb-6">Enter the reset key your admin gave you, then choose a new password.</p>
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reset Key</label>
            <input required value={key} onChange={e => setKey(e.target.value)}
              className={inputCls} placeholder="Paste your reset key here" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input required type="password" value={password} onChange={e => setPassword(e.target.value)}
              className={inputCls} placeholder="Min 8 characters" minLength={8} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <input required type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              className={inputCls} placeholder="Repeat your new password" />
          </div>
          <button type="submit" disabled={saving}
            className="w-full py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-dark disabled:opacity-60 transition-colors">
            {saving ? 'Resetting…' : 'Reset Password'}
          </button>
        </form>
        <p className="text-xs text-gray-400 text-center mt-4">
          <button onClick={() => navigate('/login')} className="hover:underline">Back to login</button>
        </p>
      </div>
    </div>
  )
}
```

#### Step 6: Add route to App.jsx

- [ ] In `client/src/App.jsx`, add import:

```jsx
import RedeemReset from './pages/RedeemReset'
```

In the `App()` component's `<Routes>`, add alongside `/register`:
```jsx
<Route path="/reset-password" element={<RedeemReset />} />
```

#### Step 7: Update Settings.jsx User Accounts section

- [ ] Add import near the top of Settings.jsx:

```jsx
import { passwordResetKeysApi } from '../api/passwordResetKeys'
```

- [ ] Add state (inside the Settings component, near other userForm state):

```jsx
const [resetKeyData, setResetKeyData] = useState(null)
```

- [ ] In the user list table, change the last `<td>` of each user row from:

```jsx
<td className="px-4 py-3 text-right">
  <button
    onClick={() => { setUserForm({ ...u, password: '' }); setUserError('') }}
    className="text-xs text-accent hover:underline"
  >
    Edit
  </button>
</td>
```

To:

```jsx
<td className="px-4 py-3 text-right">
  <div className="flex items-center justify-end gap-3">
    <button
      onClick={async () => {
        try {
          const data = await usersApi.generateResetKey(u.id)
          setResetKeyData(data)
        } catch (e) { toast.error(e.message || 'Failed to generate reset key') }
      }}
      className="text-xs text-gray-400 hover:text-gray-700"
    >
      Reset Password
    </button>
    <button
      onClick={() => { setUserForm({ ...u, password: '' }); setUserError('') }}
      className="text-xs text-accent hover:underline"
    >
      Edit
    </button>
  </div>
</td>
```

- [ ] In the user form fields array, change the password entry so it only appears for new users (no `id`):

Find the fields array:
```jsx
[
  { label: 'Full Name',       key: 'full_name',           type: 'text' },
  { label: 'Username',        key: 'username',            type: 'text' },
  { label: 'Password',        key: 'password',            type: 'password', placeholder: userForm.id ? 'Leave blank to keep' : '' },
  ...
]
```

Replace with a computed variable (outside the JSX return, inside the `tab === 'accounts'` block, before the form render):
```jsx
const userFields = [
  { label: 'Full Name',       key: 'full_name',           type: 'text' },
  { label: 'Username',        key: 'username',            type: 'text' },
  ...(!userForm?.id ? [{ label: 'Password', key: 'password', type: 'password', placeholder: '' }] : []),
  { label: 'Email',           key: 'email',               type: 'email' },
  { label: 'Hourly Rate ($)', key: 'default_hourly_rate', type: 'number' },
  { label: 'Rate Effective',  key: 'rate_effective_date', type: 'date' },
]
```

Update the `.map()` call to use `userFields` instead of the inline array.

- [ ] Add the reset-key modal inside `tab === 'accounts'` block (after the userForm panel):

```jsx
{resetKeyData && (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
    <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 w-full max-w-md mx-4">
      <h3 className="text-base font-bold text-gray-900 mb-1">Password Reset Key</h3>
      <p className="text-sm text-gray-500 mb-4">
        Share this key with <span className="font-semibold">{resetKeyData.user?.full_name}</span>.
        It cannot be retrieved again.
      </p>
      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 font-mono text-sm text-gray-900 break-all mb-3 select-all">
        {resetKeyData.key}
      </div>
      <p className="text-xs text-gray-400 mb-5">
        The user goes to <span className="font-mono bg-gray-100 px-1 rounded">/reset-password</span> and enters this key with their new password.
      </p>
      <button
        onClick={() => setResetKeyData(null)}
        className="w-full py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-dark transition-colors"
      >
        Done
      </button>
    </div>
  </div>
)}
```

#### Step 8: Write and run tests

- [ ] Create `server/tests/password-reset.test.js`:

```js
const request = require('supertest')
const { app, db, createUser, tokenFor } = require('./helpers')

let admin, staff, tAdmin, tStaff

beforeAll(() => {
  admin  = createUser({ username: 'pra', full_name: 'PR Admin', role: 'admin' })
  staff  = createUser({ username: 'prs', full_name: 'PR Staff', role: 'staff' })
  tAdmin = tokenFor(admin)
  tStaff = tokenFor(staff)
})

describe('POST /api/users/:id/reset-key', () => {
  test('admin can generate a reset key', async () => {
    const r = await request(app)
      .post(`/api/users/${staff.id}/reset-key`)
      .set('Authorization', `Bearer ${tAdmin}`)
    expect(r.status).toBe(200)
    expect(typeof r.body.key).toBe('string')
    expect(r.body.key.length).toBeGreaterThan(10)
    expect(r.body.user.id).toBe(staff.id)
  })

  test('non-admin cannot generate a reset key', async () => {
    const r = await request(app)
      .post(`/api/users/${admin.id}/reset-key`)
      .set('Authorization', `Bearer ${tStaff}`)
    expect(r.status).toBe(403)
  })

  test('404 for unknown user', async () => {
    const r = await request(app)
      .post('/api/users/99999/reset-key')
      .set('Authorization', `Bearer ${tAdmin}`)
    expect(r.status).toBe(404)
  })
})

describe('POST /api/auth/redeem-reset', () => {
  let rawKey

  beforeEach(async () => {
    const r = await request(app)
      .post(`/api/users/${staff.id}/reset-key`)
      .set('Authorization', `Bearer ${tAdmin}`)
    rawKey = r.body.key
  })

  test('valid key + new password updates password and allows login', async () => {
    const r = await request(app)
      .post('/api/auth/redeem-reset')
      .send({ key: rawKey, newPassword: 'newpassword99' })
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'prs', password: 'newpassword99' })
    expect(login.status).toBe(200)
    expect(login.body.token).toBeTruthy()
  })

  test('key is single-use — second redeem fails', async () => {
    await request(app).post('/api/auth/redeem-reset').send({ key: rawKey, newPassword: 'newpassword99' })
    const r2 = await request(app).post('/api/auth/redeem-reset').send({ key: rawKey, newPassword: 'anotherpass123' })
    expect(r2.status).toBe(400)
    expect(r2.body.error).toMatch(/already been used/i)
  })

  test('password shorter than 8 chars → 400', async () => {
    const r = await request(app).post('/api/auth/redeem-reset').send({ key: rawKey, newPassword: 'short' })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/8 characters/i)
  })

  test('wrong key → 400', async () => {
    const r = await request(app).post('/api/auth/redeem-reset').send({ key: 'totally-wrong-key', newPassword: 'newpassword99' })
    expect(r.status).toBe(400)
  })

  test('only updates target user, not others', async () => {
    const admin2 = createUser({ username: 'pra2', full_name: 'PR Admin2', role: 'admin' })
    const keyR = await request(app).post(`/api/users/${staff.id}/reset-key`).set('Authorization', `Bearer ${tAdmin}`)
    await request(app).post('/api/auth/redeem-reset').send({ key: keyR.body.key, newPassword: 'brandnewpass99' })

    // admin2 password unchanged
    const adminLogin = await request(app).post('/api/auth/login').send({ username: 'pra2', password: 'password123' })
    expect(adminLogin.status).toBe(200)
  })
})

describe('POST /api/users/:id/reset-key/revoke', () => {
  test('revoked key cannot be redeemed', async () => {
    const gen = await request(app).post(`/api/users/${staff.id}/reset-key`).set('Authorization', `Bearer ${tAdmin}`)
    const key = gen.body.key

    await request(app).post(`/api/users/${staff.id}/reset-key/revoke`).set('Authorization', `Bearer ${tAdmin}`)

    const r = await request(app).post('/api/auth/redeem-reset').send({ key, newPassword: 'newpassword99' })
    expect(r.status).toBe(400)
    expect(r.body.error).toMatch(/revoked/i)
  })
})

describe('PUT /api/users/:id no longer accepts password field', () => {
  test('sending password in PUT does not change the password', async () => {
    // Set a known password via reset-key
    const keyR = await request(app).post(`/api/users/${staff.id}/reset-key`).set('Authorization', `Bearer ${tAdmin}`)
    await request(app).post('/api/auth/redeem-reset').send({ key: keyR.body.key, newPassword: 'knownpass123' })

    // Now PUT with a different password in the body
    const put = await request(app)
      .put(`/api/users/${staff.id}`)
      .set('Authorization', `Bearer ${tAdmin}`)
      .send({ full_name: 'PR Staff', email: null, role: 'staff', default_hourly_rate: 100, rate_effective_date: null, password: 'hackerpass' })
    expect(put.status).toBe(200)

    // 'hackerpass' should NOT work
    const hack = await request(app).post('/api/auth/login').send({ username: 'prs', password: 'hackerpass' })
    expect(hack.status).toBe(401)

    // 'knownpass123' should still work
    const ok = await request(app).post('/api/auth/login').send({ username: 'prs', password: 'knownpass123' })
    expect(ok.status).toBe(200)
  })
})
```

- [ ] **Run tests:**

```bash
cd server && npm test
```

Expected: all tests pass including new password-reset suite.

- [ ] **Commit C2:**

```bash
git add server/db/migrate.js server/routes/users.js server/routes/auth.js \
        server/tests/password-reset.test.js \
        client/src/api/passwordResetKeys.js client/src/api/users.js \
        client/src/pages/RedeemReset.jsx client/src/App.jsx client/src/pages/Settings.jsx
git commit -m "feat(c2): password reset via single-use hashed key — admin never sets passwords directly"
```

---

### Task 3: C3 — Notes: choose a client via picker

**Files:**
- Modify: `server/routes/notes.js` — JOIN contacts to include client display name in GET
- Modify: `client/src/pages/Notes.jsx` — replace raw entity_id input with contact picker when entity_type='client'

#### Step 1: Update notes GET to return client display name

- [ ] In `server/routes/notes.js`, replace the `GET /` handler:

```js
router.get('/', (req, res) => {
  const { entity_type, entity_id } = req.query;
  let q = `
    SELECT n.*,
      CASE WHEN n.entity_type = 'client'
           THEN COALESCE(c.display_name, c.business_name)
           ELSE NULL
      END AS client_display_name
    FROM notes n
    LEFT JOIN contacts c ON c.id = n.entity_id AND n.entity_type = 'client'
    WHERE 1=1
  `;
  const p = [];
  if (entity_type) { q += ' AND n.entity_type = ?'; p.push(entity_type); }
  if (entity_id)   { q += ' AND n.entity_id = ?';   p.push(entity_id); }
  q += ' ORDER BY n.pinned DESC, n.created_at DESC';
  res.json(db.prepare(q).all(...p));
});
```

#### Step 2: Update Notes.jsx with contact picker

- [ ] Replace the entire `Notes.jsx`. The key changes:

1. Add `useRef` to the React import
2. Import `contactsApi`
3. Add `clientQuery`, `clientResults`, `clientPickerOpen`, `selectedClient` state
4. Add a debounced effect that calls `contactsApi.list({ search: clientQuery })` when entity_type='client' and query >= 2 chars
5. When entity_type changes away from 'client', clear the picker state
6. In the form, when entity_type='client', render a contact search input + dropdown instead of the raw number input
7. In the notes list, show `client_display_name` instead of `entity_type #entity_id` when entity_type='client'

Full replacement for `client/src/pages/Notes.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'
import { notesApi } from '../api/notes'
import { contactsApi } from '../api/contacts'

const CATS = ['All', 'General', 'Tax', 'Client', 'Internal', 'Billing']
const ENTITY_TYPES = ['All', 'engagement', 'client', 'staff']

const BLANK = { entity_type: 'engagement', entity_id: '', note_text: '', category: 'General', created_by: '', pinned: false }

export default function Notes() {
  const [notes, setNotes] = useState([])
  const [catFilter, setCatFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)

  // Client picker state
  const [clientQuery, setClientQuery]         = useState('')
  const [clientResults, setClientResults]     = useState([])
  const [clientPickerOpen, setClientPickerOpen] = useState(false)
  const [selectedClient, setSelectedClient]   = useState(null) // { id, name }
  const debounceRef = useRef(null)
  const pickerRef   = useRef(null)

  const load = () => notesApi.list().then(setNotes)
  useEffect(() => { load() }, [])

  // Debounced contact search
  useEffect(() => {
    if (form.entity_type !== 'client') { setClientResults([]); setClientPickerOpen(false); return }
    if (clientQuery.length < 2) { setClientResults([]); setClientPickerOpen(false); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      contactsApi.list({ search: clientQuery }).then(data => {
        setClientResults(data.slice(0, 8))
        setClientPickerOpen(data.length > 0)
      }).catch(() => {})
    }, 250)
  }, [clientQuery, form.entity_type])

  // Close picker on outside click
  useEffect(() => {
    const handler = e => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setClientPickerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const set = field => e => setForm(f => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const handleEntityTypeChange = e => {
    setForm(f => ({ ...f, entity_type: e.target.value, entity_id: '' }))
    setClientQuery('')
    setSelectedClient(null)
    setClientResults([])
    setClientPickerOpen(false)
  }

  const pickClient = contact => {
    const name = contact.display_name || contact.business_name || `Contact #${contact.id}`
    setSelectedClient({ id: contact.id, name })
    setForm(f => ({ ...f, entity_id: contact.id }))
    setClientQuery(name)
    setClientResults([])
    setClientPickerOpen(false)
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setSaving(true)
    try {
      await notesApi.create({
        ...form,
        entity_id: form.entity_type === 'client' ? (selectedClient?.id || 0) : (parseInt(form.entity_id) || 0),
      })
      setForm(BLANK)
      setClientQuery('')
      setSelectedClient(null)
      setShowForm(false)
      load()
    } finally { setSaving(false) }
  }

  const togglePin = async n => {
    await notesApi.update(n.id, { ...n, pinned: !n.pinned })
    load()
  }

  const deleteNote = async id => {
    await notesApi.delete(id)
    load()
  }

  const filtered = notes.filter(n =>
    (catFilter === 'All' || n.category === catFilter) &&
    (typeFilter === 'All' || n.entity_type === typeFilter)
  )

  const inputCls = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Notes</h1>
        <button onClick={() => setShowForm(v => !v)} className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-dark transition-colors">
          + Add Note
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">New Note</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entity Type</label>
                <select value={form.entity_type} onChange={handleEntityTypeChange} className={`w-full ${inputCls}`}>
                  {['engagement', 'client', 'staff'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {form.entity_type === 'client' ? 'Client' : 'Entity ID'}
                </label>
                {form.entity_type === 'client' ? (
                  <div ref={pickerRef} className="relative">
                    <input
                      value={clientQuery}
                      onChange={e => { setClientQuery(e.target.value); setSelectedClient(null); setForm(f => ({ ...f, entity_id: '' })) }}
                      onFocus={() => clientResults.length > 0 && setClientPickerOpen(true)}
                      placeholder="Search client name…"
                      className={`w-full ${inputCls}`}
                      autoComplete="off"
                    />
                    {clientPickerOpen && clientResults.length > 0 && (
                      <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-auto max-h-48 text-sm">
                        {clientResults.map(c => (
                          <li key={c.id}
                            onMouseDown={() => pickClient(c)}
                            className="px-3 py-2 hover:bg-accent-light cursor-pointer text-gray-800 truncate"
                          >
                            {c.display_name || c.business_name}
                            {c.client_code && <span className="ml-1.5 text-xs text-gray-400">{c.client_code}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <input type="number" value={form.entity_id} onChange={set('entity_id')} className={`w-full ${inputCls}`} placeholder="e.g. 1" />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select value={form.category} onChange={set('category')} className={`w-full ${inputCls}`}>
                  {CATS.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note *</label>
              <textarea required value={form.note_text} onChange={set('note_text')} rows={3}
                className={`w-full ${inputCls} resize-none`} placeholder="Note text..." />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <input value={form.created_by} onChange={set('created_by')} className={`${inputCls} w-48`} placeholder="Your name (optional)" />
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={form.pinned} onChange={set('pinned')} className="rounded" />
                  Pin note
                </label>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowForm(false); setClientQuery(''); setSelectedClient(null) }} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
                <button type="submit" disabled={saving} className="px-6 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-dark disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="flex gap-3 mb-6 flex-wrap">
        {CATS.map(c => (
          <button key={c} onClick={() => setCatFilter(c)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${catFilter === c ? 'bg-accent text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-accent hover:text-accent'}`}>
            {c}
          </button>
        ))}
        <span className="text-gray-300">|</span>
        {ENTITY_TYPES.map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${typeFilter === t ? 'bg-gray-700 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-700 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map(n => (
          <div key={n.id} className={`bg-white rounded-xl border p-5 group ${n.pinned ? 'border-amber-200' : 'border-gray-200'}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-gray-800 text-sm leading-relaxed">{n.note_text}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">{n.category}</span>
                  <span className="text-xs text-gray-400 capitalize">
                    {n.entity_type === 'client' && n.client_display_name
                      ? n.client_display_name
                      : `${n.entity_type} #${n.entity_id}`}
                  </span>
                  {n.created_by && <span className="text-xs text-gray-400">{n.created_by}</span>}
                  <span className="text-xs text-gray-300">{new Date(n.created_at).toLocaleDateString()}</span>
                  {n.pinned && <span className="text-xs text-amber-500">📌 Pinned</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => togglePin(n)} className={`p-1.5 rounded hover:bg-gray-50 text-sm ${n.pinned ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500'}`}>📌</button>
                <button onClick={() => deleteNote(n.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 text-sm">×</button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">No notes found.</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Verify:** Open Notes page, click Add Note, set Entity Type to 'client', type a client name — autocomplete should appear. Pick a client, save → the note shows the client name, not a raw ID.

- [ ] **Commit C3:**

```bash
git add server/routes/notes.js client/src/pages/Notes.jsx
git commit -m "feat(c3): notes client picker — search by name instead of raw entity id"
```

---

### Task 4: C4 — User initials + show on activity entries

**Files:**
- Modify: `server/db/migrate.js` — add `initials` to users; add `acted_by_initials` to activity_log
- Modify: `server/lib/activityLogger.js` — accept optional acting_user_id and look up initials
- Modify: `server/routes/engagements.js`, `projects.js`, `notes.js`, `billing.js`, `payments.js`, `timeEntries.js`, `subtasks.js` — add `req.user.id` as 7th arg to log()
- Modify: `server/routes/users.js` — include initials in GET/POST/PUT
- Modify: `client/src/pages/Settings.jsx` — add Initials field to user form
- Modify: `client/src/pages/Dashboard.jsx` — show initials in ActivityList
- Modify: `client/src/pages/ProjectDetail.jsx` — show initials in activity section

#### Step 1: Add columns to DB via migrate.js

- [ ] In `server/db/migrate.js`, add inside `migrate()` before the final `}`:

```js
  // initials on users (added 2026-06-10 phase-C4)
  const userColsC4 = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userColsC4.includes('initials')) {
    db.exec('ALTER TABLE users ADD COLUMN initials TEXT');
    // Backfill: derive initials from full_name (e.g. "Admin Two" → "AT")
    db.exec(`
      UPDATE users
      SET initials = (
        SELECT upper(group_concat(substr(word, 1, 1), ''))
        FROM (
          SELECT trim(value) AS word
          FROM json_each(json_array(
            CASE WHEN instr(trim(full_name), ' ') > 0
                 THEN substr(trim(full_name), 1, instr(trim(full_name), ' ') - 1)
                 ELSE trim(full_name)
            END,
            CASE WHEN instr(trim(full_name), ' ') > 0
                 THEN substr(trim(full_name), instr(trim(full_name), ' ') + 1)
                 ELSE NULL
            END
          ))
          WHERE word IS NOT NULL AND word != ''
          LIMIT 2
        )
      )
      WHERE initials IS NULL
    `);
  }

  // acted_by_initials on activity_log (added 2026-06-10 phase-C4)
  const actLogColsC4 = db.prepare('PRAGMA table_info(activity_log)').all().map(c => c.name);
  if (!actLogColsC4.includes('acted_by_initials'))
    db.exec('ALTER TABLE activity_log ADD COLUMN acted_by_initials TEXT');
```

**Note on the SQLite backfill:** SQLite doesn't have `SPLIT_PART` or `REGEXP_SUBSTR`. The above uses a `json_array` trick to split on the first space (gets first word and remainder). For simplicity, initials will be the first letter of each of the first two tokens. This gives "AT" for "Admin Two", "A" for single-word names.

If the SQLite JSON approach is fragile in your version, replace the backfill with a simpler two-query approach:

```js
    // Simpler backfill: first letter of first two words
    const users = db.prepare("SELECT id, full_name FROM users WHERE initials IS NULL").all();
    const upd = db.prepare("UPDATE users SET initials = ? WHERE id = ?");
    for (const u of users) {
      const parts = u.full_name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
      const initials = parts.map(w => w[0].toUpperCase()).join('');
      upd.run(initials, u.id);
    }
```

Use the JS loop backfill (more reliable than the JSON approach).

Final migration block for initials backfill:

```js
  // initials on users (added 2026-06-10 phase-C4)
  const userColsC4 = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!userColsC4.includes('initials')) {
    db.exec('ALTER TABLE users ADD COLUMN initials TEXT');
    const usersToFill = db.prepare("SELECT id, full_name FROM users WHERE initials IS NULL").all();
    const updInitials = db.prepare("UPDATE users SET initials = ? WHERE id = ?");
    for (const u of usersToFill) {
      const parts = (u.full_name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
      updInitials.run(parts.map(w => w[0].toUpperCase()).join(''), u.id);
    }
  }

  const actLogColsC4 = db.prepare('PRAGMA table_info(activity_log)').all().map(c => c.name);
  if (!actLogColsC4.includes('acted_by_initials'))
    db.exec('ALTER TABLE activity_log ADD COLUMN acted_by_initials TEXT');
```

#### Step 2: Update activityLogger.js

- [ ] Replace `server/lib/activityLogger.js`:

```js
const db = require('../db/database');

function log(event_type, entity_type, entity_id, description, staff_member = null, acted_by_name = null, acting_user_id = null) {
  let acted_by_initials = null;
  if (acting_user_id) {
    try {
      const u = db.prepare('SELECT initials FROM users WHERE id = ?').get(acting_user_id);
      acted_by_initials = u?.initials || null;
    } catch {}
  }
  try {
    db.prepare(`
      INSERT INTO activity_log (event_type, entity_type, entity_id, description, staff_member, acted_by_name, acted_by_initials)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(event_type, entity_type, entity_id, description, staff_member, acted_by_name, acted_by_initials);
  } catch {
    // Never crash the main request due to logging failure
  }
}

module.exports = { log };
```

#### Step 3: Update all log() call sites to pass req.user.id

Each route that calls `log(...)` with `req.user.full_name` as the 6th arg should now also pass `req.user.id` as the 7th.

- [ ] **`server/routes/engagements.js`** — find all `log(...)` calls and add `req.user.id`:

```js
// BEFORE:
log('engagement_created', 'engagement', engId, `...`, null, req.user.full_name);
// AFTER:
log('engagement_created', 'engagement', engId, `...`, null, req.user.full_name, req.user.id);
```

Apply this pattern to every `log()` call in engagements.js that ends with `req.user.full_name`.

- [ ] **`server/routes/projects.js`** — same pattern for all `log()` calls.

Note: the `doRollForward` helper receives `actedByName` as a parameter; add a second `actedByUserId = null` parameter to `doRollForward` and thread it through:

```js
// Function signature change:
function doRollForward(project, eng, targetPeriodLabel, actedByName = null, actedByUserId = null) {
  // ...
  log('project_rolled_forward', 'project', newProjectId, `...`, null, actedByName, actedByUserId);
}
// Call site change:
const newProject = doRollForward(project, eng, target_period || null, req.user.full_name, req.user.id);
```

- [ ] **`server/routes/notes.js`** — update the `log()` call in POST:

```js
log('note_added', entity_type, entity_id, `...`, created_by, req.user.full_name, req.user.id);
```

- [ ] **`server/routes/billing.js`** — update `log()` calls.

- [ ] **`server/routes/payments.js`** — update `log()` call.

- [ ] **`server/routes/timeEntries.js`** — update `log()` call.

- [ ] **`server/routes/subtasks.js`** — update `log()` call.

#### Step 4: Update users.js to handle initials field

- [ ] In `server/routes/users.js`, update the `GET /` handler to include `initials`:

```js
router.get('/', (req, res) => {
  const users = db.prepare(
    `SELECT id, username, full_name, email, role, default_hourly_rate,
            rate_effective_date, active, initials, created_at
     FROM users ORDER BY full_name`
  ).all()
  if (req.user.role !== 'admin') {
    return res.json(users.map(({ default_hourly_rate, rate_effective_date, ...rest }) => rest))
  }
  res.json(users)
})
```

- [ ] Update `POST /api/users` to accept and store `initials`:

```js
router.post('/', requireAdmin, (req, res) => {
  const { username, password, full_name, email, role, default_hourly_rate, rate_effective_date, initials } = req.body || {}
  if (!username || !password || !full_name || !role)
    return res.status(400).json({ error: 'username, password, full_name, and role are required' })

  // Auto-derive initials if not provided
  const derivedInitials = initials?.trim() || (full_name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')

  try {
    const hashed = bcrypt.hashSync(password, 10)
    const result = db.prepare(
      `INSERT INTO users (username, password, full_name, email, role, default_hourly_rate, rate_effective_date, initials)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(username, hashed, full_name, email || null, role, default_hourly_rate || 0, rate_effective_date || null, derivedInitials || null)
    res.status(201).json({ id: result.lastInsertRowid })
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already taken' })
    res.status(500).json({ error: e.message })
  }
})
```

- [ ] Update `PUT /api/users/:id` to accept `initials`:

```js
router.put('/:id', requireAdmin, (req, res) => {
  const { full_name, email, role, default_hourly_rate, rate_effective_date, initials } = req.body || {}
  const user = db.prepare('SELECT id, initials FROM users WHERE id = ?').get(req.params.id)
  if (!user) return res.status(404).json({ error: 'User not found' })

  db.prepare(
    `UPDATE users SET full_name=?, email=?, role=?, default_hourly_rate=?, rate_effective_date=?, initials=? WHERE id=?`
  ).run(full_name, email || null, role, default_hourly_rate || 0, rate_effective_date || null, initials !== undefined ? (initials || null) : user.initials, req.params.id)
  res.json({ ok: true })
})
```

#### Step 5: Add Initials field to Settings.jsx user form

- [ ] In `Settings.jsx`, update the `BLANK_USER` constant:

```jsx
const BLANK_USER = {
  username: '', password: '', full_name: '', email: '',
  role: 'staff', default_hourly_rate: '', rate_effective_date: '', initials: '',
}
```

- [ ] In the `userFields` array (from Task 2 Step 7), add an Initials field:

```jsx
const userFields = [
  { label: 'Full Name',       key: 'full_name',           type: 'text' },
  { label: 'Username',        key: 'username',            type: 'text' },
  ...(!userForm?.id ? [{ label: 'Password', key: 'password', type: 'password', placeholder: '' }] : []),
  { label: 'Initials',        key: 'initials',            type: 'text' },
  { label: 'Email',           key: 'email',               type: 'email' },
  { label: 'Hourly Rate ($)', key: 'default_hourly_rate', type: 'number' },
  { label: 'Rate Effective',  key: 'rate_effective_date', type: 'date' },
]
```

Also update the user list table header to include "Initials":
```jsx
{['Name','Username','Role','Initials','Rate','Status',''].map(h => (...))}
```

And add an Initials column to the table rows:
```jsx
<td className="px-4 py-3 text-gray-500 font-mono text-xs">{u.initials || '—'}</td>
```

#### Step 6: Show initials in activity displays

- [ ] In `client/src/pages/Dashboard.jsx`, update the `ActivityList` component to show initials:

```jsx
function ActivityList({ items }) {
  if (!items?.length) return <p className="text-sm text-gray-400">No activity yet.</p>
  return (
    <div className="space-y-3 overflow-y-auto max-h-60">
      {items.map(a => (
        <div key={a.id} className="flex items-start gap-2.5">
          <span className="text-sm flex-shrink-0 leading-none mt-0.5">{EVENT_ICONS[a.event_type] || '•'}</span>
          <div>
            <p className="text-xs text-gray-700 leading-snug">{a.description}</p>
            <p className="text-xs text-gray-400">
              {a.acted_by_initials && (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent text-white text-[9px] font-bold mr-1">
                  {a.acted_by_initials}
                </span>
              )}
              {a.acted_by_name ? `${a.acted_by_name} · ` : ''}
              {new Date(a.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] In `client/src/pages/ProjectDetail.jsx`, find the activity item render block (around line 545) and update to show initials:

```jsx
// In the activity item render, after item.description:
<p className="text-xs text-gray-400 mt-1">
  {item._kind === 'activity' && item.acted_by_initials && (
    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent text-white text-[9px] font-bold mr-1">
      {item.acted_by_initials}
    </span>
  )}
  {item._kind === 'activity' && item.acted_by_name ? `${item.acted_by_name} · ` : ''}
  {item._time.toLocaleString()}
</p>
```

- [ ] **Run tests:**

```bash
cd server && npm test
```

Expected: all tests pass. No test changes needed for C4 (schema is backward-compatible — existing tests don't check for initials).

- [ ] **Commit C4:**

```bash
git add server/db/migrate.js server/lib/activityLogger.js \
        server/routes/engagements.js server/routes/projects.js server/routes/notes.js \
        server/routes/billing.js server/routes/payments.js server/routes/timeEntries.js \
        server/routes/subtasks.js server/routes/users.js \
        client/src/pages/Settings.jsx client/src/pages/Dashboard.jsx client/src/pages/ProjectDetail.jsx
git commit -m "feat(c4): user initials — stored on accounts, shown on activity log entries"
```

---

### Task 5: C5 — Activity log completeness

**Missing actions to add logging to:**
1. `POST /api/projects/:id/milestones` — milestone / custom-section field updates (covers efile auth received, documents received, etc.)
2. `POST /api/releases` — time release by a user

**Files:**
- Modify: `server/routes/projects.js` — log milestone updates
- Modify: `server/routes/releases.js` — log time releases

#### Step 1: Log milestone field updates in projects.js

- [ ] In `server/routes/projects.js`, update the `POST /:id/milestones` handler:

```js
// ── POST /api/projects/:id/milestones ─────────────────────────────────────────
router.post('/:id/milestones', (req, res) => {
  const { field_definition_id, value } = req.body;
  if (!field_definition_id) return res.status(400).json({ error: 'field_definition_id required' });

  // Look up field name for a meaningful log description
  const field = db.prepare(
    'SELECT field_name FROM custom_field_definitions WHERE id = ?'
  ).get(field_definition_id);
  const fieldLabel = field?.field_name || `field #${field_definition_id}`;

  db.prepare(`
    INSERT INTO project_custom_field_values (project_id, field_definition_id, value)
    VALUES (?, ?, ?)
    ON CONFLICT(project_id, field_definition_id) DO UPDATE SET value = excluded.value
  `).run(req.params.id, field_definition_id, value ?? null);

  log('milestone_updated', 'project', req.params.id,
    `${fieldLabel}: ${value ?? '(cleared)'}`, null, req.user.full_name, req.user.id);

  res.json({ ok: true });
});
```

#### Step 2: Log time releases in releases.js

- [ ] In `server/routes/releases.js`, add the activityLogger import at the top:

```js
const { log } = require('../lib/activityLogger');
```

- [ ] After the `const release = db.prepare(...).get(...)` call (just before the auto-billing block), add:

```js
  log('time_released', 'user', req.user.id,
    `Time released: ${start_date} – ${end_date} (${totals.total_hours.toFixed(2)} hrs)`,
    req.user.full_name, req.user.full_name, req.user.id);
```

- [ ] **Verify:** Perform a milestone field update on a project (e.g., mark a custom field value). Check the activity log. Submit a time release. Check the activity log. Both should appear.

- [ ] **Commit C5:**

```bash
git add server/routes/projects.js server/routes/releases.js
git commit -m "feat(c5): add activity logging for milestone field updates and time releases"
```

---

### Task 6: C6 — Multi-timer rework

**New timer behavior:** Multiple timers can coexist; only ONE runs at a time. Starting/resuming a timer auto-pauses whichever was running. Paused timers retain accumulated time. The A1 fix (all timers cleared on logout) is preserved.

**Files:**
- Modify: `client/src/context/TimerContext.jsx` — new data model + pause/resume
- Modify: `client/src/components/TimerPanel.jsx` — pause/resume button, paused state display

**New timer shape:**
```js
{
  engagementId: number,
  engagementLabel: string,
  status: 'running' | 'paused',
  accumulatedSeconds: number,   // total seconds accumulated before last start
  lastStartedAt: number | null  // Date.now() when last started; null when paused
}
```

#### Step 1: Rewrite TimerContext.jsx

- [ ] Replace `client/src/context/TimerContext.jsx`:

```jsx
import { createContext, useContext, useEffect, useRef, useState } from 'react'

const TimerContext = createContext(null)

const _clearRef = { current: null }

export function clearAllTimers() {
  localStorage.removeItem('mgr_timers')
  localStorage.removeItem('mgr_timer') // legacy
  _clearRef.current?.()
}

// Migrate old timer shape to new shape
function migrateTimers(arr) {
  return arr.map(t => {
    if (t.status !== undefined) return t // already new shape
    // Old shape: { engagementId, engagementLabel, startedAt }
    return {
      engagementId:       t.engagementId,
      engagementLabel:    t.engagementLabel,
      status:             'running',
      accumulatedSeconds: 0,
      lastStartedAt:      t.startedAt ?? Date.now(),
    }
  })
}

export function TimerProvider({ children }) {
  const [timers, setTimers] = useState(() => {
    try {
      const legacy = localStorage.getItem('mgr_timer')
      if (legacy) {
        const old = JSON.parse(legacy)
        localStorage.removeItem('mgr_timer')
        if (old) {
          const arr = migrateTimers([old])
          localStorage.setItem('mgr_timers', JSON.stringify(arr))
          return arr
        }
      }
      const stored = JSON.parse(localStorage.getItem('mgr_timers') || '[]')
      return migrateTimers(stored)
    } catch {
      return []
    }
  })

  const [tick, setTick] = useState(0)
  const intervalRef    = useRef(null)

  const anyRunning = timers.some(t => t.status === 'running')

  useEffect(() => {
    if (anyRunning) {
      intervalRef.current = setInterval(() => setTick(n => n + 1), 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [anyRunning])

  const persist = newTimers => {
    localStorage.setItem('mgr_timers', JSON.stringify(newTimers))
    setTimers(newTimers)
  }

  _clearRef.current = () => persist([])

  // ── Public API ──────────────────────────────────────────────────────────────

  const getTimerElapsed = engagementId => {
    const t = timers.find(x => x.engagementId === engagementId)
    tick // live read
    if (!t) return 0
    if (t.status === 'running') return t.accumulatedSeconds + Math.floor((Date.now() - t.lastStartedAt) / 1000)
    return t.accumulatedSeconds
  }

  const startTimer = (engagementId, engagementLabel) => {
    const now = Date.now()
    let updated = timers.map(t => {
      if (t.status === 'running' && t.engagementId !== engagementId) {
        return {
          ...t,
          status: 'paused',
          accumulatedSeconds: t.accumulatedSeconds + Math.floor((now - t.lastStartedAt) / 1000),
          lastStartedAt: null,
        }
      }
      return t
    })

    const existing = updated.find(t => t.engagementId === engagementId)
    if (existing) {
      if (existing.status === 'running') return // already running
      updated = updated.map(t =>
        t.engagementId === engagementId
          ? { ...t, status: 'running', lastStartedAt: now }
          : t
      )
    } else {
      updated = [...updated, {
        engagementId,
        engagementLabel,
        status: 'running',
        accumulatedSeconds: 0,
        lastStartedAt: now,
      }]
    }
    persist(updated)
  }

  const pauseTimer = engagementId => {
    const now = Date.now()
    persist(timers.map(t => {
      if (t.engagementId !== engagementId || t.status !== 'running') return t
      return {
        ...t,
        status: 'paused',
        accumulatedSeconds: t.accumulatedSeconds + Math.floor((now - t.lastStartedAt) / 1000),
        lastStartedAt: null,
      }
    }))
  }

  const stopTimer = engagementId => {
    const t = timers.find(x => x.engagementId === engagementId)
    if (!t) return 0
    let totalSecs = t.accumulatedSeconds
    if (t.status === 'running') totalSecs += Math.floor((Date.now() - t.lastStartedAt) / 1000)
    const hours = totalSecs > 0 ? Math.max(0.25, Math.round(totalSecs / 900) * 0.25) : 0
    persist(timers.filter(x => x.engagementId !== engagementId))
    return hours
  }

  const fmt = s => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  // ── Backward-compat aliases ─────────────────────────────────────────────────
  const runningTimer = timers.find(t => t.status === 'running')
  const active       = runningTimer || timers[0] || null
  tick
  const elapsed = active ? getTimerElapsed(active.engagementId) : 0
  const start   = startTimer
  const stop    = () => active ? stopTimer(active.engagementId) : 0

  return (
    <TimerContext.Provider value={{
      timers, tick, startTimer, pauseTimer, stopTimer, getTimerElapsed, fmt,
      active, elapsed, start, stop,
    }}>
      {children}
    </TimerContext.Provider>
  )
}

export const useTimer = () => useContext(TimerContext)
```

#### Step 2: Update TimerPanel.jsx to show paused state and pause/resume button

- [ ] Replace `client/src/components/TimerPanel.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StopIcon, ChevronUpIcon, ChevronDownIcon, PlusIcon, PauseIcon, PlayIcon } from '@heroicons/react/24/solid'
import { useTimer } from '../context/TimerContext'
import { engagementsApi } from '../api/engagements'

function NewTimerModal({ onStart, onClose }) {
  const [engagements, setEngagements] = useState([])
  const [engId, setEngId]             = useState('')

  useEffect(() => { engagementsApi.list().then(setEngagements).catch(() => {}) }, [])

  const selCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'

  const handleStart = () => {
    const eng = engagements.find(e => e.id === parseInt(engId))
    if (!eng) return
    onStart(eng.id, `${eng.client_name} — ${eng.engagement_type}`)
    onClose()
  }

  return (
    <div className="px-4 pb-3 pt-2 border-t border-gray-100 bg-gray-50">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">New Timer</p>
      <select value={engId} onChange={e => setEngId(e.target.value)} className={selCls}>
        <option value="">Select engagement...</option>
        {engagements.map(e => (
          <option key={e.id} value={e.id}>{e.client_name} — {e.engagement_type}</option>
        ))}
      </select>
      <div className="flex gap-2 mt-2">
        <button onClick={onClose} className="flex-1 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100">Cancel</button>
        <button
          disabled={!engId}
          onClick={handleStart}
          className="flex-1 py-1.5 text-xs font-semibold text-white bg-accent rounded-lg hover:bg-accent-dark disabled:opacity-50"
        >
          Start Timer
        </button>
      </div>
    </div>
  )
}

export default function TimerPanel() {
  const { timers, startTimer, pauseTimer, stopTimer, getTimerElapsed, fmt } = useTimer()
  const [collapsed, setCollapsed] = useState(false)
  const [showNew, setShowNew]     = useState(false)
  const navigate                  = useNavigate()

  const runningCount = timers.filter(t => t.status === 'running').length

  if (timers.length === 0 && !showNew) return (
    <button
      onClick={() => setShowNew(true)}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-1.5 bg-accent text-white text-xs font-semibold px-3 py-2 rounded-full shadow-lg hover:bg-accent-dark transition-colors"
    >
      <PlusIcon className="w-3 h-3" />
      Start Timer
    </button>
  )

  const handleStop = timer => {
    const hours = stopTimer(timer.engagementId)
    navigate('/time-tracking', {
      state: { prefill: { engagementId: timer.engagementId, engagementLabel: timer.engagementLabel, hours } },
    })
  }

  const handleToggle = timer => {
    if (timer.status === 'running') {
      pauseTimer(timer.engagementId)
    } else {
      startTimer(timer.engagementId, timer.engagementLabel)
    }
  }

  return (
    <div
      className="fixed bottom-6 right-6 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
      style={{ minWidth: 296 }}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-900 text-white hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          {runningCount > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
            </span>
          )}
          <span className="text-sm font-semibold tracking-tight">
            {timers.length > 0
              ? `${timers.length} Timer${timers.length > 1 ? 's' : ''} · ${runningCount} Running`
              : 'New Timer'}
          </span>
        </div>
        {collapsed
          ? <ChevronUpIcon className="w-4 h-4 text-gray-400" />
          : <ChevronDownIcon className="w-4 h-4 text-gray-400" />}
      </button>

      {/* Timer rows */}
      {!collapsed && (
        <>
          <div className="divide-y divide-gray-100">
            {timers.map(timer => (
              <div key={timer.engagementId} className={`flex items-center gap-3 px-4 py-3 ${timer.status === 'paused' ? 'bg-gray-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-sm font-medium text-gray-900 truncate leading-tight">
                      {timer.engagementLabel}
                    </p>
                    {timer.status === 'paused' && (
                      <span className="text-xs text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded-full flex-shrink-0">Paused</span>
                    )}
                  </div>
                  <p className={`font-mono text-sm font-bold tracking-widest ${timer.status === 'running' ? 'text-accent' : 'text-gray-400'}`}>
                    {fmt(getTimerElapsed(timer.engagementId))}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleToggle(timer)}
                    title={timer.status === 'running' ? 'Pause' : 'Resume'}
                    className="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                  >
                    {timer.status === 'running'
                      ? <PauseIcon className="w-3.5 h-3.5" />
                      : <PlayIcon className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => handleStop(timer)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    <StopIcon className="w-3 h-3" />
                    Log
                  </button>
                </div>
              </div>
            ))}
          </div>
          {showNew ? (
            <NewTimerModal onStart={startTimer} onClose={() => setShowNew(false)} />
          ) : (
            <div className="px-4 pb-3 pt-2 border-t border-gray-100">
              <button
                onClick={() => setShowNew(true)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors"
              >
                <PlusIcon className="w-3 h-3" />
                New Timer
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Verify multi-timer behavior:**

1. Open TimeTracking or any page with the timer panel
2. Start Timer 1 (engagement A) → it shows "Running"
3. Start Timer 2 (engagement B) → Timer 1 auto-pauses, shows "Paused" with accumulated time frozen; Timer 2 shows "Running"
4. Click Resume on Timer 1 → Timer 1 runs, Timer 2 pauses
5. Stop Timer 1 → navigates to time-tracking with correct hours
6. Log out → re-login → no timers visible (cleared on logout)

- [ ] **Run tests:**

```bash
cd server && npm test
```

Expected: all tests pass. C6 is frontend-only — no server tests needed.

- [ ] **Commit C6:**

```bash
git add client/src/context/TimerContext.jsx client/src/components/TimerPanel.jsx
git commit -m "feat(c6): multi-timer rework — multiple coexist, one running at a time with pause/resume"
```

---

### Final: Run all tests

- [ ] **Run the full test suite:**

```bash
cd server && npm test
```

Expected output: all 109+ existing tests pass, plus new password-reset tests. Report the final test count and any failures.

---

## Summary of changes

| Item | What changed |
|------|-------------|
| C1 | SearchBar component and search imports removed from `Layout.jsx`. `/api/search` route kept. |
| C2 | New `password_reset_keys` table. Admin generates single-use hashed key. User redeems at `/reset-password`. `PUT /api/users/:id` no longer accepts `password`. |
| C3 | Notes list JOIN returns `client_display_name`. Notes form shows contact picker when entity_type='client'. |
| C4 | `initials` column on users (backfilled). `acted_by_initials` on activity_log. Logger looks up initials by user ID. All log() call sites pass `req.user.id`. Initials shown in activity displays. |
| C5 | Missing log entries added: milestone field updates and time releases. |
| C6 | Timer shape has `status`/`accumulatedSeconds`/`lastStartedAt`. Starting a timer auto-pauses the running one. Pause/resume per timer in TimerPanel. Logout still clears all timers. |
