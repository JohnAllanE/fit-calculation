import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isoDeviations, parseIsoClass } from '../src/iso.js';
import { computeFit } from '../src/fit.js';
import { NM_PER_MM } from '../src/dim.js';

const dev = (cls, mm) => {
  const d = isoDeviations(cls, mm * NM_PER_MM);
  return [d.nativeUpper, d.nativeLower];
};

test('worked examples printed in ISO 286-1:2010 clause 4', () => {
  assert.deepEqual(dev('H7', 32), [25, 0]);        // 32 H7
  assert.deepEqual(dev('g6', 100), [-12, -34]);    // 100 g6
  assert.deepEqual(dev('F7', 90), [71, 36]);       // 90 F7
  assert.deepEqual(dev('f7', 90), [-36, -71]);     // 90 f7
  assert.deepEqual(dev('P9', 29), [-22, -74]);     // 29 P9 (the standard prints "28 P9"; 28 and 29 share a step)
  assert.deepEqual(dev('K7', 20), [6, -15]);       // 20 K7  (ES = -2 + Delta 8)
  assert.deepEqual(dev('U6', 40), [-55, -71]);     // 40 U6  (ES = -60 + Delta 5)
  assert.deepEqual(dev('M6', 60), [-5, -24]);      // 60 M6  (ISO 286-2 Table 9)
  assert.deepEqual(dev('js15', 80), [600, -600]);  // 80 js15 = 80 +/- 0.6
});

test('textbook fits', () => {
  const f = (hole, shaft, mm) => computeFit({ system: 'iso', hole, shaft, nominal: String(mm), units: 'mm' }).fit;
  const um = (nm) => nm / 1000;
  let r = f('H7', 'g6', 25);
  assert.deepEqual([um(r.minClearance), um(r.maxClearance), r.type], [7, 41, 'clearance']);
  r = f('H7', 'p6', 40);                             // press fit: p6 = +42/+26, H7 = +25/0
  assert.deepEqual([um(r.minClearance), um(r.maxClearance), r.type], [-42, -1, 'interference']);
  r = f('H8', 'f7', 50);                             // H8 +39/0, f7 -25/-50
  assert.deepEqual([um(r.minClearance), um(r.maxClearance)], [25, 89]);
  r = f('H7', 's6', 30);                             // s6 (18-30) = +48/+35, H7 = +21/0
  assert.deepEqual([um(r.minClearance), um(r.maxClearance), r.type], [-48, -14, 'interference']);
  r = f('H7', 'k6', 8);                              // k6 (6-10) = +10/+1, H7 = +15/0
  assert.deepEqual([um(r.minClearance), um(r.maxClearance), r.type], [-10, 14, 'transition']);
  r = f('H7', 'h6', 25);
  assert.deepEqual([um(r.minClearance), um(r.maxClearance), r.type], [0, 34, 'clearance']);
});

test('hole basis and shaft basis give the same clearance range (mirrored letters)', () => {
  for (const mm of [5, 12, 25, 60, 150, 300]) {
    for (const [H, g, G, h] of [['H7', 'g6', 'G7', 'h6'], ['H8', 'f7', 'F8', 'h7'], ['H9', 'd9', 'D9', 'h9'], ['H11', 'c11', 'C11', 'h11']]) {
      const a = computeFit({ system: 'iso', hole: H, shaft: g, nominal: String(mm), units: 'mm' }).fit;
      const b = computeFit({ system: 'iso', hole: G, shaft: h, nominal: String(mm), units: 'mm' }).fit;
      assert.equal(a.minClearance, b.minClearance, `${H}/${g} vs ${G}/${h} at ${mm}`);
      assert.equal(a.maxClearance, b.maxClearance, `${H}/${g} vs ${G}/${h} at ${mm}`);
    }
  }
});

test('size-step boundaries are "over A up to and including B"', () => {
  assert.deepEqual(dev('H7', 3), [10, 0]);         // up to 3 mm
  assert.deepEqual(dev('H7', 3.001), [12, 0]);     // over 3 -> 3-6 step
  assert.deepEqual(dev('H7', 6), [12, 0]);
  assert.deepEqual(dev('H7', 6.001), [15, 0]);
  assert.deepEqual(dev('g6', 24), [-7, -20]);      // fundamental deviation step 18-24 vs IT step 18-30
  assert.deepEqual(dev('g6', 24.001), [-7, -20]);  // 24-30 step: same g value
  assert.deepEqual(dev('f6', 14), [-16, -27]);     // 10-14
  assert.deepEqual(dev('H7', 500), [63, 0]);
  assert.throws(() => isoDeviations('H7', 500.001 * NM_PER_MM), /outside the supported/);
  assert.throws(() => isoDeviations('H7', 0), /greater than zero/);
});

test('rules and limits of the standard are enforced', () => {
  assert.throws(() => isoDeviations('t6', 20 * NM_PER_MM), /not defined/);      // t starts at 24 mm
  assert.throws(() => isoDeviations('a11', 1 * NM_PER_MM), /up to 1 mm/);
  assert.throws(() => isoDeviations('J9', 20 * NM_PER_MM), /IT6, IT7 and IT8/);
  assert.throws(() => isoDeviations('K2', 20 * NM_PER_MM), /IT3 upward/);
  assert.throws(() => isoDeviations('j9', 20 * NM_PER_MM), /IT5 to IT8/);
  assert.throws(() => parseIsoClass('Hh7'), /upper case|lower case|unknown/);
  assert.throws(() => parseIsoClass('Q7'), /unknown/);
  assert.throws(() => parseIsoClass('H19'), /no standard tolerance grade/);
  assert.throws(() => computeFit({ system: 'iso', hole: 'h7', shaft: 'g6', nominal: '25', units: 'mm' }), /not a hole class/);
  assert.throws(() => computeFit({ system: 'iso', hole: 'H7', shaft: 'G6', nominal: '25', units: 'mm' }), /not a shaft class/);
});

test('special rules: JS rounding, N above IT8, M6 250-315, K above IT8', () => {
  assert.deepEqual(dev('JS7', 25), [10.5, -10.5]);     // IT7 = 21 -> +/-10.5, not rounded
  assert.deepEqual(dev('N9', 5), [0, -30]);            // N above IT8: ES = 0 (key-way N9)
  assert.deepEqual(dev('N9', 8), [0, -36]);
  assert.deepEqual(dev('N8', 8), [-3, -25]);           // -10 + Delta 7
  assert.deepEqual(dev('M6', 300), [-9, -41]);         // note b: -9, not -11
  assert.deepEqual(dev('K9', 5), [0, -30]);
  assert.deepEqual(dev('ef7', 5), [-14, -26]);        // es(ef) = -14 for 3-6 mm; IT7 = 12
});

// ---- independent cross-check against a third-party transcription of ISO 286-2 ----------------------
const fx = JSON.parse(readFileSync(new URL('./fixtures/iso286-2_crosscheck.json', import.meta.url)));
// cells where the third-party scrape disagrees with the standard (verified by hand against ISO 286-1 Tables 1-5)
const KNOWN_BAD = new Set([
  'E7 315-355', 'E7 355-400',                    // scrape: +185 ; standard: EI +125 + IT7 57 = +182
  'K6 6-10',                                     // scrape: -6  ; standard: ES -1+Delta3 = +2, EI = 2 - 9 = -7
  'f6 120-140', 'f6 140-160', 'f6 160-180',      // scrape: -48 ; standard: -43 - IT6 25 = -68
]);

test('every cell of the third-party ISO 286-2 table (74 classes x 20 sizes) agrees, except known scrape typos', () => {
  let checked = 0;
  const seenBad = new Set();
  for (const kind of ['holes', 'shafts']) {
    for (const [cls, rows] of Object.entries(fx[kind])) {
      rows.forEach(([u, l], i) => {
        const [lo, hi] = fx.ranges[i];
        const key = `${cls} ${lo}-${hi}`;
        const [eu, el] = dev(cls, hi);
        if (KNOWN_BAD.has(key)) { seenBad.add(key); assert.notDeepEqual([u, l], [eu, el], `${key} no longer differs: update KNOWN_BAD`); return; }
        assert.deepEqual([eu, el], [u + 0, l + 0], key);   // + 0 normalises the -0 in the scrape
        checked++;
      });
    }
  }
  assert.equal(seenBad.size, KNOWN_BAD.size);
  assert.equal(checked, 1480 - KNOWN_BAD.size);
});

test('independent 400-500 mm column (coban ISO 286-2 pages): all 57 classes agree except one typo in that source', () => {
  const { values } = JSON.parse(readFileSync(new URL('./fixtures/coban_iso_400_500.json', import.meta.url)));
  const bad = [];
  for (const [cls, [a, b]] of Object.entries(values)) {
    const [u, l] = dev(cls, 450);
    if (u !== Math.max(a, b) + 0 || l !== Math.min(a, b) + 0) bad.push(cls);
  }
  assert.deepEqual(bad, ['k6']);   // source prints +4; ISO 286-1 Table 5 gives k = +5 for 400-500 mm (es = 45, ei = 5)
  assert.equal(Object.keys(values).length, 57);
});
