# Time Reports Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the Time Tracking bottom tabs with full spec-compliant MTD/period summaries, per-staff time release workflow, calendar date highlighting for missing/low hours, and corrected staff billing rates.

**Architecture:** Backend adds 2 new API endpoints (daily-hours, submit/release per period), enhances 2 existing ones (mtd byCategory, period billable totals). Frontend updates flow top-down: CalendarWidget gains missingDates/lowDates props → TimeFilterSidebar passes them through → TimeTracking.jsx fetches daily hours → BottomTabs.jsx gets currentStaff prop for staff-scoped views.

**Tech Stack:** Node.js/Express/better-sqlite3 (server), React 18 + Tailwind CSS (client), inline SVG for bar chart, no new npm deps.

---

## Gap Analysis (what's missing vs. spec)

| Spec Requirement | Status |
|---|---|
| MTD: byCategory breakdown | ❌ Missing |
| MTD: 160h progress bar | ❌ Missing |
| MTD: billable amount | ❌ Missing |
| Period Summary: totals header | ❌ Missing |
| Period Summary: per-day bar chart | ❌ Missing |
| Time Release: per-staff rows | ❌ Missing (shows unreleased periods only) |
| Time Release: Submit/Release per staff | ❌ Missing |
| Time Release: bulk submit/release | ❌ Missing |
| Alerts: missing days (0h on calendar) | ❌ Missing |
| Alerts: low days (<4h on calendar) | ❌ Missing |
| Calendar: red/yellow highlighting | ❌ Missing |
| Staff rates: $350/$275/$175 | ❌ Wrong (currently $250/$200/$150) |

---

## File Map

| File | Change |
|---|---|
| `server/routes/timeSummary.js` | Enhance `/mtd` + `/period/:id`; add `/daily-hours` |
| `server/routes/payPeriods.js` | Add `POST /:id/submit` and `POST /:id/release` |
| `server/db/seed.js` | Update 3 staff rate rows |
| `client/src/api/timeSummary.js` | Add `dailyHours()` |
| `client/src/api/payPeriods.js` | Add `submit()` and `release()` |
| `client/src/pages/time/CalendarWidget.jsx` | Add `missingDates` + `lowDates` props |
| `client/src/pages/time/TimeFilterSidebar.jsx` | Pass new props to CalendarWidget |
| `client/src/pages/TimeTracking.jsx` | Fetch daily hours; pass to sidebar + BottomTabs |
| `client/src/pages/time/BottomTabs.jsx` | Full rewrite of all 4 tab components |

---

## Task 1: Backend — enhanced timeSummary endpoints + submit/release

**Files:**
- Modify: `server/routes/timeSummary.js`
- Modify: `server/routes/payPeriods.js`
- Modify: `server/db/seed.js`

- [ ] **Step 1: Enhance `/mtd` with byCategory + billable_amount**

Replace the `/mtd` route body in `server/routes/timeSummary.js`:

```js
router.get('/mtd', (req, res) => {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const start = `${year}-${month}-01`;
  const end   = now.toISOString().split('T')[0];

  const { staff } = req.query;

  const whereClause = staff
    ? 'WHERE date >= ? AND date <= ? AND staff_member = ?'
    : 'WHERE date >= ? AND date <= ?';
  const args = staff ? [start, end, staff] : [start, end];

  const byStaff = db.prepare(`
    SELECT staff_member,
           SUM(hours)                                                          AS total_hours,
           SUM(CASE WHEN billable=1 THEN hours ELSE 0 END)                    AS billable_hours,
           SUM(CASE WHEN billable=0 THEN hours ELSE 0 END)                    AS nonbillable_hours,
           SUM(CASE WHEN billable=1 THEN hours * billing_rate ELSE 0 END)     AS billable_amount,
           COUNT(*)                                                            AS entry_count
    FROM time_entries
    ${whereClause}
    GROUP BY staff_member
    ORDER BY total_hours DESC
  `).all(...args);

  // Breakdown by service code category (join service_codes for category)
  const byCategory = db.prepare(`
    SELECT COALESCE(sc.category, 'Uncategorized')                             AS category,
           SUM(t.hours)                                                        AS total_hours,
           SUM(CASE WHEN t.billable=1 THEN t.hours ELSE 0 END)                AS billable_hours,
           SUM(CASE WHEN t.billable=1 THEN t.hours * t.billing_rate ELSE 0 END) AS billable_amount
    FROM time_entries t
    LEFT JOIN service_codes sc ON sc.code = t.service_code
    ${whereClause}
    GROUP BY COALESCE(sc.category, 'Uncategorized')
    ORDER BY total_hours DESC
  `).all(...args);

  const totals = db.prepare(`
    SELECT SUM(hours)                                                          AS total_hours,
           SUM(CASE WHEN billable=1 THEN hours ELSE 0 END)                    AS billable_hours,
           SUM(CASE WHEN billable=0 THEN hours ELSE 0 END)                    AS nonbillable_hours,
           SUM(CASE WHEN billable=1 THEN hours * billing_rate ELSE 0 END)     AS billable_amount
    FROM time_entries
    ${whereClause}
  `).get(...args);

  res.json({ period: { start, end }, totals, byStaff, byCategory });
});
```

- [ ] **Step 2: Enhance `/period/:id` with billable totals + per-staff entry status**

Replace the `/period/:periodId` route in `server/routes/timeSummary.js` (keep existing logic, add):

```js
router.get('/period/:periodId', (req, res) => {
  const period = db.prepare('SELECT * FROM pay_periods WHERE id = ?').get(req.params.periodId);
  if (!period) return res.status(404).json({ error: 'Pay period not found' });

  const dates = [];
  const cur   = new Date(period.start_date + 'T12:00:00');
  const endD  = new Date(period.end_date   + 'T12:00:00');
  while (cur <= endD) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }

  const entries = db.prepare(`
    SELECT t.staff_member, t.date,
           SUM(t.hours)                                                         AS hours,
           SUM(CASE WHEN t.billable=1 THEN t.hours ELSE 0 END)                 AS billable_hours,
           SUM(CASE WHEN t.billable=1 THEN t.hours * t.billing_rate ELSE 0 END) AS billable_amount
    FROM time_entries t
    WHERE t.pay_period_id = ?
    GROUP BY t.staff_member, t.date
    ORDER BY t.staff_member ASC, t.date ASC
  `).all(period.id);

  const staffMap = {};
  entries.forEach(({ staff_member, date, hours, billable_hours, billable_amount }) => {
    if (!staffMap[staff_member]) {
      staffMap[staff_member] = {
        staff_member, daily: {}, total: 0,
        billable_hours: 0, billable_amount: 0,
      };
    }
    staffMap[staff_member].daily[date] = (staffMap[staff_member].daily[date] || 0) + hours;
    staffMap[staff_member].total            += hours;
    staffMap[staff_member].billable_hours   += billable_hours;
    staffMap[staff_member].billable_amount  += billable_amount;
  });

  // Per-staff entry status (worst-case: if any draft → Open, all submitted → Submitted, etc.)
  const statusRows = db.prepare(`
    SELECT staff_member,
           MAX(CASE entry_status WHEN 'draft' THEN 1 WHEN 'submitted' THEN 2 WHEN 'released' THEN 3 ELSE 0 END) AS max_status,
           MIN(CASE entry_status WHEN 'draft' THEN 1 WHEN 'submitted' THEN 2 WHEN 'released' THEN 3 ELSE 0 END) AS min_status
    FROM time_entries
    WHERE pay_period_id = ?
    GROUP BY staff_member
  `).all(period.id);

  const STATUS_MAP = { 1: 'Open', 2: 'Submitted', 3: 'Released' };
  statusRows.forEach(({ staff_member, max_status, min_status }) => {
    if (staffMap[staff_member]) {
      // If any entry is still at lower status, show the lower one
      staffMap[staff_member].entry_status = STATUS_MAP[min_status] || 'Open';
    }
  });

  const colTotals = {};
  dates.forEach(d => { colTotals[d] = 0; });
  Object.values(staffMap).forEach(row => {
    dates.forEach(d => { colTotals[d] = (colTotals[d] || 0) + (row.daily[d] || 0); });
  });

  // Period-level totals
  const periodTotals = db.prepare(`
    SELECT SUM(hours)                                                            AS total_hours,
           SUM(CASE WHEN billable=1 THEN hours ELSE 0 END)                      AS billable_hours,
           SUM(CASE WHEN billable=0 THEN hours ELSE 0 END)                      AS nonbillable_hours,
           SUM(CASE WHEN billable=1 THEN hours * billing_rate ELSE 0 END)       AS billable_amount
    FROM time_entries WHERE pay_period_id = ?
  `).get(period.id);

  res.json({
    period, dates,
    staffRows:    Object.values(staffMap),
    colTotals,
    periodTotals: periodTotals || { total_hours: 0, billable_hours: 0, nonbillable_hours: 0, billable_amount: 0 },
  });
});
```

- [ ] **Step 3: Add `/daily-hours` endpoint to timeSummary.js**

Append to `server/routes/timeSummary.js` before `module.exports`:

```js
// ── GET /api/time-summary/daily-hours ─────────────────────────────────────────
// Returns per-day total hours for a staff member in a date range.
// Query params: staff (required), from (YYYY-MM-DD), to (YYYY-MM-DD)
// Response: { daily: { "2026-05-11": 3.5, "2026-05-12": 0, ... } }
router.get('/daily-hours', (req, res) => {
  const { staff, from, to } = req.query;
  if (!staff || !from || !to)
    return res.status(400).json({ error: 'staff, from, and to are required' });

  const rows = db.prepare(`
    SELECT date, SUM(hours) AS hours
    FROM time_entries
    WHERE staff_member = ? AND date >= ? AND date <= ?
    GROUP BY date
  `).all(staff, from, to);

  // Build a dense map including zero-hour days for every day in range
  const daily = {};
  const cur   = new Date(from + 'T12:00:00');
  const endD  = new Date(to   + 'T12:00:00');
  while (cur <= endD) {
    daily[cur.toISOString().split('T')[0]] = 0;
    cur.setDate(cur.getDate() + 1);
  }
  rows.forEach(r => { daily[r.date] = r.hours; });

  res.json({ staff, from, to, daily });
});
```

- [ ] **Step 4: Add submit + release endpoints to payPeriods.js**

Append to `server/routes/payPeriods.js` before `module.exports`:

```js
// ── POST /api/pay-periods/:id/submit ─────────────────────────────────────────
// Bulk-sets entry_status = 'submitted' for all entries in the period.
// Optional body: { staff_member } to limit to one person.
router.post('/:id/submit', (req, res) => {
  const { staff_member } = req.body || {};
  const period = db.prepare('SELECT * FROM pay_periods WHERE id = ?').get(req.params.id);
  if (!period) return res.status(404).json({ error: 'Pay period not found' });

  let sql  = "UPDATE time_entries SET entry_status='submitted' WHERE pay_period_id=? AND entry_status='draft'";
  const args = [period.id];
  if (staff_member) { sql += ' AND staff_member=?'; args.push(staff_member); }

  const r = db.prepare(sql).run(...args);
  res.json({ updated: r.changes, period_id: period.id, staff_member: staff_member || null });
});

// ── POST /api/pay-periods/:id/release ────────────────────────────────────────
// Bulk-sets entry_status = 'released' for submitted entries in the period.
// Optional body: { staff_member, released_by }
router.post('/:id/release', (req, res) => {
  const { staff_member, released_by } = req.body || {};
  const period = db.prepare('SELECT * FROM pay_periods WHERE id = ?').get(req.params.id);
  if (!period) return res.status(404).json({ error: 'Pay period not found' });

  let sql  = "UPDATE time_entries SET entry_status='released' WHERE pay_period_id=? AND entry_status IN ('draft','submitted')";
  const args = [period.id];
  if (staff_member) { sql += ' AND staff_member=?'; args.push(staff_member); }

  const r = db.prepare(sql).run(...args);

  // If all entries in the period are now released, auto-update period status
  const remaining = db.prepare(
    "SELECT COUNT(*) AS cnt FROM time_entries WHERE pay_period_id=? AND entry_status != 'released'"
  ).get(period.id);
  if (remaining.cnt === 0 && r.changes > 0) {
    db.prepare("UPDATE pay_periods SET status='Released', released_by=?, released_at=? WHERE id=?")
      .run(released_by || 'Manager', new Date().toISOString(), period.id);
  }

  res.json({ updated: r.changes, period_id: period.id, staff_member: staff_member || null });
});
```

- [ ] **Step 5: Fix staff rates in seed.js**

In `server/db/seed.js`, replace the three staff rate inserts:

```js
[
  ['Marcus Maurer', 350, '2026-01-01'],
  ['Sofia Graf',    275, '2026-01-01'],
  ['Diego Rivera',  175, '2026-01-01'],
].forEach(args => insertRate.run(...args));
```

- [ ] **Step 6: Verify server starts**

```bash
cd "C:\Users\carso\Claude Projects\mgrcpas\server"
node app.js
```

Expected: `Server listening on port 3001` with no errors.

- [ ] **Step 7: Commit**

```bash
git add server/routes/timeSummary.js server/routes/payPeriods.js server/db/seed.js
git commit -m "feat: enhance timeSummary API with byCategory/daily-hours, add submit/release endpoints"
```

---

## Task 2: API client layer updates

**Files:**
- Modify: `client/src/api/timeSummary.js`
- Modify: `client/src/api/payPeriods.js`

- [ ] **Step 1: Update timeSummary.js**

Replace `client/src/api/timeSummary.js` with:

```js
import { api } from './client'

export const timeSummaryApi = {
  mtd:         (staff)             => api.get(`/time-summary/mtd${staff ? `?staff=${encodeURIComponent(staff)}` : ''}`),
  period:      (periodId)          => api.get(`/time-summary/period/${periodId}`),
  alerts:      ()                  => api.get('/time-summary/alerts'),
  dailyHours:  (staff, from, to)   =>
    api.get(`/time-summary/daily-hours?staff=${encodeURIComponent(staff)}&from=${from}&to=${to}`),
}
```

- [ ] **Step 2: Update payPeriods.js**

Replace `client/src/api/payPeriods.js` with:

```js
import { api } from './client'

export const payPeriodsApi = {
  list:      (year)                    => api.get(`/pay-periods${year ? `?year=${year}` : ''}`),
  current:   ()                        => api.get('/pay-periods/current'),
  get:       (id)                      => api.get(`/pay-periods/${id}`),
  generate:  (year)                    => api.post('/pay-periods/generate', { year }),
  setStatus: (id, status, released_by) => api.patch(`/pay-periods/${id}/status`, { status, released_by }),
  submit:    (id, staff_member)        => api.post(`/pay-periods/${id}/submit`,  { staff_member }),
  release:   (id, staff_member, released_by) =>
    api.post(`/pay-periods/${id}/release`, { staff_member, released_by }),
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/api/timeSummary.js client/src/api/payPeriods.js
git commit -m "feat: add dailyHours, submit, release to API client"
```

---

## Task 3: CalendarWidget — missing/low date highlighting

**Files:**
- Modify: `client/src/pages/time/CalendarWidget.jsx`
- Modify: `client/src/pages/time/TimeFilterSidebar.jsx`

- [ ] **Step 1: Add missingDates + lowDates props to CalendarWidget**

Replace `client/src/pages/time/CalendarWidget.jsx` with:

```jsx
import { useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

const DAYS   = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

function pad(n) { return String(n).padStart(2, '0') }
function toStr(y, m, d) { return `${y}-${pad(m+1)}-${pad(d)}` }

export default function CalendarWidget({
  selectedDate,
  onSelect,
  entryDates   = [],
  missingDates = [],   // days with 0h (highlight red)
  lowDates     = [],   // days with 0–4h (highlight yellow)
}) {
  const today    = new Date()
  const selParts = selectedDate ? selectedDate.split('-').map(Number) : null
  const initYear  = selParts ? selParts[0] : today.getFullYear()
  const initMonth = selParts ? selParts[1] - 1 : today.getMonth()

  const [viewYear,  setViewYear]  = useState(initYear)
  const [viewMonth, setViewMonth] = useState(initMonth)

  const entrySet   = new Set(entryDates)
  const missingSet = new Set(missingDates)
  const lowSet     = new Set(lowDates)

  const firstDay    = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  const prev = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const next = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const isToday   = d => d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()
  const isSel     = d => d && selParts && d === selParts[2] && viewMonth === selParts[1]-1 && viewYear === selParts[0]
  const hasEntry  = d => d && entrySet.has(toStr(viewYear, viewMonth, d))
  const isMissing = d => d && missingSet.has(toStr(viewYear, viewMonth, d))
  const isLow     = d => d && lowSet.has(toStr(viewYear, viewMonth, d))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 select-none" style={{ width: 224 }}>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={prev} className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronLeftIcon className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-gray-800">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button onClick={next} className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-0.5">{d}</div>
        ))}
      </div>

      {/* Date cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) => {
          const dateStr  = d ? toStr(viewYear, viewMonth, d) : null
          const selected = isSel(d)
          const missing  = !selected && isMissing(d)
          const low      = !selected && !missing && isLow(d)
          const todayDay = isToday(d)

          let cellCls = 'w-7 h-7 rounded-full text-xs font-medium transition-colors '
          if (selected)   cellCls += 'bg-accent text-white'
          else if (missing) cellCls += 'bg-red-100 text-red-700 ring-1 ring-red-300 hover:bg-red-200'
          else if (low)   cellCls += 'bg-yellow-100 text-yellow-700 ring-1 ring-yellow-300 hover:bg-yellow-200'
          else if (todayDay) cellCls += 'ring-2 ring-accent text-accent font-bold hover:bg-accent/10'
          else            cellCls += 'text-gray-700 hover:bg-gray-100'

          return (
            <div key={i} className="flex flex-col items-center">
              {d ? (
                <button onClick={() => onSelect(dateStr)} className={cellCls}>
                  {d}
                </button>
              ) : <div className="w-7 h-7" />}
              {/* dot for days with entries (not shown when selected or highlighted) */}
              {hasEntry(d) && !selected && !missing && !low && (
                <div className="w-1 h-1 rounded-full bg-accent mt-0.5" />
              )}
              {(!hasEntry(d) || selected || missing || low) && <div className="w-1 h-1 mt-0.5" />}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      {(missingDates.length > 0 || lowDates.length > 0) && (
        <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-500">
          {missingDates.length > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-red-200 ring-1 ring-red-300" />
              Missing
            </div>
          )}
          {lowDates.length > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-200 ring-1 ring-yellow-300" />
              Low (&lt;4h)
            </div>
          )}
        </div>
      )}

      {/* Today button */}
      <button
        onClick={() => {
          setViewYear(today.getFullYear())
          setViewMonth(today.getMonth())
          onSelect(toStr(today.getFullYear(), today.getMonth(), today.getDate()))
        }}
        className="mt-2 w-full text-center text-xs text-accent font-medium hover:underline"
      >
        Today
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Pass missingDates + lowDates through TimeFilterSidebar**

In `client/src/pages/time/TimeFilterSidebar.jsx`, update the component signature and CalendarWidget call:

```jsx
export default function TimeFilterSidebar({
  filters,
  onChange,
  onClear,
  engagements  = [],
  serviceCodes = [],
  payPeriods   = [],
  entryDates   = [],
  missingDates = [],
  lowDates     = [],
  isOpen,
  onToggle,
}) {
```

And update the `<CalendarWidget>` call inside the component (around line 88):

```jsx
<CalendarWidget
  selectedDate={filters.date_from || ''}
  onSelect={handleCalDate}
  entryDates={entryDates}
  missingDates={missingDates}
  lowDates={lowDates}
/>
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/time/CalendarWidget.jsx client/src/pages/time/TimeFilterSidebar.jsx
git commit -m "feat: add missing/low date highlighting to CalendarWidget"
```

---

## Task 4: TimeTracking.jsx — fetch daily hours + wire to sidebar/tabs

**Files:**
- Modify: `client/src/pages/TimeTracking.jsx`

- [ ] **Step 1: Add daily hours state + fetch logic**

In `client/src/pages/TimeTracking.jsx`, after the existing `const [filters, setFilters] = useState(BLANK_FILTERS)` line, add:

```jsx
const [dailyHours, setDailyHours] = useState({})   // { "2026-05-11": 3.5, ... }
```

After the existing `useEffect` that loads static data on mount (around line 78), add a new effect that re-fetches daily hours whenever the period or currentStaff changes:

```jsx
// ── Fetch daily hours for calendar highlighting ──────────────────────────────
useEffect(() => {
  if (!period || !currentStaff) { setDailyHours({}); return }
  timeSummaryApi.dailyHours(currentStaff, period.start_date, period.end_date)
    .then(r => setDailyHours(r.daily || {}))
    .catch(() => setDailyHours({}))
}, [period?.id, currentStaff])
```

Make sure `timeSummaryApi` is imported at the top of the file (it already should be from the previous session).

- [ ] **Step 2: Compute missingDates + lowDates**

After the `const entryDates = [...]` line (around line 158), add:

```jsx
// Dates in current period up to today where hours are missing or low (for calendar)
const today = new Date().toISOString().split('T')[0]
const missingDates = Object.entries(dailyHours)
  .filter(([d, h]) => d <= today && h === 0)
  .map(([d]) => d)
const lowDates = Object.entries(dailyHours)
  .filter(([d, h]) => d <= today && h > 0 && h < 4)
  .map(([d]) => d)
```

- [ ] **Step 3: Pass missingDates + lowDates to TimeFilterSidebar**

In the JSX, update the `<TimeFilterSidebar>` call to include the two new props:

```jsx
<TimeFilterSidebar
  filters={filters}
  onChange={handleFilterChange}
  onClear={handleClearFilters}
  engagements={engagements}
  serviceCodes={serviceCodes}
  payPeriods={allPeriods}
  entryDates={entryDates}
  missingDates={missingDates}
  lowDates={lowDates}
  isOpen={sidebarOpen}
  onToggle={() => setSidebar(v => !v)}
/>
```

- [ ] **Step 4: Verify BottomTabs already receives currentStaff**

Confirm the `<BottomTabs>` call already has `currentStaff={currentStaff}`:

```jsx
<BottomTabs period={period} currentStaff={currentStaff} />
```

(This was set in the previous session — just confirm it's there.)

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/TimeTracking.jsx
git commit -m "feat: fetch daily hours per staff for calendar highlighting"
```

---

## Task 5: BottomTabs.jsx — full rewrite of all 4 tabs

**Files:**
- Modify: `client/src/pages/time/BottomTabs.jsx`

This is the largest change. Replace the entire file content.

- [ ] **Step 1: Write the new BottomTabs.jsx**

Replace `client/src/pages/time/BottomTabs.jsx` with the following complete file:

```jsx
import { useEffect, useState } from 'react'
import { timeSummaryApi } from '../../api/timeSummary'
import { payPeriodsApi }  from '../../api/payPeriods'

const TABS = ['MTD Hours', 'Period Summary', 'Time Release', 'Alerts']
const MTD_TARGET = 160  // default monthly hour target

function fmtH(n)  { return n != null ? `${Number(n).toFixed(2)}h` : '—' }
function fmt$(n)  { return n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—' }

// ── Simple CSS bar chart ───────────────────────────────────────────────────────
function MiniBarChart({ daily, dates }) {
  const values = dates.map(d => daily[d] || 0)
  const maxVal = Math.max(...values, 8)   // at least 8h ceiling so empty periods still show scale
  const isWeekend = d => { const day = new Date(d + 'T12:00:00').getDay(); return day === 0 || day === 6 }

  return (
    <div className="flex items-end gap-px mt-2" style={{ height: 48 }}>
      {dates.map((d, i) => {
        const h    = values[i]
        const pct  = (h / maxVal) * 100
        const wknd = isWeekend(d)
        return (
          <div key={d} className="flex flex-col items-center flex-1 min-w-0 group relative">
            <div
              className={`w-full rounded-t transition-all ${
                h === 0 ? 'bg-gray-100' : wknd ? 'bg-blue-200' : 'bg-accent/70 group-hover:bg-accent'
              }`}
              style={{ height: `${Math.max(pct, h > 0 ? 8 : 2)}%` }}
            />
            {/* tooltip */}
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none opacity-0 group-hover:opacity-100 whitespace-nowrap z-10">
              {new Date(d + 'T12:00:00').getDate()}: {h.toFixed(1)}h
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Category badge color map ──────────────────────────────────────────────────
const CAT_COLORS = {
  Tax:           'bg-blue-50 text-blue-700',
  Audit:         'bg-purple-50 text-purple-700',
  Accounting:    'bg-teal-50 text-teal-700',
  Advisory:      'bg-amber-50 text-amber-700',
  Admin:         'bg-gray-100 text-gray-600',
  Uncategorized: 'bg-gray-100 text-gray-400',
}

// ── MTD Hours ─────────────────────────────────────────────────────────────────
function MtdTab({ currentStaff }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    timeSummaryApi.mtd(currentStaff || undefined)
      .then(setData)
      .finally(() => setLoading(false))
  }, [currentStaff])

  if (loading) return <p className="text-gray-400 text-sm py-4">Loading…</p>
  if (!data)   return <p className="text-gray-400 text-sm py-4">No data.</p>

  const totalHrs = data.totals?.total_hours || 0
  const pct      = Math.min(Math.round((totalHrs / MTD_TARGET) * 100), 100)
  const over     = totalHrs > MTD_TARGET

  return (
    <div className="py-2 space-y-4">
      {/* Header totals */}
      <div className="flex items-center gap-6 text-sm flex-wrap">
        <span className="text-gray-500">
          Period: <span className="font-medium text-gray-800">{data.period.start} – {data.period.end}</span>
        </span>
        <span className="text-gray-500">
          Total: <span className="font-bold font-mono text-accent">{fmtH(data.totals?.total_hours)}</span>
        </span>
        <span className="text-gray-500">
          Billable: <span className="font-mono text-green-700">{fmtH(data.totals?.billable_hours)}</span>
        </span>
        <span className="text-gray-500">
          Non-Billable: <span className="font-mono text-gray-600">{fmtH(data.totals?.nonbillable_hours)}</span>
        </span>
        <span className="text-gray-500">
          Billable Amt: <span className="font-mono font-semibold text-gray-800">{fmt$(data.totals?.billable_amount)}</span>
        </span>
      </div>

      {/* 160h progress bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Monthly Progress</span>
          <span className={over ? 'text-green-600 font-semibold' : ''}>
            {fmtH(totalHrs)} / {MTD_TARGET}h ({pct}%)
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all ${over ? 'bg-green-500' : pct >= 75 ? 'bg-accent' : pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* By staff */}
        {data.byStaff.length > 0 && !currentStaff && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">By Staff</h4>
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200">
                <tr>
                  {['Staff', 'Billable', 'Non-Bill.', 'Total', 'Amt'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase pb-1.5 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.byStaff.map(r => (
                  <tr key={r.staff_member} className="hover:bg-gray-50">
                    <td className="py-1.5 pr-4 font-medium text-gray-900 text-xs">{r.staff_member.split(' ')[0]}</td>
                    <td className="py-1.5 pr-4 font-mono text-green-700 text-xs">{fmtH(r.billable_hours)}</td>
                    <td className="py-1.5 pr-4 font-mono text-gray-500 text-xs">{fmtH(r.nonbillable_hours)}</td>
                    <td className="py-1.5 pr-4 font-mono font-bold text-gray-900 text-xs">{fmtH(r.total_hours)}</td>
                    <td className="py-1.5 font-mono text-gray-600 text-xs">{fmt$(r.billable_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* By category */}
        {data.byCategory.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">By Category</h4>
            <div className="space-y-1.5">
              {data.byCategory.map(r => {
                const catPct = totalHrs > 0 ? Math.round((r.total_hours / totalHrs) * 100) : 0
                return (
                  <div key={r.category} className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium w-24 text-center ${CAT_COLORS[r.category] || CAT_COLORS.Uncategorized}`}>
                      {r.category}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div className="h-1.5 bg-accent/60 rounded-full" style={{ width: `${catPct}%` }} />
                    </div>
                    <span className="text-xs font-mono text-gray-700 w-12 text-right">{fmtH(r.total_hours)}</span>
                    <span className="text-xs font-mono text-gray-400 w-16 text-right">{fmt$(r.billable_amount)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Period Summary ────────────────────────────────────────────────────────────
function PeriodSummaryTab({ period }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    if (period?.id) timeSummaryApi.period(period.id).then(setData)
  }, [period?.id])
  if (!period) return <p className="text-gray-400 text-sm py-4">No current period.</p>
  if (!data)   return <p className="text-gray-400 text-sm py-4">Loading…</p>

  const pt = data.periodTotals || {}

  return (
    <div className="py-2 space-y-3">
      {/* Summary header */}
      <div className="flex items-center gap-6 text-sm flex-wrap">
        <span className="text-gray-600 font-medium">
          Period {data.period.period_number}: {data.period.start_date} – {data.period.end_date}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          data.period.status === 'Released'  ? 'bg-green-100 text-green-700' :
          data.period.status === 'Locked'    ? 'bg-red-100 text-red-700' :
          data.period.status === 'Submitted' ? 'bg-yellow-100 text-yellow-700' :
                                               'bg-blue-100 text-blue-700'}`}>
          {data.period.status}
        </span>
        <span className="text-gray-500">
          Total: <span className="font-bold font-mono text-accent">{fmtH(pt.total_hours)}</span>
        </span>
        <span className="text-gray-500">
          Billable: <span className="font-mono text-green-700">{fmtH(pt.billable_hours)}</span>
        </span>
        <span className="text-gray-500">
          Non-Bill: <span className="font-mono text-gray-600">{fmtH(pt.nonbillable_hours)}</span>
        </span>
        <span className="text-gray-500">
          Amt: <span className="font-mono font-semibold text-gray-800">{fmt$(pt.billable_amount)}</span>
        </span>
      </div>

      {/* Per-day bar chart */}
      {data.dates.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Daily Hours</h4>
          <MiniBarChart daily={data.colTotals} dates={data.dates} />
          {/* Date labels — show every other day to avoid crowding */}
          <div className="flex gap-px mt-0.5">
            {data.dates.map((d, i) => (
              <div key={d} className="flex-1 text-center text-[9px] text-gray-400">
                {i % 2 === 0 ? new Date(d + 'T12:00:00').getDate() : ''}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Staff grid */}
      {data.staffRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-1.5 border border-gray-200 min-w-[140px]">Staff</th>
                {data.dates.map(d => (
                  <th key={d} className="text-center text-xs font-medium text-gray-500 px-1.5 py-1.5 border border-gray-200 min-w-[36px]">
                    {new Date(d + 'T12:00:00').getDate()}
                  </th>
                ))}
                <th className="text-right text-xs font-semibold text-gray-700 px-3 py-1.5 border border-gray-200">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.staffRows.map(r => (
                <tr key={r.staff_member} className="hover:bg-gray-50">
                  <td className="text-sm font-medium text-gray-900 px-3 py-1.5 border border-gray-200">{r.staff_member}</td>
                  {data.dates.map(d => (
                    <td key={d} className="text-center text-sm font-mono px-1.5 py-1.5 border border-gray-200">
                      {r.daily[d] ? <span className="text-gray-800">{Number(r.daily[d]).toFixed(1)}</span> : <span className="text-gray-200">—</span>}
                    </td>
                  ))}
                  <td className="text-right font-bold font-mono text-accent px-3 py-1.5 border border-gray-200">
                    {Number(r.total).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.staffRows.length === 0 && (
        <p className="text-gray-400 text-sm">No time logged this period.</p>
      )}
    </div>
  )
}

// ── Time Release ──────────────────────────────────────────────────────────────
function TimeReleaseTab({ period }) {
  const [data,       setData]       = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(null)   // staff_member or 'all'
  const [releasing,  setReleasing]  = useState(null)

  const load = () => {
    if (!period?.id) return
    setLoading(true)
    timeSummaryApi.period(period.id)
      .then(setData)
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [period?.id])

  if (!period)   return <p className="text-gray-400 text-sm py-4">No current period.</p>
  if (loading)   return <p className="text-gray-400 text-sm py-4">Loading…</p>
  if (!data)     return <p className="text-gray-400 text-sm py-4">No data.</p>

  const rows = data.staffRows || []

  const handleSubmit = async (staff) => {
    const target = staff || 'All Staff'
    if (!confirm(`Submit all draft entries for ${target} in this period?`)) return
    setSubmitting(staff || 'all')
    try { await payPeriodsApi.submit(period.id, staff || undefined); load() }
    finally { setSubmitting(null) }
  }

  const handleRelease = async (staff) => {
    const target = staff || 'All Staff'
    if (!confirm(`Release all entries for ${target} in Period ${period.period_number}? This cannot be undone.`)) return
    setReleasing(staff || 'all')
    try { await payPeriodsApi.release(period.id, staff || undefined, 'Manager'); load() }
    finally { setReleasing(null) }
  }

  const allSubmitted = rows.every(r => r.entry_status === 'Submitted' || r.entry_status === 'Released')
  const allReleased  = rows.every(r => r.entry_status === 'Released')

  const STATUS_COLORS = {
    Open:      'bg-blue-50 text-blue-700 border-blue-200',
    Submitted: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    Released:  'bg-green-50 text-green-700 border-green-200',
  }

  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">
          Period {period.period_number}: {period.start_date} – {period.end_date}
        </h3>
        {rows.length > 0 && (
          <div className="flex gap-2">
            {!allSubmitted && (
              <button
                onClick={() => handleSubmit(null)}
                disabled={submitting === 'all'}
                className="px-3 py-1 text-xs font-semibold text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg hover:bg-yellow-100 transition-colors disabled:opacity-50"
              >
                {submitting === 'all' ? 'Submitting…' : 'Submit All'}
              </button>
            )}
            {allSubmitted && !allReleased && (
              <button
                onClick={() => handleRelease(null)}
                disabled={releasing === 'all'}
                className="px-3 py-1 text-xs font-semibold text-white bg-green-500 rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                {releasing === 'all' ? 'Releasing…' : 'Release All'}
              </button>
            )}
          </div>
        )}
      </div>

      {rows.length === 0 && (
        <p className="text-gray-400 text-sm">No time logged for this period.</p>
      )}

      {rows.length > 0 && (
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200">
            <tr>
              {['Staff Member', 'Total Hrs', 'Billable Hrs', 'Billable Amt', 'Status', ''].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-2 pr-4">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(r => (
              <tr key={r.staff_member} className="hover:bg-gray-50">
                <td className="py-2 pr-4 font-medium text-gray-900">{r.staff_member}</td>
                <td className="py-2 pr-4 font-mono font-semibold text-gray-900">{fmtH(r.total)}</td>
                <td className="py-2 pr-4 font-mono text-green-700">{fmtH(r.billable_hours)}</td>
                <td className="py-2 pr-4 font-mono text-gray-700">{fmt$(r.billable_amount)}</td>
                <td className="py-2 pr-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_COLORS[r.entry_status] || STATUS_COLORS.Open}`}>
                    {r.entry_status || 'Open'}
                  </span>
                </td>
                <td className="py-2">
                  <div className="flex gap-1.5">
                    {(r.entry_status === 'Open' || !r.entry_status) && (
                      <button
                        onClick={() => handleSubmit(r.staff_member)}
                        disabled={submitting === r.staff_member}
                        className="px-2.5 py-1 text-xs font-semibold text-yellow-700 bg-yellow-50 border border-yellow-200 rounded hover:bg-yellow-100 transition-colors disabled:opacity-50"
                      >
                        {submitting === r.staff_member ? '…' : 'Submit'}
                      </button>
                    )}
                    {r.entry_status === 'Submitted' && (
                      <button
                        onClick={() => handleRelease(r.staff_member)}
                        disabled={releasing === r.staff_member}
                        className="px-2.5 py-1 text-xs font-semibold text-white bg-green-500 rounded hover:bg-green-600 transition-colors disabled:opacity-50"
                      >
                        {releasing === r.staff_member ? '…' : 'Release'}
                      </button>
                    )}
                    {r.entry_status === 'Released' && (
                      <span className="text-xs text-green-600 font-medium">✓ Released</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Unreleased past periods section */}
      <UnreleasedPeriods />
    </div>
  )
}

function UnreleasedPeriods() {
  const [alerts, setAlerts] = useState(null)
  const [releasing, setReleasing] = useState(null)
  const load = () => timeSummaryApi.alerts().then(setAlerts)
  useEffect(() => { load() }, [])

  if (!alerts || alerts.unreleasedPeriods.length === 0) return null

  const handleRelease = async (p) => {
    if (!confirm(`Release Period ${p.period_number}?`)) return
    setReleasing(p.id)
    try { await payPeriodsApi.setStatus(p.id, 'Released', 'Manager'); load() }
    finally { setReleasing(null) }
  }

  return (
    <div className="mt-4 pt-3 border-t border-gray-100">
      <h4 className="text-xs font-bold text-orange-600 uppercase tracking-wide mb-2">
        ⚠ Unreleased Past Periods ({alerts.unreleasedPeriods.length})
      </h4>
      {alerts.unreleasedPeriods.map(p => (
        <div key={p.id} className="flex items-center justify-between py-1">
          <span className="text-sm text-gray-700">
            Period {p.period_number}: <span className="font-mono text-xs">{p.start_date} – {p.end_date}</span>
          </span>
          <button
            onClick={() => handleRelease(p)}
            disabled={releasing === p.id}
            className="px-2.5 py-0.5 text-xs font-semibold text-white bg-green-500 rounded hover:bg-green-600 disabled:opacity-50"
          >
            {releasing === p.id ? '…' : 'Release'}
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Alerts ────────────────────────────────────────────────────────────────────
function AlertsTab({ period, currentStaff }) {
  const [alerts, setAlerts] = useState(null)
  const [daily,  setDaily]  = useState(null)

  useEffect(() => { timeSummaryApi.alerts().then(setAlerts) }, [])

  useEffect(() => {
    if (!period || !currentStaff) return
    timeSummaryApi.dailyHours(currentStaff, period.start_date, period.end_date)
      .then(r => setDaily(r.daily || {}))
  }, [period?.id, currentStaff])

  if (!alerts) return <p className="text-gray-400 text-sm py-4">Loading…</p>

  const today = new Date().toISOString().split('T')[0]

  // Per-day analysis for current staff
  const missingDays = daily
    ? Object.entries(daily).filter(([d, h]) => d <= today && h === 0).map(([d]) => d)
    : []
  const lowDays = daily
    ? Object.entries(daily).filter(([d, h]) => d <= today && h > 0 && h < 4).map(([d]) => d)
    : []

  const allClear =
    !alerts.unreleasedPeriods.length &&
    !alerts.lowHoursStaff.length &&
    !alerts.missingStaff.length &&
    !alerts.overBudget.length &&
    missingDays.length === 0 &&
    lowDays.length === 0

  const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="py-2 space-y-4">
      {allClear && <p className="text-green-600 text-sm font-medium">No alerts. Everything looks good! ✓</p>}

      {missingDays.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-red-600 uppercase tracking-wide mb-2">
            🚫 Missing Time — {currentStaff || 'You'} ({missingDays.length} day{missingDays.length !== 1 ? 's' : ''})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {missingDays.map(d => (
              <span key={d} className="text-xs bg-red-50 text-red-700 border border-red-200 rounded px-2 py-0.5 font-mono">
                {fmtDate(d)}
              </span>
            ))}
          </div>
        </div>
      )}

      {lowDays.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-yellow-600 uppercase tracking-wide mb-2">
            ⚡ Low Hours (&lt;4h) — {currentStaff || 'You'} ({lowDays.length} day{lowDays.length !== 1 ? 's' : ''})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {lowDays.map(d => (
              <span key={d} className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 rounded px-2 py-0.5 font-mono">
                {fmtDate(d)}: {(daily[d] || 0).toFixed(1)}h
              </span>
            ))}
          </div>
        </div>
      )}

      {alerts.unreleasedPeriods.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-orange-600 uppercase tracking-wide mb-2">
            ⚠ Unreleased Periods ({alerts.unreleasedPeriods.length})
          </h4>
          {alerts.unreleasedPeriods.map(p => (
            <div key={p.id} className="text-sm text-gray-700 py-1">
              Period {p.period_number}: {p.start_date} – {p.end_date}
              <span className="ml-2 text-xs text-orange-500">({p.status})</span>
            </div>
          ))}
        </div>
      )}

      {alerts.missingStaff.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-red-600 uppercase tracking-wide mb-2">
            ✗ No Entries This Period ({alerts.missingStaff.length})
          </h4>
          {alerts.missingStaff.map(s => (
            <div key={s} className="text-sm text-gray-700 py-0.5">{s}</div>
          ))}
        </div>
      )}

      {alerts.lowHoursStaff.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-yellow-600 uppercase tracking-wide mb-2">
            ⚡ Low Period Hours (&lt;40h total)
          </h4>
          {alerts.lowHoursStaff.map(r => (
            <div key={r.staff_member} className="text-sm text-gray-700 py-0.5">
              {r.staff_member}: <span className="font-mono font-semibold">{fmtH(r.total_hours)}</span>
            </div>
          ))}
        </div>
      )}

      {alerts.overBudget.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-red-600 uppercase tracking-wide mb-2">
            💰 Over Budget ({alerts.overBudget.length})
          </h4>
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200">
              <tr>
                {['Client', 'Engagement', 'Budget', 'Logged', '%'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase pb-1.5 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {alerts.overBudget.map(e => (
                <tr key={e.id} className="hover:bg-red-50">
                  <td className="py-1.5 pr-4 text-gray-900">{e.client_name}</td>
                  <td className="py-1.5 pr-4 text-gray-600">{e.engagement_type}</td>
                  <td className="py-1.5 pr-4 font-mono text-gray-600">{fmtH(e.budgeted_hours)}</td>
                  <td className="py-1.5 pr-4 font-mono font-semibold text-red-700">{fmtH(e.logged_hours)}</td>
                  <td className="py-1.5 font-mono font-bold text-red-600">{e.pct_used}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Shell ─────────────────────────────────────────────────────────────────────
export default function BottomTabs({ period, currentStaff }) {
  const [tab,  setTab]  = useState(0)
  const [open, setOpen] = useState(true)

  return (
    <div className={`bg-white border-t border-gray-200 flex-shrink-0 transition-all ${open ? '' : 'h-10'}`}>
      {/* Tab strip */}
      <div className="flex items-center border-b border-gray-200 px-4">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => { setTab(i); setOpen(true) }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === i && open
                ? 'border-accent text-accent'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
        <button
          onClick={() => setOpen(v => !v)}
          className="ml-auto text-xs text-gray-400 hover:text-gray-600 px-2 py-2"
        >
          {open ? '▼ Hide' : '▲ Show'}
        </button>
      </div>

      {open && (
        <div className="px-6 py-2 overflow-y-auto" style={{ maxHeight: 280 }}>
          {tab === 0 && <MtdTab currentStaff={currentStaff} />}
          {tab === 1 && <PeriodSummaryTab period={period} />}
          {tab === 2 && <TimeReleaseTab period={period} />}
          {tab === 3 && <AlertsTab period={period} currentStaff={currentStaff} />}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build passes**

```bash
cd "C:\Users\carso\Claude Projects\mgrcpas\client"
npm run build
```

Expected: `✓ built in X.XXs` with no errors.

- [ ] **Step 3: Re-seed the database with corrected staff rates**

```bash
cd "C:\Users\carso\Claude Projects\mgrcpas\server"
node db/seed.js
```

Expected: `Database seeded: ...`

- [ ] **Step 4: Start the dev server and smoke-test**

```bash
cd "C:\Users\carso\Claude Projects\mgrcpas"
npm run dev
```

Open http://localhost:5173/time-tracking. Verify:
- Bottom tabs render with correct labels
- MTD Hours tab shows progress bar + byCategory breakdown
- Period Summary tab shows totals header + bar chart
- Time Release tab shows per-staff rows for current period
- Alerts tab shows missing/low day chips for current staff
- Calendar highlights red/yellow days in sidebar

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/time/BottomTabs.jsx
git commit -m "feat: full rewrite of bottom tabs — MTD progress bar, period bar chart, per-staff time release, calendar alert highlighting"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task | Status |
|---|---|---|
| MTD total/billable/non-billable/amount | T1 + T5 | ✅ |
| MTD by service code category | T1 + T5 | ✅ |
| MTD 160h progress bar | T5 | ✅ |
| Period totals header | T1 + T5 | ✅ |
| Period per-day bar chart | T5 | ✅ |
| Period staff grid | T5 (kept from existing) | ✅ |
| Time Release: per-staff rows | T1 + T5 | ✅ |
| Time Release: Submit per staff | T1 + T2 + T5 | ✅ |
| Time Release: Release per staff | T1 + T2 + T5 | ✅ |
| Time Release: Bulk submit/release | T5 | ✅ |
| Time Release: unreleased past periods | T5 (UnreleasedPeriods component) | ✅ |
| Alerts: missing days with red calendar | T1 + T3 + T4 + T5 | ✅ |
| Alerts: low hours days with yellow calendar | T1 + T3 + T4 + T5 | ✅ |
| Alerts: unreleased periods | T5 (kept) | ✅ |
| Alerts: low period hours | T5 (kept) | ✅ |
| Alerts: over budget | T5 (kept) | ✅ |
| Staff rates $350/$275/$175 | T1 | ✅ |
| CalendarWidget red/yellow highlighting | T3 | ✅ |
| Legend on calendar | T3 | ✅ |

**No placeholders found.** All code blocks are complete and self-contained.

**Type consistency:** `r.entry_status` is computed in Task 1 backend and consumed in Task 5 frontend. `dailyHours()` returns `{ daily: {} }` in Task 1, consumed as `r.daily` in Task 2. `periodTotals` added in Task 1 backend, consumed as `data.periodTotals` in Task 5. All consistent.
