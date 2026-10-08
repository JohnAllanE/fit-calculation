// The fit calculator: one entry point for both standards.
import { NM_PER_IN, NM_PER_MM, NM_PER_THOU, NM_PER_UM, normalizeUnits, parseLength } from './dim.js';
import { ansiDeviations, parseAnsiClass } from './ansi.js';
import { isoDeviations, parseIsoClass } from './iso.js';

export const SYSTEMS = ['ansi', 'iso'];

/**
 * @param {object} input
 * @param {'ansi'|'iso'} input.system
 * @param {string|number} input.nominal   basic size, e.g. "25", "1.5", "1-1/2"
 * @param {'mm'|'in'} input.units         units of `nominal` and of the reported sizes
 * @param {string} [input.fit]            ANSI class "RC5"; or ISO "H7/g6"
 * @param {string} [input.hole]           ISO hole class "H7"
 * @param {string} [input.shaft]          ISO shaft class "g6"
 */
export function computeFit(input) {
  const system = String(input.system ?? '').toLowerCase();
  if (!SYSTEMS.includes(system)) throw new Error(`system must be "ansi" or "iso"`);
  const units = normalizeUnits(input.units ?? (system === 'ansi' ? 'in' : 'mm'));
  const nominalNm = parseLength(input.nominal, units);
  const trace = [];
  let hole; let shaft; let designation; let description; let nativeUnit; let sizeRange;
  const notes = [];

  if (system === 'ansi') {
    const cls = parseAnsiClass(input.fit);
    const d = ansiDeviations(cls, nominalNm);
    hole = d.hole; shaft = d.shaft; designation = cls; description = d.description; nativeUnit = 'thou';
    sizeRange = d.sizeRange;
    trace.push(...d.trace);
    notes.push(...d.notes);
  } else {
    let hc = input.hole; let sc = input.shaft;
    if (input.fit && (!hc || !sc)) {
      const m = /^\s*([A-Za-z]+\d+)\s*[/-]\s*([A-Za-z]+\d+)\s*$/.exec(input.fit);
      if (!m) throw new Error(`ISO fit must look like H7/g6 (got "${input.fit}")`);
      [, hc, sc] = m;
    }
    if (!hc || !sc) throw new Error('ISO fits need a hole class and a shaft class, e.g. H7 and g6');
    const h = parseIsoClass(hc); const s = parseIsoClass(sc);
    if (h.kind !== 'hole') throw new Error(`"${hc}" is not a hole class (holes use capital letters)`);
    if (s.kind !== 'shaft') throw new Error(`"${sc}" is not a shaft class (shafts use lower-case letters)`);
    const hd = isoDeviations(h, nominalNm); const sd = isoDeviations(s, nominalNm);
    hole = { class: h.text, upper: hd.upper, lower: hd.lower, tolerance: hd.tolerance, nativeUpper: hd.nativeUpper, nativeLower: hd.nativeLower };
    shaft = { class: s.text, upper: sd.upper, lower: sd.lower, tolerance: sd.tolerance, nativeUpper: sd.nativeUpper, nativeLower: sd.nativeLower };
    designation = `${h.text}/${s.text}`; description = ''; nativeUnit = 'µm';
    sizeRange = { fundamentalDeviation: hd.sizeStep.fundamentalDeviation, tolerance: hd.sizeStep.tolerance };
    trace.push('hole:', ...hd.trace.map((t) => '  ' + t), 'shaft:', ...sd.trace.map((t) => '  ' + t));
  }

  const holeMax = nominalNm + hole.upper; const holeMin = nominalNm + hole.lower;
  const shaftMax = nominalNm + shaft.upper; const shaftMin = nominalNm + shaft.lower;
  const minClearance = holeMin - shaftMax;   // smallest hole - largest shaft (negative = interference)
  const maxClearance = holeMax - shaftMin;   // largest hole - smallest shaft
  const type = minClearance >= 0 ? 'clearance' : maxClearance <= 0 ? 'interference' : 'transition';

  return {
    system, designation, description, units, nativeUnit,
    nominal: { nm: nominalNm, input: String(input.nominal) },
    sizeRange,
    hole: { ...hole, max: holeMax, min: holeMin },        // internal feature
    shaft: { ...shaft, max: shaftMax, min: shaftMin },    // external feature
    fit: { type, minClearance, maxClearance, allowance: minClearance, minInterference: maxClearance <= 0 ? -maxClearance : null, maxInterference: minClearance < 0 ? -minClearance : null, tolerance: hole.tolerance + shaft.tolerance },
    notes,
    trace,
  };
}

export { NM_PER_IN, NM_PER_MM, NM_PER_THOU, NM_PER_UM };
