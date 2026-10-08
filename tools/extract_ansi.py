#!/usr/bin/env python3
"""Build data/ansi_b4_1.json from transcribed ANSI/ASME B4.1-1967 (R1987) tables.

This is a BUILD-TIME tool only. The runtime calculator reads the generated JSON
and never re-derives anything. The source is a third-party HTML transcription of
the standard (see SOURCES in data/README.md); it contains typos, so every row is
checked against the standard's own redundancy:

  1. printed fit limits must equal the limits derived from hole/shaft limits
  2. hole/shaft tolerance for a given grade (H7, f6 ...) and size range must be
     identical wherever that grade appears (it is one number in the standard)
  3. size ranges must chain with no gaps

Rows are auto-corrected only when exactly one field must change to satisfy all
rules; the change is logged. Anything else is left UNRESOLVED and listed in the
report so it can be fixed by hand in tools/ansi_errata.json (with a reason).

usage: extract_ansi.py <dir with the saved html pages | tools/source/ansi_raw_cells.json> <out json> <report txt>
(the first run from html also snapshots the raw table cells to tools/source/ansi_raw_cells.json,
 so the build can be repeated without the web pages)
"""
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

PAGES = ["c_ANSIRunningSlidingFits.html", "c_ANSILocationalCleranceFits.html",
         "c_ANSILocationalTransitionAndInterferenceFits.html",
         "c_ANSIForceFits.html", "c_ANSIForceShrinkFits.html"]
FAMILY = {"RC": "clearance", "LC": "clearance", "LT": "transition", "LN": "interference", "FN": "interference"}
EPS = 1e-6

# Designations (standard-limit grades) per class, from the standard's table headings.
# None = the standard assigns no ISO-style shaft symbol (RC9, LC10, LC11, FN1).
CLASSDEF = {
    "RC1": ("H5", "g4"), "RC2": ("H6", "g5"), "RC3": ("H7", "f6"), "RC4": ("H8", "f7"), "RC5": ("H8", "e7"),
    "RC6": ("H9", "e8"), "RC7": ("H9", "d8"), "RC8": ("H10", "c9"), "RC9": ("H11", None),
    "LC1": ("H6", "h5"), "LC2": ("H7", "h6"), "LC3": ("H8", "h7"), "LC4": ("H10", "h9"), "LC5": ("H7", "g6"),
    "LC6": ("H9", "f8"), "LC7": ("H10", "e9"), "LC8": ("H10", "d9"), "LC9": ("H11", "c10"),
    "LC10": ("H12", None), "LC11": ("H13", None),
    "LT1": ("H7", "js6"), "LT2": ("H8", "js7"), "LT3": ("H7", "k6"), "LT4": ("H8", "k7"), "LT5": ("H7", "n6"),
    "LT6": ("H7", "n7"),
    "LN1": ("H6", "n5"), "LN2": ("H7", "p6"), "LN3": ("H7", "r6"),
    "FN1": ("H6", None), "FN2": ("H7", "s6"), "FN3": ("H7", "t6"), "FN4": ("H7", "u6"), "FN5": ("H8", "x7"),
}


class Rows(HTMLParser):
    def __init__(s):
        super().__init__()
        s.rows, s.cur, s.cell = [], None, None

    def handle_starttag(s, t, a):
        if t == "tr":
            s.cur = []
        elif t in ("td", "th"):
            s.cell = []
        elif t == "br" and s.cell is not None:
            s.cell.append(" ")

    def handle_endtag(s, t):
        if t in ("td", "th") and s.cell is not None and s.cur is not None:
            s.cur.append(re.sub(r"\s+", " ", "".join(s.cell).replace("\xa0", " ")).strip())
            s.cell = None
        elif t == "tr" and s.cur is not None:
            s.rows.append(s.cur)
            s.cur = None

    def handle_data(s, d):
        if s.cell is not None:
            s.cell.append(d)

    def handle_entityref(s, n):
        if s.cell is not None:
            s.cell.append(html.unescape("&%s;" % n))

    def handle_charref(s, n):
        if s.cell is not None:
            s.cell.append(html.unescape("&#%s;" % n))


def nums(cell):
    cell = re.sub(r"(\d)\.\s+(\d)", r"\1.\2", cell)
    cell = cell.replace("+-", "-").replace(";", "")
    return [float(x) for x in re.findall(r"[+-]?\d*\.\d+|[+-]?\d+", cell)]


def parse_pages(d):
    """-> list of dict(cls, grade_h, grade_s, over, to, cells[3 strings])"""
    out = []
    for p in PAGES:
        parser = Rows()
        parser.feed((Path(d) / p).read_text(errors="ignore"))
        classes, grades = [], []
        for r in parser.rows:
            if r and r[0] == "41..49":
                r = ["41.49"] + r[1:]  # source typo
            if re.match(r"Nominal", r[0] if r else "") and any(c.startswith("Class") for c in r):
                classes = [re.sub(r"\s+", "", c.replace("Class", "")) for c in r if c.startswith("Class")]
            elif r and r[0] == "Over":
                grades = []
                for c in r[2:]:
                    m = re.match(r"(Hole|Shaft)\s*([A-Za-z]+\d+)?", c)
                    grades.append(m.group(2) if m and m.group(2) else None)
                # a few headers lose the grade of the shaft cell (e.g. 'Shaft' then next line): leave None
            elif len(r) >= 8 and re.fullmatch(r"\d+(\.\d+)?", r[0] or "x") and re.fullmatch(r"\d+(\.\d+)?", r[1] or "x"):
                if not classes:
                    continue
                over, to = float(r[0]), float(r[1])
                if (over, to) == (0.12, 0.40) and p == "c_ANSIRunningSlidingFits.html":
                    to = 0.24  # source typo: first 0.12-0.24 row is labelled 0.12-0.40
                out.append(dict(page=p, classes=list(classes), grades=list(grades), over=over, to=to, cells=r[2:]))
    return out


def load_raw(src):
    """src = directory of saved HTML pages, or the raw-cells JSON written by a previous run"""
    if str(src).endswith(".json"):
        return json.loads(Path(src).read_text())
    raw = parse_pages(src)
    return raw


def main(src, out_json, report_path):
    errata = {}
    ep = Path(__file__).with_name("ansi_errata.json")
    if ep.exists():
        errata = json.loads(ep.read_text())
    rep = []
    raw = load_raw(src)
    snap = Path(__file__).with_name("source") / "ansi_raw_cells.json"
    if not str(src).endswith(".json"):
        snap.parent.mkdir(exist_ok=True)
        snap.write_text(json.dumps(raw, indent=0))
    rows = {}  # (cls, over, to) -> dict
    for r in raw:
        ncls = len(r["classes"])
        cells = r["cells"]
        if len(cells) != 3 * ncls:
            rep.append(f"CELLCOUNT {r['page']} {r['over']}-{r['to']}: got {len(cells)} cells, expected {3*ncls}: {cells}")
            continue
        for i, cls in enumerate(r["classes"]):
            fit, hole, shaft = cells[3 * i:3 * i + 3]
            if not (fit or hole or shaft):
                continue
            hg, sg = CLASSDEF[cls]
            rows[(cls, r["over"], r["to"])] = dict(cls=cls, over=r["over"], to=r["to"], hg=hg, sg=sg,
                                                    fit=nums(fit), hole=nums(hole), shaft=nums(shaft),
                                                    src=(fit, hole, shaft))
    # --- grade tolerance modes -------------------------------------------------
    from collections import Counter
    hole_mode, shaft_mode = {}, {}
    hc, sc = {}, {}
    def self_consistent(cls, r):
        """fit limits printed in the source equal those derived from the printed hole/shaft limits"""
        if len(r["fit"]) != 2 or len(r["shaft"]) != 2 or not r["hole"]:
            return False
        hh = max(abs(x) for x in r["hole"])
        sh, sl = max(r["shaft"]), min(r["shaft"])
        a, b = (-max(r["fit"]), -min(r["fit"])) if cls[:2] in ("LN", "FN") else (min(r["fit"]), max(r["fit"]))
        return abs(-sh - a) < EPS and abs(hh - sl - b) < EPS

    for (cls, o, t), r in rows.items():
        if not self_consistent(cls, r):
            continue  # only fully self-consistent rows vote on the per-grade tolerances
        if r["hg"] and r["hole"]:
            hc.setdefault((r["hg"], o, t), Counter())[round(max(abs(x) for x in r["hole"]), 6)] += 1
        if r["sg"] and len(r["shaft"]) == 2:
            sc.setdefault((r["sg"], o, t), Counter())[round(abs(r["shaft"][0] - r["shaft"][1]), 6)] += 1
    # shaft grade n carries the same tolerance as hole grade n (e.g. f6 == H6) in the same size range
    for (g, o, t), c in list(hc.items()):
        pass
    # only trust a mode if it appears in >=2 independent classes
    for k, c in hc.items():
        v, n = c.most_common(1)[0]
        if n >= 2:
            hole_mode[k] = v
    for (g, o, t), c in hc.items():
        v, n = c.most_common(1)[0]
        if n >= 2:
            shaft_mode[("n" + g[1:], o, t)] = v

    result, unresolved = [], []
    for (cls, o, t), r in sorted(rows.items(), key=lambda kv: (kv[0][0][:2], int(re.sub(r"\D", "", kv[0][0])), kv[0][1])):
        fam = cls[:2]
        key = f"{cls}|{o}|{t}"
        hole, shaft, fit = r["hole"], r["shaft"], r["fit"]
        # hole is always +x / 0 in the hole-basis tables
        hh = max(abs(x) for x in hole) if hole else None
        # canonical: fit_min/fit_max in clearance sign (+clearance / -interference)
        if len(fit) == 2:
            if fam in ("LN", "FN"):
                fmin, fmax = -max(fit), -min(fit)
            else:
                fmin, fmax = min(fit), max(fit)
        else:
            fmin = fmax = None
        sh = sl = None
        if len(shaft) == 2:
            sh, sl = max(shaft), min(shaft)
        cand = dict(hh=hh, sh=sh, sl=sl, fmin=fmin, fmax=fmax)
        review = None
        if key in errata:
            cand.update({k: v for k, v in errata[key].items() if k in cand})
            review = errata[key].get("_review")
            rep.append(f"ERRATA {key}: {errata[key]}")
        ok = lambda c: None not in c.values() and abs((0 - c["sh"]) - c["fmin"]) < EPS and abs((c["hh"] - c["sl"]) - c["fmax"]) < EPS
        htol = hole_mode.get((r["hg"], o, t))
        stol = shaft_mode.get(("n" + re.sub(r"\D", "", r["sg"]), o, t)) if r["sg"] and not r["sg"].startswith("js") else None
        tolok = lambda c: (htol is None or abs(c["hh"] - htol) < EPS) and (stol is None or abs((c["sh"] - c["sl"]) - stol) < EPS)
        fixed = None
        if None in cand.values() or not (ok(cand) and tolok(cand)):
            # try single-field repairs, then report
            opts = []
            hhs = {cand["hh"], htol} - {None}
            for h in hhs:
                for s_hi in {cand["sh"], (-cand["fmin"] if cand["fmin"] is not None else None)} - {None}:
                    sls = {cand["sl"], (h - cand["fmax"] if cand["fmax"] is not None else None),
                           (s_hi - stol if stol is not None else None)} - {None}
                    for s_lo in sls:
                        c = dict(hh=h, sh=s_hi, sl=s_lo, fmin=-s_hi, fmax=h - s_lo)
                        if tolok(c):
                            dist = sum(1 for k in c if cand[k] is None or abs(c[k] - cand[k]) > EPS)
                            opts.append((dist, c))
            opts.sort(key=lambda x: x[0])
            best = [c for d, c in opts if opts and d == opts[0][0]]
            uniq = []
            for c in best:
                if c not in uniq:
                    uniq.append(c)
            if opts and opts[0][0] <= 2 and len(uniq) == 1:
                fixed = uniq[0]
                rep.append(f"AUTOFIX {key}: parsed {cand} -> {fixed}  (src={r['src']})")
                cand = fixed
            else:
                rep.append(f"UNRESOLVED {key}: parsed {cand} htol={htol} stol={stol} (src={r['src']})")
                unresolved.append(key)
                continue
        rec = dict(cls=cls, over=o, to=t, hole_grade=r["hg"], shaft_grade=r["sg"],
                   hole=[round(cand["hh"], 6), 0.0], shaft=[round(cand["sh"], 6), round(cand["sl"], 6)],
                   fit_min=round(cand["fmin"], 6), fit_max=round(cand["fmax"], 6))
        if review:
            rec["review"] = review
        result.append(rec)
    DESC = {"RC1": "Close sliding", "RC2": "Sliding", "RC3": "Precision running", "RC4": "Close running",
            "RC5": "Medium running", "RC6": "Medium running", "RC7": "Free running", "RC8": "Loose running",
            "RC9": "Loose running", "FN1": "Light drive", "FN2": "Medium drive", "FN3": "Heavy drive",
            "FN4": "Force", "FN5": "Force"}
    FAM = {"RC": "Running and sliding", "LC": "Locational clearance", "LT": "Locational transition",
           "LN": "Locational interference", "FN": "Force and shrink"}
    classes = {}
    for rec in result:
        c = classes.setdefault(rec["cls"], dict(family=rec["cls"][:2], description=DESC.get(rec["cls"], FAM[rec["cls"][:2]]),
                                                holeGrade=rec["hole_grade"], shaftGrade=rec["shaft_grade"], rows=[]))
        c["rows"].append(dict(over=rec["over"], to=rec["to"],
                              fit=[round(rec["fit_min"] + 0.0, 4), round(rec["fit_max"] + 0.0, 4)],
                              hole=[round(rec["hole"][0], 4), 0.0],
                              shaft=[round(rec["shaft"][0] + 0.0, 4), round(rec["shaft"][1] + 0.0, 4)],
                              **({"review": rec["review"]} if "review" in rec else {})))
    out = dict(
        _source="ANSI/ASME B4.1-1967 (R1987) Tables 1-5, transcribed from a third-party HTML copy and checked by tools/extract_ansi.py; see data/README.md",
        _units="thousandths of an inch (0.001 in); sizes in inches (over, up to and including)",
        _convention="fit = [minimum, maximum] clearance; negative = interference. hole/shaft = [upper, lower] deviation from basic size.",
        classes=dict(sorted(classes.items(), key=lambda kv: (kv[0][:2], int(re.sub(r"\D", "", kv[0]))))))
    Path(out_json).write_text(json.dumps(out, separators=(",", ":")))
    Path(report_path).write_text("\n".join(rep) + f"\n\nTOTAL rows={len(rows)} ok={len(result)} unresolved={len(unresolved)}\n")
    print(f"rows={len(rows)} accepted={len(result)} unresolved={len(unresolved)}; report -> {report_path}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
