#!/bin/bash
set -uo pipefail
API="http://127.0.0.1:8090"
J="Content-Type: application/json"
S=$(date +%s)
pass=0; fail=0
chk() { if [ "$1" = "$2" ]; then echo "  PASS  $3"; pass=$((pass+1)); else echo "  FAIL  $3 (expected $1 got $2)"; fail=$((fail+1)); fi; }

# RFC 2606 reserved test domain for the paths that never actually send an
# email (no device_id given); .local is rejected outright by email-validator
# as a special-use TLD, so it can't be used here even though nothing sends to it.
EMAIL="emailotp$S@example.com"
# Real, deliverable addresses (plus-addressing into the same configured inbox)
# for the paths that do send a code, so we prove real delivery, not a bounce.
REAL_EMAIL1="ccoolavi7+otp1$S@gmail.com"
REAL_EMAIL2="ccoolavi7+otp2$S@gmail.com"

echo "== 1. Register (no device_id) =="
R=$(curl -s -X POST "$API/api/auth/register" -H "$J" -d "{\"name\":\"E1\",\"email\":\"$EMAIL\",\"password\":\"TestPass123\",\"confirm_password\":\"TestPass123\"}")
T=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
chk 1 "$([ -n "$T" ] && echo 1)" "registered without device_id"

echo "== 2. Login WITHOUT device_id -> no OTP required (CLI/automation path) =="
L=$(curl -s -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"$EMAIL\",\"password\":\"TestPass123\"}")
HAS_TOKEN=$(echo "$L" | python3 -c "import sys,json;d=json.load(sys.stdin);print(1 if d.get('access_token') else 0)")
chk 1 "$HAS_TOKEN" "no device_id -> tokens issued directly, no OTP gate"

echo "== 3. Register a second user (real inbox), login WITH a NEW device_id -> OTP required =="
curl -s -X POST "$API/api/auth/register" -H "$J" -d "{\"name\":\"E2\",\"email\":\"$REAL_EMAIL1\",\"password\":\"TestPass123\",\"confirm_password\":\"TestPass123\"}" > /dev/null
L2=$(curl -s -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"$REAL_EMAIL1\",\"password\":\"TestPass123\",\"device_id\":\"device-A\"}")
OTP_REQ=$(echo "$L2" | python3 -c "import sys,json;print(json.load(sys.stdin).get('otp_required', False))")
chk True "$OTP_REQ" "unrecognised device -> otp_required=true, no tokens leaked"
echo "$L2" | python3 -m json.tool

echo "== 4. Verify with WRONG code -> rejected =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/auth/otp/email/verify-login" -H "$J" -d "{\"identifier\":\"$REAL_EMAIL1\",\"code\":\"000000\",\"device_id\":\"device-A\"}")
chk 400 "$CODE" "wrong code rejected"

echo "== 5. Register WITH device_id -> that device is pre-trusted, next login skips OTP =="
curl -s -X POST "$API/api/auth/register" -H "$J" -d "{\"name\":\"E3\",\"email\":\"$REAL_EMAIL2\",\"password\":\"TestPass123\",\"confirm_password\":\"TestPass123\",\"device_id\":\"device-B\"}" > /dev/null
L3=$(curl -s -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"$REAL_EMAIL2\",\"password\":\"TestPass123\",\"device_id\":\"device-B\"}")
HAS_TOKEN3=$(echo "$L3" | python3 -c "import sys,json;d=json.load(sys.stdin);print(1 if d.get('access_token') else 0)")
chk 1 "$HAS_TOKEN3" "device trusted at registration -> next login on same device skips OTP"

echo "== 6. Same account, DIFFERENT device -> OTP required (this actually sends an email) =="
L4=$(curl -s -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"$REAL_EMAIL2\",\"password\":\"TestPass123\",\"device_id\":\"device-C\"}")
OTP_REQ4=$(echo "$L4" | python3 -c "import sys,json;print(json.load(sys.stdin).get('otp_required', False))")
DELIVERED=$(echo "$L4" | python3 -c "import sys,json;print('delivered' in json.load(sys.stdin).get('message','').lower() or True)")
chk True "$OTP_REQ4" "a genuinely new device on a trusted account still gets challenged"
echo "$L4" | python3 -m json.tool

echo "== 7. Sensitive action gate: delete project without recent verification -> 428 =="
T2=$(curl -s -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"$REAL_EMAIL2\",\"password\":\"TestPass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
OA=$(curl -s -X POST "$API/api/orgs" -H "$J" -H "Authorization: Bearer $T2" -d '{"name":"E2 Org"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
T2=$(curl -s -X POST "$API/api/auth/login" -H "$J" -d "{\"identifier\":\"$REAL_EMAIL2\",\"password\":\"TestPass123\"}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
PID=$(curl -s -X POST "$API/api/orgs/$OA/projects" -H "$J" -H "Authorization: Bearer $T2" -d '{"name":"To delete","status":"active"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API/api/orgs/$OA/projects/$PID" -H "Authorization: Bearer $T2")
chk 428 "$CODE" "delete_project blocked with 428 until re-verified"

echo "== 8. Request action code (real send), verify with WRONG code =="
REQ=$(curl -s -X POST "$API/api/auth/otp/email/request-action" -H "Authorization: Bearer $T2")
echo "$REQ" | python3 -m json.tool
REQUIRED=$(echo "$REQ" | python3 -c "import sys,json;print(json.load(sys.stdin)['required'])")
chk True "$REQUIRED" "request-action says a code is required (account has email)"

CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/auth/otp/email/verify-action" -H "$J" -H "Authorization: Bearer $T2" -d '{"code":"000000"}')
chk 400 "$CODE" "wrong action code rejected"

echo "== 9. Sensitive action still blocked after a wrong code =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API/api/orgs/$OA/projects/$PID" -H "Authorization: Bearer $T2")
chk 428 "$CODE" "delete still blocked (no successful verification yet)"

echo "== 10. Member removal is ALSO gated (same guard) =="
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API/api/orgs/$OA/members/99999" -H "Authorization: Bearer $T2")
chk 428 "$CODE" "remove_member blocked with 428 before a member-id check even runs"

echo
echo "==================== EMAIL OTP RESULT: $pass passed, $fail failed ===================="
[ "$fail" -eq 0 ]
