#!/usr/bin/env python3
"""Audit data/iso286.json against the text of ISO 286-1:2010 (Tables 1-5, sizes <= 500 mm).

For every printed group of size rows the multiset of numbers printed in the standard is
compared with the multiset the JSON data predicts (columns whose values are equal across the
rows of a group are printed once in the standard). Any difference is a transcription error.

The text of the standard is NOT part of this repository (licensed); extract it yourself
(e.g. pypdf) and pass the path.

usage: audit_iso_data.py <data/iso286.json> <iso286-1.txt>
"""
import json
import re
import sys
from collections import Counter

d = json.load(open(sys.argv[1]))
lines = open(sys.argv[2]).read().split("\n")
FINE = [tuple(x) for x in d["sizeSteps"]["deviation"]]
MAIN = [tuple(x) for x in d["sizeSteps"]["tolerance"]]
GROUPS = [[0], [1], [2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14, 15], [16, 17, 18], [19, 20], [21, 22], [23, 24]]
MAIN_OF_FINE = [next(i for i, m in enumerate(MAIN) if m[0] <= f[0] and f[1] <= m[1]) for f in FINE]


def norm(s):
    s = s.replace("−", "-").replace("–", "-").replace("∆", "D").replace("∆", "D").replace(",", ".")
    s = re.sub(r"\s*\+\s*D", "D", s)
    return s


def section(title_start, stop_prefix):
    # the table heading appears twice in the text for some tables (list of tables); take the last
    starts = [i for i, l in enumerate(lines) if l.startswith(title_start)]
    s = starts[-1]
    e = next(i for i in range(s + 1, len(lines)) if lines[i].startswith(stop_prefix))
    return s, e


def printed_groups(s, e):
    """map group index -> list of normalized text chunks, size labels removed"""
    out = {}
    cur = None
    for i in range(s, e):
        l = norm(lines[i]).strip()
        if l.startswith("500 560"):
            break
        m = re.match(r"^(\d+)\s+(\d+)(?=\s|$)", l)
        pair = None
        if m and (int(m.group(1)), int(m.group(2))) in FINE:
            pair = (int(m.group(1)), int(m.group(2)))
        elif l.startswith("— 3") or l.startswith("— 3"):
            pair, m = (0, 3), re.match(r"^\S+\s+3", l)
        if pair:
            cur = next(k for k, g in enumerate(GROUPS) if FINE.index(pair) in g)
            l = l[m.end():]
        if cur is not None and l:
            out.setdefault(cur, []).append(l)
    return out


def nums(chunks):
    txt = " ".join(chunks)
    txt = re.sub(r"\s*\+\s*D", "D", txt)  # '-8 + <newline> D'
    txt = re.sub(r"(\d) (\d{3})(?!\d)", r"\1\2", txt)  # thousands separator '1 050'
    return Counter(re.findall(r"[+-]?\d+(?:\.\d+)?D?", txt))


def bag(cols, group, fmt):
    out = Counter()
    for arr in cols:
        vals = [arr[i] for i in group if arr[i] is not None]
        if not vals:
            continue
        if len(vals) == len(group) and all(v == vals[0] for v in vals):
            vals = vals[:1]
        for v in vals:
            out[fmt(v)] += 1
    return out


def sgn(v, plus=True):
    if v == 0:
        return "0"
    t = str(int(v)) if float(v).is_integer() else str(v)
    return ("+" + t) if (v > 0 and plus) else t


problems = 0
# discrepancies inside the standard itself, resolved in favour of the value that agrees with Table 2 and the formula
KNOWN = {
    ("T4", ((18, 24), (24, 30))): ({"-25": 1}, {"-28": 1},
                                   "Table 4 prints ef = -25 for 18-30 mm; Table 2 prints EF = +28 and sqrt(e*f) = 28.3. Data uses -28."),
}


def compare(tag, printed, expected, group):
    global problems
    p, e = printed, expected
    known = KNOWN.get((tag, tuple(FINE[i] for i in group)))
    if p != e and known and dict(p - e) == known[0] and dict(e - p) == known[1]:
        print(f"KNOWN DISCREPANCY {tag} rows {[FINE[i] for i in group]}: {known[2]}")
        return
    if p != e:
        problems += 1
        print(f"MISMATCH {tag} rows {[FINE[i] for i in group]}\n   printed-only: {dict(p - e)}\n   expected-only: {dict(e - p)}")


sh = d["shaft"]
# ---- Table 4 (a..j)
s, e = section("Table 4 — Values of the fundamental deviations for shafts a to j", "Table 5")
g4 = printed_groups(s, e)
cols4 = [sh["es"][k] for k in sh["es"]] + [sh["j_ei"]["j5_6"], sh["j_ei"]["j7"], sh["j_ei"]["j8"]]
for gi, group in enumerate(GROUPS):
    printed = nums(g4[gi])
    # unsigned zero in print for 'h'; others signed
    compare("T4", printed, bag(cols4, group, sgn), group)
# ---- Table 5 (k..zc)
s, e = section("Table 5 — Values of the fundamental deviations for shafts k to zc", "4.4 Selection")
g5 = printed_groups(s, e)
cols5 = [sh["ei"][k] for k in sh["ei"]]
for gi, group in enumerate(GROUPS):
    compare("T5", nums(g5[gi]), bag(cols5, group, sgn), group)
# ---- Table 2 (holes A..M, sizes <= 500)
ho = d["hole"]
es = sh["es"]
s, e = section("Table 2 — Values of the fundamental deviations for holes A to M", "Table 3")
g2 = printed_groups(s, e)
J = ho["J_es"]


def table2_expected(group):
    out = Counter()
    for k in ("a", "b", "c", "cd", "d", "e", "ef", "f", "fg", "g", "h"):
        arr = [None if v is None else -v for v in es[k]]
        out += bag([arr], group, sgn)
    mi = MAIN_OF_FINE[group[0]]
    out[sgn(J["J6"][mi])] += 1
    out[sgn(J["J7"][mi])] += 1
    out[sgn(J["J8"][mi])] += 1
    kA = sh["ei"]["k_4_7"][group[0]]
    out["0" if kA == 0 else f"-{kA}D"] += 1   # K, up to IT8
    # K above IT8 is 0 by the general rule; printed only in the <=3 mm row, blank elsewhere
    if group[0] == 0:
        out["0"] += 1
    m = sh["ei"]["m"][group[0]]
    out["-2" if m == 2 and group[0] == 0 else f"-{m}D"] += 1   # M up to IT8 (no Delta up to 3 mm)
    out[f"-{m}"] += 1                                          # M above IT8
    return out


for gi, group in enumerate(GROUPS):
    exp = table2_expected(group)
    # the standard prints ES/EI of A..H merged per group like the shafts; J/K/M once per group
    got = nums(g2[gi])
    compare("T2", got, exp, group)
# ---- Table 3 (holes N..ZC + Delta, sizes <= 500)
s, e = section("Table 3 — Values of the fundamental deviations for holes N to ZC", "Table 3 (continued)")
g3 = printed_groups(s, e)
dl = ho["delta"]
for gi, group in enumerate(GROUPS):
    mi = MAIN_OF_FINE[group[0]]
    out = Counter()
    n = sh["ei"]["n"][group[0]]
    out["-4" if group[0] == 0 else f"-{n}D"] += 1                 # N up to IT8
    out["-4" if group[0] == 0 else "0"] += 1                      # N above IT8
    out += bag([sh["ei"][k] for k in ("p", "r", "s", "t", "u", "v", "x", "y", "z", "za", "zb", "zc")], group,
               lambda v: sgn(-v))
    for g in ("IT3", "IT4", "IT5", "IT6", "IT7", "IT8"):
        v = dl[g][mi]
        out[str(int(v)) if float(v).is_integer() else str(v)] += 1
    compare("T3", nums(g3[gi]), out, group)

print("problems:", problems)
sys.exit(1 if problems else 0)
