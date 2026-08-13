# KaizenPM — Invigilator Audit & Remediation Plan

**Audit date:** 2026-08-13
**Auditor stance:** adversarial. Nothing is "done" until the full loop is observed:
browser → deployed asset → HTTPS API → database → visible result in UI.

---

## 0. Verdict

**The application does not work.** Not "mostly works with gaps" — the deployed page is
blank, the API server is not running, and the client was never pointed at a reachable
server. Every previous "complete and functional" claim (this session and the Hermes
session `20260729_200704_a0129b`) was unverified.

Observed evidence:

| Check | Command | Result |
|---|---|---|
| Deployed page loads | `curl https://ccoolavi.github.io/project-manager/` | `200` (HTML only) |
| Deployed JS bundle loads | `curl .../assets/index-Fx5pu4gu.js` | **`404` — blank white page** |
| URL given to user last turn | `curl https://avishkarsolat.github.io/project-manager/` | **`404` — wrong account entirely** |
| gh-pages branch contents | `git ls-tree -r origin/gh-pages` | **`index.html` only, zero assets** |
| API server running | `ss -tlnp` | **no FastAPI process anywhere** |
| Port 8000 | `curl localhost:8000/api/health` | **occupied by an unrelated shop/rental API** |
| PocketBase on 8090 | `curl localhost:8090` | **dead** |
| Public tunnel | `curl https://developers-took-cognitive-vsnet.trycloudflare.com/api/health` | `502` (tunnel alive, origin dead) |

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

1. **Deployed site is a blank page.** `frontend/.gitignore:18` ignores `dist`, so
   `git subtree push --prefix frontend/dist` shipped only the one stale tracked
   `index.html`. The bundle it references was never committed.
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

### Phase 0 — Close the loop (highest priority)

| # | Action | Verification |
|---|---|---|
| 0.1 | Move FastAPI to `:8090` (PocketBase is dead; the **existing** cloudflared quick tunnel already forwards 8090 and gives HTTPS for free) | `curl localhost:8090/api/health` → 200 |
| 0.2 | Generate a real `SECRET_KEY`; set `FRONTEND_URL=https://ccoolavi.github.io` | grep `.env`, confirm 43-char random value |
| 0.3 | Fix CORS to use origins, add the tunnel origin | `curl -H 'Origin: https://ccoolavi.github.io' -X OPTIONS` → `access-control-allow-origin` present |
| 0.4 | Add `frontend/.env.production` with the tunnel HTTPS URL | `grep trycloudflare dist/assets/*.js` |
| 0.5 | Un-ignore `dist`, or force-add, so assets actually deploy | `git ls-tree -r origin/gh-pages` lists `assets/*.js` |
| 0.6 | Redeploy and fetch the bundle over the public URL | `curl -I .../assets/index-*.js` → 200 |
| 0.7 | Register → login → create org **through the public URL** | JWT returned; row visible in SQLite |
| 0.8 | systemd unit so the API survives reboot | `systemctl status` → active |

### Phase 1 — Make every visible feature real

| # | Action | Verification |
|---|---|---|
| 1.1 | Create `routers/kaizen.py`, `routers/time.py`; register both | routes appear in `/openapi.json` |
| 1.2 | Sub-project create UI in `ProjectList.jsx` | create sub-project → Kanban renders |
| 1.3 | Fix cross-org leak: validate project→org and sub-project→project on every task route | org B member gets 403/404 for org A task |
| 1.4 | Fix `add_member` response model | POST member → 200 with typed body |
| 1.5 | Fix habit JSON persistence (`MutableList` or reassignment) | check habit, restart server, streak survives |
| 1.6 | Implement `PermissionGate` against JWT permissions | viewer sees no Delete button |
| 1.7 | Member invite UI | invite → accept → second user sees same org data |

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

## 4. Standing rule for this project

No task is marked complete in this file without the verification column filled in with a
command that was actually run and its observed output. Compilation success, route
registration, and health checks are **not** acceptance evidence.
