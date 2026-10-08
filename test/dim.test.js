import test from 'node:test';
import assert from 'node:assert/strict';
import { format, formatSigned, naturalDecimals, NM_PER_IN, NM_PER_MM, parseLength } from '../src/dim.js';

test('parseLength: decimals, fractions, units', () => {
  assert.equal(parseLength('25', 'mm'), 25 * NM_PER_MM);
  assert.equal(parseLength('1.5', 'in'), 1.5 * NM_PER_IN);
  assert.equal(parseLength('.5', 'in'), 12_700_000);
  assert.equal(parseLength('3/4', 'in'), 19_050_000);
  assert.equal(parseLength('1-1/2', 'in'), 38_100_000);
  assert.equal(parseLength('1 1/2', 'in'), 38_100_000);
  assert.equal(parseLength(0.12, 'in'), 3_048_000);          // numbers are accepted too
  assert.equal(parseLength('3.048', 'mm'), parseLength('0.12', 'in')); // exactly equal, no float fuzz
  assert.throws(() => parseLength('1.234567', 'in'), /decimal places/);
  assert.throws(() => parseLength('abc', 'mm'), /cannot read/);
  assert.throws(() => parseLength('1/3', 'in'), /not an exact/);
});

test('format: exact rounding half away from zero, sign handling', () => {
  assert.equal(format(25_021_000, 'mm', 3), '25.021');
  assert.equal(format(2_001_800 * 10, 'mm', 3), '20.018');
  assert.equal(format(50_800_000, 'in', 4), '2.0000');
  assert.equal(format(-63_500, 'in', 4), '-0.0025');
  assert.equal(format(12_700, 'mm', 2), '0.01');     // 0.0127 -> 0.01
  assert.equal(format(15_000, 'mm', 2), '0.02');     // half rounds away
  assert.equal(format(-1, 'mm', 3), '0.000');        // no negative zero
  assert.equal(formatSigned(21_000, 'mm', 3), '+0.021');
  assert.equal(formatSigned(0, 'mm', 3), '0.000');
});

test('naturalDecimals: shortest exact representation', () => {
  assert.equal(naturalDecimals(25_000_000, 'mm', 3, 6), 3);
  assert.equal(naturalDecimals(25_000_500, 'mm', 3, 6), 4);
  assert.equal(naturalDecimals(50_800_000 + 3_810, 'in', 4, 6), 5);  // 2.00015 in
});
