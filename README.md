# KaizenPM — Elite Project Management & Habit Tracking Suite

A resource-efficient, self-hosted, full-stack project management and habit tracking platform designed for Oracle Cloud ARM64 (1 OCPU, 6GB RAM).

---

## 🏗 Architecture Overview

- **Backend:** PocketBase v0.39 (SQLite-based, single binary, <40MB RAM) running as a systemd service (`kaizenpm-api`) on port `8090`.
- **Database:** SQLite (`pb_data/data.db`), fully detachable and portable for future storage migration.
- **Frontend:** React 18 + Vite + TailwindCSS SPA hosted on GitHub Pages (`ccoolavi.github.io/project-manager/`).
- **Communication:** Secure cross-origin API calls from GitHub Pages SPA to the VPS endpoint (`http://92.4.85.159:8090`).
- **Messaging/OTP:** Integrated WhatsApp Baileys bridge (`http://127.0.0.1:3000`) for WhatsApp OTP verification and admin alerts.

---

## 🚀 Key Features

1. **Auth & Security:** PocketBase email/password authentication with JWT stored securely in browser `localStorage`. Protected routes redirect unauthenticated users to `/login`.
2. **WhatsApp OTP Verification:** Custom PocketBase JS hooks (`pb_hooks/otp.pb.js`) generating 6-digit OTPs and dispatching via the Baileys WhatsApp bridge.
3. **Multi-Organization & Hierarchy:** Organizations, Sub-Projects, and Tasks with full CRUD tied to the authenticated user via PocketBase Record Ownership (RLS).
4. **Kanban Boards:** Interactive drag/move tasks across Todo, In Progress, Review, and Done.
5. **Habit Tracking & Streaks:** Daily habit completion check-ins with automatic streak counting.
6. **Kaizen Continuous Improvement Logs:** Structured problem/solution/impact logging.
7. **Pomodoro & Time Tracking:** Time logs per project/task with active timer.
8. **Ikigai Framework:** 4-circle life purpose planning tool (Love, Good At, World Needs, Paid For) with persistent storage.
9. **Admin CLI (`pm-cli`):** Python CLI tool for user management, automated credential delivery via WhatsApp, DB backups, and health monitoring.

---

## 🛠 Admin CLI Usage (`pm-cli`)

The `pm-cli` utility is installed globally at `/usr/local/bin/pm-cli`.

```bash
# Show help & available commands
pm-cli help

# Create a new user (auto-generates 12-char password and sends WhatsApp welcome)
pm-cli user create --name "John Doe" --email john@example.com --phone +1234567890

# List all users
pm-cli user list

# Delete a user by ID
pm-cli user delete <user_id>

# List all projects
pm-cli project list

# Backup SQLite database (saves to backups/ with timestamp)
pm-cli db backup

# Show database size and record counts per collection
pm-cli db status
```

---

## 📦 Resource Efficiency (6GB RAM / 1 OCPU)

- **PocketBase RSS Memory:** ~25MB – 35MB
- **Node.js WhatsApp Bridge RSS:** ~60MB – 80MB
- **Total Footprint:** <150MB RAM (leaving 5.8GB+ free for Hermes agent and other services).
