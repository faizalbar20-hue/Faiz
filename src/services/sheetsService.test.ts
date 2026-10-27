import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSpreadsheetId,
  extractGid,
  fetchSheetViaGViz,
  SheetsApiError,
} from './sheetsService';
import { RiskWeightsConfig } from '../types/ppic';

const mockWeights: RiskWeightsConfig = {
  shortageWeight: 0.6,
  staleWeight: 0.25,
  inconsistencyWeight: 0.15,
  staleThresholdDays: 3,
};

test('Google Sheets Service - URL & ID Extraction', async (t) => {
  await t.test('extractSpreadsheetId extracts ID from standard Google Sheets edit URL', () => {
    const url = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0';
    assert.strictEqual(extractSpreadsheetId(url), '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
  });

  await t.test('extractSpreadsheetId extracts ID from gviz URL', () => {
    const url = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/gviz/tq?tqx=out:csv';
    assert.strictEqual(extractSpreadsheetId(url), '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
  });

  await t.test('extractSpreadsheetId leaves raw ID intact', () => {
    const rawId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
    assert.strictEqual(extractSpreadsheetId(rawId), rawId);
  });

  await t.test('extractSpreadsheetId handles empty or whitespace input safely', () => {
    assert.strictEqual(extractSpreadsheetId(''), '');
    assert.strictEqual(extractSpreadsheetId('   '), '');
  });

  await t.test('extractGid extracts numeric sheet GID from URL hash and search params', () => {
    assert.strictEqual(
      extractGid('https://docs.google.com/spreadsheets/d/1BxiMVs.../edit#gid=19283746'),
      '19283746'
    );
    assert.strictEqual(
      extractGid('https://docs.google.com/spreadsheets/d/1BxiMVs...?gid=0'),
      '0'
    );
    assert.strictEqual(extractGid('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'), null);
  });
});

test('Google Sheets Service - Error Diagnostics', async (t) => {
  await t.test('throws MISSING_ID error when spreadsheetId is missing', async () => {
    await assert.rejects(
      async () => {
        await fetchSheetViaGViz('', 'Rekap', mockWeights);
      },
      (err: SheetsApiError) => {
        assert.strictEqual(err.code, 'MISSING_ID');
        assert.match(err.message, /Spreadsheet ID belum diisi/);
        return true;
      }
    );
  });

  await t.test('throws TIMEOUT error when fetch times out with clear message', async () => {
    // Test with an already aborted controller
    const abortController = new AbortController();
    abortController.abort();

    await assert.rejects(
      async () => {
        await fetchSheetViaGViz('test-id', 'Rekap', mockWeights, undefined, {
          signal: abortController.signal,
          timeoutMs: 10,
        });
      },
      (err: SheetsApiError) => {
        assert.ok(err instanceof SheetsApiError);
        assert.ok(err.code === 'ABORTED' || err.code === 'TIMEOUT');
        return true;
      }
    );
  });
});
