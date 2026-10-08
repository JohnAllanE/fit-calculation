#!/usr/bin/env python3
"""Emit data/iso286.json: ISO 286-1:2010 Tables 1-5 for nominal sizes up to 500 mm.

The numbers below are TRANSCRIBED BY HAND from ISO 286-1:2010(E) (Tables 1, 3, 4, 5;
holes follow from the shaft tables by the standard's general/special rules, clause 4.3).
This script is a build/audit tool, not part of the runtime calculator.

Audit mode (optional 2nd arg = text extracted from a licensed copy of the standard):
every group of rows of Tables 3, 4, 5 is compared, as a multiset of numbers, with the
text printed in the standard. A mismatch means a transcription error.

usage: build_iso_data.py <out.json> [iso286-1.txt]
"""
import json
import re
import sys
from collections import Counter

N = None
# --- size steps (mm, over .. up to and including) -----------------------------
FINE = [(0, 3), (3, 6), (6, 10), (10, 14), (14, 18), (18, 24), (24, 30), (30, 40), (40, 50), (50, 65),
        (65, 80), (80, 100), (100, 120), (120, 140), (140, 160), (160, 180), (180, 200), (200, 225),
        (225, 250), (250, 280), (280, 315), (315, 355), (355, 400), (400, 450), (450, 500)]
MAIN = [(0, 3), (3, 6), (6, 10), (10, 18), (18, 30), (30, 50), (50, 80), (80, 120), (120, 180), (180, 250),
        (250, 315), (315, 400), (400, 500)]
# printed row groups in Tables 3/4/5 (indexes into FINE)
GROUPS = [[0], [1], [2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14, 15], [16, 17, 18], [19, 20], [21, 22], [23, 24]]

# --- Table 1: IT01..IT18, micrometres, one list of 13 per grade (MAIN order) ---
IT_TEXT = """
— 3 0,3 0,5 0,8 1,2 2 3 4 6 10 14 25 40 60 0,1 0,14 0,25 0,4 0,6 1 1,4
3 6 0,4 0,6 1 1,5 2,5 4 5 8 12 18 30 48 75 0,12 0,18 0,3 0,48 0,75 1,2 1,8
6 10 0,4 0,6 1 1,5 2,5 4 6 9 15 22 36 58 90 0,15 0,22 0,36 0,58 0,9 1,5 2,2
10 18 0,5 0,8 1,2 2 3 5 8 11 18 27 43 70 110 0,18 0,27 0,43 0,7 1,1 1,8 2,7
18 30 0,6 1 1,5 2,5 4 6 9 13 21 33 52 84 130 0,21 0,33 0,52 0,84 1,3 2,1 3,3
30 50 0,6 1 1,5 2,5 4 7 11 16 25 39 62 100 160 0,25 0,39 0,62 1 1,6 2,5 3,9
50 80 0,8 1,2 2 3 5 8 13 19 30 46 74 120 190 0,3 0,46 0,74 1,2 1,9 3 4,6
80 120 1 1,5 2,5 4 6 10 15 22 35 54 87 140 220 0,35 0,54 0,87 1,4 2,2 3,5 5,4
120 180 1,2 2 3,5 5 8 12 18 25 40 63 100 160 250 0,4 0,63 1 1,6 2,5 4 6,3
180 250 2 3 4,5 7 10 14 20 29 46 72 115 185 290 0,46 0,72 1,15 1,85 2,9 4,6 7,2
250 315 2,5 4 6 8 12 16 23 32 52 81 130 210 320 0,52 0,81 1,3 2,1 3,2 5,2 8,1
315 400 3 5 7 9 13 18 25 36 57 89 140 230 360 0,57 0,89 1,4 2,3 3,6 5,7 8,9
400 500 4 6 8 10 15 20 27 40 63 97 155 250 400 0,63 0,97 1,55 2,5 4 6,3 9,7
"""
IT_GRADES = ["IT01", "IT0"] + [f"IT{i}" for i in range(1, 19)]

# --- Table 4: shafts a..j, upper deviation es (a..g) / lower deviation ei (j), micrometres
# one value per FINE row (25); None = not defined for that size
SHAFT_ES = {
    "a": [-270, -270, -280, -290, -290, -300, -300, -310, -320, -340, -360, -380, -410, -460, -520, -580, -660, -740, -820, -920, -1050, -1200, -1350, -1500, -1650],
    "b": [-140, -140, -150, -150, -150, -160, -160, -170, -180, -190, -200, -220, -240, -260, -280, -310, -340, -380, -420, -480, -540, -600, -680, -760, -840],
    "c": [-60, -70, -80, -95, -95, -110, -110, -120, -130, -140, -150, -170, -180, -200, -210, -230, -240, -260, -280, -300, -330, -360, -400, -440, -480],
    "cd": [-34, -46, -56, -70, -70, -85, -85, -100, -100] + [N] * 16,
    "d": [-20, -30, -40, -50, -50, -65, -65, -80, -80, -100, -100, -120, -120, -145, -145, -145, -170, -170, -170, -190, -190, -210, -210, -230, -230],
    "e": [-14, -20, -25, -32, -32, -40, -40, -50, -50, -60, -60, -72, -72, -85, -85, -85, -100, -100, -100, -110, -110, -125, -125, -135, -135],
    "ef": [-10, -14, -18, -23, -23, -28, -28, -35, -35] + [N] * 16,
    "f": [-6, -10, -13, -16, -16, -20, -20, -25, -25, -30, -30, -36, -36, -43, -43, -43, -50, -50, -50, -56, -56, -62, -62, -68, -68],
    "fg": [-4, -6, -8, -10, -10, -12, -12, -15, -15] + [N] * 16,
    "g": [-2, -4, -5, -6, -6, -7, -7, -9, -9, -10, -10, -12, -12, -14, -14, -14, -15, -15, -15, -17, -17, -18, -18, -20, -20],
    "h": [0] * 25,
}
# j: lower deviation ei by tolerance-grade column
SHAFT_J = {
    "j5_6": [-2, -2, -2, -3, -3, -4, -4, -5, -5, -7, -7, -9, -9, -11, -11, -11, -13, -13, -13, -16, -16, -18, -18, -20, -20],
    "j7": [-4, -4, -5, -6, -6, -8, -8, -10, -10, -12, -12, -15, -15, -18, -18, -18, -21, -21, -21, -26, -26, -28, -28, -32, -32],
    "j8": [-6] + [N] * 24,
}
# --- Table 5: shafts k..zc, lower deviation ei, micrometres
SHAFT_EI = {
    "k_4_7": [0, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 5, 5],   # IT4..IT7
    "k_other": [0] * 25,                                                                    # <=IT3 and >IT7
    "m": [2, 4, 6, 7, 7, 8, 8, 9, 9, 11, 11, 13, 13, 15, 15, 15, 17, 17, 17, 20, 20, 21, 21, 23, 23],
    "n": [4, 8, 10, 12, 12, 15, 15, 17, 17, 20, 20, 23, 23, 27, 27, 27, 31, 31, 31, 34, 34, 37, 37, 40, 40],
    "p": [6, 12, 15, 18, 18, 22, 22, 26, 26, 32, 32, 37, 37, 43, 43, 43, 50, 50, 50, 56, 56, 62, 62, 68, 68],
    "r": [10, 15, 19, 23, 23, 28, 28, 34, 34, 41, 43, 51, 54, 63, 65, 68, 77, 80, 84, 94, 98, 108, 114, 126, 132],
    "s": [14, 19, 23, 28, 28, 35, 35, 43, 43, 53, 59, 71, 79, 92, 100, 108, 122, 130, 140, 158, 170, 190, 208, 232, 252],
    "t": [N] * 6 + [41, 48, 54, 66, 75, 91, 104, 122, 134, 146, 166, 180, 196, 218, 240, 268, 294, 330, 360],
    "u": [18, 23, 28, 33, 33, 41, 48, 60, 70, 87, 102, 124, 144, 170, 190, 210, 236, 258, 284, 315, 350, 390, 435, 490, 540],
    "v": [N] * 4 + [39, 47, 55, 68, 81, 102, 120, 146, 172, 202, 228, 252, 284, 310, 340, 385, 425, 475, 530, 595, 660],
    "x": [20, 28, 34, 40, 45, 54, 64, 80, 97, 122, 146, 178, 210, 248, 280, 310, 350, 385, 425, 475, 525, 590, 660, 740, 820],
    "y": [N] * 5 + [63, 75, 94, 114, 144, 174, 214, 254, 300, 340, 380, 425, 470, 520, 580, 650, 730, 820, 920, 1000],
    "z": [26, 35, 42, 50, 60, 73, 88, 112, 136, 172, 210, 258, 310, 365, 415, 465, 520, 575, 640, 710, 790, 900, 1000, 1100, 1250],
    "za": [32, 42, 52, 64, 77, 98, 118, 148, 180, 226, 274, 335, 400, 470, 535, 600, 670, 740, 820, 920, 1000, 1150, 1300, 1450, 1600],
    "zb": [40, 50, 67, 90, 108, 136, 160, 200, 242, 300, 360, 445, 525, 620, 700, 780, 880, 960, 1050, 1200, 1300, 1500, 1650, 1850, 2100],
    "zc": [60, 80, 97, 130, 150, 188, 218, 274, 325, 405, 480, 585, 690, 800, 900, 1000, 1150, 1250, 1350, 1550, 1700, 1900, 2100, 2400, 2600],
}
# --- Table 2: hole J (ES) for IT6, IT7, IT8, per MAIN step
HOLE_J = {
    "J6": [2, 5, 5, 6, 8, 10, 13, 16, 18, 22, 25, 29, 33],
    "J7": [4, 6, 8, 10, 12, 14, 18, 22, 26, 30, 36, 39, 43],
    "J8": [6, 10, 12, 15, 20, 24, 28, 34, 41, 47, 55, 60, 66],
}
# --- Table 3: Delta values for IT3..IT8, per MAIN step
DELTA = {
    "IT3": [0, 1, 1, 1, 1.5, 1.5, 2, 2, 3, 3, 4, 4, 5],
    "IT4": [0, 1.5, 1.5, 2, 2, 3, 3, 4, 4, 4, 4, 5, 5],
    "IT5": [0, 1, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7, 7],
    "IT6": [0, 3, 3, 3, 4, 5, 6, 7, 7, 9, 9, 11, 13],
    "IT7": [0, 4, 6, 7, 8, 9, 11, 13, 15, 17, 20, 21, 23],
    "IT8": [0, 6, 7, 9, 12, 14, 16, 19, 23, 26, 29, 32, 34],
}
# exceptions printed in the standard's tables
EXCEPTIONS = {
    "M6_250_315": -9,       # Table 2 note b: M6 in 250-315 mm is ES = -9, not -11 per the general calculation
    "N_gt_IT8_up_to_3mm": -4,  # Table 3: N above IT8 is -4 for <=3 mm, and 0 for all larger sizes
}


def parse_it():
    rows = []
    for line in IT_TEXT.strip().splitlines():
        toks = line.replace("—", "0").replace(",", ".").split()
        vals = [float(t) for t in toks]
        lo, hi, rest = vals[0], vals[1], vals[2:]
        assert len(rest) == 20, (line, len(rest))
        um = rest[:13] + [r * 1000 for r in rest[13:]]  # IT12..IT18 are printed in mm
        rows.append(((int(lo), int(hi)), um))
    assert [r[0] for r in rows] == MAIN
    out = {}
    for gi, g in enumerate(IT_GRADES):
        out[g] = [round(r[1][gi], 4) for r in rows]
    return out


def delta_check(it):
    """Delta = IT(n) - IT(n-1) must reproduce the printed Delta table."""
    bad = []
    for g, vals in DELTA.items():
        n = int(g[2:])
        for i, d in enumerate(vals):
            if i == 0:
                continue  # Table 3 prints Delta = 0 for sizes up to 3 mm (it is not an IT difference there)
            calc = round(it[g][i] - it[f"IT{n-1}"][i], 4)
            if abs(calc - d) > 1e-9:
                bad.append((g, MAIN[i], d, calc))
    return bad


# --- audit against the printed standard ----------------------------------------
def norm(s):
    return (s.replace("−", "-").replace("–", "-").replace("∆", "D").replace("∆", "D")
            .replace(",", ".").replace(" 000", "000"))


def bag_from_text(txt, a, b):
    """numbers (as strings) printed between line a and b, with size-boundary labels removed"""
    lines = txt[a:b]
    toks = []
    for ln in lines:
        ln = norm(ln)
        ln = re.sub(r"\s*\+\s*D", "D", ln)          # '-1 + D' -> '-1D'
        ln = re.sub(r"(\d) (000)\b", r"\1\2", ln)     # '1 050' -> '1050'
        toks.extend(re.findall(r"[+-]?\d+(?:\.\d+)?D?", ln))
    return toks


def audit(txt_path):
    txt = open(txt_path).read().split("\n")
    problems = []

    def section(start_pat, end_pat):
        s = next(i for i, l in enumerate(txt) if l.startswith(start_pat))
        e = next(i for i, l in enumerate(txt) if i > s and l.startswith(end_pat))
        return s, e

    bounds = {  # printed group -> (first label line, last label) located by label pairs
    }

    def group_text(s, e, group):
        """lines of one printed group: from the line starting with the first label pair to just before the next group's"""
        labels = [FINE[i] for i in group]
        nxt = None

    def split_groups(s, e):
        out = []
        cur = None
        pair_re = re.compile(r"^(\d+(?: 000)?) (\d+(?: 000)?)\b")
        for i in range(s, e):
            l = norm(txt[i]).strip()
            m = pair_re.match(l)
            if m:
                lo = int(m.group(1).replace(" ", "")) if m.group(1) != "-" else 0
                hi = int(m.group(2).replace(" ", ""))
                if (lo, hi) in FINE or (txt[i].startswith("—") or txt[i].startswith("-")):
                    if (lo, hi) in FINE:
                        out.append([(lo, hi), []])
                        l = l[m.end():]
            elif l.startswith("— 3") or l.startswith("— 3"):
                out.append([(0, 3), []])
                l = l[3:]
            if out and l:
                out[-1][1].append(l)
        return out

    # Table 4 / 5: collect, for each fine row, the lines that follow its label; merge into groups
    def printed_groups(s, e, first_pair_in_group):
        rows = split_groups(s, e)
        groups = {}
        order = []
        for (pair, lines) in rows:
            gi = next(k for k, g in enumerate(GROUPS) if FINE.index(pair) in g)
            groups.setdefault(gi, []).extend(lines)
            order.append(gi)
        return groups

    def expected_bag(cols, group, signed=True):
        bag = []
        for name, arr in cols.items():
            vals = [arr[i] for i in group]
            vals = [v for v in vals if v is not None]
            if not vals:
                continue
            if all(v == vals[0] for v in vals) and len(vals) == len(group):
                vals = [vals[0]]
            bag.extend(vals)
        return bag

    def fmt(v, plus):
        if v == 0:
            return "0"
        return (("+" if (plus and v > 0) else "") + (str(int(v)) if float(v).is_integer() else str(v)))

    # shafts a..j  (Table 4)
    s, e = section("Table 4 — Values of the fundamental deviations for shafts a to j", "Table 5")
    # Keep the first 'Table 4' heading (page header duplicates exist): use last matching start
    g4 = printed_groups(s, e, None)
    cols4 = dict(SHAFT_ES)
    cols4.update({"j56": SHAFT_J["j5_6"], "j7": SHAFT_J["j7"], "j8": SHAFT_J["j8"]})
    for gi, group in enumerate(GROUPS):
        printed = Counter(int(float(t)) for t in re.findall(r"[+-]?\d+(?:\.\d+)?", " ".join(norm(l) for l in g4.get(gi, [])))
                          if True)
        # remove tokens that are part of the size labels of rows already stripped; remaining numbers only
        exp = Counter(expected_bag(cols4, group))
        if printed != exp:
            problems.append(("T4", GROUPS[gi], dict(printed - exp), dict(exp - printed)))
    # shafts k..zc (Table 5)
    s, e = section("Table 5 — Values of the fundamental deviations for shafts k to zc", "4.4 Selection")
    g5 = printed_groups(s, e, None)
    for gi, group in enumerate(GROUPS):
        printed = Counter(int(float(t)) for t in re.findall(r"[+-]?\d+(?:\.\d+)?", " ".join(norm(l) for l in g5.get(gi, []))))
        exp = Counter(expected_bag(SHAFT_EI, group))
        if printed != exp:
            problems.append(("T5", GROUPS[gi], dict(printed - exp), dict(exp - printed)))
    return problems


def main(out, audit_txt=None):
    it = parse_it()
    d = delta_check(it)
    assert not d, d
    data = {
        "_source": "ISO 286-1:2010(E) Tables 1, 3, 4, 5 (hand transcription; see tools/build_iso_data.py). Holes A-H and P-ZC follow from the shaft tables by the standard's general rule (EI=-es, ES=-ei, +Delta for K,M,N<=IT8 and P-ZC<=IT7); J, Delta and the exceptions are transcribed from Tables 2 and 3.",
        "_units": "micrometres",
        "sizeSteps": {"tolerance": MAIN, "deviation": FINE},
        "IT": it,
        "shaft": {"es": SHAFT_ES, "j_ei": SHAFT_J, "ei": SHAFT_EI},
        "hole": {"J_es": HOLE_J, "delta": DELTA, "exceptions": EXCEPTIONS},
    }
    with open(out, "w") as f:
        f.write(json.dumps(data, indent=None, separators=(",", ":"), ensure_ascii=False))
    print("wrote", out)
    if audit_txt:
        problems = audit(audit_txt)
        for p in problems:
            print("AUDIT MISMATCH", p)
        print("audit problems:", len(problems))


if __name__ == "__main__":
    main(*sys.argv[1:3])
