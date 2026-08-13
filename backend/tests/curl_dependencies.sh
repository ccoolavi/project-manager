#!/bin/bash
set -uo pipefail
API="http://127.0.0.1:8090"
J="Content-Type: application/json"
S=$(date +%s)
pass=0; fail=0
chk() { if [ "$1" = "$2" ]; then echo "  PASS  $3"; pass=$((pass+1)); else echo "  FAIL  $3 (expected $1 got $2)"; fail=$((fail+1)); fi; }

T=$(curl -s -X POST "$API/api/auth/register" -H "$J" -d "{\"name\":\"D8\",\"email\":\"d8$S@example.com\",\"password\":\"TestPass123\",\"confirm_password\":\"TestPass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
OA=$(curl -s -X POST "$API/api/orgs" -H "$J" -H "Authorization: Bearer $T" -d '{"name":"D8 Org"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
T=$(curl -s -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"d8$S@example.com\",\"password\":\"TestPass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
PID=$(curl -s -X POST "$API/api/orgs/$OA/projects" -H "$J" -H "Authorization: Bearer $T" -d '{"name":"P","status":"active"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
SID=$(curl -s -X POST "$API/api/orgs/$OA/projects/$PID/sub-projects" -H "$J" -H "Authorization: Bearer $T" -d '{"name":"S","status":"active"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
BASE="$API/api/orgs/$OA/projects/$PID/tasks/$SID"

BLOCKER=$(curl -s -X POST "$BASE" -H "$J" -H "Authorization: Bearer $T" -d '{"title":"Blocker task","status":"todo","priority":"high"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
BLOCKED=$(curl -s -X POST "$BASE" -H "$J" -H "Authorization: Bearer $T" -d '{"title":"Blocked task","status":"todo","priority":"high"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

echo "== 1. blocked field starts false =="
B=$(curl -s "$BASE/$BLOCKED" -H "Authorization: Bearer $T" | python3 -c "import sys,json;print(json.load(sys.stdin)['blocked'])")
chk False "$B" "task not blocked before any dependency exists"

echo "== 2. add dependency: blocked depends on blocker =="
DEP=$(curl -s -X POST "$BASE/$BLOCKED/dependencies" -H "$J" -H "Authorization: Bearer $T" -d "{\"depends_on_id\":$BLOCKER}")
echo "$DEP" | python3 -m json.tool
DEPID=$(echo "$DEP" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")

echo "== 3. blocked field now true (blocker is still todo) =="
B=$(curl -s "$BASE/$BLOCKED" -H "Authorization: Bearer $T" | python3 -c "import sys,json;print(json.load(sys.stdin)['blocked'])")
chk True "$B" "task IS blocked while the dependency is unfinished"

echo "== 4. self-dependency rejected =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/$BLOCKED/dependencies" -H "$J" -H "Authorization: Bearer $T" -d "{\"depends_on_id\":$BLOCKED}")
chk 400 "$CODE" "self-dependency rejected"

echo "== 5. duplicate dependency rejected =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/$BLOCKED/dependencies" -H "$J" -H "Authorization: Bearer $T" -d "{\"depends_on_id\":$BLOCKER}")
chk 409 "$CODE" "duplicate dependency rejected"

echo "== 6. dependency on a task from a different project rejected =="
PID2=$(curl -s -X POST "$API/api/orgs/$OA/projects" -H "$J" -H "Authorization: Bearer $T" -d '{"name":"P2","status":"active"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
SID2=$(curl -s -X POST "$API/api/orgs/$OA/projects/$PID2/sub-projects" -H "$J" -H "Authorization: Bearer $T" -d '{"name":"S2","status":"active"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
OTHER=$(curl -s -X POST "$API/api/orgs/$OA/projects/$PID2/tasks/$SID2" -H "$J" -H "Authorization: Bearer $T" -d '{"title":"Other project task","status":"todo","priority":"low"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/$BLOCKED/dependencies" -H "$J" -H "Authorization: Bearer $T" -d "{\"depends_on_id\":$OTHER}")
chk 404 "$CODE" "cross-project dependency rejected"

echo "== 7. finish the blocker -> blocked task unblocks =="
curl -s -X PUT "$BASE/$BLOCKER" -H "$J" -H "Authorization: Bearer $T" -d '{"status":"done"}' > /dev/null
B=$(curl -s "$BASE/$BLOCKED" -H "Authorization: Bearer $T" | python3 -c "import sys,json;print(json.load(sys.stdin)['blocked'])")
chk False "$B" "task unblocks once its dependency reaches done"

echo "== 8. list dependencies =="
N=$(curl -s "$BASE/$BLOCKED/dependencies" -H "Authorization: Bearer $T" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
chk 1 "$N" "list returns 1 dependency"

echo "== 9. remove dependency =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/$BLOCKED/dependencies/$DEPID" -H "Authorization: Bearer $T")
chk 200 "$CODE" "dependency removed"
N=$(curl -s "$BASE/$BLOCKED/dependencies" -H "Authorization: Bearer $T" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
chk 0 "$N" "dependency list empty after removal"

echo "== 10. cross-org isolation: Bob cannot add a dependency in Alice's org =="
curl -s -o /dev/null -X POST "$API/api/auth/register" -H "$J" -d "{\"name\":\"Bob\",\"email\":\"d8b$S@example.com\",\"password\":\"TestPass123\",\"confirm_password\":\"TestPass123\"}"
TB=$(curl -s -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"d8b$S@example.com\",\"password\":\"TestPass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
OB=$(curl -s -X POST "$API/api/orgs" -H "$J" -H "Authorization: Bearer $TB" -d '{"name":"Bob Org"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
TB=$(curl -s -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"d8b$S@example.com\",\"password\":\"TestPass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/orgs/$OB/projects/$PID/tasks/$SID/$BLOCKED/dependencies" -H "$J" -H "Authorization: Bearer $TB" -d "{\"depends_on_id\":$BLOCKER}")
chk 404 "$CODE" "Bob cannot add a dependency via his own org_id + Alice's task ids"

echo
echo "==================== B8 RESULT: $pass passed, $fail failed ===================="
[ "$fail" -eq 0 ]
