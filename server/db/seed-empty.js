/**
 * seed-empty.js
 *
 * Initializes the database schema with NO users and NO demo data.
 * Use this to test the full bootstrap → invite → registration flow from scratch.
 *
 * Usage:
 *   cd server && npm run seed:empty
 *
 * After running this script:
 *   1. npm run dev              — server starts, detects no admin, prints bootstrap token
 *   2. Go to the app in a browser — it redirects to /bootstrap
 *   3. Enter the token to create the first admin account
 *   4. Generate invite keys from Settings → Invite Keys
 *   5. Redeem an invite key via /register to create additional users
 *
 * NOTE: The normal `npm run seed` (demo data, 4 users) is still available for
 * regular development.  This script is only for testing the provisioning flow.
 */

const db = require('./database')
const { initializeDatabase } = require('./schema')

initializeDatabase()

// Wipe all data (FK constraints off so order doesn't matter)
db.pragma('foreign_keys = OFF')
db.exec(`
  DELETE FROM users;
  DELETE FROM custom_field_values;
  DELETE FROM custom_field_definitions;
  DELETE FROM invoice_line_items;
  DELETE FROM invoices;
  DELETE FROM payments;
  DELETE FROM notes;
  DELETE FROM subtasks;
  DELETE FROM template_subtasks;
  DELETE FROM workflow_templates;
  DELETE FROM service_codes;
  DELETE FROM billing_records;
  DELETE FROM time_entries;
  DELETE FROM engagements;
  DELETE FROM staff_rates;
  DELETE FROM pay_periods;
  DELETE FROM automation_rules;
  DELETE FROM tax_deadlines;
  DELETE FROM project_custom_field_values;
  DELETE FROM project_statuses;
  DELETE FROM contact_activity_log;
  DELETE FROM contact_tags;
  DELETE FROM contact_staff_assignments;
  DELETE FROM contact_affiliates;
  DELETE FROM contacts;
  DELETE FROM contact_client_types;
  DELETE FROM projects;
  DELETE FROM invite_keys;
  DELETE FROM app_meta;
  DELETE FROM user_preferences;
  DELETE FROM pay_period_user_status;
  DELETE FROM activity_log;
  DELETE FROM time_releases;
`)
db.pragma('foreign_keys = ON')

console.log('Empty database ready — no users, no data.')
console.log('Start the server (npm run dev) to generate a bootstrap token.')
