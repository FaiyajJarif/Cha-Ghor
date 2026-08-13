#!/usr/bin/env python3
"""Measure how good the leaf grader actually is.

WHY THIS EXISTS
---------------
The grader is NOT a trained model. It is a prompt describing the
two-leaves-and-a-bud standard, sent to a general-purpose vision model that has
never seen a Sylhet tea garden. Its accuracy on YOUR leaf is unknown until you
measure it, and an unmeasured AI feature is a claim, not a result.

This runs a folder of labelled photographs through POST /leaf-grade and prints
accuracy, a confusion matrix, and how well the model's stated confidence tracks
whether it was actually right.

USAGE
-----
Lay the images out one folder per grade:

    dataset/
      A/  img001.jpg  img002.jpg ...     <- two leaves and a bud
      B/  img101.jpg  img102.jpg ...     <- coarser pluck

Then:

    cd ai_service
    source .venv/bin/activate
    uvicorn main:app --port 8000 &          # the grader must be running
    python eval_leaf_grade.py dataset/

DATASETS WORTH TRYING
---------------------
* TeaLeafAgeQuality — 2,208 images from Malnicherra Tea Garden in SYLHET plus
  Sreemangal and Moulvibazar, i.e. the same region this system is built for.
    https://data.mendeley.com/datasets/7t964jmmy3/1
    https://www.kaggle.com/datasets/fahadbd/tealeafagequality
  It is labelled by leaf AGE (T1 1-2 days, T2 3-4, T3 5-7, T4 7+), not by pluck
  composition. A defensible mapping is T1+T2 -> A and T3+T4 -> B, but SAY that
  you mapped it -- the two standards are related, not identical, and pretending
  otherwise would overstate the result.

* High-Quality Tea-Making Leaf Classification — a good/bad split, closer to the
  A/B question this system asks.
    https://data.mendeley.com/datasets/vrbx9wrf3z/1

WHAT A HONEST RESULT LOOKS LIKE
-------------------------------
Report the number you get, including if it is poor. A 60% result on a real
dataset, reported plainly, is worth more in a project report than an untested
feature described as "AI-powered". If accuracy is low, the fix is few-shot
grounding -- put 3-4 reference photos of YOUR estate's Grade A and Grade B in
the prompt -- not a bigger claim.
"""

import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = os.getenv("LEAF_GRADE_URL", "http://127.0.0.1:8000/leaf-grade")
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
CLASSES = ("A", "B")


def grade_one(path):
    """Send one image. Returns (grade, confidence, error)."""
    with open(path, "rb") as fh:
        data = fh.read()
    ext = os.path.splitext(path)[1].lower()
    ct = "image/png" if ext == ".png" else "image/jpeg"
    body = json.dumps({
        "filename": os.path.basename(path),
        "content_type": ct,
        "data_base64": base64.b64encode(data).decode("ascii"),
    }).encode()
    req = urllib.request.Request(API, data=body,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            out = json.loads(resp.read())
        return out.get("grade"), float(out.get("confidence") or 0.0), None
    except urllib.error.HTTPError as e:
        return None, 0.0, f"HTTP {e.code}: {e.read()[:200].decode(errors='replace')}"
    except Exception as e:  # noqa: BLE001
        return None, 0.0, str(e)


def collect(root):
    """Every labelled image under root/<CLASS>/."""
    items = []
    for cls in CLASSES:
        d = os.path.join(root, cls)
        if not os.path.isdir(d):
            continue
        for name in sorted(os.listdir(d)):
            if os.path.splitext(name)[1].lower() in EXTS:
                items.append((os.path.join(d, name), cls))
    return items


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    root = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 0

    items = collect(root)
    if not items:
        print(f"No images found. Expected {root}/A/ and {root}/B/ with images inside.")
        sys.exit(1)
    if limit:
        # Interleave so a truncated run is not all one class.
        a = [i for i in items if i[1] == "A"][: limit // 2]
        b = [i for i in items if i[1] == "B"][: limit // 2]
        items = a + b

    # Fail fast if the service is not there. Printing 100 identical
    # "Connection refused" lines and then a table of zeroes wastes the run and
    # buries the one fact that matters: uvicorn is not running.
    health = API.rsplit("/", 1)[0] + "/health"
    try:
        urllib.request.urlopen(health, timeout=5).read()
    except Exception as e:  # noqa: BLE001
        print(f"The AI service is not answering at {API}\n")
        print(f"  {type(e).__name__}: {e}\n")
        print("Start it in a SEPARATE terminal and leave it running:")
        print("    cd ai_service && source .venv/bin/activate")
        print("    uvicorn main:app --port 8000")
        print("\nThen run this again in your first terminal. Do not Ctrl+C the")
        print("server first -- the eval calls it once per image.")
        sys.exit(1)

    print(f"Grading {len(items)} images through {API}\n")

    # confusion[true][predicted], plus an explicit "refused" column, because
    # "I cannot tell" is a distinct outcome from a wrong answer and must not be
    # silently scored as one.
    confusion = {t: {"A": 0, "B": 0, "refused": 0} for t in CLASSES}
    conf_right, conf_wrong = [], []
    errors = 0
    started = time.time()

    consecutive_errors = 0
    for i, (path, truth) in enumerate(items, 1):
        pred, conf, err = grade_one(path)
        if err:
            errors += 1
            consecutive_errors += 1
            # Five in a row means the service went away, not that five photos
            # were bad. Stop and say so while the partial result is still
            # worth reading.
            if consecutive_errors >= 5:
                print(f"\n  Stopped after {consecutive_errors} consecutive failures "
                      f"at image {i}.")
                print(f"  Last error: {err}")
                print("  The service is probably not running. Results below cover "
                      "only what was graded before it stopped.\n")
                break
            print(f"  [{i}/{len(items)}] {os.path.basename(path):<28} ERROR {err}")
            continue
        consecutive_errors = 0
        key = pred if pred in CLASSES else "refused"
        confusion[truth][key] += 1
        if pred in CLASSES:
            (conf_right if pred == truth else conf_wrong).append(conf)
        mark = "ok " if pred == truth else ("-- " if pred is None else "XX ")
        print(f"  [{i}/{len(items)}] {os.path.basename(path):<28} true={truth} "
              f"pred={pred or 'refused':<8} conf={conf:.2f} {mark}")

    graded = sum(confusion[t][p] for t in CLASSES for p in CLASSES)
    correct = sum(confusion[t][t] for t in CLASSES)
    refused = sum(confusion[t]["refused"] for t in CLASSES)
    total = graded + refused

    print("\n" + "=" * 62)
    print(f"{'':10}{'pred A':>10}{'pred B':>10}{'refused':>10}")
    for t in CLASSES:
        r = confusion[t]
        print(f"true {t:<5}{r['A']:>10}{r['B']:>10}{r['refused']:>10}")

    print("\nresults")
    if graded:
        print(f"  accuracy on graded images : {correct}/{graded} = {100*correct/graded:.1f}%")
    else:
        print("  accuracy on graded images : n/a (it graded nothing)")
    if total:
        print(f"  refused to grade          : {refused}/{total} = {100*refused/total:.1f}%")
    if errors:
        print(f"  request errors            : {errors}")

    # Per-class recall: an overall number hides a model that just always says A.
    for t in CLASSES:
        n = sum(confusion[t].values())
        if n:
            print(f"  recall on true {t}          : {confusion[t][t]}/{n} = {100*confusion[t][t]/n:.1f}%")

    # Is the confidence worth anything? If right and wrong answers carry the
    # same confidence, the number is decoration and should not be shown to a
    # supervisor as though it means something.
    if conf_right and conf_wrong:
        ar = sum(conf_right) / len(conf_right)
        aw = sum(conf_wrong) / len(conf_wrong)
        print(f"\n  mean confidence when right: {ar:.2f}")
        print(f"  mean confidence when wrong: {aw:.2f}")
        if ar - aw < 0.05:
            print("  -> confidence does NOT separate right from wrong. Treat it as noise.")
        else:
            print("  -> confidence is somewhat informative.")

    baseline = max(sum(confusion[t].values()) for t in CLASSES) / total if total else 0
    print(f"\n  always-guess-the-common-class baseline: {100*baseline:.1f}%")
    print("  A result near that baseline means the grader is not reading the leaf.")
    print(f"\n  {time.time()-started:.0f}s elapsed")


if __name__ == "__main__":
    main()
