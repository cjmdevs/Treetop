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

- [x ] Server console prints a bootstrap token block on startup, and `server/BOOTSTRAP_TOKEN.txt` exists with the same token
- [ x] Client redirects to the bootstrap screen (login is impossible — no accounts exist)
- [ x] Wrong token → clear error, no account created
- [x ] Password under 8 chars → rejected with message
- [x ] Correct token + valid fields → admin account created, you land logged in
- [ x] `BOOTSTRAP_TOKEN.txt` is deleted/cleared after successful bootstrap
- [ x] Visiting `/bootstrap` again → "no longer available" style error (token is one-time)
- [ x] Restarting the server does NOT print a new bootstrap token

## 2. Invite keys + registration

Continue from section 1 (or use seed admin).

- [ x] Settings → Invite Keys: generate a key for a new staff user → raw key shown ONCE with a "save this" warning
- [ x] Key list shows the pending key but never the raw key again
- [ x] `/register` with the key + valid password → account created, logged in as staff
- [x ] Re-using the same key → "already been used" error
- [ x] Generate a second key, revoke it, try to redeem → "revoked" error
- [x ] Generating a key for a username that already exists → rejected

## 3. Login / logout / roles

Seed DB (`npm run seed`). Users: admin/admin123, manager/manager123, staff/staff123.

- [ x] Each of the three roles can log in; wrong password → "Invalid credentials"
- [x ] Sidebar matches role: staff sees only Time Tracking, Projects, Dashboard, Notes, Due Dates; manager adds Billing, AR, Staff, Reports; admin adds Settings
- [ x] Staff manually navigating to `#/settings` (URL bar) does NOT render the settings page
- [x ] Logout returns to login and a back-button press doesn't restore the session
- [ x] As admin, deactivate a test user (Settings → User Accounts) → that user's open session gets kicked to login on their next action

## 4. Server connection (LAN config)

- [ x] First launch with no stored server URL → Server Setup screen appears
- [x ] Entering an unreachable address → connection test fails with a clear message, URL not saved
- [x ] Entering the valid address → health check passes, app proceeds to login
- [x ] Changing the server address later (Settings → Server Connection) works and persists across restart
- [ x] Stop the server while logged in → app shows a sane error (no white screen) on next action

## 5. Electron desktop

Run `npm run electron:dev`, and ALSO repeat key items on the packaged installer build.

- [ x] App launches to the correct screen (Server Setup or Login)
- [x ] `window.__treetop__` is defined in DevTools console (preload working) — check this in the PACKAGED app especially
- [ x] Dashboard tile / module launcher opens a module in a NEW window (`/m/<key>` with header-only layout)
- [ x] Opening the same module twice focuses the existing window instead of spawning a duplicate
- [x ] Each module window works independently (navigate, create records)
- [x ] Logout from the main window closes ALL module windows and logs out everywhere
- [x ] External links open in the system browser, not inside Electron
- [x ] Close all windows → app exits cleanly (no zombie process in Task Manager)
- [ x] Packaged installer: installs without admin rights, app icon correct, version correct in About

## 6. Dashboard per role

- [ x] **Staff:** fresh staff account with zero data → dashboard renders (NO white screen), shows personal stats only
- [x ] **Staff:** no firm financials anywhere — no unbilled totals, no AR buckets, no other users' hours
- [x ] **Manager:** also personal-only dashboard (same rule as staff)
- [ x] **Admin:** full overview — active engagements, due this week, unbilled hours/amount, AR aging buckets, staff utilization, recent activity
- [x ] Admin dashboard numbers spot-check: unbilled amount matches Billing page's Unbilled total

## 7. Time tracking

Log in as staff.

- [ x] Log an entry: client, hours, service code, billable → appears in Daily view immediately
- [ x] Staff name field is locked to yourself (cannot log time as someone else)
- [ x] Rate auto-fills from staff rate / user default when left blank
- [ x] Daily grid shows entries for the selected date; calendar widget date-switch works
- [ x] Timesheet view shows your period grid with correct row/column totals
- [ ] Edit an entry (hours change) → totals update
- [ x] Delete an entry → gone after refresh
- [x ] BottomTabs as STAFF: MTD Hours and Time Release visible; **Period Summary and Alerts tabs are NOT shown**
- [ x] BottomTabs as ADMIN: all four tabs visible and populated
- [x ] MTD tab numbers match a hand-sum of your entries this month
- [ ] Multi-timer panel: start two timers, only one runs at a time (or per design), stopping a timer creates/fills an entry

Noticed Bug: Time tracks across log in accounts if you log out of one account and log in with another the time stays. Also you can have mutiple timers running and cannot edit time entrys the button does not work.

## 8. Release flow + auto-billing

- [x ] As staff: release your own time for a date range → preview shows correct hours/amount before confirming
- [ x] After staff release: the release appears in your Time Release list; re-releasing the same range shows 0 new hours
- [ ] As admin: release another user's time by DATE RANGE (Period Summary → user → date range) → succeeds
- [ x] After an admin release: auto-billing summary appears showing records created per client with amounts
- [x ] Released entries are no longer editable/deletable by the staff member (verify as staff)
- [ ] Releasing the SAME entries again creates NO new billing records (check Billing page count before/after)


Got this error when releasing time index-9DXkhMPO.js:80 Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'error')
    at G (index-9DXkhMPO.js:80:13078)

    it also doesnt confirm time release so you can release mutiple times until refreshed. Same goes for releasing another person time. Also it doesnt update the release history when you release someone elses time in period summary its updated but not release history under time release. I cant rlease the same entries it gives no entries found for this data range on last test.

## 9. Billing / Invoices / AR

Log in as admin.

- [ x] Billing page lists records with Unbilled / Invoiced / Paid statuses and correct totals in summary cards
- [x ] Create a manual billing record → appears; the engagement's unbilled hours drop to zero (entries were claimed)
- [x ] Generate an invoice from a billing record → invoice number `TRT-YYYY-NNNN` increments correctly
- [x ] Invoice view shows the FIRM NAME and address from Settings → Firm Branding (not a hardcoded name)
- [x ] Invoice line items do NOT show staff names to the client-facing layout (verify in print/PDF view)
- [ x] Invoice line items sum to the invoice subtotal; tax math correct at a non-zero tax rate
- [x ] Mark a record Invoiced → Paid: it stays in the ledger, disappears from AR outstanding/aging
- [x ] AR page: aging buckets (current / 31–60 / 61–90 / 90+) match invoice dates you set
- [ x] Client search in AR filters correctly; same in Billing
- [ ] Record a payment against a client → shows in Collections; deleting a billing record does NOT orphan its time entries (they become billable again — check unbilled hours rises)

Recording a payment manually makes you enter client name manually no auto pop up so i dont know if it syncs to systems.

save branding in settings give no confirmation of save. the generate invoice shows all prior amounts but the one you choose is the final amount this is what invoice looks like Apex Industries LLC

Invoice Date
2026-06-09
Due Date
2026-07-09
Description	Date	Code	Hrs	Rate	Amount
Reviewed prior year return	2026-05-12	TAX-PREP	3.5	$250	$875
Depreciation schedule prep	2026-05-13	TAX-PREP	2	$250	$500
Tax return preparation	2026-05-14	TAX-PREP	4.5	$250	$1,125
Final review and client call	2026-05-15	TAX-REVIEW	8	$250	$2,000
Tax Return	2026-06-09	ADMIN	1.75	$175	$306.25
Subtotal
$2,500
Total
$2,500

## 10. Projects / Engagements / Contacts

- [x ] All three roles can view and edit projects, engagements, contacts
- [x ] Assignee/staff pickers show REAL user accounts only (no test names like "Sam StaffA", no free-text ghosts)
- [ x] Create contact (individual + business types) → all fields persist after save + reload
- [x ] Project status change syncs to the Contacts detail view and Engagements list (no stale status)
- [x ] Project list filters (status, type, staff) work and combine correctly
- [x ] Deleting an engagement with time entries: confirm intended behavior (warns or cascades — should not leave orphan entries crashing pages)
- [x ] ContactDetail renders for a contact with NO projects/activity (no white screen)

I dont think it spossible to delete an engangment. 
## 11. Reports

Log in as admin (and spot-check as manager).

- [x ] Client autocomplete search hits the server (type partial name → suggestions) and filters report rows
- [x ] Staff dropdown filter shows real accounts and filters correctly
- [ x] Each report type renders with seed data: Staff Productivity, Time by Service Code, Time by Client, WIP, Invoice Register, Collections, AR Aging, Client Balance, Engagement Status, Budget Variance, Overdue, Staff Workload, Timesheet, Time Release Summary, Unreleased Time, Staff Detail
- [ ] Date range filters change the data (set a range with known entries vs an empty range)
- [x ] A report with zero rows renders an empty state, not a crash
- [x ] Released/unreleased filter on time reports changes results

Time by client doesnt have a way to search for clients, also Unreleased Time2026-06-01 — 2026-06-09 · 3 rows
Admin	2026-05-12	2026-05-16	29.0h
Manager	2026-05-14	2026-06-08	3.0h
Staff	2026-05-13	2026-05-20	7.0h

in unreleased time im seeing time from those dates but filter shows diffrent dates. 
## 12. Settings (admin)

- [X ] Client types: add a new type → it appears in the list immediately WITHOUT a manual refresh, and shows up in contact forms
- [ x] Custom fields: add a field (each type: text/dropdown/etc.) → appears on the target entity form; values save and reload
- [ x] Staff rates: add a rate with an effective date → new time entries pick it up
- [ x] Service codes: add/deactivate → deactivated codes stop appearing in entry form
- [ x] Firm branding: change firm name/address → invoice view reflects it immediately
- [ x] User accounts: create, edit role, deactivate/reactivate
- [ x] Invite keys section: generate/revoke (already covered in §2 — just confirm reachable)
- [x ] Automations: rules list renders; toggling active state persists

STAFF RATEs dont update until reload. Maybe make it where admin cant reset password of another staff but maybe create like a new key for user to reset password if they forgot.

## 13. Notes / Due Dates / Search / Activity

- [ x] Create, pin, and delete a note; pinned notes sort first
- [ x] Due Dates page renders tax deadlines + engagement due dates
- [ ] Topbar global search returns contacts/projects/engagements and navigates correctly
- [ ] Activity log shows recent actions with the acting user's name

maybe make notes more dynmaic in fact that you can choose client in note section right now its just by entity id.

due dates page gives these errors:index-9DXkhMPO.js:89  GET file:///C:/api/due-dates/tax-deadlines net::ERR_FILE_NOT_FOUND
(anonymous) @ index-9DXkhMPO.js:89
Ml @ index-9DXkhMPO.js:40
In @ index-9DXkhMPO.js:40
J0 @ index-9DXkhMPO.js:40
Ks @ index-9DXkhMPO.js:40
fu @ index-9DXkhMPO.js:40
Is @ index-9DXkhMPO.js:38
(anonymous) @ index-9DXkhMPO.js:40
index-9DXkhMPO.js:89  Uncaught (in promise) TypeError: Failed to fetch
    at index-9DXkhMPO.js:89:936
    at Ml (index-9DXkhMPO.js:40:24263)
    at In (index-9DXkhMPO.js:40:42318)
    at J0 (index-9DXkhMPO.js:40:41166)
    at Ks (index-9DXkhMPO.js:40:40215)
    at fu (index-9DXkhMPO.js:40:36825)
    at Is (index-9DXkhMPO.js:38:3274)
    at index-9DXkhMPO.js:40:34207

    and sometimes renders white. top bar global search should get completly removed i think it may confuse some people. ACtibity section still not showing everything like when you mark efile auth recorded that should be put into actibvity section and maybe lets add a intitals section to user accounts so when any activity gets added it gives intitals with it aswell.
## 14. Multi-user smoke (two machines or two browsers)

- [ x] Two users logged in simultaneously can both work without clobbering each other
- [ hanvnt tested. ] Admin releases user A's time while user A is logged in → user A sees released status after refresh
- [x ] LAN client (second machine pointing at server IP) can do a full login → log time → view dashboard loop

---

## Recording results

For each FAILED item note: section + item, what you did, what you expected, what happened,
and any console error (especially for the freeze). That list becomes the fix queue.
