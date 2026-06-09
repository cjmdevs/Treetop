# Treetop Management — Pre-Release Hand-Test Checklist

Execute manually in the running app. Nothing here is pre-marked — check items only after
you've personally seen the expected result.

**Setup for most sections:** `npm run seed` in `server/`, then `npm run dev` in both
`server/` and `client/`. Sections 1–2 need `npm run seed:empty` instead (noted inline).

**⚠ THE INTERMITTENT FREEZE:** Keep DevTools Console open (F12) for the ENTIRE session,
in every window. If inputs ever stop responding, immediately screenshot/copy any red
console error plus what page you were on and what you clicked last. This bug is
un-diagnosed — the console error is what we need to fix it. In the packaged Electron
app, open DevTools with Ctrl+Shift+I if enabled, or test the same flows in the browser.

---

## 1. Bootstrap flow (fresh server)

Requires: `npm run seed:empty`, then restart the server.

- [ ] Server console prints a bootstrap token block on startup, and `server/BOOTSTRAP_TOKEN.txt` exists with the same token
- [ ] Client redirects to the bootstrap screen (login is impossible — no accounts exist)
- [ ] Wrong token → clear error, no account created
- [ ] Password under 8 chars → rejected with message
- [ ] Correct token + valid fields → admin account created, you land logged in
- [ ] `BOOTSTRAP_TOKEN.txt` is deleted/cleared after successful bootstrap
- [ ] Visiting `/bootstrap` again → "no longer available" style error (token is one-time)
- [ ] Restarting the server does NOT print a new bootstrap token

## 2. Invite keys + registration

Continue from section 1 (or use seed admin).

- [ ] Settings → Invite Keys: generate a key for a new staff user → raw key shown ONCE with a "save this" warning
- [ ] Key list shows the pending key but never the raw key again
- [ ] `/register` with the key + valid password → account created, logged in as staff
- [ ] Re-using the same key → "already been used" error
- [ ] Generate a second key, revoke it, try to redeem → "revoked" error
- [ ] Generating a key for a username that already exists → rejected

## 3. Login / logout / roles

Seed DB (`npm run seed`). Users: admin/admin123, manager/manager123, staff/staff123.

- [ ] Each of the three roles can log in; wrong password → "Invalid credentials"
- [ ] Sidebar matches role: staff sees only Time Tracking, Projects, Dashboard, Notes, Due Dates; manager adds Billing, AR, Staff, Reports; admin adds Settings
- [ ] Staff manually navigating to `#/settings` (URL bar) does NOT render the settings page
- [ ] Logout returns to login and a back-button press doesn't restore the session
- [ ] As admin, deactivate a test user (Settings → User Accounts) → that user's open session gets kicked to login on their next action

## 4. Server connection (LAN config)

- [ ] First launch with no stored server URL → Server Setup screen appears
- [ ] Entering an unreachable address → connection test fails with a clear message, URL not saved
- [ ] Entering the valid address → health check passes, app proceeds to login
- [ ] Changing the server address later (Settings → Server Connection) works and persists across restart
- [ ] Stop the server while logged in → app shows a sane error (no white screen) on next action

## 5. Electron desktop

Run `npm run electron:dev`, and ALSO repeat key items on the packaged installer build.

- [ ] App launches to the correct screen (Server Setup or Login)
- [ ] `window.__treetop__` is defined in DevTools console (preload working) — check this in the PACKAGED app especially
- [ ] Dashboard tile / module launcher opens a module in a NEW window (`/m/<key>` with header-only layout)
- [ ] Opening the same module twice focuses the existing window instead of spawning a duplicate
- [ ] Each module window works independently (navigate, create records)
- [ ] Logout from the main window closes ALL module windows and logs out everywhere
- [ ] External links open in the system browser, not inside Electron
- [ ] Close all windows → app exits cleanly (no zombie process in Task Manager)
- [ ] Packaged installer: installs without admin rights, app icon correct, version correct in About

## 6. Dashboard per role

- [ ] **Staff:** fresh staff account with zero data → dashboard renders (NO white screen), shows personal stats only
- [ ] **Staff:** no firm financials anywhere — no unbilled totals, no AR buckets, no other users' hours
- [ ] **Manager:** also personal-only dashboard (same rule as staff)
- [ ] **Admin:** full overview — active engagements, due this week, unbilled hours/amount, AR aging buckets, staff utilization, recent activity
- [ ] Admin dashboard numbers spot-check: unbilled amount matches Billing page's Unbilled total

## 7. Time tracking

Log in as staff.

- [ ] Log an entry: client, hours, service code, billable → appears in Daily view immediately
- [ ] Staff name field is locked to yourself (cannot log time as someone else)
- [ ] Rate auto-fills from staff rate / user default when left blank
- [ ] Daily grid shows entries for the selected date; calendar widget date-switch works
- [ ] Timesheet view shows your period grid with correct row/column totals
- [ ] Edit an entry (hours change) → totals update
- [ ] Delete an entry → gone after refresh
- [ ] BottomTabs as STAFF: MTD Hours and Time Release visible; **Period Summary and Alerts tabs are NOT shown**
- [ ] BottomTabs as ADMIN: all four tabs visible and populated
- [ ] MTD tab numbers match a hand-sum of your entries this month
- [ ] Multi-timer panel: start two timers, only one runs at a time (or per design), stopping a timer creates/fills an entry

## 8. Release flow + auto-billing

- [ ] As staff: release your own time for a date range → preview shows correct hours/amount before confirming
- [ ] After staff release: the release appears in your Time Release list; re-releasing the same range shows 0 new hours
- [ ] As admin: release another user's time by DATE RANGE (Period Summary → user → date range) → succeeds
- [ ] After an admin release: auto-billing summary appears showing records created per client with amounts
- [ ] Released entries are no longer editable/deletable by the staff member (verify as staff)
- [ ] Releasing the SAME entries again creates NO new billing records (check Billing page count before/after)

## 9. Billing / Invoices / AR

Log in as admin.

- [ ] Billing page lists records with Unbilled / Invoiced / Paid statuses and correct totals in summary cards
- [ ] Create a manual billing record → appears; the engagement's unbilled hours drop to zero (entries were claimed)
- [ ] Generate an invoice from a billing record → invoice number `TRT-YYYY-NNNN` increments correctly
- [ ] Invoice view shows the FIRM NAME and address from Settings → Firm Branding (not a hardcoded name)
- [ ] Invoice line items do NOT show staff names to the client-facing layout (verify in print/PDF view)
- [ ] Invoice line items sum to the invoice subtotal; tax math correct at a non-zero tax rate
- [ ] Mark a record Invoiced → Paid: it stays in the ledger, disappears from AR outstanding/aging
- [ ] AR page: aging buckets (current / 31–60 / 61–90 / 90+) match invoice dates you set
- [ ] Client search in AR filters correctly; same in Billing
- [ ] Record a payment against a client → shows in Collections; deleting a billing record does NOT orphan its time entries (they become billable again — check unbilled hours rises)

## 10. Projects / Engagements / Contacts

- [ ] All three roles can view and edit projects, engagements, contacts
- [ ] Assignee/staff pickers show REAL user accounts only (no test names like "Sam StaffA", no free-text ghosts)
- [ ] Create contact (individual + business types) → all fields persist after save + reload
- [ ] Project status change syncs to the Contacts detail view and Engagements list (no stale status)
- [ ] Project list filters (status, type, staff) work and combine correctly
- [ ] Deleting an engagement with time entries: confirm intended behavior (warns or cascades — should not leave orphan entries crashing pages)
- [ ] ContactDetail renders for a contact with NO projects/activity (no white screen)

## 11. Reports

Log in as admin (and spot-check as manager).

- [ ] Client autocomplete search hits the server (type partial name → suggestions) and filters report rows
- [ ] Staff dropdown filter shows real accounts and filters correctly
- [ ] Each report type renders with seed data: Staff Productivity, Time by Service Code, Time by Client, WIP, Invoice Register, Collections, AR Aging, Client Balance, Engagement Status, Budget Variance, Overdue, Staff Workload, Timesheet, Time Release Summary, Unreleased Time, Staff Detail
- [ ] Date range filters change the data (set a range with known entries vs an empty range)
- [ ] A report with zero rows renders an empty state, not a crash
- [ ] Released/unreleased filter on time reports changes results

## 12. Settings (admin)

- [ ] Client types: add a new type → it appears in the list immediately WITHOUT a manual refresh, and shows up in contact forms
- [ ] Custom fields: add a field (each type: text/dropdown/etc.) → appears on the target entity form; values save and reload
- [ ] Staff rates: add a rate with an effective date → new time entries pick it up
- [ ] Service codes: add/deactivate → deactivated codes stop appearing in entry form
- [ ] Firm branding: change firm name/address → invoice view reflects it immediately
- [ ] User accounts: create, edit role, deactivate/reactivate
- [ ] Invite keys section: generate/revoke (already covered in §2 — just confirm reachable)
- [ ] Automations: rules list renders; toggling active state persists

## 13. Notes / Due Dates / Search / Activity

- [ ] Create, pin, and delete a note; pinned notes sort first
- [ ] Due Dates page renders tax deadlines + engagement due dates
- [ ] Topbar global search returns contacts/projects/engagements and navigates correctly
- [ ] Activity log shows recent actions with the acting user's name

## 14. Multi-user smoke (two machines or two browsers)

- [ ] Two users logged in simultaneously can both work without clobbering each other
- [ ] Admin releases user A's time while user A is logged in → user A sees released status after refresh
- [ ] LAN client (second machine pointing at server IP) can do a full login → log time → view dashboard loop

---

## Recording results

For each FAILED item note: section + item, what you did, what you expected, what happened,
and any console error (especially for the freeze). That list becomes the fix queue.
