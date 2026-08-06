#!/usr/bin/env python3
"""Apply the Cha Bot Auto-Reports (AI narrative summaries) feature.

Run from the repository root (the folder that contains ai_service/, backend/ and
frontend/):

    python3 apply_reports_ai.py

It copies the updated files into place and appends a /report endpoint to
ai_service/main.py (idempotent -- safe to run twice, never touches your v4
changes to main.py because it only APPENDS).
"""
import os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "files")
REPO = os.getcwd()

COPIES = [
    "ai_service/llm.py",
    "backend/src/main/java/com/chaghor/chaghor/chatbot/ChatbotService.java",
    "backend/src/main/java/com/chaghor/chaghor/report/ReportService.java",
    "backend/src/main/java/com/chaghor/chaghor/report/dto/GenerateReportRequest.java",
    "frontend/src/pages/admin/Reports.jsx",
]

mainpy = os.path.join(REPO, "ai_service", "main.py")
missing = [p for p in COPIES if not os.path.exists(os.path.join(REPO, p))]
if not os.path.exists(mainpy) or missing:
    print("ERROR: run this from the chaghor repo root.")
    if missing:
        print("  missing target files:", missing)
    if not os.path.exists(mainpy):
        print("  missing ai_service/main.py")
    sys.exit(1)

for rel in COPIES:
    src = os.path.join(SRC, rel)
    dst = os.path.join(REPO, rel)
    shutil.copyfile(src, dst)
    print("copied ->", rel)

MARKER = "# === CHA BOT AUTO-REPORT (narrative summaries) ==="
cur = open(mainpy, encoding="utf-8").read()
if MARKER in cur:
    print("main.py already has the /report endpoint, skipping append")
else:
    block = open(os.path.join(SRC, "ai_service", "main_report_block.py"), encoding="utf-8").read()
    with open(mainpy, "a", encoding="utf-8") as f:
        f.write("\n\n" + block)
    print("appended /report endpoint -> ai_service/main.py")

print("\nDONE. Now restart the backend and ai_service:")
print("  ai_service:  uvicorn main:app --port 8000 --reload")
print("  backend:     ./mvnw spring-boot:run   (or your usual run)")
