#!/bin/bash
set -uo pipefail
API="http://127.0.0.1:8090"
J="Content-Type: application/json"
S=$(date +%s)
pass=0; fail=0
chk() { if [ "$1" = "$2" ]; then echo "  PASS  $3"; pass=$((pass+1)); else echo "  FAIL  $3 (expected $1 got $2)"; fail=$((fail+1)); fi; }

# Owner + assignee in the same org.
OWNER="notifowner$S@example.com"
ASSIGNEE="notifassignee$S@example.com"

curl -s -X POST "$API/api/auth/register" -H "$J" -d "{\"name\":\"Owner\",\"email\":\"$OWNER\",\"password\":\"TestPass123\",\"confirm_password\":\"TestPass123\"}" > /dev/null
TA=$(curl -s -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"$OWNER\",\"password\":\"TestPass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
OA=$(curl -s -X POST "$API/api/orgs" -H "$J" -H "Authorization: Bearer $TA" -d '{"name":"Notif Org"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
TA=$(curl -s -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"$OWNER\",\"password\":\"TestPass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s -X POST "$API/api/auth/register" -H "$J" -d "{\"name\":\"Assignee\",\"email\":\"$ASSIGNEE\",\"password\":\"TestPass123\",\"confirm_password\":\"TestPass123\"}" > /dev/null
ASSIGNEE_TOKEN=$(curl -s -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"$ASSIGNEE\",\"password\":\"TestPass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

echo "== 1. Invite assignee -> notify_invite =="
curl -s -X POST "$API/api/orgs/$OA/members" -H "$J" -H "Authorization: Bearer $TA" -d "{\"email\":\"$ASSIGNEE\",\"role\":\"member\"}" > /dev/null
ASSIGNEE_TOKEN=$(curl -s -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"$ASSIGNEE\",\"password\":\"TestPass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
ASSIGNEE_ID=$(curl -s "$API/api/orgs/$OA/members" -H "Authorization: Bearer $TA" | python3 -c "import sys,json;d=json.load(sys.stdin);print([m['user_id'] for m in d if m['user']['email']=='$ASSIGNEE'][0])")
N=$(curl -s "$API/api/notifications" -H "Authorization: Bearer $ASSIGNEE_TOKEN" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
chk 1 "$N" "assignee has 1 unread notification after being invited"

echo "== 2. Create project/section/task assigned to assignee -> notify_task_assigned =="
PID=$(curl -s -X POST "$API/api/orgs/$OA/projects" -H "$J" -H "Authorization: Bearer $TA" -d '{"name":"P","status":"active"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
SID=$(curl -s -X POST "$API/api/orgs/$OA/projects/$PID/sub-projects" -H "$J" -H "Authorization: Bearer $TA" -d '{"name":"S","status":"active"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
TID=$(curl -s -X POST "$API/api/orgs/$OA/projects/$PID/tasks/$SID" -H "$J" -H "Authorization: Bearer $TA" -d "{\"title\":\"Assigned task\",\"status\":\"todo\",\"priority\":\"high\",\"assignee_id\":$ASSIGNEE_ID}" | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
N=$(curl -s "$API/api/notifications" -H "Authorization: Bearer $ASSIGNEE_TOKEN" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
chk 2 "$N" "assignee now has 2 unread notifications (invite + assignment)"

echo "== 3. Owner comments on the task -> notify_comment_added =="
curl -s -X POST "$API/api/orgs/$OA/projects/$PID/tasks/$SID/$TID/comments" -H "$J" -H "Authorization: Bearer $TA" -d '{"content":"looking good"}' > /dev/null
N=$(curl -s "$API/api/notifications" -H "Authorization: Bearer $ASSIGNEE_TOKEN" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
chk 3 "$N" "assignee now has 3 unread notifications (+comment)"

echo "== 4. Assignee commenting on OWN assigned task must NOT self-notify =="
curl -s -X POST "$API/api/orgs/$OA/projects/$PID/tasks/$SID/$TID/comments" -H "$J" -H "Authorization: Bearer $ASSIGNEE_TOKEN" -d '{"content":"on it"}' > /dev/null
N=$(curl -s "$API/api/notifications" -H "Authorization: Bearer $ASSIGNEE_TOKEN" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
chk 3 "$N" "no self-notification when the assignee comments on their own task"

echo "== 5. Mark one read =="
FIRST_ID=$(curl -s "$API/api/notifications" -H "Authorization: Bearer $ASSIGNEE_TOKEN" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
curl -s -X POST "$API/api/notifications/$FIRST_ID/read" -H "Authorization: Bearer $ASSIGNEE_TOKEN" > /dev/null
N=$(curl -s "$API/api/notifications" -H "Authorization: Bearer $ASSIGNEE_TOKEN" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
chk 2 "$N" "unread count drops after marking one read"

echo "== 6. Mark all read =="
curl -s -X POST "$API/api/notifications/read-all" -H "Authorization: Bearer $ASSIGNEE_TOKEN" > /dev/null
N=$(curl -s "$API/api/notifications" -H "Authorization: Bearer $ASSIGNEE_TOKEN" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
chk 0 "$N" "unread count is 0 after mark-all-read"

echo "== 7. Owner cannot see (or mark read) the assignee's notification by ID =="
# Owner should have 0 unread since they took all the actions themselves.
OWNER_N=$(curl -s "$API/api/notifications" -H "Authorization: Bearer $TA" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
chk 0 "$OWNER_N" "owner has no notifications (all actions were self-initiated)"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/notifications/$FIRST_ID/read" -H "Authorization: Bearer $TA")
chk 404 "$CODE" "owner cannot mark the assignee's notification read (cross-user isolation)"

echo "== 8. Unauthenticated access rejected =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/notifications")
chk 403 "$CODE" "no token -> rejected"

echo
echo "==================== B3 RESULT: $pass passed, $fail failed ===================="
[ "$fail" -eq 0 ]
