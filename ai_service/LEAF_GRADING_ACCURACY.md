# Leaf grading — measured accuracy

**Run date:** 7 August 2026
**Result: the grader does not work. It is not used to set a grade.**

## What was measured

`eval_leaf_grade.py dataset/ 100` sent 100 labelled photographs to
`POST /leaf-grade` (Ollama, `qwen2.5vl-leaf`) and compared the answer to the
label. 97 came back graded, 1 was refused, 2 were request errors.

**Dataset:** TeaLeafAgeQuality — 2,208 photographs from Malnicherra Tea Garden
in Sylhet, plus Sreemangal and Moulvibazar. The same region this system is
built for. Kaggle ships it in YOLO detection format with four age classes;
`prep_leaf_dataset.py` reads each image's label file, takes the majority class,
and maps:

| age class | | grade |
|---|---|---|
| `1-2 Days`, `3-4 Days` | → | **A** |
| `5-7 Days`, `7+ Days` | → | **B** |

Prepared: **1,167 A / 1,028 B** (53% / 47%). 10 images had no label file and
were left out rather than guessed at.

**This mapping is a proxy and must be reported as one.** The dataset labels leaf
*age*; Cha Ghor grades *pluck composition* (two leaves and a bud). They are
related — older leaf is coarser — but they are not the same standard.

## The numbers

```
              pred A    pred B   refused
true A            48         2         0
true B            40         7         1

accuracy on graded images : 55/97 = 56.7%
recall on true A          : 48/50 = 96.0%
recall on true B          :  7/48 = 14.6%
mean confidence when right: 0.96
mean confidence when wrong: 0.96
always-guess-A baseline   : 51.0%
```

## What that means

**It answers A on 91% of photographs when 51% are A.** It is close to an
always-say-A machine. Recall on grade B is 14.6% — it missed 40 of the 48
coarse-pluck images.

**56.7% against a 51% baseline is not a real improvement.** Under the null
hypothesis that the grader is no better than always guessing A, the chance of
scoring 55 or more correct out of 97 is **p = 0.153**. That is nowhere near
significance. On this evidence the grader cannot be claimed to beat guessing.

**The confidence figure is noise.** 0.96 when right, 0.96 when wrong. It
separates nothing.

## Why this mattered enough to change the code

Grade-A kilos pay a **৳1/kg bonus** in `PayrollService.recompute()`. The weigh-in
drawer used to *pre-select* the suggested grade. A model biased this hard toward
A, pre-filling A, in front of a supervisor working through a queue of workers,
would put bonus money on the payroll that the leaf did not earn. That is a
wage-accuracy bug reached through an AI feature.

**Changed (7 Aug 2026):**

- `LeafWeighInDrawer.jsx` — the suggestion is **displayed, never applied**. The
  suggested button gets a dotted outline and the caption "photo suggests B —
  you decide". No grade is recorded until the supervisor taps one.
- `LeafAiPanel.jsx` — the confidence percentage is **no longer shown for a
  grade**. It is still shown for a refusal, where it describes something else
  (is this even leaf on a scale) and is cheap to check by eye.
- `eval_leaf_grade.py` — pre-flight health check, and aborts after five
  consecutive failures instead of printing 100 identical connection errors.

The photo itself is unaffected and remains the more valuable half of the
feature: it is evidence of the bulk that was handed in, attached to the row, so
a disputed weigh-in can be looked at instead of argued about.

## What would actually improve it

In rough order of expected return:

1. **Few-shot grounding.** Put 3–4 reference photographs of *this estate's*
   grade A and grade B into the prompt. The model has never seen a Sylhet
   garden; a written description of "two leaves and a bud" is doing all the
   work right now.
2. **Fix the class imbalance in the prompt.** The model has an obvious prior
   toward "this looks fine". Asking it to justify a B before allowing an A, or
   asking for a coarseness score rather than a letter, may separate the classes
   better than the current direct-letter question.
3. **Train a small classifier.** `vision_inference` accumulates
   `supervisor_verdict` and `corrected_grade` from the review buttons on every
   photo. That is a labelled set of *your own* leaf, growing from work someone
   was doing anyway. A few hundred rows would beat prompting a general model.
4. **Re-measure after each change** with this script, on the same dataset, and
   record the number here. An unmeasured change is not an improvement.

## Reproducing

Two terminals. The service must stay up — the eval calls it once per image.

```bash
# terminal 1 — leave running, no --reload
cd ai_service && source .venv/bin/activate
uvicorn main:app --port 8000

# terminal 2
cd ai_service && source .venv/bin/activate
python prep_leaf_dataset.py ~/Downloads/tealeafagequality dataset/
python eval_leaf_grade.py dataset/ 100
```

Set `ROUTE_LEAF_GRADE=ollama` in `ai_service/.env` first. Against Gemini's free
tier the 20/day cap is exhausted after roughly ten images and the rest of the
run collects 429s. 100 images through local Ollama took **2,495 seconds** (~42
minutes) on an M-series MacBook Air.
