# Time Tracking Overhaul — Part 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pay period admin release controls, Staff Rates Settings improvements, 14-report Reports page with left sidebar, and admin-only Dashboard alerts.

**Architecture:** Backend adds 5 new pay period endpoints and 3 new report types, plus fixes to 3 existing report types. Frontend rewrites the Time Release tab with role-aware views, rebuilds Reports with a left-sidebar layout + period picker, and adds an admin-only alert strip to Dashboard.

**Tech Stack:** React 18, Vite, Tailwind CSS, Node.js/Express, better-sqlite3, JWT auth (`req.user = { id, username, full_name, role }`)

**Note:** This project has no git repository. Skip all git commit steps.

---

## File Structure

**Backend (server/):**
- `server/db/seed.js` — add Carson $0/hr rate (lines 55–59)
- `server/routes/payPeriods.js` — 5 new endpoints inserted before generic `GET /:id`
- `server/routes/reports.js` — 3 new report cases + 3 fixed cases

**Frontend (client/src/):**
- `client/src/api/payPeriods.js` — 4 new client methods
- `client/src/pages/time/BottomTabs.jsx` — rewrite `TimeReleaseTab`, remove `UnreleasedPeriods`
- `client/src/pages/Reports.jsx` — full rewrite with left sidebar
- `client/src/pages/Dashboard.jsx` — add admin-only `AdminAlerts` component
- `client/src/pages/Settings.jsx` — enhance Staff Rates tab to show all users

---

### Task 1: Backend — Seed Carson Rate + Pay Period Admin Endpoints

**Files:**
- Modify: `server/db/seed.js`
- Modify: `server/routes/payPeriods.js`

- [ ] **Step 1: Add Carson rate to seed.js**

In `server/db/seed.js`, find the staff rates block (the array passed to `insertRate.run`). Change it from:

```js
[
  ['Marcus Maurer', 350, '2026-01-01'],
  ['Sofia Graf',    275, '2026-01-01'],
  ['Diego Rivera',  175, '2026-01-01'],
].forEach(args => insertRate.run(...args));
```

To:

```js
[
  ['Marcus Maurer', 350, '2026-01-01'],
  ['Sofia Graf',    275, '2026-01-01'],
  ['Diego Rivera',  175, '2026-01-01'],
  ['Carson',          0, '2026-01-01'],
].forEach(args => insertRate.run(...args));
```

- [ ] **Step 2: Add `GET /my-summary` to payPeriods.js**

In `server/routes/payPeriods.js`, insert this block immediately **after** the `GET /current` handler (line 30) and **before** `GET /:id/my-status`. This placement is critical — Express matches routes in order, so `/my-summary` must come before `/:id` or it will be treated as `id = "my-summary"`.

```js
// ── GET /api/pay-periods/my-summary ─────────────────────────────────────────
// Returns all 2026 periods for the current user with hours + release status
router.get('/my-summary', (req, res) => {
  const rows = db.prepare(`
    SELECT pp.id, pp.period_number, pp.year, pp.start_date, pp.end_date,
      COALESCE(ppus.status, 'Open') as user_status,
      ppus.released_at,
      COALESCE(SUM(te.hours), 0) as total_hours,
      COALESCE(SUM(CASE WHEN te.billable=1 THEN te.hours ELSE 0 END), 0) as billable_hours,
      COALESCE(SUM(CASE WHEN te.billable=0 THEN te.hours ELSE 0 END), 0) as nonbillable_hours,
      COALESCE(SUM(CASE WHEN te.billable=1 THEN te.hours * COALESCE(te.billing_rate, 0) ELSE 0 END), 0) as billable_amount
    FROM pay_periods pp
    LEFT JOIN pay_period_user_status ppus
      ON ppus.pay_period_id = pp.id AND ppus.user_id = ?
    LEFT JOIN time_entries te
      ON te.pay_period_id = pp.id AND te.user_id = ?
    WHERE pp.year = 2026
    GROUP BY pp.id
    ORDER BY pp.period_number DESC
  `).all(req.user.id, req.user.id);
  res.json(rows);
});
```

- [ ] **Step 3: Add `GET /:id/staff-summary` to payPeriods.js**

Insert after `GET /my-summary`, still before the existing `GET /:id/my-status`:

```js
// ── GET /api/pay-periods/:id/staff-summary ───────────────────────────────────
// Admin/Manager only — all active staff with their hours + release status
router.get('/:id/staff-summary', (req, res) => {
  if (req.user.role === 'staff') return res.status(403).json({ error: 'Forbidden' });

  const rows = db.prepare(`
    SELECT u.id as user_id, u.full_name,
      COALESCE(ppus.status, 'Open') as user_status,
      ppus.released_at,
      COALESCE(SUM(te.hours), 0) as total_hours,
      COALESCE(SUM(CASE WHEN te.billable=1 THEN te.hours ELSE 0 END), 0) as billable_hours,
      COALESCE(SUM(CASE WHEN te.billable=1 THEN te.hours * COALESCE(te.billing_rate, 0) ELSE 0 END), 0) as billable_amount
    FROM users u
    LEFT JOIN pay_period_user_status ppus
      ON ppus.pay_period_id = ? AND ppus.user_id = u.id
    LEFT JOIN time_entries te
      ON te.pay_period_id = ? AND te.user_id = u.id
    WHERE u.active = 1 AND u.role IN ('admin', 'manager', 'staff')
    GROUP BY u.id
    HAVING total_hours > 0 OR ppus.status IS NOT NULL
    ORDER BY u.full_name
  `).all(req.params.id, req.params.id);
  res.json(rows);
});
```

- [ ] **Step 4: Add `POST /:id/release-user/:userId` to payPeriods.js**

Insert after `GET /:id/staff-summary`:

```js
// ── POST /api/pay-periods/:id/release-user/:userId ───────────────────────────
router.post('/:id/release-user/:userId', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  db.prepare(`
    INSERT INTO pay_period_user_status (pay_period_id, user_id, status, released_at)
    VALUES (?, ?, 'Released', ?)
    ON CONFLICT(pay_period_id, user_id)
    DO UPDATE SET status='Released', released_at=excluded.released_at
  `).run(req.params.id, req.params.userId, new Date().toISOString());

  res.json({
    pay_period_id: parseInt(req.params.id),
    user_id: parseInt(req.params.userId),
    status: 'Released',
  });
});
```

- [ ] **Step 5: Add `POST /:id/bulk-release` to payPeriods.js**

Insert after `POST /:id/release-user/:userId`:

```js
// ── POST /api/pay-periods/:id/bulk-release ───────────────────────────────────
router.post('/:id/bulk-release', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const users = db.prepare(
    'SELECT DISTINCT user_id FROM time_entries WHERE pay_period_id = ?'
  ).all(req.params.id);

  const upsert = db.prepare(`
    INSERT INTO pay_period_user_status (pay_period_id, user_id, status, released_at)
    VALUES (?, ?, 'Released', ?)
    ON CONFLICT(pay_period_id, user_id)
    DO UPDATE SET status='Released', released_at=excluded.released_at
  `);

  const now = new Date().toISOString();
  db.transaction(() => {
    users.forEach(u => upsert.run(req.params.id, u.user_id, now));
  })();

  res.json({ released: users.length, period_id: parseInt(req.params.id) });
});
```

- [ ] **Step 6: Verify server starts cleanly**

```bash
cd server && node -e "require('./app'); console.log('OK')"
```

Expected: `OK` with no errors

---

### Task 2: Backend — Reports Enhancements

**Files:**
- Modify: `server/routes/reports.js`

All new cases go **before** the `default:` line. Fixes replace existing `case` blocks in-place.

- [ ] **Step 1: Add `unreleased_time` case**

Insert before `default:`:

```js
case 'unreleased_time': {
  result = db.prepare(`
    SELECT pp.id as period_id, pp.period_number, pp.start_date, pp.end_date,
      u.full_name as staff_member, u.id as user_id,
      COALESCE(ppus.status, 'Open') as release_status,
      COALESCE(SUM(te.hours), 0) as total_hours
    FROM pay_periods pp
    JOIN time_entries te ON te.pay_period_id = pp.id
    JOIN users u ON u.id = te.user_id
    LEFT JOIN pay_period_user_status ppus
      ON ppus.pay_period_id = pp.id AND ppus.user_id = u.id
    WHERE COALESCE(ppus.status, 'Open') != 'Released'
      AND pp.end_date < date('now')
    GROUP BY pp.id, u.id
    ORDER BY pp.period_number DESC, u.full_name
  `).all();
  break;
}
```

- [ ] **Step 2: Add `pay_period_summary` case**

Insert before `unreleased_time`:

```js
case 'pay_period_summary': {
  const periodId = req.query.periodId;
  if (!periodId) return res.status(400).json({ error: 'periodId is required' });
  result = db.prepare(`
    SELECT u.full_name as staff_member, u.id as user_id,
      COALESCE(SUM(te.hours), 0) as total_hours,
      COALESCE(SUM(CASE WHEN te.billable=1 THEN te.hours ELSE 0 END), 0) as billable_hours,
      COALESCE(SUM(CASE WHEN te.billable=1 THEN te.hours * COALESCE(te.billing_rate, 0) ELSE 0 END), 0) as billable_amount,
      COALESCE(ppus.status, 'Open') as release_status,
      ppus.released_at
    FROM users u
    LEFT JOIN time_entries te ON te.user_id = u.id AND te.pay_period_id = ?
    LEFT JOIN pay_period_user_status ppus
      ON ppus.user_id = u.id AND ppus.pay_period_id = ?
    WHERE u.active = 1 AND u.role IN ('staff', 'manager', 'admin')
    GROUP BY u.id
    HAVING total_hours > 0
    ORDER BY u.full_name
  `).all(periodId, periodId);
  break;
}
```

- [ ] **Step 3: Add `timesheet` case**

Insert before `pay_period_summary`:

```js
case 'timesheet': {
  const periodId = req.query.periodId;
  if (!periodId) return res.status(400).json({ error: 'periodId is required for timesheet' });
  result = db.prepare(`
    SELECT u.full_name as staff_member,
      te.date,
      SUM(te.hours) as hours,
      SUM(CASE WHEN te.billable=1 THEN te.hours ELSE 0 END) as billable_hours,
      SUM(CASE WHEN te.billable=1 THEN te.hours * COALESCE(te.billing_rate, 0) ELSE 0 END) as billable_amount,
      COALESCE(ppus.status, 'Open') as release_status
    FROM time_entries te
    JOIN users u ON u.id = te.user_id
    LEFT JOIN pay_period_user_status ppus
      ON ppus.pay_period_id = te.pay_period_id AND ppus.user_id = te.user_id
    WHERE te.pay_period_id = ?
      ${staff ? 'AND u.full_name = ?' : ''}
    GROUP BY u.full_name, te.date
    ORDER BY u.full_name, te.date
  `).all(periodId, ...(staff ? [staff] : []));
  break;
}
```

- [ ] **Step 4: Fix `time_by_service_code` — join service_codes for number/description**

Find and **replace** the existing `case 'time_by_service_code':` block entirely:

```js
case 'time_by_service_code': {
  result = db.prepare(`
    SELECT
      CASE
        WHEN sc.number IS NOT NULL
          THEN sc.number || ' — ' || COALESCE(te.service_code, '') || ' — ' || COALESCE(sc.description, '')
        ELSE COALESCE(te.service_code, '(none)')
      END as service_code,
      SUM(te.hours) as total_hours,
      SUM(CASE WHEN te.billable=1 THEN te.hours * COALESCE(te.billing_rate, 0) ELSE 0 END) as billable_amount,
      COUNT(DISTINCT te.engagement_id) as engagement_count
    FROM time_entries te
    LEFT JOIN service_codes sc ON sc.code = te.service_code
    WHERE te.date BETWEEN ? AND ?
      ${staff ? 'AND te.staff_member = ?' : ''}
    GROUP BY te.service_code
    ORDER BY total_hours DESC
  `).all(start, end, ...(staff ? [staff] : []));
  break;
}
```

- [ ] **Step 5: Fix `collections` — per-payment rows**

Find and **replace** the existing `case 'collections':` block:

```js
case 'collections': {
  result = db.prepare(`
    SELECT payment_date as date, client_name, amount,
      COALESCE(payment_method, '—') as payment_method,
      COALESCE(reference_number, '—') as reference_number
    FROM payments
    WHERE payment_date BETWEEN ? AND ?
    ORDER BY payment_date DESC
  `).all(start, end);
  break;
}
```

- [ ] **Step 6: Fix `invoice_register` — add status column**

Find and **replace** the existing `case 'invoice_register':` block:

```js
case 'invoice_register': {
  result = db.prepare(`
    SELECT i.invoice_number, i.client_name, i.invoice_date, i.due_date,
      i.total, e.engagement_type,
      COALESCE(i.status, 'Invoiced') as status
    FROM invoices i
    LEFT JOIN engagements e ON e.id = i.engagement_id
    WHERE i.invoice_date BETWEEN ? AND ?
      ${engagementType ? 'AND e.engagement_type = ?' : ''}
    ORDER BY i.invoice_date DESC
  `).all(start, end, ...(engagementType ? [engagementType] : []));
  break;
}
```

Note: If the `invoices` table has no `status` column, run `PRAGMA table_info(invoices)` in a quick node script to confirm. If missing, the `COALESCE(i.status, 'Invoiced')` still works — SQLite returns NULL for missing columns in some cases, but better-sqlite3 will throw. In that case, replace with the literal string `'Invoiced' as status`.

- [ ] **Step 7: Verify server starts cleanly**

```bash
cd server && node -e "require('./app'); console.log('OK')"
```

Expected: `OK` with no errors

---

### Task 3: Client API — payPeriods.js New Methods

**Files:**
- Modify: `client/src/api/payPeriods.js`

- [ ] **Step 1: Add 4 new methods to payPeriodsApi**

The full updated file (replace entirely):

```js
import { api } from './client'

export const payPeriodsApi = {
  list:            (year)                    => api.get(`/pay-periods${year ? `?year=${year}` : ''}`),
  current:         ()                        => api.get('/pay-periods/current'),
  get:             (id)                      => api.get(`/pay-periods/${id}`),
  generate:        (year)                    => api.post('/pay-periods/generate', { year }),
  setStatus:       (id, status, released_by) => api.patch(`/pay-periods/${id}/status`, { status, released_by }),
  submit:          (id, staff_member)        => api.post(`/pay-periods/${id}/submit`, { staff_member }),
  release:         (id, staff_member, released_by) =>
    api.post(`/pay-periods/${id}/release`, { staff_member, released_by }),
  // Per-user release (from Part 1)
  getMyStatus:     (id)         => api.get(`/pay-periods/${id}/my-status`),
  releaseMyTime:   (id)         => api.post(`/pay-periods/${id}/release-my-time`, {}),
  getAllStatuses:   (id)         => api.get(`/pay-periods/${id}/all-user-statuses`),
  unreleaseUser:   (id, userId) => api.post(`/pay-periods/${id}/unrelease-user/${userId}`, {}),
  // Admin endpoints (Part 2)
  mySummary:       ()              => api.get('/pay-periods/my-summary'),
  staffSummary:    (id)            => api.get(`/pay-periods/${id}/staff-summary`),
  releaseUser:     (id, userId)    => api.post(`/pay-periods/${id}/release-user/${userId}`, {}),
  bulkRelease:     (id)            => api.post(`/pay-periods/${id}/bulk-release`, {}),
}
```

- [ ] **Step 2: Verify client compiles**

```bash
cd client && npm run build 2>&1 | tail -10
```

Expected: No errors

---

### Task 4: Frontend — Time Release Tab Rewrite

**Files:**
- Modify: `client/src/pages/time/BottomTabs.jsx`

Replace the `TimeReleaseTab` function (lines 239–375) and `UnreleasedPeriods` function (lines 378–417) with the new implementation below. Everything else in the file (imports, MiniBarChart, MtdTab, PeriodSummaryTab, AlertsTab, shell BottomTabs) stays unchanged.

- [ ] **Step 1: Add `useToast` import**

In BottomTabs.jsx, the current imports are:
```js
import { useEffect, useState } from 'react'
import { timeSummaryApi } from '../../api/timeSummary'
import { payPeriodsApi }  from '../../api/payPeriods'
import { useAuth } from '../../context/AuthContext'
```

Add the toast import:
```js
import { useToast } from '../../context/ToastContext'
```

- [ ] **Step 2: Replace TimeReleaseTab + UnreleasedPeriods**

Find the comment `// ── Time Release ──` (around line 238) and replace everything from the start of `function TimeReleaseTab` through the closing `}` of `function UnreleasedPeriods` with:

```jsx
// ── Time Release ──────────────────────────────────────────────────────────────
function TimeReleaseTab({ period }) {
  const { user }   = useAuth()
  const isAdmin    = user?.role === 'admin'
  const { toast }  = useToast()

  const [view,         setView]         = useState('mine') // 'mine' | 'all'
  const [periods,      setPeriods]      = useState([])
  const [selPeriodId,  setSelPeriodId]  = useState(period?.id || null)
  const [mySummary,    setMySummary]    = useState([])
  const [staffSummary, setStaffSummary] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [acting,       setActing]       = useState(null)

  // Load year's period list for the admin dropdown
  useEffect(() => {
    payPeriodsApi.list(new Date().getFullYear()).then(ps => {
      setPeriods(ps)
      if (!selPeriodId && ps.length) {
        setSelPeriodId(period?.id || ps.find(p => p.status === 'Open')?.id || ps[0]?.id)
      }
    }).catch(() => {})
  }, [])

  const loadMine = () => {
    setLoading(true)
    payPeriodsApi.mySummary()
      .then(setMySummary)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const loadAll = () => {
    if (!selPeriodId) return
    setLoading(true)
    payPeriodsApi.staffSummary(selPeriodId)
      .then(setStaffSummary)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (view === 'mine') loadMine()
    else loadAll()
  }, [view, selPeriodId])

  const handleReleaseMine = async (periodId) => {
    setActing(periodId)
    try {
      await payPeriodsApi.releaseMyTime(periodId)
      toast.success('Time released.')
      loadMine()
    } catch { toast.error('Failed to release time.') }
    finally { setActing(null) }
  }

  const handleReleaseUser = async (userId) => {
    setActing(userId)
    try {
      await payPeriodsApi.releaseUser(selPeriodId, userId)
      toast.success('Released.')
      loadAll()
    } catch { toast.error('Failed to release.') }
    finally { setActing(null) }
  }

  const handleUnreleaseUser = async (userId) => {
    setActing(`un-${userId}`)
    try {
      await payPeriodsApi.unreleaseUser(selPeriodId, userId)
      toast.success('Unreleased.')
      loadAll()
    } catch { toast.error('Failed to unrelease.') }
    finally { setActing(null) }
  }

  const handleBulkRelease = async () => {
    if (!confirm('Release all staff time for this period? This cannot be undone.')) return
    setActing('bulk')
    try {
      await payPeriodsApi.bulkRelease(selPeriodId)
      toast.success('All time released.')
      loadAll()
    } catch { toast.error('Bulk release failed.') }
    finally { setActing(null) }
  }

  const STATUS_CHIP = {
    Released: 'bg-green-50 text-green-700 border-green-200',
    Open:     'bg-blue-50 text-blue-700 border-blue-200',
  }

  const mineWithHours = mySummary.filter(p => p.total_hours > 0)

  return (
    <div className="py-2 space-y-3">
      {/* Admin toggle + period selector */}
      {isAdmin && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
            {[['mine', 'My Time'], ['all', 'All Staff']].map(([v, label]) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 transition-colors ${
                  view === v ? 'bg-accent text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}>
                {label}
              </button>
            ))}
          </div>
          {view === 'all' && (
            <select
              value={selPeriodId || ''}
              onChange={e => setSelPeriodId(parseInt(e.target.value))}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {periods.map(p => (
                <option key={p.id} value={p.id}>
                  P{p.period_number}: {p.start_date} – {p.end_date}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {loading && <p className="text-gray-400 text-sm py-2">Loading…</p>}

      {/* My Time view */}
      {!loading && view === 'mine' && (
        mineWithHours.length === 0 ? (
          <p className="text-gray-400 text-sm">No time logged yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200">
              <tr>
                {['Period', 'Dates', 'Total', 'Billable', 'Amt', 'Status', ''].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2 pr-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mineWithHours.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="py-2 pr-3 font-medium text-gray-900">P{p.period_number}</td>
                  <td className="py-2 pr-3 text-xs text-gray-500 font-mono">{p.start_date} – {p.end_date}</td>
                  <td className="py-2 pr-3 font-mono font-semibold text-gray-900">{fmtH(p.total_hours)}</td>
                  <td className="py-2 pr-3 font-mono text-green-700">{fmtH(p.billable_hours)}</td>
                  <td className="py-2 pr-3 font-mono text-gray-700">{fmt$(p.billable_amount)}</td>
                  <td className="py-2 pr-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_CHIP[p.user_status] || STATUS_CHIP.Open}`}>
                      {p.user_status}
                    </span>
                  </td>
                  <td className="py-2">
                    {p.user_status !== 'Released' ? (
                      <button
                        onClick={() => handleReleaseMine(p.id)}
                        disabled={acting === p.id}
                        className="px-2.5 py-0.5 text-xs font-semibold text-white bg-accent rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        {acting === p.id ? '…' : 'Release'}
                      </button>
                    ) : (
                      <span className="text-xs text-green-600 font-medium">✓</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {/* All Staff view (admin only) */}
      {!loading && view === 'all' && (
        staffSummary.length === 0 ? (
          <p className="text-gray-400 text-sm">No time logged for this period.</p>
        ) : (
          <div className="space-y-2">
            {staffSummary.some(r => r.user_status !== 'Released') && (
              <div className="flex justify-end">
                <button onClick={handleBulkRelease} disabled={acting === 'bulk'}
                  className="px-3 py-1 text-xs font-semibold text-white bg-green-500 rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50">
                  {acting === 'bulk' ? 'Releasing…' : 'Release All'}
                </button>
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  {['Staff', 'Total Hrs', 'Billable', 'Amt', 'Status', ''].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2 pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {staffSummary.map(r => (
                  <tr key={r.user_id} className="hover:bg-gray-50">
                    <td className="py-2 pr-3 font-medium text-gray-900">{r.full_name}</td>
                    <td className="py-2 pr-3 font-mono font-semibold text-gray-900">{fmtH(r.total_hours)}</td>
                    <td className="py-2 pr-3 font-mono text-green-700">{fmtH(r.billable_hours)}</td>
                    <td className="py-2 pr-3 font-mono text-gray-700">{fmt$(r.billable_amount)}</td>
                    <td className="py-2 pr-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_CHIP[r.user_status] || STATUS_CHIP.Open}`}>
                        {r.user_status}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1.5">
                        {r.user_status !== 'Released' ? (
                          <button onClick={() => handleReleaseUser(r.user_id)} disabled={!!acting}
                            className="px-2.5 py-0.5 text-xs font-semibold text-white bg-green-500 rounded hover:bg-green-600 disabled:opacity-50 transition-colors">
                            {acting === r.user_id ? '…' : 'Release'}
                          </button>
                        ) : (
                          <button onClick={() => handleUnreleaseUser(r.user_id)} disabled={!!acting}
                            className="px-2.5 py-0.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors">
                            {acting === `un-${r.user_id}` ? '…' : 'Unrelease'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify client compiles**

```bash
cd client && npm run build 2>&1 | tail -10
```

Expected: No TypeScript/JSX errors

---

### Task 5: Frontend — Reports Page with Left Sidebar

**Files:**
- Modify: `client/src/pages/Reports.jsx` (full replacement)

- [ ] **Step 1: Replace Reports.jsx entirely**

```jsx
import { useEffect, useState } from 'react'
import { reportsApi }    from '../api/reports'
import { payPeriodsApi } from '../api/payPeriods'
import { useSortable }   from '../hooks/useSortable'
import { SkeletonTable } from '../components/Skeleton'
import { useAuth }       from '../context/AuthContext'

// ── Report categories + registry ──────────────────────────────────────────────
const CATEGORIES = [
  {
    key: 'time', label: 'Time',
    reports: [
      { key: 'staff_productivity',   label: 'Staff Productivity' },
      { key: 'time_by_service_code', label: 'Time by Service Code' },
      { key: 'time_by_client',       label: 'Time by Client' },
      { key: 'timesheet',            label: 'Timesheet', periodPicker: true },
    ],
  },
  {
    key: 'billing', label: 'Billing & AR',
    reports: [
      { key: 'invoice_register', label: 'Invoice Register' },
      { key: 'collections',      label: 'Collections' },
      { key: 'ar_aging',         label: 'AR Aging' },
      { key: 'client_balance',   label: 'Client Balances' },
    ],
  },
  {
    key: 'engagements', label: 'Engagements',
    reports: [
      { key: 'engagement_status', label: 'Engagement Status' },
      { key: 'budget_variance',   label: 'Budget Variance' },
      { key: 'overdue',           label: 'Overdue Engagements' },
      { key: 'staff_workload',    label: 'Staff Workload' },
    ],
  },
  {
    key: 'payroll', label: 'Payroll', adminOnly: true,
    reports: [
      { key: 'pay_period_summary', label: 'Pay Period Summary', periodPicker: true },
      { key: 'unreleased_time',    label: 'Unreleased Time' },
    ],
  },
]

const ENG_TYPES   = ['Tax Return', 'Bookkeeping', 'Audit', 'Advisory', 'Payroll', 'Other']
const TODAY       = new Date().toISOString().split('T')[0]
const MONTH_START = TODAY.slice(0, 8) + '01'

function fmtCurrency(n) {
  return '$' + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtHours(n) { return (n || 0).toFixed(1) + 'h' }

function exportCsv(columns, rows, filename) {
  const header = columns.map(c => c.label).join(',')
  const body   = rows.map(r => columns.map(c => {
    const v = r[c.key]
    return typeof v === 'string' && v.includes(',') ? `"${v}"` : (v ?? '')
  }).join(',')).join('\n')
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function budgetRowClass(row) {
  if (row.hours_pct == null) return ''
  if (row.hours_pct >= 100) return 'bg-red-50'
  if (row.hours_pct >= 75)  return 'bg-yellow-50'
  return 'bg-green-50'
}

function ReportTable({ columns, rows, rowClass }) {
  const { sorted, toggle, SortIcon } = useSortable(rows)
  if (!rows.length) return <p className="text-sm text-gray-400 py-8 text-center">No data for this period.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {columns.map(c => (
              <th key={c.key}
                onClick={() => toggle(c.key)}
                className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none whitespace-nowrap">
                {c.label}<SortIcon colKey={c.key} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((r, i) => (
            <tr key={i} className={`hover:bg-gray-50 ${rowClass ? rowClass(r) : ''}`}>
              {columns.map(c => (
                <td key={c.key} className={`px-4 py-3 ${c.mono ? 'font-mono' : ''} text-gray-700`}>
                  {c.fmt ? c.fmt(r[c.key], r) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const REPORT_CONFIGS = {
  staff_productivity: {
    columns: [
      { key: 'staff_member',    label: 'Staff' },
      { key: 'total_hours',     label: 'Total Hrs',    mono: true, fmt: fmtHours },
      { key: 'billable_hours',  label: 'Billable Hrs', mono: true, fmt: fmtHours },
      { key: 'billable_pct',    label: 'Billable %',   mono: true, fmt: v => `${v}%` },
      { key: 'billable_amount', label: 'Billable Amt', mono: true, fmt: fmtCurrency },
      { key: 'utilization',     label: 'Utilization',  mono: true, fmt: v => `${v}%` },
    ],
  },
  time_by_service_code: {
    columns: [
      { key: 'service_code',     label: 'Service Code' },
      { key: 'total_hours',      label: 'Total Hrs',    mono: true, fmt: fmtHours },
      { key: 'billable_amount',  label: 'Billable Amt', mono: true, fmt: fmtCurrency },
      { key: 'engagement_count', label: 'Engagements',  mono: true },
    ],
  },
  time_by_client: {
    columns: [
      { key: 'client_name',     label: 'Client' },
      { key: 'total_hours',     label: 'Total Hrs',    mono: true, fmt: fmtHours },
      { key: 'billable_hours',  label: 'Billable Hrs', mono: true, fmt: fmtHours },
      { key: 'billable_amount', label: 'Billable Amt', mono: true, fmt: fmtCurrency },
    ],
  },
  timesheet: {
    columns: [
      { key: 'staff_member',    label: 'Staff' },
      { key: 'date',            label: 'Date',         mono: true },
      { key: 'hours',           label: 'Hours',        mono: true, fmt: fmtHours },
      { key: 'billable_hours',  label: 'Billable',     mono: true, fmt: fmtHours },
      { key: 'billable_amount', label: 'Billable Amt', mono: true, fmt: fmtCurrency },
      { key: 'release_status',  label: 'Status' },
    ],
  },
  invoice_register: {
    columns: [
      { key: 'invoice_number',  label: 'Invoice #',    mono: true },
      { key: 'client_name',     label: 'Client' },
      { key: 'invoice_date',    label: 'Date',         mono: true },
      { key: 'due_date',        label: 'Due',          mono: true },
      { key: 'total',           label: 'Total',        mono: true, fmt: fmtCurrency },
      { key: 'engagement_type', label: 'Type' },
      { key: 'status',          label: 'Status' },
    ],
  },
  collections: {
    columns: [
      { key: 'date',             label: 'Date',       mono: true },
      { key: 'client_name',      label: 'Client' },
      { key: 'amount',           label: 'Amount',     mono: true, fmt: fmtCurrency },
      { key: 'payment_method',   label: 'Method' },
      { key: 'reference_number', label: 'Reference' },
    ],
  },
  ar_aging: {
    columns: [
      { key: 'client_name', label: 'Client' },
      { key: 'current',     label: '0–30d',  mono: true, fmt: fmtCurrency },
      { key: 'days31_60',   label: '31–60d', mono: true, fmt: fmtCurrency },
      { key: 'days61_90',   label: '61–90d', mono: true, fmt: fmtCurrency },
      { key: 'days90plus',  label: '90d+',   mono: true, fmt: fmtCurrency },
      { key: 'total',       label: 'Total',  mono: true, fmt: fmtCurrency },
    ],
  },
  client_balance: {
    columns: [
      { key: 'client_name',  label: 'Client' },
      { key: 'total_billed', label: 'Billed',      mono: true, fmt: fmtCurrency },
      { key: 'total_paid',   label: 'Paid',        mono: true, fmt: fmtCurrency },
      { key: 'outstanding',  label: 'Outstanding', mono: true, fmt: fmtCurrency },
    ],
  },
  engagement_status: {
    columns: [
      { key: 'status',        label: 'Status' },
      { key: 'count',         label: 'Count',         mono: true },
      { key: 'high_priority', label: 'High Priority', mono: true },
    ],
  },
  budget_variance: {
    columns: [
      { key: 'client_name',     label: 'Client' },
      { key: 'engagement_type', label: 'Type' },
      { key: 'budgeted_hours',  label: 'Budget Hrs', mono: true, fmt: fmtHours },
      { key: 'actual_hours',    label: 'Actual Hrs', mono: true, fmt: fmtHours },
      { key: 'hours_pct',       label: '% Used',     mono: true, fmt: v => v != null ? `${v}%` : '—' },
      { key: 'hours_variance',  label: 'Variance',   mono: true,
        fmt: v => v != null ? (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)) + 'h' : '—' },
    ],
  },
  overdue: {
    columns: [
      { key: 'client_name',     label: 'Client' },
      { key: 'engagement_type', label: 'Type' },
      { key: 'assigned_staff',  label: 'Staff' },
      { key: 'due_date',        label: 'Due Date',    mono: true },
      { key: 'days_overdue',    label: 'Days Overdue',mono: true, fmt: v => Math.floor(v) + 'd' },
      { key: 'status',          label: 'Status' },
    ],
  },
  staff_workload: {
    columns: [
      { key: 'assigned_staff',          label: 'Staff' },
      { key: 'active_engagement_count', label: 'Active Engs',     mono: true },
      { key: 'hours_this_period',       label: 'Hrs This Period', mono: true, fmt: fmtHours },
    ],
  },
  pay_period_summary: {
    columns: [
      { key: 'staff_member',    label: 'Staff' },
      { key: 'total_hours',     label: 'Total Hrs',    mono: true, fmt: fmtHours },
      { key: 'billable_hours',  label: 'Billable Hrs', mono: true, fmt: fmtHours },
      { key: 'billable_amount', label: 'Billable Amt', mono: true, fmt: fmtCurrency },
      { key: 'release_status',  label: 'Status' },
      { key: 'released_at',     label: 'Released At',
        fmt: v => v ? new Date(v).toLocaleDateString() : '—' },
    ],
  },
  unreleased_time: {
    columns: [
      { key: 'period_number',  label: 'Period',    mono: true, fmt: v => `P${v}` },
      { key: 'start_date',     label: 'Start',     mono: true },
      { key: 'end_date',       label: 'End',       mono: true },
      { key: 'staff_member',   label: 'Staff' },
      { key: 'total_hours',    label: 'Total Hrs', mono: true, fmt: fmtHours },
      { key: 'release_status', label: 'Status' },
    ],
  },
  wip: {
    columns: [
      { key: 'client_name',     label: 'Client' },
      { key: 'engagement_type', label: 'Type' },
      { key: 'assigned_staff',  label: 'Staff' },
      { key: 'hours',           label: 'WIP Hrs', mono: true, fmt: fmtHours },
      { key: 'amount',          label: 'WIP Amt', mono: true, fmt: fmtCurrency },
      { key: 'age_days',        label: 'Age',     mono: true, fmt: v => `${v}d` },
    ],
  },
}

export default function Reports() {
  const { user }   = useAuth()
  const isAdmin    = user?.role === 'admin'

  const [type,        setType]        = useState('staff_productivity')
  const [startDate,   setStartDate]   = useState(MONTH_START)
  const [endDate,     setEndDate]     = useState(TODAY)
  const [staffFilter, setStaffFilter] = useState('')
  const [typeFilter,  setTypeFilter]  = useState('')
  const [periodId,    setPeriodId]    = useState(null)
  const [periods,     setPeriods]     = useState([])
  const [result,      setResult]      = useState(null)
  const [loading,     setLoading]     = useState(false)

  const activeMeta = CATEGORIES.flatMap(c => c.reports).find(r => r.key === type)
  const usesPeriod = !!activeMeta?.periodPicker

  useEffect(() => {
    payPeriodsApi.list(new Date().getFullYear()).then(ps => {
      setPeriods(ps)
      if (!periodId && ps.length) {
        setPeriodId(ps.find(p => p.status === 'Open')?.id || ps[0]?.id)
      }
    }).catch(() => {})
  }, [])

  const run = async () => {
    setLoading(true)
    try {
      const params = { type }
      if (usesPeriod) {
        params.periodId = periodId
      } else {
        params.startDate = startDate
        params.endDate   = endDate
      }
      if (staffFilter) params.staff          = staffFilter
      if (typeFilter)  params.engagementType = typeFilter
      const r = await reportsApi.run(params)
      setResult(r)
    } finally {
      setLoading(false)
    }
  }

  const cfg = REPORT_CONFIGS[type]

  const handleExport = () => {
    if (!result?.data?.length) return
    const suffix = usesPeriod ? `period-${periodId}` : `${startDate}-${endDate}`
    exportCsv(cfg.columns, result.data, `${type}-${suffix}.csv`)
  }

  const inputCls = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'
  const visibleCategories = CATEGORIES.filter(c => !c.adminOnly || isAdmin)

  return (
    <div className="flex min-h-screen">
      {/* ── Left Sidebar ── */}
      <div className="w-48 flex-shrink-0 border-r border-gray-200 bg-white py-4">
        {visibleCategories.map(cat => (
          <div key={cat.key} className="mb-5">
            <p className="px-4 mb-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              {cat.label}
            </p>
            {cat.reports.filter(r => !r.adminOnly || isAdmin).map(r => (
              <button key={r.key}
                onClick={() => { setType(r.key); setResult(null) }}
                className={`w-full text-left px-4 py-1.5 text-sm transition-colors ${
                  type === r.key
                    ? 'bg-accent/10 text-accent font-semibold border-r-2 border-accent'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 p-6 overflow-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-4">
          {activeMeta?.label || 'Reports'}
        </h1>

        {/* Filter bar */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
          {usesPeriod ? (
            <div className="flex items-end gap-4 flex-wrap">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Pay Period</label>
                <select value={periodId || ''} onChange={e => setPeriodId(parseInt(e.target.value))} className={inputCls}>
                  {periods.map(p => (
                    <option key={p.id} value={p.id}>
                      P{p.period_number}: {p.start_date} – {p.end_date}
                    </option>
                  ))}
                </select>
              </div>
              {type === 'timesheet' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Staff Filter</label>
                  <input value={staffFilter} onChange={e => setStaffFilter(e.target.value)}
                    placeholder="Staff name…" className={inputCls} />
                </div>
              )}
              <div className="flex gap-2 ml-auto">
                <button onClick={run} disabled={loading || !periodId}
                  className="px-5 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {loading ? 'Running…' : 'Run Report'}
                </button>
                {result?.data?.length > 0 && (
                  <button onClick={handleExport}
                    className="px-4 py-2 border border-gray-200 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                    Export CSV
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Start Date</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls + ' w-full'} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">End Date</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls + ' w-full'} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Staff Filter</label>
                  <input value={staffFilter} onChange={e => setStaffFilter(e.target.value)}
                    placeholder="Staff name…" className={inputCls + ' w-full'} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Engagement Type</label>
                  <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={inputCls + ' w-full'}>
                    <option value="">All Types</option>
                    {ENG_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={run} disabled={loading}
                  className="px-5 py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {loading ? 'Running…' : 'Run Report'}
                </button>
                {result?.data?.length > 0 && (
                  <button onClick={handleExport}
                    className="px-4 py-2 border border-gray-200 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                    Export CSV
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {loading && <SkeletonTable rows={6} />}

        {!loading && result && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-200">
              <span className="font-semibold text-gray-900 text-sm">{activeMeta?.label}</span>
              {result.start && (
                <span className="text-xs text-gray-400 ml-3">
                  {result.start} — {result.end} · {result.data.length} rows
                </span>
              )}
              {!result.start && (
                <span className="text-xs text-gray-400 ml-3">{result.data.length} rows</span>
              )}
            </div>
            <ReportTable
              columns={cfg.columns}
              rows={result.data}
              rowClass={type === 'budget_variance' ? budgetRowClass : null}
            />
            {result.data.length > 0 &&
              cfg.columns.some(c => c.fmt === fmtCurrency || c.fmt === fmtHours) && (
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex flex-wrap gap-6">
                {cfg.columns.filter(c => c.fmt === fmtCurrency).map(c => (
                  <span key={c.key}>
                    <span className="font-medium">{c.label}:</span>{' '}
                    <span className="font-mono font-semibold text-gray-700">
                      {fmtCurrency(result.data.reduce((s, r) => s + (r[c.key] || 0), 0))}
                    </span>
                  </span>
                ))}
                {cfg.columns.filter(c => c.fmt === fmtHours).map(c => (
                  <span key={c.key}>
                    <span className="font-medium">{c.label}:</span>{' '}
                    <span className="font-mono font-semibold text-gray-700">
                      {fmtHours(result.data.reduce((s, r) => s + (r[c.key] || 0), 0))}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && !result && (
          <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
            <ChartBarPlaceholder />
            <p className="text-gray-400 mt-3 text-sm">Select a report and run it to see data.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ChartBarPlaceholder() {
  return (
    <div className="flex items-end justify-center gap-2 h-16">
      {[40, 65, 30, 80, 55, 70, 45].map((h, i) => (
        <div key={i} className="w-6 bg-gray-200 rounded-t" style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify the Reports page compiles**

```bash
cd client && npm run build 2>&1 | tail -10
```

Expected: No errors

---

### Task 6: Frontend — Dashboard Admin Alerts + Settings Staff Rates

**Files:**
- Modify: `client/src/pages/Dashboard.jsx`
- Modify: `client/src/pages/Settings.jsx`

- [ ] **Step 1: Add imports to Dashboard.jsx**

The current Dashboard.jsx imports are:
```js
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dashboardApi } from '../api/dashboard'
import StatCard from '../components/StatCard'
import { StatusBadge } from '../components/Badge'
import { ExclamationTriangleIcon, ClockIcon } from '@heroicons/react/24/outline'
```

Add two more:
```js
import { timeSummaryApi } from '../api/timeSummary'
import { useAuth } from '../context/AuthContext'
```

- [ ] **Step 2: Add AdminAlerts component to Dashboard.jsx**

Insert the `AdminAlerts` function before `export default function Dashboard()`:

```jsx
function AdminAlerts() {
  const [alerts, setAlerts] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    timeSummaryApi.alerts().then(setAlerts).catch(() => {})
  }, [])

  if (!alerts) return null

  const hasIssues =
    alerts.unreleasedPeriods.length > 0 ||
    alerts.missingStaff.length > 0 ||
    alerts.overBudget.length > 0

  if (!hasIssues) return null

  return (
    <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
      <h2 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
        <ExclamationTriangleIcon className="w-4 h-4 text-amber-600" />
        Admin Alerts
      </h2>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {alerts.missingStaff.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1.5">
              No Entries This Period
            </p>
            <div className="space-y-0.5">
              {alerts.missingStaff.map(s => (
                <p key={s} className="text-sm text-gray-700">{s}</p>
              ))}
            </div>
          </div>
        )}
        {alerts.unreleasedPeriods.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-1.5">
              Unreleased Past Periods
            </p>
            <div className="space-y-0.5">
              {alerts.unreleasedPeriods.map(p => (
                <p key={p.id} className="text-sm text-gray-700">
                  P{p.period_number}:{' '}
                  <span className="font-mono text-xs text-gray-500">
                    {p.start_date} – {p.end_date}
                  </span>
                </p>
              ))}
            </div>
          </div>
        )}
        {alerts.overBudget.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1.5">
              &gt;90% Budget Used
            </p>
            <div className="space-y-0.5">
              {alerts.overBudget.map(e => (
                <button key={e.id} onClick={() => navigate(`/engagements/${e.id}`)}
                  className="text-sm text-gray-700 hover:text-accent text-left w-full">
                  {e.client_name}
                  <span className={`ml-2 font-mono text-xs font-semibold ${e.pct_used >= 100 ? 'text-red-600' : 'text-amber-600'}`}>
                    {e.pct_used}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update Dashboard() function to use auth + render AdminAlerts**

In `export default function Dashboard()`, add the `useAuth` call and insert `<AdminAlerts />` after the `<h1>`:

```jsx
export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const { user } = useAuth()      // ADD THIS LINE
  const navigate = useNavigate()

  useEffect(() => { dashboardApi.stats().then(setStats).catch(console.error) }, [])

  if (!stats) return <div className="p-8 text-gray-400">Loading...</div>

  const totalAR = Object.values(stats.arBuckets || {}).reduce((a, b) => a + b, 0)

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {/* Admin-only alert strip */}
      {user?.role === 'admin' && <AdminAlerts />}

      {/* KPI strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {/* ... rest of Dashboard unchanged ... */}
```

Leave all existing content (KPI strip, AR Aging, Staff Utilization, Budget Alerts, Overdue, etc.) exactly as-is.

- [ ] **Step 4: Read the Staff Rates section of Settings.jsx**

Read `client/src/pages/Settings.jsx` from line 100 onward to find the Staff Rates tab. Look for the component that uses `staffRatesApi` and `BLANK_RATE`. Understand the current structure before editing.

- [ ] **Step 5: Enhance Staff Rates tab to show all users**

After reading Settings.jsx, find the Staff Rates tab section. The goal is to show a user-centric view: all active users from `usersApi.list()`, each with their current rate from `staffRatesApi.list()` (match on `staff_member === user.full_name`, pick the most recent `effective_date`).

Add a `StaffRatesUserView` component at the top of the Staff Rates tab section:

```jsx
function StaffRatesUserView({ rates, users, onEditUser }) {
  // For each user, find their most recent rate
  const userRates = users.filter(u => u.active).map(u => {
    const userRateRows = rates
      .filter(r => r.staff_member === u.full_name)
      .sort((a, b) => b.effective_date.localeCompare(a.effective_date))
    const current = userRateRows[0]
    return {
      user: u,
      rate: current?.hourly_rate ?? null,
      effective_date: current?.effective_date ?? null,
    }
  })

  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Current Rates by Staff</h3>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Name', 'Role', 'Current Rate', 'Effective Since', ''].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {userRates.map(({ user: u, rate, effective_date }) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{u.full_name}</td>
                <td className="px-4 py-3 text-gray-500 capitalize">{u.role}</td>
                <td className="px-4 py-3 font-mono font-semibold text-gray-800">
                  {rate != null ? `$${rate}/hr` : <span className="text-gray-400 font-normal">Not set</span>}
                </td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                  {effective_date || '—'}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onEditUser(u)}
                    className="text-xs font-semibold text-accent hover:text-blue-700"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

In the Staff Rates tab component, load users alongside rates:
```js
const [users, setUsers] = useState([])
useEffect(() => { usersApi.list().then(setUsers).catch(() => {}) }, [])
```

And render `<StaffRatesUserView rates={rates} users={users} onEditUser={u => setForm({ ...BLANK_RATE, staff_member: u.full_name })} />` at the top of the Staff Rates tab, above the existing add/list UI.

When `onEditUser` is called, pre-fill the rate entry form with `staff_member` set to the user's full name (read-only), so the admin just enters the new rate + effective date and submits.

- [ ] **Step 6: Verify the full app runs**

Start server and client:
```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

Open `http://localhost:5173`. Checklist:
- [ ] Log in as `carson` / `admin123`
- [ ] Dashboard shows amber "Admin Alerts" strip (if any alerts exist — P1–P9 are released, so `unreleasedPeriods` may be empty; `missingStaff` should include staff with no P10 entries)
- [ ] Reports page: left sidebar shows 4 categories, Payroll category visible to admin
- [ ] Run "Staff Productivity" → table renders with data
- [ ] Switch to "Timesheet" → period picker appears instead of date range → run → data shows
- [ ] Switch to "Collections" → run → shows per-payment rows (Date, Client, Amount, Method, Ref)
- [ ] Time Tracking → bottom "Time Release" tab → My Time shows own periods table
- [ ] As admin: All Staff toggle appears → switch to All Staff → select a period → release/unrelease buttons work
- [ ] Settings → Staff Rates → user-centric table shows all 4 users (Marcus, Sofia, Diego, Carson)

---

## Self-Review

**Spec coverage:**
- ✅ Time Release Tab: staff/manager sees own periods + Release My Time; admin gets My Time|All Staff toggle + period dropdown + per-user Release/Unrelease + bulk Release All
- ✅ Staff Rates: all users shown with current rate, edit inserts new history row
- ✅ Carson $0/hr seeded
- ✅ Reports: 14 report types in 4-category left sidebar (Payroll admin-only), period picker for timesheet/pay_period_summary, CSV export, sortable columns
- ✅ Admin Dashboard Alerts: missing time, unreleased periods, >90% budget — admin role check via `user?.role === 'admin'`
- ✅ collections fixed to per-payment rows (Date, Client, Amount, Method, Reference)
- ✅ time_by_service_code fixed to show `number — code — description` format
- ✅ invoice_register adds Status column

**Type consistency:**
- `payPeriodsApi.mySummary()` → `{id, period_number, user_status, total_hours, billable_hours, billable_amount}[]` — used in `mineWithHours.filter(p => p.total_hours > 0)`
- `payPeriodsApi.staffSummary(id)` → `{user_id, full_name, user_status, total_hours, billable_hours, billable_amount}[]` — keyed by `r.user_id` in the All Staff table
- `payPeriodsApi.releaseUser(periodId, userId)` matches `POST /:id/release-user/:userId` — distinct from `payPeriodsApi.releaseMyTime(id)` which is `POST /:id/release-my-time`
- `fmtH` and `fmt$` in BottomTabs are defined at the top of the file (lines 9–10) and available to `TimeReleaseTab`
- `useToast` returns `{ toast }` where `toast.success()` and `toast.error()` are methods — matches existing ToastContext pattern in the codebase
- `REPORT_CONFIGS.timesheet` uses `fmt: fmtHours` on `hours` and `billable_hours` keys — both returned by the backend `timesheet` case as numeric floats
- Reports `rowClass` prop on `ReportTable` accepts `(row) => string` or `null` — `budgetRowClass` has the right signature
