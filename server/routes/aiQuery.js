/**
 * POST /api/ai/projects-query
 *
 * Answers natural-language questions about project data using the Anthropic
 * Messages API. Requires ANTHROPIC_API_KEY in the environment.
 *
 * No AI endpoint existed in this codebase previously — this is the first one.
 * Pattern: fetch relevant project data → build a context prompt → call Anthropic.
 * Model: configurable via CLAUDE_MODEL env var, defaults to claude-opus-4-5.
 */
const express = require('express');
const db      = require('../db/database');
const router  = express.Router();
const https   = require('https');

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-5';

function callAnthropic(systemPrompt, userMessage) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) return reject(new Error(parsed.error.message));
            const text = parsed.content?.[0]?.text ?? '';
            resolve(text);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function buildContext() {
  const today = new Date().toISOString().split('T')[0];

  const projects = db.prepare(`
    SELECT p.id, p.client_name, p.project_type, p.entity_type, p.period_label,
           p.status, p.current_due, p.original_due, p.priority,
           p.primary_partner, p.manager, p.preparer, p.reviewer, p.in_charge,
           p.extended, p.completed_date, p.delivered_date,
           e.engagement_type, e.recurrence_frequency,
           COALESCE(SUM(te.hours), 0) as actual_hours
    FROM projects p
    JOIN engagements e ON e.id = p.engagement_id
    LEFT JOIN time_entries te ON te.project_id = p.id
    GROUP BY p.id
    ORDER BY p.current_due ASC
  `).all();

  const overdue = projects.filter(p =>
    p.current_due && p.current_due < today &&
    !['Completed', 'Delivered'].includes(p.status)
  );

  const dueThisWeek = (() => {
    const end = new Date(); end.setDate(end.getDate() + 7);
    const endStr = end.toISOString().split('T')[0];
    return projects.filter(p =>
      p.current_due && p.current_due >= today && p.current_due <= endStr &&
      !['Completed', 'Delivered'].includes(p.status)
    );
  })();

  return {
    today,
    total: projects.length,
    overdue_count: overdue.length,
    due_this_week_count: dueThisWeek.length,
    projects_summary: projects.slice(0, 50),  // cap to avoid token overrun
    overdue_projects: overdue,
    due_this_week: dueThisWeek,
  };
}

router.post('/projects-query', async (req, res) => {
  const { question } = req.body;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: 'question required' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(200).json({
      answer: 'AI queries are not available — ANTHROPIC_API_KEY is not set in the server environment. ' +
              'Set it in your .env file to enable this feature.',
      context_available: false,
    });
  }

  try {
    const context = buildContext();

    const systemPrompt = `You are an AI assistant for MGR CPAs, a CPA firm practice management system.
You answer questions about the firm's projects (engagements, tax returns, bookkeeping, audits, etc.).
Today's date is ${context.today}.
Be concise and direct. Format lists with line breaks. Use numbers and facts from the data.

Current project data snapshot:
- Total active projects: ${context.total}
- Overdue projects: ${context.overdue_count}
- Due this week: ${context.due_this_week_count}

Projects (id, client, type, period, status, due, assignees):
${JSON.stringify(context.projects_summary, null, 2)}`;

    const answer = await callAnthropic(systemPrompt, question);
    res.json({ answer, model: MODEL });
  } catch (err) {
    console.error('AI query error:', err.message);
    res.status(500).json({ error: 'AI query failed: ' + err.message });
  }
});

module.exports = router;
