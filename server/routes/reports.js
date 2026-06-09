const express = require('express');
const db = require('../db/database');
const router = express.Router();

function dateRange(req) {
  const now = new Date();
  const start = req.query.startDate || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const end   = req.query.endDate   || now.toISOString().split('T')[0];
  return { start, end };
}

router.get('/', (req, res) => {
  const { type, staff, engagementType, releaseFilter, client } = req.query;
  const { start, end } = dateRange(req);
  // client filter: case-insensitive partial match — wrap in % for LIKE queries
  const clientLike = client ? `%${client}%` : null;

  const hasInvoiceStatus = db.pragma('table_info(invoices)').some(col => col.name === 'status');

  // Optional release filter — injected into time-entry queries
  const rcMain = releaseFilter === 'released'
    ? 'AND EXISTS (SELECT 1 FROM time_releases tr WHERE tr.user_id = time_entries.user_id AND time_entries.date BETWEEN tr.start_date AND tr.end_date)'
    : releaseFilter === 'unreleased'
    ? 'AND NOT EXISTS (SELECT 1 FROM time_releases tr WHERE tr.user_id = time_entries.user_id AND time_entries.date BETWEEN tr.start_date AND tr.end_date)'
    : '';
  const rcAlias = releaseFilter === 'released'
    ? 'AND EXISTS (SELECT 1 FROM time_releases tr WHERE tr.user_id = te.user_id AND te.date BETWEEN tr.start_date AND tr.end_date)'
    : releaseFilter === 'unreleased'
    ? 'AND NOT EXISTS (SELECT 1 FROM time_releases tr WHERE tr.user_id = te.user_id AND te.date BETWEEN tr.start_date AND tr.end_date)'
    : '';

  let result;
  switch (type) {

    case 'staff_productivity': {
      const rows = db.prepare(`
        SELECT staff_member,
          SUM(hours) as total_hours,
          SUM(CASE WHEN billable=1 THEN hours ELSE 0 END) as billable_hours,
          SUM(CASE WHEN billable=0 THEN hours ELSE 0 END) as nonbillable_hours,
          SUM(CASE WHEN billable=1 THEN hours*COALESCE(billing_rate,0) ELSE 0 END) as billable_amount
        FROM time_entries
        WHERE date BETWEEN ? AND ?
          ${staff ? 'AND staff_member = ?' : ''}
          ${clientLike ? 'AND EXISTS (SELECT 1 FROM engagements eg WHERE eg.id = time_entries.engagement_id AND LOWER(eg.client_name) LIKE LOWER(?))' : ''}
          ${rcMain}
        GROUP BY staff_member ORDER BY total_hours DESC
      `).all(start, end, ...(staff ? [staff] : []), ...(clientLike ? [clientLike] : []));

      const weeks = Math.max(1, Math.ceil((new Date(end)-new Date(start))/(7*86400000)));
      result = rows.map(r => ({
        ...r,
        billable_pct: r.total_hours > 0 ? Math.round((r.billable_hours/r.total_hours)*100) : 0,
        utilization:  Math.round((r.billable_hours/(weeks*40))*100),
      }));
      break;
    }

    case 'time_by_service_code': {
      result = db.prepare(`
        SELECT
          CASE
            WHEN sc.number IS NOT NULL
              THEN sc.number || ' — ' || COALESCE(te.service_code, '') || ' — ' || COALESCE(sc.description, '')
            ELSE COALESCE(te.service_code, '(none)')
          END as service_code,
          SUM(te.hours) as total_hours,
          SUM(CASE WHEN te.billable=1 THEN te.hours * COALESCE(te.billing_rate, 0) ELSE 0 END) as billable_amount,
          COUNT(DISTINCT te.engagement_id) as engagement_count
        FROM time_entries te
        LEFT JOIN service_codes sc ON sc.code = te.service_code
        LEFT JOIN engagements te_eng ON te_eng.id = te.engagement_id
        WHERE te.date BETWEEN ? AND ?
          ${staff ? 'AND te.staff_member = ?' : ''}
          ${clientLike ? 'AND LOWER(te_eng.client_name) LIKE LOWER(?)' : ''}
          ${rcAlias}
        GROUP BY te.service_code
        ORDER BY total_hours DESC
      `).all(start, end, ...(staff ? [staff] : []), ...(clientLike ? [clientLike] : []));
      break;
    }

    case 'time_by_client': {
      result = db.prepare(`
        SELECT e.client_name,
          SUM(te.hours) as total_hours,
          SUM(CASE WHEN te.billable=1 THEN te.hours ELSE 0 END) as billable_hours,
          SUM(CASE WHEN te.billable=1 THEN te.hours*COALESCE(te.billing_rate,0) ELSE 0 END) as billable_amount
        FROM time_entries te
        JOIN engagements e ON e.id = te.engagement_id
        WHERE te.date BETWEEN ? AND ?
          ${staff ? 'AND te.staff_member = ?' : ''}
          ${engagementType ? 'AND e.engagement_type = ?' : ''}
          ${rcAlias}
        GROUP BY e.client_name ORDER BY total_hours DESC
      `).all(start, end, ...(staff ? [staff] : []), ...(engagementType ? [engagementType] : []));
      break;
    }

    case 'wip': {
      result = db.prepare(`
        SELECT e.id as engagement_id, e.client_name, e.engagement_type, e.assigned_staff,
          SUM(te.hours) as hours,
          SUM(CASE WHEN te.billable=1 THEN te.hours*COALESCE(te.billing_rate,0) ELSE 0 END) as amount,
          MIN(te.date) as oldest_entry_date
        FROM time_entries te
        JOIN engagements e ON e.id = te.engagement_id
        WHERE te.billable = 1
          AND e.status NOT IN ('Complete')
          ${engagementType ? 'AND e.engagement_type = ?' : ''}
        GROUP BY e.id
        HAVING amount > 0
        ORDER BY oldest_entry_date ASC
      `).all(...(engagementType ? [engagementType] : []));
      result = result.map(r => ({
        ...r,
        age_days: Math.floor((new Date() - new Date(r.oldest_entry_date)) / 86400000),
      }));
      break;
    }

    case 'invoice_register': {
      result = db.prepare(`
        SELECT i.invoice_number, i.client_name, i.invoice_date, i.due_date,
          i.total, e.engagement_type,
          ${hasInvoiceStatus ? "COALESCE(i.status, 'Invoiced')" : "'Invoiced'"} as status
        FROM invoices i
        LEFT JOIN engagements e ON e.id = i.engagement_id
        WHERE i.invoice_date BETWEEN ? AND ?
          ${engagementType ? 'AND e.engagement_type = ?' : ''}
          ${clientLike ? 'AND LOWER(i.client_name) LIKE LOWER(?)' : ''}
        ORDER BY i.invoice_date DESC
      `).all(start, end, ...(engagementType ? [engagementType] : []), ...(clientLike ? [clientLike] : []));
      break;
    }

    case 'collections': {
      result = db.prepare(`
        SELECT payment_date as date, client_name, amount,
          COALESCE(payment_method, '—') as payment_method,
          COALESCE(reference_number, '—') as reference_number
        FROM payments
        WHERE payment_date BETWEEN ? AND ?
          ${clientLike ? 'AND LOWER(client_name) LIKE LOWER(?)' : ''}
        ORDER BY payment_date DESC
      `).all(start, end, ...(clientLike ? [clientLike] : []));
      break;
    }

    case 'ar_aging': {
      const unpaid = db.prepare(`
        SELECT b.*, e.client_name, e.engagement_type
        FROM billing_records b JOIN engagements e ON e.id = b.engagement_id
        WHERE b.status IN ('Unbilled','Invoiced')
        ORDER BY e.client_name ASC
      `).all();
      const today = new Date();
      const clientMap = {};
      unpaid.forEach(r => {
        const days = Math.floor((today - new Date(r.invoice_date || r.created_at)) / 86400000);
        const bucket = days <= 30 ? 'current' : days <= 60 ? 'days31_60' : days <= 90 ? 'days61_90' : 'days90plus';
        if (!clientMap[r.client_name]) {
          clientMap[r.client_name] = { client_name: r.client_name, current: 0, days31_60: 0, days61_90: 0, days90plus: 0, total: 0 };
        }
        clientMap[r.client_name][bucket] += r.invoice_amount;
        clientMap[r.client_name].total   += r.invoice_amount;
      });
      result = Object.values(clientMap).sort((a, b) => b.total - a.total);
      if (client) result = result.filter(r => r.client_name.toLowerCase().includes(client.toLowerCase()));
      break;
    }

    case 'client_balance': {
      result = db.prepare(`
        SELECT e.client_name,
          COALESCE(SUM(br.invoice_amount), 0) as total_billed,
          COALESCE(SUM(CASE WHEN br.status='Paid' THEN br.invoice_amount ELSE 0 END), 0) as total_paid,
          COALESCE(SUM(CASE WHEN br.status IN ('Unbilled','Invoiced') THEN br.invoice_amount ELSE 0 END), 0) as outstanding
        FROM engagements e
        LEFT JOIN billing_records br ON br.engagement_id = e.id
        ${clientLike ? 'WHERE LOWER(e.client_name) LIKE LOWER(?)' : ''}
        GROUP BY e.client_name
        HAVING total_billed > 0
        ORDER BY outstanding DESC
      `).all(...(clientLike ? [clientLike] : []));
      break;
    }

    case 'engagement_status': {
      result = db.prepare(`
        SELECT status, COUNT(*) as count,
          COUNT(CASE WHEN priority='High' THEN 1 END) as high_priority
        FROM engagements
        ${engagementType ? 'WHERE engagement_type = ?' : ''}
        GROUP BY status ORDER BY count DESC
      `).all(...(engagementType ? [engagementType] : []));
      break;
    }

    case 'budget_variance': {
      result = db.prepare(`
        SELECT e.id, e.client_name, e.engagement_type, e.status, e.assigned_staff,
          e.budgeted_hours, e.budgeted_amount,
          COALESCE(SUM(te.hours), 0) as actual_hours,
          COALESCE(SUM(CASE WHEN te.billable=1 THEN te.hours*COALESCE(te.billing_rate,0) ELSE 0 END), 0) as actual_amount
        FROM engagements e
        LEFT JOIN time_entries te ON te.engagement_id = e.id
        WHERE (e.budgeted_hours IS NOT NULL OR e.budgeted_amount IS NOT NULL)
          ${staff ? 'AND e.assigned_staff = ?' : ''}
          ${engagementType ? 'AND e.engagement_type = ?' : ''}
          ${clientLike ? 'AND LOWER(e.client_name) LIKE LOWER(?)' : ''}
        GROUP BY e.id
      `).all(...(staff ? [staff] : []), ...(engagementType ? [engagementType] : []), ...(clientLike ? [clientLike] : []));
      result = result.map(r => ({
        ...r,
        hours_variance:  r.budgeted_hours   ? r.actual_hours  - r.budgeted_hours   : null,
        hours_pct:       r.budgeted_hours   ? Math.round((r.actual_hours  / r.budgeted_hours)   * 100) : null,
        amount_variance: r.budgeted_amount  ? r.actual_amount - r.budgeted_amount  : null,
        amount_pct:      r.budgeted_amount  ? Math.round((r.actual_amount / r.budgeted_amount)  * 100) : null,
      })).sort((a, b) => (b.hours_pct || 0) - (a.hours_pct || 0));
      break;
    }

    case 'overdue': {
      const today = new Date().toISOString().split('T')[0];
      result = db.prepare(`
        SELECT *, (julianday('now') - julianday(due_date)) as days_overdue
        FROM engagements
        WHERE due_date < ? AND status NOT IN ('Complete','On Hold')
          ${staff ? 'AND assigned_staff = ?' : ''}
          ${engagementType ? 'AND engagement_type = ?' : ''}
          ${clientLike ? 'AND LOWER(client_name) LIKE LOWER(?)' : ''}
        ORDER BY due_date ASC
      `).all(today, ...(staff ? [staff] : []), ...(engagementType ? [engagementType] : []), ...(clientLike ? [clientLike] : []));
      break;
    }

    case 'staff_workload': {
      const staffRows = db.prepare(`
        SELECT assigned_staff,
          COUNT(*) as active_engagement_count,
          GROUP_CONCAT(client_name, '|||') as clients
        FROM engagements
        WHERE status NOT IN ('Complete','On Hold') AND assigned_staff IS NOT NULL
        GROUP BY assigned_staff ORDER BY active_engagement_count DESC
      `).all();
      result = staffRows.map(r => {
        const hours = db.prepare(`
          SELECT COALESCE(SUM(hours),0) as h FROM time_entries
          WHERE staff_member = ? AND date BETWEEN ? AND ?
        `).get(r.assigned_staff, start, end);
        return {
          ...r,
          clients: r.clients ? r.clients.split('|||') : [],
          hours_this_period: hours.h,
        };
      });
      break;
    }

    case 'timesheet': {
      const periodId = req.query.periodId;
      if (!periodId) return res.status(400).json({ error: 'periodId is required for timesheet' });
      result = db.prepare(`
        SELECT u.full_name as staff_member,
          te.date,
          SUM(te.hours) as hours,
          SUM(CASE WHEN te.billable=1 THEN te.hours ELSE 0 END) as billable_hours,
          SUM(CASE WHEN te.billable=1 THEN te.hours * COALESCE(te.billing_rate, 0) ELSE 0 END) as billable_amount,
          COALESCE(ppus.status, 'Open') as release_status
        FROM time_entries te
        JOIN users u ON u.id = te.user_id
        LEFT JOIN pay_period_user_status ppus
          ON ppus.pay_period_id = te.pay_period_id AND ppus.user_id = te.user_id
        WHERE te.pay_period_id = ?
          ${staff ? 'AND u.full_name = ?' : ''}
          ${rcAlias}
        GROUP BY u.full_name, te.date
        ORDER BY u.full_name, te.date
      `).all(periodId, ...(staff ? [staff] : []));
      break;
    }

    case 'time_release_summary': {
      // Show all release snapshots from the time_releases table
      result = db.prepare(`
        SELECT u.full_name as staff_member,
          tr.start_date, tr.end_date,
          tr.total_hours, tr.total_amount as billable_amount,
          tr.released_at
        FROM time_releases tr
        JOIN users u ON u.id = tr.user_id
        ${staff ? 'WHERE u.full_name = ?' : ''}
        ORDER BY tr.released_at DESC
      `).all(...(staff ? [staff] : []));
      break;
    }

    case 'unreleased_time': {
      // Find users with time entries not covered by any time_release record
      result = db.prepare(`
        SELECT u.full_name as staff_member, u.id as user_id,
          MIN(te.date) as earliest_date,
          MAX(te.date) as latest_date,
          COALESCE(SUM(te.hours), 0) as total_hours
        FROM time_entries te
        JOIN users u ON u.id = te.user_id
        WHERE te.date < date('now')
          AND NOT EXISTS (
            SELECT 1 FROM time_releases tr
            WHERE tr.user_id = te.user_id
              AND te.date BETWEEN tr.start_date AND tr.end_date
          )
        GROUP BY u.id
        HAVING total_hours > 0
        ORDER BY u.full_name
      `).all();
      break;
    }

    case 'staff_detail': {
      if (!staff) return res.status(400).json({ error: 'staff is required for staff_detail' });
      result = db.prepare(`
        SELECT te.date,
          e.client_name,
          e.engagement_type,
          CASE WHEN sc.number IS NOT NULL
            THEN sc.number || ' — ' || COALESCE(te.service_code, '')
            ELSE COALESCE(te.service_code, '—')
          END as service_code,
          COALESCE(sc.description, '—') as service_description,
          te.hours,
          te.billing_rate,
          CASE WHEN te.billable=1 THEN te.hours * COALESCE(te.billing_rate, 0) ELSE 0 END as amount,
          te.notes as memo
        FROM time_entries te
        JOIN engagements e ON e.id = te.engagement_id
        LEFT JOIN service_codes sc ON sc.code = te.service_code
        WHERE te.date BETWEEN ? AND ?
          AND te.staff_member = ?
        ORDER BY te.date DESC, e.client_name
      `).all(start, end, staff);
      break;
    }

    default:
      return res.status(400).json({ error: `Unknown report type: ${type}` });
  }

  res.json({ type, start, end, data: result });
});

module.exports = router;
