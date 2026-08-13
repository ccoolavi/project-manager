# pm-cli — administrative CLI

`pm-cli.py` drives KaizenPM from the command line. It uses only the Python
standard library, so there is nothing to install. It is written for two audiences:
an operator running one-off commands, and an agent driving the system unattended.

## Machine-readable by default

Every command accepts `--json`, in either position:

```bash
./pm-cli.py --json health
./pm-cli.py health --json
```

With `--json`, **stdout carries only JSON** and all human commentary goes to
stderr, so output can be piped without sanitising:

```json
{ "ok": true, "data": { "status": "ok", "environment": "production" } }
```

Failures use the same envelope with `"ok": false` and an `error` string, and exit
non-zero. An agent can branch on `.ok` without parsing prose.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PM_API_URL` | `http://127.0.0.1:8090` | API base URL |
| `PM_TOKEN` | — | Use this token instead of the cached one |

`login` caches a token at `~/.kaizenpm-cli-token` with mode `600`.

## Signing in

```bash
./pm-cli.py login --email you@example.com --password 'secret'
./pm-cli.py whoami        # user, organisation, role, permissions
```

**Note on organisation scope:** the token carries the organisation you belong to.
After creating your *first* organisation, log in again so the new token carries
the `org_id`, `role` and `permissions` claims:

```bash
ORG=$(./pm-cli.py org create --name "Acme" --json | jq -r .data.id)
./pm-cli.py login --email you@example.com --password 'secret'   # re-scope
```

## Provisioning accounts

The administrator creates the account and hands over a generated password; the
person then signs in and completes their own profile.

```bash
./pm-cli.py user create --name "Priya Sharma" --email priya@example.com --json
```

```json
{ "ok": true, "data": {
    "email": "priya@example.com", "name": "Priya Sharma", "password": "QsEqR7nWk2xTvB4m" } }
```

Add them to an organisation in the same step:

```bash
./pm-cli.py user create --name "Priya Sharma" --email priya@example.com \
    --org 3 --role editor --json
```

Roles are `admin`, `editor`, `member`, `viewer`. `owner` is held by whoever
created the organisation.

## Everyday operations

```bash
# Organisations
./pm-cli.py org list
./pm-cli.py org create --name "Acme"
./pm-cli.py org members --org 3
./pm-cli.py org invite  --org 3 --email new@example.com --role member

# Projects — a project is created with an initial section, because a project
# with no section has nowhere to put tasks
./pm-cli.py project list   --org 3
./pm-cli.py project create --org 3 --name "Website" --section "Phase 1"
./pm-cli.py section list   --org 3 --project 7

# Tasks
./pm-cli.py task list   --org 3 --project 7 --section 9
./pm-cli.py task create --org 3 --project 7 --section 9 --title "Design homepage" --priority high
./pm-cli.py task move   --org 3 --project 7 --section 9 --task 12 --status in_progress

# Personal tracking
./pm-cli.py habit list  --org 3
./pm-cli.py habit check --org 3 --habit 4
./pm-cli.py time log    --org 3 --minutes 45 --category development
./pm-cli.py kaizen log  --org 3 --title "Batch email" \
    --problem "Constant context switching" --solution "Two fixed windows a day"
```

## Database

The database is a single SQLite file, chosen so it can be moved to another host
later without a migration exercise.

```bash
./pm-cli.py db status                                   # path, size, row counts
./pm-cli.py db backup                                   # timestamped copy in backups/
./pm-cli.py db restore --backup backups/kaizenpm_20260813_181440.db
```

`db restore` preserves the current database as `kaizenpm.db.before-restore`
before overwriting. Restart the API afterwards:

```bash
sudo systemctl restart kaizenpm-api
```

## A complete scripted workflow

Set up an organisation with a project, a task and a teammate, unattended:

```bash
#!/bin/bash
set -euo pipefail
J() { python3 -c "import sys,json;print(json.load(sys.stdin)['data']$1)"; }

PW=$(./pm-cli.py user create --name "Ops" --email ops@example.com --json | J "['password']")
./pm-cli.py login --email ops@example.com --password "$PW" --json >/dev/null

ORG=$(./pm-cli.py org create --name "Acme" --json | J "['id']")
./pm-cli.py login --email ops@example.com --password "$PW" --json >/dev/null  # re-scope

OUT=$(./pm-cli.py project create --org "$ORG" --name "Website" --json)
PROJ=$(echo "$OUT" | J "['project']['id']")
SEC=$(echo  "$OUT" | J "['section']['id']")

./pm-cli.py task create --org "$ORG" --project "$PROJ" --section "$SEC" \
    --title "Design homepage" --priority high --json >/dev/null

./pm-cli.py user create --name "Dev" --email dev@example.com \
    --org "$ORG" --role editor --json >/dev/null

./pm-cli.py task list --org "$ORG" --project "$PROJ" --section "$SEC"
```

## Exit codes

`0` on success, `1` on any error — an unreachable API, a rejected request, or a
missing cached token. In `--json` mode the reason is in `.error`.
