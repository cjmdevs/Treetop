# Time Tracking Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the time tracking section with a per-user experience: no staff selection, per-user pay period release, smarter service code search (by number/abbrev/description), reworked timesheet view (rows per engagement+code for the current user), and updated service code seed data.

**Architecture:** Add a `pay_period_user_status` table for per-user period release tracking independent of the global period status. Update the time entry POST to auto-assign `user_id` and `staff_member` from `req.user` (the JWT payload). Add a new `GET /api/time-summary/my-period/:periodId` endpoint that returns rows grouped by `engagement_id + service_code` for the authenticated user. Restructure the TimeTracking frontend to remove the filter sidebar, place the CalendarWidget inline beside the daily grid, and wire up a per-user Release button.

**Tech Stack:** Node.js/Express + better-sqlite3, React 18 + Tailwind CSS, JWT auth (`req.user = { id, username, full_name, role }` on every protected request)

---

## File Map

### Backend — Modified
| File | Change |
|---|---|
| `server/db/schema.js` | Add `pay_period_user_status` CREATE TABLE |
| `server/db/migrate.js` | Add migration guard for new table |
| `server/db/seed.js` | Replace 20 old service codes with spec's 18 codes; update time entry `service_code` references |
| `server/routes/payPeriods.js` | Add `GET /:id/my-status`, `POST /:id/release-my-time`, `GET /:id/all-user-statuses`, `POST /:id/unrelease-user/:userId` |
| `server/routes/timeEntries.js` | POST auto-assigns `user_id`+`staff_member` from `req.user`; PUT verifies caller is owner or admin |
| `server/routes/timeSummary.js` | Add `GET /my-period/:periodId` — per-engagement+code grid for current user |

### Frontend — Modified
| File | Change |
|---|---|
| `client/src/api/payPeriods.js` | Add `releaseMyTime(id)`, `getMyStatus(id)`, `getAllStatuses(id)`, `unreleaseUser(id, userId)` |
| `client/src/api/timeSummary.js` | Add `myPeriod(periodId)` |
| `client/src/pages/time/EntryForm.jsx` | Remove staff field; smart service code search (number + abbrev + description); rate from `user.default_hourly_rate` |
| `client/src/pages/time/DailyGrid.jsx` | Service code display "101 — Tax Preparation"; Internal badge; lock edit/delete when period released |
| `client/src/pages/time/TimesheetView.jsx` | Rows per engagement+service_code for current user; uses new `myPeriod` API |
| `client/src/pages/time/BottomTabs.jsx` | MTD tab always uses `user.full_name` from AuthContext (never a prop-passed override) |
| `client/src/pages/TimeTracking.jsx` | Remove `TimeFilterSidebar`; inline `CalendarWidget`; period badge with Release button; pass period lock state down |
| `client/src/pages/Settings.jsx` | Update `CATEGORIES` const to include `'Bookkeeping'`; service code number search |

---

## Task 1: DB Schema — pay_period_user_status

**Files:**
- Modify: `server/db/schema.js`
- Modify: `server/db/migrate.js`

- [ ] **Step 1: Add the table to schema.js**

Find the `CREATE TABLE IF NOT EXISTS pay_periods` block in `server/db/schema.js` and add the new table immediately after it (before `staff_rates`):

```js
    CREATE TABLE IF NOT EXISTS pay_period_user_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pay_period_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      released_at TEXT,
      UNIQUE(pay_period_id, user_id),
      FOREIGN KEY (pay_period_id) REFERENCES pay_periods(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
```

- [ ] **Step 2: Add migration guard to migrate.js**

Append to the body of the `migrate()` function in `server/db/migrate.js`:

```js
  // pay_period_user_status table (added 2026-05-21)
  const ppusTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pay_period_user_status'").get();
  if (!ppusTables) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pay_period_user_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pay_period_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'Open',
        released_at TEXT,
        UNIQUE(pay_period_id, user_id),
        FOREIGN KEY (pay_period_id) REFERENCES pay_periods(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  }
```

- [ ] **Step 3: Restart server, verify no crash**

```
cd server && npm run dev
```
Expected: server starts on port 3001 without error. The new table is created on first boot.

- [ ] **Step 4: Commit**

```bash
git add server/db/schema.js server/db/migrate.js
git commit -m "feat: add pay_period_user_status table for per-user period release"
```

---

## Task 2: Seed Data — New Service Codes

**Files:**
- Modify: `server/db/seed.js`

The existing 20 service codes must be replaced with the 18 codes from the spec. Time entries that reference old codes must be updated to reference new code abbreviations.

Old → New code mapping for time entries:
- `'TAX'` → `'TAX-PREP'`
- `'BKP'` → `'BOOKKEEPING'`
- `'AUD'` → `'AUDIT-FIELD'`
- `'MTG'` → `'ADMIN-COMM'`
- `'REV'` → `'TAX-REVIEW'`

- [ ] **Step 1: Replace the service codes block in seed.js**

Find the `// ── Service Codes` section in `server/db/seed.js` (lines ~110–136). Replace the entire `insertCode` forEach call with:

```js
// ── Service Codes ─────────────────────────────────────────────────────────────
const insertCode = db.prepare(`
  INSERT INTO service_codes (code, description, number, category, subcategory, default_rate, billable_default, active)
  VALUES (?, ?, ?, ?, ?, ?, 1, 1)
`);
[
  // [abbreviation, description, number, category, subcategory, default_rate]
  ['TAX-PREP',       'Tax Preparation',           '101', 'Tax',         null, 250],
  ['TAX-REVIEW',     'Tax Review',                '102', 'Tax',         null, 250],
  ['TAX-EXT',        'Tax Extension Filing',      '103', 'Tax',         null, 200],
  ['TAX-PLAN',       'Tax Planning',              '104', 'Tax',         null, 250],
  ['AUDIT-PREP',     'Audit Preparation',         '201', 'Audit',       null, 300],
  ['AUDIT-FIELD',    'Audit Fieldwork',           '202', 'Audit',       null, 300],
  ['AUDIT-REVIEW',   'Audit Review',              '203', 'Audit',       null, 250],
  ['BOOKKEEPING',    'General Bookkeeping',       '301', 'Bookkeeping', null, 150],
  ['BK-RECON',       'Bank Reconciliation',       '302', 'Bookkeeping', null, 150],
  ['BK-PAYROLL',     'Payroll Processing',        '303', 'Bookkeeping', null, 125],
  ['CONSULT',        'General Consultation',      '401', 'Advisory',    null, 250],
  ['ADV-ENTITY',     'Entity Structuring',        '402', 'Advisory',    null, 250],
  ['ADMIN',          'General Administrative',    '501', 'Admin',       null,   0],
  ['ADMIN-FILING',   'Filing & Organization',     '502', 'Admin',       null,   0],
  ['ADMIN-COMM',     'Client Communication',      '503', 'Admin',       null,   0],
  ['TRAINING',       'Staff Training',            '504', 'Admin',       null,   0],
  ['CORRESPONDENCE', 'Client Correspondence',     '601', 'Other',       null,   0],
  ['OTHER',          'Other',                     '999', 'Other',       null,   0],
].forEach(([code, desc, num, cat, sub, rate]) =>
  insertCode.run(code, desc, num, cat, sub, rate)
);
```

- [ ] **Step 2: Update time entry service_code references in seed.js**

In the `// ── Time Entries` section of seed.js (around line 89–98), update every `insertTimeEntry.run(...)` call to use new codes:

```js
insertTimeEntry.run(ids[0], 'Marcus Maurer', '2026-05-12', 3.5, 250, 'Reviewed prior year return',   1, 'TAX-PREP',     p10);
insertTimeEntry.run(ids[0], 'Marcus Maurer', '2026-05-13', 2.0, 250, 'Depreciation schedule prep',   1, 'TAX-PREP',     p10);
insertTimeEntry.run(ids[0], 'Marcus Maurer', '2026-05-14', 4.5, 250, 'Tax return preparation',       1, 'TAX-PREP',     p10);
insertTimeEntry.run(ids[0], 'Marcus Maurer', '2026-05-15', 8.0, 250, 'Final review and client call', 1, 'TAX-REVIEW',   p10);
insertTimeEntry.run(ids[1], 'Sofia Graf',    '2026-05-14', 1.5, 200, 'Initial client call',          1, 'ADMIN-COMM',   p10);
insertTimeEntry.run(ids[2], 'Diego Rivera',  '2026-05-13', 4.0, 150, 'Q1 bank reconciliation',       1, 'BOOKKEEPING',  p10);
insertTimeEntry.run(ids[2], 'Diego Rivera',  '2026-05-20', 3.0, 150, 'April categorization',         1, 'BOOKKEEPING',  p10);
insertTimeEntry.run(ids[3], 'Marcus Maurer', '2026-05-15', 5.0, 300, 'Audit fieldwork day 1',        1, 'AUDIT-FIELD',  p10);
insertTimeEntry.run(ids[3], 'Marcus Maurer', '2026-05-16', 6.0, 300, 'Audit fieldwork day 2',        1, 'AUDIT-FIELD',  p10);
```

- [ ] **Step 3: Reset and verify seed**

```bash
cd server && npm run seed
```
Expected: completes without error. Query confirms 18 service codes and 9 time entries exist.

- [ ] **Step 4: Commit**

```bash
git add server/db/seed.js
git commit -m "feat: replace service codes with spec's 18 codes (numbered 101-999)"
```

---

## Task 3: Backend — Per-User Period Release API

**Files:**
- Modify: `server/routes/payPeriods.js`

Add four new endpoints. All four live below the existing routes in `payPeriods.js`.

- [ ] **Step 1: Add GET /:id/my-status**

Append to `server/routes/payPeriods.js` before `module.exports`:

```js
// ── GET /api/pay-periods/:id/my-status ──────────────────────────────────────
// Returns this user's release status for the period (defaults Open if no row).
router.get('/:id/my-status', (req, res) => {
  const row = db.prepare(
    'SELECT * FROM pay_period_user_status WHERE pay_period_id = ? AND user_id = ?'
  ).get(req.params.id, req.user.id);
  res.json(row || { pay_period_id: parseInt(req.params.id), user_id: req.user.id, status: 'Open' });
});
```

- [ ] **Step 2: Add POST /:id/release-my-time**

```js
// ── POST /api/pay-periods/:id/release-my-time ────────────────────────────────
// Current user releases their own time for the period (status → Released).
router.post('/:id/release-my-time', (req, res) => {
  const period = db.prepare('SELECT * FROM pay_periods WHERE id = ?').get(req.params.id);
  if (!period) return res.status(404).json({ error: 'Pay period not found' });

  db.prepare(`
    INSERT INTO pay_period_user_status (pay_period_id, user_id, status, released_at)
    VALUES (?, ?, 'Released', ?)
    ON CONFLICT(pay_period_id, user_id) DO UPDATE SET status='Released', released_at=excluded.released_at
  `).run(req.params.id, req.user.id, new Date().toISOString());

  res.json({ pay_period_id: parseInt(req.params.id), user_id: req.user.id, status: 'Released' });
});
```

- [ ] **Step 3: Add GET /:id/all-user-statuses (admin/manager only)**

```js
// ── GET /api/pay-periods/:id/all-user-statuses ───────────────────────────────
// Returns release status for all users who have entries in this period.
// Admin/manager only.
router.get('/:id/all-user-statuses', (req, res) => {
  if (req.user.role === 'staff') return res.status(403).json({ error: 'Forbidden' });

  const usersWithEntries = db.prepare(`
    SELECT DISTINCT u.id, u.full_name
    FROM time_entries te
    JOIN users u ON u.id = te.user_id
    WHERE te.pay_period_id = ?
  `).all(req.params.id);

  const statuses = usersWithEntries.map(u => {
    const row = db.prepare(
      'SELECT status, released_at FROM pay_period_user_status WHERE pay_period_id = ? AND user_id = ?'
    ).get(req.params.id, u.id);
    return { user_id: u.id, full_name: u.full_name, status: row?.status || 'Open', released_at: row?.released_at || null };
  });

  res.json(statuses);
});
```

- [ ] **Step 4: Add POST /:id/unrelease-user/:userId (admin only)**

```js
// ── POST /api/pay-periods/:id/unrelease-user/:userId ─────────────────────────
// Admin reopens a user's released period so they can correct entries.
router.post('/:id/unrelease-user/:userId', (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  db.prepare(`
    INSERT INTO pay_period_user_status (pay_period_id, user_id, status, released_at)
    VALUES (?, ?, 'Open', NULL)
    ON CONFLICT(pay_period_id, user_id) DO UPDATE SET status='Open', released_at=NULL
  `).run(req.params.id, req.params.userId);

  res.json({ pay_period_id: parseInt(req.params.id), user_id: parseInt(req.params.userId), status: 'Open' });
});
```

- [ ] **Step 5: Restart server, smoke-test endpoints**

With server running and logged in as `carson` (admin), test:
```
# GET my-status for period 10 (id=10) — should return {status:'Open'}
# POST release-my-time — should return {status:'Released'}
# GET my-status again — should return {status:'Released'}
# GET all-user-statuses — should return array
```

- [ ] **Step 6: Commit**

```bash
git add server/routes/payPeriods.js
git commit -m "feat: per-user pay period release API (my-status, release-my-time, all-user-statuses, unrelease-user)"
```

---

## Task 4: Backend — Auto-Assign User from JWT in Time Entries

**Files:**
- Modify: `server/routes/timeEntries.js`

Currently POST accepts `staff_member` from the request body. Now it must use `req.user` instead so the server controls who gets credit.

- [ ] **Step 1: Update POST /api/time-entries**

Replace the POST handler in `server/routes/timeEntries.js`. The key change is line 3 of the destructure block — remove `staff_member` from body, use `req.user` instead:

```js
// ── POST /api/time-entries ────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const {
    engagement_id, date, hours,
    billing_rate, notes, billable, service_code,
    internal_memo, entry_status,
  } = req.body;

  // Always assigned to the authenticated user — body.staff_member is ignored
  const staff_member = req.user.full_name;
  const user_id      = req.user.id;

  const pay_period_id = findPeriodIdForDate(date);

  const result = db.prepare(`
    INSERT INTO time_entries
      (engagement_id, staff_member, user_id, date, hours, billing_rate, notes,
       billable, service_code, pay_period_id, internal_memo, entry_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    engagement_id, staff_member, user_id, date, hours,
    billing_rate  || null,
    notes         || null,
    billable ? 1 : 0,
    service_code  || null,
    pay_period_id,
    internal_memo ? 1 : 0,
    entry_status  || 'draft'
  );

  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(result.lastInsertRowid);
  log('time_entry_added', 'engagement', engagement_id,
      `${hours}h logged by ${staff_member}`, staff_member);
  runBudgetCheck(engagement_id);
  res.status(201).json(entry);
});
```

- [ ] **Step 2: Update GET /api/time-entries to default to current user for staff role**

In the GET handler, if `req.user.role === 'staff'` and no `staff_member` filter is provided, auto-filter to the current user. Find the GET handler and add this right before the `if (staff_member)` block:

```js
  // Staff always see only their own entries unless filtered otherwise (admin/manager can filter any)
  if (req.user.role === 'staff' && !staff_member) {
    query += ' AND t.staff_member = ?';
    params.push(req.user.full_name);
  }
```

- [ ] **Step 3: Restart + verify**

Log in as Diego Rivera (staff). POST a time entry — body should NOT need `staff_member`. Response entry should have `staff_member: 'Diego Rivera'` and `user_id: <Diego's id>`.

- [ ] **Step 4: Commit**

```bash
git add server/routes/timeEntries.js
git commit -m "feat: time entries POST auto-assigns user from JWT; staff GET filtered to own entries"
```

---

## Task 5: Backend — My-Period Timesheet Endpoint

**Files:**
- Modify: `server/routes/timeSummary.js`
- Modify: `client/src/api/timeSummary.js`

The existing `GET /api/time-summary/period/:periodId` returns rows grouped per staff member (for the manager view). We need a new endpoint that returns rows grouped per `engagement_id + service_code` for the **current user only**, so the TimesheetView can show an editable grid.

- [ ] **Step 1: Add GET /api/time-summary/my-period/:periodId**

Append to `server/routes/timeSummary.js` before `module.exports`:

```js
// ── GET /api/time-summary/my-period/:periodId ─────────────────────────────────
// Timesheet grid for the authenticated user: rows per engagement+service_code,
// columns per day. Used by the per-user TimesheetView.
router.get('/my-period/:periodId', (req, res) => {
  const period = db.prepare('SELECT * FROM pay_periods WHERE id = ?').get(req.params.periodId);
  if (!period) return res.status(404).json({ error: 'Pay period not found' });

  // Build date array for the period
  const dates = [];
  const cur   = new Date(period.start_date + 'T12:00:00');
  const endD  = new Date(period.end_date   + 'T12:00:00');
  while (cur <= endD) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }

  // Raw entries for this user in this period — one row per engagement+code+date
  const rawEntries = db.prepare(`
    SELECT te.engagement_id, te.service_code, te.date,
           SUM(te.hours)        AS hours,
           e.client_name, e.engagement_type, e.tax_year,
           sc.number AS sc_number, sc.description AS sc_description
    FROM time_entries te
    JOIN engagements e ON e.id = te.engagement_id
    LEFT JOIN service_codes sc ON sc.code = te.service_code
    WHERE te.user_id = ? AND te.pay_period_id = ?
    GROUP BY te.engagement_id, te.service_code, te.date
    ORDER BY te.engagement_id ASC, te.service_code ASC, te.date ASC
  `).all(req.user.id, period.id);

  // Group into rows: key = "engId::code"
  const rowMap = {};
  rawEntries.forEach(({ engagement_id, service_code, date, hours,
                        client_name, engagement_type, tax_year,
                        sc_number, sc_description }) => {
    const key = `${engagement_id}::${service_code || ''}`;
    if (!rowMap[key]) {
      rowMap[key] = {
        engagement_id, service_code: service_code || null,
        client_name, engagement_type, tax_year,
        sc_number, sc_description,
        daily: {}, total: 0,
      };
    }
    rowMap[key].daily[date]  = (rowMap[key].daily[date] || 0) + hours;
    rowMap[key].total       += hours;
  });

  // Column totals per day
  const colTotals = {};
  dates.forEach(d => { colTotals[d] = 0; });
  Object.values(rowMap).forEach(row => {
    dates.forEach(d => { colTotals[d] += row.daily[d] || 0; });
  });

  const grandTotal = Object.values(colTotals).reduce((s, v) => s + v, 0);

  res.json({
    period,
    dates,
    rows: Object.values(rowMap),
    colTotals,
    grandTotal,
  });
});
```

- [ ] **Step 2: Add myPeriod() to the client API**

In `client/src/api/timeSummary.js`, add `myPeriod` to the exported object:

```js
import { api } from './client'

export const timeSummaryApi = {
  mtd:        (staff)           => api.get(`/time-summary/mtd${staff ? `?staff=${encodeURIComponent(staff)}` : ''}`),
  period:     (periodId)        => api.get(`/time-summary/period/${periodId}`),
  myPeriod:   (periodId)        => api.get(`/time-summary/my-period/${periodId}`),
  alerts:     ()                => api.get('/time-summary/alerts'),
  dailyHours: (staff, from, to) =>
    api.get(`/time-summary/daily-hours?staff=${encodeURIComponent(staff)}&from=${from}&to=${to}`),
}
```

- [ ] **Step 3: Restart + verify**

Hit `GET /api/time-summary/my-period/10` while logged in as Marcus Maurer. Should return `rows` grouped by engagement+service_code with `daily` maps and `colTotals`.

- [ ] **Step 4: Commit**

```bash
git add server/routes/timeSummary.js client/src/api/timeSummary.js
git commit -m "feat: add my-period timesheet endpoint for per-user engagement+code grid"
```

---

## Task 6: Frontend API — payPeriods.js New Methods

**Files:**
- Modify: `client/src/api/payPeriods.js`

- [ ] **Step 1: Replace the file contents**

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
  // Per-user release
  getMyStatus:     (id)         => api.get(`/pay-periods/${id}/my-status`),
  releaseMyTime:   (id)         => api.post(`/pay-periods/${id}/release-my-time`, {}),
  getAllStatuses:   (id)         => api.get(`/pay-periods/${id}/all-user-statuses`),
  unreleaseUser:   (id, userId) => api.post(`/pay-periods/${id}/unrelease-user/${userId}`, {}),
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/api/payPeriods.js
git commit -m "feat: add per-user release methods to payPeriodsApi"
```

---

## Task 7: Frontend — EntryForm Overhaul

**Files:**
- Modify: `client/src/pages/time/EntryForm.jsx`

Key changes:
1. Remove the `staff` field — always use the logged-in user from `useAuth()`
2. Service code search works by **number**, **abbreviation (code)**, or **description**
3. Service code dropdown display: `"101 — TAX-PREP — Tax Preparation"`
4. Rate auto-filled from `user.default_hourly_rate` (from auth context) instead of `staffRates` lookup

- [ ] **Step 1: Replace EntryForm.jsx entirely**

```jsx
import { useEffect, useRef, useState } from 'react'
import { CheckIcon } from '@heroicons/react/24/solid'
import { timeEntriesApi } from '../../api/timeEntries'
import { useAuth } from '../../context/AuthContext'

const TODAY = () => new Date().toISOString().split('T')[0]

// Searchable select that matches by label substring — caller controls options/labels
function SearchSelect({ options, value, onChange, placeholder, disabled }) {
  const [open, setOpen] = useState(false)
  const [q, setQ]       = useState('')
  const wrapRef         = useRef(null)
  const chosen          = options.find(o => o.value === value)

  useEffect(() => {
    const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = q
    ? options.filter(o => o.searchText.toLowerCase().includes(q.toLowerCase()))
    : options

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setOpen(v => !v); setQ('') }}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-accent bg-white disabled:opacity-50 disabled:cursor-not-allowed truncate"
      >
        {chosen ? chosen.label : <span className="text-gray-400">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search..."
              className="w-full text-sm px-2 py-1 outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-sm text-gray-400">No results</p>
            )}
            {filtered.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); setQ('') }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${o.value === value ? 'text-accent font-medium' : 'text-gray-700'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const BLANK = (rate) => ({
  date:          TODAY(),
  engagement_id: '',
  service_code:  '',
  hours:         '',
  billing_rate:  rate ? String(rate) : '',
  notes:         '',
  billable:      true,
  internal_memo: false,
})

export default function EntryForm({
  period,
  prefill,
  engagements = [],
  serviceCodes = [],
  onSaved,
}) {
  const { user } = useAuth()
  const defaultRate = user?.default_hourly_rate || ''

  const [form, setForm]     = useState(() => BLANK(defaultRate))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  // Apply prefill when a timer stops and pre-fills the form
  useEffect(() => {
    if (prefill) {
      setForm(f => ({
        ...f,
        engagement_id: String(prefill.engagementId || ''),
        hours:         String(prefill.hours || ''),
      }))
    }
  }, [prefill])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // When service code changes, auto-fill rate from code's default_rate or fall back to user rate
  const handleServiceCode = code => {
    set('service_code', code)
    const sc = serviceCodes.find(c => c.code === code)
    if (sc?.default_rate != null && sc.default_rate > 0) {
      set('billing_rate', String(sc.default_rate))
    } else {
      set('billing_rate', defaultRate ? String(defaultRate) : '')
    }
  }

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.engagement_id || !form.hours) return
    setSaving(true)
    try {
      await timeEntriesApi.create({
        engagement_id: parseInt(form.engagement_id),
        date:          form.date,
        hours:         parseFloat(form.hours),
        billing_rate:  form.billing_rate ? parseFloat(form.billing_rate) : null,
        notes:         form.notes || null,
        billable:      form.billable,
        service_code:  form.service_code || null,
        internal_memo: form.internal_memo,
        entry_status:  'draft',
      })
      setForm(BLANK(defaultRate))
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  const periodMin = period?.start_date
  const periodMax = period?.end_date

  // Engagement options — searchable by client name + type + tax year
  const engOptions = engagements.map(e => ({
    value:      String(e.id),
    label:      `${e.client_name} — ${e.engagement_type}${e.tax_year ? ` (${e.tax_year})` : ''}`,
    searchText: `${e.client_name} ${e.engagement_type} ${e.tax_year || ''}`,
  }))

  // Service code options — searchable by number, abbreviation, or description
  const codeOptions = serviceCodes.map(c => ({
    value:      c.code,
    label:      `${c.number} — ${c.code} — ${c.description}`,
    searchText: `${c.number} ${c.code} ${c.description}`,
  }))

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wide'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <form onSubmit={handleSubmit}>
        {/* Row 1: date + engagement + service code */}
        <div className="grid grid-cols-12 gap-3 mb-3">
          <div className="col-span-2">
            <label className={labelCls}>Date</label>
            <input
              type="date"
              required
              value={form.date}
              min={periodMin}
              max={periodMax}
              onChange={e => set('date', e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="col-span-5">
            <label className={labelCls}>Client / Engagement *</label>
            <SearchSelect
              options={engOptions}
              value={form.engagement_id}
              onChange={v => set('engagement_id', v)}
              placeholder="Search client or engagement..."
            />
          </div>
          <div className="col-span-5">
            <label className={labelCls}>Service Code</label>
            <SearchSelect
              options={codeOptions}
              value={form.service_code}
              onChange={handleServiceCode}
              placeholder="Search by 101, TAX-PREP, or Tax Preparation..."
            />
          </div>
        </div>

        {/* Row 2: hours + rate + memo + billable + internal + save */}
        <div className="grid grid-cols-12 gap-3 items-end">
          <div className="col-span-1">
            <label className={labelCls}>Hours *</label>
            <input
              required
              type="number"
              step="0.25"
              min="0.25"
              value={form.hours}
              onChange={e => set('hours', e.target.value)}
              placeholder="1.5"
              className={inputCls}
            />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Rate ($/hr)</label>
            <input
              type="number"
              step="0.01"
              value={form.billing_rate}
              onChange={e => set('billing_rate', e.target.value)}
              placeholder="250"
              className={inputCls}
            />
          </div>
          <div className="col-span-6">
            <label className={labelCls}>Memo</label>
            <input
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Work description..."
              className={inputCls}
            />
          </div>
          <div className="col-span-2 flex items-center gap-4 pb-0.5">
            <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={form.billable}
                onChange={e => set('billable', e.target.checked)}
                className="rounded accent-[#1B4FD8]"
              />
              Billable
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer whitespace-nowrap" title="Internal memos never appear on client invoices">
              <input
                type="checkbox"
                checked={form.internal_memo}
                onChange={e => set('internal_memo', e.target.checked)}
                className="rounded accent-[#1B4FD8]"
              />
              Internal
            </label>
          </div>
          <div className="col-span-1">
            <button
              type="submit"
              disabled={saving || !form.engagement_id || !form.hours}
              className="w-full py-2 bg-accent text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
            >
              {saved ? <><CheckIcon className="w-4 h-4" /> Saved</> : saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

- Staff field is gone
- Service code search: type "101" → shows TAX-PREP; type "bookkeep" → shows BOOKKEEPING; type "AUDIT" → shows all audit codes
- Rate auto-fills when you select a code with a default_rate

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/time/EntryForm.jsx
git commit -m "feat: EntryForm removes staff field; smart service code search by number/abbrev/description"
```

---

## Task 8: Frontend — DailyGrid Improvements

**Files:**
- Modify: `client/src/pages/time/DailyGrid.jsx`

Changes:
1. Show service code as `"101 — Tax Preparation"` (number + description) using the `serviceCodes` prop
2. Show `[Internal]` badge in a styled chip (not just plain text)
3. Disable Edit/Delete when the period is released for this user (new `periodLocked` prop)

- [ ] **Step 1: Replace DailyGrid.jsx**

```jsx
import { useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, TrashIcon, PlayIcon } from '@heroicons/react/24/outline'
import { timeEntriesApi } from '../../api/timeEntries'
import { useTimer } from '../../context/TimerContext'

function fmt$(n) { return n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—' }
function fmtH(n) { return n != null ? `${Number(n).toFixed(2)}h` : '—' }

function prevDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]
}
function nextDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]
}
function displayDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

const thCls = 'py-2.5 px-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide'
const tdCls = 'py-2.5 px-3 text-sm text-gray-700'

export default function DailyGrid({ entries = [], selectedDate, onDateChange, onRefresh, periodLocked = false, serviceCodes = [] }) {
  const [deleting, setDeleting] = useState(null)
  const { startTimer, timers }  = useTimer()

  const today = new Date().toISOString().split('T')[0]
  const dayEntries = entries.filter(e => e.date === selectedDate)

  // Build lookup: code → { number, description }
  const codeMap = Object.fromEntries(serviceCodes.map(c => [c.code, c]))

  const handleDelete = async id => {
    if (!confirm('Delete this time entry?')) return
    setDeleting(id)
    try { await timeEntriesApi.delete(id); onRefresh?.() }
    finally { setDeleting(null) }
  }

  const handleStartTimer = e => {
    startTimer(e.engagement_id, `${e.client_name} — ${e.engagement_type}`)
  }

  const billable    = dayEntries.filter(e => e.billable)
  const nonBillable = dayEntries.filter(e => !e.billable)
  const billHrs     = billable.reduce((s, e) => s + e.hours, 0)
  const billAmt     = billable.reduce((s, e) => s + e.hours * (e.billing_rate || 0), 0)
  const nonBillHrs  = nonBillable.reduce((s, e) => s + e.hours, 0)
  const totalHrs    = dayEntries.reduce((s, e) => s + e.hours, 0)

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Date navigation */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={() => onDateChange(prevDay(selectedDate))}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
        </button>
        <h2 className="text-sm font-semibold text-gray-800 flex-1">{displayDate(selectedDate)}</h2>
        <button
          onClick={() => onDateChange(nextDay(selectedDate))}
          className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          <ChevronRightIcon className="w-4 h-4 text-gray-600" />
        </button>
        {selectedDate !== today && (
          <button
            onClick={() => onDateChange(today)}
            className="px-3 py-1.5 text-xs font-semibold text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors"
          >
            Today
          </button>
        )}
      </div>

      {/* Entries table */}
      <div className="bg-white rounded-xl border border-gray-200 flex-1 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className={thCls}>Client</th>
                <th className={thCls}>Engagement</th>
                <th className={thCls}>Service Code</th>
                <th className={thCls + ' text-right'}>Hours</th>
                <th className={thCls + ' text-right'}>Rate</th>
                <th className={thCls + ' text-right'}>Amount</th>
                <th className={thCls}>Memo</th>
                <th className={thCls} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dayEntries.map(e => {
                const amount    = e.hours * (e.billing_rate || 0)
                const isRunning = timers.some(t => t.engagementId === e.engagement_id)
                const sc        = codeMap[e.service_code]
                const scLabel   = sc
                  ? `${sc.number} — ${sc.description}`
                  : e.service_code || null

                return (
                  <tr key={e.id} className="hover:bg-gray-50 transition-colors group">
                    <td className={tdCls + ' font-medium text-gray-900'}>{e.client_name}</td>
                    <td className={tdCls}>
                      <span className="text-gray-700">{e.engagement_type}</span>
                      {e.tax_year && <span className="text-gray-400 ml-1">({e.tax_year})</span>}
                    </td>
                    <td className={tdCls}>
                      {scLabel
                        ? <span className="text-xs text-gray-700 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{scLabel}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className={tdCls + ' text-right font-mono font-semibold'}>{fmtH(e.hours)}</td>
                    <td className={tdCls + ' text-right font-mono text-gray-500'}>{e.billing_rate ? fmt$(e.billing_rate) : '—'}</td>
                    <td className={tdCls + ' text-right font-mono font-semibold text-gray-900'}>{e.billing_rate ? fmt$(amount) : '—'}</td>
                    <td className={tdCls + ' max-w-[200px]'}>
                      <div className="flex items-center gap-1.5">
                        {e.internal_memo ? (
                          <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded uppercase tracking-wide">Internal</span>
                        ) : null}
                        <span title={e.notes || ''} className="truncate text-gray-500 text-sm">
                          {e.notes || <span className="text-gray-300">—</span>}
                        </span>
                      </div>
                    </td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleStartTimer(e)}
                          disabled={isRunning}
                          title={isRunning ? 'Timer running' : 'Start timer'}
                          className="p-1 rounded hover:bg-accent/10 text-accent disabled:text-gray-300 disabled:cursor-not-allowed transition-colors"
                        >
                          <PlayIcon className="w-3.5 h-3.5" />
                        </button>
                        {!periodLocked && (
                          <>
                            <button
                              onClick={() => onEdit?.(e)}
                              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                            >
                              <PencilIcon className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(e.id)}
                              disabled={deleting === e.id}
                              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {dayEntries.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">
              No time entries for {selectedDate}
            </div>
          )}
        </div>
      </div>

      {/* Daily summary bar */}
      <div className="mt-2 flex items-center gap-6 px-4 py-2.5 bg-gray-50 rounded-xl border border-gray-200 text-sm">
        <div>
          <span className="text-gray-500">Billable: </span>
          <span className="font-semibold text-gray-900 font-mono">{fmtH(billHrs)}</span>
          <span className="text-gray-400 font-mono ml-1">/ {fmt$(billAmt)}</span>
        </div>
        <div className="w-px h-4 bg-gray-300" />
        <div>
          <span className="text-gray-500">Non-Billable: </span>
          <span className="font-semibold text-gray-900 font-mono">{fmtH(nonBillHrs)}</span>
        </div>
        <div className="w-px h-4 bg-gray-300" />
        <div>
          <span className="text-gray-500">Total: </span>
          <span className="font-bold text-accent font-mono">{fmtH(totalHrs)}</span>
        </div>
        {periodLocked && (
          <div className="ml-auto">
            <span className="text-xs text-green-600 font-semibold bg-green-50 border border-green-200 px-2 py-1 rounded-full">
              Period Released — Read Only
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

- Service code shows as "101 — Tax Preparation" not just "TAX-PREP"
- Internal entries show the orange "Internal" chip
- When `periodLocked=true`, Edit/Delete buttons are hidden

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/time/DailyGrid.jsx
git commit -m "feat: DailyGrid shows service code number+description; Internal badge; locks when period released"
```

---

## Task 9: Frontend — TimesheetView Rework

**Files:**
- Modify: `client/src/pages/time/TimesheetView.jsx`

The current implementation shows per-staff rows (which made sense for a manager view). The new design shows rows per `engagement + service_code` for the current user only, using the `myPeriod` endpoint from Task 5.

- [ ] **Step 1: Replace TimesheetView.jsx**

```jsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '@heroicons/react/24/outline'
import { timeSummaryApi } from '../../api/timeSummary'
import { timeEntriesApi } from '../../api/timeEntries'
import { payPeriodsApi } from '../../api/payPeriods'
import { useAuth } from '../../context/AuthContext'

function fmtH(n) { return n ? Number(n).toFixed(2) : '' }
function colLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return {
    day:  d.toLocaleDateString('en-US', { weekday: 'short' }),
    date: d.getDate(),
  }
}
function isWeekend(dateStr) {
  const d = new Date(dateStr + 'T12:00:00').getDay()
  return d === 0 || d === 6
}

// Inline-editable cell
function HoursCell({ hours, onSave, disabled }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(fmtH(hours))
  const inputRef              = useRef(null)

  useEffect(() => { setVal(fmtH(hours)) }, [hours])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const commit = () => {
    setEditing(false)
    const num   = parseFloat(val)
    const clean = isNaN(num) || num <= 0 ? 0 : Math.round(num * 4) / 4
    setVal(clean ? fmtH(clean) : '')
    if (clean !== (hours || 0)) onSave(clean)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { setEditing(false); setVal(fmtH(hours)) }
        }}
        className="w-full text-center text-sm font-mono bg-accent/5 border border-accent rounded outline-none py-1"
        style={{ minWidth: 52 }}
      />
    )
  }

  return (
    <button
      disabled={disabled}
      onClick={() => !disabled && setEditing(true)}
      className={`w-full text-center text-sm font-mono py-1.5 rounded transition-colors
        ${hours ? 'text-gray-900 font-semibold' : 'text-gray-300'}
        ${!disabled ? 'hover:bg-accent/5 cursor-pointer' : 'cursor-default'}
      `}
    >
      {hours ? fmtH(hours) : <span className="opacity-30 group-hover:opacity-100">·</span>}
    </button>
  )
}

// Add Row Modal — picks engagement + service code
function AddRowModal({ engagements, serviceCodes, onAdd, onClose }) {
  const [engId, setEngId] = useState('')
  const [code, setCode]   = useState('')
  const selCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-96">
        <h3 className="font-semibold text-gray-900 mb-4">Add Row to Timesheet</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Engagement</label>
            <select value={engId} onChange={e => setEngId(e.target.value)} className={selCls}>
              <option value="">Select engagement...</option>
              {engagements.map(e => (
                <option key={e.id} value={e.id}>{e.client_name} — {e.engagement_type}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Service Code</label>
            <select value={code} onChange={e => setCode(e.target.value)} className={selCls}>
              <option value="">No code</option>
              {serviceCodes.map(c => (
                <option key={c.id} value={c.code}>{c.number} — {c.code} — {c.description}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
          <button
            disabled={!engId}
            onClick={() => onAdd(parseInt(engId), code || null)}
            className="flex-1 py-2 text-sm font-semibold text-white bg-accent rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Add Row
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TimesheetView({ period, onPeriodChange, engagements, serviceCodes, periodLocked }) {
  const { user } = useAuth()
  const [grid, setGrid]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  // Extra rows added this session (engagement_id + service_code combos not yet in grid)
  const [extraRows, setExtraRows] = useState([])

  const loadGrid = useCallback(async () => {
    if (!period?.id) return
    setLoading(true)
    try { setGrid(await timeSummaryApi.myPeriod(period.id)) }
    finally { setLoading(false) }
  }, [period?.id])

  useEffect(() => { loadGrid(); setExtraRows([]) }, [loadGrid])

  if (!period) return <div className="p-8 text-gray-400 text-center">No pay period loaded.</div>
  if (loading) return <div className="p-8 text-gray-400 text-center">Loading timesheet…</div>

  const dates       = grid?.dates || []
  const fetchedRows = grid?.rows  || []
  const colTotals   = grid?.colTotals || {}
  const grandTotal  = grid?.grandTotal || 0

  // Merge fetched rows + extra (blank) rows added this session
  const seen = new Set(fetchedRows.map(r => `${r.engagement_id}::${r.service_code || ''}`))
  const allRows = [
    ...fetchedRows,
    ...extraRows.filter(er => !seen.has(`${er.engagement_id}::${er.service_code || ''}`)),
  ]

  const isLocked = periodLocked || period.status === 'Released' || period.status === 'Locked'

  const handleCellSave = async (row, date, hours) => {
    const engagement_id = row.engagement_id
    const service_code  = row.service_code || null
    if (!engagement_id) return
    if (hours > 0) {
      await timeEntriesApi.create({
        engagement_id,
        date,
        hours,
        service_code,
        billable:     true,
        billing_rate: user?.default_hourly_rate || null,
        entry_status: 'draft',
      })
    }
    loadGrid()
  }

  const handleAddRow = (engId, code) => {
    const k = `${engId}::${code || ''}`
    if (!seen.has(k) && !extraRows.find(r => r.engagement_id === engId && r.service_code === (code || null))) {
      const eng = engagements.find(e => e.id === engId)
      const sc  = serviceCodes.find(c => c.code === code)
      setExtraRows(r => [...r, {
        engagement_id: engId, service_code: code || null,
        client_name: eng?.client_name || '?', engagement_type: eng?.engagement_type || '?',
        tax_year: eng?.tax_year,
        sc_number: sc?.number, sc_description: sc?.description,
        daily: {}, total: 0,
      }])
    }
    setShowAdd(false)
  }

  const rowLabel = row => {
    const engPart  = `${row.client_name} — ${row.engagement_type}${row.tax_year ? ` (${row.tax_year})` : ''}`
    const codePart = row.sc_number
      ? `${row.sc_number} — ${row.sc_description || row.service_code}`
      : row.service_code || ''
    return codePart ? `${engPart} · ${codePart}` : engPart
  }

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Period navigation */}
      <div className="flex items-center gap-3 mb-3">
        <button onClick={() => onPeriodChange('prev')} className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
        </button>
        <div className="flex-1 text-center">
          <span className="text-sm font-semibold text-gray-800">
            Period {period.period_number}: {period.start_date} – {period.end_date}
          </span>
          <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium
            ${period.status === 'Released' ? 'bg-green-100 text-green-700' :
              period.status === 'Locked'   ? 'bg-red-100 text-red-700' :
              period.status === 'Submitted'? 'bg-yellow-100 text-yellow-700' :
                                             'bg-blue-100 text-blue-700'}`}>
            {period.status}
          </span>
        </div>
        <button onClick={() => onPeriodChange('current')} className="px-2.5 py-1.5 text-xs font-semibold text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors">
          Current
        </button>
        <button onClick={() => onPeriodChange('next')} className="p-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
          <ChevronRightIcon className="w-4 h-4 text-gray-600" />
        </button>
      </div>

      {/* Spreadsheet grid */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-auto flex-1">
        <table className="border-collapse" style={{ minWidth: '100%' }}>
          <thead>
            <tr className="bg-gray-50">
              <th className="sticky left-0 z-10 bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5 border-b border-r border-gray-200 min-w-[280px]">
                Engagement / Code
              </th>
              {dates.map(d => {
                const { day, date } = colLabel(d)
                return (
                  <th key={d} className={`text-center text-xs font-medium px-1 py-2 border-b border-gray-200 min-w-[52px] ${isWeekend(d) ? 'bg-gray-100 text-gray-400' : 'text-gray-600'}`}>
                    <div className="font-semibold">{day}</div>
                    <div className="text-gray-400">{date}</div>
                  </th>
                )
              })}
              <th className="text-right text-xs font-semibold text-gray-700 uppercase tracking-wide px-3 py-2.5 border-b border-l border-gray-200 min-w-[64px] bg-gray-50">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {allRows.length === 0 && (
              <tr>
                <td colSpan={dates.length + 2} className="text-center py-8 text-gray-400 text-sm">
                  No time logged this period. Use "Add Row" to start.
                </td>
              </tr>
            )}
            {allRows.map(row => (
              <tr key={`${row.engagement_id}::${row.service_code || ''}`} className="group hover:bg-gray-50/50 transition-colors">
                <td className="sticky left-0 z-10 bg-white group-hover:bg-gray-50/50 text-sm font-medium text-gray-900 px-4 py-1.5 border-r border-gray-100 truncate max-w-[280px]" title={rowLabel(row)}>
                  {rowLabel(row)}
                </td>
                {dates.map(d => (
                  <td key={d} className={`text-center p-0.5 ${isWeekend(d) ? 'bg-gray-50' : ''}`}>
                    <HoursCell
                      hours={row.daily?.[d] || 0}
                      disabled={isLocked}
                      onSave={h => handleCellSave(row, d, h)}
                    />
                  </td>
                ))}
                <td className="text-right text-sm font-bold font-mono text-gray-900 px-3 py-1.5 border-l border-gray-100 bg-gray-50/50">
                  {row.total ? fmtH(row.total) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-200">
              <td className="sticky left-0 z-10 bg-gray-50 text-xs font-bold text-gray-700 uppercase tracking-wide px-4 py-2.5 border-r border-gray-200">
                Daily Total
              </td>
              {dates.map(d => (
                <td key={d} className={`text-center text-sm font-bold font-mono text-gray-900 py-2.5 ${isWeekend(d) ? 'bg-gray-100' : ''}`}>
                  {colTotals[d] ? fmtH(colTotals[d]) : <span className="text-gray-300">—</span>}
                </td>
              ))}
              <td className="text-right text-sm font-bold font-mono text-accent px-3 py-2.5 border-l border-gray-200">
                {fmtH(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Add row */}
      <div className="mt-2 flex items-center justify-between">
        {!isLocked && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-sm text-accent font-medium hover:underline"
          >
            <PlusIcon className="w-4 h-4" /> Add Row
          </button>
        )}
        {grandTotal > 0 && (
          <p className="text-sm text-gray-500 ml-auto">
            Period total: <span className="font-bold font-mono text-gray-900">{fmtH(grandTotal)}h</span>
          </p>
        )}
      </div>

      {showAdd && (
        <AddRowModal
          engagements={engagements}
          serviceCodes={serviceCodes}
          onAdd={handleAddRow}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

Switch to Timesheet view. Rows should be per engagement+service_code (not per staff member). Period navigation should work. Clicking a cell should allow inline edit, which creates a time entry.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/time/TimesheetView.jsx
git commit -m "feat: TimesheetView rows per engagement+code for current user; uses myPeriod API"
```

---

## Task 10: Frontend — TimeTracking Page Restructure

**Files:**
- Modify: `client/src/pages/TimeTracking.jsx`

Major changes:
1. Remove `TimeFilterSidebar` and all filter state
2. Add `CalendarWidget` directly in the daily view (to the left of the DailyGrid)
3. Show period badge with a "Release My Time" button
4. Load `myStatus` on mount; pass `periodLocked` down to DailyGrid and TimesheetView
5. Admin/Manager: in bottom section, show per-user release statuses

- [ ] **Step 1: Replace TimeTracking.jsx**

```jsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { TableCellsIcon, CalendarDaysIcon, ClockIcon, LockClosedIcon, LockOpenIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../context/AuthContext'

import { timeEntriesApi }  from '../api/timeEntries'
import { engagementsApi }  from '../api/engagements'
import { serviceCodesApi } from '../api/serviceCodes'
import { payPeriodsApi }   from '../api/payPeriods'
import { timeSummaryApi }  from '../api/timeSummary'

import EntryForm      from './time/EntryForm'
import DailyGrid      from './time/DailyGrid'
import TimesheetView  from './time/TimesheetView'
import BottomTabs     from './time/BottomTabs'
import CalendarWidget from './time/CalendarWidget'

const TODAY = () => new Date().toISOString().split('T')[0]

function PeriodBadge({ period, myStatus, onRelease, onUnrelease, canUnrelease, releasing }) {
  if (!period) return null
  const isReleased = myStatus?.status === 'Released'
  const colors = {
    Open:      'bg-blue-50 text-blue-700 border-blue-200',
    Submitted: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    Released:  'bg-green-50 text-green-700 border-green-200',
    Locked:    'bg-red-50 text-red-700 border-red-200',
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${colors[period.status] || colors.Open}`}>
        <ClockIcon className="w-3 h-3" />
        Period {period.period_number}: {period.start_date} – {period.end_date}
        <span className="opacity-60">({period.status})</span>
      </span>
      {isReleased ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-1">
          <LockClosedIcon className="w-3 h-3" />
          My Time Released
        </span>
      ) : (
        <button
          onClick={onRelease}
          disabled={releasing}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border bg-white text-gray-700 border-gray-300 hover:border-green-400 hover:text-green-700 transition-colors disabled:opacity-50"
        >
          <LockOpenIcon className="w-3 h-3" />
          {releasing ? 'Releasing…' : 'Release My Time'}
        </button>
      )}
      {isReleased && canUnrelease && (
        <button
          onClick={onUnrelease}
          className="text-xs text-gray-400 hover:text-orange-500 underline transition-colors"
        >
          Unrelease
        </button>
      )}
    </div>
  )
}

export default function TimeTracking() {
  const location = useLocation()
  const { user, isAdmin, isManager } = useAuth()

  const [view, setView]           = useState('daily')
  const [selectedDate, setSelDate] = useState(TODAY())

  const [period,       setPeriod]      = useState(null)
  const [allPeriods,   setAllPeriods]  = useState([])
  const [engagements,  setEngagements] = useState([])
  const [serviceCodes, setCodes]       = useState([])
  const [entries,      setEntries]     = useState([])
  const [dailyHours,   setDailyHours]  = useState({})

  // Per-user release state
  const [myStatus,   setMyStatus]   = useState(null)
  const [releasing,  setReleasing]  = useState(false)

  // Prefill from timer stop
  const [prefill, setPrefill] = useState(null)
  useEffect(() => {
    if (location.state?.prefill) {
      setPrefill(location.state.prefill)
      window.history.replaceState({}, '')
    }
  }, [location.state])

  // Load static data
  useEffect(() => {
    engagementsApi.list().then(setEngagements)
    serviceCodesApi.list().then(setCodes)
    payPeriodsApi.list().then(setAllPeriods)
    payPeriodsApi.current().then(p => { if (p) setPeriod(p) })
  }, [])

  // Load my release status whenever period changes
  useEffect(() => {
    if (period?.id) {
      payPeriodsApi.getMyStatus(period.id).then(setMyStatus).catch(() => setMyStatus(null))
    }
  }, [period?.id])

  // Calendar highlighting: days in period with hours for current user
  useEffect(() => {
    if (!period || !user?.full_name) { setDailyHours({}); return }
    timeSummaryApi.dailyHours(user.full_name, period.start_date, period.end_date)
      .then(r => setDailyHours(r.daily || {}))
      .catch(() => setDailyHours({}))
  }, [period?.id, user?.full_name])

  // Load entries for daily grid (current user, selected period)
  const loadEntries = useCallback(() => {
    if (!period) return
    timeEntriesApi.list({ pay_period_id: period.id }).then(setEntries)
  }, [period?.id])

  useEffect(() => { loadEntries() }, [loadEntries])

  // Period navigation
  const periodIndexRef = useRef(null)
  useEffect(() => {
    if (period && allPeriods.length > 0) {
      periodIndexRef.current = allPeriods.findIndex(p => p.id === period.id)
    }
  }, [period, allPeriods])

  const handlePeriodChange = dir => {
    if (!allPeriods.length) return
    let idx = periodIndexRef.current ?? allPeriods.findIndex(p => p.id === period?.id)
    if (dir === 'prev')    idx = Math.max(0, idx - 1)
    else if (dir === 'next') idx = Math.min(allPeriods.length - 1, idx + 1)
    else {
      const today = TODAY()
      idx = allPeriods.findIndex(p => p.start_date <= today && p.end_date >= today)
      if (idx < 0) idx = periodIndexRef.current ?? 0
    }
    const p = allPeriods[idx]
    if (p) { setPeriod(p); periodIndexRef.current = idx }
  }

  const handleRelease = async () => {
    if (!period || !confirm(`Release your time for Period ${period.period_number}? You won't be able to add or edit entries until an admin unreleases the period.`)) return
    setReleasing(true)
    try {
      await payPeriodsApi.releaseMyTime(period.id)
      setMyStatus({ status: 'Released' })
    } finally {
      setReleasing(false)
    }
  }

  const handleUnrelease = async () => {
    if (!period || !confirm(`Unrelease your time for Period ${period.period_number}? (Admin action)`)) return
    // Admin unreleases their own account for simplicity here; full admin panel is in BottomTabs
    await payPeriodsApi.unreleaseUser(period.id, user.id)
    setMyStatus({ status: 'Open' })
  }

  const periodLocked = myStatus?.status === 'Released' || period?.status === 'Released' || period?.status === 'Locked'

  // Calendar highlights
  const calToday    = TODAY()
  const missingDates = Object.entries(dailyHours).filter(([d, h]) => d <= calToday && h === 0).map(([d]) => d)
  const lowDates     = Object.entries(dailyHours).filter(([d, h]) => d <= calToday && h > 0 && h < 4).map(([d]) => d)
  const entryDates   = [...new Set(entries.map(e => e.date))]

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">

      {/* Page header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900">Time Tracking</h1>
          <PeriodBadge
            period={period}
            myStatus={myStatus}
            onRelease={handleRelease}
            onUnrelease={handleUnrelease}
            canUnrelease={isAdmin}
            releasing={releasing}
          />
        </div>
        {/* View toggle */}
        <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
          <button
            onClick={() => setView('daily')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              view === 'daily' ? 'bg-white text-accent shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <CalendarDaysIcon className="w-4 h-4" />
            Daily
          </button>
          <button
            onClick={() => setView('timesheet')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              view === 'timesheet' ? 'bg-white text-accent shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <TableCellsIcon className="w-4 h-4" />
            Timesheet
          </button>
        </div>
      </div>

      {/* Main body */}
      <div className="flex-1 flex flex-col overflow-hidden p-5 gap-4">

        {/* Entry form — only in daily view, hidden when period is locked */}
        {view === 'daily' && !periodLocked && (
          <EntryForm
            period={period}
            prefill={prefill}
            engagements={engagements}
            serviceCodes={serviceCodes}
            onSaved={() => { setPrefill(null); loadEntries() }}
          />
        )}

        {view === 'daily' && periodLocked && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 text-sm text-green-700 font-medium flex items-center gap-2">
            <LockClosedIcon className="w-4 h-4 flex-shrink-0" />
            This period is released. Contact an admin to make corrections.
          </div>
        )}

        {/* Daily view: calendar + grid side by side */}
        {view === 'daily' && (
          <div className="flex gap-4 flex-1 overflow-hidden min-h-0">
            {/* Calendar sidebar */}
            <div className="flex-shrink-0 w-56">
              <CalendarWidget
                selectedDate={selectedDate}
                onSelect={date => setSelDate(date)}
                entryDates={entryDates}
                missingDates={missingDates}
                lowDates={lowDates}
              />
            </div>
            {/* Daily grid */}
            <DailyGrid
              entries={entries}
              selectedDate={selectedDate}
              onDateChange={setSelDate}
              onRefresh={loadEntries}
              periodLocked={periodLocked}
              serviceCodes={serviceCodes}
            />
          </div>
        )}

        {/* Timesheet view */}
        {view === 'timesheet' && (
          <TimesheetView
            period={period}
            onPeriodChange={handlePeriodChange}
            engagements={engagements}
            serviceCodes={serviceCodes}
            periodLocked={periodLocked}
          />
        )}
      </div>

      {/* Bottom tabs */}
      <BottomTabs period={period} />
    </div>
  )
}
```

- [ ] **Step 2: Verify in browser**

- Calendar appears on the left in daily view; clicking a date updates the grid
- Period badge shows "Release My Time" button
- Clicking "Release My Time" → confirmation → badge switches to "My Time Released"
- When released, entry form is hidden and entries are read-only
- Timesheet view still works

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/TimeTracking.jsx
git commit -m "feat: TimeTracking removes filter sidebar; inline calendar; per-user release button"
```

---

## Task 11: Frontend — BottomTabs MTD Locked to Current User

**Files:**
- Modify: `client/src/pages/time/BottomTabs.jsx`

The MTD tab should always show the logged-in user's data (never a prop-passed staff override). Remove the `currentStaff` prop dependency from `MtdTab` — use `useAuth()` instead.

- [ ] **Step 1: Update MtdTab to use auth user directly**

In `BottomTabs.jsx`, find the `MtdTab` component. Replace its `currentStaff` prop with a direct `useAuth()` call:

```jsx
// At top of BottomTabs.jsx, add:
import { useAuth } from '../../context/AuthContext'

// In MtdTab function signature, change from:
function MtdTab({ currentStaff }) {
// to:
function MtdTab() {
  const { user } = useAuth()
  const currentStaff = user?.full_name
```

Also update the `byStaff` section — since we're always showing one user, remove the "By Staff" conditional block. Find this block in `MtdTab`:
```jsx
        {/* By staff — only show when not filtered to one person */}
        {!currentStaff && data.byStaff.length > 0 && (
```
Remove the entire `{!currentStaff && data.byStaff.length > 0 && (...)}` block since MTD is now always for the current user only.

- [ ] **Step 2: Update BottomTabs shell component signature**

Change the shell `BottomTabs` component to not accept or use `currentStaff`:

```jsx
// From:
export default function BottomTabs({ period, currentStaff }) {
// To:
export default function BottomTabs({ period }) {
```

Update the tab renders inside `BottomTabs` — remove `currentStaff` from all tab usages:
```jsx
          {tab === 0 && <MtdTab />}
          {tab === 1 && <PeriodSummaryTab period={period} />}
          {tab === 2 && <TimeReleaseTab period={period} />}
          {tab === 3 && <AlertsTab period={period} />}
```

Also update `AlertsTab` similarly — it uses `currentStaff` to load daily hours. Change its prop to use `useAuth()`:
```jsx
function AlertsTab({ period }) {
  const { user } = useAuth()
  const currentStaff = user?.full_name
```

- [ ] **Step 3: Verify in browser**

MTD tab shows data for the logged-in user only. Logging in as different users shows their own MTD data.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/time/BottomTabs.jsx
git commit -m "feat: BottomTabs MTD/Alerts use auth user directly; remove currentStaff prop"
```

---

## Task 12: Frontend — Settings Service Codes Update

**Files:**
- Modify: `client/src/pages/Settings.jsx`

Two changes:
1. Update `CATEGORIES` const to include `'Bookkeeping'` (replacing `'Accounting'`)
2. Sort service codes by numeric `number` column in the admin table

- [ ] **Step 1: Update CATEGORIES**

Find this line in `Settings.jsx`:
```js
const CATEGORIES   = ['Tax', 'Audit', 'Accounting', 'Advisory', 'Admin', 'Other']
```
Replace with:
```js
const CATEGORIES   = ['Tax', 'Audit', 'Bookkeeping', 'Advisory', 'Admin', 'Other']
```

- [ ] **Step 2: Sort service codes by number in the table**

In the Settings component body, find where `serviceCodes` is displayed in the table. Before mapping, sort by number:

```jsx
const sortedCodes = [...serviceCodes].sort((a, b) => {
  const na = parseInt(a.number) || 9999
  const nb = parseInt(b.number) || 9999
  return na - nb
})
```

Then use `sortedCodes` in the table map instead of `serviceCodes` directly.

- [ ] **Step 3: Update the service code table to show the number column prominently**

In the service codes table header, ensure the "Number" column is first (after any row count). Find the table in Settings.jsx's service codes tab — the columns are rendered from the `BLANK_CODE` object keys. Add the number display in the row map:

For each service code row in the table, ensure it shows the number and formatted label. Find the `{codes.map(c => (` or similar pattern in the service codes section and update it to sort and display `c.number` prominently.

- [ ] **Step 4: Verify in browser**

In Settings > Service Codes, codes should be sorted 101, 102, 103... not alphabetically by abbreviation. Category dropdown includes "Bookkeeping".

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Settings.jsx
git commit -m "feat: Settings service codes sorted by number; Bookkeeping category added"
```

---

## Task 13: Timer Panel — Add "New Timer" Button

**Files:**
- Modify: `client/src/components/TimerPanel.jsx`

The spec says the timer panel should have a "New Timer" button that opens a quick picker for Client + Engagement.

- [ ] **Step 1: Update TimerPanel.jsx**

```jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StopIcon, ChevronUpIcon, ChevronDownIcon, PlusIcon } from '@heroicons/react/24/solid'
import { useTimer } from '../context/TimerContext'
import { engagementsApi } from '../api/engagements'
import { useEffect } from 'react'

function NewTimerModal({ onStart, onClose }) {
  const [engagements, setEngagements] = useState([])
  const [engId, setEngId]             = useState('')

  useEffect(() => { engagementsApi.list().then(setEngagements) }, [])

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
          className="flex-1 py-1.5 text-xs font-semibold text-white bg-accent rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          Start Timer
        </button>
      </div>
    </div>
  )
}

export default function TimerPanel() {
  const { timers, startTimer, stopTimer, getTimerElapsed, fmt } = useTimer()
  const [collapsed, setCollapsed] = useState(false)
  const [showNew, setShowNew]     = useState(false)
  const navigate                  = useNavigate()

  if (timers.length === 0 && !showNew) return (
    <button
      onClick={() => setShowNew(true)}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-1.5 bg-accent text-white text-xs font-semibold px-3 py-2 rounded-full shadow-lg hover:bg-blue-700 transition-colors"
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
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
          </span>
          <span className="text-sm font-semibold tracking-tight">
            {timers.length} Timer{timers.length > 1 ? 's' : ''} Running
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
              <div key={timer.engagementId} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate leading-tight">
                    {timer.engagementLabel}
                  </p>
                  <p className="font-mono text-sm font-bold text-accent tracking-widest mt-0.5">
                    {fmt(getTimerElapsed(timer.engagementId))}
                  </p>
                </div>
                <button
                  onClick={() => handleStop(timer)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  <StopIcon className="w-3 h-3" />
                  Stop &amp; Log
                </button>
              </div>
            ))}
          </div>
          {/* New timer toggle */}
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

- [ ] **Step 2: Verify in browser**

- When no timers running: a small "Start Timer" pill appears in bottom-right
- Clicking it opens the engagement picker inline
- When timers are running: the existing panel shows, plus a "New Timer" button at the bottom
- Starting a new timer adds it to the list

- [ ] **Step 3: Commit**

```bash
git add client/src/components/TimerPanel.jsx
git commit -m "feat: TimerPanel adds New Timer button with engagement picker; shows pill when no timers"
```

---

## Self-Review

**Spec coverage check:**

| Spec Requirement | Task |
|---|---|
| `pay_period_user_status` table | Task 1 |
| Auto-generate 26 pay periods (already exists) | ✓ Existing |
| Show current period label at top | Task 10 (PeriodBadge) |
| Entry form: no staff selection | Task 7 |
| Entry form: service code search by number/abbrev/description | Task 7 |
| Entry form: rate from user's default | Task 7 |
| Entry form: Internal memo checkbox | Task 7 (preserved) |
| Date picker restricted to period dates | Task 7 (min/max) |
| Daily grid: service code "101 — Tax Prep" format | Task 8 |
| Daily grid: Internal badge | Task 8 |
| Daily grid: edit/delete locked when released | Task 8, 10 |
| Daily summary bar | Task 8 (preserved) |
| Calendar widget beside grid | Task 10 |
| Date navigation (prev/next/today) | Task 8 (preserved) |
| Timesheet view: rows per eng+code | Task 9 |
| Timesheet view: 14 day columns | Task 9 |
| Timesheet view: period navigation | Task 9 |
| Timesheet view: Add Row | Task 9 |
| Release My Time button | Task 10 |
| Admin Unrelease | Task 3, 6, 10 |
| Multi-timer support (existing) | Task 13 (adds New Timer button) |
| Timer panel: New Timer button | Task 13 |
| Timer panel: Stop & Log pre-fills form | ✓ Existing |
| Timers persist via localStorage | ✓ Existing |
| Service codes: 18 new codes seeded | Task 2 |
| Service codes: CRUD in Settings | ✓ Existing (Task 12 updates sort+category) |
| MTD Hours tab: current user only | Task 11 |
| MTD by category breakdown | ✓ Existing |

**Placeholder scan:** No TBD, TODO, or "similar to Task N" placeholders found.

**Type consistency:**
- `myStatus.status` is `'Open'` or `'Released'` — used consistently in Tasks 3, 6, 10
- `periodLocked` is boolean — passed as prop in Tasks 8, 9, 10 consistently
- `timeSummaryApi.myPeriod(id)` returns `{ period, dates, rows, colTotals, grandTotal }` — used in Task 9 with same field names
- `rows[n]` from `myPeriod` has `{ engagement_id, service_code, client_name, engagement_type, tax_year, sc_number, sc_description, daily, total }` — used in Task 9 `rowLabel()` and `handleCellSave()` consistently
- `payPeriodsApi.releaseMyTime(id)`, `getMyStatus(id)`, `getAllStatuses(id)`, `unreleaseUser(id, userId)` — added in Task 6, called in Task 10

**Gap check:**
- The `TimeReleaseTab` in `BottomTabs.jsx` still shows the old per-staff release UI. After this overhaul, it should show the per-user statuses from `getAllStatuses()`. This is acceptable for Part 1 — the admin can use the unrelease button on the period badge. The BottomTabs `TimeReleaseTab` can be updated in a follow-up if needed.
- The `onEdit` prop passed to `DailyGrid` is referenced in the old code but no edit modal exists — this was pre-existing and unchanged.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-21-time-tracking-overhaul.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks sequentially in this session with checkpoints

Which approach?
