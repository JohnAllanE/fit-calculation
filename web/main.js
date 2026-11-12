// Browser front end: a thin form over src/fit.js (the same engine the CLI uses).
import { computeFit } from '../src/fit.js';
import { decimalsFor, notations, stackLines } from '../src/format.js';
import { format, formatSigned, normalizeUnits, parseLength } from '../src/dim.js';
import { ANSI_FAMILIES, listAnsiClasses } from '../src/ansi.js';
import { ISO_LETTERS, ISO_MAX_NOMINAL_MM, ISO_PREFERRED_FITS } from '../src/iso.js';

const $ = (id) => document.getElementById(id);
const NATIVE = { ansi: 'in', iso: 'mm' };
const state = { system: 'ansi', units: 'in' };

// ---------------------------------------------------------------- controls
function fillSelect(sel, items) { sel.replaceChildren(...items.map(([v, t]) => Object.assign(document.createElement('option'), { value: v, textContent: t }))); }

function initControls() {
  const classes = listAnsiClasses();
  const sel = $('ansi-class');
  for (const fam of Object.keys(ANSI_FAMILIES)) {
    const g = document.createElement('optgroup');
    g.label = `${fam} — ${ANSI_FAMILIES[fam]}`;
    for (const c of classes.filter((x) => x.family === fam)) {
      g.append(Object.assign(document.createElement('option'), { value: c.name, textContent: `${c.name} · ${c.description} (${c.holeGrade}/${c.shaftGrade ?? '—'})` }));
    }
    sel.append(g);
  }
  sel.value = 'RC5';
  const grades = [['01', 'IT01'], ['0', 'IT0'], ...Array.from({ length: 18 }, (_, i) => [String(i + 1), `IT${i + 1}`])];
  fillSelect($('iso-hole-letter'), ISO_LETTERS.hole.map((l) => [l, l]));
  fillSelect($('iso-shaft-letter'), ISO_LETTERS.shaft.map((l) => [l, l]));
  fillSelect($('iso-hole-grade'), grades);
  fillSelect($('iso-shaft-grade'), grades);
  setIso('H7', 'g6');
  for (const [id, list] of [['chips-hole', ISO_PREFERRED_FITS.holeBasis], ['chips-shaft', ISO_PREFERRED_FITS.shaftBasis]]) {
    for (const f of list) {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: f });
      b.dataset.fit = f;
      b.addEventListener('click', () => { const [h, s] = f.split('/'); setIso(h, s); update(); });
      $(id).append(b);
    }
  }
}

function splitClass(t) { const m = /^([A-Za-z]+)(01|0|\d+)$/.exec(t); return [m[1], m[2]]; }
function setIso(hole, shaft) {
  const [hl, hg] = splitClass(hole); const [sl, sg] = splitClass(shaft);
  $('iso-hole-letter').value = hl; $('iso-hole-grade').value = hg;
  $('iso-shaft-letter').value = sl; $('iso-shaft-grade').value = sg;
}
const isoHole = () => $('iso-hole-letter').value + $('iso-hole-grade').value;
const isoShaft = () => $('iso-shaft-letter').value + $('iso-shaft-grade').value;

function setSeg(id, value) {
  for (const b of $(id).querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.v === value));
}

function setSystem(v) {
  state.system = v; setSeg('seg-system', v);
  $('ansi-fields').hidden = v !== 'ansi'; $('iso-fields').hidden = v !== 'iso';
}

function setUnits(v, convert) {
  const old = state.units;
  if (convert && v !== old && $('nominal').value.trim()) {
    try {
      const nm = parseLength($('nominal').value, old);
      $('nominal').value = format(nm, v, v === 'in' ? 5 : 4).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    } catch { /* leave the text alone; the error is shown on update */ }
  }
  state.units = v; setSeg('seg-units', v); $('nominal-unit').textContent = v;
}

// ---------------------------------------------------------------- state in the URL hash
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get('s') === 'iso' || p.get('s') === 'ansi') setSystem(p.get('s'));
  if (p.get('u') === 'mm' || p.get('u') === 'in') setUnits(p.get('u'), false);
  if (p.get('n')) $('nominal').value = p.get('n');
  if (p.get('c')) { $('ansi-class').value = p.get('c'); }
  if (p.get('h') && p.get('sh')) { try { setIso(p.get('h'), p.get('sh')); } catch { /* ignore bad link */ } }
}
function writeHash() {
  const p = new URLSearchParams({ s: state.system, u: state.units, n: $('nominal').value.trim() });
  if (state.system === 'ansi') p.set('c', $('ansi-class').value); else { p.set('h', isoHole()); p.set('sh', isoShaft()); }
  history.replaceState(null, '', `#${p}`);
}

// ---------------------------------------------------------------- rendering
const fmtN = (x) => (x > 0 ? '+' : '') + x;
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
// Upper value over lower, as drawings and the standards' tables write them. Padding uses figure spaces
// (digit width) so the decimal points line up.
const stack = (upper, lower) => el('span', { className: 'stack' },
  ...stackLines(upper, lower).map((t) => el('span', { textContent: t.replaceAll(' ', '\u2007') })));
const cellOf = (v) => (Array.isArray(v) ? stack(...v) : v);

function update() {
  writeHash();
  const native = NATIVE[state.system];
  $('nominal-hint').textContent = '';
  $('error').hidden = true; $('out').hidden = true;
  for (const b of document.querySelectorAll('.chips button')) b.setAttribute('aria-pressed', String(state.system === 'iso' && b.dataset.fit === `${isoHole()}/${isoShaft()}`));
  const text = $('nominal').value.trim();
  const range = state.system === 'ansi' ? 'ANSI tables are in inches (to 200 in).' : `ISO 286 here covers over 0 to ${ISO_MAX_NOMINAL_MM} mm.`;
  if (!text) { $('nominal-hint').textContent = range; return; }
  let nm;
  try { nm = parseLength(text, state.units); } catch (e) { return showError(e.message); }
  $('nominal-hint').textContent = state.units === native
    ? range
    : `The tables are in ${native === 'in' ? 'inches' : 'millimetres'}: ${text} ${state.units} = ${format(nm, native, native === 'in' ? 5 : 4).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')} ${native}. ${range}`;
  const cls = listAnsiClasses().find((c) => c.name === $('ansi-class').value);
  $('ansi-hint').textContent = cls ? `Table size range for this class: ${cls.minSizeIn} to ${cls.maxSizeIn} in` : '';
  let r;
  try {
    r = computeFit({ system: state.system, nominal: text, units: state.units, fit: state.system === 'ansi' ? $('ansi-class').value : undefined, hole: isoHole(), shaft: isoShaft() });
  } catch (e) { return showError(e.message); }
  render(r);
}

function showError(msg) { $('error').textContent = msg; $('error').hidden = false; }

function render(r) {
  const d = decimalsFor(r);
  const u = r.units;
  const fm = (nm) => format(nm, u, d);
  const sg = (nm) => formatSigned(nm, u, d);
  $('out').hidden = false;
  $('designation').textContent = r.designation;
  const basis = r.system === 'iso' ? (r.hole.class.startsWith('H') ? 'hole-basis' : r.shaft.class.startsWith('h') ? 'shaft-basis' : 'mixed basis') : '';
  $('desc').textContent = r.system === 'ansi'
    ? `ANSI B4.1 · ${r.description} · nominal ${fm(r.nominal.nm)} ${u}`
    : `ISO 286 · ${basis} · nominal ${fm(r.nominal.nm)} ${u}`;
  const b = $('badge'); b.className = `badge ${r.fit.type}`; b.textContent = `${r.fit.type} fit`;

  $('notes').replaceChildren(...r.notes.map((n) => el('div', { className: 'msg note', textContent: n })));

  const f = r.fit;
  const items = f.type === 'clearance' ? [['Minimum clearance', fm(f.minClearance)], ['Maximum clearance', fm(f.maxClearance)]]
    : f.type === 'interference' ? [['Minimum interference', fm(-f.maxClearance)], ['Maximum interference', fm(-f.minClearance)]]
      : [['Maximum interference', fm(-f.minClearance)], ['Maximum clearance', fm(f.maxClearance)]];
  items.push(['Total tolerance', fm(f.tolerance)]);
  $('fitband').replaceChildren(...items.map(([k, v]) => el('div', {}, el('div', { className: 'k', textContent: k }), el('div', { className: 'v', textContent: `${v} ${u}` }))));

  const rows = [
    ['Class', r.hole.class ?? '—', r.shaft.class ?? '—'],
    [`Deviation (${r.nativeUnit})`, [fmtN(r.hole.nativeUpper), fmtN(r.hole.nativeLower)], [fmtN(r.shaft.nativeUpper), fmtN(r.shaft.nativeLower)]],
    [`Deviation (${u})`, [sg(r.hole.upper), sg(r.hole.lower)], [sg(r.shaft.upper), sg(r.shaft.lower)]],
    ['Maximum size', fm(r.hole.max), fm(r.shaft.max), 1],
    ['Minimum size', fm(r.hole.min), fm(r.shaft.min), 1],
    ['Tolerance', fm(r.hole.tolerance), fm(r.shaft.tolerance)],
  ];
  $('table').tBodies[0].replaceChildren(...rows.map(([k, a, c, strong]) => el('tr', { className: strong ? 'strong' : '' }, el('td', { textContent: k }), el('td', {}, cellOf(a)), el('td', {}, cellOf(c)))));

  drawDiagram(r);

  const nh = notations(r, 'hole', d); const ns = notations(r, 'shaft', d);
  const nrows = [['Limits (max over min)', 'limits'], ['Nominal + deviations', 'unilateral'], ['Mean ± ½ tolerance', 'bilateral'], ['Tolerance symbol', 'symbol']];
  // Shown stacked where drawings stack them; the clipboard gets the one-line form.
  const shown = (n, key) => (key === 'limits' ? [stack(n.stack.limits.upper, n.stack.limits.lower)]
    : key === 'unilateral' ? [`${n.stack.deviations.nominal} `, stack(n.stack.deviations.upper, n.stack.deviations.lower)]
      : [n[key]]);
  $('notations').replaceChildren(
    el('div', { className: 'nrow head' }, el('span', { className: 'nl' }), el('span', { textContent: 'Hole' }), el('span', { textContent: 'Shaft' })),
    ...nrows.map(([label, key]) => el('div', { className: 'nrow' }, el('span', { className: 'nl', textContent: label }),
      copyBtn(nh[key], shown(nh, key)), copyBtn(ns[key], shown(ns, key)))));

  $('trace').replaceChildren(...r.trace.map((t) => el('li', t.startsWith('  ') ? { textContent: t.trim() } : (r.system === 'iso' ? { className: 'group', textContent: t.replace(/:$/, '') } : { textContent: t }))));
}

function copyBtn(text, content = [text]) {
  const b = el('button', { type: 'button', title: `Click to copy: ${text}` }, ...content);
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      const kids = [...b.childNodes]; b.replaceChildren('copied');
      setTimeout(() => { b.replaceChildren(...kids); }, 700);
    } catch { /* clipboard unavailable */ }
  });
  return b;
}

// Tolerance-zone diagram. Y is proportional to deviation; clearance arrows sit between the two zones.
function drawDiagram(r) {
  const svg = $('diagram');
  const nu = r.nativeUnit;
  $('diag-unit').textContent = nu;
  const nat = (x) => Math.round(x * 1e4) / 1e4;
  const H = { u: r.hole.nativeUpper, l: r.hole.nativeLower }; const S = { u: r.shaft.nativeUpper, l: r.shaft.nativeLower };
  const top = Math.max(0, H.u, S.u); const bot = Math.min(0, H.l, S.l);
  const span = (top - bot) || 1;
  const T = 44; const B = 296; // plot area
  const y = (v) => T + ((top - v) / span) * (B - T);
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text !== undefined) e.textContent = text; return e; };
  svg.replaceChildren();
  svg.append(mk('defs', {}, undefined));
  const defs = svg.firstChild;
  const mkr = mk('marker', { id: 'ah', viewBox: '0 0 8 8', refX: 4, refY: 4, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
  mkr.append(mk('path', { d: 'M0 0 L8 4 L0 8 z', fill: 'currentColor' })); defs.append(mkr);
  const y0 = y(0);
  svg.append(mk('line', { x1: 8, x2: 462, y1: y0, y2: y0, stroke: 'var(--muted)', 'stroke-dasharray': '5 4' }));
  svg.append(mk('text', { x: 10, y: y0 - 5, 'font-size': 11, style: 'fill:var(--muted)' }, 'nominal (0)'));
  const zone = (x, w, z, fill, stroke, label) => {
    const yt = y(z.u); let yb = y(z.l); if (yb - yt < 2) yb = yt + 2;
    svg.append(mk('rect', { x, y: yt, width: w, height: yb - yt, style: `fill:${fill};stroke:${stroke}`, 'stroke-width': 1.5, rx: 2 }));
    svg.append(mk('text', { x: x + w / 2, y: yt - 6, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600 }, fmtN(nat(z.u))));
    if (z.l !== z.u) svg.append(mk('text', { x: x + w / 2, y: yb + 15, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600 }, fmtN(nat(z.l))));
    svg.append(mk('text', { x: x + w / 2, y: 334, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 700 }, label));
  };
  zone(100, 90, H, 'var(--hole)', 'var(--hole-line)', `Hole ${r.hole.class ?? ''}`);
  zone(350, 90, S, 'var(--shaft)', 'var(--shaft-line)', `Shaft ${r.shaft.class ?? '—'}`);
  // guide lines + clearance arrows between the zones
  const arrow = (x, fromV, toV, label, color) => {
    const y1 = y(fromV); const y2 = y(toV);
    svg.append(mk('line', { x1: 190, x2: 350, y1: y1, y2: y1, stroke: color, 'stroke-dasharray': '2 3', opacity: 0.6 }));
    svg.append(mk('line', { x1: 190, x2: 350, y1: y2, y2: y2, stroke: color, 'stroke-dasharray': '2 3', opacity: 0.6 }));
    if (Math.abs(y2 - y1) > 6) svg.append(mk('line', { x1: x, x2: x, y1, y2: y2, stroke: color, 'stroke-width': 1.8, 'marker-end': 'url(#ah)', 'marker-start': 'url(#ah)', style: `color:${color}` }));
    else svg.append(mk('circle', { cx: x, cy: (y1 + y2) / 2, r: 2.5, fill: color }));
    svg.append(mk('text', { x: x + 6, y: (y1 + y2) / 2 + 4, 'font-size': 11, 'font-weight': 600, style: `fill:${color}` }, label));
  };
  const minC = nat(H.l - S.u); const maxC = nat(H.u - S.l);
  const col = (v) => (v >= 0 ? 'var(--clear)' : 'var(--interf)');
  arrow(222, S.u, H.l, `min ${fmtN(minC)}`, col(minC));
  arrow(300, S.l, H.u, `max ${fmtN(maxC)}`, col(maxC));
  svg.append(mk('text', { x: 270, y: 18, 'text-anchor': 'middle', 'font-size': 11, style: 'fill:var(--muted)' }, 'clearance (+) / interference (−)'));
}

// ---------------------------------------------------------------- wiring
function init() {
  initControls();
  setSystem('ansi'); setUnits('in', false);
  $('nominal').value = '2';
  readHash();
  for (const b of $('seg-system').querySelectorAll('button')) b.addEventListener('click', () => { setSystem(b.dataset.v); update(); });
  for (const b of $('seg-units').querySelectorAll('button')) b.addEventListener('click', () => { setUnits(b.dataset.v, true); update(); });
  for (const id of ['nominal', 'ansi-class', 'iso-hole-letter', 'iso-hole-grade', 'iso-shaft-letter', 'iso-shaft-grade']) $(id).addEventListener('input', update);
  $('share').addEventListener('click', async () => {
    writeHash();
    try { await navigator.clipboard.writeText(location.href); $('share-msg').textContent = 'Link copied.'; } catch { $('share-msg').textContent = 'Copy the address bar.'; }
    setTimeout(() => { $('share-msg').textContent = ''; }, 2000);
  });
  window.addEventListener('hashchange', () => { readHash(); update(); });
  update();
}
init();
