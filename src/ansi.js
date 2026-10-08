// ANSI/ASME B4.1-1967 (R1987) preferred limits and fits for cylindrical parts.
// Each class (RC1..FN5) is a table of size ranges; every row gives the standard hole and shaft
// limits (thousandths of an inch) and the printed clearance/interference limits.
import data from '../data/ansi_b4_1.json' with { type: 'json' };
import { NM_PER_IN, NM_PER_THOU, fromThou } from './dim.js';

export const ANSI_FAMILIES = {
  RC: 'Running and sliding fits',
  LC: 'Locational clearance fits',
  LT: 'Locational transition fits',
  LN: 'Locational interference fits',
  FN: 'Force and shrink fits',
};

export function listAnsiClasses() {
  return Object.entries(data.classes).map(([name, c]) => ({
    name, family: c.family, description: c.description, holeGrade: c.holeGrade, shaftGrade: c.shaftGrade,
    minSizeIn: c.rows[0].over, maxSizeIn: c.rows[c.rows.length - 1].to, rows: c.rows.length,
  }));
}

export function parseAnsiClass(text) {
  const name = String(text).replace(/[\s-]+/g, '').toUpperCase();
  if (!(name in data.classes)) throw new Error(`unknown ANSI B4.1 class "${text}" (try RC1-RC9, LC1-LC11, LT1-LT6, LN1-LN3, FN1-FN5)`);
  return name;
}

const inNm = (inches) => Math.round(inches * NM_PER_IN);

export function ansiRows(name) { return data.classes[parseAnsiClass(name)].rows; }

/** Table row of the class that contains the nominal size ("over X, up to and including Y"). */
export function ansiRow(name, nominalNm) {
  name = parseAnsiClass(name);
  const c = data.classes[name];
  if (!(nominalNm > 0)) throw new Error('nominal size must be greater than zero');
  const row = c.rows.find((r) => nominalNm > inNm(r.over) && nominalNm <= inNm(r.to));
  if (!row) {
    const lo = c.rows[0].over, hi = c.rows[c.rows.length - 1].to;
    throw new Error(`${name} is not tabulated for this size (the standard covers over ${lo} to ${hi} in for ${name})`);
  }
  return { cls: c, name, row };
}

/** Deviations (nm) for hole and shaft of a class at a nominal size, plus the printed fit limits. */
export function ansiDeviations(name, nominalNm) {
  const { cls, name: n, row } = ansiRow(name, nominalNm);
  const [hu, hl] = row.hole.map(fromThou);
  const [su, sl] = row.shaft.map(fromThou);
  const trace = [
    `B4.1 ${n} (${cls.description}): size range over ${row.over} to ${row.to} in`,
    `hole ${cls.holeGrade}: ${fmtT(row.hole[0])} / ${fmtT(row.hole[1])} thou`,
    `shaft ${cls.shaftGrade ?? '(no symbol)'}: ${fmtT(row.shaft[0])} / ${fmtT(row.shaft[1])} thou`,
  ];
  return {
    class: n, description: cls.description, family: cls.family,
    hole: { class: cls.holeGrade, upper: hu, lower: hl, tolerance: hu - hl, nativeUpper: row.hole[0], nativeLower: row.hole[1] },
    shaft: { class: cls.shaftGrade, upper: su, lower: sl, tolerance: su - sl, nativeUpper: row.shaft[0], nativeLower: row.shaft[1] },
    printedFit: { min: fromThou(row.fit[0]), max: fromThou(row.fit[1]), nativeMin: row.fit[0], nativeMax: row.fit[1] },
    sizeRange: { over: row.over, to: row.to, unit: 'in' },
    notes: row.review ? [`DATA REVIEW FLAG: ${row.review}`] : [],
    trace,
  };
}

const fmtT = (x) => (x > 0 ? '+' : '') + x;
export { NM_PER_THOU };
