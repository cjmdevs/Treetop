const db = require('./database');

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS engagements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL,
      engagement_type TEXT NOT NULL,
      tax_year INTEGER,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'Not Started',
      assigned_staff TEXT,
      priority TEXT NOT NULL DEFAULT 'Medium',
      notes TEXT,
      budgeted_hours REAL,
      budgeted_amount REAL,
      recurrence_frequency TEXT NOT NULL DEFAULT 'None',
      template_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      staff_member TEXT NOT NULL,
      date TEXT NOT NULL,
      hours REAL NOT NULL,
      billing_rate REAL,
      notes TEXT,
      billable INTEGER NOT NULL DEFAULT 1,
      service_code TEXT,
      pay_period_id INTEGER,
      internal_memo INTEGER NOT NULL DEFAULT 0,
      entry_status TEXT NOT NULL DEFAULT 'draft',
      user_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS billing_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      invoice_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Unbilled',
      invoice_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      assigned_staff TEXT,
      status TEXT NOT NULL DEFAULT 'Not Started',
      due_date TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workflow_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      engagement_type TEXT NOT NULL,
      default_priority TEXT NOT NULL DEFAULT 'Medium',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS template_subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      default_assignee_role TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      note_text TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      priority_flag INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS service_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      number TEXT,
      category TEXT NOT NULL DEFAULT 'Other',
      subcategory TEXT,
      default_rate REAL,
      billable_default INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_name TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'Check',
      reference_number TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      billing_record_id INTEGER,
      engagement_id INTEGER,
      client_name TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      due_date TEXT,
      tax_rate REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (billing_record_id) REFERENCES billing_records(id) ON DELETE SET NULL,
      FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      date TEXT,
      service_code TEXT,
      staff_member TEXT,
      hours REAL,
      rate REAL,
      amount REAL NOT NULL,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS custom_field_definitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      field_name TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'Text',
      dropdown_options TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS custom_field_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engagement_id INTEGER NOT NULL,
      field_definition_id INTEGER NOT NULL,
      value TEXT,
      UNIQUE(engagement_id, field_definition_id),
      FOREIGN KEY (engagement_id) REFERENCES engagements(id) ON DELETE CASCADE,
      FOREIGN KEY (field_definition_id) REFERENCES custom_field_definitions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS automation_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      trigger_config TEXT NOT NULL DEFAULT '{}',
      action_type TEXT NOT NULL,
      action_config TEXT NOT NULL DEFAULT '{}',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      staff_member TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tax_deadlines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month INTEGER NOT NULL,
      day INTEGER NOT NULL,
      description TEXT NOT NULL,
      form_types TEXT,
      applies_to TEXT
    );

    CREATE TABLE IF NOT EXISTS pay_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period_number INTEGER NOT NULL,
      year INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Open',
      released_by TEXT,
      released_at TEXT,
      UNIQUE(year, period_number)
    );

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

    CREATE TABLE IF NOT EXISTS staff_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_member TEXT NOT NULL,
      hourly_rate REAL NOT NULL,
      effective_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS time_releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      total_hours REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      released_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'staff',
      default_hourly_rate REAL NOT NULL DEFAULT 0,
      rate_effective_date TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'individual',
      status TEXT NOT NULL DEFAULT 'active',
      display_name TEXT,
      first_name TEXT,
      last_name TEXT,
      ssn TEXT,
      spouse_first_name TEXT,
      spouse_last_name TEXT,
      spouse_ssn TEXT,
      date_of_birth TEXT,
      business_name TEXT,
      entity_type TEXT,
      federal_ein TEXT,
      fye_month INTEGER,
      client_code TEXT UNIQUE,
      client_type TEXT,
      address_1 TEXT,
      address_2 TEXT,
      address_3 TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      country TEXT NOT NULL DEFAULT 'USA',
      mailing_address_1 TEXT,
      mailing_address_2 TEXT,
      mailing_city TEXT,
      mailing_state TEXT,
      mailing_zip TEXT,
      mailing_country TEXT,
      phone_1 TEXT,
      phone_1_label TEXT DEFAULT 'Mobile',
      phone_2 TEXT,
      phone_2_label TEXT DEFAULT 'Office',
      phone_3 TEXT,
      phone_3_label TEXT DEFAULT 'Home',
      fax TEXT,
      email_primary TEXT,
      email_secondary TEXT,
      website TEXT,
      referral_source TEXT,
      referred_by_contact_id INTEGER,
      naic_code TEXT,
      line_of_business TEXT,
      department TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER,
      FOREIGN KEY (referred_by_contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS contact_affiliates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      affiliated_contact_id INTEGER NOT NULL,
      relationship_label TEXT,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (affiliated_contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS contact_staff_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      UNIQUE(contact_id, role),
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS contact_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      UNIQUE(contact_id, tag),
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS contact_activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      user_id INTEGER,
      activity_type TEXT NOT NULL DEFAULT 'note',
      title TEXT NOT NULL,
      body TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS contact_client_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
  `);
}

module.exports = { initializeDatabase };
