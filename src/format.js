// Presentation of a computeFit() result: text, JSON and the several ways of writing the same size.
import { defaultDecimals, format, formatSigned, naturalDecimals } from './dim.js';

const NATIVE_UNITS = { ansi: 'in', iso: 'mm' };

/** Decimal places used for every length in one report. */
export function decimalsFor(result, override) {
  if (override !== undefined && override !== null) return Number(override);
  const { min, max, fixed } = defaultDecimals(result.units);
  if (result.units !== NATIVE_UNITS[result.system]) return fixed;      // converted value: fixed places
  const vals = [result.nominal.nm, result.hole.max, result.hole.min, result.shaft.max, result.shaft.min,
    result.fit.minClearance, result.fit.maxClearance, result.hole.tolerance, result.shaft.tolerance];
  return Math.max(...vals.map((v) => naturalDecimals(v, result.units, min, max)));
}

/** All the ways of expressing one feature's size and tolerance. */
export function notations(result, kind, decimals) {
  const f = result[kind];
  const u = result.units;
  const fm = (nm) => format(nm, u, decimals);
  const fs = (nm) => formatSigned(nm, u, decimals);
  const mean = (f.max + f.min) / 2;
  const half = (f.max - f.min) / 2;
  const md = Math.max(decimals, naturalDecimals(mean, u, decimals, decimals + 2), naturalDecimals(half, u, decimals, decimals + 2));
  const nominal = fm(result.nominal.nm);
  const out = {
    limits: `${fm(f.max)} / ${fm(f.min)}`,
    unilateral: `${nominal} ${fs(f.upper)} / ${fs(f.lower)}`,
    bilateral: `${format(mean, u, md)} ± ${format(half, u, md)}`,
    tolerance: fm(f.tolerance),
  };
  out.symbol = result.system === 'iso'
    ? `${nominal} ${f.class}`
    : `${nominal} ${f.class ?? '—'} (${result.designation} ${kind})`;
  return out;
}

const FIT_TEXT = { clearance: 'CLEARANCE fit', transition: 'TRANSITION fit', interference: 'INTERFERENCE fit' };

export function toJSON(result, decimalsOverride) {
  const d = decimalsFor(result, decimalsOverride);
  const n = (nm) => Number(format(nm, result.units, d));
  const feat = (f, kind) => ({
    class: f.class ?? null, upper_deviation: n(f.upper), lower_deviation: n(f.lower),
    max: n(f.max), min: n(f.min), tolerance: n(f.tolerance),
    native_upper_deviation: f.nativeUpper, native_lower_deviation: f.nativeLower,
    notation: notations(result, kind, d),
  });
  return {
    system: result.system === 'ansi' ? 'ANSI/ASME B4.1' : 'ISO 286',
    designation: result.designation, description: result.description || undefined,
    units: result.units, native_deviation_unit: result.nativeUnit, decimals: d,
    nominal: n(result.nominal.nm),
    size_range: result.sizeRange,
    hole: feat(result.hole, 'hole'), shaft: feat(result.shaft, 'shaft'),
    notes: result.notes,
    fit: {
      type: result.fit.type, min_clearance: n(result.fit.minClearance), max_clearance: n(result.fit.maxClearance),
      min_interference: result.fit.type === 'interference' ? n(-result.fit.maxClearance) : null,
      max_interference: result.fit.maxInterference === null ? null : n(result.fit.maxInterference),
      allowance: n(result.fit.allowance), total_tolerance: n(result.fit.tolerance),
    },
  };
}

export function renderText(result, opts = {}) {
  const d = decimalsFor(result, opts.decimals);
  const u = result.units;
  const fm = (nm) => format(nm, u, d);
  const sgn = (nm) => formatSigned(nm, u, d);
  const nat = (x) => (x > 0 ? `+${x}` : `${x}`);
  const lines = [];
  const std = result.system === 'ansi' ? 'ANSI/ASME B4.1' : 'ISO 286';
  lines.push(`${std}  ${result.designation}${result.description ? ` (${result.description})` : ''}   nominal ${fm(result.nominal.nm)} ${u}`);
  if (result.system === 'ansi') lines.push(`table size range: over ${result.sizeRange.over} to ${result.sizeRange.to} in`);
  else lines.push(`size steps: IT ${result.sizeRange.tolerance}; deviation ${result.sizeRange.fundamentalDeviation}`);
  const pad = (s, n) => String(s).padEnd(n);
  const w = 24;
  lines.push('');
  lines.push(`${pad('', 24)}${pad('HOLE (internal)', w)}SHAFT (external)`);
  const row = (label, a, b) => lines.push(`${pad(label, 24)}${pad(a, w)}${b}`);
  row('class', result.hole.class, result.shaft.class ?? '—');
  row(`deviation (${result.nativeUnit})`, `${nat(result.hole.nativeUpper)} / ${nat(result.hole.nativeLower)}`, `${nat(result.shaft.nativeUpper)} / ${nat(result.shaft.nativeLower)}`);
  row(`deviation (${u})`, `${sgn(result.hole.upper)} / ${sgn(result.hole.lower)}`, `${sgn(result.shaft.upper)} / ${sgn(result.shaft.lower)}`);
  row('maximum size', fm(result.hole.max), fm(result.shaft.max));
  row('minimum size', fm(result.hole.min), fm(result.shaft.min));
  row('tolerance', fm(result.hole.tolerance), fm(result.shaft.tolerance));
  lines.push('');
  const fit = result.fit;
  lines.push(`${FIT_TEXT[fit.type]}`);
  lines.push(`  smallest hole - largest shaft : ${sgn(fit.minClearance)} ${u}${fit.minClearance < 0 ? '  (interference)' : ''}`);
  lines.push(`  largest hole - smallest shaft : ${sgn(fit.maxClearance)} ${u}${fit.maxClearance < 0 ? '  (interference)' : ''}`);
  if (fit.type === 'clearance') lines.push(`  clearance range               : ${fm(fit.minClearance)} to ${fm(fit.maxClearance)} ${u}`);
  else if (fit.type === 'interference') lines.push(`  interference range            : ${fm(-fit.maxClearance)} (min) to ${fm(fit.maxInterference)} (max) ${u}`);
  else lines.push(`  range                         : ${fm(-fit.minClearance)} ${u} interference to ${fm(fit.maxClearance)} ${u} clearance`);
  for (const n of result.notes) lines.push('', `NOTE: ${n}`);
  if (opts.notation !== false) {
    lines.push('');
    lines.push('Ways to write the same sizes:');
    for (const kind of ['hole', 'shaft']) {
      const nt = notations(result, kind, d);
      lines.push(`  ${kind === 'hole' ? 'Hole ' : 'Shaft'}  limits      ${nt.limits}`);
      lines.push(`         nominal+dev ${nt.unilateral}`);
      lines.push(`         mean±tol/2  ${nt.bilateral}`);
      lines.push(`         symbol      ${nt.symbol}`);
    }
  }
  if (opts.trace) {
    lines.push('');
    lines.push('Hand-process trace:');
    for (const t of result.trace) lines.push(`  ${t}`);
  }
  return lines.join('\n');
}
