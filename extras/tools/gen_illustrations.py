# -*- coding: utf-8 -*-
"""Original illustrations for the Cha Ghor landing page.

Flat vector, drawn from scratch in the site's own palette (tailwind cg.* tokens),
so nothing here carries a third-party licence. Every file shares the same
layered-hill horizon so the set reads as one family rather than clip-art.
"""
import os, math

OUT = "/sessions/great-stoic-curie/mnt/Cha-Ghor/chaghor/frontend/public/features"
os.makedirs(OUT, exist_ok=True)

INK   = "#0b3328"
DARK  = "#14493B"
MID   = "#256b52"
GREEN = "#3f8f43"
LIME  = "#C0F28B"
LLIM  = "#D3FFAC"
PALE  = "#F4FFE9"
CREAM = "#FFFDF5"
PINK  = "#E2136E"
GOLD  = "#F2C14E"


def defs(extra=""):
    return f"""<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="{PALE}"/><stop offset="100%" stop-color="{LLIM}"/>
    </linearGradient>
    <linearGradient id="skyDark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="{MID}"/><stop offset="100%" stop-color="{INK}"/>
    </linearGradient>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="{PALE}"/>
    </linearGradient>
    {extra}
  </defs>"""


def ridge(w, y, amp, fill, phase=0.0, opacity=1.0, h=600):
    """One tea-hill ridge across the full width, closed to the bottom."""
    pts = []
    n = 7
    for i in range(n + 1):
        x = w * i / n
        yy = y + amp * math.sin(phase + i * 1.15) + amp * 0.35 * math.cos(phase * 1.7 + i * 2.1)
        pts.append((x, yy))
    d = f"M0,{h} L0,{pts[0][1]:.1f} "
    for i in range(n):
        x0, y0 = pts[i]; x1, y1 = pts[i + 1]
        cx = (x0 + x1) / 2
        d += f"C{cx:.1f},{y0:.1f} {cx:.1f},{y1:.1f} {x1:.1f},{y1:.1f} "
    d += f"L{w},{h} Z"
    return f'<path d="{d}" fill="{fill}" opacity="{opacity}"/>'


def ridge_path(w, y, amp, phase, h):
    """The bare curve of a ridge (no closing) - reused for terrace contours."""
    pts, n = [], 7
    for i in range(n + 1):
        x = w * i / n
        yy = y + amp * math.sin(phase + i * 1.15) + amp * 0.35 * math.cos(phase * 1.7 + i * 2.1)
        pts.append((x, yy))
    d = f"M0,{pts[0][1]:.1f} "
    for i in range(n):
        x0, y0 = pts[i]; x1, y1 = pts[i + 1]
        cx = (x0 + x1) / 2
        d += f"C{cx:.1f},{y0:.1f} {cx:.1f},{y1:.1f} {x1:.1f},{y1:.1f} "
    return d


def terraces(w, y, amp, phase, h, rows=7, col="#0b3328", step=13, op=0.16):
    """Contour lines following the hill - the terraced look of a real tea garden.

    The first pass drew scattered dark ellipses, which rendered as a band of
    black dots rather than as planting rows. Contours read correctly at any size.
    """
    out = []
    for r in range(rows):
        d = ridge_path(w, y + 10 + r * step, amp * (1 - r * 0.04), phase, h)
        out.append(f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{2.0 + r*0.25:.1f}" '
                   f'opacity="{op:.2f}" stroke-linecap="round"/>')
    return "".join(out)


def plucker(x, y, s_, cloth=CREAM, hat=LIME, basket="#9a7444", accent=PINK, skin="#6b4a32"):
    """A tea plucker: basket on the back, conical hat, one arm up to the bush.

    The cloth is light on purpose. Earlier versions used the dark brand green,
    which disappeared into the hills and left only the brown basket visible, so
    the figures read as floating slabs rather than people.
    """
    return f"""<g transform="translate({x},{y}) scale({s_})">
      <path d="M-16,-14 q-5,-20 1,-30 l12,-3 q7,12 4,33 Z" fill="{basket}"/>
      <path d="M-15,-44 q9,-3 13,-3" stroke="{basket}" stroke-width="2.6" fill="none"/>
      <path d="M-9,0 L9,0 L5,-30 L-3,-30 Z" fill="{cloth}"/>
      <path d="M-3,-30 q-1,-14 5,-16 q8,2 7,16 Z" fill="{cloth}"/>
      <path d="M-3,-21 L9,-25" stroke="{accent}" stroke-width="3" stroke-linecap="round"/>
      <path d="M-7,-4 L7,-4" stroke="{accent}" stroke-width="2.4" opacity=".8"/>
      <circle cx="4" cy="-52" r="6.6" fill="{skin}"/>
      <path d="M-5,-55 L13,-55 L4,-68 Z" fill="{hat}"/>
      <path d="M-6,-55 L14,-55" stroke="{hat}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M9,-42 q11,-3 14,-12" stroke="{cloth}" stroke-width="3.8"
            fill="none" stroke-linecap="round"/>
    </g>"""


def leafmark(x, y, s, fill=GREEN, vein="#ffffff", op=1.0):
    return f"""<g transform="translate({x},{y}) scale({s})" opacity="{op}">
      <path d="M-42,42 C-56,-8 -18,-46 40,-46 C42,6 8,44 -42,42 Z" fill="{fill}"/>
      <path d="M-40,40 C-6,10 16,-12 38,-44" stroke="{vein}" stroke-width="4" fill="none" opacity=".75"/>
      <path d="M-18,30 l14,-22 M-2,20 l16,-24 M12,10 l14,-22" stroke="{vein}" stroke-width="2.4"
            fill="none" opacity=".5"/>
    </g>"""


def svg(w, h, body, extra_defs=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'
            + defs(extra_defs) + body + "</svg>")


def write(name, s):
    p = os.path.join(OUT, name)
    open(p, "w").write(s)
    print(f"{name:22} {len(s):6d} bytes")


# ------------------------------------------------------------------ 1. HERO
W, H = 1200, 600
b = [f'<rect width="{W}" height="{H}" fill="url(#sky)"/>']
b.append(f'<circle cx="930" cy="150" r="74" fill="{GOLD}" opacity=".35"/>')
b.append(f'<circle cx="930" cy="150" r="48" fill="{GOLD}" opacity=".55"/>')
for i, (yy, amp, col, op) in enumerate([(250, 34, LIME, .55), (300, 40, "#8fd36a", .55),
                                        (350, 34, GREEN, .8), (410, 30, MID, .95), (470, 26, DARK, 1)]):
    b.append(ridge(W, yy, amp, col, phase=i * 1.3, opacity=op, h=H))
b.append(terraces(W, 470, 26, 4 * 1.3, H, rows=8, col=INK, step=15, op=0.13))
b.append(plucker(212, 512, 1.9))
b.append(plucker(338, 534, 1.55))
b.append(plucker(96, 546, 1.3))
for bx, by in ((700, 120), (742, 104), (778, 126)):
    b.append(f'<path d="M{bx},{by} q9,-8 18,0 q9,-8 18,0" stroke="{DARK}" stroke-width="2.6" '
             f'fill="none" opacity=".45" stroke-linecap="round"/>')
b.append(leafmark(1070, 470, 1.25, LIME, DARK, .5))
write("hero.svg", svg(W, H, "".join(b)))

# ----------------------------------------------------------------- 2. ABOUT
W, H = 1000, 460
b = [f'<rect width="{W}" height="{H}" fill="url(#skyDark)"/>']
b.append(f'<circle cx="150" cy="96" r="60" fill="{LIME}" opacity=".16"/>')
for i, (yy, amp, col, op) in enumerate([(210, 28, GREEN, .35), (262, 30, MID, .55), (318, 26, DARK, .9)]):
    b.append(ridge(W, yy, amp, col, phase=i * 1.6, opacity=op, h=H))
b.append(terraces(W, 318, 26, 2 * 1.6, H, rows=7, col="#000000", step=15, op=0.16))
b.append(leafmark(760, 200, 2.1, LIME, DARK, .9))
b.append(plucker(196, 402, 1.75, CREAM, LIME))
b.append(plucker(310, 420, 1.4, CREAM, LLIM))
write("about.svg", svg(W, H, "".join(b)))


# ------------------------------------------- shared card frame for features
FW, FH = 800, 360
def feature(inner, top=LLIM):
    b = [f'<rect width="{FW}" height="{FH}" fill="{PALE}"/>',
         f'<rect width="{FW}" height="{FH}" fill="{top}" opacity=".5"/>']
    for i, (yy, amp, col, op) in enumerate([(215, 22, LIME, .7), (255, 24, GREEN, .55), (295, 20, MID, .8)]):
        b.append(ridge(FW, yy, amp, col, phase=i * 1.5, opacity=op, h=FH))
    b.append(terraces(FW, 295, 20, 2 * 1.5, FH, rows=6, col=INK, step=13, op=0.13))
    b.append(inner)
    return svg(FW, FH, "".join(b))


# ------------------------------------------- 3. WORKFORCE & ATTENDANCE
g = [f'<g transform="translate(400,168)">',
     f'<rect x="-150" y="-104" width="300" height="196" rx="18" fill="url(#card)" stroke="{GREEN}" stroke-width="3"/>',
     f'<rect x="-150" y="-104" width="300" height="34" rx="18" fill="{DARK}"/>',
     f'<rect x="-150" y="-88" width="300" height="18" fill="{DARK}"/>',
     f'<text x="-132" y="-81" font-family="Helvetica,Arial" font-size="17" font-weight="bold" fill="{LIME}">ATTENDANCE</text>']
for i, st in enumerate(["p", "p", "l", "p"]):
    yy = -50 + i * 34
    col = GOLD if st == "l" else GREEN
    g.append(f'<circle cx="-118" cy="{yy}" r="12" fill="{col}" opacity=".22"/>')
    g.append(f'<circle cx="-118" cy="{yy}" r="7" fill="{col}"/>')
    g.append(f'<rect x="-96" y="{yy-7}" width="{120 - i*14}" height="9" rx="4.5" fill="{DARK}" opacity=".5"/>')
    g.append(f'<rect x="{96}" y="{yy-9}" width="38" height="18" rx="9" fill="{col}" opacity=".18"/>')
    g.append(f'<path d="M{104},{yy} l6,7 l14,-16" stroke="{col}" stroke-width="3.4" fill="none" '
             f'stroke-linecap="round" stroke-linejoin="round"/>')
g.append("</g>")
g.append(plucker(104, 322, 1.7))
g.append(plucker(706, 332, 1.45))
write("workforce.svg", feature("".join(g)))

# ------------------------------------------- 4. LEAF COLLECTION & GRADING
g = [leafmark(330, 150, 2.3, GREEN, PALE)]
g.append(f'<circle cx="470" cy="118" r="62" fill="none" stroke="{DARK}" stroke-width="9" opacity=".85"/>')
g.append(f'<circle cx="470" cy="118" r="62" fill="{LIME}" opacity=".16"/>')
g.append(f'<path d="M516,162 l44,44" stroke="{DARK}" stroke-width="13" stroke-linecap="round" opacity=".85"/>')
for i, (lab, col) in enumerate([("A", GREEN), ("B", GOLD), ("C", "#b06a4a")]):
    x = 560 + i * 74
    g.append(f'<rect x="{x}" y="232" width="60" height="44" rx="12" fill="{"#ffffff" if i else GREEN}" '
             f'stroke="{col}" stroke-width="3"/>')
    g.append(f'<text x="{x+30}" y="264" font-family="Helvetica,Arial" font-size="26" font-weight="bold" '
             f'text-anchor="middle" fill="{"#ffffff" if i==0 else col}">{lab}</text>')
g.append(f'<text x="590" y="212" font-family="Helvetica,Arial" font-size="15" font-weight="bold" fill="{DARK}" '
         f'opacity=".65">GRADE</text>')
write("leaf.svg", feature("".join(g)))

# ------------------------------------------- 5. WAGE & PAYROLL
g = [f'<g transform="translate(330,170)">',
     f'<rect x="-120" y="-116" width="240" height="228" rx="14" fill="url(#card)" stroke="{GREEN}" stroke-width="3"/>',
     f'<rect x="-120" y="-116" width="240" height="30" rx="14" fill="{DARK}"/>',
     f'<rect x="-120" y="-102" width="240" height="16" fill="{DARK}"/>',
     f'<text x="-104" y="-95" font-family="Helvetica,Arial" font-size="15" font-weight="bold" fill="{LIME}">PAYSLIP</text>']
for i, wdt in enumerate([160, 130, 150, 110]):
    yy = -64 + i * 26
    g.append(f'<rect x="-100" y="{yy}" width="{wdt}" height="8" rx="4" fill="{DARK}" opacity=".35"/>')
g.append(f'<line x1="-100" y1="52" x2="100" y2="52" stroke="{GREEN}" stroke-width="2" opacity=".5"/>')
g.append(f'<rect x="-100" y="64" width="86" height="12" rx="6" fill="{DARK}" opacity=".5"/>')
g.append(f'<rect x="28" y="62" width="72" height="18" rx="9" fill="{GREEN}"/>')
g.append("</g>")
for i, (cx, cy, r) in enumerate([(560, 210, 42), (632, 232, 34), (596, 148, 28)]):
    g.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{GOLD}"/>')
    g.append(f'<circle cx="{cx}" cy="{cy}" r="{r-6}" fill="none" stroke="#ffffff" stroke-width="2.6" opacity=".7"/>')
    # The Taka sign was a <text> glyph and renders as an empty box wherever the
    # font is missing (it did, in every renderer I checked). Drawn as paths it
    # is identical everywhere.
    k = r / 42.0
    g.append(f'<g stroke="{INK}" stroke-width="{4.2*k:.1f}" fill="none" opacity=".75" '
             f'stroke-linecap="round">'
             f'<path d="M{cx-12*k:.1f},{cy-14*k:.1f} q{13*k:.1f},0 {13*k:.1f},{12*k:.1f} l0,{16*k:.1f}"/>'
             f'<path d="M{cx-15*k:.1f},{cy+2*k:.1f} l{22*k:.1f},0"/>'
             f'<path d="M{cx+1*k:.1f},{cy+14*k:.1f} l{10*k:.1f},0"/></g>')
write("payroll.svg", feature("".join(g)))

# ------------------------------------------- 6. FIELDS & ZONAL MANAGEMENT
g = [f'<g transform="translate(400,176) rotate(-7)">']
plots = [(-190, -80, 150, 82, LIME), (-30, -80, 120, 82, LLIM), (100, -80, 96, 82, GREEN),
         (-190, 10, 110, 78, GREEN), (-70, 10, 140, 78, LIME), (80, 10, 116, 78, LLIM)]
for (x, yy, wdt, hgt, col) in plots:
    g.append(f'<rect x="{x}" y="{yy}" width="{wdt}" height="{hgt}" rx="9" fill="{col}" '
             f'stroke="{DARK}" stroke-width="2.6" opacity=".92"/>')
    for k in range(4):
        g.append(f'<line x1="{x+10}" y1="{yy+16+k*16}" x2="{x+wdt-10}" y2="{yy+16+k*16}" '
                 f'stroke="{DARK}" stroke-width="1.6" opacity=".22"/>')
g.append("</g>")
for (px, py) in ((300, 118), (470, 150), (392, 236)):
    g.append(f'<path d="M{px},{py} c-17,-20 -17,-38 0,-38 c17,0 17,18 0,38 Z" fill="{PINK}"/>')
    g.append(f'<circle cx="{px}" cy="{py-24}" r="7" fill="#ffffff"/>')
write("fields.svg", feature("".join(g)))

# ------------------------------------------- 7. LOANS & ADVANCES
g = [f'<g transform="translate(360,180)">']
for i, hgt in enumerate([104, 82, 60, 38, 18]):
    x = -170 + i * 52
    col = GREEN if i < 4 else LIME
    g.append(f'<rect x="{x}" y="{-hgt}" width="38" height="{hgt}" rx="7" fill="{col}" opacity=".92"/>')
g.append(f'<path d="M-152,-116 L60,-30" stroke="{PINK}" stroke-width="4" fill="none" stroke-dasharray="9 7"/>')
g.append(f'<circle cx="60" cy="-30" r="8" fill="{PINK}"/>')
g.append(f'<text x="-172" y="26" font-family="Helvetica,Arial" font-size="14" font-weight="bold" '
         f'fill="{DARK}" opacity=".6">BALANCE FALLS EVERY DAY</text>')
g.append("</g>")
g.append(f'<g transform="translate(612,196)">')
for i, (cx, cy) in enumerate([(-6, -78), (18, -92)]):
    g.append(f'<circle cx="{cx}" cy="{cy}" r="15" fill="{GOLD}"/>')
    g.append(f'<circle cx="{cx}" cy="{cy}" r="10" fill="none" stroke="#ffffff" stroke-width="2" opacity=".65"/>')
g.append(f'<path d="M-54,-46 q54,-22 108,0 q16,30 6,54 q-60,26 -120,0 q-10,-24 6,-54 Z" fill="{DARK}"/>')
g.append(f'<path d="M-54,-46 q54,-22 108,0" stroke="{GOLD}" stroke-width="7" fill="none" stroke-linecap="round"/>')
g.append(f'<circle cx="0" cy="8" r="19" fill="{GOLD}" opacity=".95"/>')
g.append(f'<circle cx="0" cy="8" r="12" fill="none" stroke="{DARK}" stroke-width="2.6" opacity=".5"/>')
g.append("</g>")
write("loans.svg", feature("".join(g)))

# ------------------------------------------- 8. REPORTS & COMPLIANCE
g = [f'<g transform="translate(330,168)">',
     f'<rect x="-116" y="-112" width="232" height="224" rx="14" fill="url(#card)" stroke="{GREEN}" stroke-width="3"/>',
     f'<rect x="-116" y="-112" width="232" height="30" rx="14" fill="{DARK}"/>',
     f'<rect x="-116" y="-98" width="232" height="16" fill="{DARK}"/>',
     f'<text x="-100" y="-91" font-family="Helvetica,Arial" font-size="14" font-weight="bold" fill="{LIME}">REPORT</text>']
for i, hgt in enumerate([40, 66, 52, 84, 60]):
    x = -92 + i * 38
    g.append(f'<rect x="{x}" y="{46 - hgt}" width="26" height="{hgt}" rx="5" '
             f'fill="{GREEN if i % 2 == 0 else LIME}"/>')
g.append(f'<line x1="-96" y1="50" x2="96" y2="50" stroke="{DARK}" stroke-width="2" opacity=".35"/>')
for i, wdt in enumerate([150, 110]):
    g.append(f'<rect x="-92" y="{70 + i*18}" width="{wdt}" height="8" rx="4" fill="{DARK}" opacity=".3"/>')
g.append("</g>")
g.append(f'<g transform="translate(590,160)">')
segs = [(0, 150, GREEN), (150, 105, LIME), (255, 60, GOLD), (315, 45, MID)]
for (a0, ext, col) in segs:
    a1 = a0 + ext
    x0, y0 = 66 * math.cos(math.radians(-a0)), 66 * math.sin(math.radians(-a0))
    x1, y1 = 66 * math.cos(math.radians(-a1)), 66 * math.sin(math.radians(-a1))
    large = 1 if ext > 180 else 0
    g.append(f'<path d="M0,0 L{x0:.1f},{y0:.1f} A66,66 0 {large},0 {x1:.1f},{y1:.1f} Z" fill="{col}" '
             f'stroke="#ffffff" stroke-width="3"/>')
g.append(f'<circle cx="0" cy="0" r="30" fill="{PALE}"/>')
g.append("</g>")
write("reports.svg", feature("".join(g)))


# =============== extra sections used by the Features page ====================

# ---------------------------------------------- 9. INVENTORY & REQUISITION
g = ['<g transform="translate(320,190)">']
for (x, yy, wdt, hgt, col) in [(-120, -48, 96, 76, GREEN), (-16, -48, 96, 76, LIME), (-68, -124, 96, 76, LLIM)]:
    g.append(f'<rect x="{x}" y="{yy}" width="{wdt}" height="{hgt}" rx="8" fill="{col}" stroke="{DARK}" stroke-width="3"/>')
    g.append(f'<rect x="{x+wdt*0.34:.0f}" y="{yy}" width="{wdt*0.32:.0f}" height="{hgt}" fill="{DARK}" opacity=".16"/>')
g.append("</g>")
g.append('<g transform="translate(600,168)">')
g.append(f'<rect x="-62" y="-92" width="124" height="180" rx="12" fill="url(#card)" stroke="{GREEN}" stroke-width="3"/>')
g.append(f'<rect x="-28" y="-104" width="56" height="24" rx="8" fill="{DARK}"/>')
for i in range(4):
    yy = -52 + i * 34
    g.append(f'<path d="M-42,{yy} l9,10 l19,-22" stroke="{GREEN}" stroke-width="4.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
    g.append(f'<rect x="-4" y="{yy-5}" width="46" height="8" rx="4" fill="{DARK}" opacity=".32"/>')
g.append("</g>")
write("inventory.svg", feature("".join(g)))

# ------------------------------------------------------ 10. SUPPLY CHAIN
g = [f'<path d="M70,244 C210,160 300,300 430,214 S640,130 742,200" stroke="{DARK}" stroke-width="4" fill="none" stroke-dasharray="12 10" opacity=".45"/>']
for (px, py) in ((70, 244), (430, 214), (742, 200)):
    g.append(f'<path d="M{px},{py} c-15,-18 -15,-34 0,-34 c15,0 15,16 0,34 Z" fill="{PINK}"/>')
    g.append(f'<circle cx="{px}" cy="{py-22}" r="6" fill="#ffffff"/>')
g.append('<g transform="translate(370,142)">')
g.append(f'<rect x="-96" y="-44" width="120" height="66" rx="8" fill="{LIME}" stroke="{DARK}" stroke-width="3"/>')
g.append(f'<path d="M24,-16 h40 l26,28 v10 h-66 Z" fill="{LLIM}" stroke="{DARK}" stroke-width="3"/>')
g.append(f'<rect x="34" y="-8" width="26" height="16" rx="3" fill="{PALE}" stroke="{DARK}" stroke-width="2"/>')
for cx in (-60, 44):
    g.append(f'<circle cx="{cx}" cy="26" r="15" fill="{DARK}"/>')
    g.append(f'<circle cx="{cx}" cy="26" r="6" fill="{PALE}"/>')
g.append(f'<path d="M-92,-30 h44 M-92,-18 h30" stroke="{DARK}" stroke-width="3" opacity=".35" stroke-linecap="round"/>')
g.append("</g>")
write("supply.svg", feature("".join(g)))

# --------------------------------------------------- 11. FINANCE & LEDGER
g = ['<g transform="translate(320,172)">',
     f'<rect x="-128" y="-108" width="256" height="216" rx="14" fill="url(#card)" stroke="{GREEN}" stroke-width="3"/>',
     f'<rect x="-128" y="-108" width="34" height="216" rx="14" fill="{DARK}"/>',
     f'<rect x="-108" y="-108" width="14" height="216" fill="{DARK}"/>']
pts = [(-72, 54), (-28, 16), (14, 34), (56, -26), (100, -58)]
g.append('<path d="M' + " L".join(f"{x},{yy}" for x, yy in pts) + f'" stroke="{GREEN}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
for x, yy in pts:
    g.append(f'<circle cx="{x}" cy="{yy}" r="6" fill="{DARK}"/>')
g.append(f'<path d="M84,-72 l22,0 l0,22" stroke="{GREEN}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
for i, wdt in enumerate([120, 86]):
    g.append(f'<rect x="-72" y="{76 + i*18}" width="{wdt}" height="8" rx="4" fill="{DARK}" opacity=".3"/>')
g.append("</g>")
g.append(f'<circle cx="614" cy="176" r="52" fill="{GOLD}"/>')
g.append(f'<circle cx="614" cy="176" r="42" fill="none" stroke="#ffffff" stroke-width="3" opacity=".7"/>')
g.append(f'<g stroke="{INK}" stroke-width="5" fill="none" opacity=".75" stroke-linecap="round">'
         f'<path d="M599,158 q16,0 16,15 l0,20"/><path d="M595,178 l27,0"/><path d="M615,197 l13,0"/></g>')
write("finance.svg", feature("".join(g)))

# ------------------------------------------------ 12. WEATHER MONITORING
g = [f'<circle cx="290" cy="118" r="48" fill="{GOLD}"/>']
for a in range(0, 360, 45):
    rad = math.radians(a)
    g.append(f'<line x1="{290+60*math.cos(rad):.0f}" y1="{118+60*math.sin(rad):.0f}" '
             f'x2="{290+76*math.cos(rad):.0f}" y2="{118+76*math.sin(rad):.0f}" '
             f'stroke="{GOLD}" stroke-width="6" stroke-linecap="round" opacity=".7"/>')
g.append(f'<path d="M334,176 a44,44 0 0 1 22,-82 a56,56 0 0 1 104,14 a36,36 0 0 1 -6,68 Z" fill="#ffffff" stroke="{DARK}" stroke-width="3"/>')
for dx in (-24, 18, 60, 102):
    g.append(f'<path d="M{346+dx},196 q-9,14 0,20 q9,-6 0,-20 Z" fill="{MID}" opacity=".85"/>')
g.append('<g transform="translate(646,162)">')
g.append(f'<rect x="-11" y="-84" width="22" height="100" rx="11" fill="#ffffff" stroke="{DARK}" stroke-width="3"/>')
g.append(f'<rect x="-5" y="-54" width="10" height="70" rx="5" fill="{PINK}"/>')
g.append(f'<circle cx="0" cy="24" r="20" fill="{PINK}" stroke="{DARK}" stroke-width="3"/>')
g.append("</g>")
write("weather.svg", feature("".join(g)))

# ------------------------------------------------ 13. ALERTS & BROADCAST
g = ['<g transform="translate(300,208)">']
g.append(f'<path d="M-34,40 L-12,-72 L12,-72 L34,40 Z" fill="none" stroke="{DARK}" stroke-width="5"/>')
g.append(f'<path d="M-24,-10 L24,-10 M-29,16 L29,16" stroke="{DARK}" stroke-width="4"/>')
g.append(f'<circle cx="0" cy="-84" r="9" fill="{PINK}"/>')
for i, r in enumerate((32, 54, 76)):
    for sgn, sweep in ((-1, 0), (1, 1)):
        g.append(f'<path d="M{sgn*r*0.7:.0f},{-84-r*0.55:.0f} a{r},{r} 0 0 {sweep} 0,{r*1.1:.0f}" '
                 f'fill="none" stroke="{GREEN}" stroke-width="4" opacity="{0.8-i*0.2:.1f}" stroke-linecap="round"/>')
g.append("</g>")
g.append('<g transform="translate(600,172)">')
g.append(f'<rect x="-44" y="-86" width="88" height="164" rx="14" fill="{DARK}"/>')
g.append(f'<rect x="-36" y="-70" width="72" height="132" rx="6" fill="{PALE}"/>')
g.append(f'<rect x="-26" y="-54" width="52" height="9" rx="4.5" fill="{GREEN}"/>')
for i, wdt in enumerate([44, 36, 40]):
    g.append(f'<rect x="-26" y="{-34 + i*18}" width="{wdt}" height="7" rx="3.5" fill="{DARK}" opacity=".3"/>')
g.append(f'<circle cx="0" cy="40" r="13" fill="{PINK}" opacity=".2"/>')
g.append(f'<circle cx="0" cy="40" r="7" fill="{PINK}"/>')
g.append("</g>")
write("broadcast.svg", feature("".join(g)))

# ------------------------------------------------- 14. CHA BOT & AI LAYER
g = ['<g transform="translate(296,136)">',
     f'<path d="M-110,-56 h220 a16,16 0 0 1 16,16 v76 a16,16 0 0 1 -16,16 h-150 l-34,30 v-30 h-36 '
     f'a16,16 0 0 1 -16,-16 v-76 a16,16 0 0 1 16,-16 Z" fill="#ffffff" stroke="{GREEN}" stroke-width="3"/>']
for i, wdt in enumerate([150, 120, 96]):
    g.append(f'<rect x="-88" y="{-32 + i*24}" width="{wdt}" height="9" rx="4.5" fill="{DARK}" opacity=".3"/>')
g.append("</g>")
g.append('<g transform="translate(540,238)">')
g.append(f'<path d="M-84,-40 h168 a14,14 0 0 1 14,14 v52 a14,14 0 0 1 -14,14 h-118 l-30,26 v-26 h-20 '
         f'a14,14 0 0 1 -14,-14 v-52 a14,14 0 0 1 14,-14 Z" fill="{DARK}"/>')
for i, wdt in enumerate([116, 84]):
    g.append(f'<rect x="-64" y="{-20 + i*22}" width="{wdt}" height="9" rx="4.5" fill="{LIME}" opacity=".8"/>')
g.append("</g>")
g.append('<g transform="translate(628,112)">')
g.append(f'<circle cx="0" cy="0" r="40" fill="{LIME}" stroke="{DARK}" stroke-width="3"/>')
for a in (90, 210, 330):
    rad = math.radians(a)
    rx, ry = 40 * math.cos(rad), -40 * math.sin(rad)
    g.append(f'<line x1="0" y1="0" x2="{rx:.1f}" y2="{ry:.1f}" stroke="{DARK}" stroke-width="3.4"/>')
    g.append(f'<circle cx="{rx:.1f}" cy="{ry:.1f}" r="9" fill="{DARK}"/>')
g.append(f'<circle cx="0" cy="0" r="10" fill="{DARK}"/>')
g.append("</g>")
write("chabot.svg", feature("".join(g)))
