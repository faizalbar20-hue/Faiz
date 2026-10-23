import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from './csvParser';

test('parseCsv correctly parses basic CSV values', () => {
  const csv = 'OR,Style,Product\nOR 1095,KS-882,Taslan\nOR 1014,WD-302,Denim';
  const result = parseCsv(csv);
  assert.equal(result.length, 3);
  assert.deepEqual(result[0], ['OR', 'Style', 'Product']);
  assert.deepEqual(result[1], ['OR 1095', 'KS-882', 'Taslan']);
  assert.deepEqual(result[2], ['OR 1014', 'WD-302', 'Denim']);
});

test('parseCsv handles quotes with commas inside and escaped quotes', () => {
  const csv = '"OR 1095","[BT-001] Button, 4 Hole","""Antique"" Brass",500';
  const result = parseCsv(csv);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0], ['OR 1095', '[BT-001] Button, 4 Hole', '"Antique" Brass', '500']);
});

test('parseCsv handles CRLF windows newlines and empty lines', () => {
  const csv = 'Col1,Col2\r\nVal1,Val2\r\n\r\n';
  const result = parseCsv(csv);
  assert.equal(result.length, 2);
  assert.deepEqual(result[1], ['Val1', 'Val2']);
});
