# Cross-org view, personal timeline, and scoped invites

Status: approved by user, ready for implementation plan
Date: 2026-08-14

## Problem

KaizenPM's dashboard is entirely org-scoped: `OrgContext.currentOrg` drives
every page, the JWT is refreshed to carry a single `org_id` + `role`
(`POST /api/auth/refresh?org_id=`), and there is no view of "all my orgs at
once." Two gaps this creates for a user who belongs to several
organizations:

1. No single place to see every org you belong to, your role in each, or
   act on them (rename, leave, create a new one) without fully switching
   context into each one first.
2. No way to see whether your commitments across *different* organizations
   collide in time — e.g. a work-org deadline landing on the same day as a
   personal-project exam date.

Separately, the existing invite flow (`POST /api/orgs/{org_id}/members`)
only grants org-wide roles, and — for an email with no existing account —
creates a pending `OrganizationInvite` row and nothing else: no `User` row,
no password, nothing to hand the invitee. They must self-register with the
matching email and then accept the invite themselves. This doesn't match
the account-provisioning pattern already used elsewhere in this app (see
`pm-cli.py user create`, which the admin used to create the owner's own
account): admin creates the account, admin hands over credentials.

## Goals

- A "My Organizations" hub: list every org the user belongs to, with role,
  member count, and inline actions (switch, rename, leave); org creation
  moves here.
- A "My Timeline" view: a calendar/gantt overlay, color-coded by org, of
  every task assigned to the current user across every org they belong to,
  plus the sprint bars for sprints containing those tasks. This is the
  mechanism for spotting cross-org deadline collisions.
- A generalized invite flow that can grant access to a whole org (today's
  behavior, unchanged) **or** to one specific project within an org the
  inviter controls, with a chosen access level, and that provisions a
  password for brand-new invitees the same way `pm-cli.py user create`
  does today.
- A hard, non-negotiable access rule: no endpoint added or touched by this
  work may return org/project data to a user who lacks either an
  `OrganizationMember` row for that org or a `ProjectMember` row for that
  exact project. No admin-role exception, no implicit visibility from
  owning a different org.

## Non-goals

- No public/unauthenticated share links — every viewer must be an existing
  or newly-provisioned KaizenPM account (per user's explicit choice).
- No task-detail duplication — "My Timeline" always renders the live task
  record; opening it from the timeline opens the same task detail panel
  used everywhere else, subject to the viewer's normal edit rights in that
  task's org/project.
- No auto-population of "My Timeline" from org-admin/owner visibility —
  only tasks where `Task.assignee_id == current_user`. An org owner does
  not get that org's entire backlog on their personal timeline just by
  virtue of being the owner; they visit that org's own dashboard for that.
- No change to the JWT/token model. `get_current_user` already yields the
  caller's `user_id` (`sub` claim) independent of any org-scoping; every
  new route in this spec does its own live DB check from that `user_id`,
  the same pattern `require_membership`/`resolve_project` already use for
  org-scoped routes.

## Data model changes

### New table: `project_members`

```python
class ProjectRole(str, enum.Enum):
    viewer = "viewer"
    editor = "editor"

class ProjectMember(Base):
    __tablename__ = "project_members"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    role = Column(SQLEnum(ProjectRole), default=ProjectRole.viewer)
    invited_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project")
    user = relationship("User")
```

Granting a `ProjectMember` row to a user does **not** create an
`OrganizationMember` row for them — they do not appear in that org's
member roster, do not get an org-scoped JWT for it, and nothing in that
org shows up on their "My Timeline" (they're not assigned any tasks by
virtue of this grant). It only grants access to the one named project:

- `role = viewer`: can view the project's tasks/dates and post comments
  (`TaskComment`), cannot edit tasks.
- `role = editor`: can additionally edit tasks within that project (same
  as the `task:edit` check an org `editor` gets, but scoped to this one
  project rather than the whole org).

No new table is needed for "My Timeline" itself — it is a query, not
stored state (`Task.assignee_id == current_user`, joined across every org
the user belongs to via existing `OrganizationMember` rows).

## API changes

### `GET /api/me/orgs`

Returns the same shape as today's `GET /api/orgs` (list of orgs the caller
belongs to) plus the caller's `role` and a `member_count` per org, for the
My Organizations hub. (`GET /api/orgs` itself is left as-is since other
code depends on its current response shape; this is an additive endpoint,
not a replacement.)

### `PATCH /api/orgs/{org_id}`

Rename/describe an org. Requires `role in ("owner", "admin")` via
`require_membership` + `require_role`, matching the existing pattern in
`utils/tenancy.py`.

### `DELETE /api/orgs/{org_id}/members/me`

Leave an org (delete your own `OrganizationMember` row). No role
requirement beyond being a member — anyone can leave, including an owner,
*except* the sole remaining owner of an org with other members must not be
allowed to leave with nobody left to own it (return 400 in that one case;
otherwise a member simply stops belonging).

### `GET /api/me/timeline`

For the caller (`user_id` from `get_current_user`, no `org_id` needed):

1. `orgs = OrganizationMember.filter(user_id=me)` → org ids.
2. `tasks = Task.join(SubProject).join(Project).filter(Project.organization_id.in_(orgs), Task.assignee_id == me)`.
3. For each task, also resolve its org name/id (for the color-coding) and
   any `Sprint` it belongs to (via `SprintTask`), for the sprint bars.
4. Return `{tasks: [...], sprints: [...]}`, each task carrying
   `organization_id`, `organization_name`, `project_id`, `project_name` so
   the frontend can color-code and link back to the live record.

This is a straightforward extension of the ownership-chain-revalidation
style already used throughout `routers/tasks.py` — no new access-control
primitive, just a query scoped to "orgs I'm actually a member of."

### `GET /api/me/controlled-scopes`

For populating the invite dialog's scope dropdown: every org where the
caller's role is `owner` or `admin`, each with its list of projects
(`id`, `name`). The frontend only offers scopes from this list — an
invite can never target an org/project the inviter doesn't control.

### `POST /api/orgs/{org_id}/members` (extended, not replaced)

Existing endpoint, existing request shape (`email`, `role`), same
admin/owner-only guard. The only behavior change: when
`User.query(email=...)` finds no existing account, instead of creating a
bare pending `OrganizationInvite` with nothing else, it now:

1. Generates a password (`generate_password()`, a new helper in
   `utils/security.py`, mirroring the one already in `pm-cli.py`).
2. Creates the `User` row directly (same fields `routers/auth.py`'s
   `register` sets, using `hash_password`).
3. Creates the `OrganizationMember` row for them immediately (status is
   moot now — there's no pending self-registration step to wait on).
4. Returns `{"message": ..., "temporary_password": "<generated>"}` so the
   inviting admin's UI can display it once, for hand-off — the existing
   "admin provisions, hands credentials over" pattern used for
   `solatavi@gmail.com`/`ccoolavi7@gmail.com` earlier in this project,
   just moved into the product instead of living only in `pm-cli.py`.

When the email *does* already belong to an existing `User` (today's
"auto-add" branch), behavior is unchanged: no password is generated or
returned, they're just added to the org and notified.

### `POST /api/orgs/{org_id}/projects/{project_id}/members` (new)

Same shape and same new-vs-existing-user branching as above, but:

- Requires caller to be `owner`/`admin` of `org_id` (`require_role`) —
  matching "only scopes I control" from `GET /api/me/controlled-scopes`.
- Body is `{email, role}` where `role` is `viewer` or `editor`
  (`ProjectRole`, not `UserRole` — a project grant cannot be `owner`/
  `admin`, those only make sense at the org level).
- Writes a `ProjectMember` row instead of `OrganizationMember`.
- Same temporary-password branch for brand-new emails.

## Access control changes

`utils/tenancy.py` gets one new helper, following the existing style:

```python
def require_project_access(db, project_id, user_id, need_edit=False):
    """Org member of the project's org (any role) always has access.
    Otherwise, a ProjectMember row for this exact project is required;
    if need_edit, that row's role must be `editor`."""
```

Every project/task route that currently only checks
`require_membership(org)` gains this as an *alternative* path, not a
replacement: org members keep working exactly as today; a caller who
fails the org-membership check now gets one more chance via
`ProjectMember` before a 403. Comment endpoints require *some* access
(viewer or editor); task-edit endpoints require `need_edit=True`
(editor only).

This is additive and keeps the existing "prove the whole ownership chain"
discipline intact — a `ProjectMember` grant is checked against the exact
`project_id` in the URL, never trusted from a client-supplied org_id.

## Frontend changes

- **New page**: "My Organizations" (own sidebar entry, outside the
  existing org-scoped tab set) — table of orgs from `GET /api/me/orgs`,
  switch/rename/leave inline, "Create organization" moved here.
- **New page**: "My Timeline" (own sidebar entry) — calendar/gantt reusing
  the existing `CalendarView`/`GanttView` rendering primitives, fed by
  `GET /api/me/timeline`, tasks color-coded by `organization_name`.
  Clicking a task opens the existing task detail panel against the task's
  real `project_id`/`sub_project_id` — no new detail UI.
- **`MemberManager.jsx` invite form** gains:
  - A scope selector: "Whole organization" (today's behavior) or a
    project picked from `GET /api/me/controlled-scopes`.
  - When scope = project, the role dropdown switches from
    `INVITABLE_ROLES` (org roles) to `["viewer", "editor"]`.
  - On success, if the response includes `temporary_password`, show it in
    the success banner (not just "Invitation sent to ...") with a copy
    button, so the admin can hand it over.

## Testing

- Backend: pytest cases for `require_project_access` (org member without
  `ProjectMember` still works; non-member with `viewer` `ProjectMember`
  can view/comment but gets 403 on edit; non-member with `editor`
  `ProjectMember` can edit; non-member with neither gets 403 on
  everything, including a project inside an org they own a *different*
  project in — proving no cross-project leakage within the same org).
  Cases for `GET /api/me/timeline` returning only assigned tasks across
  multiple orgs, never unassigned ones. Cases for the new-vs-existing-user
  branch of both invite endpoints (temporary_password present only for
  brand-new accounts).
- Full existing suite must stay green — this is additive to the
  permission model, not a change to any existing check.
