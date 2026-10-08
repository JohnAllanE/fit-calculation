import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/fit.js', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });

test('calc --json: ANSI RC5 at 2 in', () => {
  const r = run('calc', '--system', 'ansi', '--fit', 'RC5', '--nominal', '2', '--json');
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.equal(j.units, 'in');
  assert.equal(j.hole.max, 2.0018); assert.equal(j.shaft.min, 1.9963);
  assert.equal(j.fit.min_clearance, 0.0025); assert.equal(j.fit.max_clearance, 0.0055);
  assert.equal(j.fit.type, 'clearance');
  assert.equal(j.hole.notation.limits, '2.0018 / 2.0000');
});

test('calc: ISO H7/g6 at 25 mm, then the same part reported in inches', () => {
  let j = JSON.parse(run('calc', '--system', 'iso', '--fit', 'H7/g6', '--nominal', '25', '--json').stdout);
  assert.deepEqual([j.hole.max, j.hole.min, j.shaft.max, j.shaft.min], [25.021, 25, 24.993, 24.98]);
  assert.deepEqual([j.fit.min_clearance, j.fit.max_clearance], [0.007, 0.041]);
  j = JSON.parse(run('calc', '--system', 'iso', '--fit', 'H7/g6', '--nominal', '1', '--units', 'in', '--json').stdout);
  assert.equal(j.units, 'in');
  assert.equal(j.hole.max, 1.00083);  // (25.4 + 0.021) mm = 1.000827 in
});

test('calc: ANSI class in metric units', () => {
  const j = JSON.parse(run('calc', '--system', 'ansi', '--fit', 'RC5', '--nominal', '50.8', '--units', 'mm', '--json').stdout);
  assert.equal(j.units, 'mm');
  assert.equal(j.hole.max, 50.8457);   // 2.0018 in
});

test('errors exit non-zero with a message', () => {
  const r = run('calc', '--system', 'iso', '--fit', 'H7/t6', '--nominal', '10');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not defined/);
  assert.equal(run('calc', '--system', 'iso').status, 2);
  assert.equal(run('bogus').status, 2);
});

test('batch: csv in, csv out, bad rows reported', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fit-'));
  const f = join(dir, 'p.csv');
  writeFileSync(f, 'system,fit,hole,shaft,nominal,units\nansi,RC5,,,2,in\niso,,H7,p6,40,mm\niso,H7/t6,,,10,mm\n');
  const r = run('batch', f);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.length, 4);
  assert.match(lines[1], /^ansi,RC5,2\.0018?|^ansi,RC5,2,in/);
  assert.match(lines[2], /interference/);
  assert.match(lines[3], /not defined/);
  assert.equal(r.status, 1);
});

test('table prints the standard\'s own row', () => {
  const r = run('table', '--system', 'ansi', '--fit', 'RC5', '--nominal', '2');
  assert.match(r.stdout, /1\.97\s+3\.15\s+2\.5 \.\. 5\.5\s+\+1\.8 \/ 0\s+-2\.5 \/ -3\.7/);
});
