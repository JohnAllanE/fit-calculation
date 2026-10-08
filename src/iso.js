// ISO 286-1:2010 limits and fits, computed the way the standard (and a human with the tables) does:
//   standard tolerance grade IT  (Table 1)  +  fundamental deviation (Tables 2-5, with the Delta rule).
// All table values live in data/iso286.json (hand-transcribed, audited against the standard).
import data from '../data/iso286.json' with { type: 'json' };
import { NM_PER_MM, NM_PER_UM, fromMicron } from './dim.js';

const FINE = data.sizeSteps.deviation;
const MAIN = data.sizeSteps.tolerance;
export const ISO_MAX_NOMINAL_MM = FINE[FINE.length - 1][1];

const SHAFT_LETTERS = ['a', 'b', 'c', 'cd', 'd', 'e', 'ef', 'f', 'fg', 'g', 'h', 'js', 'j', 'k', 'm', 'n', 'p', 'r', 's', 't', 'u', 'v', 'x', 'y', 'z', 'za', 'zb', 'zc'];
const HOLE_LETTERS = SHAFT_LETTERS.map((l) => l.toUpperCase());
const MIRRORED = new Set(['a', 'b', 'c', 'cd', 'd', 'e', 'ef', 'f', 'fg', 'g', 'h']);   // hole A-H: EI = -es
const BASIC_P_TO_ZC = new Set(['p', 'r', 's', 't', 'u', 'v', 'x', 'y', 'z', 'za', 'zb', 'zc']);

/** ISO 286-1 Figure 10/11 first-choice combinations (hole basis, then shaft basis). */
export const ISO_PREFERRED_FITS = {
  holeBasis: ['H11/c11', 'H9/d9', 'H8/f7', 'H7/g6', 'H7/h6', 'H7/k6', 'H7/n6', 'H7/p6', 'H7/s6', 'H7/u6'],
  shaftBasis: ['C11/h11', 'D9/h9', 'F8/h7', 'G7/h6', 'K7/h6', 'N7/h6', 'P7/h6', 'S7/h6', 'U7/h6'],
};

export const ISO_LETTERS = { hole: HOLE_LETTERS, shaft: SHAFT_LETTERS };

/** "H7" -> {kind:'hole', letter:'h', grade:7}; "g6" -> shaft; "ZC10", "js9", "cd9". */
export function parseIsoClass(text) {
  const m = /^([A-Za-z]{1,2})(01|0|[1-9]\d?)$/.exec(String(text).trim());
  if (!m) throw new Error(`"${text}" is not an ISO tolerance class (expected e.g. H7 or g6)`);
  const raw = m[1];
  const isHole = raw === raw.toUpperCase();
  const isShaft = raw === raw.toLowerCase();
  if (!isHole && !isShaft) throw new Error(`"${text}": letters must be all upper case (hole) or all lower case (shaft)`);
  const letter = raw.toLowerCase();
  if (!SHAFT_LETTERS.includes(letter)) throw new Error(`"${text}": unknown fundamental deviation "${raw}"`);
  const gradeKey = m[2] === '01' ? 'IT01' : m[2] === '0' ? 'IT0' : `IT${m[2]}`;
  if (!(gradeKey in data.IT)) throw new Error(`"${text}": no standard tolerance grade ${gradeKey}`);
  return { text: raw + m[2], kind: isHole ? 'hole' : 'shaft', letter, grade: m[2], gradeKey, gradeNum: m[2] === '01' ? -1 : Number(m[2]) };
}

const stepIndex = (steps, nominalNm) => {
  if (!(nominalNm > 0)) throw new Error('nominal size must be greater than zero');
  const i = steps.findIndex(([lo, hi]) => nominalNm > lo * NM_PER_MM && nominalNm <= hi * NM_PER_MM);
  if (i < 0) throw new Error(`nominal size is outside the supported ISO 286 range (> 0 to ${ISO_MAX_NOMINAL_MM} mm)`);
  return i;
};
const stepLabel = ([lo, hi]) => (lo === 0 ? `up to ${hi} mm` : `over ${lo} to ${hi} mm`);
const um = (x) => `${x > 0 ? '+' : ''}${x} µm`;

/**
 * Limit deviations of one tolerance class at a nominal size.
 * Returns nm values plus a `trace` that mirrors the hand procedure.
 */
export function isoDeviations(cls, nominalNm) {
  if (typeof cls === 'string') cls = parseIsoClass(cls);
  const fi = stepIndex(FINE, nominalNm);
  const mi = stepIndex(MAIN, nominalNm);
  const { letter, kind, gradeNum, gradeKey } = cls;
  const fail = (why) => { throw new Error(`${cls.text}: ${why}`); };
  const trace = [];

  const it = data.IT[gradeKey][mi];
  trace.push(`Table 1: ${gradeKey} for ${stepLabel(MAIN[mi])} = ${it} µm`);
  const IT = fromMicron(it);

  const fd = (arr, what) => {
    const v = arr[fi];
    if (v === null || v === undefined) fail(`${what} is not defined for ${stepLabel(FINE[fi])}`);
    return v;
  };
  const delta = (g) => {
    if (g < 3 || g > 8) fail(`Delta is only defined for IT3 to IT8`);
    return data.hole.delta[`IT${g}`][mi];
  };
  if ((letter === 'a' || letter === 'b') && nominalNm <= NM_PER_MM) fail('fundamental deviations A/B and a/b are not used for nominal sizes up to 1 mm');

  let upper;
  let lower;
  const S = data.shaft;

  if (kind === 'shaft') {
    if (MIRRORED.has(letter)) {
      const es = fd(S.es[letter], `fundamental deviation ${letter}`);
      trace.push(`Table 4: es(${letter}) for ${stepLabel(FINE[fi])} = ${um(es)}`);
      upper = fromMicron(es); lower = upper - IT;
    } else if (letter === 'js') {
      upper = IT / 2; lower = -IT / 2;
      trace.push(`js: es = +IT/2 = ${um(it / 2)}, ei = -IT/2`);
    } else if (letter === 'j') {
      const col = gradeNum === 5 || gradeNum === 6 ? 'j5_6' : gradeNum === 7 ? 'j7' : gradeNum === 8 ? 'j8' : fail('j is only tabulated for IT5 to IT8');
      const ei = fd(S.j_ei[col], `j${cls.grade}`);
      trace.push(`Table 4: ei(j, IT${col.slice(1).replace('_', '/')}) for ${stepLabel(FINE[fi])} = ${um(ei)}`);
      lower = fromMicron(ei); upper = lower + IT;
    } else {
      let arr = S.ei[letter];
      let label = letter;
      if (letter === 'k') { arr = gradeNum >= 4 && gradeNum <= 7 ? S.ei.k_4_7 : S.ei.k_other; label = 'k (IT4-IT7)'; if (arr === S.ei.k_other) label = 'k (other grades)'; }
      const ei = fd(arr, `fundamental deviation ${letter}`);
      trace.push(`Table 5: ei(${label}) for ${stepLabel(FINE[fi])} = ${um(ei)}`);
      lower = fromMicron(ei); upper = lower + IT;
    }
  } else if (MIRRORED.has(letter)) {
    const es = fd(S.es[letter], `fundamental deviation ${cls.text[0]}`);
    trace.push(`Table 2: EI(${letter.toUpperCase()}) = -es(${letter}) = ${um(-es)} for ${stepLabel(FINE[fi])}`);
    lower = fromMicron(-es); upper = lower + IT;
  } else if (letter === 'js') {
    upper = IT / 2; lower = -IT / 2;
    trace.push(`JS: ES = +IT/2 = ${um(it / 2)}, EI = -IT/2`);
  } else if (letter === 'j') {
    const key = `J${cls.grade}`;
    if (!(key in data.hole.J_es)) fail('J is only tabulated for IT6, IT7 and IT8');
    const es = data.hole.J_es[key][mi];
    trace.push(`Table 2: ES(${key}) for ${stepLabel(MAIN[mi])} = ${um(es)}`);
    upper = fromMicron(es); lower = upper - IT;
  } else {
    // K, M, N, P..ZC: ES = -ei(corresponding shaft)  (+ Delta for K,M,N up to IT8 and P..ZC up to IT7)
    if (gradeNum < 3) fail('this fundamental deviation is only defined from IT3 upward');
    let esBase;
    let useDelta = false;
    if (letter === 'k') { esBase = -fd(S.ei.k_4_7, 'K'); useDelta = gradeNum <= 8; if (!useDelta) esBase = 0; }
    else if (letter === 'm') {
      esBase = -fd(S.ei.m, 'M'); useDelta = gradeNum <= 8;
      if (gradeNum === 6 && mi === MAIN.findIndex(([lo]) => lo === 250)) { esBase = data.hole.exceptions.M6_250_315; useDelta = false; trace.push('Table 2 note b: M6 over 250 to 315 mm is ES = -9 µm'); }
    } else if (letter === 'n') {
      esBase = -fd(S.ei.n, 'N'); useDelta = gradeNum <= 8;
      if (gradeNum > 8) esBase = fi === 0 ? data.hole.exceptions.N_gt_IT8_up_to_3mm : 0;
    } else if (BASIC_P_TO_ZC.has(letter)) { esBase = -fd(S.ei[letter], cls.text[0]); useDelta = gradeNum <= 7; }
    else fail('unsupported fundamental deviation');
    const d = useDelta ? delta(gradeNum) : 0;
    trace.push(`Table 3: ES(${letter.toUpperCase()}) = ${um(esBase)}${useDelta ? ` + Δ(${gradeKey}) ${d}` : ''} for ${stepLabel(FINE[fi])}`);
    upper = fromMicron(esBase + d); lower = upper - IT;
  }
  return {
    class: cls.text, kind, upper: upper + 0, lower: lower + 0, tolerance: IT,
    nativeUnit: 'µm', nativeUpper: upper / NM_PER_UM + 0, nativeLower: lower / NM_PER_UM + 0,
    sizeStep: { fundamentalDeviation: stepLabel(FINE[fi]), tolerance: stepLabel(MAIN[mi]) },
    trace,
  };
}
