# KaizenPM — Elite Project Management & Habit Tracking Suite

A resource-efficient, self-hosted, full-stack project management and habit tracking platform designed for Oracle Cloud ARM64 (1 OCPU, 6GB RAM).

---

## 🏗 Architecture Overview

- **Backend:** FastAPI + SQLAlchemy on SQLite (`backend/`), running as a systemd service (`kaizenpm-api.service`) on port `8090`.
- **Database:** SQLite (`backend/kaizenpm.db`), a single file — fully detachable and portable for future storage migration. Back it up with `pm-cli.py db backup`.
- **Frontend:** React 18 + Vite + TailwindCSS SPA hosted on GitHub Pages (`ccoolavi.github.io/project-manager/`).
- **Communication:** The client reaches the API over HTTPS through a Cloudflare quick tunnel to `localhost:8090`. The current tunnel URL is published at runtime in `config.json` (repo root and `frontend/public/config.json`) rather than baked into the JavaScript bundle, so rotating the tunnel (`rotate-tunnel.sh`) never requires a client rebuild.
- **Auth:** JWT bearer tokens, issued by the API and stored in browser `localStorage`. Every API route checks organisation membership; see `backend/utils/tenancy.py`.
- **Messaging/OTP:** OTP endpoints exist (`backend/routers/otp.py`) and are designed to send codes through the Hermes WhatsApp Baileys bridge, but no delivery channel is currently configured — see `AUDIT.md` for status.

Legacy PocketBase artifacts (`pocketbase` binary, `pb_hooks/`, `pb_migrations/`, `pb_data/`) remain in the repo for reference but are not used by the running application.

---

## 🚀 Key Features

1. **Auth & Security:** Email/password authentication (bcrypt + JWT). Every request is authorized against the caller's organisation membership and role; see `backend/middleware/auth.py` and `backend/utils/tenancy.py`.
2. **Multi-Organisation & Hierarchy:** Organisations → Projects → Sections (sub-projects) → Tasks, with 5-tier RBAC (owner/admin/editor/member/viewer).
3. **Kanban Boards:** Move tasks across Todo, In Progress, Review, and Done.
4. **Habit Tracking & Streaks:** Daily habit check-ins with automatic streak counting.
5. **Kaizen Continuous Improvement Logs:** Structured problem/solution logging, private per person.
6. **Time Tracking:** Time entries per organisation, private per person.
7. **Ikigai:** Four-question purpose planning tool (Love, Good At, World Needs, Paid For) plus a purpose statement, private per person.
8. **Member Management:** Invite by email, assign roles, remove members — from the Settings tab.
9. **Offline-first PWA:** Writes made offline are queued in IndexedDB and replayed on reconnect; see `frontend/src/utils/offlineQueue.js`.
10. **Admin CLI (`pm-cli.py`):** stdlib-only Python CLI for account provisioning, organisation/project/task management, and database backup/restore. See `CLI.md`.

---

## 🛠 Admin CLI Usage (`pm-cli.py`)

Run directly with Python — nothing to install:

```bash
# Show help & available commands
./pm-cli.py --help

# Create a user with a generated password
./pm-cli.py user create --name "John Doe" --email john@example.com --json

# List organisations you belong to
./pm-cli.py org list

# Backup the SQLite database (saves to backups/ with timestamp)
./pm-cli.py db backup

# Show database size and row counts per table
./pm-cli.py db status
```

Full command reference and a scripted end-to-end example: **`CLI.md`**.

---

## 🚢 Deployment

```bash
bash deploy-frontend.sh
```

This builds the client, publishes it to the repository root (the path GitHub Pages actually serves for this repo), preserves the live `config.json`, and verifies the new bundle is reachable before reporting success. There is no separate CI/CD pipeline — this script is the deploy path.

The backend is a systemd service; after any backend change:

```bash
sudo systemctl restart kaizenpm-api && sleep 3 && curl -s http://127.0.0.1:8090/api/health
```

---

## 📦 Resource Efficiency (6GB RAM / 1 OCPU)

- **FastAPI (uvicorn, 1 worker) RSS Memory:** capped at 512MB via systemd `MemoryMax`, typically well under that.
- **SQLite:** single file, no separate database process.
- Designed to coexist with other services already running on this box (Hermes agent, Cloudflare tunnels).

---

## More documentation

- **`CLI.md`** — full `pm-cli.py` command reference
- **`AUDIT.md`** — verification history, known gaps, and the standing rule that nothing is marked done without a command and its observed output
- **`DEPLOYMENT.md`**, **`QUICKSTART.md`** — earlier deployment and quickstart notes (verify against `AUDIT.md` for current accuracy before relying on them)
