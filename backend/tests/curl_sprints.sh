#!/bin/bash
set -uo pipefail
API="http://127.0.0.1:8090"
J="Content-Type: application/json"
S=$(date +%s)
pass=0; fail=0
chk() { if [ "$1" = "$2" ]; then echo "  PASS  $3"; pass=$((pass+1)); else echo "  FAIL  $3 (expected $1 got $2)"; fail=$((fail+1)); fi; }

T=$(curl -s -X POST "$API/api/auth/register" -H "$J" -d "{\"name\":\"SP\",\"email\":\"sp$S@example.com\",\"password\":\"TestPass123\",\"confirm_password\":\"TestPass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
OA=$(curl -s -X POST "$API/api/orgs" -H "$J" -H "Authorization: Bearer $T" -d '{"name":"SP Org"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
T=$(curl -s -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"sp$S@example.com\",\"password\":\"TestPass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
PID=$(curl -s -X POST "$API/api/orgs/$OA/projects" -H "$J" -H "Authorization: Bearer $T" -d '{"name":"P","status":"active"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
SID=$(curl -s -X POST "$API/api/orgs/$OA/projects/$PID/sub-projects" -H "$J" -H "Authorization: Bearer $T" -d '{"name":"S","status":"active"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
SPBASE="$API/api/orgs/$OA/projects/$PID/sprints"

echo "== 1. create sprint =="
START=$(date -u +%Y-%m-%dT00:00:00)
END=$(date -u -d "+13 days" +%Y-%m-%dT00:00:00 2>/dev/null || date -u -v+13d +%Y-%m-%dT00:00:00)
SPRINT=$(curl -s -X POST "$SPBASE" -H "$J" -H "Authorization: Bearer $T" -d "{\"name\":\"Sprint 1\",\"goal\":\"Ship the thing\",\"start_date\":\"$START\",\"end_date\":\"$END\"}")
echo "$SPRINT" | python3 -m json.tool
SPRINTID=$(echo "$SPRINT" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
chk "planning" "$(echo "$SPRINT" | python3 -c "import sys,json;print(json.load(sys.stdin)['status'])")" "sprint defaults to planning status"

echo "== 2. create 2 tasks with story points, add to sprint =="
T1=$(curl -s -X POST "$API/api/orgs/$OA/projects/$PID/tasks/$SID" -H "$J" -H "Authorization: Bearer $T" -d '{"title":"t1","status":"todo","priority":"low","story_points":3}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
T2=$(curl -s -X POST "$API/api/orgs/$OA/projects/$PID/tasks/$SID" -H "$J" -H "Authorization: Bearer $T" -d '{"title":"t2","status":"todo","priority":"low","story_points":5}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
R1=$(curl -s -X POST "$SPBASE/$SPRINTID/tasks" -H "$J" -H "Authorization: Bearer $T" -d "{\"task_id\":$T1}")
R2=$(curl -s -X POST "$SPBASE/$SPRINTID/tasks" -H "$J" -H "Authorization: Bearer $T" -d "{\"task_id\":$T2}")
TOTAL=$(echo "$R2" | python3 -c "import sys,json;print(json.load(sys.stdin)['total_points'])")
chk 8 "$TOTAL" "sprint total_points = 3+5 = 8"

echo "== 3. duplicate add rejected =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SPBASE/$SPRINTID/tasks" -H "$J" -H "Authorization: Bearer $T" -d "{\"task_id\":$T1}")
chk 409 "$CODE" "adding the same task twice rejected"

echo "== 4. mark t1 done -> completed_points reflects it =="
curl -s -X PUT "$API/api/orgs/$OA/projects/$PID/tasks/$SID/$T1" -H "$J" -H "Authorization: Bearer $T" -d '{"status":"done"}' > /dev/null
SPRINTS=$(curl -s "$SPBASE" -H "Authorization: Bearer $T")
COMPLETED=$(echo "$SPRINTS" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['completed_points'])")
chk 3 "$COMPLETED" "completed_points = 3 after t1 done"

echo "== 5. burndown: remaining_points reflects completion =="
BURN=$(curl -s "$SPBASE/$SPRINTID/burndown" -H "Authorization: Bearer $T")
echo "$BURN" | python3 -m json.tool
LAST_REMAINING=$(echo "$BURN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['days'][-1]['remaining_points'])")
chk 5 "$LAST_REMAINING" "burndown remaining_points on the last day = 8-3 = 5"
BURN_TOTAL=$(echo "$BURN" | python3 -c "import sys,json;print(json.load(sys.stdin)['total_points'])")
chk 8 "$BURN_TOTAL" "burndown total_points = 8"

echo "== 6. list sprint tasks =="
N=$(curl -s "$SPBASE/$SPRINTID/tasks" -H "Authorization: Bearer $T" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
chk 2 "$N" "sprint has 2 tasks"

echo "== 7. remove a task from the sprint =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$SPBASE/$SPRINTID/tasks/$T2" -H "Authorization: Bearer $T")
chk 200 "$CODE" "task removed from sprint"
N=$(curl -s "$SPBASE/$SPRINTID/tasks" -H "Authorization: Bearer $T" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
chk 1 "$N" "sprint now has 1 task"

echo "== 8. task from a different project rejected =="
PID2=$(curl -s -X POST "$API/api/orgs/$OA/projects" -H "$J" -H "Authorization: Bearer $T" -d '{"name":"P2","status":"active"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
SID2=$(curl -s -X POST "$API/api/orgs/$OA/projects/$PID2/sub-projects" -H "$J" -H "Authorization: Bearer $T" -d '{"name":"S2","status":"active"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
OTHER=$(curl -s -X POST "$API/api/orgs/$OA/projects/$PID2/tasks/$SID2" -H "$J" -H "Authorization: Bearer $T" -d '{"title":"other","status":"todo","priority":"low"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SPBASE/$SPRINTID/tasks" -H "$J" -H "Authorization: Bearer $T" -d "{\"task_id\":$OTHER}")
chk 404 "$CODE" "task from a different project rejected"

echo "== 9. update sprint status =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$SPBASE/$SPRINTID" -H "$J" -H "Authorization: Bearer $T" -d '{"status":"active"}')
chk 200 "$CODE" "sprint status updated"

echo "== 10. delete sprint =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$SPBASE/$SPRINTID" -H "Authorization: Bearer $T")
chk 200 "$CODE" "sprint deleted"
N=$(curl -s "$SPBASE" -H "Authorization: Bearer $T" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
chk 0 "$N" "sprint list empty after delete"

echo "== 11. cross-org isolation =="
curl -s -o /dev/null -X POST "$API/api/auth/register" -H "$J" -d "{\"name\":\"Bob\",\"email\":\"spb$S@example.com\",\"password\":\"TestPass123\",\"confirm_password\":\"TestPass123\"}"
TB=$(curl -s -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"spb$S@example.com\",\"password\":\"TestPass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SPBASE" -H "Authorization: Bearer $TB")
chk 403 "$CODE" "non-member rejected"

echo
echo "==================== B9 RESULT: $pass passed, $fail failed ===================="
[ "$fail" -eq 0 ]
