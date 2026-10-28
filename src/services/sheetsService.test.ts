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

test('Google Sheets Service - Dynamic Appended Rows & Edge Cases (Scenarios A-G)', async (t) => {
  const { parseRowsToMaterialItems } = await import('./sheetsService');
  const { filterLatestMaterialUpdates, matchesOrQuery } = await import('../utils/ppicCalculations');

  // Standard Rekap sheet header row
  const header = ['OR', 'STYLE', 'PRODUK / MATERIAL', 'TGL UPDATE', 'KEBUTUHAN', 'TERIMA', 'SISA', 'SATUAN', 'KET'];

  await t.test('Scenario A: 1 new row appended at bottom is dynamically parsed without row boundary limits', () => {
    const rawRows = [
      header,
      ['OR 100', 'JACKET 01', 'FABRIC BLACK', '2026-10-10', 500, 500, 0, 'YDS', 'OKE'],
      // Appended 1 new row at the bottom
      ['OR 100', 'JACKET 01', 'ZIPPER 50CM', '2026-10-25', 100, 20, -80, 'PCS', 'BELUM'],
    ];

    const { items } = parseRowsToMaterialItems(rawRows, mockWeights);
    assert.strictEqual(items.length, 2, 'Must parse both original and appended row');
    assert.strictEqual(items[1].materialName, 'ZIPPER 50CM');
    assert.strictEqual(items[1].rowIndex, 3);
  });

  await t.test('Scenario B: Appending 5 new rows simultaneously across different ORs parses all rows', () => {
    const rawRows = [
      header,
      ['OR 100', 'JACKET 01', 'FABRIC BLACK', '2026-10-10', 500, 500, 0, 'YDS', 'OKE'],
      // 5 new rows appended
      ['OR 201', 'POLO SHIRT', 'COTTON COMBED', '2026-10-25', 300, 100, -200, 'KG', 'BELUM'],
      ['OR 202', 'HOODIE 02', 'FLEECE NAVY', '2026-10-25', 400, 400, 0, 'KG', 'OKE'],
      ['OR 203', 'CARGO PANTS', 'TWILL KHAKI', '2026-10-25', 250, 0, -250, 'YDS', 'BELUM'],
      ['OR 204', 'SPORT TEE', 'POLYESTER DRYFIT', '2026-10-25', 600, 600, 0, 'YDS', 'OKE'],
      ['OR 205', 'WIND BREAKER', 'TASLAN WATERPROOF', '2026-10-25', 150, 50, -100, 'MTR', 'BELUM'],
    ];

    const { items } = parseRowsToMaterialItems(rawRows, mockWeights);
    assert.strictEqual(items.length, 6, 'Must parse total of 6 rows');
    const ors = new Set(items.map((i) => i.orNumber));
    assert.strictEqual(ors.size, 6, 'All 6 distinct ORs must be represented');
  });

  await t.test('Scenario C: Appending new material on existing OR retains both original and new materials', () => {
    const rawRows = [
      header,
      ['OR 1096', 'BOMBER 01', 'MAIN FABRIC', '2026-10-10', 1000, 1000, 0, 'YDS', 'OKE'],
      ['OR 1096', 'BOMBER 01', 'RIB COLLAR', '2026-10-12', 200, 200, 0, 'PCS', 'OKE'],
      // Appended new material for OR 1096
      ['OR 1096', 'BOMBER 01', 'WOVEN LABEL', '2026-10-25', 1000, 500, -500, 'PCS', 'BELUM'],
    ];

    const { items } = parseRowsToMaterialItems(rawRows, mockWeights);
    const filtered = filterLatestMaterialUpdates(items);
    const or1096Items = filtered.filter((i) => matchesOrQuery(i.orNumber, '1096'));

    assert.strictEqual(or1096Items.length, 3, 'OR 1096 must retain all 3 distinct materials');
    assert.ok(or1096Items.some((i) => i.materialName === 'WOVEN LABEL'));
  });

  await t.test('Scenario D: Appending same material with different requirement quantity retains both requirements', () => {
    const rawRows = [
      header,
      ['OR 500', 'VEST 01', 'SNAP BUTTON', '2026-10-10', 500, 500, 0, 'PCS', 'OKE'],
      // Second requirement line for same material but different quantity (e.g. Batch 2)
      ['OR 500', 'VEST 01', 'SNAP BUTTON', '2026-10-15', 300, 100, -200, 'PCS', 'BELUM'],
    ];

    const { items } = parseRowsToMaterialItems(rawRows, mockWeights);
    const filtered = filterLatestMaterialUpdates(items);

    assert.strictEqual(filtered.length, 2, 'Distinct requirement quantities must not overwrite each other');
    assert.strictEqual(filtered[0].quantity, 500);
    assert.strictEqual(filtered[1].quantity, 300);
  });

  await t.test('Scenario E: Appended update row changes material status from NOT READY to READY', () => {
    const rawRows = [
      header,
      ['OR 777', 'PARKA 02', 'OUTER SHELL NYLON', '2026-10-10', 800, 200, -600, 'YDS', 'BELUM'],
      // Appended newer update row reflecting newly arrived shipment
      ['OR 777', 'PARKA 02', 'OUTER SHELL NYLON', '2026-10-24', 800, 800, 0, 'YDS', 'OKE'],
    ];

    const { items } = parseRowsToMaterialItems(rawRows, mockWeights);
    const filtered = filterLatestMaterialUpdates(items);

    assert.strictEqual(filtered.length, 1, 'Only latest update row should remain');
    assert.strictEqual(filtered[0].readinessStatus, 'READY', 'Status should be updated to READY');
    assert.strictEqual(filtered[0].receivedQty, 800);
    assert.strictEqual(filtered[0].calculatedShortage, 0);
  });

  await t.test('Scenario F: Forward-fills merged OR and Style cells correctly on appended rows', () => {
    const rawRows = [
      header,
      ['OR 888', 'STYLE ALPHA', 'MATERIAL 1', '2026-10-20', 100, 100, 0, 'PCS', 'OKE'],
      // Vertically merged OR & Style in spreadsheet (empty cells in column 0 & 1)
      ['', '', 'MATERIAL 2', '2026-10-21', 200, 50, -150, 'PCS', 'BELUM'],
      ['', '', 'MATERIAL 3', '2026-10-22', 300, 300, 0, 'PCS', 'OKE'],
    ];

    const { items } = parseRowsToMaterialItems(rawRows, mockWeights);
    assert.strictEqual(items.length, 3);
    assert.strictEqual(items[1].orNumber, 'OR 888', 'Must forward-fill OR 888 to merged row 2');
    assert.strictEqual(items[1].style, 'STYLE ALPHA', 'Must forward-fill Style to merged row 2');
    assert.strictEqual(items[2].orNumber, 'OR 888', 'Must forward-fill OR 888 to merged row 3');
  });

  await t.test('Scenario G: Blank and draft rows do not disrupt parsing of subsequently appended valid rows', () => {
    const rawRows = [
      header,
      ['OR 901', 'SHIRT 01', 'LINEN BLUE', '2026-10-20', 150, 150, 0, 'YDS', 'OKE'],
      ['', '', '', '', '', '', '', '', ''], // Completely blank row
      ['  ', '   ', '   ', '', '', '', '', '', ''], // Whitespace row
      // Appended valid row after blanks
      ['OR 902', 'SHIRT 02', 'LINEN WHITE', '2026-10-25', 200, 200, 0, 'YDS', 'OKE'],
    ];

    const { items } = parseRowsToMaterialItems(rawRows, mockWeights);
    assert.strictEqual(items.length, 2, 'Only the 2 valid rows should be parsed, ignoring blanks');
    assert.strictEqual(items[0].orNumber, 'OR 901');
    assert.strictEqual(items[1].orNumber, 'OR 902');
  });
});

