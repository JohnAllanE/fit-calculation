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

/** Two values written one above the other (upper over lower), padded so their decimal points line up. */
export function stackLines(upper, lower) {
  const split = (s) => { const i = s.indexOf('.'); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i)]; };
  const [ui, uf] = split(upper); const [li, lf] = split(lower);
  const wi = Math.max(ui.length, li.length); const wf = Math.max(uf.length, lf.length);
  return [ui.padStart(wi) + uf.padEnd(wf), li.padStart(wi) + lf.padEnd(wf)];
}

/**
 * All the ways of expressing one feature's size and tolerance. The strings are one-line forms (for
 * JSON, CSV and the clipboard); `stack` holds the parts that drawings write upper over lower:
 * limits (largest over smallest) and nominal + deviations (upper over lower deviation).
 * An equal bilateral tolerance stays on one line (mean ± half tolerance).
 */
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
    stack: {
      limits: { upper: fm(f.max), lower: fm(f.min) },
      deviations: { nominal, upper: fs(f.upper), lower: fs(f.lower) },
    },
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
  const row = (label, a, b) => lines.push(`${pad(label, 24)}${pad(a, w)}${b}`.trimEnd());
  const stackRow = (label, [a1, a2], [b1, b2]) => {      // upper deviation over lower
    const [ha, hb] = stackLines(a1, a2); const [sa, sb] = stackLines(b1, b2);
    row(label, ha, sa); row('', hb, sb);
  };
  row('class', result.hole.class, result.shaft.class ?? '—');
  stackRow(`deviation (${result.nativeUnit})`, [nat(result.hole.nativeUpper), nat(result.hole.nativeLower)], [nat(result.shaft.nativeUpper), nat(result.shaft.nativeLower)]);
  stackRow(`deviation (${u})`, [sgn(result.hole.upper), sgn(result.hole.lower)], [sgn(result.shaft.upper), sgn(result.shaft.lower)]);
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
      const [lu, ll] = stackLines(nt.stack.limits.upper, nt.stack.limits.lower);
      const dv = nt.stack.deviations;
      const [du, dl] = stackLines(dv.upper, dv.lower);
      const indent = ' '.repeat(dv.nominal.length + 1);
      lines.push(`  ${kind === 'hole' ? 'Hole ' : 'Shaft'}  limits      ${lu}`);
      lines.push(`                     ${ll}`);
      lines.push(`         nominal+dev ${dv.nominal} ${du}`);
      lines.push(`                     ${indent}${dl}`);
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
