# Time Tracking Client Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic TimeTracking page with a full CCH ProSystem fx–inspired time management UI: multi-timer, biweekly pay period grid, inline entry form, daily + timesheet views, filter sidebar, and enhanced service code administration.

**Architecture:** Server-side (T1–T6) is already complete. This plan covers client-only work. All new UI lives under `client/src/pages/time/` as focused sub-components orchestrated by `TimeTracking.jsx`. TimerContext is rewritten for multi-timer with full backward-compat aliases so no other page breaks. Settings.jsx gets a new Staff Rates tab and an enhanced Service Codes tab.

**Tech Stack:** React 18, Vite 5, Tailwind CSS 3, @heroicons/react v2, React Router v6. No new npm packages. DM Sans + DM Mono fonts, accent #1B4FD8.

---

## What Already Exists (Server — DONE)
- `server/routes/payPeriods.js` — GET list/current/id, POST generate, PATCH status
- `server/routes/staffRates.js` — CRUD + GET /current
- `server/routes/timeSummary.js` — MTD, period grid, alerts
- `server/routes/timeEntries.js` — updated with pay_period_id, entry_status, expanded filters
- `server/routes/serviceCodes.js` — full column set, toggle, deactivate-not-delete
- `server/db/seed.js` — 26 pay periods (2026), staff rates, enhanced service codes, 2026 time entries

## What Needs to Be Built (Client — THIS PLAN)

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `client/src/api/payPeriods.js` | API wrapper for /api/pay-periods |
| `client/src/api/staffRates.js` | API wrapper for /api/staff-rates |
| `client/src/api/timeSummary.js` | API wrapper for /api/time-summary |
| `client/src/components/TimerPanel.jsx` | Floating multi-timer panel (bottom-right) |
| `client/src/pages/time/CalendarWidget.jsx` | Mini monthly calendar with entry dots |
| `client/src/pages/time/EntryForm.jsx` | Always-visible inline time entry form |
| `client/src/pages/time/DailyGrid.jsx` | Daily entries table + summary bar |
| `client/src/pages/time/TimesheetView.jsx` | 14-day biweekly spreadsheet grid |
| `client/src/pages/time/TimeFilterSidebar.jsx` | Collapsible left filter panel |
| `client/src/pages/time/BottomTabs.jsx` | MTD / Period Summary / Time Release / Alerts tabs |

### Modified Files
| File | Change |
|------|--------|
| `client/src/api/client.js` | Add `patch` method |
| `client/src/api/timeEntries.js` | Add `setStatus`, new filter params |
| `client/src/api/serviceCodes.js` | Add `toggle`, `listAll` |
| `client/src/context/TimerContext.jsx` | Full rewrite: multi-timer + backward-compat aliases |
| `client/src/components/Layout.jsx` | Multi-timer topbar indicator + import TimerPanel |
| `client/src/pages/TimeTracking.jsx` | Complete rewrite using sub-components |
| `client/src/pages/Settings.jsx` | Enhanced Service Codes tab + new Staff Rates tab |
| `server/db/seed.js` | Add 10 additional service codes from spec |

---

## Tasks

### Task 8: API Layer
**Files:** Modify `client/src/api/client.js`, `timeEntries.js`, `serviceCodes.js`; Create `payPeriods.js`, `staffRates.js`, `timeSummary.js`

- [ ] Add `patch` to api/client.js
- [ ] Create api/payPeriods.js with list/current/get/generate/setStatus
- [ ] Create api/staffRates.js with list/current/create/delete
- [ ] Create api/timeSummary.js with mtd/period/alerts
- [ ] Update api/timeEntries.js — add `setStatus(id, status)`, update `list()` to pass all filter params
- [ ] Update api/serviceCodes.js — add `toggle(id)`, `listAll()` (include_inactive=true)
- [ ] Verify: `cd client && npm run build` — no TS/import errors
- [ ] Commit: `feat: add pay-periods, staff-rates, time-summary API wrappers`

### Task 9: Multi-Timer Context
**Files:** Rewrite `client/src/context/TimerContext.jsx`

Key contract:
- `timers[]` — array of `{ engagementId, engagementLabel, startedAt }`
- `startTimer(engagementId, label)` — adds to array, deduplicates
- `stopTimer(engagementId)` → returns decimal hours (rounded to 0.25)
- `getTimerElapsed(engagementId)` → seconds (recomputed per render via `tick` state)
- `fmt(seconds)` → "HH:MM:SS"
- Backward-compat: `active` (timers[0]||null), `elapsed`, `start`, `stop`
- Persist to `localStorage` key `mgr_timers`

- [ ] Rewrite TimerContext.jsx
- [ ] Verify Layout.jsx still compiles (uses `active`, `elapsed`, `fmt`, `stop`)
- [ ] Commit: `feat: multi-timer context with backward-compat aliases`

### Task 10: TimerPanel + Layout Update
**Files:** Create `client/src/components/TimerPanel.jsx`, modify `client/src/components/Layout.jsx`

TimerPanel: fixed bottom-right card, dark header showing "N Timers Running", each row shows label + HH:MM:SS + Stop button. Stop navigates to `/time-tracking` with `location.state.prefill`.

Layout: Replace single-timer topbar block with compact "N timers" pill that opens TimerPanel on click. Import TimerPanel and render it inside Layout return.

- [ ] Create TimerPanel.jsx
- [ ] Update Layout.jsx topbar timer section
- [ ] Verify: no broken references to old single-timer pattern
- [ ] Commit: `feat: multi-timer panel + updated layout topbar`

### Task 11: CalendarWidget
**Files:** Create `client/src/pages/time/CalendarWidget.jsx`

Props: `selectedDate: string`, `onSelect: (dateStr) => void`, `entryDates: string[]` (days with entries — show dot)

Renders a mini monthly calendar. Navigation: prev/next month arrows. Today has accent ring. Selected date has accent fill. Days with entries show a 1px dot below.

- [ ] Create CalendarWidget.jsx
- [ ] Verify: renders correctly in isolation
- [ ] Commit: `feat: mini calendar widget for time tracking`

### Task 12: EntryForm
**Files:** Create `client/src/pages/time/EntryForm.jsx`

Props: `period` (current pay period object), `prefill` (optional — from timer stop), `engagements[]`, `serviceCodes[]`, `staffRates[]`, `onSaved()`, `currentStaff: string`, `onStaffChange: (name) => void`

Behavior:
- Date defaults to today, restricted to current pay period start/end
- Engagement: searchable — filter-as-you-type dropdown
- Service code: searchable — selecting auto-fills Rate from `default_rate`
- Rate auto-fills from staffRates when staff changes (fallback to service code rate)
- Billable checkbox default on
- Internal memo toggle
- After save: clear form, call onSaved()
- Staff name persisted to `localStorage.mgr_current_staff`

- [ ] Create EntryForm.jsx
- [ ] Commit: `feat: inline time entry form with searchable dropdowns`

### Task 13: DailyGrid
**Files:** Create `client/src/pages/time/DailyGrid.jsx`

Props: `entries[]`, `selectedDate: string`, `onDateChange: (dateStr) => void`, `onEdit: (entry) => void`, `onDelete: (id) => void`, `onRefresh: () => void`

Features:
- Prev/Next day arrows + "Today" button + date display
- Table: Client, Engagement, Code, Hours, Rate, Amount, Memo, Billable, Actions
- Daily summary bar: Billable hrs/$, Non-Billable hrs, Total hrs
- Empty state: "No entries for [date]"

- [ ] Create DailyGrid.jsx
- [ ] Commit: `feat: daily time entries grid with summary bar`

### Task 14: TimeFilterSidebar
**Files:** Create `client/src/pages/time/TimeFilterSidebar.jsx`

Props: `filters`, `onChange(newFilters)`, `onClear()`, `engagements[]`, `serviceCodes[]`, `payPeriods[]`, `isOpen`, `onToggle()`

Contains:
1. CalendarWidget at top (clicking a date sets date_from AND date_to to that day)
2. Filter fields: staff_member text, client text, engagement select, service_code select, date_from/date_to, billable radio, pay_period_id select, entry_status select
3. Clear Filters button
4. Collapse/expand toggle button on the left edge

Width: w-64 when open, collapsed to a narrow toggle strip

- [ ] Create TimeFilterSidebar.jsx
- [ ] Commit: `feat: collapsible time filter sidebar`

### Task 15: TimesheetView
**Files:** Create `client/src/pages/time/TimesheetView.jsx`

Props: `period`, `onPeriodChange(direction: 'prev'|'next'|'current')`, `engagements[]`, `serviceCodes[]`, `currentStaff: string`, `onRefresh()`

Features:
- Fetches `/api/time-summary/period/:periodId` for grid data
- 14 columns (one per day in period), frozen first column (Client — Engagement — Code)
- Each cell: click to edit (becomes input), blur/Enter saves (POST or PUT time entry)
- Row totals right column, column totals bottom row, grand total
- Add Row modal: select engagement + service code → adds new row
- Period navigation: Prev / "Period N: dates" / Next

- [ ] Create TimesheetView.jsx
- [ ] Commit: `feat: biweekly timesheet spreadsheet view`

### Task 16: BottomTabs
**Files:** Create `client/src/pages/time/BottomTabs.jsx`

Props: `period`, `currentStaff: string`

Four tabs:
1. **MTD Hours**: table from `/api/time-summary/mtd` — staff, billable hrs, non-billable, total
2. **Period Summary**: grid from `/api/time-summary/period/:id` — staff rows with day totals
3. **Time Release**: list unreleased past periods from alerts; PATCH /api/pay-periods/:id/status button
4. **Alerts**: unreleased periods, low hours, missing staff, over-budget engagements

- [ ] Create BottomTabs.jsx
- [ ] Commit: `feat: time tracking bottom tabs (MTD, period, release, alerts)`

### Task 17: TimeTracking.jsx Rewrite
**Files:** Complete rewrite of `client/src/pages/TimeTracking.jsx`

Layout:
```
[header: pay period indicator + Daily/Timesheet toggle]
[body: flex row]
  [TimeFilterSidebar]
  [main: flex-1]
    [EntryForm]
    [daily view: flex row]
      [CalendarWidget left]
      [DailyGrid right]
    OR
    [TimesheetView full width]
[BottomTabs]
```

State: view ('daily'|'timesheet'), selectedDate, filters, period, engagements, serviceCodes, staffRates, entries, currentStaff

Handle `location.state.prefill` from timer stop → pre-fills EntryForm

- [ ] Rewrite TimeTracking.jsx
- [ ] Verify: npm run dev, navigate to /time-tracking
- [ ] Commit: `feat: redesigned time tracking page`

### Task 18: Settings.jsx Updates + Seed Additions
**Files:** Modify `client/src/pages/Settings.jsx`, `server/db/seed.js`

Settings changes:
1. Enhance "Service Codes" tab: show number, category, subcategory, default_rate, billable_default, active; add toggle/deactivate button; search filter
2. Add "Staff Rates" tab: table of staff + current rate + effective date; form to add new rate

Seed additions (10 new service codes from spec):
TAX-EXT, TAX-PLAN, AUDIT-REVIEW, BK-RECON, BK-PAYROLL, ADV-CONSULT, ADV-ENTITY, ADMIN-FILING, ADMIN-COMM, TRAINING

- [ ] Update Settings.jsx
- [ ] Update seed.js with 10 new codes
- [ ] Verify: npm run dev, navigate to /settings
- [ ] Commit: `feat: enhanced settings — service codes + staff rates`

---

## Non-Breaking Guarantee

These files are NOT touched:
- All pages except TimeTracking.jsx and Settings.jsx
- All API files except client.js, timeEntries.js, serviceCodes.js
- All server routes (T1–T6 complete — no server changes here)
- TimerContext backward-compat aliases ensure Layout.jsx, EngagementDetail.jsx work unchanged
