# Treetop Management

Internal practice-management desktop app for a CPA firm. Handles engagements, projects,
time tracking, billing, accounts receivable, invoicing, contacts, staff, reports, due dates,
notes, and workflow automations.

This is a private internal tool — not a SaaS product. No real client data is in this repo.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Server machine (one, on the office LAN)                 │
│                                                          │
│  Node.js + Express + SQLite                              │
│  Binds to 0.0.0.0:3001 — reachable from any LAN host    │
│  Auth: JWT (24h) · bootstrap token → admin → invite keys │
└──────────────────────────────────┬───────────────────────┘
                                   │  HTTP over LAN
          ┌────────────────────────┼────────────────────────┐
          ▼                        ▼                        ▼
  ┌──────────────┐         ┌──────────────┐        ┌──────────────┐
  │  Electron    │         │  Electron    │        │  Browser     │
  │  desktop app │         │  desktop app │        │  (dev only)  │
  │  workstation │         │  workstation │        │              │
  └──────────────┘         └──────────────┘        └──────────────┘
```

**Network model:** one server, many desktop clients on the same LAN. Each client stores the
server's address and authenticates with a JWT. All data lives in a single SQLite file on the
server machine.

**Auth flow:** fresh server → bootstrap token printed to console → first admin creates account
→ admin generates invite keys → team members self-register with their invite key.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, Tailwind CSS 3, React Router 6 (HashRouter) |
| Icons | @heroicons/react (outline) |
| Backend | Node.js, Express 4 |
| Database | SQLite via better-sqlite3 (WAL mode) |
| Auth | JWT (jsonwebtoken) + bcrypt (bcryptjs) |
| Desktop | Electron 42, electron-builder (NSIS installer for Windows) |

---

## For End Users — Installing the Desktop App

1. Download `Treetop Management Setup x.x.x.exe` from the
   [Releases page](https://github.com/cjmdevs/Treetop/releases)
2. Run the installer.
   > **Windows SmartScreen warning:** because the installer is unsigned, Windows will show
   > "Windows protected your PC." Click **More info → Run anyway** to proceed. This is normal
   > for unsigned installers from small projects.
3. Launch **Treetop Management** from your desktop or Start Menu.
4. On first launch you'll be asked for the server address (e.g. `http://192.168.1.45:3001`).
   Get this from whoever manages the server. This setting is saved and won't be asked again.
5. Log in with your account. If you don't have one yet, ask an admin to generate an invite key.

---

## For Server Operators

See **[server/DEPLOYMENT.md](server/DEPLOYMENT.md)** for the full step-by-step guide
(no programming experience required).

**Short version:**
1. Install Node.js 18+ on the machine that will run the server
2. Copy the `server/` folder to a path with no spaces (e.g. `C:\TreetopServer`)
3. Double-click `setup.bat` — installs packages, generates a JWT secret, creates the database
4. Double-click `start-treetop-server.bat` to run; or run `install-service.bat` as Administrator
   to install as a Windows Service that starts automatically on boot
5. Note the `Network:` address printed at startup — share it with client machines
6. On first run a bootstrap token is printed (and saved to `BOOTSTRAP_TOKEN.txt`);
   use it at the bootstrap page to create the first admin account

The database is a single file at `server/data/treetop.db`. Back it up regularly.

> **Client machines can't connect?** If the app works on the server machine at
> `http://localhost:3001` but other machines on the LAN can't reach it, the cause
> is almost always Windows Firewall on the server blocking inbound connections on
> port 3001. See the **Firewall / Connectivity Troubleshooting** section in
> [server/DEPLOYMENT.md](server/DEPLOYMENT.md) for the diagnostic and fix.

---

## For Developers

### Running in development

```bash
# Terminal 1 — API server (port 3001, nodemon auto-restart)
cd server
npm install
npm run dev

# Terminal 2 — React frontend (port 5173, Vite HMR)
cd client
npm install
npm run dev
```

The Vite dev config proxies all `/api` requests to `localhost:3001`.

### Electron dev

```bash
cd client
npm run electron:dev    # starts Vite dev server + Electron in one command
# or
npm run electron:start  # attach Electron to an already-running Vite server
```

### Seed / reset data

```bash
cd server
npm run seed          # full reset with 4 demo users + sample data
npm run seed:empty    # empty DB (production-like; requires bootstrap flow to log in)
```

### Demo login credentials (dev seed only — not present in production)

These generic accounts are created by `npm run seed` for development. They do **not** exist in
a real deployment — production uses the bootstrap flow to create real named accounts.

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | Admin |
| `admin2` | `admin123` | Admin (secondary) |
| `manager` | `manager123` | Manager |
| `staff` | `staff123` | Staff |

### Project structure

```
Treetop/
├── client/
│   ├── electron/
│   │   ├── main.cjs          Electron main process (multi-window, IPC handlers)
│   │   ├── preload.cjs       contextBridge API surface (window.__treetop__)
│   │   ├── electron-dev.cjs  dev launcher (starts Vite + Electron together)
│   │   └── icon.ico          app icon
│   ├── scripts/
│   │   └── create-icon.cjs   generates icon.ico from scratch
│   └── src/
│       ├── api/              fetch wrappers for every server resource
│       ├── components/       Layout, Sidebar, StandaloneLayout, TimerPanel, …
│       ├── config/
│       │   ├── modules.js    module registry (keys, routes, role gates)
│       │   └── serverConfig.js  server URL storage + /api/health test
│       ├── context/          AuthContext, TimerContext, ToastContext, StatusesContext
│       └── pages/            all page components + sub-components
└── server/
    ├── data/                 treetop.db (gitignored — auto-created by setup.bat)
    ├── db/
    │   ├── schema.js         CREATE TABLE IF NOT EXISTS for all tables
    │   ├── migrate.js        ALTER TABLE guards (new columns to existing DBs)
    │   ├── seed.js           full reset + demo data
    │   └── seed-empty.js     empty DB (production bootstrap flow)
    ├── middleware/auth.js    requireAuth (JWT verify); fatal if JWT_SECRET missing in prod
    ├── routes/               one file per resource
    ├── lib/
    │   ├── activityLogger.js
    │   └── automationEngine.js
    ├── utils/crypto.js       SHA-256 hashing + secure random token generation
    ├── bootstrap.js          one-time bootstrap token lifecycle
    ├── setup.js              called by setup.bat (generates .env, runs schema+migrate)
    ├── .env.example          documents all environment variables
    └── DEPLOYMENT.md         full end-user deployment guide
```

### Cutting a release

Requires a GitHub Personal Access Token with `repo` scope in `GH_TOKEN` env var,
and the `publish` section of `client/package.json` pointing at the right repo.

```bash
cd client
GH_TOKEN=your_token npm run release
```

This builds the Vite bundle, packages with electron-builder, creates a GitHub Release,
and uploads the NSIS installer. The installer will be unsigned — see the SmartScreen note above.

> **Build machine note:** `npm run dist` (local build, no publish) clears `WIN_CSC_LINK` and
> sets `CSC_IDENTITY_AUTO_DISCOVERY=false` to skip code signing. A fresh machine may have
> a stale electron-builder Windows code-sign cache at
> `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign`. If the build hangs or fails on the
> signing step, clear that cache folder and retry.

---

## Notes

- **Unsigned installer:** the Windows installer is not code-signed. SmartScreen will warn on
  first run. This is expected for an internal tool — not a security issue.
- **LAN only:** the server is designed for a trusted local network. CORS is permissive
  (`origin: true`) to support any LAN machine connecting without reconfiguration.
- **No external data:** no client names, financial figures, or personal information from the
  firm appears anywhere in this repository. The seed data uses fictional entities.
- **Internal tool:** this is purpose-built for one firm's workflow. Feature requests and
  issue reports from outside the firm are welcome but may not be prioritized.
