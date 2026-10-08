import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { computeFit } from './fit.js';
import { renderText, toJSON } from './format.js';
import { listAnsiClasses, ansiRows, parseAnsiClass, ANSI_FAMILIES } from './ansi.js';
import { ISO_LETTERS, ISO_MAX_NOMINAL_MM, ISO_PREFERRED_FITS, isoDeviations, parseIsoClass } from './iso.js';
import { format, normalizeUnits, parseLength } from './dim.js';
import data from '../data/iso286.json' with { type: 'json' };

const HELP = `fit - hole/shaft fit calculator (ANSI/ASME B4.1 and ISO 286, table-driven)

USAGE
  fit calc  --system ansi --fit RC5 --nominal 2 [--units in|mm]
  fit calc  --system iso  --fit H7/g6 --nominal 25 [--units mm|in]
  fit calc  --system iso  --hole H7 --shaft p6 --nominal 40
  fit table --system ansi --fit RC5 [--nominal 2]       print the standard's table row(s)
  fit table --system iso  --class H7 [--nominal 25]     deviations per size step
  fit list  [ansi|iso]                                  available classes
  fit batch <file.csv|file.jsonl> [--format csv|json]   many fits at once (problem sets)

OPTIONS
  --system ansi|iso     which standard's tables to use (independent of units)
  --units  mm|in        units for --nominal and for all reported sizes
                        (default: in for ansi, mm for iso)
  --nominal <size>      basic size: 25, 1.5, 1-1/2, 3/4 ...
  --json                machine-readable output     --decimals N   force N decimal places
  --trace               show the table look-ups as done by hand
  --no-notation         omit the "ways to write the same sizes" block

BATCH FILE (CSV header row required; columns): system,fit,hole,shaft,nominal,units
  ansi,RC5,,,2,in
  iso,H7/g6,,,25,mm
  iso,,H7,p6,40,mm
`;

function fail(msg) { console.error(`error: ${msg}`); process.exitCode = 2; }

const COMMON = {
  system: { type: 'string', short: 's' }, fit: { type: 'string', short: 'f' }, hole: { type: 'string' }, shaft: { type: 'string' },
  class: { type: 'string', short: 'c' }, nominal: { type: 'string', short: 'n' }, units: { type: 'string', short: 'u' },
  json: { type: 'boolean' }, trace: { type: 'boolean' }, decimals: { type: 'string' }, 'no-notation': { type: 'boolean' },
  format: { type: 'string' }, help: { type: 'boolean', short: 'h' },
};

export function main(argv) {
  const cmd = argv[0] && !argv[0].startsWith('-') ? argv[0] : 'help';
  const rest = cmd === 'help' ? argv : argv.slice(1);
  let parsed;
  try { parsed = parseArgs({ args: rest, options: COMMON, allowPositionals: true }); } catch (e) { return fail(e.message); }
  const { values: v, positionals } = parsed;
  if (cmd === 'help' || v.help) { console.log(HELP); return; }
  try {
    if (cmd === 'calc') return calc(v);
    if (cmd === 'table') return table(v);
    if (cmd === 'list') return list(positionals[0]);
    if (cmd === 'batch') return batch(positionals[0], v);
    fail(`unknown command "${cmd}" (try: fit help)`);
  } catch (e) { fail(e.message); }
}

function inputFrom(v) {
  if (!v.system) throw new Error('--system ansi|iso is required');
  if (!v.nominal) throw new Error('--nominal is required');
  return { system: v.system, fit: v.fit, hole: v.hole, shaft: v.shaft, nominal: v.nominal, units: v.units };
}

function calc(v) {
  const r = computeFit(inputFrom(v));
  if (v.json) console.log(JSON.stringify(toJSON(r, v.decimals), null, 2));
  else console.log(renderText(r, { decimals: v.decimals, trace: v.trace, notation: !v['no-notation'] }));
}

function list(which) {
  if (!which || which === 'ansi') {
    console.log('ANSI/ASME B4.1 classes (hole-basis; sizes in inches):');
    let fam = '';
    for (const c of listAnsiClasses()) {
      if (c.family !== fam) { fam = c.family; console.log(`\n  ${ANSI_FAMILIES[fam]}`); }
      console.log(`    ${c.name.padEnd(5)} ${c.description.padEnd(20)} ${c.holeGrade}/${c.shaftGrade ?? '-'}`.padEnd(48) + `${c.minSizeIn}-${c.maxSizeIn} in`);
    }
  }
  if (!which || which === 'iso') {
    console.log(`\nISO 286 (up to ${ISO_MAX_NOMINAL_MM} mm): any hole class (${ISO_LETTERS.hole.join(' ')}) with grade IT01-IT18, and any shaft class (${ISO_LETTERS.shaft.join(' ')}).`);
    console.log(`  Preferred hole-basis fits: ${ISO_PREFERRED_FITS.holeBasis.join(' ')}`);
    console.log(`  Preferred shaft-basis fits: ${ISO_PREFERRED_FITS.shaftBasis.join(' ')}`);
  }
}

function table(v) {
  if (v.system === 'ansi') {
    const name = parseAnsiClass(v.fit ?? v.class);
    const all = ansiRows(name);
    let rows = all;
    if (v.nominal) {
      const nm = parseLength(v.nominal, v.units ?? 'in');
      const r = computeFit({ system: 'ansi', fit: name, nominal: v.nominal, units: v.units ?? 'in' });
      rows = all.filter((x) => x.over === r.sizeRange.over && x.to === r.sizeRange.to);
      void nm;
    }
    const meta = listAnsiClasses().find((c) => c.name === name);
    console.log(`ANSI/ASME B4.1 ${name} (${meta.description}) - hole ${meta.holeGrade}, shaft ${meta.shaftGrade ?? '(no symbol)'} - thousandths of an inch`);
    console.log('over   to      fit min..max     hole             shaft');
    const sg = (x) => (x > 0 ? `+${x}` : `${x}`);
    for (const r of rows) {
      const fit = meta.family === 'LN' || meta.family === 'FN' ? `${-r.fit[1]} .. ${-r.fit[0]} (interf.)` : `${r.fit[0]} .. ${r.fit[1]}`;
      console.log(`${String(r.over).padEnd(7)}${String(r.to).padEnd(8)}${fit.padEnd(20)}${(sg(r.hole[0]) + ' / ' + sg(r.hole[1])).padEnd(17)}${sg(r.shaft[0])} / ${sg(r.shaft[1])}`);
    }
    return;
  }
  if (v.system === 'iso') {
    const cls = parseIsoClass(v.class ?? v.hole ?? v.shaft);
    console.log(`ISO 286-1 ${cls.text} (${cls.kind}) - deviations in micrometres`);
    console.log('over   to      IT    upper    lower');
    const steps = data.sizeSteps.deviation;
    for (const [lo, hi] of steps) {
      if (v.nominal) {
        const nm = parseLength(v.nominal, v.units ?? 'mm');
        if (!(nm > lo * 1e6 && nm <= hi * 1e6)) continue;
      }
      try {
        const d = isoDeviations(cls, hi * 1e6);
        const sg = (x) => (x > 0 ? `+${x}` : `${x}`);
        console.log(`${String(lo).padEnd(7)}${String(hi).padEnd(8)}${String(d.tolerance / 1000).padEnd(6)}${sg(d.nativeUpper).padEnd(9)}${sg(d.nativeLower)}`);
      } catch (e) { console.log(`${String(lo).padEnd(7)}${String(hi).padEnd(8)}  - ${e.message}`); }
    }
    return;
  }
  throw new Error('--system ansi|iso is required');
}

// ---- batch ------------------------------------------------------------------------

function readRecords(path) {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '').trim();
  if (path.endsWith('.jsonl') || text.startsWith('{')) return text.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  const [head, ...lines] = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  const cols = head.split(',').map((c) => c.trim().toLowerCase());
  return lines.map((l) => Object.fromEntries(l.split(',').map((c, i) => [cols[i], c.trim()])));
}

const CSV_COLS = ['system', 'designation', 'nominal', 'units', 'hole_class', 'hole_max', 'hole_min', 'shaft_class', 'shaft_max', 'shaft_min', 'min_clearance', 'max_clearance', 'fit_type', 'error'];

function batch(path, v) {
  if (!path) throw new Error('batch needs a file path');
  const recs = readRecords(path);
  const out = recs.map((rec, i) => {
    try {
      const r = computeFit({ system: rec.system, fit: rec.fit || undefined, hole: rec.hole || undefined, shaft: rec.shaft || undefined, nominal: rec.nominal, units: rec.units || v.units });
      return { ok: true, r, json: toJSON(r, v.decimals) };
    } catch (e) { return { ok: false, error: e.message, rec, line: i + 1 }; }
  });
  if ((v.format ?? 'csv') === 'json') {
    console.log(JSON.stringify(out.map((o) => (o.ok ? o.json : { error: o.error, input: o.rec })), null, 2));
  } else {
    console.log(CSV_COLS.join(','));
    for (const o of out) {
      if (!o.ok) { console.log(`${o.rec.system ?? ''},${o.rec.fit || `${o.rec.hole}/${o.rec.shaft}`},${o.rec.nominal ?? ''},${o.rec.units ?? ''},,,,,,,,,,"${o.error}"`); continue; }
      const j = o.json;
      console.log([j.system.startsWith('ANSI') ? 'ansi' : 'iso', j.designation, j.nominal, j.units, j.hole.class, j.hole.max, j.hole.min, j.shaft.class ?? '', j.shaft.max, j.shaft.min, j.fit.min_clearance, j.fit.max_clearance, j.fit.type, ''].join(','));
    }
  }
  if (out.some((o) => !o.ok)) process.exitCode = 1;
}
