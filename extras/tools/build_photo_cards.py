# -*- coding: utf-8 -*-
"""Landing / Features card images: the uploaded photographs, unmodified apart
from the crop each box needs.

No overlays, no scrims, no text. Earlier revisions composited brand chips onto
these; that is gone. Each slot gets a different source-and-gravity pair so no
two cards on a page show the same framing.
"""
import os, subprocess

SRC = "/sessions/great-stoic-curie/mnt/Cha-Ghor/chaghor/extras/images"
DST = "/sessions/great-stoic-curie/mnt/Cha-Ghor/chaghor/frontend/public/features"
W, H = 560, 244          # 2.30 - matches Landing.jsx's h-40 card exactly

def shot(src, gravity, out, w=W, h=H, q="88"):
    r = subprocess.run(["convert", f"{SRC}/{src}", "-auto-orient",
                        "-resize", f"{w}x{h}^", "-gravity", gravity,
                        "-crop", f"{w}x{h}+0+0", "+repage",
                        "-strip", "-quality", q, f"{DST}/{out}"],
                       capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr)

SLOTS = [
    ("workforce",  "chabagan1.jpeg", "center"),
    ("attendance", "chabagan1.jpeg", "east"),
    ("leaf",       "chabagan4.jpg",  "south"),
    ("payroll",    "chabagan2.jpeg", "center"),
    ("fields",     "chabagan3.jpeg", "center"),
    ("inventory",  "chabagan2.jpeg", "west"),   # chabagan3/north was mostly blank sky
    ("supply",     "chabagan2.jpeg", "east"),
    ("finance",    "chabagan4.jpg",  "north"),
    ("loans",      "chabagan1.jpeg", "west"),
    ("weather",    "chabagan2.jpeg", "north"),
    ("broadcast",  "chabagan3.jpeg", "south"),
    ("reports",    "chabagan2.jpeg", "south"),
    ("chabot",     "chabagan4.jpg",  "west"),
]
for name, src, grav in SLOTS:
    shot(src, grav, name + ".jpg")

shot("chabagan4.jpg",  "center", "hero.jpg",  900, 450)
shot("chabagan2.jpeg", "center", "about.jpg", 547, 252)

tot = 0
print("built (no overlays):")
for n, *_ in SLOTS + [("hero",), ("about",)]:
    k = os.path.getsize(f"{DST}/{n}.jpg") / 1024; tot += k
    print(f"  {n + '.jpg':18} {k:5.0f} KB")
print(f"  {'TOTAL':18} {tot:5.0f} KB")
