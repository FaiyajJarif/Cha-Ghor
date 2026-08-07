#!/usr/bin/env python3
"""Turn a downloaded tea-leaf dataset into the A/B layout the eval expects.

WHY THIS EXISTS
---------------
eval_leaf_grade.py wants:

    dataset/A/...   two leaves and a bud
    dataset/B/...   coarser pluck

Nothing ships in that shape. This handles the two layouts these datasets
actually come in:

1. YOLO DETECTION (what Kaggle's TeaLeafAgeQuality actually is)

       data.yaml                 names: ['1-2 Days','3-4 Days','5-7 Days','7+ Days']
       train/images/*.jpg
       train/labels/*.txt        "<class> <x> <y> <w> <h>" per box
       valid/... test/...

   The class is in the LABEL FILE, not the folder name. Each image is
   classified by the majority class across its boxes.

2. FOLDER-PER-CLASS (the Mendeley release, and most good/bad splits)

       T1/ T2/ T3/ T4/     or    high-quality/ low-quality/

   The class is the folder name.

The format is detected automatically. An earlier version of this script only
understood layout 2 and reported "Nothing matched" on the Kaggle download,
which is the more common one.

THE MAPPING, AND WHY IT IS AN APPROXIMATION
-------------------------------------------
    1-2 days, 3-4 days   ->  A     young shoots, close to two-leaves-and-a-bud
    5-7 days, 7+ days    ->  B     older leaf, coarser pluck

These are RELATED but NOT THE SAME standard. Leaf age is how long since the
last pluck; pluck grade is what the plucker's hand actually took. A young leaf
can still be badly plucked, and a skilled plucker can take a good shoot off an
older bush.

SAY THIS IN YOUR REPORT. An accuracy figure from this mapping measures
"agreement with an age-derived proxy for pluck grade", not "grading accuracy".
Presenting it as the latter overstates the result, and it is the first thing an
examiner will probe.

Copies rather than moves by default, so the download stays intact.

USAGE
-----
    python prep_leaf_dataset.py <downloaded-folder> [output-folder] [flags]

    python prep_leaf_dataset.py ~/Downloads/TeaLeafAgeQuality dataset --dry-run
    python prep_leaf_dataset.py ~/Downloads/TeaLeafAgeQuality dataset

    flags:  --dry-run   report only, write nothing
            --move      move instead of copy
            --split X   YOLO only: use just train / valid / test

Then:
    python eval_leaf_grade.py dataset/
"""

import os
import re
import shutil
import sys
from collections import Counter

EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

# Class-name / folder-name patterns -> pluck grade. First match wins.
#
# Applied to BOTH the folder name (layout 2) and the class name read out of
# data.yaml (layout 1), so one table covers both. Written as patterns because
# these datasets are published with inconsistent naming: "T1", "t1_1-2days",
# "1-2 Days".
RULES = [
    (r"\bt1\b|1\s*[-_ ]\s*2\s*day", "A", "1-2 days"),
    (r"\bt2\b|3\s*[-_ ]\s*4\s*day", "A", "3-4 days"),
    (r"\bt3\b|5\s*[-_ ]\s*7\s*day", "B", "5-7 days"),
    (r"\bt4\b|7\s*\+|\bolder\b", "B", "7+ days"),
    (r"high[-_ ]?quality|\bgood\b|\bfresh\b", "A", "good / high quality"),
    (r"low[-_ ]?quality|\bbad\b|\bpoor\b|\bcoarse\b", "B", "bad / low quality"),
]


def classify(text):
    """Return (grade, label) for a class name or folder name."""
    hay = str(text).lower()
    for pattern, grade, label in RULES:
        if re.search(pattern, hay):
            return grade, label
    return None, None


# ---------------------------------------------------------------- data.yaml


def read_class_names(src):
    """Class names from data.yaml, in index order. None if not a YOLO set."""
    path = None
    for cand in ("data.yaml", "data.yml"):
        p = os.path.join(src, cand)
        if os.path.isfile(p):
            path = p
            break
    if not path:
        return None

    text = open(path, encoding="utf-8", errors="replace").read()
    try:
        import yaml  # optional
        names = yaml.safe_load(text).get("names")
        if isinstance(names, dict):  # {0: 'a', 1: 'b'}
            names = [names[k] for k in sorted(names)]
        if names:
            return [str(n) for n in names]
    except Exception:
        pass

    # No PyYAML, or a shape it choked on. The names line is simple enough to
    # read directly, and a missing optional dependency should not stop this.
    m = re.search(r"^names\s*:\s*\[(.+?)\]", text, re.M | re.S)
    if m:
        return [s.strip().strip("'\"") for s in m.group(1).split(",") if s.strip()]
    block = re.search(r"^names\s*:\s*\n((?:\s+-\s*.+\n?)+)", text, re.M)
    if block:
        return [ln.strip().lstrip("-").strip().strip("'\"")
                for ln in block.group(1).splitlines() if ln.strip()]
    return None


def label_path_for(image_path):
    """The YOLO label file beside an image: .../images/x.jpg -> .../labels/x.txt"""
    d, name = os.path.split(image_path)
    stem = os.path.splitext(name)[0]
    parent, leaf = os.path.split(d)
    if leaf.lower() == "images":
        cand = os.path.join(parent, "labels", stem + ".txt")
        if os.path.isfile(cand):
            return cand
    # Some exports drop labels beside the image instead.
    cand = os.path.join(d, stem + ".txt")
    return cand if os.path.isfile(cand) else None


def image_class(label_file):
    """Majority class index in a YOLO label file, or None.

    Ties are broken by total box AREA, because the biggest thing in frame is
    what a grader would be looking at. If area cannot separate them either,
    the image is left unclassified rather than guessed at -- a 50/50 image is
    genuinely ambiguous and putting it in a test set as a confident label is
    how a benchmark quietly becomes wrong.
    """
    counts, area = Counter(), Counter()
    try:
        for line in open(label_file, encoding="utf-8", errors="replace"):
            parts = line.split()
            if len(parts) < 5:
                continue
            try:
                cid = int(float(parts[0]))
                w, h = float(parts[3]), float(parts[4])
            except ValueError:
                continue
            counts[cid] += 1
            area[cid] += w * h
    except OSError:
        return None
    if not counts:
        return None  # empty label file = a background image, no class

    top = max(counts.values())
    tied = [c for c, n in counts.items() if n == top]
    if len(tied) == 1:
        return tied[0]
    best_area = max(area[c] for c in tied)
    by_area = [c for c in tied if area[c] == best_area]
    return by_area[0] if len(by_area) == 1 else None


# ---------------------------------------------------------------- collection


def collect_yolo(src, names, only_split=None):
    """[(image_path, grade, label, flat_name)] using the label files."""
    grade_of, label_of, unmapped = {}, {}, []
    for i, n in enumerate(names):
        g, lbl = classify(n)
        if g:
            grade_of[i], label_of[i] = g, f"{n} -> {g}"
        else:
            unmapped.append(f"[{i}] {n}")

    out, no_label, ambiguous, skipped_class = [], 0, 0, 0
    for root, _dirs, files in os.walk(src):
        if os.path.basename(root).lower() != "images":
            continue
        split = os.path.basename(os.path.dirname(root))
        if only_split and split.lower() != only_split.lower():
            continue
        for name in sorted(files):
            if os.path.splitext(name)[1].lower() not in EXTS:
                continue
            img = os.path.join(root, name)
            lab = label_path_for(img)
            if not lab:
                no_label += 1
                continue
            cid = image_class(lab)
            if cid is None:
                ambiguous += 1
                continue
            if cid not in grade_of:
                skipped_class += 1
                continue
            out.append((img, grade_of[cid], label_of[cid], f"{split}_{name}"))
    return out, {"no_label": no_label, "ambiguous": ambiguous,
                 "unmapped_class": skipped_class, "unmapped_names": unmapped}


def collect_folders(src):
    """[(image_path, grade, label, flat_name)] using folder names."""
    out, skipped = [], 0
    for root, _dirs, files in os.walk(src):
        rel = os.path.relpath(root, src)
        parts = [] if rel == "." else rel.split(os.sep)
        grade, label = classify(" ".join(parts))
        for name in sorted(files):
            if os.path.splitext(name)[1].lower() not in EXTS:
                continue
            if grade is None:
                skipped += 1
                continue
            flat = ("_".join(parts) + "_" + name).lstrip("_")
            out.append((os.path.join(root, name), grade, label, flat))
    return out, {"unclassified_folder": skipped}


# ---------------------------------------------------------------- main


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    src = os.path.abspath(args[0])
    out = os.path.abspath(args[1] if len(args) > 1 else "dataset")
    dry = "--dry-run" in sys.argv
    move = "--move" in sys.argv
    only_split = None
    if "--split" in sys.argv:
        i = sys.argv.index("--split")
        if i + 1 < len(sys.argv):
            only_split = sys.argv[i + 1]

    if not os.path.isdir(src):
        print(f"Not a folder: {src}")
        sys.exit(1)

    names = read_class_names(src)
    if names:
        print(f"detected: YOLO detection dataset, {len(names)} classes from data.yaml")
        for i, n in enumerate(names):
            g, _ = classify(n)
            print(f"          [{i}] {n:<16} -> {g or 'unmapped'}")
        items, notes = collect_yolo(src, names, only_split)
        mode = "yolo"
    else:
        print("detected: folder-per-class dataset")
        items, notes = collect_folders(src)
        mode = "folders"

    counts, reasons = Counter(), {}
    for _img, grade, label, _flat in items:
        counts[grade] += 1
        reasons.setdefault(label, Counter())[grade] += 1

    print(f"\nsource : {src}")
    print(f"output : {out}{'   (dry run, nothing written)' if dry else ''}")
    if only_split:
        print(f"split  : {only_split} only")
    print()
    print(f"{'class':<26}{'-> A':>8}{'-> B':>8}")
    print("-" * 42)
    for label in sorted(reasons):
        c = reasons[label]
        print(f"{label:<26}{c['A']:>8}{c['B']:>8}")
    print("-" * 42)
    print(f"{'total':<26}{counts['A']:>8}{counts['B']:>8}")

    total = counts["A"] + counts["B"]
    if total == 0:
        print("\nNothing was classified.")
        if mode == "yolo":
            print("  The class names in data.yaml did not match any rule. They were:")
            for n in notes.get("unmapped_names", []):
                print(f"    {n}")
            print("  Add a pattern to RULES at the top of this file.")
        else:
            print("  No folder name matched a rule, and there is no data.yaml, so this")
            print("  is not a YOLO set either. Sort into A/ and B/ by hand, or add a")
            print("  pattern to RULES.")
        sys.exit(1)

    if not dry:
        for img, grade, _label, flat in items:
            dest_dir = os.path.join(out, grade)
            os.makedirs(dest_dir, exist_ok=True)
            dest = os.path.join(dest_dir, flat)
            (shutil.move if move else shutil.copy2)(img, dest)

    # Class balance decides what a result even means. On a 90/10 split, 90%
    # accuracy is the do-nothing baseline -- eval_leaf_grade.py prints that too.
    bigger = max(counts.values()) / total
    print(f"\nclass balance: {100*counts['A']/total:.0f}% A / {100*counts['B']/total:.0f}% B")
    if bigger > 0.65:
        print(f"  WARNING: imbalanced. Always guessing the common class scores "
              f"{100*bigger:.0f}%.\n  Compare any result against that baseline, not against zero.")

    dropped = [(k, v) for k, v in notes.items()
               if isinstance(v, int) and v > 0]
    if dropped:
        print("\nnot included:")
        explain = {
            "no_label": "image had no matching label file",
            "ambiguous": "boxes split evenly between classes, too ambiguous to label",
            "unmapped_class": "class index is not one this script maps to A or B",
            "unclassified_folder": "folder name matched no rule",
        }
        for k, v in dropped:
            print(f"  {v:>6}  {explain.get(k, k)}")
        print("  These were left out rather than guessed at.")

    print("\nREMEMBER FOR THE WRITE-UP: this maps leaf AGE onto pluck GRADE.")
    print("They are related, not identical. Report the number as agreement with")
    print("an age-derived proxy, not as grading accuracy.")
    print(f"\nNext:  python eval_leaf_grade.py {out}/")


if __name__ == "__main__":
    main()
