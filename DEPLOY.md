# Project Manager Deployment Guide

This document outlines the deployment procedure for the Project Manager application, divided into local public server setup with Caddy reverse proxy and GitHub Pages frontend deployment via GitHub Actions.

---

## A) Local Server Deployment

### Overview
The backend PocketBase service (`:8090`) and static frontend are served behind **Caddy**, a lightweight, high-performance reverse proxy with automatic TLS certificate handling (available as an ARM64/x86_64 single binary).

### 1. Prerequisites & Caddy Installation
Download and install the Caddy ARM64 / Linux binary:

```bash
# Download ARM64 binary (or substitute for x86_64 if running on AMD64)
curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=arm64" -o caddy
chmod +x caddy
sudo mv caddy /usr/local/bin/
```

### 2. Caddy Configuration (`Caddyfile`)
Place the following `Caddyfile` in your project root (`/home/ubuntu/projects/project_manager/Caddyfile`):

```caddyfile
{
    http_port 80
    https_port 443
}

{$DOMAIN:your-api-domain.com} {
    # TLS is managed automatically by Caddy

    # Preflight CORS Handling for GitHub Pages Origin
    @cors_preflight method OPTIONS
    handle @cors_preflight {
        header Access-Control-Allow-Origin "{$ALLOWED_ORIGIN:https://username.github.io}"
        header Access-Control-Allow-Credentials "true"
        header Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        header Access-Control-Allow-Headers "Authorization, Content-Type, Accept, X-Requested-With, PocketBase-Token"
        header Access-Control-Max-Age "86400"
        respond 204
    }

    # Global CORS Headers
    header {
        Access-Control-Allow-Origin "{$ALLOWED_ORIGIN:https://username.github.io}"
        Access-Control-Allow-Credentials "true"
        Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        Access-Control-Allow-Headers "Authorization, Content-Type, Accept, X-Requested-With, PocketBase-Token"
    }

    # Route PocketBase API requests
    handle /api/* {
        reverse_proxy 127.0.0.1:8090 {
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
        }
    }

    # Static SPA Frontend Serving
    handle {
        root * ./frontend/dist
        try_files {path} /index.html
        file_server
    }
}
```

### 3. Launching Services
Run PocketBase on port 8090 and start Caddy reverse proxy:

```bash
# Start PocketBase bound to localhost:8090
./pocketbase serve --http="127.0.0.1:8090" &

# Start Caddy
caddy run --config Caddyfile
```

---

## B) GitHub Pages Deployment

### Overview
The static React SPA frontend is built and deployed automatically to GitHub Pages using GitHub Actions.

### 1. Workflow Configuration File
The deployment workflow is located at:
`/.github/workflows/deploy-frontend.yml`

```yaml
name: Deploy Frontend to GitHub Pages

on:
  push:
    branches:
      - main
      - master
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: true

jobs:
  build-and-deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: frontend/package-lock.json

      - name: Install Dependencies
        run: |
          cd frontend
          npm ci

      - name: Build SPA Frontend
        env:
          VITE_PB_URL: ${{ secrets.VITE_PB_URL }}
        run: |
          cd frontend
          npm run build

      - name: Setup GitHub Pages
        uses: actions/configure-pages@v5

      - name: Upload Artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: 'frontend/dist'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### 2. Environment Variables & Repository Setup
1. In your GitHub repository, navigate to **Settings > Secrets and variables > Actions**.
2. Add a Repository Secret `VITE_PB_URL` set to your public server address (e.g. `https://your-api-domain.com`).
3. Enable GitHub Pages under **Settings > Pages** with source set to **GitHub Actions**.
