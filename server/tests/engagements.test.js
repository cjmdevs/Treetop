const request = require('supertest');
const app = require('../app');
const { initializeDatabase } = require('../db/schema');

beforeAll(() => { initializeDatabase(); });

describe('GET /api/engagements', () => {
  it('returns 200 and an array', async () => {
    const res = await request(app).get('/api/engagements');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('Engagement CRUD', () => {
  let id;

  it('POST creates an engagement', async () => {
    const res = await request(app).post('/api/engagements').send({
      client_name: 'Test Corp', engagement_type: 'Tax Return',
      status: 'Not Started', priority: 'Low',
    });
    expect(res.status).toBe(201);
    expect(res.body.client_name).toBe('Test Corp');
    id = res.body.id;
  });

  it('GET /:id returns the engagement with nested data', async () => {
    const res = await request(app).get(`/api/engagements/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(Array.isArray(res.body.timeEntries)).toBe(true);
    expect(Array.isArray(res.body.billing)).toBe(true);
    expect(typeof res.body.totalHours).toBe('number');
  });

  it('PUT /:id updates the engagement', async () => {
    const res = await request(app).put(`/api/engagements/${id}`).send({
      client_name: 'Test Corp Updated', engagement_type: 'Audit',
      status: 'In Progress', priority: 'High',
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('In Progress');
    expect(res.body.client_name).toBe('Test Corp Updated');
  });

  it('GET with ?status filter returns only matching', async () => {
    const res = await request(app).get('/api/engagements?status=In Progress');
    expect(res.status).toBe(200);
    expect(res.body.every(e => e.status === 'In Progress')).toBe(true);
  });

  it('DELETE /:id removes the engagement', async () => {
    const res = await request(app).delete(`/api/engagements/${id}`);
    expect(res.status).toBe(204);
  });

  it('GET /:id returns 404 after deletion', async () => {
    const res = await request(app).get(`/api/engagements/${id}`);
    expect(res.status).toBe(404);
  });
});
