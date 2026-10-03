# My Timeline (all organisations)

One page showing everything assigned to **me**, across every organisation I belong to (and every project I was
invited to directly), so I can plan and avoid overlaps. The per-organisation **Timeline** tab is unchanged.

## What it tells you
* **Where the clashes are and how bad**, not just that bars touch: each day shows hours of work versus hours you
  have. 12 h on an 8 h day is "severely overloaded"; the headline names the day, the tasks and how many
  organisations are involved. A clash across two organisations is the case no single organisation's Gantt can show.
* **Heads-up list** in plain words: overloaded days, 3+ deadlines on one day, a task scheduled to start before the task
  blocking it is due, a deadline on a day off, overdue tasks.
* **Views over one set of numbers:** Timeline (start-to-due bars, one lane per organisation, load strip on top),
  Agenda (dated list, the default on a phone), Month (calendar, overloaded days outlined).
* Filters: range (2 weeks / 6 weeks / 3 months), organisation chips, show done, working week. Hiding an organisation
  hides its lane, never its hours: the clash stays visible because the work still has to be done.

## How the numbers are worked out (`backend/utils/workload.py`, pure functions)
* **Effort of a task** = its *Estimate (hours)*; else story points x 2 h; else 2 h. Guessed effort is shown with a `~`.
* **Remaining work:** to do / in progress 100%, in review 25% (waiting on someone else), done 0 (never warned about).
* **Spreading:** evenly over your working days between start and due. Days already gone are not planned. A task with
  only a due date lands on the last working day on or before it (a Sunday deadline means Saturday). An open task past its due date is carried to today.
  A task with no due date is listed as "No due date" and is not counted.
* **Day level:** light below 75% of capacity, busy 75-100%, overloaded above 100%, severe above 125%.
* **Working week** is each person's own (default Mon-Sat, 8 h) and is saved in that browser only; it is sent with each request, nothing is stored on the server.

## Who can see what
* Only tasks where the assignee is the caller. Never an organisation's full backlog, never anyone else's tasks.
* Tasks in organisations I belong to, **or** in projects I hold a direct project grant for. Losing either removes the tasks at once.
* Sprints: only non-completed sprints that overlap the window and contain one of my tasks.

## API
`GET /api/me/timeline` - optional `from`, `to` (default today-14 .. today+90, max 1 year), `include_done`, `work_days`
(ISO weekdays, `1,2,3,4,5,6`), `hours_per_day` (1-24), `today` (the browser's date; must be within a day of the server's).
The original keys (`tasks`, `sprints`) keep their shape; `days`, `warnings`, `unscheduled_task_ids`, `summary`, `window` were added.

## Data
`tasks.estimate_hours REAL NULL` (added by the migration block in `backend/main.py`). Nullable: older code ignores it,
rollback is safe. Estimates can be set or changed in the task drawer; clearing one is not supported (same as story points).

## Tests
* `backend/tests/test_workload_math.py` (the rules), `test_me_timeline_load.py` (access, parameters, API numbers),
  `test_me_timeline.py` (original three).
* `frontend/tests/isolated/pm_t4_my_timeline.mjs` (browser, isolated stack only): clash headline and strip, lanes,
  clash marks, own-tasks-only, hiding organisations, estimate edit clearing a clash, working week, three views, empty
  month stays navigable, offline notice and recovery, empty page, phone width.

## Not included (follow-ups)
Showing a manager an assignee's busy hours while assigning (needs an hours-only design so no titles leak across
organisations); calendar-app (ICS) subscription; drag to reschedule; holidays/leave; sidebar clash badge; notifications for new clashes.
