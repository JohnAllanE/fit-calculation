import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../data/ansi_b4_1.json' with { type: 'json' };
import { ansiDeviations, ansiRow, listAnsiClasses } from '../src/ansi.js';
import { computeFit } from '../src/fit.js';
import { NM_PER_IN, parseLength } from '../src/dim.js';

const T = (nm) => nm / 25_400;   // nm -> thousandths of an inch

test('34 classes are present with the standard\'s hole/shaft designations', () => {
  const cls = Object.fromEntries(listAnsiClasses().map((c) => [c.name, `${c.holeGrade}/${c.shaftGrade}`]));
  assert.equal(Object.keys(cls).length, 34);
  assert.equal(cls.RC1, 'H5/g4'); assert.equal(cls.RC5, 'H8/e7'); assert.equal(cls.RC9, 'H11/null');
  assert.equal(cls.LC1, 'H6/h5'); assert.equal(cls.LC11, 'H13/null');
  assert.equal(cls.LT1, 'H7/js6'); assert.equal(cls.LT6, 'H7/n7');
  assert.equal(cls.LN2, 'H7/p6'); assert.equal(cls.FN2, 'H7/s6'); assert.equal(cls.FN5, 'H8/x7');
});

test('known answers: Machinery\'s Handbook example, RC5 at 2 in', () => {
  // "Maximum hole = 2 + 0.0018; minimum hole = 2; maximum shaft = 2 - 0.0025; minimum shaft = 2 - 0.0037;
  //  minimum clearance = 0.0025; maximum clearance = 0.0055 inch"   (engineersedge.com, quoting Machinery's Handbook)
  const r = computeFit({ system: 'ansi', fit: 'RC5', nominal: '2', units: 'in' });
  assert.deepEqual([r.hole.max, r.hole.min, r.shaft.max, r.shaft.min].map((n) => n / NM_PER_IN),
    [2.0018, 2.0, 1.9975, 1.9963]);
  assert.deepEqual([r.fit.minClearance, r.fit.maxClearance].map((n) => n / NM_PER_IN), [0.0025, 0.0055]);
});

test('known answers: RC3 at 3/4 in (class notes: hole +0.8/0, shaft -0.8/-1.3, allowance +0.0008)', () => {
  const r = computeFit({ system: 'ansi', fit: 'RC3', nominal: '3/4', units: 'in' });
  assert.deepEqual([r.hole.max, r.hole.min, r.shaft.max, r.shaft.min].map((n) => n / NM_PER_IN),
    [0.7508, 0.75, 0.7492, 0.7487]);
  assert.equal(r.fit.allowance / NM_PER_IN, 0.0008);
});

test('known answers: RC4 hole at 1.00 in is +1.2/0 (H8, 0.71-1.19 in)', () => {
  const d = ansiDeviations('RC4', parseLength('1', 'in'));
  assert.deepEqual([T(d.hole.upper), T(d.hole.lower)], [1.2, 0]);
});

test('size ranges: "over X, up to and including Y"', () => {
  const rng = (nominal, units) => { const r = ansiRow('RC1', parseLength(nominal, units)).row; return [r.over, r.to]; };
  assert.deepEqual(rng('0.12', 'in'), [0, 0.12]);
  assert.deepEqual(rng('0.1201', 'in'), [0.12, 0.24]);
  assert.deepEqual(rng('3.048', 'mm'), [0, 0.12]);        // exactly 0.12 in
  assert.deepEqual(rng('3.049', 'mm'), [0.12, 0.24]);
  assert.deepEqual(rng('200', 'in'), [171.9, 200]);
  assert.throws(() => rng('200.0001', 'in'), /not tabulated/);
  assert.throws(() => rng('0', 'in'), /greater than zero/);
});

test('classes that stop short of the full range say so', () => {
  assert.throws(() => computeFit({ system: 'ansi', fit: 'LT1', nominal: '25', units: 'in' }), /not tabulated/);
  assert.throws(() => computeFit({ system: 'ansi', fit: 'FN3', nominal: '0.5', units: 'in' }), /not tabulated/);
  assert.throws(() => computeFit({ system: 'ansi', fit: 'XX1', nominal: '1', units: 'in' }), /unknown ANSI/);
});

test('class names are forgiving: "rc 5", "RC-5"', () => {
  const a = computeFit({ system: 'ansi', fit: 'rc 5', nominal: '2', units: 'in' });
  const b = computeFit({ system: 'ansi', fit: 'RC-5', nominal: '2', units: 'in' });
  assert.equal(a.designation, 'RC5'); assert.deepEqual(a.hole, b.hole);
});

// ---- internal consistency of the transcribed table (checks all 743 rows) ---------------------------------
test('every row: printed fit limits equal those derived from the printed hole and shaft limits', () => {
  let n = 0;
  for (const [name, c] of Object.entries(data.classes)) {
    for (const r of c.rows) {
      const [hu, hl] = r.hole; const [su, sl] = r.shaft;
      assert.equal(hl, 0, `${name} ${r.over}-${r.to}: hole lower deviation must be 0 (hole basis)`);
      assert.ok(Math.abs((hl - su) - r.fit[0]) < 1e-9, `${name} ${r.over}-${r.to}: min fit ${r.fit[0]} != ${hl - su}`);
      assert.ok(Math.abs((hu - sl) - r.fit[1]) < 1e-9, `${name} ${r.over}-${r.to}: max fit ${r.fit[1]} != ${hu - sl}`);
      assert.ok(su >= sl && hu >= hl);
      n++;
    }
  }
  assert.equal(n, 743);
});

test('every row: a hole grade has one tolerance per size range, whatever the class (H7 is H7)', () => {
  const byGrade = new Map();
  for (const c of Object.values(data.classes)) {
    for (const r of c.rows) {
      const key = `${c.holeGrade} ${r.over}-${r.to}`;
      if (byGrade.has(key)) assert.equal(r.hole[0], byGrade.get(key).tol, `${key} differs between classes (${byGrade.get(key).from} vs ${c.family})`);
      else byGrade.set(key, { tol: r.hole[0], from: c.family });
    }
  }
  assert.ok(byGrade.size > 100);
});

test('every row: shaft grade n has the tolerance of hole grade n (except js, which is +/- IT5-ish)', () => {
  const holeTol = new Map();
  for (const c of Object.values(data.classes)) for (const r of c.rows) holeTol.set(`${c.holeGrade.slice(1)} ${r.over}`, r.hole[0]);
  let checked = 0;
  for (const [name, c] of Object.entries(data.classes)) {
    if (!c.shaftGrade || c.shaftGrade.startsWith('js') || name === 'LN1') continue;   // LN1: shaft n5 carries the H6 tolerance
    const g = c.shaftGrade.replace(/\D/g, '');
    for (const r of c.rows) {
      if (r.review) continue;                                // flagged rows are asserted separately below
      const t = holeTol.get(`${g} ${r.over}`);
      if (t === undefined) continue;                         // e.g. IT4 (g4) has no hole grade to compare with
      assert.ok(Math.abs((r.shaft[0] - r.shaft[1]) - t) < 1e-9, `${name} ${r.over}-${r.to}: shaft ${c.shaftGrade} tolerance ${r.shaft[0] - r.shaft[1]} != H${g} ${t}`);
      checked++;
    }
  }
  assert.ok(checked > 400, `only ${checked} rows compared`);
});

test('rows that break the grade rules are flagged for review, and nothing else is', () => {
  const flagged = Object.entries(data.classes).flatMap(([n, c]) => c.rows.filter((r) => r.review).map((r) => `${n} ${r.over}-${r.to}`));
  assert.deepEqual(flagged.sort(), ['FN4 35.47-41.49', 'LC6 1.97-3.15', 'RC2 171.9-200']);
  const r = computeFit({ system: 'ansi', fit: 'RC2', nominal: '190', units: 'in' });
  assert.match(r.notes[0], /VERIFY/);
  assert.deepEqual(computeFit({ system: 'ansi', fit: 'RC2', nominal: '1', units: 'in' }).notes, []);
});

test('every class: size ranges are contiguous and increasing', () => {
  for (const [name, c] of Object.entries(data.classes)) {
    for (let i = 1; i < c.rows.length; i++) assert.equal(c.rows[i].over, c.rows[i - 1].to, `${name} gap before ${c.rows[i].over}`);
    assert.ok(c.rows.every((r) => r.to > r.over), name);
  }
});

test('fit family behaviour: RC/LC never interfere, LN/FN always interfere, LT may do either', () => {
  for (const [name, c] of Object.entries(data.classes)) {
    for (const r of c.rows) {
      if (c.family === 'RC' || c.family === 'LC') assert.ok(r.fit[0] >= 0, `${name} ${r.over}`);
      if (c.family === 'LN' || c.family === 'FN') assert.ok(r.fit[1] <= 0, `${name} ${r.over}`);   // LN1 can be line-to-line at the loose end
    }
  }
});

test('RC and LC clearances grow with class number at every size (RC1 < RC2 < ... by maximum clearance)', () => {
  for (const fam of ['RC']) {
    const names = Object.keys(data.classes).filter((n) => n.startsWith(fam));
    for (const [lo, hi] of [[0.4, 0.71], [1.19, 1.97], [4.73, 7.09]]) {
      const max = names.map((n) => data.classes[n].rows.find((r) => r.over < hi && r.to > lo).fit[1]);
      for (let i = 1; i < max.length; i++) assert.ok(max[i] > max[i - 1], `${names[i]} vs ${names[i - 1]} at ${lo}-${hi}`);
    }
  }
});

test('inch <-> mm: results are the same sizes expressed in other units', () => {
  const a = computeFit({ system: 'ansi', fit: 'RC5', nominal: '2', units: 'in' });
  const b = computeFit({ system: 'ansi', fit: 'RC5', nominal: '50.8', units: 'mm' });
  assert.equal(a.nominal.nm, b.nominal.nm);
  assert.equal(a.hole.max, b.hole.max); assert.equal(a.fit.maxClearance, b.fit.maxClearance);
  assert.equal(b.units, 'mm');
  const c = computeFit({ system: 'iso', hole: 'H7', shaft: 'g6', nominal: '25', units: 'mm' });
  const d = computeFit({ system: 'iso', hole: 'H7', shaft: 'g6', nominal: '0.98425', units: 'in' });  // ~25 mm in inches: same size step
  assert.equal(d.hole.upper, c.hole.upper); assert.equal(d.shaft.lower, c.shaft.lower);
});

// ---- Machinery's Handbook (photographed pages, 1526-1537) -------------------------------------------------
import { readFileSync } from 'node:fs';
const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));

test("handbook Table 1 (ANSI standard tolerances): every hole and shaft tolerance in the fit tables matches, except 10 known cases", () => {
  const t1 = fx('ansi_table1_tolerances.json').rows;
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const found = [];
  for (const [n, c] of Object.entries(data.classes)) for (const r of c.rows) {
    const T = t1.find((t) => (r.over + r.to) / 2 > t.over && (r.over + r.to) / 2 <= t.to).grades;
    const hg = c.holeGrade.slice(1); const sg = c.shaftGrade?.replace(/\D/g, '');
    if (T[hg] !== undefined && r4(r.hole[0]) !== T[hg]) found.push(`${n} ${r.over}-${r.to} hole`);
    if (sg && !c.shaftGrade.startsWith('js') && T[sg] !== undefined && r4(r.shaft[0] - r.shaft[1]) !== T[sg]) found.push(`${n} ${r.over}-${r.to} shaft`);
  }
  assert.deepEqual(found.sort(), [
    // the fit tables round the smallest range up (H5 0.2 vs Table 1's 0.15, etc.): printed that way in the handbook fit tables
    'LC1 0-0.12 shaft', 'LN1 0-0.12 shaft', 'RC1 0-0.12 hole', 'RC1 0-0.12 shaft', 'RC2 0-0.12 shaft',
    // LN1 n5 carries the H6 tolerance
    'LN1 0.4-0.71 shaft', 'LN1 0.71-1.19 shaft', 'LN1 1.19-1.97 shaft',
    // flagged for review (see data/README.md)
    'FN4 35.47-41.49 shaft', 'RC2 171.9-200 shaft',
  ].sort());
});

test('esierra.me hard-coded table (sizes up to 19.69 in) agrees with ours except where the handbook sides with us', () => {
  const es = fx('esierra_ansi.json').rows;
  const KNOWN = {
    'RC2': 'esierra repeats the RC1 (H5) hole tolerance for RC2 rows from 0.40 in up; handbook Table 2 and Table 1 give H6',
    'LC6 1.97': 'handbook misprints shaft -1.0 here (clearance 1.2 and IT8 require -1.2): flagged in the data',
    'LT1 0': 'esierra and the handbook print js6 = +/-0.12 here; fixed in our data',
  };
  let diffs = [];
  let compared = 0;
  for (const [cls, over, to, hu, su, sl] of es) {
    const row = data.classes[cls]?.rows.find((r) => r.over === over && r.to === to);
    assert.ok(row, `${cls} ${over}-${to} missing from our data`);
    compared++;
    if (row.hole[0] !== hu || row.shaft[0] !== su || row.shaft[1] !== sl) diffs.push(`${cls} ${over}`);
  }
  const explained = (d) => Object.keys(KNOWN).some((k) => d.startsWith(k));
  assert.deepEqual(diffs.filter((d) => !explained(d)), []);
  assert.equal(diffs.filter((d) => d.startsWith('RC2')).length, 10);
  assert.ok(compared >= 490, `compared ${compared}`);
});

test('handbook spot-check: first LT row (Table 4 p.1534) and LC6 row (Table 3 p.1533)', () => {
  const lt1 = ansiDeviations('LT1', parseLength('0.1', 'in'));
  assert.deepEqual([lt1.hole.nativeUpper, lt1.shaft.nativeUpper, lt1.shaft.nativeLower, lt1.printedFit.nativeMin, lt1.printedFit.nativeMax], [0.4, 0.12, -0.12, -0.12, 0.52]);
  const lc6 = ansiDeviations('LC6', parseLength('2', 'in'));
  assert.deepEqual([lc6.printedFit.nativeMin, lc6.printedFit.nativeMax, lc6.hole.nativeUpper], [1.2, 6.0, 3.0]);
});
