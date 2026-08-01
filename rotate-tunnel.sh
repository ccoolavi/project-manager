#!/bin/bash
set -e
PROJECT_DIR="/home/ubuntu/projects/project_manager"
cd "$PROJECT_DIR"

echo "[$(date)] Starting ephemeral tunnel rotation..."

# 1. Kill existing quick tunnels
pkill -f "cloudflared tunnel" || true
sleep 2

# 2. Start new quick tunnel in background
nohup cloudflared tunnel --url http://localhost:8090 > /tmp/tunnel.log 2>&1 &

# 3. Wait for tunnel to initialize and grab URL
for i in {1..10}; do
    TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/tunnel.log | tail -1)
    if [ -n "$TUNNEL_URL" ]; then
        break
    fi
    sleep 2
done

if [ -z "$TUNNEL_URL" ]; then
    echo "[$(date)] ERROR: Failed to obtain Cloudflare tunnel URL"
    exit 1
fi

echo "[$(date)] New Tunnel URL: $TUNNEL_URL"

# 4. Update workflow yml with new URL
sed -i 's|VITE_PB_URL: https://.*\.trycloudflare\.com|VITE_PB_URL: '"$TUNNEL_URL"'|g' .github/workflows/deploy.yml

# 5. Rebuild frontend with new URL
cd frontend
export VITE_PB_URL="$TUNNEL_URL"
npm run build

# 6. Sync dist artifacts to repo root for GitHub Pages
cd "$PROJECT_DIR"
cp frontend/dist/index.html index.html
rm -rf assets && cp -r frontend/dist/assets assets

# 7. Commit and push changes
git add -A
git commit -m "chore(tunnel): auto-rotate ephemeral tunnel to $TUNNEL_URL and sync client build" || echo "No changes to commit"
git push origin main

echo "[$(date)] Tunnel rotation and client sync completed successfully."
