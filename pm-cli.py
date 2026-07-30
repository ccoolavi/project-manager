#!/usr/bin/env python3
"""
pm-cli — Admin CLI for KaizenPM (PocketBase user/project/DB management with WhatsApp notifications)

Commands:
  pm-cli user create --name NAME --email EMAIL --phone PHONE
  pm-cli user list
  pm-cli user delete <id>
  pm-cli project list
  pm-cli db backup
  pm-cli db status
  pm-cli help
"""

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

# ── Configuration ──────────────────────────────────────────────────────────────

POCKETBASE_URL = os.environ.get("PM_PB_URL", "http://127.0.0.1:8090")
WHATSAPP_BRIDGE_URL = os.environ.get("PM_WA_URL", "http://127.0.0.1:3000")
PROJECT_DIR = os.path.dirname(os.path.realpath(__file__))
PB_DATA_DIR = os.path.join(PROJECT_DIR, "pb_data")
BACKUPS_DIR = os.path.join(PROJECT_DIR, "backups")

# Superuser credentials — env var fallback to hardcoded defaults
SUPERUSER_EMAIL = os.environ.get("PM_SUPERUSER_EMAIL", "avisolat18@gmail.com")
SUPERUSER_PASSWORD = os.environ.get("PM_SUPERUSER_PASSWORD", "admin123123")

# ── ANSI Colors ────────────────────────────────────────────────────────────────

class Color:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    CYAN = '\033[96m'
    BOLD = '\033[1m'
    RESET = '\033[0m'
    GRAY = '\033[90m'


def green(text):
    return f"{Color.GREEN}{text}{Color.RESET}"


def red(text):
    return f"{Color.RED}{text}{Color.RESET}"


def yellow(text):
    return f"{Color.YELLOW}{text}{Color.RESET}"


def cyan(text):
    return f"{Color.CYAN}{text}{Color.RESET}"


def bold(text):
    return f"{Color.BOLD}{text}{Color.RESET}"


def gray(text):
    return f"{Color.GRAY}{text}{Color.RESET}"


# ── PocketBase API helpers ─────────────────────────────────────────────────────

def _api_request(method, path, data=None, token=None, params=None, expect_empty=False):
    """Make a JSON API request to PocketBase."""
    url = f"{POCKETBASE_URL}{path}"
    if params:
        qs = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in params.items())
        url = f"{url}?{qs}"

    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            if expect_empty:
                return None
            if not raw:
                return None
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8") if e.fp else "{}"
        try:
            error_data = json.loads(error_body)
        except json.JSONDecodeError:
            error_data = {"message": error_body}
        msg = error_data.get("message", str(e)) if isinstance(error_data, dict) else str(error_data)
        raise RuntimeError(f"API error {e.code}: {msg}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Connection failed: {e.reason}")


def _superuser_auth():
    """Authenticate as superuser and return a token."""
    data = _api_request(
        "POST",
        "/api/collections/_superusers/auth-with-password",
        {"identity": SUPERUSER_EMAIL, "password": SUPERUSER_PASSWORD},
    )
    return data["token"]


def _get_records(collection, token, **params):
    """Fetch all records from a collection (handles pagination)."""
    params.setdefault("perPage", 100)
    params.setdefault("page", 1)
    result = _api_request("GET", f"/api/collections/{collection}/records", token=token, params=params)
    items = result.get("items", [])
    total = result.get("totalItems", 0)
    per_page = result.get("perPage", 100)
    page = result.get("page", 1)
    total_pages = result.get("totalPages", 1)

    while page < total_pages:
        page += 1
        params["page"] = page
        next_page = _api_request("GET", f"/api/collections/{collection}/records", token=token, params=params)
        items.extend(next_page.get("items", []))

    return items


def _get_record(collection, record_id, token):
    """Get a single record by ID."""
    return _api_request("GET", f"/api/collections/{collection}/records/{record_id}", token=token)


def _create_record(collection, data, token):
    """Create a record in a collection."""
    return _api_request("POST", f"/api/collections/{collection}/records", data=data, token=token)


def _delete_record(collection, record_id, token):
    """Delete a record by ID. Returns True on success."""
    _api_request("DELETE", f"/api/collections/{collection}/records/{record_id}", token=token, expect_empty=True)
    return True


# ── WhatsApp bridge helper ────────────────────────────────────────────────────

def _phone_to_jid(phone):
    """Convert a phone number to WhatsApp JID format.
    +919999999999 -> 919999999999@s.whatsapp.net
    """
    cleaned = phone.strip()
    # Remove leading + if present
    if cleaned.startswith("+"):
        cleaned = cleaned[1:]
    # Remove any non-digit characters (spaces, dashes, parens)
    cleaned = "".join(c for c in cleaned if c.isdigit())
    return f"{cleaned}@s.whatsapp.net"


def _send_whatsapp(to_jid, message_text):
    """Send a WhatsApp message via the Baileys bridge."""
    url = f"{WHATSAPP_BRIDGE_URL}/send"
    data = {"chatId": to_jid, "message": message_text}
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8") if e.fp else "{}"
        try:
            error_data = json.loads(error_body)
        except json.JSONDecodeError:
            error_data = {"message": error_body}
        msg = error_data.get("message", error_data.get("error", str(e))) if isinstance(error_data, dict) else str(error_data)
        raise RuntimeError(f"WhatsApp API error {e.code}: {msg}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"WhatsApp bridge unreachable: {e.reason}")


# ── Password generation ───────────────────────────────────────────────────────

def _generate_password(length=12):
    """Generate a random alphanumeric password."""
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


# ── DB helpers ────────────────────────────────────────────────────────────────

def _db_size_bytes():
    """Return the size of the PocketBase data.db file in bytes, or None."""
    db_path = os.path.join(PB_DATA_DIR, "data.db")
    try:
        return os.path.getsize(db_path)
    except OSError:
        return None


def _format_bytes(size):
    """Format byte count to human-readable string."""
    if size is None:
        return "N/A"
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"


# ── Subcommands ───────────────────────────────────────────────────────────────

def cmd_user_create(args):
    """Create a new user with random password and send credentials via WhatsApp."""
    token = _superuser_auth()
    password = _generate_password()

    data = {
        "email": args.email,
        "password": password,
        "passwordConfirm": password,
        "name": args.name,
    }
    if args.phone:
        data["phone"] = args.phone

    try:
        user = _create_record("users", data, token)
    except RuntimeError as e:
        print(f"  {red('✗')} Failed to create user: {e}")
        sys.exit(1)

    print(f"  {green('✓')} User created successfully!")
    print(f"    {bold('ID:')}    {user['id']}")
    print(f"    {bold('Name:')}  {user.get('name', 'N/A')}")
    print(f"    {bold('Email:')} {user.get('email', 'N/A')}")
    if args.phone:
        print(f"    {bold('Phone:')} {user.get('phone', 'N/A')}")
    print(f"    {bold('Password:')} {yellow(password)}")

    # Send WhatsApp notification if phone was provided
    if args.phone:
        try:
            jid = _phone_to_jid(args.phone)
            wa_message = (
                f"🎉 *Welcome to KaizenPM!*\n\n"
                f"Your account has been created.\n\n"
                f"📧 *Email:* {args.email}\n"
                f"🔑 *Password:* `{password}`\n\n"
                f"Please login and change your password.\n"
                f"Project Manager - KaizenPM"
            )
            result = _send_whatsapp(jid, wa_message)
            print(f"  {green('✓')} WhatsApp welcome message sent to {args.phone}")
        except RuntimeError as e:
            print(f"  {yellow('⚠')} Could not send WhatsApp: {e}")
    else:
        print(f"  {yellow('⚠')} No phone number provided — skipping WhatsApp notification")

    print()
    return user


def cmd_user_list(args):
    """List all users."""
    token = _superuser_auth()
    users = _get_records("users", token, sort="created")

    if not users:
        print(f"  {yellow('No users found.')}")
        return

    print(f"  {bold(f'Users ({len(users)})')}")
    print(f"  {gray('─' * 78)}")

    for u in users:
        role = u.get("role", "user") or "user"
        verified = u.get("verified", False)
        phone = u.get("phone", "") or ""
        wa_verified = u.get("whatsapp_verified", False)

        verified_str = green("✓") if verified else red("✗")
        wa_str = green("✓") if wa_verified else gray("–")

        print(f"  {bold(u['id'])}")
        print(f"    Name:     {u.get('name', 'N/A')}")
        print(f"    Email:    {u.get('email', 'N/A')}")
        print(f"    Phone:    {phone or gray('–')}")
        print(f"    Role:     {cyan(role)}")
        print(f"    Verified: {verified_str}   WA: {wa_str}")
        print(f"    Created:  {u.get('created', 'N/A')}")
        print()

    total = len(users)
    print(f"  {bold(f'Total: {total} user{"s" if total != 1 else ""}')}")
    print()


def cmd_user_delete(args):
    """Delete a user by ID."""
    token = _superuser_auth()
    user_id = args.id

    # Check if user exists first
    try:
        user = _get_record("users", user_id, token)
    except RuntimeError as e:
        print(f"  {red('✗')} User not found: {e}")
        sys.exit(1)

    name = user.get("name", user.get("email", user_id))
    print(f"  {yellow('⚠')} Deleting user: {bold(name)} ({user_id})")

    try:
        _delete_record("users", user_id, token)
    except RuntimeError as e:
        print(f"  {red('✗')} Failed to delete user: {e}")
        sys.exit(1)

    print(f"  {green('✓')} User deleted successfully!")
    print()


def cmd_project_list(args):
    """List all projects."""
    token = _superuser_auth()
    projects = _get_records("projects", token, sort="-id")

    if not projects:
        print(f"  {yellow('No projects found.')}")
        return

    print(f"  {bold(f'Projects ({len(projects)})')}")
    print(f"  {gray('─' * 78)}")

    for p in projects:
        status = p.get("status", "active") or "active"
        user_rel = p.get("user", "") or ""
        org_rel = p.get("organization", "") or ""
        name = p.get("name", "Unnamed")
        desc = p.get("description", "") or ""

        print(f"  {bold(p['id'])}")
        print(f"    Name:     {name}")
        if desc:
            print(f"    Desc:     {desc[:80]}{'…' if len(desc) > 80 else ''}")
        print(f"    Status:   {cyan(status)}")
        print(f"    User ID:  {user_rel or gray('–')}")
        print(f"    Org ID:   {org_rel or gray('–')}")
        print(f"    Created:  {p.get('created', 'N/A')}")
        print()

    total = len(projects)
    print(f"  {bold(f'Total: {total} project{"s" if total != 1 else ""}')}")
    print()


def cmd_db_backup(args):
    """Backup the PocketBase data.db to backups/ with timestamp."""
    db_path = os.path.join(PB_DATA_DIR, "data.db")

    if not os.path.isfile(db_path):
        print(f"  {red('✗')} Database file not found at: {db_path}")
        sys.exit(1)

    # Create backups dir
    os.makedirs(BACKUPS_DIR, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"data_{timestamp}.db"
    backup_path = os.path.join(BACKUPS_DIR, backup_name)

    try:
        shutil.copy2(db_path, backup_path)
    except OSError as e:
        print(f"  {red('✗')} Backup failed: {e}")
        sys.exit(1)

    original_size = _db_size_bytes()
    backup_size = os.path.getsize(backup_path)

    print(f"  {green('✓')} Database backup created!")
    print(f"    {bold('Source:')}  {db_path}")
    print(f"    {bold('Backup:')}  {backup_path}")
    print(f"    {bold('Size:')}    {_format_bytes(backup_size)}")

    if original_size and original_size != backup_size:
        print(f"    {yellow('⚠')} Size mismatch: source={_format_bytes(original_size)} backup={_format_bytes(backup_size)}")
    print()


def cmd_db_status(args):
    """Show database file size and record counts per collection."""
    token = _superuser_auth()

    # DB file info
    db_path = os.path.join(PB_DATA_DIR, "data.db")
    db_size = _db_size_bytes()

    print(f"  {bold('Database Status')}")
    print(f"  {gray('─' * 40)}")
    print(f"    {bold('File:')}  {db_path}")
    print(f"    {bold('Size:')}  {_format_bytes(db_size)}")
    print()

    # Collection record counts
    print(f"  {bold('Collections')}")
    print(f"  {gray('─' * 40)}")

    collections_to_check = [
        "users",
        "projects",
        "sub_projects",
        "tasks",
        "kanban_boards",
        "habits",
        "kaizen_logs",
        "time_logs",
        "organizations",
        "organization_members",
    ]

    total_records = 0
    for coll_name in collections_to_check:
        try:
            result = _api_request(
                "GET",
                f"/api/collections/{coll_name}/records",
                token=token,
                params={"perPage": 1, "page": 1},
            )
            count = result.get("totalItems", 0)
            total_records += count
            print(f"    {coll_name:22s}  {green(str(count))}")
        except RuntimeError:
            print(f"    {coll_name:22s}  {red('error')}")

    print(f"    {gray('─' * 40)}")
    print(f"    {'Total':22s}  {bold(str(total_records))}")
    print()


def cmd_help(args):
    """Show help message."""
    print(f"""
{bold('pm-cli — KaizenPM Admin CLI')}
{cyan('=' * 50)}

{green('USER MANAGEMENT')}
  {bold('pm-cli user create --name NAME --email EMAIL --phone PHONE')}
    Create a new user, generate random password, send via WhatsApp

  {bold('pm-cli user list')}
    List all users with details

  {bold('pm-cli user delete <id>')}
    Delete a user by their ID

{green('PROJECT MANAGEMENT')}
  {bold('pm-cli project list')}
    List all projects

{green('DATABASE')}
  {bold('pm-cli db backup')}
    Backup pb_data/data.db to backups/ with timestamp

  {bold('pm-cli db status')}
    Show database file size and record counts per collection

{green('GENERAL')}
  {bold('pm-cli help')}
    Show this help message

{green('ENVIRONMENT VARIABLES')}
  {bold('PM_SUPERUSER_EMAIL')}      PocketBase superuser email (default: avisolat18@gmail.com)
  {bold('PM_SUPERUSER_PASSWORD')}   PocketBase superuser password
  {bold('PM_PB_URL')}               PocketBase URL (default: http://127.0.0.1:8090)
  {bold('PM_WA_URL')}               WhatsApp bridge URL (default: http://127.0.0.1:3000)
""")


# ── Argument parsing ──────────────────────────────────────────────────────────

def build_parser():
    parser = argparse.ArgumentParser(
        prog="pm-cli",
        description="KaizenPM Admin CLI — user, project, and database management",
        add_help=False,
    )
    subparsers = parser.add_subparsers(dest="command")

    # user
    user_parser = subparsers.add_parser("user", help="User management")
    user_subparsers = user_parser.add_subparsers(dest="subcommand")

    user_create = user_subparsers.add_parser("create", help="Create a new user")
    user_create.add_argument("--name", required=True, help="User's full name")
    user_create.add_argument("--email", required=True, help="User's email address")
    user_create.add_argument("--phone", default="", help="User's phone number (with country code, e.g. +919999999999)")

    user_list = user_subparsers.add_parser("list", help="List all users")

    user_delete = user_subparsers.add_parser("delete", help="Delete a user")
    user_delete.add_argument("id", help="User ID to delete")

    # project
    project_parser = subparsers.add_parser("project", help="Project management")
    project_subparsers = project_parser.add_subparsers(dest="subcommand")
    project_list = project_subparsers.add_parser("list", help="List all projects")

    # db
    db_parser = subparsers.add_parser("db", help="Database management")
    db_subparsers = db_parser.add_subparsers(dest="subcommand")
    db_parser_backup = db_subparsers.add_parser("backup", help="Backup the database")
    db_parser_status = db_subparsers.add_parser("status", help="Show database status")

    # help
    subparsers.add_parser("help", help="Show this help message")

    return parser


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    if args.command == "help":
        cmd_help(args)
        return

    if args.command == "user":
        if not hasattr(args, "subcommand") or not args.subcommand:
            print(f"{red('Please specify a user subcommand: create, list, or delete')}")
            print(f"Run {bold('pm-cli help')} for usage.")
            sys.exit(1)

        cmds = {
            "create": cmd_user_create,
            "list": cmd_user_list,
            "delete": cmd_user_delete,
        }
        cmds[args.subcommand](args)

    elif args.command == "project":
        if not hasattr(args, "subcommand") or not args.subcommand:
            print(f"{red('Please specify a project subcommand: list')}")
            print(f"Run {bold('pm-cli help')} for usage.")
            sys.exit(1)

        cmds = {
            "list": cmd_project_list,
        }
        cmds[args.subcommand](args)

    elif args.command == "db":
        if not hasattr(args, "subcommand") or not args.subcommand:
            print(f"{red('Please specify a db subcommand: backup or status')}")
            print(f"Run {bold('pm-cli help')} for usage.")
            sys.exit(1)

        cmds = {
            "backup": cmd_db_backup,
            "status": cmd_db_status,
        }
        cmds[args.subcommand](args)


if __name__ == "__main__":
    main()
