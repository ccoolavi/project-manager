#!/bin/bash
# tunnel-watchdog.sh — Checks the active tunnel health every few minutes.
# If the current quick tunnel died unexpectedly, rotate immediately
# (creates fresh tunnel, rebuilds, redeploys) instead of waiting for the
# scheduled rotation. Prevents prolonged downtime.
set -euo pipefail

STATE_FILE="$HOME/.hermes/scripts/tunnel_state"
LOG_FILE="$HOME/.hermes/scripts/tunnel-watchdog.log"
export PATH="$PATH:/usr/local/bin:/home/ubuntu/.local/bin"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

if [ ! -f "$STATE_FILE" ]; then
  log "No tunnel state yet — nothing to watch."
  exit 0
fi

# shellcheck disable=SC1090
source "$STATE_FILE"

if [ -z "${OLD_URL:-}" ]; then
  log "No active tunnel URL recorded — nothing to watch."
  exit 0
fi

# Health check against the live tunnel
if curl -fsS -m 8 "$OLD_URL/api/health" 2>/dev/null | grep -q "API is healthy"; then
  log "Tunnel healthy: $OLD_URL"
  exit 0
fi

log "WARNING: tunnel $OLD_URL not responding — triggering rotation"
"$HOME/projects/project_manager/rotate-tunnel.sh" >> "$LOG_FILE" 2>&1 || log "Rotation failed"
