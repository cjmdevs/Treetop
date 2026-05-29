const express = require('express');
const cors    = require('cors');
const { migrate }            = require('./db/migrate');
const { initializeDatabase } = require('./db/schema');
const { requireAuth }        = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json());

initializeDatabase();
if (process.env.NODE_ENV !== 'test') migrate();

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

module.exports = app;
