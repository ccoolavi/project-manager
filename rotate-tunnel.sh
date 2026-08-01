#!/bin/bash
# rotate-tunnel.sh — Zero-downtime ephemeral Cloudflare Quick Tunnel rotation.
# Strategy: start NEW tunnel first, verify it serves the API, rebuild client,
# push to GitHub Pages, WAIT for Pages to serve the new bundle, THEN kill old tunnel.
set -euo pipefail

PROJECT_DIR="/home/ubuntu/projects/project_manager"
STATE_FILE="$HOME/.hermes/scripts/tunnel_state"
LOG_FILE="$HOME/.hermes/scripts/tunnel-rotate.log"
GH_BASE="https://ccoolavi.github.io/project-manager"
export PATH="$PATH:/usr/local/bin:/home/ubuntu/.local/bin"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

cd "$PROJECT_DIR"

# ── 1. Read previous tunnel state (may be empty on first run) ──────────
OLD_URL=""
OLD_PID=""
if [ -f "$STATE_FILE" ]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE"
fi
log "Previous tunnel: ${OLD_URL:-none} (pid ${OLD_PID:-none})"

# ── 2. Start NEW quick tunnel while old one stays alive ────────────────
log "Starting new quick tunnel..."
nohup cloudflared tunnel --url http://localhost:8090 > /tmp/tunnel-new.log 2>&1 &
NEW_PID=$!
log "New cloudflared pid: $NEW_PID"

# ── 3. Wait for the new URL to appear in logs ──────────────────────────
NEW_URL=""
for i in $(seq 1 20); do
  NEW_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/tunnel-new.log | tail -1 || true)
  [ -n "$NEW_URL" ] && break
  sleep 2
done

if [ -z "$NEW_URL" ]; then
  log "ERROR: failed to obtain new tunnel URL"
  kill "$NEW_PID" 2>/dev/null || true
  exit 1
fi
log "New tunnel URL: $NEW_URL"

# ── 4. Verify the new tunnel actually serves PocketBase ────────────────
# Quick tunnels can take up to ~60s to become reachable on Cloudflare's
# edge (DNS propagation), so poll patiently before giving up.
HEALTHY=0
for i in $(seq 1 45); do
  if curl -fsS -m 8 "$NEW_URL/api/health" 2>/dev/null | grep -q "API is healthy"; then
    HEALTHY=1
    break
  fi
  if [ $((i % 5)) -eq 0 ]; then
    log "  ...waiting for tunnel to become reachable (${i}s)"
  fi
  sleep 2
done

if [ "$HEALTHY" -ne 1 ]; then
  log "ERROR: new tunnel not serving API, aborting rotation"
  kill "$NEW_PID" 2>/dev/null || true
  exit 1
fi
log "New tunnel verified healthy (serves /api/health)"

# ── 5. Rebuild frontend with new URL baked in ──────────────────────────
log "Rebuilding frontend with VITE_PB_URL=$NEW_URL..."
sed -i "s|VITE_PB_URL: https://[^ ]*trycloudflare.com|VITE_PB_URL: $NEW_URL|g" .github/workflows/deploy.yml
(
  cd frontend
  export VITE_PB_URL="$NEW_URL"
  npm run build >> "$LOG_FILE" 2>&1
)
log "Frontend build complete"

# ── 6. Sync dist to GitHub Pages root ──────────────────────────────────
cp frontend/dist/index.html index.html
rm -rf assets
cp -r frontend/dist/assets assets
log "Assets synced to repo root"

# ── 7. Commit & push ───────────────────────────────────────────────────
git add -A
git commit -m "chore(tunnel): rotate ephemeral tunnel to $NEW_URL, fresh build" >/dev/null 2>&1 || log "Nothing new to commit"
git push origin main >> "$LOG_FILE" 2>&1
log "Pushed to origin/main"

# ── 8. Wait for GitHub Pages to serve the NEW bundle (≤3 min) ─────────
NEW_JS=$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' frontend/dist/index.html | head -1)
log "Waiting for Pages to serve $NEW_JS..."
DEPLOYED=0
for i in $(seq 1 18); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "$GH_BASE/$NEW_JS" || echo 000)
  if [ "$CODE" = "200" ]; then
    DEPLOYED=1
    break
  fi
  sleep 10
done

if [ "$DEPLOYED" -ne 1 ]; then
  log "WARNING: Pages hasn't served new bundle yet; keeping old tunnel alive as fallback"
else
  log "Pages serving new bundle $NEW_JS"
fi

# ── 9. Kill OLD tunnel only now (zero downtime achieved) ───────────────
if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
  kill "$OLD_PID" 2>/dev/null || true
  log "Killed old tunnel (pid $OLD_PID)"
fi

# ── 10. Persist new state ──────────────────────────────────────────────
cat > "$STATE_FILE" <<EOF
OLD_URL="$NEW_URL"
OLD_PID="$NEW_PID"
EOF
log "Rotation complete. Active: $NEW_URL"
echo "TUNNEL_URL=$NEW_URL"
