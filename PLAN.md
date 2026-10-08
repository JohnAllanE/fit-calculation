# Implementation Plan

Legend: ✅ done · 🔶 in progress / needs your input · ⬜ not started

## Architecture

```
data/            hard-coded tables (JSON), one file per standard          ← verified, hand-checkable
src/dim.js       exact integer-nanometre lengths, parsing, formatting      ← shared with web UI
src/iso.js       ISO 286-1 procedure (IT + fundamental deviation + Δ)
src/ansi.js      ANSI B4.1 row look-up
src/fit.js       computeFit(): both standards → one result object
src/format.js    text / JSON / notations
src/cli.js       commands: calc, table, list, batch
bin/fit.js       entry point
tools/           build + audit scripts for the data (Python, not used at run time)
test/            node:test suite
```
Plain ES modules, **zero runtime dependencies**, Node ≥ 22. The same `src/` runs in a browser, so the Vercel page
is a thin form over `computeFit()` — no server code, no second implementation to keep in step.

## Phase 0 — Data acquisition and verification ✅
* ISO 286-1:2010 Tables 1–5 transcribed; audited cell-group by cell-group against the standard’s text (0 diffs; 1 misprint in the standard noted).
* ANSI B4.1 tables (34 classes) extracted from a web copy, typos repaired using the standard’s internal redundancy, errata logged.
* Independent ISO 286-2 table (1 480 cells) used as cross-check.

## Phase 1 — Engine + CLI prototype ✅
* Exact arithmetic, both standards, in/mm independence, notations, trace, JSON, batch.
* 31 tests, all passing; smoke set in `examples/smoke.csv`.

## Phase 2 — Validation before anything is shown to students 🔶 **(needs you)**
1. ✅ Handbook photos + esierra.me compared (≤ 19.69 in verified; see data/README). **Still open:** sizes 19.69–200 in (251 rows) — need the full ANSI B4.1 text (handbook only reprints to 19.69 in). Flagged rows: RC2 171.9–200, FN4 35.47–41.49, LC6 1.97–3.15 (printed misprint — decide which value the course wants).
2. **Supply 10–20 textbook/problem-set questions with answer keys** (any mix of ANSI/ISO, in/mm). They go into `test/known_answers.json` and become regression tests. I can also draft a set from the standards’ worked examples.
3. Decide how to treat the 8 missing LN1 rows (large sizes) — probably “not tabulated”.
4. Confirm conventions: negative clearance = interference in batch output; fit-type boundary (min clearance = 0 ⇒ clearance fit).

## Phase 3 — Problem-set tooling (CLI) ⬜
* `fit gen` — generate random problems (system, class, size, units) from a seed, with a separate answer-key file (`--answers`).
* `fit check` — grade a student answer file against the computed key (tolerance for rounding).
* Reverse lookups: `fit find --system iso --nominal 25 --min-clearance 0.01 --max-clearance 0.05` → candidate fits; `fit classify 25 H7 g6`.
* CSV/Markdown/LaTeX output for worksheets.

## Phase 4 — Web demo on Vercel 🔶 built, not yet deployed
* Static page (`index.html` + ES modules; no framework needed): system toggle, units toggle, nominal, class pickers (ANSI list / ISO letter + grade), result card with all notations, a limits diagram (hole/shaft tolerance zones on a common baseline), “show the table lookup” panel driven by `trace`.
* ✅ Built: `web/`, `scripts/build-web.mjs` (esbuild bundle → `public/`), `vercel.json`. Shows hole/shaft table, fit band, tolerance-zone diagram with min/max clearance arrows, copyable notations, table look-up trace, review-flag banners, shareable URL.
* ⬜ To deploy: `npx vercel` (needs your Vercel login/project). ⬜ Still to decide: decimals control, print stylesheet for handouts, a few more screenshots/tests (currently checked by hand in headless Chrome at desktop and phone widths).

## Phase 5 — Coverage extensions ⬜
* ISO 500–3150 mm (Tables 1–5 rows above 500 mm are in the same standard; the coban 400–3150 mm pages can serve as an independent cross-check).
* Remaining ISO restrictions (IT14–18 for ≤ 1 mm, etc.).
* ASME B4.2 (metric preferred limits and fits, hole/shaft-basis RC/LC/LT/LN/FN in mm) if the course uses it.
* Printable ISO 286-2 style tables from the engine.
