# fit-calc

Hole/shaft fit calculator for **ANSI/ASME B4.1** (RC, LC, LT, LN, FN) and **ISO 286** (H7/g6 …), driven by
hard-coded standard tables so results match the by-hand procedure. Inch or mm with either standard.

```
node bin/fit.js calc --system ansi --fit RC5 --nominal 2
node bin/fit.js calc --system iso  --fit H7/p6 --nominal 40 --trace
node bin/fit.js calc --system iso  --fit H7/g6 --nominal 1 --units in
node bin/fit.js table --system ansi --fit RC5                # the book's table for a class
node bin/fit.js batch examples/smoke.csv
npm test
npm run web        # build the web page into public/ and serve it at http://localhost:5173
```

* Spec: [SPEC.md](SPEC.md) · Plan: [PLAN.md](PLAN.md) · Data provenance and verification: [data/README.md](data/README.md)
* Requires Node ≥ 22. No dependencies.

## Web page
`web/` (HTML + CSS + `main.js`) is a form over the same `src/` engine; `npm run build:web` bundles it (with the table data inlined) into `public/`,
a static site with no server code. `vercel.json` already points Vercel at that build, so deploying is `vercel` (or connect the repo in the dashboard).
The selected case is kept in the URL hash, so "Copy link to this problem" gives students an exact starting point.
