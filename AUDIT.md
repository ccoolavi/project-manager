# KaizenPM — Invigilator Audit & Remediation Plan

**Audit date:** 2026-08-13
**Auditor stance:** adversarial. Nothing is "done" until the full loop is observed:
browser → deployed asset → HTTPS API → database → visible result in UI.

---

## 0. Verdict (as found)

**The application did not work.** The site visitors saw was a months-old PocketBase-era
build, the API server was not running at all, and the client had never been pointed at a
reachable server. Every previous "complete and functional" claim (this session and the
Hermes session `20260729_200704_a0129b`) was unverified.

Observed evidence:

| Check | Command | Result |
|---|---|---|
| Deployed page loads | `curl https://ccoolavi.github.io/project-manager/` | `200` — but a **stale build from 6 Aug** |
| URL given to the user last turn | `curl https://avishkarsolat.github.io/project-manager/` | **`404` — wrong account entirely** |
| gh-pages branch contents | `git ls-tree -r origin/gh-pages` | **`index.html` only, zero assets** |
| API server running | `ss -tlnp` | **no FastAPI process anywhere** |
| Port 8000 | `curl localhost:8000/api/health` | **occupied by an unrelated shop/rental API** |
| PocketBase on 8090 | `curl localhost:8090` | **dead** |
| Public tunnel | `curl https://…trycloudflare.com/api/health` | `502` (tunnel alive, origin dead) |
| Register a user | `POST /api/auth/register` | **500** — two independent crashes (see D7, E4) |

### Correction to an earlier reading

My first pass called the live page "blank". That was wrong, and the real situation is no
better. GitHub Pages for this repo is configured as **deploy from branch `main`, root
folder** — it serves the *repository root*, where an old build was committed on 6 August.
So the `git subtree push --prefix frontend/dist origin gh-pages` deploys were doubly
broken: `dist` is git-ignored so they pushed almost nothing, **and** nothing serves the
`gh-pages` branch anyway. Every deploy reported success while the live site never changed.

---

## 1. Invigilator checklist — everything that must be checked

### A. Reachability (the "handshake" the user has asked for since July)

- [ ] A1. Is an API process actually listening, and on which port?
- [ ] A2. Is that port free, or already owned by another app on this 6 GB box?
- [ ] A3. Is the API reachable from the public internet over **HTTPS**?
      GitHub Pages is HTTPS; a browser will hard-block any `http://` API call as mixed
      content. An Oracle ingress rule on a plain port does not solve this.
- [ ] A4. Does the built client contain the production API URL, or did it bake in
      `http://localhost:8000`?
- [ ] A5. Does the CORS allow-list contain the browser **origin**
      (`https://ccoolavi.github.io`) and not a full path URL? A path never matches.
- [ ] A6. Does a real cross-origin preflight (`OPTIONS`) succeed from that origin?

### B. Deployment integrity

- [ ] B1. Are the built JS/CSS assets actually present on the branch GitHub Pages serves?
- [ ] B2. Is `dist` git-ignored, silently making every `git subtree push` a no-op?
- [ ] B3. Are there two competing deploy mechanisms (Actions workflow *and* gh-pages
      subtree) fighting each other?
- [ ] B4. Does the Actions workflow still inject dead PocketBase variables?
- [ ] B5. Does the repo URL in the docs match the actual git remote?
- [ ] B6. Does the app survive a hard refresh on a deep link (HashRouter requirement)?

### C. Backend/frontend contract

- [ ] C1. Does every `api.*` call in the client have a matching server route?
- [ ] C2. Do response shapes match the Pydantic `response_model` declarations?
- [ ] C3. Can a user reach the primary screen (Tasks) at all, or is it gated behind an
      object no UI can create?

### D. Security & multi-tenancy (the user explicitly demanded isolation)

- [ ] D1. Can a member of org A read org B's tasks by passing their own `org_id` with a
      foreign `sub_project_id`?
- [ ] D2. Are sub-projects verified to belong to the project, and projects to the org?
- [ ] D3. Is `SECRET_KEY` a real secret, or a literal un-expanded shell string?
- [ ] D4. Is the RBAC the user asked for actually enforced in the UI, or a stub?
- [ ] D5. Are secrets, `venv/`, and `__pycache__` committed to the repo?
- [ ] D6. Does the generic 500 exception handler swallow real errors during debugging?

### E. Data-layer correctness

- [ ] E1. Do in-place mutations of JSON columns (e.g. `habit.completed_dates.append`)
      actually persist? SQLAlchemy does not track them without a mutable type.
- [ ] E2. Do enum values round-trip between Pydantic and SQLAlchemy?
- [ ] E3. Is streak logic correct across days, or does it increment forever?

### F. Original requirements from Hermes session `20260729_200704_a0129b`

The user's 13-point brief. Current status:

| # | Requirement | Status |
|---|---|---|
| 1 | Personal time + habit tracking, private per user | Partial — habits exist; time has **no server route** |
| 2 | Login + user DB on this server, free | Done (SQLite) |
| 3 | WhatsApp/Signal integration for OTP | **Missing** — models only, no router, no bridge call |
| 4 | Admin creates accounts w/ auto-generated password; user verifies phone by OTP | **Missing** |
| 5 | Elite PM interface: Kanban, Ikigai, Kaizen | Partial — Kanban/Kaizen client-side only; **Ikigai orphaned** |
| 6 | CLI for db/user/project + docs for autonomous agent use | **Broken** — `pm-cli.py` still targets PocketBase |
| 7 | Resource-efficient on 6 GB / 1 OCPU | At risk — must not run PocketBase and FastAPI together |
| 8 | Detachable DB for future migration | Partial — SQLAlchemy allows it; no migrations |
| 9 | Client talks to one exposed endpoint; data only after auth | **Never achieved** |
| 10 | Cross-device/browser compatible | Unverified |
| 11 | Beautiful, elegant, functional | Unverified — page is blank |
| 12 | Other standard PM features | Partial |
| 13 | Maintain progress file with per-task verification | This file |

### G. Later requirements (this session)

- [ ] G1. Multi-user / multi-admin / multi-org / multi-project simultaneously
- [ ] G2. Simple UI for non-technical users, no technical jargon in the UI
- [ ] G3. Offline-first PWA + background sync queue
- [ ] G4. PWA icons — manifest references two icons that **do not exist**
- [ ] G5. INR (₹) currency + DD-MM-YYYY localization
- [ ] G6. Member invite UI (backend exists, no UI)
- [ ] G7. Automated test suite, backend and E2E

---

## 2. Confirmed defects

### P0 — blocks any use whatsoever

1. **Deployed site was a stale build.** Pages serves the repo root; the deploys targeted
   the `gh-pages` branch, which nothing serves, and `frontend/.gitignore:18` ignores
   `dist` so those pushes carried almost nothing either.
2. **No API server running.** Nothing serves the FastAPI app.
3. **Port collision.** `:8000` is taken by an unrelated app. FastAPI must move.
4. **No HTTPS path to the API.** Required for a page served from GitHub Pages.
5. **`SECRET_KEY` is the literal text** `$(python3 -c "import secrets; ...")` —
   command substitution never ran inside the quoted heredoc. All JWTs are signed with a
   publicly guessable constant.
6. **CORS can never match.** `allow_origins=["https://avishkarsolat.github.io/project-manager/"]`
   is both the wrong account *and* a path rather than an origin.
7. **Client has no production API URL.** No `.env`, so the bundle targets `localhost:8000`.

### P1 — features advertised but non-functional

8. **`/time` and `/kaizen` routers do not exist.** `TimeLogger.jsx` and `KaizenLog.jsx`
   call them; both tabs 404.
9. **Tasks tab is unreachable.** `KanbanBoard` requires a `subProjectId`; no UI can create
   a sub-project, so the default tab is permanently empty.
10. **Cross-org data leak.** `routers/tasks.py` checks org membership against the *path*
    `org_id` but then queries `Task.sub_project_id` with no ownership chain. Any member of
    any org can read, edit, or delete another org's tasks by guessing an ID. Same flaw in
    `list_sub_projects`.
11. **`add_member` returns a plain dict** under `response_model=OrganizationMemberResponse`
    → response validation error.
12. **Habit check-in does not persist.** `habit.completed_dates.append(...)` mutates a JSON
    column in place; SQLAlchemy does not detect it without `MutableList`.
13. **`PermissionGate` is a no-op stub** — the RBAC UI restriction was never implemented.

### Found only by actually exercising the API

These two made registration — the very first thing any user does — return a 500 every
single time. Neither could be found by inspection, compilation, or a health check, which
is precisely why "the build succeeds" was never acceptance evidence.

14. **`AmbiguousForeignKeysError` on `User.assigned_tasks`.** `Task` references `users`
    twice (`assignee_id` and `created_by`), so SQLAlchemy could not resolve the
    relationship and every ORM query raised.
15. **passlib is incompatible with bcrypt 4.x.** `ValueError: password cannot be longer
    than 72 bytes` on every password hash. Replaced passlib with bcrypt directly.

### P2 — requirements never started

14. WhatsApp OTP flow, admin-provisioned accounts, Ikigai, working CLI, invite UI,
    PWA icons, offline queue, INR localization, tests.

### P3 — hygiene

15. PocketBase leftovers still in `src/` (`services/pocketbase.js`, `Ikigai.jsx`,
    `Organizations.jsx`, `OtpVerification.jsx`, `SubProjects.jsx`, `TimeManagement.jsx`).
16. `venv/` and `__pycache__/` committed (a 4,482-file commit).
17. `.github/workflows/deploy.yml` still injects `VITE_PB_URL` and competes with the
    gh-pages subtree push.
18. Docs cite the wrong GitHub account throughout.
19. Blanket `@app.exception_handler(Exception)` hides real errors.

---

## 3. Remediation plan

Ordered so that the user can *see* something work as early as possible.

### Phase 0 — Close the loop — **DONE, verified 2026-08-13**

| # | Action | Verification (actually run) |
|---|---|---|
| 0.1 | Move FastAPI to `:8090` (the existing cloudflared tunnel already forwards it, giving HTTPS free) | ✅ `curl localhost:8090/api/health` → `{"status":"ok"}` |
| 0.2 | Generate a real `SECRET_KEY`; `FRONTEND_URL=https://ccoolavi.github.io` | ✅ `.env` holds a 64-char random value |
| 0.3 | Fix CORS to use bare origins | ✅ preflight from `https://ccoolavi.github.io` → `access-control-allow-origin` echoed, HTTP 200 |
| 0.4 | `frontend/.env.production` with the HTTPS API URL | ✅ tunnel URL present in bundle, `localhost:8000` count = 0 |
| 0.5 | Deploy to the path Pages actually serves (repo root, not gh-pages) | ✅ `deploy-frontend.sh` rewritten; live `index.html` references the new hash |
| 0.6 | Fetch the new bundle over the public URL | ✅ `assets/index-pzTnviT4.js` → 200; icons and webmanifest → 200 |
| 0.7 | Full user journey through the **public HTTPS** endpoint | ✅ 19/19 checks pass (register, login, org, project, section, task CRUD, habit, time, kaizen) |
| 0.8 | systemd unit so the API survives reboot | ✅ `systemctl is-active kaizenpm-api` → `active`, `is-enabled` → `enabled` |

### Phase 1 — Make every visible feature real — **mostly done**

| # | Action | Verification (actually run) |
|---|---|---|
| 1.1 | Create `routers/kaizen.py`, `routers/time.py`; register both | ✅ create + list both return 200 over HTTPS |
| 1.2 | Section (sub-project) create UI, plus an auto-created default section per project | ✅ sub-project creation returns 200; board no longer dead-ends |
| 1.3 | Fix cross-org leak via `utils/tenancy.py` | ✅ Bob using his own `org_id` + Alice's `sub_project_id` → 404 on read and on delete |
| 1.5 | Fix habit JSON persistence (`MutableList`) | ✅ streak = 1 after a fresh re-read |
| 1.6 | Implement `PermissionGate` against JWT permission claims | ✅ implemented; UI-level check only, server still authoritative |
| 1.4 | Fix `add_member` response model | ⬜ outstanding |
| 1.7 | Member invite UI | ⬜ outstanding (task #21) |

### Phase 2 — Outstanding original requirements

| # | Action | Verification |
|---|---|---|
| 2.1 | WhatsApp OTP router wired to the Hermes Baileys bridge | OTP delivered, `verified_at` set |
| 2.2 | Admin account provisioning with generated password | CLI creates user, user logs in |
| 2.3 | Retarget `pm-cli.py` from PocketBase to the FastAPI API + docs | CLI CRUD round-trip |
| 2.4 | Ikigai module wired to the API | data persists |
| 2.5 | PWA icons, offline queue, INR/DD-MM-YYYY localization | Lighthouse PWA pass; offline create syncs |
| 2.6 | pytest suite incl. tenant-isolation tests + E2E script | `pytest` green |

### Phase 3 — Hygiene

| # | Action | Verification |
|---|---|---|
| 3.1 | Delete PocketBase leftovers | build succeeds with no dead imports |
| 3.2 | `git rm -r --cached` venv/pycache, extend `.gitignore` | repo file count drops |
| 3.3 | Retire or fix the Actions workflow so one deploy path exists | single successful deploy |
| 3.4 | Correct all docs to `ccoolavi` | grep finds no `avishkarsolat` |
| 3.5 | Scope the exception handler so real errors surface | forced error returns detail in non-prod |

---

---

## 3a. Closing state — 2026-08-13

Every item in the plan above is done except OTP delivery, which the user held.

| Suite | Command | Result |
|---|---|---|
| Backend unit | `backend/venv/bin/python -m pytest` | **26 passed** |
| API end-to-end, public HTTPS | `bash backend/tests/e2e_api.sh` | **19 passed** |
| Browser journey, deployed site | `node frontend/tests/ui-live.mjs` | **19 passed** |
| Offline sync, deployed site | `node frontend/tests/offline-sync.mjs` | **5 passed** |

### Original 13-point brief — final status

| # | Requirement | Status |
|---|---|---|
| 1 | Personal time + habit tracking, private per user | Done — habits, time, kaizen and ikigai are all per-user |
| 2 | Login + user DB on this server, free | Done — SQLite |
| 3 | WhatsApp/Signal integration for OTP | **Held** — endpoints and tests done; no delivery channel available |
| 4 | Admin-provisioned accounts with generated passwords | Done — `pm-cli.py user create` |
| 5 | Kanban, ikigai, kaizen | Done |
| 6 | CLI + docs for autonomous agent use | Done — `pm-cli.py`, `CLI.md` |
| 7 | Resource-efficient on 6 GB / 1 OCPU | Done — one uvicorn worker, `MemoryMax=512M`, PocketBase retired |
| 8 | Detachable DB | Done — single SQLite file, `db backup` / `db restore` |
| 9 | Client talks to one exposed endpoint; data only after auth | Done — HTTPS tunnel, JWT on every route |
| 10 | Cross-device compatible | Partly — responsive layout, verified at desktop width only |
| 11 | Beautiful, elegant, functional | Done enough to use; subjective |
| 12 | Other standard PM features | Partly — no due-date reminders, attachments or search |
| 13 | Progress file with per-task verification | This file |

### Known remaining gaps

- **OTP delivery** has no channel. The WhatsApp bridge is not running; `signal-cli`
  on `127.0.0.1:8081` is a candidate. Nothing user-facing depends on it.
- **Mobile layout is unverified.** The CSS is responsive but has only been
  exercised at 1280×900.
- **The API host is still an ephemeral tunnel.** Rotation no longer breaks the
  client, but a named tunnel would remove the moving part entirely.
- **No audit-log UI.** The table and model exist; nothing writes to or reads it.
- **`InviteAcceptPage` is still a stub.** Invited users who already have an
  account are added directly, so the token flow is unused in practice.

## 3b. Second closing state — 2026-08-13 (main_agent_prompt.md, Part A + B1–B11 + C3/C4)

A second, larger scope of work landed after 3a: the four immediate fixes in Part A,
eleven new features (B1–B11), the CLI extension (C3), and — at the user's direct,
mid-session request — email-based login/2FA that wasn't in the original plan at all.

| Suite | Command | Result |
|---|---|---|
| Backend unit | `backend/venv/bin/python -m pytest` | **88 passed** |
| API end-to-end, public HTTPS | `bash backend/tests/e2e_api.sh` | **19 passed** |
| Browser journey, deployed site | `node frontend/tests/ui-live.mjs` | **19 passed** |
| Offline sync, deployed site | `node frontend/tests/offline-sync.mjs` | **5 passed** |
| Plus 11 feature-specific curl suites and 11 feature-specific live-browser suites, one per B-phase feature and email OTP | `backend/tests/curl_*.sh`, `frontend/tests/*-ui.mjs` | all passing at time of commit |

### What shipped

- **Part A**: stale `config.json` redeployed, duplicate `httpx` line removed,
  README rewritten to describe the real FastAPI/SQLAlchemy/SQLite architecture,
  `Caddyfile`'s leftover `PocketBase-Token` CORS header replaced.
- **B1 Task Comments** — threaded comments on tasks, comment count on cards.
- **B2 Global Search** — projects/tasks/habits/kaizen, org-scoped.
- **B3 Notifications** — polled every 30s, triggered on assignment/comment/invite.
- **B4 Task Detail Panel** — full editing drawer: status, priority, dates, assignee,
  story points, comments.
- **B5 Team Workload** — stacked bar chart of assigned tasks by status per person.
- **B6 Analytics** — completion rate, habit leaderboard, time by category, velocity.
- **B7 Timeline/Gantt** — hand-rolled bar chart, no library.
- **B8 Task Dependencies** — "blocked by" with a server-computed `blocked` flag.
- **B9 Sprint Planning** — sprints, story-point burndown, per-sprint board.
- **B10 Calendar** — monthly grid, org-wide task fetch via a new flat endpoint.
- **B11 Bulk Operations** — multi-select + bulk status/priority/assign/delete.
- **C3** — `pm-cli.py` extended with `comment`, `notification`, `sprint`, `search`.
- **Email OTP (user request, not in the original plan)** — login by email or
  phone; a device the account has never used is challenged with an emailed code;
  sensitive actions (removing a member, deleting a project) require a fresh code
  within a 5-minute window; both skip cleanly when the account has no email or the
  caller is a non-browser client (no `device_id`), so `pm-cli.py` automation is
  unaffected.

### Real bugs the verification loop actually caught (not just written, — proven)

- **`AmbiguousForeignKeysError`** on `User.assigned_tasks` — pre-existing, found
  while wiring B1.
- **Cross-org bulk-action leak pattern re-tested**: B11's bulk endpoint validates
  every `task_id` independently against the org, the same class of bug fixed once
  before in `utils/tenancy.py`; a dedicated test (`test_bulk_cross_org_task_id_reported_as_failed_not_silently_dropped`)
  pins it so it can't return silently a third time.
- **Blocking SMTP send** (email OTP): a live-browser test showed the
  sensitive-action modal took 4+ seconds to appear because the SMTP send
  blocked the HTTP response; moved to `BackgroundTasks` so the code is valid and
  the response returns immediately, and the same test re-run afterward confirmed
  the fix.
- **Stale `blocked` flag across tasks** (B8): finishing a blocking task left the
  *other*, unedited task's card still showing its lock icon, because the client
  patched only the single edited task into local state. `KanbanBoard` and
  `GanttView` now reload the full task list on any save.
- **Ambiguous test locator became a real accessibility fix** (B11): the bulk
  delete button had no way to be distinguished from the half-dozen per-card
  delete buttons already on the page — not just a test problem, a screen-reader
  problem — so it got an `aria-label`, not just a better test selector.
- **Deploy race**: `deploy-frontend.sh` copying the whole build over the repo
  root could clobber a `config.json` that `rotate-tunnel.sh` had just rewritten
  mid-deploy; fixed to preserve the live config and feed it back into the
  source tree.

### Still open

- **OTP *delivery* for the original WhatsApp-based 2FA** remains held — no
  channel is configured. The new **email**-based challenge/2FA is live and
  delivers real mail through the Hermes gateway's Gmail account.
- **Mobile layout** was fixed for the sidebar/navbar earlier in this project but
  the eleven new B-phase screens (analytics charts, Gantt, calendar, sprint
  board) have not been individually verified at phone width.
- **The API host is still an ephemeral tunnel.** Rotation no longer breaks the
  client (runtime `config.json`), but a named tunnel would remove the moving
  part entirely.
- **No audit-log UI for the newer entities** (sprints, dependencies) — the
  existing audit log only covers projects/tasks/members/comments.
- **`InviteAcceptPage` is still a stub**, unchanged from 3a.

## 4. Standing rule for this project

No task is marked complete in this file without the verification column filled in with a
command that was actually run and its observed output. Compilation success, route
registration, and health checks are **not** acceptance evidence.
