import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  splitProductCodeAndName,
  detectExcelHeaders,
  parseExcelWorkbook,
} from './excelService';
import {
  saveExcelBatch,
  loadAllExcelBatches,
  findExcelBatch,
  deleteExcelBatch,
  clearAllExcelBatches,
  normalizeOrKey,
  normalizeDateKey,
} from './excelStorageService';
import { ExcelUploadBatch } from '../types/ppic';

describe('Excel Upload Service - Parsing & Splitting (Scenarios 1-11)', () => {
  it('Scenario 5: splits product code and name across various realistic formats', () => {
    // Format A: [CODE] NAME
    const resA = splitProductCodeAndName('[BTN-SNP-06] SNAP BUTTON MILITARY GRADE 15MM');
    assert.equal(resA.code, 'BTN-SNP-06');
    assert.equal(resA.name, 'SNAP BUTTON MILITARY GRADE 15MM');
    assert.equal(resA.confidence, 'HIGH');

    // Format B: Leading zeros preserved in code [00124] COTTON COMBED
    const resB = splitProductCodeAndName('[00124] COTTON COMBED 30S BLACK');
    assert.equal(resB.code, '00124');
    assert.equal(resB.name, 'COTTON COMBED 30S BLACK');

    // Format C: CODE - NAME
    const resC = splitProductCodeAndName('FAB-PIQUE - COTTON COMBED PIQUE 24S');
    assert.equal(resC.code, 'FAB-PIQUE');
    assert.equal(resC.name, 'COTTON COMBED PIQUE 24S');

    // Format D: Numeric code with separator 00452 : ZIPPER METAL 7 INCH
    const resD = splitProductCodeAndName('00452 : ZIPPER METAL 7 INCH');
    assert.equal(resD.code, '00452');
    assert.equal(resD.name, 'ZIPPER METAL 7 INCH');

    // Format E: Space-separated alphanumeric code FAB-PIQUE COMBED
    const resE = splitProductCodeAndName('FAB-PIQUE COMBED 24S MAROON');
    assert.equal(resE.code, 'FAB-PIQUE');
    assert.equal(resE.name, 'COMBED 24S MAROON');

    // Fallback: Plain description without clear code pattern
    const resF = splitProductCodeAndName('KAIN POLOS TANPA KODE');
    assert.equal(resF.name, 'KAIN POLOS TANPA KODE');
    assert.equal(resF.confidence, 'LOW');
    assert.ok(resF.warning?.includes('belum terdeteksi'));
  });

  it('Scenario 2: detects header columns regardless of column ordering and casing', () => {
    // Header in arbitrary order: Quantity, Product, Recieved Qty, Unit of Measure
    const sheetData = [
      ['Title Banner Line 1'],
      ['Order Lines/Quantity', 'Order Lines/Product/Display Name', 'Order Lines/Recieved Qty', 'Order Lines/Product Unit of Measure/Display Name'],
      [100, '[BTN-SNP-06] SNAP BUTTON', 80, 'PCS'],
    ];

    const mapping = detectExcelHeaders(sheetData);
    assert.ok(mapping !== null);
    assert.equal(mapping.headerRowIndex, 1);
    assert.equal(mapping.quantityColIndex, 0);
    assert.equal(mapping.productColIndex, 1);
    assert.equal(mapping.receivedColIndex, 2);
    assert.equal(mapping.unitColIndex, 3);
  });

  it('Scenario 2b: detects variations of spelling (Recieved Qty vs Received Qty)', () => {
    const sheetData1 = [
      ['Order Lines/Product/Display Name', 'Order Lines/Recieved Qty', 'Order Lines/Quantity'],
    ];
    const mapping1 = detectExcelHeaders(sheetData1);
    assert.ok(mapping1 !== null);
    assert.equal(mapping1.receivedColIndex, 1);

    const sheetData2 = [
      ['Order Lines/Product/Display Name', 'Order Lines/Received Qty', 'Order Lines/Quantity'],
    ];
    const mapping2 = detectExcelHeaders(sheetData2);
    assert.ok(mapping2 !== null);
    assert.equal(mapping2.receivedColIndex, 1);
  });

  it('Scenario 1, 3, 4: parses valid Excel workbook and reads all rows to the end, skipping blank rows', () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      ['Laporan Kebutuhan Material PPIC'],
      ['Order Lines/Product/Display Name', 'Order Lines/Product Unit of Measure/Display Name', 'Order Lines/Quantity', 'Order Lines/Recieved Qty'],
      ['[BTN-SNP-06] SNAP BUTTON 15MM', 'GROS', '100', '80'],
      ['', '', '', ''], // Blank row in middle
      ['[ZIP-MET-08] METAL ZIPPER 65CM', 'PCS', '500', '500'],
      ['   ', '', '', ''], // Another blank row
      ['[TWL-STRETCH] COTTON TWILL KHAKI', 'YDS', '1,200.50', '1,400.00'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'OrderLines');

    const result = parseExcelWorkbook(wb, 'test_orders.xlsx', 'OR 1096', '2026-10-29');

    // Blank rows skipped, all 3 valid rows captured
    assert.equal(result.items.length, 3);
    assert.equal(result.validRowsCount, 3);
    assert.equal(result.rejectedRowsCount, 0);

    // Check first item
    assert.equal(result.items[0].materialCode, 'BTN-SNP-06');
    assert.equal(result.items[0].quantity, 100);
    assert.equal(result.items[0].receivedQty, 80);
    assert.equal(result.items[0].kekurangan, -20);
    assert.equal(result.items[0].readinessStatus, 'NOT READY');

    // Check second item
    assert.equal(result.items[1].materialCode, 'ZIP-MET-08');
    assert.equal(result.items[1].quantity, 500);
    assert.equal(result.items[1].receivedQty, 500);
    assert.equal(result.items[1].kekurangan, 0);
    assert.equal(result.items[1].readinessStatus, 'READY');

    // Check third item
    assert.equal(result.items[2].materialCode, 'TWL-STRETCH');
    assert.equal(result.items[2].quantity, 1200.5);
    assert.equal(result.items[2].receivedQty, 1400);
    assert.equal(result.items[2].kekurangan, 199.5);
    assert.equal(result.items[2].readinessStatus, 'READY');
  });

  it('Scenario 6 & 7: maps Satuan without automatic conversion; handles empty Satuan gracefully', () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      ['Order Lines/Product/Display Name', 'Order Lines/Product Unit of Measure/Display Name', 'Order Lines/Quantity', 'Order Lines/Recieved Qty'],
      ['[MAT-01] POLYESTER 100D', 'BOX', 50, 50],
      ['[MAT-02] SPECIAL THREAD', '', 20, 20], // empty unit
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const result = parseExcelWorkbook(wb, 'units.xlsx', '1096', '2026-10-29');
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].unit, 'BOX');
    assert.equal(result.items[0].needsReview, false);

    assert.equal(result.items[1].unit, '-');
    assert.equal(result.items[1].needsReview, true);
    assert.ok(result.items[1].reviewReasons?.some((r) => r.includes('Satuan kosong')));
  });

  it('Scenario 8: flags empty or invalid Quantity/Received and never quietly grants READY status', () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      ['Order Lines/Product/Display Name', 'Order Lines/Product Unit of Measure/Display Name', 'Order Lines/Quantity', 'Order Lines/Recieved Qty'],
      ['[MAT-ERR1] BUTTON INVALID', 'PCS', 'TIDAK_ADA', 50],
      ['[MAT-ERR2] ZIPPER INVALID', 'PCS', 100, 'RUSAK'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const result = parseExcelWorkbook(wb, 'invalid_numbers.xlsx', 'OR 1096', '2026-10-29');
    assert.equal(result.items.length, 2);

    // Must be CHECK DATA, not READY!
    assert.equal(result.items[0].readinessStatus, 'CHECK DATA');
    assert.equal(result.items[0].needsReview, true);
    assert.ok(result.items[0].reviewReasons?.some((r) => r.includes('bukan format angka valid')));

    assert.equal(result.items[1].readinessStatus, 'CHECK DATA');
    assert.equal(result.items[1].needsReview, true);
  });

  it('Scenario 9: Kebutuhan 100 & Diterima 80 -> Kekurangan -20 & BELUM READY', () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      ['Order Lines/Product/Display Name', 'Order Lines/Product Unit of Measure/Display Name', 'Order Lines/Quantity', 'Order Lines/Recieved Qty'],
      ['[MAT-A] ITEM A', 'PCS', 100, 80],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const res = parseExcelWorkbook(wb, 'f1.xlsx', '1096', '2026-10-29');
    assert.equal(res.items[0].kekurangan, -20);
    assert.equal(res.items[0].readinessStatus, 'NOT READY');
    assert.equal(res.items[0].calculatedShortage, 20);
  });

  it('Scenario 10: Kebutuhan 100 & Diterima 100 -> Kekurangan 0 & READY', () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      ['Order Lines/Product/Display Name', 'Order Lines/Product Unit of Measure/Display Name', 'Order Lines/Quantity', 'Order Lines/Recieved Qty'],
      ['[MAT-B] ITEM B', 'PCS', 100, 100],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const res = parseExcelWorkbook(wb, 'f2.xlsx', '1096', '2026-10-29');
    assert.equal(res.items[0].kekurangan, 0);
    assert.equal(res.items[0].readinessStatus, 'READY');
    assert.equal(res.items[0].calculatedShortage, 0);
  });

  it('Scenario 11: Kebutuhan 100 & Diterima 120 -> Kekurangan 20 & READY', () => {
    const wb = XLSX.utils.book_new();
    const rows = [
      ['Order Lines/Product/Display Name', 'Order Lines/Product Unit of Measure/Display Name', 'Order Lines/Quantity', 'Order Lines/Recieved Qty'],
      ['[MAT-C] ITEM C', 'PCS', 100, 120],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const res = parseExcelWorkbook(wb, 'f3.xlsx', '1096', '2026-10-29');
    assert.equal(res.items[0].kekurangan, 20);
    assert.equal(res.items[0].readinessStatus, 'READY');
    assert.equal(res.items[0].calculatedSurplus, 20);
  });
});

// Mock browser localStorage for Node.js test environment
class MockLocalStorage {
  private store: Map<string, string> = new Map();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

describe('Excel Storage Service - Re-upload, Isolation & Persistence (Scenarios 12-15, 19)', () => {
  beforeEach(() => {
    // Inject mock localStorage into globalThis if in Node environment
    (globalThis as unknown as { localStorage: MockLocalStorage }).localStorage = new MockLocalStorage();
    clearAllExcelBatches();
  });

  it('Scenario 12: re-upload with same OR and date when user cancels preserves existing batch', () => {
    const initialBatch: ExcelUploadBatch = {
      id: 'batch-001',
      orNumber: 'OR 1096',
      dataDate: '2026-10-29',
      fileName: 'first_file.xlsx',
      uploadedAt: new Date().toISOString(),
      source: 'EXCEL_UPLOAD',
      totalRows: 1,
      validRows: 1,
      reviewRows: 0,
      rejectedRows: 0,
      items: [
        {
          id: 'item-1',
          rowIndex: 2,
          orNumber: 'OR 1096',
          style: '-',
          materialCode: 'CODE-1',
          materialName: 'Original Item',
          productDisplayName: 'Original Item',
          quantity: 100,
          receivedQty: 50,
          recordedBalance: -50,
          calculatedShortage: 50,
          calculatedSurplus: 0,
          unit: 'PCS',
          originalUnit: 'PCS',
          sourceStatus: 'BELUM READY',
          readinessStatus: 'NOT READY',
          updateDate: new Date('2026-10-29'),
          updateDateFormatted: '29 Okt 2026',
          dataAgeDays: 0,
          isStale: false,
          hasDiscrepancy: false,
          validationWarnings: [],
          shortageRiskScore: 50,
          staleRiskScore: 0,
          compositeRiskScore: 50,
          riskLevel: 'MEDIUM',
          riskReasons: [],
          recommendedMitigations: [],
          followUpPriority: 'P3 - Sedang',
        },
      ],
    };

    // First save: succeeds
    const save1 = saveExcelBatch(initialBatch, false);
    assert.equal(save1.success, true);

    // Attempt second save without overwrite confirmation: fails with duplicate detection
    const duplicateBatch: ExcelUploadBatch = {
      ...initialBatch,
      id: 'batch-002',
      fileName: 'second_file.xlsx',
    };
    const save2 = saveExcelBatch(duplicateBatch, false);
    assert.equal(save2.success, false);
    assert.equal(save2.isDuplicate, true);
    assert.ok(save2.existingBatch);
    assert.equal(save2.existingBatch.fileName, 'first_file.xlsx');

    // Confirm that original data remains completely untouched
    const stored = loadAllExcelBatches();
    assert.equal(stored.length, 1);
    assert.equal(stored[0].id, 'batch-001');
    assert.equal(stored[0].fileName, 'first_file.xlsx');
  });

  it('Scenario 13 & 14: re-upload with overwrite confirmation replaces only the target batch and leaves other batches & Google Sheets untouched', () => {
    // Batch 1: OR 1014
    const batch1: ExcelUploadBatch = {
      id: 'batch-1014',
      orNumber: 'OR 1014',
      dataDate: '2026-10-29',
      fileName: 'or_1014.xlsx',
      uploadedAt: new Date().toISOString(),
      source: 'EXCEL_UPLOAD',
      totalRows: 1,
      validRows: 1,
      reviewRows: 0,
      rejectedRows: 0,
      items: [],
    };
    saveExcelBatch(batch1);

    // Batch 2: OR 1096 (Old Version)
    const batch2Old: ExcelUploadBatch = {
      id: 'batch-1096-old',
      orNumber: 'OR 1096',
      dataDate: '2026-10-29',
      fileName: 'or_1096_old.xlsx',
      uploadedAt: new Date().toISOString(),
      source: 'EXCEL_UPLOAD',
      totalRows: 1,
      validRows: 1,
      reviewRows: 0,
      rejectedRows: 0,
      items: [],
    };
    saveExcelBatch(batch2Old);

    assert.equal(loadAllExcelBatches().length, 2);

    // Now overwrite Batch 2 (OR 1096, 2026-10-29) with new data
    const batch2New: ExcelUploadBatch = {
      id: 'batch-1096-new',
      orNumber: 'OR 1096',
      dataDate: '2026-10-29',
      fileName: 'or_1096_new.xlsx',
      uploadedAt: new Date().toISOString(),
      source: 'EXCEL_UPLOAD',
      totalRows: 5,
      validRows: 5,
      reviewRows: 0,
      rejectedRows: 0,
      items: [],
    };
    const overwriteResult = saveExcelBatch(batch2New, true);
    assert.equal(overwriteResult.success, true);

    // Total batches count is still 2 (replaced, not appended)
    const after = loadAllExcelBatches();
    assert.equal(after.length, 2);

    // OR 1014 remains unaffected
    const batch1After = after.find((b) => b.orNumber === 'OR 1014');
    assert.ok(batch1After);
    assert.equal(batch1After.fileName, 'or_1014.xlsx');

    // OR 1096 is updated
    const batch2After = after.find((b) => b.orNumber === 'OR 1096');
    assert.ok(batch2After);
    assert.equal(batch2After.id, 'batch-1096-new');
    assert.equal(batch2After.fileName, 'or_1096_new.xlsx');
    assert.equal(batch2After.totalRows, 5);
  });

  it('Scenario 15: persistent storage reload recovers all batches and items', () => {
    const batch: ExcelUploadBatch = {
      id: 'batch-persistent',
      orNumber: 'OR 1050',
      dataDate: '2026-10-28',
      fileName: 'persistent.xlsx',
      uploadedAt: new Date().toISOString(),
      source: 'EXCEL_UPLOAD',
      totalRows: 1,
      validRows: 1,
      reviewRows: 0,
      rejectedRows: 0,
      items: [
        {
          id: 'item-persistent',
          rowIndex: 2,
          orNumber: 'OR 1050',
          style: '-',
          materialCode: 'FAB-PIQUE',
          materialName: 'COTTON COMBED PIQUE',
          productDisplayName: 'COTTON COMBED PIQUE',
          quantity: 200,
          receivedQty: 200,
          recordedBalance: 0,
          calculatedShortage: 0,
          calculatedSurplus: 0,
          unit: 'KG',
          originalUnit: 'KG',
          sourceStatus: 'READY',
          readinessStatus: 'READY',
          updateDate: new Date('2026-10-28'),
          updateDateFormatted: '28 Okt 2026',
          dataAgeDays: 1,
          isStale: false,
          hasDiscrepancy: false,
          validationWarnings: [],
          shortageRiskScore: 0,
          staleRiskScore: 0,
          compositeRiskScore: 10,
          riskLevel: 'LOW',
          riskReasons: [],
          recommendedMitigations: [],
          followUpPriority: 'P4 - Rutin',
        },
      ],
    };

    saveExcelBatch(batch);
    const loaded = loadAllExcelBatches();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].items[0].materialCode, 'FAB-PIQUE');
    assert.equal(loaded[0].items[0].unit, 'KG');
  });
});
