# Treetop Management Server — Deployment Guide

This guide walks through installing and running the server on a Windows machine.
No programming experience is required.

---

## Prerequisites

### 1. Install Node.js

Node.js is the runtime the server needs. Install it once and you won't need to touch it again.

1. Go to **https://nodejs.org/**
2. Download the **LTS** version (labeled "Recommended For Most Users")
3. Run the installer with the default settings

> Node.js **version 18 or newer** is required. The LTS download will always meet this requirement.

---

### 2. ⚠️ Install to a path with NO spaces — this is critical

The server uses a database component that can fail to install if the folder path contains spaces.

✅ **Good paths:**
```
C:\TreetopServer
C:\Apps\Treetop
D:\Servers\Treetop
```

❌ **Paths to avoid (contain spaces):**
```
C:\Program Files\Treetop
C:\Users\Jane Smith\Treetop
C:\My Documents\Treetop Server
```

If `setup.bat` fails with an npm error, a space in the path is the most likely cause.

---

## One-Time Setup

1. Copy the `server` folder to your chosen location, e.g. `C:\TreetopServer`
2. Double-click **`setup.bat`** inside that folder

The setup script will:
- Confirm Node.js is installed correctly
- Install all required packages
- Generate a secure random encryption key and save it to `.env`
- Create an empty database (ready for first use — no demo users)

> **Safe to re-run.** Running `setup.bat` again on an existing deployment will not overwrite your encryption key or erase your data.

---

## Starting the Server

### Option A — Simple start (manual)

Double-click **`start-treetop-server.bat`**

A console window opens and stays open while the server is running.
**Do not close this window** — closing it stops the server.

The server prints its address in the console on startup, for example:
```
──────────────────────────────────────────────────────────
  Treetop Management Server  —  running
──────────────────────────────────────────────────────────
  Local:   http://localhost:3001
  Network: http://192.168.1.45:3001
           (share this address with client machines on your LAN)
──────────────────────────────────────────────────────────
```

Use the **Network** address when configuring client machines.

---

### Option B — Windows Service (recommended for production)

A Windows Service starts automatically when the computer boots and runs silently
in the background with no console window.

**To install the service:**
1. Right-click **`install-service.bat`**
2. Choose **Run as administrator**

**To remove the service:**
1. Right-click **`uninstall-service.bat`**
2. Choose **Run as administrator**

**Viewing service logs:**
When running as a service, logs are written to the `daemon\` subfolder inside
your server directory (e.g. `C:\TreetopServer\daemon\`). Open the `.log` files
there to see server output.

**Managing the service:**
Press `Win + R`, type `services.msc`, and press Enter. Find
**Treetop Management Server** in the list to start, stop, or restart it.

> When running as a service, the bootstrap token is NOT printed to a console.
> Read it from **`BOOTSTRAP_TOKEN.txt`** in your server folder instead.

---

## Finding Your Server's Network Address

Clients on your local network connect using your server machine's LAN IP address.

To find it:
1. Press `Win + R`, type `cmd`, press Enter
2. Type `ipconfig` and press Enter
3. Look for **IPv4 Address** under your active network adapter

It will look something like `192.168.1.45`.
Your server address is then: **`http://192.168.1.45:3001`**

> **Note:** Your machine's IP address may change over time if your router assigns
> addresses automatically. For a permanent address, configure a static IP on the
> server machine (in Windows Network Settings or on your router).

---

## First-Time Admin Setup (Bootstrap Token)

The first time the server runs with an empty database, it generates a one-time
**bootstrap token** and saves it to `BOOTSTRAP_TOKEN.txt`.

You use this token to create the first admin account.

**Finding the token:**
- **Option A (start script):** printed in the console window at startup
- **Option B (Windows service):** open `BOOTSTRAP_TOKEN.txt` in your server folder

The token looks like a long string of letters and numbers:
```
a1b2c3d4e5f6789012345678...
```

**Creating the first admin:**
1. Open the Treetop Management app on any machine
2. Enter your server address when prompted (e.g. `http://192.168.1.45:3001`)
3. The app will redirect you to the bootstrap setup page automatically
4. Enter the bootstrap token and fill in the admin account details

> 🔒 The bootstrap token is permanently invalidated after the first admin is
> created. The token file is automatically cleared. No further use is possible.

---

## Connecting Client Machines (Electron desktop app)

When Treetop Management is first launched on a client machine, it asks for the
server address. Enter the Network address from the startup output:

```
http://192.168.1.45:3001
```

This setting is saved and does not need to be re-entered unless the server moves.

---

## Firewall / Connectivity Troubleshooting

### Quick diagnostic

> **If Treetop works on the server machine itself using `http://localhost:3001`
> but other machines on the network cannot connect using the server's LAN IP
> (e.g. `http://192.168.1.50:3001`), the cause is almost always Windows Firewall
> on the server machine blocking inbound connections on port 3001.**
>
> This is expected behavior — `localhost` (loopback) bypasses the firewall entirely,
> which is why the server appears to work locally but is unreachable from other machines.
> It is not an app bug.

### Step 1 — Confirm the server is actually listening

1. On the server machine, open a Command Prompt and run `ipconfig`
2. Note the **IPv4 Address** under your active adapter (e.g. `192.168.1.50`)
3. Check the server startup banner — it prints a **Network:** address at startup.
   That address should match the IP you found above.

The server binds to `0.0.0.0:3001`, meaning it accepts connections from any interface.
If the Network address is missing or shows `localhost`, the server process may not
have started correctly — check the console output or service logs.

### Step 2 — Test reachability from a client machine

From a machine other than the server, open a browser and go to:

```
http://<server-ip>:3001/api/health
```

For example: `http://192.168.1.50:3001/api/health`

- **Returns `{"ok":true}`** → the server is reachable. The firewall is not the issue.
  Double-check the address in the Treetop app settings.
- **Times out or "can't connect"** → the firewall is blocking the port. Continue below.

> Note: `ping` tests whether the machine is reachable, not whether the port is open.
> Use the `/api/health` check above for a definitive port-level test.

---

### Fix — Option A: Windows Defender Firewall GUI

Run these steps **on the SERVER machine**:

1. Open the Start menu and search for **"Windows Defender Firewall with Advanced Security"**
2. In the left panel, click **Inbound Rules**
3. In the right panel, click **New Rule…**
4. Rule type: select **Port** → click Next
5. Protocol: **TCP**; Specific local ports: **`3001`** → click Next
6. Select **Allow the connection** → click Next
7. Profile: check **Private** (and **Domain** if the firm is on a Windows domain network).
   Leave **Public** unchecked for security → click Next
8. Name the rule **`Treetop Server 3001`** → click Finish

Client machines should now be able to connect using `http://<server-ip>:3001`.

---

### Fix — Option B: Command line (elevated prompt)

Open **PowerShell or Command Prompt as Administrator** on the SERVER machine and run:

```
netsh advfirewall firewall add rule name="Treetop Server 3001" dir=in action=allow protocol=TCP localport=3001
```

To remove the rule later:

```
netsh advfirewall firewall delete rule name="Treetop Server 3001"
```

---

### The one-time Windows prompt

The very first time a client connects, Windows may pop a one-time dialog asking
whether to allow Node.js through the firewall. If it appears:

- Check **Private networks** (and Domain if applicable)
- Click **Allow access**

If that prompt was dismissed without allowing, or appeared and was blocked, the
connection will fail until a rule is added manually via Option A or B above.

---

### Other causes of the same symptom

If fixing the Windows Firewall doesn't help, check these:

- **Wrong address in app settings** — on a client machine the server address must be
  `http://<server-ip>:3001` (the LAN IP), not `http://localhost:3001`.
  Open the Treetop app → Settings → Server Connection to verify.
- **Different network / subnet** — both machines must be on the same local network.
  A machine connected via mobile hotspot or VPN will not reach a LAN server.
- **Third-party security software** — antivirus suites (Norton, Bitdefender, ESET, etc.)
  often include their own firewall independent of Windows Firewall. If adding a Windows
  Firewall rule doesn't help, check your security software for a separate firewall
  or network-blocking feature and add an exception for port 3001 there as well.

---

## Backups

Your entire database is a single file. Back it up regularly.

**File to back up:** `data\treetop.db` inside your server folder

**How to back up:**
1. Stop the server (close the console window, or stop the Windows Service)
2. Copy these files to your backup location:
   - `data\treetop.db`
   - `data\treetop.db-wal` (if it exists)
   - `data\treetop.db-shm` (if it exists)
3. Restart the server

> Stopping the server before copying ensures the WAL (write-ahead log) files
> are flushed. If you must copy while the server is running, always include all
> three files together.

A simple backup routine: a nightly scheduled task that stops the service,
copies `db\treetop.db` (and the `-wal`/`-shm` files if present) to a dated
backup folder, then restarts the service.

---

## Updating the Server

When a new version is available:

1. Stop the server (close the console window, or stop the Windows Service)
2. Back up `data\treetop.db` (see Backups above)
3. Replace the server files with the new version
   — **keep** your existing `data\` folder and `.env` file
4. Run `setup.bat` — it applies any new database schema changes without touching your data
5. Restart the server

---

## Environment Variables

The `.env` file in your server folder is created automatically by `setup.bat`
and controls server configuration. Do not share this file — it contains your
JWT secret key.

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | *(generated)* | Secret key for signing login tokens. **Never change this** after users have been created — it invalidates all active sessions. |
| `PORT` | `3001` | Port the server listens on. Change if 3001 conflicts with another service. |
| `NODE_ENV` | `production` | Server mode. Keep as `production` for deployed servers. |

See `.env.example` for a template with descriptions.

---

## Troubleshooting

**"Port 3001 is already in use"**
Another copy of the server is running. Stop it first (close the other console
window, or stop the service via `services.msc`). Or change `PORT=` in `.env`.

**Clients can't connect but localhost works on the server**
Windows Firewall is almost certainly blocking inbound connections on port 3001.
See the **Firewall / Connectivity Troubleshooting** section above for a full
diagnostic and step-by-step fix (GUI and command-line options).

**"npm install failed" during setup**
Your installation path likely contains a space. Move the server folder to a
path with no spaces (e.g. `C:\TreetopServer`) and run `setup.bat` again.

**install-service.bat says "must run as Administrator"**
Right-click the file and choose **Run as administrator**.

**Lost the bootstrap token / need to reset**
If the database already has users, the bootstrap token is permanently gone
(by design — this is a security feature). To fully reset:
1. Stop the server
2. Delete `data\treetop.db` (and `-wal`/`-shm` if present)
3. Run `setup.bat`
4. Start the server — a new bootstrap token will be generated

⚠️ This erases ALL data. Only do this on a fresh deployment or test machine.

**Service won't start after installation**
Check the logs in the `daemon\` folder. Common causes: Node.js not in PATH
for the service account, or `.env` file missing / unreadable.
