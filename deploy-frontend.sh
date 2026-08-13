#!/bin/bash
# Build the client and publish it to GitHub Pages.
#
# GitHub Pages for this repo is configured as "deploy from a branch: main /".
# That means the served site is the *repository root*, not the gh-pages branch and
# not the Actions artifact. Earlier deploys pushed to gh-pages, which nothing
# serves, so the live site stayed frozen on a months-old build while every deploy
# reported success. This script writes the build to the root and then verifies the
# public URL actually serves the new bundle before claiming success.
set -euo pipefail

PROJECT_DIR="/home/ubuntu/projects/project_manager"
PAGES_URL="https://ccoolavi.github.io/project-manager"

cd "$PROJECT_DIR/frontend"

echo "==> Building client"
npm run build

if [ ! -d dist/assets ] || [ -z "$(ls -A dist/assets 2>/dev/null)" ]; then
  echo "ERROR: dist/assets is empty — refusing to deploy a blank site." >&2
  exit 1
fi
if grep -rq "localhost:8000" dist/assets/*.js; then
  echo "ERROR: build baked in a localhost API URL — refusing to deploy." >&2
  exit 1
fi

MAIN_JS=$(cd dist && ls assets/index-*.js | head -1)

echo "==> Copying build to repository root (the path Pages actually serves)"
cd "$PROJECT_DIR"
rm -rf assets icons
cp -r frontend/dist/. .
touch .nojekyll

git add -A
if git diff --cached --quiet; then
  echo "    no changes to publish"
else
  git commit -qm "deploy: client build $(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi
git push -q origin main

echo "==> Pushed. Waiting for Pages to serve $MAIN_JS"
for i in $(seq 1 30); do
  sleep 15
  SERVED=$(curl -s -m 15 "$PAGES_URL/?cb=$RANDOM" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1 || true)
  echo "    attempt $i: served=$SERVED"
  if [ "$SERVED" = "$MAIN_JS" ]; then
    CODE=$(curl -s -o /dev/null -w "%{http_code}" "$PAGES_URL/$MAIN_JS")
    if [ "$CODE" = "200" ]; then
      echo "==> LIVE and verified: $PAGES_URL/"
      exit 0
    fi
  fi
done

echo "ERROR: Pages did not serve the new bundle in time." >&2
exit 1
