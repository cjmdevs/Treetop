# MGR CPAs Practice Management

Local practice management app for Maurer, Graf & Rivera — Phase 1 POC.

## Quick Start

**1. Install all dependencies (run once):**
```
npm run install:all
```

**2. Seed the database (run once, or to reset sample data):**
```
cd server && node db/seed.js && cd ..
```

**3. Start the app:**
```
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001

## Running API Tests

```
cd server && npm test
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS + React Router v6 |
| Icons | @heroicons/react |
| Backend | Node.js + Express |
| Database | SQLite via better-sqlite3 |
| Dev tooling | concurrently, nodemon, jest, supertest |

## Project Structure

```
mgrcpas/
├── package.json         root: npm run dev starts both servers
├── client/              React frontend (Vite, port 5173)
│   └── src/
│       ├── api/         fetch wrappers (engagements, timeEntries, billing, staff, dashboard)
│       ├── components/  Layout, Sidebar, StatCard, Badge, EngagementCard, KanbanBoard
│       └── pages/       Dashboard, Engagements, EngagementDetail, EngagementForm,
│                        TimeTracking, Billing, Staff
└── server/              Express REST API (port 3001)
    ├── app.js           Express app factory
    ├── index.js         server entry point
    ├── db/              schema.js, seed.js, database.js (SQLite connection)
    ├── routes/          engagements, timeEntries, billing, staff, dashboard
    ├── tests/           jest + supertest API tests
    ├── data/            mgrcpas.db (auto-created on first run)
    └── ROUTES.md        full API documentation
```

## Features

- **Engagements** — create, edit, filter by status/type/staff; list and Kanban board views
- **Time Tracking** — log hours per engagement; grouped by client; billable toggle
- **Billing** — invoice records with Unbilled → Invoiced → Paid workflow; summary dashboard
- **Staff** — per-member view of active engagements and hours logged this week
- **Dashboard** — at-a-glance stats and recent activity

## API

See [server/ROUTES.md](server/ROUTES.md) for the full API reference. All data is accessible via REST so an MCP server can be layered on top.
