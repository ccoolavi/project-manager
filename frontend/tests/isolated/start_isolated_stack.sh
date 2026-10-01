#!/bin/bash
# Starts an ISOLATED KaizenPM stack for browser tests: two API instances on a THROWAWAY sqlite file (ports 18090/18091),
# a production build of the web app pointed at it, and a static server on 15173. Nothing here touches the live service,
# database or public site. Stop it with:  ./start_isolated_stack.sh stop
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"          # .../project_manager
WORK="${PM_TEST_DIR:-/tmp/kaizenpm-isolated}"
mkdir -p "$WORK"
if [ "${1:-}" = "stop" ]; then
  for f in "$WORK"/*.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null || true; done; echo stopped; exit 0
fi
rm -f "$WORK/test.db"
for PORT in 18090 18091; do
  ( cd "$ROOT/backend" && env DATABASE_URL="sqlite:///$WORK/test.db" SECRET_KEY=local-test-secret-not-prod ENVIRONMENT=development \
      SMTP_SERVER= SMTP_USER= SMTP_PASSWORD= WHATSAPP_BRIDGE_URL= ALLOWED_ORIGINS=http://127.0.0.1:15173 \
      nohup ./venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port $PORT --workers 1 > "$WORK/api-$PORT.log" 2>&1 &
    echo $! > "$WORK/api-$PORT.pid" )
done
( cd "$ROOT/frontend" && VITE_API_URL=http://127.0.0.1:18090 npx vite build --outDir "$WORK/dist" --emptyOutDir >/dev/null )
rm -rf "$WORK/site"; mkdir -p "$WORK/site/project-manager"; cp -r "$WORK/dist/." "$WORK/site/project-manager/"
printf '{"apiUrl":"http://127.0.0.1:18090","note":"LOCAL TEST ONLY"}\n' > "$WORK/site/project-manager/config.json"
( cd "$WORK/site" && nohup python3 -m http.server 15173 --bind 127.0.0.1 > "$WORK/web.log" 2>&1 & echo $! > "$WORK/web.pid" )
sleep 6
echo "ready: site http://127.0.0.1:15173/project-manager/  api http://127.0.0.1:18090  db $WORK/test.db"
echo "run:   PM_SITE=$WORK/site/project-manager PM_DB=$WORK/test.db node pm_t1_addtask.mjs   (needs: npm i playwright-core, and a Chromium: set CHROMIUM or use ~/.cache/ms-playwright)"
