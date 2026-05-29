# MGR CPAs — Practice Management App

## What This Is
A full-stack practice management system for a CPA firm (Maurer, Graf & Rivera). Handles engagements, time tracking, billing, invoicing, staff management, notes, reports, and automations. Built for internal use — not a SaaS product.

---

## How to Run

```bash
# Terminal 1 — API server (port 3001)
cd server
npm run dev          # nodemon auto-restart
# or: npm start      # plain node

# Terminal 2 — React frontend (port 5173)
cd client
npm run dev

# Reset database to clean seed data
cd server
npm run seed
```

Client proxies all `/api` requests to `localhost:3001` via Vite config.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite 5, Tailwind CSS 3, React Router 6 |
| Icons | @heroicons/react (outline style) |
| Backend | Node.js, Express 4 |
| Database | SQLite via better-sqlite3 (WAL mode) |
| Auth | JWT (jsonwebtoken) + bcrypt (bcryptjs) |
| DB file | `server/db/mgrcpas.db` (auto-created) |

---

## Design System

- **Accent color:** `#1B4FD8` (used as `bg-accent`, `text-accent`, `ring-accent` in Tailwind)
- **Fonts:** DM Sans (sans), DM Mono (mono) — loaded via Google Fonts in `client/index.html`
- **Layout:** `bg-gray-900` sidebar (w-60) + white topbar + `bg-gray-50` content area
- **Cards/panels:** `bg-white rounded-xl border border-gray-200`
- **Buttons primary:** `bg-accent text-white hover:bg-blue-700`
- **Form inputs:** `border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-accent`

---

## Login Credentials (dev seed)

| Username | Password | Name | Role |
|---|---|---|---|
| `carson` | `admin123` | Carson | Admin |
| `mmaurer` | `admin123` | Marcus Maurer | Admin |
| `sgraf` | `manager123` | Sofia Graf | Manager |
| `drivera` | `staff123` | Diego Rivera | Staff |

**Roles:**
- `admin` — full access, Settings tab, User Accounts tab, all nav
- `manager` — no Settings; sees Billing, AR, Staff, Reports, Due Dates, Engagements, Time, Notes
- `staff` — Time Tracking, Engagements, Dashboard, Notes, Due Dates only; staff field locked to own name

---

## Project Structure

```
mgrcpas/
├── client/
│   └── src/
│       ├── api/            # fetch wrappers for every resource
│       │   ├── client.js   # base fetch, injects Bearer token, 401→/login redirect
│       │   ├── auth.js     # authApi.login(), authApi.me()
│       │   ├── users.js    # usersApi CRUD
│       │   └── ...         # engagements, timeEntries, billing, etc.
│       ├── components/
│       │   ├── Layout.jsx         # topbar (search + user + logout) + sidebar
│       │   ├── Sidebar.jsx        # role-filtered nav
│       │   ├── ProtectedRoute.jsx # redirects to /login if no token
│       │   ├── TimerPanel.jsx     # slide-up multi-timer panel
│       │   └── ToastContext.jsx   # toast notifications
│       ├── context/
│       │   ├── AuthContext.jsx    # useAuth() → { user, login, logout, isAdmin, isManager }
│       │   └── TimerContext.jsx   # multi-timer state, localStorage persisted
│       └── pages/
│           ├── Login.jsx           # login form, dark navy background
│           ├── Dashboard.jsx
│           ├── Engagements.jsx / EngagementDetail.jsx / EngagementForm.jsx
│           ├── TimeTracking.jsx    # main time page, daily + timesheet views
│           ├── time/               # sub-components for time tracking
│           │   ├── EntryForm.jsx
│           │   ├── DailyGrid.jsx
│           │   ├── TimesheetView.jsx
│           │   ├── BottomTabs.jsx  # MTD Hours / Period Summary / Time Release / Alerts
│           │   ├── TimeFilterSidebar.jsx
│           │   └── CalendarWidget.jsx
│           ├── Billing.jsx / AR.jsx / InvoiceView.jsx
│           ├── Staff.jsx / StaffDetail.jsx
│           ├── Reports.jsx
│           ├── Settings.jsx        # tabs: Custom Fields / Service Codes / Staff Rates / Automations / User Accounts (admin only)
│           ├── Notes.jsx
│           ├── Templates.jsx
│           └── DueDates.jsx
├── server/
│   ├── app.js              # Express setup, route registration, auth middleware
│   ├── index.js            # listens on :3001
│   ├── middleware/
│   │   └── auth.js         # requireAuth (JWT verify), JWT_SECRET export
│   ├── db/
│   │   ├── schema.js       # CREATE TABLE IF NOT EXISTS for all tables
│   │   ├── migrate.js      # ALTER TABLE guards for adding columns to existing DBs
│   │   ├── seed.js         # full reset + seed (5 engagements, 4 users, 26 pay periods, etc.)
│   │   └── database.js     # better-sqlite3 instance (WAL mode)
│   └── routes/
│       ├── auth.js         # POST /api/auth/login, GET /api/auth/me
│       ├── users.js        # GET/POST/PUT /api/users, PATCH /api/users/:id/toggle
│       ├── engagements.js
│       ├── timeEntries.js
│       ├── payPeriods.js   # includes POST /:id/submit and POST /:id/release
│       ├── staffRates.js
│       ├── timeSummary.js  # /mtd, /period/:id, /alerts, /daily-hours
│       ├── serviceCodes.js
│       ├── billing.js
│       ├── staff.js
│       ├── dashboard.js
│       ├── reports.js
│       ├── notes.js
│       ├── automations.js
│       ├── payments.js
│       ├── invoices.js
│       ├── customFields.js
│       ├── templates.js / subtasks.js
│       ├── activity.js
│       ├── dueDates.js
│       └── search.js
└── docs/superpowers/plans/ # implementation plans for major features
```

---

## Database Schema (key tables)

```sql
users           id, username (unique), password (bcrypt), full_name, email,
                role (admin/manager/staff), default_hourly_rate, active

engagements     id, client_name, engagement_type, tax_year, due_date, status,
                assigned_staff, priority, budgeted_hours, budgeted_amount, recurrence_frequency

time_entries    id, engagement_id, staff_member (TEXT), user_id (FK→users),
                date, hours, billing_rate, notes, billable, service_code,
                pay_period_id, entry_status (draft/submitted/released)

pay_periods     id, period_number, year, start_date, end_date,
                status (Open/Submitted/Released/Locked)

staff_rates     id, staff_member, hourly_rate, effective_date
service_codes   id, code, description, number, category, default_rate, billable_default, active
```

Migration pattern: `server/db/migrate.js` uses `PRAGMA table_info` guards before each `ALTER TABLE`. New columns go here, not in schema.js (schema.js uses CREATE TABLE IF NOT EXISTS).

---

## Auth Architecture

- **JWT** stored in `localStorage` as `mgr_auth_token`, 24h expiry
- **Secret:** `process.env.JWT_SECRET || 'mgrcpas-dev-secret-2026'`
- **Middleware:** `requireAuth` in `server/middleware/auth.js` — skipped when `NODE_ENV=test`
- **Flow:** POST /api/auth/login → `{ token, user }` → stored → all subsequent requests send `Authorization: Bearer <token>` header
- **401 handling:** `client/src/api/client.js` removes token + redirects to `/login` on any 401
- **AuthContext:** `useAuth()` returns `{ user, loading, login, logout, isAdmin, isManager }`

---

## Time Tracking Architecture

Pay periods are biweekly, 26/year. Period 10 (May 11–24, 2026) is the "current" period in seed data.

`TimeTracking.jsx` holds all state and passes down to children:
- `EntryForm` — log new entries, auto-fills staff from auth user
- `DailyGrid` — shows entries for selected date
- `TimesheetView` — full period grid by staff/date
- `TimeFilterSidebar` — calendar widget + filters
- `BottomTabs` — 4 tabs: MTD Hours / Period Summary / Time Release / Alerts

`timeSummaryApi` endpoints:
- `GET /api/time-summary/mtd?staff=` — month-to-date with by-category breakdown
- `GET /api/time-summary/period/:id` — full period grid
- `GET /api/time-summary/alerts` — missing days, low hours, overbudget
- `GET /api/time-summary/daily-hours?staff=&from=&to=` — dense map including 0-hour days (for calendar highlighting)

Entry status flow: `draft` → (submit) → `submitted` → (release) → `released`

---

## Key Patterns to Follow

1. **API routes** — every new route goes in `server/routes/`, registered in `server/app.js` below the `requireAuth` middleware line (unless it needs to be public like `/api/auth`)
2. **New tables** — add `CREATE TABLE IF NOT EXISTS` to `server/db/schema.js`, add any new columns to existing tables in `server/db/migrate.js`
3. **Client API** — add a file in `client/src/api/` that imports `{ api }` from `./client` and exports a named object like `fooApi`
4. **Don't use `useCallback` for simple loaders** unless they're a dependency of a `useEffect`
5. **Toast notifications** — `import { useToast } from '../context/ToastContext'` → `toast.success('msg')` or `toast.error('msg')`
6. **No breaking other sections** — all existing routes and pages must remain functional; only add/extend, never remove existing behavior

---

## Seed Data Summary

- 4 users (see login table above)
- 26 pay periods for 2026 (P1–P9 Released, P10–P26 Open)
- 5 engagements (Apex Industries, Chen Family Trust, Riverside Dental, Pacific Ventures, Santos)
- 9 time entries in P10 (May 11–24, 2026) across Marcus, Sofia, Diego
- 20 service codes (TAX, BKP, AUD, ADV, PAY, REV, MTG, RES, FIL, COR + 10 spec codes)
- 3 staff rates: Marcus $350/hr, Sofia $275/hr, Diego $175/hr
- 3 workflow templates, 9 subtasks, 3 notes, 1 payment, 3 automation rules, 11 tax deadlines
