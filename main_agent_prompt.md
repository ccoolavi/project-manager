# KaizenPM — Main Agent Prompt
## Project: `/home/ubuntu/projects/project_manager`

> **VALIDATED against actual source code. Read all notes — they prevent wasted work.**

---

## Architecture Snapshot (read before touching anything)

| Layer | Tech | Details |
|---|---|---|
| Backend | FastAPI + SQLAlchemy + SQLite | `backend/`, port 8090, systemd `kaizenpm-api.service` |
| Frontend | React 18 + Vite + TailwindCSS + lucide-react | `frontend/src/`, deployed to GitHub Pages |
| Auth | JWT in localStorage, `Bearer` header on all API calls | `backend/routers/auth.py`, `backend/middleware/auth.py` |
| Tunnel | Cloudflare quick tunnel to localhost:8090 | URL stored at runtime in `config.json` |
| Deploy | `bash deploy-frontend.sh` — builds, copies to repo root, commits, pushes, waits for Pages | **No GitHub Actions CI exists** |
| DB schema | `Base.metadata.create_all()` in `main.py` creates NEW tables only | Existing tables need raw `ALTER TABLE` for new columns |
| Routing | **`App.jsx` has 4 top-level routes only** (`/login`, `/register`, `/invite/:token`, `/dashboard`) | New feature tabs go in `DashboardPage.jsx` + `Sidebar.jsx`, NOT in `App.jsx` |
| Task URL | Task endpoints live under `/api/orgs/{org_id}/projects/{project_id}/tasks/{sub_project_id}` | Tasks have NO direct `organization_id` field — join chain is: task → sub_project → project → org |
| Frontend state | React Context (`AuthContext`, `OrgContext`) + axios (`utils/api.js`) | No Redux, no query lib |
| Icons | `lucide-react` only — do not add icon libraries | |
| Charts | None installed yet — use `recharts` (add to `frontend/package.json`) | |

**Key constraint:** `config.json` at the repo root is the live API endpoint managed by `rotate-tunnel.sh`.
The deploy script already preserves it. Never overwrite it manually.

---

## PART A — Immediate Fixes (do these first, in order)

### A1. Rebuild and redeploy the frontend

`frontend/dist/config.json` has a stale tunnel URL from a previous build.
The deploy script handles everything including preserving the live `config.json`.

```bash
bash /home/ubuntu/projects/project_manager/deploy-frontend.sh
```

Wait for the script to confirm "LIVE and verified" before proceeding.

---

### A2. Remove duplicate httpx in requirements.txt

File: `backend/requirements.txt` — line 14 is an exact duplicate of line 13.
Remove line 14 (`httpx==0.25.2`). No restart needed.

---

### A3. Update README.md to reflect the actual architecture

The README still describes PocketBase. Replace the Architecture section to reflect:
- Backend: FastAPI + SQLAlchemy + SQLite (`backend/`), systemd `kaizenpm-api.service`, port 8090
- Tunnel: Cloudflare quick tunnel (URL in `config.json`)
- PocketBase binary/hooks/migrations: present in repo but unused, kept for reference
- Deploy: `bash deploy-frontend.sh`

Do NOT delete `pb_hooks/`, `pb_migrations/`, or the `pocketbase` binary — they are harmless.

---

### A4. Fix Caddyfile leftover header (cosmetic, low priority)

`Caddyfile` `Access-Control-Allow-Headers` still lists `PocketBase-Token`.
Replace with: `"Authorization, Content-Type, Accept, X-Requested-With"`
Only matters if Caddy is ever run directly. The Cloudflare tunnel bypasses it currently.

---

## PART B — New Features (implement in the order listed)

**Schema rule:** `Base.metadata.create_all()` creates new tables automatically on restart.
For adding columns to **existing** tables, use raw SQL via SQLite:

```python
# Add this to the FastAPI lifespan startup block in main.py
from sqlalchemy import text
with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE tasks ADD COLUMN story_points INTEGER DEFAULT 0"))
        conn.commit()
    except Exception:
        pass  # column already exists — safe to ignore
```

Do this pattern for every new column on an existing table. Put all migrations in one startup block.

---

### B1. Task Comments (highest impact, do first)

**Why first:** Every PM tool has this. Zero new infrastructure needed.

**Backend — new model** (add to `backend/models.py`):

```python
class TaskComment(Base):
    __tablename__ = "task_comments"
    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    task = relationship("Task", back_populates="comments")
    user = relationship("User")
```

Add to the existing `Task` model:
```python
comments = relationship("TaskComment", back_populates="task", cascade="all, delete-orphan")
```

**Backend — new router** `backend/routers/comments.py`:
- `GET  /api/orgs/{org_id}/projects/{proj_id}/tasks/{sub_id}/{task_id}/comments` — list
- `POST /api/orgs/{org_id}/projects/{proj_id}/tasks/{sub_id}/{task_id}/comments` — create (body: `{content}`)
- `DELETE /api/orgs/{org_id}/projects/{proj_id}/tasks/{sub_id}/{task_id}/comments/{comment_id}` — delete own comment or admin

Register in `backend/main.py`: `app.include_router(comments.router)`

**Frontend — new component** `frontend/src/components/TaskComments.jsx`:
- Props: `{ orgId, projectId, subProjectId, taskId }`
- Shows comment list with author name + relative timestamp
- Textarea + submit button to add a comment
- Delete button visible only for own comments

**Frontend — wire into KanbanBoard:**
Make each TaskCard clickable (not the delete button) to open a side panel showing `<TaskComments />`.
Add a comment count badge (speech bubble icon) to each card.

---

### B2. Global Search

**Backend — new router** `backend/routers/search.py`:
- `GET /api/orgs/{org_id}/search?q=<query>` — requires auth + org membership
- Tasks do NOT have `organization_id` directly. You MUST join through the chain:
  `tasks JOIN sub_projects ON tasks.sub_project_id = sub_projects.id JOIN projects ON sub_projects.project_id = projects.id WHERE projects.organization_id = org_id`
- Also query with `LIKE '%q%'` across: `projects.name` (filter by org), `habits.title` (filter by org), `kaizen_logs.title` (filter by org) — these have direct `organization_id`
- Return unified list: `[{ type, id, title, subtitle, url_hint }]`
- Limit 20 results total, minimum 2 chars. Register in `main.py`.

**Frontend — search bar in `Navbar.jsx`:**
- Search input with 300ms debounce
- Floating dropdown of results below the bar
- Each result clickable — navigate to that section in the dashboard

---

### B3. Notifications (in-app, polling)

**Backend — new model** (add to `backend/models.py`):

```python
class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    org_id = Column(Integer, ForeignKey("organizations.id"), index=True)
    type = Column(String)   # task_assigned | comment_added | invite_received
    title = Column(String)
    message = Column(Text)
    entity_type = Column(String, nullable=True)
    entity_id = Column(Integer, nullable=True)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
```

**Trigger notifications from existing routers:**
- `tasks.py` — on task assignment, create Notification for the assignee
- `comments.py` — on new comment, create Notification for the task assignee
- `invites.py` — on invite sent, create Notification if the email already belongs to a user

**Backend — new router** `backend/routers/notifications.py`:
- `GET  /api/notifications` — list unread for current user
- `POST /api/notifications/{id}/read` — mark one read
- `POST /api/notifications/read-all` — mark all read

**Frontend — bell in `Navbar.jsx`:**
- `Bell` icon from lucide-react, red badge with unread count
- Poll `GET /api/notifications` every 30 seconds via `setInterval` in a `useEffect`
- Dropdown list of notifications with mark-read action

---

### B4. Task Detail Panel (prerequisite for B7 Gantt)

**Context:** KanbanBoard TaskCard currently shows title + priority only. No way to set due date or assignee.

**Backend — Step 1: add columns to tasks table** (in the FastAPI lifespan startup block in `main.py`):
```python
# Add ALL new task columns here in one block — do not split across features
for stmt in [
    "ALTER TABLE tasks ADD COLUMN story_points INTEGER DEFAULT 0",
    "ALTER TABLE tasks ADD COLUMN start_date TIMESTAMP",
]:
    try:
        conn.execute(text(stmt))
        conn.commit()
    except Exception:
        pass  # column already exists
```

**Backend — Step 2: update `schemas.py`** — the `PUT` endpoint uses `TaskUpdate` and `TaskResponse`.
You MUST add the new fields to both schemas or they will be silently ignored:
```python
# In TaskCreate and TaskUpdate add:
story_points: Optional[int] = None
start_date: Optional[datetime] = None

# In TaskResponse add:
story_points: Optional[int] = None
start_date: Optional[datetime] = None
```

**Backend — Step 3: update `tasks.py` `update_task()`** to save `story_points` and `start_date`:
```python
if task_data.story_points is not None:
    task.story_points = task_data.story_points
if task_data.start_date is not None:
    task.start_date = task_data.start_date
```

**Frontend — right-side drawer panel:**
When a TaskCard is clicked (not the delete button), slide in a right-side drawer showing:
- Editable title (inline edit)
- Priority selector (low / medium / high / urgent)
- Status selector
- Due date picker (`<input type="date">`)
- Start date picker (`<input type="date">`)
- Assignee selector (populated from `GET /api/orgs/{org}/members`)
- Story points input (number 1–13)
- Comments thread (`<TaskComments />` from B1)

On any change, immediately call `PUT` endpoint (optimistic update on success).

---

### B5. Team Workload View

**Backend — new endpoint** in `backend/routers/organizations.py`:

`GET /api/orgs/{org_id}/workload`

SQL aggregation: for each org member, count their assigned tasks grouped by status.
Return: `[{ user_id, user_name, todo, in_progress, review, done, total }]`

**Frontend — new component** `frontend/src/components/WorkloadView.jsx`:
- Install recharts first: `npm install recharts@^2.12.7` in `frontend/`
- Horizontal stacked bar chart (one bar per person)
- Colors: todo=slate-500, in_progress=blue-500, review=amber-500, done=green-500

Add "Workload" to sidebar.

---

### B6. Analytics / Reporting Dashboard

**Backend — new router** `backend/routers/analytics.py` (no new models, pure aggregations):
- `GET /api/orgs/{org_id}/analytics/tasks` — completion rate by project + overall
- `GET /api/orgs/{org_id}/analytics/habits` — streak leaderboard + completion rate last 30d
- `GET /api/orgs/{org_id}/analytics/time` — hours per category per user last 30d
- `GET /api/orgs/{org_id}/analytics/velocity` — tasks completed per week, last 8 weeks

**Frontend — new page** `frontend/src/pages/AnalyticsPage.jsx`:
- Uses recharts: LineChart for velocity, BarChart for time, PieChart for task status distribution
- Three summary cards: Task Stats, Habit Stats, Time Stats

Add "Analytics" to sidebar and add route in `App.jsx`.

---

### B7. Gantt / Timeline View

**Context:** After B4, tasks have `start_date` and `due_date`. No further backend changes needed.
**Do NOT add another `ALTER TABLE` here** — `start_date` was already added in B4's startup block.

**Frontend — new component** `frontend/src/components/GanttView.jsx`:
- Custom lightweight Gantt (no library needed for this scale)
- X-axis: date range from today−2w to today+6w
- Y-axis: one row per task, grouped by project name
- Horizontal bar from `start_date` to `due_date`, colored by priority
- If no `start_date`, use `created_at`
- Clicking a bar opens the Task Detail Panel from B4

Add "Timeline" to sidebar.

---

### B8. Task Dependencies (blocked by)

**Backend — new model** (add to `backend/models.py`):

```python
class TaskDependency(Base):
    __tablename__ = "task_dependencies"
    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id"))        # the blocked task
    depends_on_id = Column(Integer, ForeignKey("tasks.id"))  # the blocking task
    created_at = Column(DateTime, default=datetime.utcnow)
```

**Backend — new endpoints** in `tasks.py`:
- `POST   /api/orgs/{org}/projects/{proj}/tasks/{sub}/{task_id}/dependencies` body: `{ depends_on_id }`
- `DELETE /api/orgs/{org}/projects/{proj}/tasks/{sub}/{task_id}/dependencies/{dep_id}`
- `GET    /api/orgs/{org}/projects/{proj}/tasks/{sub}/{task_id}/dependencies`

**Frontend — in Task Detail Panel (B4):**
- "Blocked by" section: list of blocking tasks as dismissable chips
- Button to add a dependency (searchable dropdown of tasks in the same project)
- Show a lock icon on Kanban cards blocked by an unfinished task

---

### B9. Sprint Planning

**Backend — two new models** (add to `backend/models.py`):

```python
class Sprint(Base):
    __tablename__ = "sprints"
    id = Column(Integer, primary_key=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    name = Column(String)
    goal = Column(Text, nullable=True)
    start_date = Column(DateTime)
    end_date = Column(DateTime)
    status = Column(String, default="planning")  # planning | active | completed
    created_at = Column(DateTime, default=datetime.utcnow)
    tasks = relationship("SprintTask", back_populates="sprint", cascade="all, delete-orphan")

class SprintTask(Base):
    __tablename__ = "sprint_tasks"
    id = Column(Integer, primary_key=True)
    sprint_id = Column(Integer, ForeignKey("sprints.id"))
    task_id = Column(Integer, ForeignKey("tasks.id"), unique=True)
    sprint = relationship("Sprint", back_populates="tasks")
    task = relationship("Task")
```

**Backend — new router** `backend/routers/sprints.py`:
- CRUD for sprints under `/api/orgs/{org}/projects/{proj}/sprints`
- `POST /api/orgs/{org}/projects/{proj}/sprints/{sprint_id}/tasks` — add task
- `DELETE /api/orgs/{org}/projects/{proj}/sprints/{sprint_id}/tasks/{task_id}` — remove task
- `GET /api/orgs/{org}/projects/{proj}/sprints/{sprint_id}/burndown` — daily completed story points

**Frontend — SprintBoard:**
- Sprint selector at top of Kanban
- When sprint selected, Kanban filters to sprint tasks only
- Sprint header: goal, date range, story points progress bar
- "Add to sprint" on each task card
- Burndown chart (recharts LineChart)

Add "Sprints" to sidebar.

---

### B10. Calendar View

**Backend — new endpoint required** (no flat task list exists today).
Add to `backend/routers/tasks.py` a **second router** with a different prefix:
```python
org_router = APIRouter(prefix="/api/orgs/{org_id}/tasks", tags=["tasks-org"])

@org_router.get("", response_model=List[TaskResponse])
async def list_all_org_tasks(
    org_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """All tasks across every project in the org, for calendar/gantt."""
    user_id = int(current_user.get("sub"))
    require_membership(db, org_id, user_id)
    tasks = (
        db.query(Task)
        .join(SubProject, Task.sub_project_id == SubProject.id)
        .join(Project, SubProject.project_id == Project.id)
        .filter(Project.organization_id == org_id)
        .all()
    )
    return [TaskResponse.from_orm(t) for t in tasks]
```
Register `org_router` separately in `main.py`: `app.include_router(org_router)`

**Frontend — new component** `frontend/src/components/CalendarView.jsx`:
- Monthly calendar grid, pure CSS + JS (no library)
- Fetch from `GET /api/orgs/{org_id}/tasks` once at mount, filter client-side by `due_date`
- Each day cell shows tasks due that day as priority-colored chips
- Month navigation (prev/next), "Today" jump button
- Clicking a chip opens the Task Detail Panel (B4)

Add "Calendar" to sidebar.

---

### B11. Bulk Task Operations

**Backend — IMPORTANT: cannot use the existing tasks router prefix.**
The existing tasks router prefix is `/api/orgs/{org_id}/projects/{project_id}/tasks` and requires `project_id`.
Bulk operations are org-scoped. Use the same `org_router` introduced in B10:

```python
# Add to org_router in tasks.py (same router as B10's list_all_org_tasks)
@org_router.post("/bulk")
async def bulk_task_action(
    org_id: int,
    body: BulkTaskAction,  # new Pydantic schema — see below
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ...
```

Add new schema to `schemas.py`:
```python
class BulkTaskAction(BaseModel):
    task_ids: List[int]
    action: str   # update_status | assign | delete | set_priority
    value: Optional[str] = None  # status string, user_id string, priority string, or None for delete
```

For each task_id, verify the full chain (task → sub_project → project → org_id matches) before acting.
Return: `{ "updated": N, "failed": [] }`

**Frontend — in KanbanBoard:**
- Checkbox on each TaskCard
- Floating bulk-action toolbar appears when any tasks are checked
- Actions: Change status, Assign to, Set priority, Delete
- After action, call `POST /api/orgs/{org}/tasks/bulk`, then refresh board

---

## PART C — Final Steps

### C1. Install recharts (do before B5, B6, B9)
```bash
cd /home/ubuntu/projects/project_manager/frontend && npm install recharts@^2.12.7
```

### C2. Restart backend after every model change
```bash
sudo systemctl restart kaizenpm-api && sleep 3 && curl -s http://127.0.0.1:8090/api/health
```

### C3. Update pm-cli.py
Add `comment list`, `notification list`, `sprint create/list`, `search` subcommands
following the exact same pattern: stdlib only, `--json` flag, `emit()`, `load_token()`.

### C4. Final deploy
```bash
bash /home/ubuntu/projects/project_manager/deploy-frontend.sh
```

---

## Implementation Order Summary

| Order | Feature | Backend? | Frontend? | New Models? |
|---|---|---|---|---|
| A1 | Redeploy frontend | — | — | — |
| A2 | Fix duplicate httpx | file edit | — | — |
| A3 | Update README | — | — | — |
| B1 | Task Comments | new router | new component + KanbanBoard | TaskComment |
| B2 | Global Search | new router | Navbar search bar | — |
| B3 | Notifications | new router + triggers | Navbar bell | Notification |
| B4 | Task Detail Panel | add story_points + start_date cols | drawer/panel | — |
| B5 | Team Workload | new endpoint in orgs router | WorkloadView + recharts | — |
| B6 | Analytics | new router | AnalyticsPage + recharts | — |
| B7 | Gantt View | — (uses B4 cols) | GanttView | — |
| B8 | Task Dependencies | new model + endpoints | task detail section | TaskDependency |
| B9 | Sprint Planning | new router | SprintBoard + burndown | Sprint, SprintTask |
| B10 | Calendar View | new `org_router` endpoint | CalendarView | — |
| B11 | Bulk Operations | reuse `org_router` from B10 | checkboxes + toolbar | — |
| C4 | Final deploy | — | — | — |

---

## Guiding Principles — Do Not Violate

1. **Never touch `config.json` or `frontend/public/config.json` manually** — managed by `rotate-tunnel.sh`
2. **Use `lucide-react` only for icons** — do not install Heroicons, FontAwesome, etc.
3. **No WebSockets** — polling every 30s is sufficient for this self-hosted single-server setup
4. **No Alembic** — use raw SQLite `ALTER TABLE ADD COLUMN` in a try/except startup block in `main.py`. Put ALL column migrations in ONE block.
5. **All new API routes must check org membership** — follow `require_membership()` from `utils/tenancy.py`
6. **Keep SQLite** — do not suggest Postgres or any other DB engine
7. **Deploy only via `deploy-frontend.sh`** — never push `dist/` directly or use a `gh-pages` branch
8. **Test each new backend route with curl before writing the frontend for it**
9. **New feature tabs go in `DashboardPage.jsx` + `Sidebar.jsx`** — NOT as new routes in `App.jsx`
10. **When adding fields to tasks, update `schemas.py` too** — `TaskCreate`, `TaskUpdate`, AND `TaskResponse`
11. **The task join chain is: task → sub_project_id → sub_projects → project_id → projects → organization_id** — never filter tasks by org without walking this chain
