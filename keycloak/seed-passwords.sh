#!/bin/sh
# ตั้งรหัสผ่านให้บัญชีทดสอบทุกบัญชีหลัง Keycloak import realm เสร็จ ผ่าน Admin REST API
# แยกจาก tablebook-realm.json เพื่อไม่ให้มีรหัสผ่าน plaintext อยู่ในไฟล์ realm export ที่ commit ลง git
set -eu

KEYCLOAK_URL="${KEYCLOAK_URL:-http://keycloak:8080}"
REALM="${REALM:-tablebook}"
ADMIN_USER="${KEYCLOAK_ADMIN:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
SEED_PASSWORD="${SEED_PASSWORD:-password123}"

echo "รอ Keycloak realm '$REALM' พร้อมใช้งาน..."
until curl -sf "$KEYCLOAK_URL/realms/$REALM" > /dev/null; do
  sleep 2
done

TOKEN=$(curl -sf -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" -d "username=$ADMIN_USER" -d "password=$ADMIN_PASS" -d "grant_type=password" \
  | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

if [ -z "$TOKEN" ]; then
  echo "ขอ admin token ไม่สำเร็จ" >&2
  exit 1
fi

USERS=$(curl -sf -H "Authorization: Bearer $TOKEN" "$KEYCLOAK_URL/admin/realms/$REALM/users?max=1000")

echo "$USERS" | grep -o '"id":"[^"]*"' | sed 's/"id":"//;s/"//' | while read -r ID; do
  curl -sf -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/users/$ID/reset-password" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"type\":\"password\",\"value\":\"$SEED_PASSWORD\",\"temporary\":false}" \
    && echo "ตั้งรหัสผ่านให้ user $ID แล้ว"
done

echo "ตั้งรหัสผ่านบัญชีทดสอบเสร็จสมบูรณ์"
