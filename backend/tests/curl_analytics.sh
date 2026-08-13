#!/bin/bash
set -uo pipefail
API="http://127.0.0.1:8090"
J="Content-Type: application/json"
S=$(date +%s)
pass=0; fail=0
chk() { if [ "$1" = "$2" ]; then echo "  PASS  $3"; pass=$((pass+1)); else echo "  FAIL  $3 (expected $1 got $2)"; fail=$((fail+1)); fi; }

T=$(curl -s -X POST "$API/api/auth/register" -H "$J" -d "{\"name\":\"AN\",\"email\":\"an$S@example.com\",\"password\":\"TestPass123\",\"confirm_password\":\"TestPass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
OA=$(curl -s -X POST "$API/api/orgs" -H "$J" -H "Authorization: Bearer $T" -d '{"name":"AN Org"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
T=$(curl -s -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"an$S@example.com\",\"password\":\"TestPass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
PID=$(curl -s -X POST "$API/api/orgs/$OA/projects" -H "$J" -H "Authorization: Bearer $T" -d '{"name":"P","status":"active"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
SID=$(curl -s -X POST "$API/api/orgs/$OA/projects/$PID/sub-projects" -H "$J" -H "Authorization: Bearer $T" -d '{"name":"S","status":"active"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

echo "== analytics/tasks: empty org =="
curl -s "$API/api/orgs/$OA/analytics/tasks" -H "Authorization: Bearer $T" | python3 -m json.tool

echo "== create 4 tasks, mark 1 done -> completion_rate should be 0.25 =="
for i in 1 2 3 4; do
  curl -s -X POST "$API/api/orgs/$OA/projects/$PID/tasks/$SID" -H "$J" -H "Authorization: Bearer $T" -d "{\"title\":\"t$i\",\"status\":\"todo\",\"priority\":\"low\"}" > /dev/null
done
TID=$(curl -s "$API/api/orgs/$OA/projects/$PID/tasks/$SID" -H "Authorization: Bearer $T" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
curl -s -X PUT "$API/api/orgs/$OA/projects/$PID/tasks/$SID/$TID" -H "$J" -H "Authorization: Bearer $T" -d '{"status":"done"}' > /dev/null
RATE=$(curl -s "$API/api/orgs/$OA/analytics/tasks" -H "Authorization: Bearer $T" | python3 -c "import sys,json;print(json.load(sys.stdin)['overall']['completion_rate'])")
chk "0.25" "$RATE" "overall completion_rate is 0.25 (1 of 4 done)"

echo "== analytics/habits: create habit, check in, verify leaderboard + 30d rate =="
HID=$(curl -s -X POST "$API/api/orgs/$OA/habits" -H "$J" -H "Authorization: Bearer $T" -d '{"title":"Exercise","target_days":7}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
curl -s -X POST "$API/api/orgs/$OA/habits/$HID/check" -H "Authorization: Bearer $T" > /dev/null
HDATA=$(curl -s "$API/api/orgs/$OA/analytics/habits" -H "Authorization: Bearer $T")
echo "$HDATA" | python3 -m json.tool
STREAK=$(echo "$HDATA" | python3 -c "import sys,json;print(json.load(sys.stdin)['leaderboard'][0]['streak'])")
chk 1 "$STREAK" "leaderboard shows streak=1 after one check-in"
COMP30=$(echo "$HDATA" | python3 -c "import sys,json;print(json.load(sys.stdin)['completion_rate_30d'])")
chk "0.033" "$COMP30" "completion_rate_30d = 1/30 rounded"

echo "== analytics/time: log 90 min development -> 1.5 hours =="
curl -s -X POST "$API/api/orgs/$OA/time" -H "$J" -H "Authorization: Bearer $T" -d '{"duration_minutes":90,"category":"development"}' > /dev/null
TDATA=$(curl -s "$API/api/orgs/$OA/analytics/time" -H "Authorization: Bearer $T")
echo "$TDATA" | python3 -m json.tool
HOURS=$(echo "$TDATA" | python3 -c "import sys,json;d=json.load(sys.stdin);print([r['hours'] for r in d if r['category']=='development'][0])")
chk "1.5" "$HOURS" "time analytics shows 1.5 hours for development"

echo "== analytics/velocity: 8-week array, this week has 1 completion =="
VDATA=$(curl -s "$API/api/orgs/$OA/analytics/velocity" -H "Authorization: Bearer $T")
echo "$VDATA" | python3 -m json.tool
WEEKS=$(echo "$VDATA" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
chk 8 "$WEEKS" "velocity returns exactly 8 weeks"
THISWEEK=$(echo "$VDATA" | python3 -c "import sys,json;print(json.load(sys.stdin)[-1]['completed'])")
chk 1 "$THISWEEK" "this week shows 1 completed task"

echo "== cross-org isolation =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/orgs/999999/analytics/tasks" -H "Authorization: Bearer $T")
chk 403 "$CODE" "non-member org rejected"

echo
echo "==================== B6 RESULT: $pass passed, $fail failed ===================="
[ "$fail" -eq 0 ]
