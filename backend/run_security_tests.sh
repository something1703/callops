#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# run_security_tests.sh
#
# Access-control smoke tests for the CallOps Phase 2 endpoints.
# Each test calls an endpoint and asserts the expected HTTP status.
# AGENT.md requires at least one access-control test per writing endpoint
# before the phase is declared done.
#
# Usage:
#   ./run_security_tests.sh [API_BASE_URL]
#
# Defaults:
#   API_BASE_URL=http://localhost:4000
# ─────────────────────────────────────────────────────────────────────────────

set -uo pipefail

API="${1:-http://localhost:4000}"
PASS=0
FAIL=0

# Load SERVICE_TO_SERVICE_SECRET from backend/.env
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
SERVICE_SECRET=""
if [[ -f "$ENV_FILE" ]]; then
  # Read the specific key safely — avoid xargs issues with special chars
  SERVICE_SECRET=$(grep '^SERVICE_TO_SERVICE_SECRET=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r')
fi

# ── Helpers ──────────────────────────────────────────────────────────────────

assert_status() {
  local label="$1"
  local expected="$2"
  local actual="$3"

  if [[ "$actual" == "$expected" ]]; then
    echo "  ✅  PASS  [$label] → HTTP $actual (expected $expected)"
    ((PASS++))
  else
    echo "  ❌  FAIL  [$label] → HTTP $actual (expected $expected)"
    ((FAIL++))
  fi
}

http_status() {
  # Returns just the HTTP status code from a curl call
  curl -s -o /dev/null -w "%{http_code}" "$@"
}

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  CallOps Phase 2 — Security / Access-Control Tests"
echo "  API: $API"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 1. /internal/ingest — must require SERVICE_TO_SERVICE_SECRET header
# ─────────────────────────────────────────────────────────────────────────────
echo "── /internal/ingest ────────────────────────────────────────────"

# 1a. No secret → 401
STATUS=$(http_status -X POST "$API/internal/ingest" \
  -H "Content-Type: application/json" \
  -d '{"batch_id":"00000000-0000-0000-0000-000000000000","rows":[],"is_final":false}')
assert_status "ingest: missing secret → 401" "401" "$STATUS"

# 1b. Wrong secret → 401
STATUS=$(http_status -X POST "$API/internal/ingest" \
  -H "Content-Type: application/json" \
  -H "x-service-secret: WRONG_SECRET_VALUE" \
  -d '{"batch_id":"00000000-0000-0000-0000-000000000000","rows":[],"is_final":false}')
assert_status "ingest: wrong secret → 401" "401" "$STATUS"

# 1c. Correct secret but invalid batch_id → 404 (auth passed, row lookup fails)
if [[ -n "$SERVICE_SECRET" ]]; then
  STATUS=$(http_status -X POST "$API/internal/ingest" \
    -H "Content-Type: application/json" \
    -H "x-service-secret: $SERVICE_SECRET" \
    -d '{"batch_id":"00000000-0000-0000-0000-000000000001","rows":[{"full_name":"Test","phone_number":"+919999999999"}],"is_final":true}')
  assert_status "ingest: valid secret + bad batch → 404 (auth passed)" "404" "$STATUS"
else
  echo "  ⚠️   SKIP  [ingest: valid secret test] — SERVICE_TO_SERVICE_SECRET not loaded"
fi

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 2. /internal/ingest/fail — must require SERVICE_TO_SERVICE_SECRET header
# ─────────────────────────────────────────────────────────────────────────────
echo "── /internal/ingest/fail ───────────────────────────────────────"

STATUS=$(http_status -X PATCH "$API/internal/ingest/fail" \
  -H "Content-Type: application/json" \
  -d '{"batch_id":"00000000-0000-0000-0000-000000000000","reason":"test"}')
assert_status "ingest/fail: missing secret → 401" "401" "$STATUS"

STATUS=$(http_status -X PATCH "$API/internal/ingest/fail" \
  -H "Content-Type: application/json" \
  -H "x-service-secret: WRONG" \
  -d '{"batch_id":"00000000-0000-0000-0000-000000000000","reason":"test"}')
assert_status "ingest/fail: wrong secret → 401" "401" "$STATUS"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 3. /api/assignments/mine — must require a valid JWT
# ─────────────────────────────────────────────────────────────────────────────
echo "── /api/assignments/mine ───────────────────────────────────────"

STATUS=$(http_status "$API/api/assignments/mine")
assert_status "mine: no token → 401" "401" "$STATUS"

STATUS=$(http_status "$API/api/assignments/mine" \
  -H "Authorization: Bearer not.a.real.jwt")
assert_status "mine: invalid JWT → 401" "401" "$STATUS"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 4. /api/contacts — admin-only, must reject unauthenticated + non-admin
# ─────────────────────────────────────────────────────────────────────────────
echo "── /api/contacts ───────────────────────────────────────────────"

STATUS=$(http_status "$API/api/contacts")
assert_status "contacts: no token → 401" "401" "$STATUS"

STATUS=$(http_status "$API/api/contacts" \
  -H "Authorization: Bearer garbage")
assert_status "contacts: invalid JWT → 401" "401" "$STATUS"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 5. /api/uploads/presign — requires admin/team_lead role
# ─────────────────────────────────────────────────────────────────────────────
echo "── /api/uploads/presign ────────────────────────────────────────"

STATUS=$(http_status -X POST "$API/api/uploads/presign" \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.csv"}')
assert_status "presign: no token → 401" "401" "$STATUS"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 6. /api/datasets — admin/team_lead only
# ─────────────────────────────────────────────────────────────────────────────
echo "── /api/datasets ───────────────────────────────────────────────"

STATUS=$(http_status "$API/api/datasets")
assert_status "datasets: no token → 401" "401" "$STATUS"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 7. /api/assignments (POST) — admin/team_lead only
# ─────────────────────────────────────────────────────────────────────────────
echo "── /api/assignments (POST) ─────────────────────────────────────"

STATUS=$(http_status -X POST "$API/api/assignments" \
  -H "Content-Type: application/json" \
  -d '{"dataset_id":"00000000-0000-0000-0000-000000000000","agent_ids":[],"distribution":"even"}')
assert_status "assignments POST: no token → 401" "401" "$STATUS"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 8. /api/calls/events (POST) — requires JWT
# ─────────────────────────────────────────────────────────────────────────────
echo "── /api/calls/events ───────────────────────────────────────────"

STATUS=$(http_status -X POST "$API/api/calls/events" \
  -H "Content-Type: application/json" \
  -d '{"call_id":"00000000-0000-0000-0000-000000000000","contact_id":"00000000-0000-0000-0000-000000000001","events":[]}')
assert_status "calls/events: no token → 401" "401" "$STATUS"

STATUS=$(http_status -X POST "$API/api/calls/events" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid.token" \
  -d '{"call_id":"00000000-0000-0000-0000-000000000000","contact_id":"00000000-0000-0000-0000-000000000001","events":[]}')
assert_status "calls/events: bad JWT → 401" "401" "$STATUS"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 9. /api/calls/live (GET) — requires admin/team_lead JWT
# ─────────────────────────────────────────────────────────────────────────────
echo "── /api/calls/live ─────────────────────────────────────────────"

STATUS=$(http_status "$API/api/calls/live")
assert_status "calls/live: no token → 401" "401" "$STATUS"

STATUS=$(http_status "$API/api/calls/live" \
  -H "Authorization: Bearer invalid.token")
assert_status "calls/live: bad JWT → 401" "401" "$STATUS"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 10. /api/analytics/summary — admin/team_lead only
# ─────────────────────────────────────────────────────────────────────────────
echo "── /api/analytics/summary ──────────────────────────────────────"

STATUS=$(http_status "$API/api/analytics/summary")
assert_status "analytics/summary: no token → 401" "401" "$STATUS"

STATUS=$(http_status "$API/api/analytics/summary" \
  -H "Authorization: Bearer bad.jwt.token")
assert_status "analytics/summary: bad JWT → 401" "401" "$STATUS"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 11. /api/analytics/recording/:id/presign — admin/team_lead only
# ─────────────────────────────────────────────────────────────────────────────
echo "── /api/analytics/recording/presign ────────────────────────────"

STATUS=$(http_status "$API/api/analytics/recording/00000000-0000-0000-0000-000000000000/presign")
assert_status "recording/presign: no token → 401" "401" "$STATUS"

STATUS=$(http_status "$API/api/analytics/recording/00000000-0000-0000-0000-000000000000/presign" \
  -H "Authorization: Bearer bad.jwt.token")
assert_status "recording/presign: bad JWT → 401" "401" "$STATUS"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 12. /api/analytics/audit-log — admin only
# ─────────────────────────────────────────────────────────────────────────────
echo "── /api/analytics/audit-log ────────────────────────────────────"

STATUS=$(http_status "$API/api/analytics/audit-log")
assert_status "audit-log: no token → 401" "401" "$STATUS"

STATUS=$(http_status "$API/api/analytics/audit-log" \
  -H "Authorization: Bearer bad.jwt.token")
assert_status "audit-log: bad JWT → 401" "401" "$STATUS"

echo ""

# ─────────────────────────────────────────────────────────────────────────────
# Manual verification (cannot automate without seeded test JWTs):
#
#   Test 13: GET /api/calls/live with an agent-role JWT → expected 403
#   Test 14: POST /api/calls/events with agent A's JWT for a contact
#            assigned only to agent B → expected 403
#
#   These require two real user accounts. Run manually against staging.
# ─────────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────────
TOTAL=$((PASS + FAIL))
echo "═══════════════════════════════════════════════════════════════"
echo "  Results: $PASS/$TOTAL passed"
if [[ $FAIL -gt 0 ]]; then
  echo "  ❌  $FAIL test(s) FAILED — fix access-control before shipping."
  echo "═══════════════════════════════════════════════════════════════"
  exit 1
else
  echo "  ✅  All access-control tests passed."
  echo "═══════════════════════════════════════════════════════════════"
  exit 0
fi
