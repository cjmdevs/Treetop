const db = require('./database');

function migrate() {
  const engCols = db.prepare('PRAGMA table_info(engagements)').all().map(c => c.name);
  if (!engCols.includes('budgeted_hours'))
    db.exec('ALTER TABLE engagements ADD COLUMN budgeted_hours REAL');
  if (!engCols.includes('budgeted_amount'))
    db.exec('ALTER TABLE engagements ADD COLUMN budgeted_amount REAL');
  if (!engCols.includes('recurrence_frequency'))
    db.exec("ALTER TABLE engagements ADD COLUMN recurrence_frequency TEXT NOT NULL DEFAULT 'None'");
  if (!engCols.includes('template_id'))
    db.exec('ALTER TABLE engagements ADD COLUMN template_id INTEGER');

  const teCols = db.prepare('PRAGMA table_info(time_entries)').all().map(c => c.name);
  if (!teCols.includes('service_code'))
    db.exec('ALTER TABLE time_entries ADD COLUMN service_code TEXT');
  if (!teCols.includes('pay_period_id'))
    db.exec('ALTER TABLE time_entries ADD COLUMN pay_period_id INTEGER');
  if (!teCols.includes('internal_memo'))
    db.exec('ALTER TABLE time_entries ADD COLUMN internal_memo INTEGER NOT NULL DEFAULT 0');
  if (!teCols.includes('entry_status'))
    db.exec("ALTER TABLE time_entries ADD COLUMN entry_status TEXT NOT NULL DEFAULT 'draft'");
  if (!teCols.includes('user_id'))
    db.exec('ALTER TABLE time_entries ADD COLUMN user_id INTEGER REFERENCES users(id)');

  const scCols = db.prepare('PRAGMA table_info(service_codes)').all().map(c => c.name);
  if (!scCols.includes('number'))
    db.exec('ALTER TABLE service_codes ADD COLUMN number TEXT');
  if (!scCols.includes('category'))
    db.exec("ALTER TABLE service_codes ADD COLUMN category TEXT NOT NULL DEFAULT 'Other'");
  if (!scCols.includes('subcategory'))
    db.exec('ALTER TABLE service_codes ADD COLUMN subcategory TEXT');
  if (!scCols.includes('default_rate'))
    db.exec('ALTER TABLE service_codes ADD COLUMN default_rate REAL');
  if (!scCols.includes('billable_default'))
    db.exec('ALTER TABLE service_codes ADD COLUMN billable_default INTEGER NOT NULL DEFAULT 1');
  if (!scCols.includes('active'))
    db.exec('ALTER TABLE service_codes ADD COLUMN active INTEGER NOT NULL DEFAULT 1');

  // time_releases table (added 2026-05-22)
  const trTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='time_releases'").get();
  if (!trTable) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS time_releases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        total_hours REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL DEFAULT 0,
        released_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  }

  // Back-fill user_id on time_entries that were seeded without it (seed ran before users)
  db.exec(`
    UPDATE time_entries
    SET user_id = (
      SELECT id FROM users WHERE full_name = time_entries.staff_member LIMIT 1
    )
    WHERE user_id IS NULL
  `);

  // Billing address columns on contacts (added 2026-05-27, now legacy)
  const contactCols = db.prepare('PRAGMA table_info(contacts)').all().map(c => c.name);
  if (!contactCols.includes('billing_address_1'))
    db.exec('ALTER TABLE contacts ADD COLUMN billing_address_1 TEXT');
  if (!contactCols.includes('billing_address_2'))
    db.exec('ALTER TABLE contacts ADD COLUMN billing_address_2 TEXT');
  if (!contactCols.includes('billing_city'))
    db.exec('ALTER TABLE contacts ADD COLUMN billing_city TEXT');
  if (!contactCols.includes('billing_state'))
    db.exec('ALTER TABLE contacts ADD COLUMN billing_state TEXT');
  if (!contactCols.includes('billing_zip'))
    db.exec('ALTER TABLE contacts ADD COLUMN billing_zip TEXT');
  if (!contactCols.includes('billing_country'))
    db.exec('ALTER TABLE contacts ADD COLUMN billing_country TEXT');

  // Mailing address columns on contacts — renamed from billing_* (2026-05-27)
  if (!contactCols.includes('mailing_address_1'))
    db.exec('ALTER TABLE contacts ADD COLUMN mailing_address_1 TEXT');
  if (!contactCols.includes('mailing_address_2'))
    db.exec('ALTER TABLE contacts ADD COLUMN mailing_address_2 TEXT');
  if (!contactCols.includes('mailing_city'))
    db.exec('ALTER TABLE contacts ADD COLUMN mailing_city TEXT');
  if (!contactCols.includes('mailing_state'))
    db.exec('ALTER TABLE contacts ADD COLUMN mailing_state TEXT');
  if (!contactCols.includes('mailing_zip'))
    db.exec('ALTER TABLE contacts ADD COLUMN mailing_zip TEXT');
  if (!contactCols.includes('mailing_country'))
    db.exec('ALTER TABLE contacts ADD COLUMN mailing_country TEXT');

  // One-time copy: migrate any existing billing_* data into mailing_* columns
  db.exec(`
    UPDATE contacts
    SET
      mailing_address_1 = COALESCE(mailing_address_1, billing_address_1),
      mailing_address_2 = COALESCE(mailing_address_2, billing_address_2),
      mailing_city      = COALESCE(mailing_city, billing_city),
      mailing_state     = COALESCE(mailing_state, billing_state),
      mailing_zip       = COALESCE(mailing_zip, billing_zip),
      mailing_country   = COALESCE(mailing_country, billing_country)
    WHERE billing_address_1 IS NOT NULL AND mailing_address_1 IS NULL
  `);

  // client_type column on contacts (added 2026-05-27)
  if (!contactCols.includes('client_type'))
    db.exec('ALTER TABLE contacts ADD COLUMN client_type TEXT');

  // contact_client_types table (added 2026-05-27)
  const cctTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contact_client_types'").get();
  if (!cctTable) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS contact_client_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1
      )
    `);
  }

  // projects table (added 2026-05-29)
  const projectsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").get();
  if (!projectsTable) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        engagement_id INTEGER NOT NULL,
        client_name TEXT NOT NULL,
        project_type TEXT,
        entity_type TEXT,
        period_label TEXT,
        fiscal_year_end TEXT,
        status TEXT NOT NULL DEFAULT 'Not Started',
        original_due TEXT,
        current_due TEXT,
        start_date TEXT,
        delivered_date TEXT,
        completed_date TEXT,
        extended INTEGER NOT NULL DEFAULT 0,
        client_number TEXT,
        engagement_number TEXT,
        primary_partner TEXT,
        manager TEXT,
        preparer TEXT,
        reviewer TEXT,
        in_charge TEXT,
        budgeted_hours REAL,
        budgeted_amount REAL,
        priority TEXT NOT NULL DEFAULT 'Normal',
        prior_project_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE CASCADE,
        FOREIGN KEY (prior_project_id) REFERENCES projects(id) ON DELETE SET NULL
      )
    `);
  }

  // project_id on time_entries (added 2026-05-29)
  const teCols2 = db.prepare('PRAGMA table_info(time_entries)').all().map(c => c.name);
  if (!teCols2.includes('project_id'))
    db.exec('ALTER TABLE time_entries ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL');

  // project_id on billing_records (added 2026-05-29)
  const brCols = db.prepare('PRAGMA table_info(billing_records)').all().map(c => c.name);
  if (!brCols.includes('project_id'))
    db.exec('ALTER TABLE billing_records ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL');

  // project_id on subtasks (added 2026-05-29)
  const stCols = db.prepare('PRAGMA table_info(subtasks)').all().map(c => c.name);
  if (!stCols.includes('project_id'))
    db.exec('ALTER TABLE subtasks ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE');

  // user_preferences table (added 2026-05-29)
  const upTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_preferences'").get();
  if (!upTable) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        pref_key TEXT NOT NULL,
        pref_value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, pref_key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  }

  // pay_period_user_status table (added 2026-05-21)
  const ppusTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pay_period_user_status'").get();
  if (!ppusTable) {
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
}

module.exports = { migrate };
