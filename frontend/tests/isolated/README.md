# Isolated browser tests for KaizenPM

These suites drive the real web app in Chromium against a **throw-away stack** (temporary SQLite, local API on 18090/18091,
local static server on 15173). They never touch the live API, database or the public site, and requests to the live hosts
are blocked and counted (the summary prints the count; it must be 0).

| File | What it checks |
|---|---|
| `pm_t1_addtask.mjs` | add-task in every situation: normal, double-click, offline queue and replay, API address change, no section, viewer role, selection memory |
| `pm_t2_workflow.mjs` | sign-in/out, organisations, projects, habits, kaizen, time, analytics, search, My Timeline, people (add/role/remove with the emailed-code step), invitations |
| `pm_t3_pwa_mobile_crawl.mjs` | manifest/icons/service worker, offline reload, logout clears cached data, no password stored offline, silent session renewal, phone width on every screen, a crawler pressing every non-destructive control |
| `legacy/*.mjs` | the older per-feature scripts, adapted to run against the isolated stack (`PM_BASE=http://127.0.0.1:15173/project-manager/`) |

Run: `./start_isolated_stack.sh`, then e.g. `PM_SITE=/tmp/kaizenpm-isolated/site/project-manager PM_DB=/tmp/kaizenpm-isolated/test.db node pm_t2_workflow.mjs`.
Mail is switched off in the stack: the tests put a known code into the one-time-code table (same bcrypt hashing as the server) and type it into the dialog, exactly as a person would.
The machine has ONE CPU: do not run heavy jobs at the same time, or fixed waits can fail for the wrong reason.
