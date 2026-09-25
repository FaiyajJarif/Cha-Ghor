#!/usr/bin/env bash
SPRING=http://localhost:8080
TOKEN=$(curl -s -X POST "$SPRING/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
echo "token length: ${#TOKEN}"
for pair in "GET:/api/v1/me" "GET:/api/v1/admin/ping" "GET:/api/v1/supervisor/ping"; do
  m=${pair%%:*}; u=${pair#*:}
  echo "$m $u -> $(curl -s -o /dev/null -w '%{http_code}' -X $m "$SPRING$u" -H "Authorization: Bearer $TOKEN")"
done
echo "POST /api/v1/chatbot/ask -> $(curl -s -o /dev/null -w '%{http_code}' -X POST "$SPRING/api/v1/chatbot/ask" -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"question":"x"}')"
