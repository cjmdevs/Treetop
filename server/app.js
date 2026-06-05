const express = require('express');
const cors    = require('cors');
const { migrate }            = require('./db/migrate');
const { initializeDatabase } = require('./db/schema');
const { requireAuth }        = require('./middleware/auth');

const app = express();

// ── CORS — must be first so preflight OPTIONS requests succeed ────────────────
// For an internal LAN tool we reflect the request origin so any machine on the
// network can reach the server.  In a production deployment this could be
// tightened to specific workstation origins if desired.
app.use(cors({
  origin: true,                                      // echo the request Origin
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

initializeDatabase();
if (process.env.NODE_ENV !== 'test') migrate();

// ── Health check — unauthenticated, used by clients to test connectivity ──────
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── Public routes (no auth required) ─────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));

// ── Auth middleware — all routes below require a valid JWT ────────────────────
app.use(requireAuth);

// ── Protected routes ──────────────────────────────────────────────────────────
app.use('/api/users',        require('./routes/users'));
app.use('/api/engagements',  require('./routes/engagements'));
app.use('/api/engagements/:engagementId/subtasks', require('./routes/subtasks'));
app.use('/api/time-entries',  require('./routes/timeEntries'));
app.use('/api/billing',       require('./routes/billing'));
app.use('/api/staff',         require('./routes/staff'));
app.use('/api/dashboard',     require('./routes/dashboard'));
app.use('/api/templates',     require('./routes/templates'));
app.use('/api/notes',         require('./routes/notes'));
app.use('/api/service-codes', require('./routes/serviceCodes'));
app.use('/api/payments',      require('./routes/payments'));
app.use('/api/invoices',      require('./routes/invoices'));
app.use('/api/custom-fields', require('./routes/customFields'));
app.use('/api/reports',      require('./routes/reports'));
app.use('/api/automations',  require('./routes/automations'));
app.use('/api/activity',     require('./routes/activity'));
app.use('/api/due-dates',    require('./routes/dueDates'));
app.use('/api/search',       require('./routes/search'));
app.use('/api/pay-periods',  require('./routes/payPeriods'));
app.use('/api/staff-rates',  require('./routes/staffRates'));
app.use('/api/time-summary', require('./routes/timeSummary'));
app.use('/api/releases',     require('./routes/releases'));
app.use('/api/contacts',              require('./routes/contacts'));
app.use('/api/contact-client-types', require('./routes/contactClientTypes'));
app.use('/api/projects',             require('./routes/projects'));
app.use('/api/user-preferences',    require('./routes/userPreferences'));
app.use('/api/ai',                  require('./routes/aiQuery'));
app.use('/api/project-statuses',   require('./routes/projectStatuses'));
app.use('/api/invite-keys',        require('./routes/inviteKeys'));

module.exports = app;
