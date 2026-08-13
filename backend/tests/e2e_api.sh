#!/bin/bash
# End-to-end API verification against the PUBLIC HTTPS endpoint.
API="https://least-rome-techrepublic-modules.trycloudflare.com"
ORIGIN="https://ccoolavi.github.io"
J="Content-Type: application/json"
O="Origin: $ORIGIN"
pass=0; fail=0
chk() { if [ "$1" = "$2" ]; then echo "  PASS  $3"; pass=$((pass+1)); else echo "  FAIL  $3 (expected $1, got $2)"; fail=$((fail+1)); fi; }

STAMP=$(date +%s)
echo "== 1. Register user A =="
RA=$(curl -s -m 20 -X POST "$API/api/auth/register" -H "$J" -H "$O" -d "{\"name\":\"Alice\",\"email\":\"alice$STAMP@test.com\",\"password\":\"TestPass123\",\"confirm_password\":\"TestPass123\"}")
TA=$(echo "$RA" | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
[ -n "$TA" ] && chk 1 1 "user A registered, JWT issued" || { echo "  FAIL register: $RA"; exit 1; }

echo "== 2. Login user A =="
RL=$(curl -s -m 20 -X POST "$API/api/auth/login" -H "$J" -H "$O" -d "{\"identifier\":\"alice$STAMP@test.com\",\"password\":\"TestPass123\"}")
TA=$(echo "$RL" | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))")
[ -n "$TA" ] && chk 1 1 "login returns JWT" || chk 1 0 "login returns JWT"
AH="Authorization: Bearer $TA"

echo "== 3. Create org =="
OA=$(curl -s -m 20 -X POST "$API/api/orgs" -H "$J" -H "$O" -H "$AH" -d '{"name":"Alice Corp","description":"test"}')
OAID=$(echo "$OA" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
[ -n "$OAID" ] && chk 1 1 "org created (id=$OAID)" || { echo "  FAIL org: $OA"; exit 1; }
# re-login so the JWT carries org_id/role
TA=$(curl -s -m 20 -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"alice$STAMP@test.com\",\"password\":\"TestPass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
AH="Authorization: Bearer $TA"

echo "== 4. Project =="
PR=$(curl -s -m 20 -X POST "$API/api/orgs/$OAID/projects" -H "$J" -H "$O" -H "$AH" -d '{"name":"Website","description":"d","status":"active"}')
PID=$(echo "$PR" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
[ -n "$PID" ] && chk 1 1 "project created (id=$PID)" || { echo "  FAIL project: $PR"; exit 1; }

echo "== 5. Sub-project =="
SP=$(curl -s -m 20 -X POST "$API/api/orgs/$OAID/projects/$PID/sub-projects" -H "$J" -H "$O" -H "$AH" -d '{"name":"Phase 1","description":"d","status":"active"}')
SPID=$(echo "$SP" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
[ -n "$SPID" ] && chk 1 1 "sub-project created (id=$SPID)" || { echo "  FAIL sub-project: $SP"; exit 1; }

echo "== 6. Task CRUD =="
TK=$(curl -s -m 20 -X POST "$API/api/orgs/$OAID/projects/$PID/tasks/$SPID" -H "$J" -H "$O" -H "$AH" -d '{"title":"Design homepage","description":"d","status":"todo","priority":"high"}')
TKID=$(echo "$TK" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
[ -n "$TKID" ] && chk 1 1 "task created (id=$TKID)" || { echo "  FAIL task: $TK"; exit 1; }
CODE=$(curl -s -m 20 -o /dev/null -w "%{http_code}" -X PUT "$API/api/orgs/$OAID/projects/$PID/tasks/$SPID/$TKID" -H "$J" -H "$AH" -d '{"status":"in_progress"}')
chk 200 "$CODE" "task status advanced"
N=$(curl -s -m 20 "$API/api/orgs/$OAID/projects/$PID/tasks/$SPID" -H "$AH" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
chk 1 "$N" "task list returns 1"

echo "== 7. Habit + check-in persistence =="
HB=$(curl -s -m 20 -X POST "$API/api/orgs/$OAID/habits" -H "$J" -H "$AH" -d '{"title":"Exercise","category":"health","target_days":7}')
HID=$(echo "$HB" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
[ -n "$HID" ] && chk 1 1 "habit created" || chk 1 0 "habit created"
curl -s -m 20 -o /dev/null -X POST "$API/api/orgs/$OAID/habits/$HID/check" -H "$AH"
STREAK=$(curl -s -m 20 "$API/api/orgs/$OAID/habits" -H "$AH" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['streak'])")
chk 1 "$STREAK" "habit streak PERSISTED after re-read (MutableList fix)"

echo "== 8. Time entry (previously 404) =="
CODE=$(curl -s -m 20 -o /dev/null -w "%{http_code}" -X POST "$API/api/orgs/$OAID/time" -H "$J" -H "$AH" -d '{"duration_minutes":45,"category":"development"}')
chk 200 "$CODE" "time entry created"
N=$(curl -s -m 20 "$API/api/orgs/$OAID/time" -H "$AH" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
chk 1 "$N" "time entry listed"

echo "== 9. Kaizen log (previously 404) =="
CODE=$(curl -s -m 20 -o /dev/null -w "%{http_code}" -X POST "$API/api/orgs/$OAID/kaizen" -H "$J" -H "$AH" -d '{"title":"Batch emails","problem":"context switching","solution":"two windows daily","category":"productivity"}')
chk 200 "$CODE" "kaizen log created"
N=$(curl -s -m 20 "$API/api/orgs/$OAID/kaizen" -H "$AH" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
chk 1 "$N" "kaizen log listed"

echo "== 10. TENANT ISOLATION — user B must not reach org A's data =="
curl -s -m 20 -o /dev/null -X POST "$API/api/auth/register" -H "$J" -d "{\"name\":\"Bob\",\"email\":\"bob$STAMP@test.com\",\"password\":\"TestPass123\",\"confirm_password\":\"TestPass123\"}"
TB=$(curl -s -m 20 -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"bob$STAMP@test.com\",\"password\":\"TestPass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
BH="Authorization: Bearer $TB"
OB=$(curl -s -m 20 -X POST "$API/api/orgs" -H "$J" -H "$BH" -d '{"name":"Bob Inc","description":"t"}')
OBID=$(echo "$OB" | python3 -c "import sys,json;print(json.load(sys.stdin).get('id',''))")
TB=$(curl -s -m 20 -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"bob$STAMP@test.com\",\"password\":\"TestPass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
BH="Authorization: Bearer $TB"

CODE=$(curl -s -m 20 -o /dev/null -w "%{http_code}" "$API/api/orgs/$OAID/projects" -H "$BH")
chk 403 "$CODE" "Bob blocked from org A projects"
# the original leak: Bob's OWN org id + Alice's sub_project id
CODE=$(curl -s -m 20 -o /dev/null -w "%{http_code}" "$API/api/orgs/$OBID/projects/$PID/tasks/$SPID" -H "$BH")
chk 404 "$CODE" "CROSS-ORG LEAK CLOSED: Bob cannot read org A tasks via his own org_id"
CODE=$(curl -s -m 20 -o /dev/null -w "%{http_code}" -X DELETE "$API/api/orgs/$OBID/projects/$PID/tasks/$SPID/$TKID" -H "$BH")
chk 404 "$CODE" "Bob cannot DELETE org A task"
N=$(curl -s -m 20 "$API/api/orgs/$OBID/kaizen" -H "$BH" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
chk 0 "$N" "Bob's kaizen list is empty (no bleed from Alice)"

echo "== 11. Unauthenticated access rejected =="
CODE=$(curl -s -m 20 -o /dev/null -w "%{http_code}" "$API/api/orgs/$OAID/projects")
chk 403 "$CODE" "no token -> rejected"

echo
echo "==================== RESULT: $pass passed, $fail failed ===================="
[ "$fail" -eq 0 ] || exit 1
