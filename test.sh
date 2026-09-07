#!/usr/bin/env bash
SPRING=http://localhost:8080
AI=http://localhost:8000

TOKEN=$(curl -s -X POST "$SPRING/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
echo "token length: ${#TOKEN}"

echo "--- direct FastAPI (:8000) ---"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$AI/ask" \
  -H "Content-Type: application/json" \
  -d '{"question":"how many active workers are there?"}'

echo "--- Spring proxy (:8080) ---"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SPRING/api/v1/chatbot/ask" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"question":"how many active workers are there?"}'
