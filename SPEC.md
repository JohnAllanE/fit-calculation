# Fit Calculator — Specification

Status: draft 0.1 (CLI prototype implemented; web UI not started)

## 1. Purpose

Given a **nominal size** and a **fit selection**, compute the size limits of the internal feature (hole) and
external feature (shaft), their tolerances, and the resulting range of clearance or interference — for both
**ANSI/ASME B4.1** (RC, LC, LT, LN, FN) and **ISO 286** (H7/g6 style) — and produce **exactly the numbers a
person gets working the standard's tables by hand**.

Two consumers:

1. **Instructors/students (primary):** a CLI that can be scripted to build and check problem sets.
2. **Classroom demo (later):** a small web page over the same engine.

## 2. Design principles

| # | Principle | Consequence |
|---|-----------|-------------|
| P1 | **Hard-coded tables, not formulas.** | Every number the engine uses is a transcribed table entry that can be found in the standard. ISO 286's formulas are used only in tests, never at run time. |
| P2 | **Hand-process fidelity.** | The engine follows the book procedure (ISO: IT grade + fundamental deviation + Δ; ANSI: read the row). `--trace` prints each look-up. |
| P3 | **Standard and units are independent.** | Choosing ANSI vs ISO selects *tables*; choosing in/mm selects *units for input and output*. Tables are looked up in their native units (ANSI: inch, ISO: mm) and results are converted exactly. |
| P4 | **Exact arithmetic.** | All lengths are integer nanometres (1 in = 25 400 000 nm). Size-range boundaries (“over A up to and including B”) are tested exactly, so 3.048 mm is *exactly* 0.12 in. |
| P5 | **Never guess.** | If a class is not defined at a size (e.g. ISO `t6` at 10 mm, ANSI `LT1` at 25 in) the tool refuses with the reason. Data with unresolved doubt carries a visible review flag. |
| P6 | **Verified data.** | Each dataset is cross-checked against independent sources (see §8) and the checks live in the test-suite. |

## 3. Terminology (as used in output)

* **Internal feature = hole**, **external feature = shaft**.
* **Limits of size**: maximum and minimum permitted size. Hole max = nominal + upper deviation, etc.
* **Deviation**: limit minus nominal. ISO: ES/EI (hole), es/ei (shaft). ANSI: given as `+x / −y` thousandths.
* **Tolerance** = max − min.
* **Minimum clearance** (= ANSI *allowance*) = smallest hole − largest shaft. Negative ⇒ interference.
* **Maximum clearance** = largest hole − smallest shaft.
* **Fit type** (ISO 286-1 §3): *clearance* if min clearance ≥ 0; *interference* if max clearance ≤ 0; otherwise *transition*.
* **Interference range** = −(max clearance) … −(min clearance).

## 4. Inputs

| Input | Form | Notes |
|-------|------|-------|
| `system` | `ansi` \| `iso` | which standard's tables |
| `nominal` | `25`, `1.5`, `1-1/2`, `1 1/2`, `3/4`, `.75` | ≤ 6 decimals (mm) / 5 decimals (in) so the value is a whole nanometre; fractions must be exact |
| `units` | `mm` \| `in` | units of `nominal` **and** of all reported sizes. Default: `in` for ANSI, `mm` for ISO |
| ANSI fit | `RC1`…`RC9`, `LC1`…`LC11`, `LT1`…`LT6`, `LN1`…`LN3`, `FN1`…`FN5` | case/space/hyphen-insensitive (`rc 5`) |
| ISO fit | `H7/g6`, or separate `hole=H7` `shaft=g6` | any hole letter (A…ZC) × grade, any shaft letter (a…zc) × grade |

### 4.1 Size ranges
Ranges are *over A, up to and including B* in both standards. The nominal size itself (not the range mid-point)
is what the deviations are applied to.

* **ANSI:** 0 – 200 in. Class-specific coverage (LT to 19.69 in; LT3/LT4 from 0.24 in; LN1 to 19.69 in; FN3 from 0.95 in …) is in the data; outside it the tool says so.
* **ISO:** > 0 – 500 mm implemented (all of ISO 286-1 Tables 1–5 for ≤ 500 mm). 500 – 3150 mm is planned (§11).

### 4.2 ISO rules enforced
* Upper-case letters ⇒ hole, lower-case ⇒ shaft.
* `a`/`b`/`A`/`B` refused for nominal ≤ 1 mm.
* Letters that are undefined for a size step (`t` < 24 mm, `v` < 14 mm, `y` < 18 mm, `cd`/`ef`/`fg` > 50 mm) refused.
* `j`/`J` only for the grades the standard tabulates (j: IT5–IT8, J: IT6–IT8).
* K, M, N (≤ IT8) and P…ZC (≤ IT7) use the **Δ-rule** (Table 3); K, M, N, P…ZC require IT3 or coarser.
* Exceptions printed in the standard are implemented: `N` above IT8 is 0 (−4 µm for ≤ 3 mm); `M6` over 250–315 mm is −9 µm; `JS`/`js` = ±IT/2 with no rounding (e.g. ±10.5 µm).

## 5. Outputs

For each feature (hole, shaft):

* class (`H7`, `g6`; ANSI: grade symbol such as `H8`, `e7`, or none)
* upper and lower deviation — in the table's native unit (**thou** or **µm**) *and* in the requested units
* maximum and minimum size, tolerance

For the fit: minimum clearance, maximum clearance, type, clearance/interference range, total tolerance (sum of both).

### 5.1 Notations (“different ways to express the same idea”)

| Name | Example (ISO 25 H7) |
|------|---------------------|
| Limit dimensions | `25.021 / 25.000` |
| Nominal + deviations (unilateral/bilateral as the table gives them) | `25.000 +0.021 / 0.000` |
| Mean ± half tolerance (equal bilateral) | `25.0105 ± 0.0105` |
| Tolerance-class symbol | `25.000 H7` · ANSI: `2.0000 H8 (RC5 hole)` |
| Tolerance (width) | `0.021` |

Display follows drawing practice (ASME Y14.5, ISO 129-1): limits and nominal + deviations are shown **upper value over lower value**, decimal points aligned, in the CLI text (`calc`, `table`) and on the web page; mean ± half tolerance stays on one line. The one-line strings above are what JSON, CSV and the clipboard carry; `notation.stack` in the JSON gives the stacked parts (`limits.upper/lower`, `deviations.nominal/upper/lower`).

### 5.2 Number display
Values native to the standard (inch for ANSI, mm for ISO) print with the fewest decimals that are exact
(min 4 in / 3 mm). Converted values print with fixed 5 in / 4 mm. `--decimals N` overrides. Rounding is half-away-from-zero on exact integer arithmetic.

### 5.3 Machine formats
* `--json`: single object (schema in `src/format.js::toJSON`), numbers in the requested units, plus `native_*` deviation values and the notation strings.
* `batch` → CSV (default) or JSON; negative clearance = interference.

## 6. CLI

```
fit calc  --system ansi --fit RC5 --nominal 2 [--units in|mm] [--json] [--trace] [--decimals N]
fit calc  --system iso  --fit H7/g6 --nominal 25            (or --hole H7 --shaft g6)
fit table --system ansi --fit RC5 [--nominal 2]             the standard’s own row(s), in thousandths
fit table --system iso  --class H7 [--nominal 25]           deviations per size step
fit list  [ansi|iso]
fit batch problems.csv [--format csv|json]                  columns: system,fit,hole,shaft,nominal,units
```
Exit codes: `0` ok · `1` batch finished with row errors · `2` usage/input error (message on stderr).

### 6.1 Web page
Static page over the same engine (`web/`, built to `public/`). Inputs: standard, units (converting the entered size when toggled), nominal, ANSI class list or ISO hole/shaft letter + grade (with first-choice fit chips). Output: fit type and range, hole/shaft table, tolerance-zone diagram, copyable notations, look-up trace, data-review banners. State lives in the URL hash for sharing.

## 7. Data

| File | Content | Origin |
|------|---------|--------|
| `data/iso286.json` | IT01–IT18 (Table 1); shaft fundamental deviations a…zc (Tables 4, 5); hole J, Δ and exceptions (Tables 2, 3) — sizes ≤ 500 mm | hand-transcribed from ISO 286-1:2010; holes A–H, K–ZC derived by the standard’s own general/special rule |
| `data/ansi_b4_1.json` | 34 classes, 743 size-range rows: hole limits, shaft limits, printed fit limits (thousandths of an inch) | ANSI/ASME B4.1-1967 (R1987), transcribed from a third-party HTML copy and repaired/validated (see `data/README.md`) |

Both are plain JSON so a person can open them beside the book.

## 8. Verification strategy (“known answers”)

Ground truth comes in layers; each is an automated test (`npm test`, 34 tests):

1. **The standards’ own worked examples** — ISO 286-1 §4 (32 H7, 100 g6, 90 F7/f7, 29 P9, 20 K7, 40 U6, 60 M6, 80 js15); Machinery’s Handbook RC5 @ 2 in; class-notes RC3 @ ¾ in.
2. **Audit against the printed standard** (`tools/audit_iso_data.py`): every group of rows of ISO 286-1 Tables 3, 4, 5 is compared as a multiset with the standard’s text. Result: 0 transcription differences; one apparent misprint in the standard recorded (ef, 18–30 mm).
3. **Independent third-party ISO 286-2 table** (1 480 cells, 74 classes × 20 sizes): 1 474 agree; the 6 that do not are typos in that source and are listed in the test with the hand calculation that proves it.
4. **Internal redundancy of the ANSI table** — for all 743 rows: printed fit limits = limits derived from printed hole/shaft limits; each hole grade has a single tolerance per size range across every class (H7 is H7); shaft grade *n* has the tolerance of hole grade *n*; ranges contiguous; clearances grow with class number.
5. **Property tests** — hole-basis ⇔ shaft-basis symmetry (H7/g6 ≡ G7/h6 …); inch ⇔ mm equivalence; boundary tests at every “up to and including” edge.
6. **Printed handbook (photographs):** Table 1 tolerances for every row; first LT row; LC6 row; RC/LC/LT/LN/FN pages compared via esierra.me (492 rows).
7. **Next:** problem sets with published answer keys (textbook/instructor), and the printed ANSI B4.1 for the flagged rows (§9).

## 9. Known data limitations (must be read before classroom use)

* **ANSI source quality.** The only machine-readable copy found was a web transcription with ≈ 6 % of rows containing typos. Each was repaired only where the standard’s redundancy fixed the answer (logged in `tools/ansi_errata.json` with the reasoning); 23 rows were auto-corrected and 19 hand-corrected. **Three rows carry a `VERIFY` flag** (RC2 171.9–200 in; FN4 35.47–41.49 in — consistent but violating the grade rules; LC6 1.97–3.15 in — the printed standard is self-contradictory, see data/README). The CLI prints the flag when they are used.
* **8 rows missing:** LN1 above 19.69 in has hole data but no shaft/fit data in the source — treated as “not tabulated” pending the printed standard.
* **ANSI rows up to 19.69 in are verified** against Machinery's Handbook photos and an independent hard-coded table (esierra.me). **Rows from 19.69 to 200 in (251) are not in the handbook and are single-sourced** — the remaining verification gap.
* ISO 286-1:2010 Table 4 prints `ef` = −25 µm for 18–30 mm, contradicting its own Table 2 (+28) and the formula; data uses 28. (`ef` is rarely used.)
* ISO: sizes above 500 mm, and the IT14–IT18 restriction for nominal ≤ 1 mm, are not yet handled.
* ISO `j8` is only tabulated for ≤ 3 mm in Table 4 and is refused elsewhere.

## 10. Out of scope (for now)

Fit *selection* advice, thermal/press-fit force calculations, selective assembly, GD&T material-condition modifiers, thread fits, ISO 286-2 style printable tables, ASME B4.2 (metric preferred) tables.

## 11. Roadmap
See `PLAN.md`.
