// Exact length arithmetic. Every length is an integer number of nanometres, so that inch/mm
// conversion (1 in = 25.4 mm exactly) and size-range boundary tests never suffer float error.

export const NM_PER_MM = 1_000_000;
export const NM_PER_IN = 25_400_000;
export const NM_PER_THOU = 25_400;   // 0.001 in  (ANSI B4.1 tables are in thousandths of an inch)
export const NM_PER_UM = 1_000;      // ISO 286 tables are in micrometres

const FACTOR = { mm: NM_PER_MM, in: NM_PER_IN };
const MAX_DECIMALS = { mm: 6, in: 5 }; // the most decimals that still land on a whole nanometre

export function normalizeUnits(u) {
  const s = String(u ?? '').trim().toLowerCase();
  if (s === 'mm' || s === 'millimetre' || s === 'millimeter' || s === 'metric') return 'mm';
  if (s === 'in' || s === 'inch' || s === 'inches' || s === '"') return 'in';
  throw new Error(`units must be "mm" or "in" (got "${u}")`);
}

/** Parse "25", "25.4", "1.5", "1-1/2", "1 1/2", "3/4" into integer nanometres. */
export function parseLength(value, units) {
  units = normalizeUnits(units);
  const f = FACTOR[units];
  const text = String(value).trim();
  let m = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (m && (m[1] || m[2])) {
    const whole = m[1] ? Number(m[1]) : 0;
    const frac = m[2] ?? '';
    if (frac.length > MAX_DECIMALS[units]) {
      throw new Error(`"${text}": at most ${MAX_DECIMALS[units]} decimal places for ${units}`);
    }
    return whole * f + (frac ? Number(frac) * (f / 10 ** frac.length) : 0);
  }
  m = /^(?:(\d+)[\s-]+)?(\d+)\/(\d+)$/.exec(text);
  if (m) {
    const nm = (m[1] ? Number(m[1]) : 0) * f + (Number(m[2]) * f) / Number(m[3]);
    if (!Number.isInteger(nm)) throw new Error(`"${text}" is not an exact length in nanometres`);
    return nm;
  }
  throw new Error(`cannot read "${text}" as a length`);
}

// "+ 0" turns -0 into 0
export const fromThou = (x) => Math.round(x * NM_PER_THOU) + 0;
export const fromMicron = (x) => Math.round(x * NM_PER_UM) + 0;
export const fromInch = (x) => Math.round(x * NM_PER_IN) + 0;
export const fromMm = (x) => Math.round(x * NM_PER_MM) + 0;

// --- formatting ---------------------------------------------------------------------

const DEN = { mm: 1_000_000n, in: 25_400_000n };

/** nm -> string with exactly `decimals` decimals, rounding half away from zero. */
export function format(nm, units, decimals) {
  units = normalizeUnits(units);
  const neg = nm < 0;
  const num = BigInt(Math.abs(nm)) * 10n ** BigInt(decimals);
  const den = DEN[units];
  const q = (2n * num + den) / (2n * den);
  let s = q.toString().padStart(decimals + 1, '0');
  if (decimals > 0) s = `${s.slice(0, -decimals)}.${s.slice(-decimals)}`;
  return (neg && q !== 0n ? '-' : '') + s;
}

/** Fewest decimals (>= min) that show the value exactly, else `max`. */
export function naturalDecimals(nm, units, min, max) {
  units = normalizeUnits(units);
  for (let d = min; d <= max; d++) {
    const q = BigInt(Math.abs(format(nm, units, d).replace(/[-.]/g, '')));
    if (q * DEN[units] === BigInt(Math.abs(nm)) * 10n ** BigInt(d)) return d;
  }
  return max;
}

/** Display policy: exact when the value is native to the table's unit system, else fixed. */
export function defaultDecimals(units) { return units === 'mm' ? { min: 3, max: 6, fixed: 4 } : { min: 4, max: 6, fixed: 5 }; }

/** Format with a sign ("+0.021"); zero prints as "0.000". */
export function formatSigned(nm, units, decimals) {
  const s = format(nm, units, decimals);
  return nm > 0 && !s.startsWith('-') && Number(s) !== 0 ? `+${s}` : s;
}
