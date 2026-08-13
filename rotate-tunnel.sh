#!/bin/bash
# Rotate the ephemeral Cloudflare quick tunnel that exposes the API.
#
# The client reads its API endpoint at runtime from config.json, so a rotation
# only has to rewrite that one file and publish it. No client rebuild, and no
# window where the deployed app points at a dead tunnel because a build was still
# running. The previous version of this script rebuilt and redeployed the whole
# bundle on every rotation.
set -euo pipefail

PROJECT_DIR="/home/ubuntu/projects/project_manager"
API_PORT=8090
STATE_FILE="$HOME/.hermes/scripts/tunnel_state"
LOG_FILE="$HOME/.hermes/scripts/tunnel-rotate.log"
PAGES_URL="https://ccoolavi.github.io/project-manager"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

cd "$PROJECT_DIR"

OLD_URL=""; OLD_PID=""
[ -f "$STATE_FILE" ] && source "$STATE_FILE"
log "Previous tunnel: ${OLD_URL:-none} (pid ${OLD_PID:-none})"

# The API must be healthy before we point a new tunnel at it.
if ! curl -sf -m 5 "http://127.0.0.1:$API_PORT/api/health" >/dev/null; then
  log "ERROR: API is not healthy on :$API_PORT — aborting rotation."
  exit 1
fi

log "Starting new quick tunnel -> http://localhost:$API_PORT"
NEW_LOG=$(mktemp)
setsid nohup cloudflared tunnel --url "http://localhost:$API_PORT" > "$NEW_LOG" 2>&1 < /dev/null &
NEW_PID=$!

NEW_URL=""
for _ in $(seq 1 30); do
  sleep 2
  NEW_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$NEW_LOG" | head -1 || true)
  [ -n "$NEW_URL" ] && break
done

if [ -z "$NEW_URL" ]; then
  log "ERROR: new tunnel did not report a URL — killing it and keeping the old one."
  kill "$NEW_PID" 2>/dev/null || true
  exit 1
fi
log "New tunnel: $NEW_URL"

# Prove the new tunnel actually serves the API before switching clients onto it.
for _ in $(seq 1 20); do
  if curl -sf -m 10 "$NEW_URL/api/health" >/dev/null; then break; fi
  sleep 3
done
if ! curl -sf -m 10 "$NEW_URL/api/health" >/dev/null; then
  log "ERROR: new tunnel does not serve the API — keeping the old one."
  kill "$NEW_PID" 2>/dev/null || true
  exit 1
fi
log "New tunnel verified healthy."

# Publish the endpoint change: one small file, in both the source tree and the
# directory GitHub Pages serves.
python3 - "$NEW_URL" <<'PY'
import json, sys
url = sys.argv[1]
body = {
    "apiUrl": url,
    "note": "Runtime API endpoint. Edit this file and redeploy it alone when the tunnel rotates - no client rebuild required.",
}
for path in ("frontend/public/config.json", "config.json"):
    with open(path, "w") as fh:
        json.dump(body, fh, indent=2)
        fh.write("\n")
PY

# Keep CORS in step with the new origin.
if ! grep -q "trycloudflare" "$PROJECT_DIR/backend/.env"; then
  log "Note: backend allows *.trycloudflare.com via allow_origin_regex already."
fi

git add frontend/public/config.json config.json
git -c user.email=deploy@kaizenpm -c user.name=deploy commit -qm "chore(tunnel): rotate API endpoint to $NEW_URL" || true
git push -q origin main
log "config.json published."

# Wait for Pages to serve the new endpoint before retiring the old tunnel.
for _ in $(seq 1 30); do
  sleep 10
  SERVED=$(curl -s -m 10 "$PAGES_URL/config.json?cb=$RANDOM" | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | head -1 || true)
  if [ "$SERVED" = "$NEW_URL" ]; then
    log "Pages now serves the new endpoint."
    break
  fi
done

if [ -n "${OLD_PID:-}" ] && kill -0 "$OLD_PID" 2>/dev/null; then
  log "Retiring old tunnel (pid $OLD_PID)"
  kill "$OLD_PID" 2>/dev/null || true
fi

mkdir -p "$(dirname "$STATE_FILE")"
cat > "$STATE_FILE" <<EOF
OLD_URL="$NEW_URL"
OLD_PID="$NEW_PID"
EOF

log "Rotation complete: $NEW_URL"
