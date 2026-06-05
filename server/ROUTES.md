# Treetop Management API Routes

Base URL: `http://localhost:3001`

## Engagements
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/engagements | List all (filters: status, assigned_staff, priority, search, page, limit) |
| POST | /api/engagements | Create engagement |
| GET | /api/engagements/:id | Get single with subtasks, time entries, billing |
| PUT | /api/engagements/:id | Update engagement |
| DELETE | /api/engagements/:id | Delete engagement |
| PATCH | /api/engagements/bulk | Bulk status/staff update |

## Subtasks
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/engagements/:engId/subtasks | List subtasks for engagement |
| POST | /api/engagements/:engId/subtasks | Create subtask |
| PUT | /api/engagements/:engId/subtasks/:id | Update subtask |
| DELETE | /api/engagements/:engId/subtasks/:id | Delete subtask |

## Time Entries
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/time-entries | List (filters: engagement_id, staff_member, date_from, date_to, pay_period_id, billable, entry_status, service_code) |
| POST | /api/time-entries | Create (pay_period_id auto-assigned from date) |
| PUT | /api/time-entries/:id | Update |
| DELETE | /api/time-entries/:id | Delete |
| PATCH | /api/time-entries/bulk | Bulk update billable flag |
| PATCH | /api/time-entries/:id/status | Change entry_status (draft → submitted → released) |

## Pay Periods
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/pay-periods | List all (optional ?year=) |
| GET | /api/pay-periods/current | Current period for today |
| GET | /api/pay-periods/:id | Get single period |
| POST | /api/pay-periods/generate | Generate 26 periods for { year } |
| PATCH | /api/pay-periods/:id/status | Update status (Open/Submitted/Released/Locked) |

## Staff Rates
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/staff-rates | List all (optional ?staff_member=) |
| GET | /api/staff-rates/current | Latest rate per staff member |
| POST | /api/staff-rates | Add rate entry { staff_member, hourly_rate, effective_date } |
| DELETE | /api/staff-rates/:id | Delete rate entry |

## Time Summary
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/time-summary/mtd | Month-to-date hours by staff + by engagement |
| GET | /api/time-summary/period/:periodId | Biweekly grid: staff × day matrix with totals |
| GET | /api/time-summary/alerts | Unreleased periods, low hours, missing staff, over-budget |

## Service Codes
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/service-codes | List active codes (?include_inactive=true for all) |
| POST | /api/service-codes | Create (code, description, number, category, subcategory, default_rate, billable_default) |
| PUT | /api/service-codes/:id | Update |
| PATCH | /api/service-codes/:id/toggle | Toggle active/inactive |
| DELETE | /api/service-codes/:id | Delete (409 if in use by time entries — deactivate instead) |

## Billing
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/billing | List all billing records |
| POST | /api/billing | Create billing record |
| PUT | /api/billing/:id | Update |
| PATCH | /api/billing/:id/status | Change billing status |
| DELETE | /api/billing/:id | Delete |

## Staff
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/staff/dashboard | Staff cards with active engagements + weekly hours |
| GET | /api/staff/:name | Staff detail: utilization, 8-week chart, top clients |

## Reports
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/reports | Run report (?type=, plus type-specific params) |

## Other
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/dashboard | Dashboard summary stats |
| GET | /api/notes | List notes (entity_type, entity_id filters) |
| POST | /api/notes | Create note |
| PUT | /api/notes/:id | Update note |
| DELETE | /api/notes/:id | Delete note |
| GET | /api/search?q= | Global search |
| GET | /api/activity | Activity log |
| GET | /api/due-dates | Upcoming due dates + tax deadlines |
| GET | /api/templates | Workflow templates |
| GET | /api/invoices | Invoices |
| GET | /api/payments | Payments |
| GET | /api/automations | Automation rules |
| GET | /api/custom-fields | Custom field definitions + values |

## Contacts
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/contacts | List contacts (filters: search, status, type, entity_type, client_type, tag, staff, page, limit) |
| POST | /api/contacts | Create contact (all fields; sensitive fields masked on return) |
| GET | /api/contacts/meta/tags | All distinct tags in use across contacts |
| GET | /api/contacts/meta/client-types | All active client types (from contact_client_types table) |
| GET | /api/contacts/:id | Get single contact with full details, staff assignments, affiliates, tags, recent activity |
| PUT | /api/contacts/:id | Update contact |
| DELETE | /api/contacts/:id | Delete contact |
| GET | /api/contacts/:id/reveal-sensitive | Return unmasked SSN/EIN for authorized users |
| POST | /api/contacts/:id/activity | Log an activity entry { type, notes, date } |
| POST | /api/contacts/:id/affiliates | Add affiliate relationship { related_contact_id, relationship_type } |
| DELETE | /api/contacts/:id/affiliates/:relId | Remove affiliate relationship |
| POST | /api/contacts/:id/tags | Add tag { tag } |
| DELETE | /api/contacts/:id/tags/:tag | Remove tag |
| PUT | /api/contacts/:id/staff-assignments | Replace staff assignment list { assignments: [{ user_id, role }] } |

## Contact Client Types
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/contact-client-types | List client types (?include_inactive=true for all; default active only) |
| POST | /api/contact-client-types | Create { code, label, sort_order } (400 if code already exists) |
| PUT | /api/contact-client-types/:id | Update any fields (code, label, sort_order, active) |
| DELETE | /api/contact-client-types/:id | Delete (409 if code is assigned to any contacts — deactivate instead) |
