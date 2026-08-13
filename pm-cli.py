#!/usr/bin/env python3
"""pm-cli — administrative CLI for KaizenPM.

Talks to the FastAPI server over HTTP using only the standard library, so it runs
anywhere Python does without installing anything. It is intended both for a human
operator and for an agent driving the system unattended: every command accepts
``--json`` and writes machine-readable output to stdout, with human messages on
stderr, so output can be piped safely.

Run ``pm-cli.py help`` for the command list, or see CLI.md for worked examples.
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import shutil
import string
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

API_URL = os.environ.get("PM_API_URL", "http://127.0.0.1:8090").rstrip("/")
PROJECT_DIR = os.path.dirname(os.path.realpath(__file__))
DB_PATH = os.path.join(PROJECT_DIR, "backend", "kaizenpm.db")
BACKUPS_DIR = os.path.join(PROJECT_DIR, "backups")
TOKEN_FILE = os.path.expanduser("~/.kaizenpm-cli-token")

JSON_MODE = False


# ── output ────────────────────────────────────────────────────────────────────

def info(msg: str) -> None:
    """Human-facing message. Goes to stderr so stdout stays pipeable."""
    if not JSON_MODE:
        print(msg, file=sys.stderr)


def die(msg: str, code: int = 1):
    if JSON_MODE:
        json.dump({"ok": False, "error": msg}, sys.stdout, indent=2)
        print()
    else:
        print(f"error: {msg}", file=sys.stderr)
    sys.exit(code)


def emit(data, table=None) -> None:
    """Print a result: JSON when --json, otherwise a readable table."""
    if JSON_MODE:
        json.dump({"ok": True, "data": data}, sys.stdout, indent=2, default=str)
        print()
        return
    if table and isinstance(data, list):
        if not data:
            print("(none)")
            return
        widths = [
            max(len(str(h)), max(len(str(r.get(k, ""))) for r in data))
            for h, k in table
        ]
        print("  ".join(h.ljust(w) for (h, _), w in zip(table, widths)))
        print("  ".join("-" * w for w in widths))
        for row in data:
            print("  ".join(str(row.get(k, "")).ljust(w) for (_, k), w in zip(table, widths)))
        return
    print(json.dumps(data, indent=2, default=str))


# ── http ──────────────────────────────────────────────────────────────────────

def request(method: str, path: str, body=None, token=None, allow_fail=False):
    url = f"{API_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read().decode()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        try:
            detail = json.loads(detail).get("detail", detail)
        except Exception:
            pass
        if allow_fail:
            return {"_error": detail, "_status": exc.code}
        die(f"{method} {path} -> {exc.code}: {detail}")
    except urllib.error.URLError as exc:
        die(f"cannot reach the API at {API_URL}: {exc.reason}")


def save_token(token: str) -> None:
    with open(TOKEN_FILE, "w") as fh:
        fh.write(token)
    os.chmod(TOKEN_FILE, 0o600)


def load_token() -> str:
    env = os.environ.get("PM_TOKEN")
    if env:
        return env
    if not os.path.exists(TOKEN_FILE):
        die("not signed in — run: pm-cli.py login --email EMAIL --password PASSWORD")
    with open(TOKEN_FILE) as fh:
        return fh.read().strip()


def generate_password(length: int = 16) -> str:
    """A readable but strong password: no characters that look alike."""
    alphabet = (
        string.ascii_lowercase.replace("l", "").replace("o", "")
        + string.ascii_uppercase.replace("I", "").replace("O", "")
        + string.digits.replace("0", "").replace("1", "")
    )
    # Guarantee the mix the server's own validation expects.
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        if any(c.isupper() for c in pw) and any(c.islower() for c in pw) and any(c.isdigit() for c in pw):
            return pw


# ── commands ──────────────────────────────────────────────────────────────────

def cmd_health(args):
    emit(request("GET", "/api/health"))


def cmd_login(args):
    res = request("POST", "/api/auth/login", {"identifier": args.email, "password": args.password})
    save_token(res["access_token"])
    info(f"signed in as {res['user']['email']}")
    emit({"email": res["user"]["email"], "name": res["user"]["name"]})


def cmd_whoami(args):
    token = load_token()
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    import base64

    claims = json.loads(base64.urlsafe_b64decode(payload))
    emit({
        "user_id": claims.get("sub"),
        "email": claims.get("email"),
        "org_id": claims.get("org_id"),
        "role": claims.get("role"),
        "permissions": claims.get("permissions", []),
    })


def cmd_user_create(args):
    """Provision an account with a generated password, for handing to a person.

    This covers the requirement that an administrator creates the account and the
    user then signs in and completes their own profile.
    """
    password = args.password or generate_password()
    res = request(
        "POST",
        "/api/auth/register",
        {
            "name": args.name,
            "email": args.email,
            "password": password,
            "confirm_password": password,
        },
        allow_fail=True,
    )
    if "_error" in res:
        die(f"could not create the account: {res['_error']}")

    info(f"created {args.email}")
    info("Give the person these details; they should change the password after signing in.")

    result = {"email": args.email, "name": args.name, "password": password}

    if args.org:
        token = load_token()
        added = request(
            "POST",
            f"/api/orgs/{args.org}/members",
            {"email": args.email, "role": args.role},
            token=token,
            allow_fail=True,
        )
        result["organization"] = args.org
        result["role"] = args.role
        result["added"] = "_error" not in added
        if "_error" in added:
            result["add_error"] = added["_error"]

    emit(result)


def cmd_org_list(args):
    orgs = request("GET", "/api/orgs", token=load_token())
    emit(orgs, table=[("ID", "id"), ("NAME", "name"), ("DESCRIPTION", "description")])


def cmd_org_create(args):
    org = request("POST", "/api/orgs", {"name": args.name, "description": args.description or ""}, token=load_token())
    info(f"created organisation {org['id']}")
    emit(org)


def cmd_org_members(args):
    members = request("GET", f"/api/orgs/{args.org}/members", token=load_token())
    rows = [
        {
            "id": m["id"],
            "name": (m.get("user") or {}).get("name", ""),
            "email": (m.get("user") or {}).get("email", ""),
            "role": m["role"],
        }
        for m in members
    ]
    emit(rows, table=[("ID", "id"), ("NAME", "name"), ("EMAIL", "email"), ("ROLE", "role")])


def cmd_org_invite(args):
    res = request(
        "POST",
        f"/api/orgs/{args.org}/members",
        {"email": args.email, "role": args.role},
        token=load_token(),
    )
    emit(res)


def cmd_project_list(args):
    projects = request("GET", f"/api/orgs/{args.org}/projects", token=load_token())
    emit(projects, table=[("ID", "id"), ("NAME", "name"), ("STATUS", "status")])


def cmd_project_create(args):
    token = load_token()
    project = request(
        "POST",
        f"/api/orgs/{args.org}/projects",
        {"name": args.name, "description": args.description or "", "status": "active"},
        token=token,
    )
    # Mirror the UI: a project without a section has nowhere to put tasks.
    section = request(
        "POST",
        f"/api/orgs/{args.org}/projects/{project['id']}/sub-projects",
        {"name": args.section, "status": "active"},
        token=token,
    )
    info(f"created project {project['id']} with section {section['id']}")
    emit({"project": project, "section": section})


def cmd_section_list(args):
    subs = request(
        "GET", f"/api/orgs/{args.org}/projects/{args.project}/sub-projects", token=load_token()
    )
    emit(subs, table=[("ID", "id"), ("NAME", "name"), ("STATUS", "status")])


def cmd_task_list(args):
    tasks = request(
        "GET",
        f"/api/orgs/{args.org}/projects/{args.project}/tasks/{args.section}",
        token=load_token(),
    )
    emit(tasks, table=[("ID", "id"), ("TITLE", "title"), ("STATUS", "status"), ("PRIORITY", "priority")])


def cmd_task_create(args):
    task = request(
        "POST",
        f"/api/orgs/{args.org}/projects/{args.project}/tasks/{args.section}",
        {"title": args.title, "description": args.description or "", "status": "todo", "priority": args.priority},
        token=load_token(),
    )
    info(f"created task {task['id']}")
    emit(task)


def cmd_task_move(args):
    task = request(
        "PUT",
        f"/api/orgs/{args.org}/projects/{args.project}/tasks/{args.section}/{args.task}",
        {"status": args.status},
        token=load_token(),
    )
    emit(task)


def cmd_habit_list(args):
    habits = request("GET", f"/api/orgs/{args.org}/habits", token=load_token())
    emit(habits, table=[("ID", "id"), ("TITLE", "title"), ("STREAK", "streak"), ("TARGET", "target_days")])


def cmd_habit_check(args):
    emit(request("POST", f"/api/orgs/{args.org}/habits/{args.habit}/check", token=load_token()))


def cmd_time_log(args):
    entry = request(
        "POST",
        f"/api/orgs/{args.org}/time",
        {"duration_minutes": args.minutes, "category": args.category},
        token=load_token(),
    )
    emit(entry)


def cmd_kaizen_log(args):
    log = request(
        "POST",
        f"/api/orgs/{args.org}/kaizen",
        {"title": args.title, "problem": args.problem, "solution": args.solution, "category": args.category},
        token=load_token(),
    )
    emit(log)


def cmd_comment_list(args):
    comments = request(
        "GET",
        f"/api/orgs/{args.org}/projects/{args.project}/tasks/{args.section}/{args.task}/comments",
        token=load_token(),
    )
    rows = [
        {"id": c["id"], "author": (c.get("user") or {}).get("name") or (c.get("user") or {}).get("email"), "content": c["content"]}
        for c in comments
    ]
    emit(rows, table=[("ID", "id"), ("AUTHOR", "author"), ("COMMENT", "content")])


def cmd_comment_add(args):
    comment = request(
        "POST",
        f"/api/orgs/{args.org}/projects/{args.project}/tasks/{args.section}/{args.task}/comments",
        {"content": args.content},
        token=load_token(),
    )
    emit(comment)


def cmd_notification_list(args):
    notifications = request("GET", "/api/notifications", token=load_token())
    emit(notifications, table=[("ID", "id"), ("TYPE", "type"), ("TITLE", "title"), ("MESSAGE", "message")])


def cmd_notification_read_all(args):
    emit(request("POST", "/api/notifications/read-all", token=load_token()))


def cmd_sprint_create(args):
    sprint = request(
        "POST",
        f"/api/orgs/{args.org}/projects/{args.project}/sprints",
        {
            "name": args.name,
            "goal": args.goal or None,
            "start_date": f"{args.start}T00:00:00",
            "end_date": f"{args.end}T00:00:00",
        },
        token=load_token(),
    )
    info(f"created sprint {sprint['id']}")
    emit(sprint)


def cmd_sprint_list(args):
    sprints = request("GET", f"/api/orgs/{args.org}/projects/{args.project}/sprints", token=load_token())
    emit(
        sprints,
        table=[("ID", "id"), ("NAME", "name"), ("STATUS", "status"), ("POINTS", "total_points"), ("DONE", "completed_points")],
    )


def cmd_search(args):
    results = request("GET", f"/api/orgs/{args.org}/search?q={urllib.parse.quote(args.query)}", token=load_token())
    emit(results, table=[("TYPE", "type"), ("ID", "id"), ("TITLE", "title"), ("SUBTITLE", "subtitle")])


def cmd_db_backup(args):
    """Copy the SQLite database aside.

    The database is a single file on purpose, so it can be moved to another host
    later without a migration exercise.
    """
    if not os.path.exists(DB_PATH):
        die(f"database not found at {DB_PATH}")
    os.makedirs(BACKUPS_DIR, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = os.path.join(BACKUPS_DIR, f"kaizenpm_{stamp}.db")
    shutil.copy2(DB_PATH, dest)
    info(f"backed up to {dest}")
    emit({"backup": dest, "bytes": os.path.getsize(dest)})


def cmd_db_status(args):
    import sqlite3

    if not os.path.exists(DB_PATH):
        die(f"database not found at {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    counts = {}
    for t in tables:
        try:
            counts[t] = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        except sqlite3.Error:
            counts[t] = None
    conn.close()
    emit({"path": DB_PATH, "bytes": os.path.getsize(DB_PATH), "rows": counts})


def cmd_db_restore(args):
    if not os.path.exists(args.backup):
        die(f"backup not found: {args.backup}")
    if os.path.exists(DB_PATH):
        safety = f"{DB_PATH}.before-restore"
        shutil.copy2(DB_PATH, safety)
        info(f"current database preserved at {safety}")
    shutil.copy2(args.backup, DB_PATH)
    info("restored — restart the API: sudo systemctl restart kaizenpm-api")
    emit({"restored_from": args.backup})


# ── argument parsing ──────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    # --json is attached to every subcommand as well as the top level, so both
    # "pm-cli --json health" and "pm-cli health --json" work. An agent should not
    # have to remember where the flag goes.
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--json", action="store_true", help="machine-readable output on stdout")

    p = argparse.ArgumentParser(
        prog="pm-cli.py", description="KaizenPM administrative CLI", parents=[common]
    )
    sub = p.add_subparsers(dest="command")

    def add(parent, name, **kw):
        return parent.add_parser(name, parents=[common], **kw)

    add(sub, "health", help="check that the API is up").set_defaults(func=cmd_health)

    lg = add(sub, "login", help="sign in and cache a token")
    lg.add_argument("--email", required=True)
    lg.add_argument("--password", required=True)
    lg.set_defaults(func=cmd_login)

    add(sub, "whoami", help="show the cached session's identity and role").set_defaults(func=cmd_whoami)

    user = sub.add_parser("user", help="account administration").add_subparsers(dest="sub")
    uc = add(user, "create", help="create an account with a generated password")
    uc.add_argument("--name", required=True)
    uc.add_argument("--email", required=True)
    uc.add_argument("--password", help="use a specific password instead of generating one")
    uc.add_argument("--org", type=int, help="also add them to this organisation")
    uc.add_argument("--role", default="member", choices=["admin", "editor", "member", "viewer"])
    uc.set_defaults(func=cmd_user_create)

    org = sub.add_parser("org", help="organisations").add_subparsers(dest="sub")
    add(org, "list").set_defaults(func=cmd_org_list)
    oc = add(org, "create")
    oc.add_argument("--name", required=True)
    oc.add_argument("--description")
    oc.set_defaults(func=cmd_org_create)
    om = add(org, "members")
    om.add_argument("--org", type=int, required=True)
    om.set_defaults(func=cmd_org_members)
    oi = add(org, "invite")
    oi.add_argument("--org", type=int, required=True)
    oi.add_argument("--email", required=True)
    oi.add_argument("--role", default="member", choices=["admin", "editor", "member", "viewer"])
    oi.set_defaults(func=cmd_org_invite)

    proj = sub.add_parser("project", help="projects").add_subparsers(dest="sub")
    pl = add(proj, "list")
    pl.add_argument("--org", type=int, required=True)
    pl.set_defaults(func=cmd_project_list)
    pc = add(proj, "create")
    pc.add_argument("--org", type=int, required=True)
    pc.add_argument("--name", required=True)
    pc.add_argument("--description")
    pc.add_argument("--section", default="General", help="name of the initial section")
    pc.set_defaults(func=cmd_project_create)

    sec = sub.add_parser("section", help="sections within a project").add_subparsers(dest="sub")
    sl = add(sec, "list")
    sl.add_argument("--org", type=int, required=True)
    sl.add_argument("--project", type=int, required=True)
    sl.set_defaults(func=cmd_section_list)

    task = sub.add_parser("task", help="tasks").add_subparsers(dest="sub")
    tl = add(task, "list")
    for a in ("--org", "--project", "--section"):
        tl.add_argument(a, type=int, required=True)
    tl.set_defaults(func=cmd_task_list)
    tc = add(task, "create")
    for a in ("--org", "--project", "--section"):
        tc.add_argument(a, type=int, required=True)
    tc.add_argument("--title", required=True)
    tc.add_argument("--description")
    tc.add_argument("--priority", default="medium", choices=["low", "medium", "high", "urgent"])
    tc.set_defaults(func=cmd_task_create)
    tm = add(task, "move")
    for a in ("--org", "--project", "--section", "--task"):
        tm.add_argument(a, type=int, required=True)
    tm.add_argument("--status", required=True, choices=["todo", "in_progress", "review", "done"])
    tm.set_defaults(func=cmd_task_move)

    habit = sub.add_parser("habit", help="habits").add_subparsers(dest="sub")
    hl = add(habit, "list")
    hl.add_argument("--org", type=int, required=True)
    hl.set_defaults(func=cmd_habit_list)
    hc = add(habit, "check")
    hc.add_argument("--org", type=int, required=True)
    hc.add_argument("--habit", type=int, required=True)
    hc.set_defaults(func=cmd_habit_check)

    tme = sub.add_parser("time", help="time tracking").add_subparsers(dest="sub")
    tlg = add(tme, "log")
    tlg.add_argument("--org", type=int, required=True)
    tlg.add_argument("--minutes", type=int, required=True)
    tlg.add_argument("--category", default="general")
    tlg.set_defaults(func=cmd_time_log)

    kz = sub.add_parser("kaizen", help="improvement log").add_subparsers(dest="sub")
    kl = add(kz, "log")
    kl.add_argument("--org", type=int, required=True)
    kl.add_argument("--title", required=True)
    kl.add_argument("--problem", default="")
    kl.add_argument("--solution", default="")
    kl.add_argument("--category", default="productivity")
    kl.set_defaults(func=cmd_kaizen_log)

    comment = sub.add_parser("comment", help="task comments").add_subparsers(dest="sub")
    cl = add(comment, "list")
    for a in ("--org", "--project", "--section", "--task"):
        cl.add_argument(a, type=int, required=True)
    cl.set_defaults(func=cmd_comment_list)
    ca = add(comment, "add")
    for a in ("--org", "--project", "--section", "--task"):
        ca.add_argument(a, type=int, required=True)
    ca.add_argument("--content", required=True)
    ca.set_defaults(func=cmd_comment_add)

    notif = sub.add_parser("notification", help="in-app notifications").add_subparsers(dest="sub")
    add(notif, "list").set_defaults(func=cmd_notification_list)
    add(notif, "read-all").set_defaults(func=cmd_notification_read_all)

    sprint = sub.add_parser("sprint", help="sprint planning").add_subparsers(dest="sub")
    spc = add(sprint, "create")
    for a in ("--org", "--project"):
        spc.add_argument(a, type=int, required=True)
    spc.add_argument("--name", required=True)
    spc.add_argument("--goal")
    spc.add_argument("--start", required=True, help="YYYY-MM-DD")
    spc.add_argument("--end", required=True, help="YYYY-MM-DD")
    spc.set_defaults(func=cmd_sprint_create)
    spl = add(sprint, "list")
    for a in ("--org", "--project"):
        spl.add_argument(a, type=int, required=True)
    spl.set_defaults(func=cmd_sprint_list)

    se = add(sub, "search", help="search projects, tasks, habits and kaizen logs in an org")
    se.add_argument("--org", type=int, required=True)
    se.add_argument("--query", required=True)
    se.set_defaults(func=cmd_search)

    db = sub.add_parser("db", help="database maintenance").add_subparsers(dest="sub")
    add(db, "backup").set_defaults(func=cmd_db_backup)
    add(db, "status").set_defaults(func=cmd_db_status)
    dr = add(db, "restore")
    dr.add_argument("--backup", required=True)
    dr.set_defaults(func=cmd_db_restore)

    return p


def main() -> None:
    global JSON_MODE
    parser = build_parser()
    args = parser.parse_args()
    JSON_MODE = getattr(args, "json", False)
    if not hasattr(args, "func"):
        parser.print_help()
        sys.exit(1)
    args.func(args)


if __name__ == "__main__":
    main()
