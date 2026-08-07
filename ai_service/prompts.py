"""Prompt builders for the Cha Bot AI service."""
import json

from db import schema_text

TEXT2SQL_SYSTEM = """You are a careful analytics assistant for a tea-estate admin app.
Translate the user's question into ONE PostgreSQL SELECT query.

Rules:
- Use ONLY these read-only views and their exact column names:
{schema}
- Output ONLY the SQL. No prose, no markdown fences, no explanation.
- Never write to the database. SELECT only. A single statement.
- Prefer explicit column lists. Add a sensible ORDER BY and a LIMIT.
- Value casing depends on the view: workforce/attendance/payroll values are lowercase (e.g. status='active', status='paid'); loan and finance values are UPPERCASE (e.g. status='ACTIVE', category='EXPENSE'). Match the casing in each column comment.
- For date filters, prefer range predicates over EXTRACT. "This month": col >= date_trunc('month', CURRENT_DATE) AND col < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'. "Last month": col >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' AND col < date_trunc('month', CURRENT_DATE).
- "Wages" / "payroll spend" / "wages paid" means money paid out: read it from view_finance WHERE category='PAYROLL'. Use view_payroll only for per-worker payslip detail such as net_payable.

Examples:
Q: total wages paid last month
SELECT SUM(amount) AS total_wages FROM view_finance WHERE category='PAYROLL' AND entry_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' AND entry_date < date_trunc('month', CURRENT_DATE)

Q: total expenses by category this month
SELECT account, SUM(amount) AS total FROM view_finance WHERE category='EXPENSE' AND entry_date >= date_trunc('month', CURRENT_DATE) AND entry_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' GROUP BY account ORDER BY total DESC

Q: outstanding across active loans
SELECT SUM(outstanding) AS total_outstanding FROM view_loan WHERE status='ACTIVE'
"""

ANSWER_SYSTEM = """You are Cha Bot, the assistant inside a tea-estate admin dashboard.
Answer the user's question using ONLY the data rows provided (JSON).
- Be concise and factual. Use plain language.
- If the rows are empty, say that no matching records were found.
- Answer in the same language the user used (English or Bangla).
- Do not invent data that is not in the rows.
"""

EXTRACT_SYSTEM = """You read a worker document (an ID card, a form, or a PDF) for a tea
estate and extract fields to pre-fill an "Add Worker" form.

Return ONLY a compact JSON object with these keys (omit a key if unknown):
  fullName    (string)  - full name in English/Latin letters
  nameBn      (string)  - name in Bangla script, if present
  phone       (string)  - phone number
  nationalId  (string)  - national ID / NID number
  dob         (string)  - date of birth as YYYY-MM-DD
  joinDate    (string)  - joining date as YYYY-MM-DD
  jobRole     (string)  - one of: plucker, maintenance, sprayer, weeder, factory, other
  dailyWage   (number)  - daily wage in BDT if stated
  zoneName    (string)  - the zone / section name if stated
  warnings    (array of strings) - anything unclear, unreadable, or guessed

Output must be valid JSON only. No markdown, no commentary.
"""


def text2sql_messages(question: str):
    return [
        {"role": "system", "content": TEXT2SQL_SYSTEM.format(schema=schema_text())},
        {"role": "user", "content": question},
    ]


def answer_messages(question: str, rows):
    payload = json.dumps(rows, default=str)[:12000]
    return [
        {"role": "system", "content": ANSWER_SYSTEM},
        {"role": "user", "content": f"Question: {question}\n\nData rows (JSON):\n{payload}"},
    ]


def extract_messages(text_hint: str = ""):
    user = "Extract the worker fields from the attached document."
    if text_hint:
        user += f"\n\nExtracted text from the document:\n{text_hint[:6000]}"
    return [
        {"role": "system", "content": EXTRACT_SYSTEM},
        {"role": "user", "content": user},
    ]


# --- leaf quality grading from a photo ---------------------------------------
#
# The model is asked for a SUGGESTION, never a decision. Grade A pays a bonus
# per kilo, so an automatic grade would move money on a model's guess about a
# blurry photo taken at a field scale. It returns its confidence and what it
# actually saw, and the supervisor confirms.
_LEAF_GRADE_SYSTEM = """You grade plucked tea leaf from a photograph for a Bangladeshi tea estate.

The standard:
- Grade A = "two leaves and a bud": young, bright green, unbroken shoots, little or no coarse
  stem, no old dark leaf, no flowering shoots.
- Grade B = coarser pluck: three or more leaves, woody stem, older or dull leaf, banjhi
  (dormant, budless) shoots, visible damage, yellowing or disease spotting.

Rules you must follow:
- You are ADVISING a supervisor who will make the final call. Never state a grade as certain.
- If the photo is blurred, too dark, too far away, or does not clearly show plucked leaf,
  set grade to null and say so. A refusal is more useful than a guess.
- confidence is 0.0-1.0 and must honestly reflect the image quality, not your eagerness.
- Judge ONLY what is visible. Do not infer from what a tea estate usually produces.

Reply with STRICT JSON and nothing else:
{"grade": "A" | "B" | null,
 "confidence": 0.0,
 "observations": ["short factual things you can see in the image"],
 "concerns": ["anything that makes this hard to judge, or empty"]}"""


def leaf_grade_messages():
    return [
        {"role": "system", "content": _LEAF_GRADE_SYSTEM},
        {"role": "user", "content": "Grade the plucked leaf in this photograph."},
    ]


# --- leaf health assessment ---------------------------------------------------
#
# SEPARATE FROM PLUCK GRADING ON PURPOSE. This judges the CONDITION of the leaf;
# grading judges how it was PICKED. Only the pluck grade touches pay. Merging
# them would dock a worker's wage because the bush has a nitrogen problem.
#
# THE QUALITY GATE RUNS FIRST. A model asked "which disease is this?" will
# always name a disease -- including on a blurred photo of soil. Refusing is a
# correct outcome, not a failure, and it is recorded separately from predictions.
#
# THE CANDIDATE LIST MUST CONTAIN NON-DISEASE CAUSES. Without "nitrogen
# deficiency", "sun scorch", "water stress", "physical damage" and "healthy" as
# available answers, yellowing from under-fertilising gets reported as blight and
# somebody sprays fungicide at a soil problem.
_LEAF_HEALTH_SYSTEM = """You examine photographs of tea leaf for a Bangladeshi tea estate and report what you can see.

STEP 1 - QUALITY GATE. Before anything else, decide whether the photo can be judged at all.
Refuse if it is blurred, too dark, too far away to see leaf detail, or does not clearly show
tea leaf. Refusing is the CORRECT answer for a bad photo. Never guess a condition from an
image you cannot read.

STEP 2 - CANDIDATES. If the photo is usable, list UP TO THREE possible conditions, ranked,
each with a likelihood between 0 and 1. Never give a single certain verdict.
You MUST consider these non-disease explanations alongside any disease:
  healthy, nitrogen deficiency, other nutrient deficiency, sun scorch,
  water stress, physical damage, pest damage, red spider mite,
  blister blight, brown blight, grey blight, anthracnose, algal leaf spot
Yellowing is far more often under-fertilising than infection. Browning at the edges is far
more often sun or drought than blight. Say so when that is what you see.

STEP 3 - HEALTH SCORE. Give a score from 0 to 100 for the leaf's overall condition,
judged as severity multiplied by how much of the visible leaf is affected.
  90-100 healthy, 70-89 minor issues, 40-69 moderate, below 40 severe.
A leaf with a tiny spot on one edge is MINOR, not SEVERE.

RULES:
- You advise. A person decides. Never instruct anyone to treat anything.
- NEVER name a chemical, pesticide, fungicide, fertiliser product or any dosage.
  Recommending treatment is out of scope and dangerous from a photograph.
- Do not comment on how the leaf was plucked. That is judged separately.

Reply with STRICT JSON and nothing else:
{"usable": true,
 "refused_reason": null,
 "health_score": 0,
 "candidates": [{"condition": "", "likelihood": 0.0, "why": "what you can see that supports this"}],
 "observations": ["short factual things visible in the image"],
 "advice": "one sentence for the supervisor, no chemicals, no dosages"}

If the photo cannot be judged:
{"usable": false,
 "refused_reason": "blurred" | "too_dark" | "no_leaf" | "too_far",
 "health_score": null, "candidates": [], "observations": [],
 "advice": "what to do to take a usable photo"}"""


def leaf_health_messages():
    return [
        {"role": "system", "content": _LEAF_HEALTH_SYSTEM},
        {"role": "user", "content": "Examine the tea leaf in this photograph."},
    ]
