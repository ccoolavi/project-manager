#!/bin/bash
# Build the client and publish it to the gh-pages branch.
#
# Why not `git subtree push --prefix frontend/dist`: `dist` is git-ignored, so the
# subtree only ever carried the one stale tracked index.html and the deployed site
# was a blank page referencing JS that had never been committed. This script
# publishes the build directory directly, so what is served is exactly what was built.
set -euo pipefail

PROJECT_DIR="/home/ubuntu/projects/project_manager"
REMOTE="git@github.com:ccoolavi/project-manager.git"
BRANCH="gh-pages"
PAGES_URL="https://ccoolavi.github.io/project-manager"

cd "$PROJECT_DIR/frontend"

echo "==> Building client"
npm run build

if [ ! -d dist/assets ] || [ -z "$(ls -A dist/assets 2>/dev/null)" ]; then
  echo "ERROR: dist/assets is empty — refusing to deploy a blank site." >&2
  exit 1
fi

# Jekyll would otherwise strip files/directories beginning with an underscore.
touch dist/.nojekyll

echo "==> Publishing $(ls dist/assets | wc -l) asset(s) to $BRANCH"
cd dist
rm -rf .git
git init -q
git checkout -qb "$BRANCH"
git add -A
git -c user.email=deploy@kaizenpm -c user.name=deploy commit -qm "deploy: client build $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push -qf "$REMOTE" "$BRANCH:$BRANCH"
rm -rf .git

echo "==> Pushed. Verifying published assets (GitHub Pages needs ~30-60s)"
MAIN_JS=$(cd "$PROJECT_DIR/frontend/dist" && ls assets/index-*.js | head -1)
for i in $(seq 1 20); do
  sleep 15
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$PAGES_URL/$MAIN_JS" || echo 000)
  echo "    attempt $i: $PAGES_URL/$MAIN_JS -> $CODE"
  if [ "$CODE" = "200" ]; then
    echo "==> LIVE: $PAGES_URL/"
    exit 0
  fi
done

echo "ERROR: assets did not become reachable in time." >&2
exit 1
