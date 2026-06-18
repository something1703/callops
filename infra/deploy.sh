#!/usr/bin/env bash
# deploy.sh — CallOps VPS deploy script
#
# Prerequisites:
#   - SSH key auth configured for $VPS_USER@$VPS_HOST
#   - Docker + Docker Compose v2 installed on the VPS
#   - /opt/callops directory exists on the VPS
#   - .env.production exists on the VPS at /opt/callops/infra/.env.production
#
# Usage:
#   VPS_HOST=123.456.789.0 VPS_USER=ubuntu bash deploy.sh
#
# Or set in a .deploy.env file (gitignored):
#   source .deploy.env && bash deploy.sh

set -euo pipefail

VPS_HOST="${VPS_HOST:?VPS_HOST is required}"
VPS_USER="${VPS_USER:-ubuntu}"
REMOTE_DIR="${REMOTE_DIR:-/opt/callops}"

echo "═══════════════════════════════════════════════════════════"
echo "  CallOps Deploy → $VPS_USER@$VPS_HOST:$REMOTE_DIR"
echo "═══════════════════════════════════════════════════════════"

# 1. Sync project files to VPS (excluding secrets and generated files)
echo ""
echo "▶ Syncing files…"
rsync -az --delete \
  --exclude '.env' \
  --exclude '.env.production' \
  --exclude 'node_modules/' \
  --exclude '.next/' \
  --exclude 'dist/' \
  --exclude '.gradle/' \
  --exclude 'build/' \
  --exclude 'venv/' \
  --exclude '__pycache__/' \
  --exclude '.DS_Store' \
  "$(dirname "$0")/../" \
  "$VPS_USER@$VPS_HOST:$REMOTE_DIR/"

echo "✅ Files synced"

# 2. SSH in and bring services up
echo ""
echo "▶ Deploying on VPS…"
ssh "$VPS_USER@$VPS_HOST" bash -s << EOF
  set -euo pipefail
  cd "$REMOTE_DIR/infra"

  echo "  Pulling latest images…"
  docker compose --env-file .env.production pull metabase caddy

  echo "  Building app images…"
  docker compose --env-file .env.production build --no-cache backend admin-web

  echo "  Starting services…"
  docker compose --env-file .env.production up -d

  echo "  Health check (waiting 15s)…"
  sleep 15
  docker compose --env-file .env.production ps
  curl -sf http://localhost:4000/health && echo "  ✅ Backend healthy" || echo "  ❌ Backend health check failed"
EOF

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✅ Deploy complete"
echo "  Admin web: https://callops.yourdomain.com"
echo "  API:       https://api.callops.yourdomain.com"
echo "  Metabase:  https://metabase.callops.yourdomain.com"
echo "═══════════════════════════════════════════════════════════"
