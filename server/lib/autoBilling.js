/**
 * autoBilling.js — central auto-billing helpers
 *
 * Two exported functions:
 *
 *   autoBillReleasedEntries(entryIds, releaseDate)
 *     Called by every release path. Creates one billing_record per engagement
 *     for the given just-released entry IDs. Transactional (record + stamps).
 *
 *   claimEntriesForBillingRecord(recordId, engagementId)
 *     Called by manual billing (POST /api/billing). Given an already-created
 *     billing record, stamps all currently-unbilled billable entries for that
 *     engagement onto it. Use inside the caller's transaction (better-sqlite3
 *     promotes this to a SAVEPOINT automatically when nested).
 *
 * Double-bill guard: both functions only touch entries where billing_record_id IS NULL.
 * Once stamped, an entry is permanently claimed and never touched again.
 */

const db = require('../db/database');

/**
 * @param {number[]} entryIds   IDs of time entries just transitioned to released
 * @param {string}   releaseDate ISO date string (YYYY-MM-DD) used as invoice_date
 * @returns {{ created: Array<{engagement_id, client_name, count, amount, billing_record_id}>, totalAmount: number }}
 */
function autoBillReleasedEntries(entryIds, releaseDate) {
  if (!entryIds?.length) return { created: [], totalAmount: 0, skipped: [] };

  const placeholders = entryIds.map(() => '?').join(',');

  // Billable, unstamped, with a positive rate — these get auto-billed
  const eligible = db.prepare(`
    SELECT te.id,
           te.engagement_id,
           te.hours,
           te.billing_rate,
           e.client_name
    FROM   time_entries te
    JOIN   engagements  e  ON e.id = te.engagement_id
    WHERE  te.id IN (${placeholders})
      AND  te.billable             = 1
      AND  te.billing_record_id   IS NULL
      AND  COALESCE(te.billing_rate, 0) > 0
  `).all(...entryIds);

  // Billable, unstamped, but NULL/zero rate — excluded to prevent silent $0 billing.
  // Left unstamped so they remain billable once a rate is assigned.
  const noRateRows = db.prepare(`
    SELECT te.id, te.engagement_id, te.hours
    FROM   time_entries te
    WHERE  te.id IN (${placeholders})
      AND  te.billable             = 1
      AND  te.billing_record_id   IS NULL
      AND  (te.billing_rate IS NULL OR te.billing_rate = 0)
  `).all(...entryIds);
  const skipped = noRateRows.map(e => ({ id: e.id, engagement_id: e.engagement_id, hours: e.hours }));

  if (!eligible.length) return { created: [], totalAmount: 0, skipped };

  // Group by engagement_id
  const groups = new Map();
  for (const e of eligible) {
    if (!groups.has(e.engagement_id)) {
      groups.set(e.engagement_id, { client_name: e.client_name, entries: [] });
    }
    groups.get(e.engagement_id).entries.push(e);
  }

  const created = [];

  const insertRecord = db.prepare(`
    INSERT INTO billing_records (engagement_id, invoice_amount, status, invoice_date, notes)
    VALUES (?, ?, 'Unbilled', ?, ?)
  `);
  const stampEntry = db.prepare(
    'UPDATE time_entries SET billing_record_id = ? WHERE id = ?'
  );

  // Atomic: record creation + entry stamping together; if anything throws, neither persists
  db.transaction(() => {
    for (const [engId, group] of groups) {
      const amount = group.entries.reduce(
        (sum, e) => sum + e.hours * e.billing_rate, 0
      );
      const note = `Auto-billed: ${group.entries.length} entr${group.entries.length === 1 ? 'y' : 'ies'} released ${releaseDate}`;
      const res  = insertRecord.run(engId, amount, releaseDate, note);
      const recordId = Number(res.lastInsertRowid);

      for (const e of group.entries) {
        stampEntry.run(recordId, e.id);
      }

      created.push({
        engagement_id:     engId,
        client_name:       group.client_name,
        count:             group.entries.length,
        amount,
        billing_record_id: recordId,
      });
    }
  })();

  const totalAmount = created.reduce((sum, c) => sum + c.amount, 0);
  return { created, totalAmount, skipped };
}

/**
 * Stamp all currently-unbilled billable entries for an engagement onto an
 * already-existing billing record.
 *
 * Used by manual billing so that the double-bill guard (billing_record_id IS NULL)
 * also covers manually-created records — an entry stamped here cannot be swept
 * into a second auto-billing record on the next release.
 *
 * Call this inside the same db.transaction() that creates the billing record so
 * the record creation + stamping are atomic. (better-sqlite3 will use a SAVEPOINT
 * automatically when this function's own transaction() is nested inside yours.)
 *
 * @param {number} recordId     billing_records.id of the just-created record
 * @param {number} engagementId engagement to claim entries from
 * @returns {number}            count of entries stamped (0 = nothing to claim)
 */
function claimEntriesForBillingRecord(recordId, engagementId) {
  const entries = db.prepare(`
    SELECT id FROM time_entries
    WHERE  engagement_id      = ?
      AND  billable           = 1
      AND  billing_record_id IS NULL
  `).all(engagementId);

  if (!entries.length) return 0;

  const stmt = db.prepare('UPDATE time_entries SET billing_record_id = ? WHERE id = ?');
  db.transaction(() => {
    entries.forEach(e => stmt.run(recordId, e.id));
  })();

  return entries.length;
}

module.exports = { autoBillReleasedEntries, claimEntriesForBillingRecord };
