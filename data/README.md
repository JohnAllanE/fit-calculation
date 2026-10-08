# Data provenance

## iso286.json — ISO 286-1:2010(E), sizes ≤ 500 mm
Units: micrometres.

| Section | Source table | Notes |
|---------|--------------|-------|
| `IT` | Table 1 | IT01…IT18 × 13 main size steps. IT12–IT18 are printed in mm in the standard; converted to µm. |
| `shaft.es` | Table 4 | a b c cd d e ef f fg g h — upper deviation per 25 fine size steps |
| `shaft.j_ei` | Table 4 | j5/j6, j7, j8 — lower deviation (j8 only for ≤ 3 mm is printed) |
| `shaft.ei` | Table 5 | k (IT4–IT7), k (other), m n p r s t u v x y z za zb zc — lower deviation |
| `hole.J_es` | Table 2 | J6, J7, J8 (ES) per main step |
| `hole.delta` | Table 3 | Δ for IT3…IT8 per main step. Verified equal to IT(n) − IT(n−1) |
| `hole.exceptions` | Tables 2, 3 | M6 250–315 mm = −9; N above IT8 = −4 for ≤ 3 mm (0 otherwise) |

Holes A–H and K–ZC are *not* stored separately: the standard defines them from the shaft values (general rule `EI = −es`,
`ES = −ei`; special rule `+Δ` for K, M, N ≤ IT8 and P…ZC ≤ IT7). `tools/audit_iso_data.py` checks that the values
this implies equal the numbers printed in Tables 2 and 3.

Regenerate: `python3 tools/build_iso_data.py data/iso286.json`
Audit: `python3 tools/audit_iso_data.py data/iso286.json <text extracted from ISO 286-1>`
(the standard itself is licensed and is not in this repo). Audit result: **0 mismatches** (1 discrepancy inside the standard, `ef` 18–30 mm: Table 4 prints −25, Table 2 prints +28; +28 used).

## ansi_b4_1.json — ANSI/ASME B4.1-1967 (R1987)
Units: thousandths of an inch; sizes in inches. `fit` = [min, max] clearance (negative = interference); `hole`/`shaft` = [upper, lower] deviation.
34 classes, 743 rows (RC 189 · LC 231 · LT 74 · LN 55 · FN 194).

Source: a third-party HTML transcription of the standard’s Tables 1–5 (the original PDF copies we found were not reachable).
That transcription contains typos, so `tools/extract_ansi.py` validates every row:

1. printed fit limits must equal the limits derived from the hole/shaft limits;
2. a hole grade (H7 …) must have one tolerance per size range regardless of class;
3. shaft grade *n* must have the tolerance of hole grade *n* (js excluded);
4. size ranges must chain.

A row failing a rule is auto-corrected only if exactly one field change (or a combination of ≤ 2 that is unique) satisfies all rules;
otherwise it is repaired by hand in `tools/ansi_errata.json`, each with the reasoning. Counts for this release:
23 auto-corrected · 19 hand-corrected · 3 flagged `review` (consistent but anomalous) · 8 LN1 rows (> 19.69 in) dropped (no shaft data in source).

**Verification against the printed standard (Machinery's Handbook pp. 1524–1537, photographed by the instructor in `photos-src/`):**
the handbook reproduces B4.1 only up to **19.69 in**. For those 492 rows the data were compared with an independent hard-coded table
(esierra.me, `test/fixtures/esierra_ansi.json`): all agree except 12 rows, each adjudicated with the handbook photos:
10 × RC2 hole (esierra wrong), LT1 0–0.12 (coban wrong: js6 is ±0.12; fixed), LC6 1.97–3.15 (the *printed standards* misprint the shaft as −1.0; the data uses −1.2, flagged).
Every hole/shaft tolerance in all 743 rows was also compared with the handbook's Table 1 (`test/fixtures/ansi_table1_tolerances.json`).
**The 251 rows above 19.69 in (up to 200 in) are not in the handbook and rest on a single source plus the consistency rules** — treat as unverified.

Independent confirmations so far: RC5 @ 2 in (Machinery’s Handbook example as quoted by engineersedge.com), RC3 @ ¾ in (course notes, UTM), RC4 hole @ 1 in = +1.2/0.

Regenerate (offline): `python3 tools/extract_ansi.py tools/source/ansi_raw_cells.json data/ansi_b4_1.json report.txt` — `tools/source/ansi_raw_cells.json` holds the raw table cells exactly as transcribed by the source.

## test/fixtures/iso286-2_crosscheck.json
Third-party scrape of ISO 286-2 (74 classes × 20 sizes) from github.com/parkergreene/isofits (MIT). Used only as an independent check; 6 cells are wrong in that source (see `test/iso.test.js`).

## test/fixtures/coban_iso_400_500.json, esierra_ansi.json, ansi_table1_tolerances.json
Independent checks used by the tests: the 400–500 mm column of coban's ISO 286-2 pages (57 classes; one typo in the source: k6 +4 vs the standard's +5),
esierra.me's hard-coded ANSI table (≤ 19.69 in), and the handbook's Table 1 (photographed).
The coban site is also the origin of the ANSI rows above 19.69 in — it is the only source found for them.
