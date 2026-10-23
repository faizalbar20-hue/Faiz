import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNumeric,
  parseSheetDate,
  calculateDataAgeDays,
  extractMaterialCodeAndName,
  determineReadinessStatus,
  evaluateMaterialRisk,
  parseRawRow,
  calculateDashboardKpi,
  detectHeaderAndMapping,
} from './ppicCalculations';
import { RiskWeightsConfig, RawSheetRow } from '../types/ppic';

const testWeights: RiskWeightsConfig = {
  shortageWeight: 0.6,
  staleWeight: 0.25,
  inconsistencyWeight: 0.15,
  staleThresholdDays: 3,
};

test('parseNumeric handles various formatting correctly', () => {
  assert.equal(parseNumeric('100'), 100);
  assert.equal(parseNumeric(250), 250);
  assert.equal(parseNumeric('1.250,50'), 1250.5);
  assert.equal(parseNumeric('1,250.50'), 1250.5);
  assert.equal(parseNumeric('-50'), -50);
  assert.equal(parseNumeric('(75)'), -75);
  assert.equal(parseNumeric(''), 0);
  assert.equal(parseNumeric(null), 0);
  assert.equal(parseNumeric('15 YDS'), 15);
});

test('extractMaterialCodeAndName handles brackets and prefixes', () => {
  const t1 = extractMaterialCodeAndName('[BT-001] BUTTON 4 HOLE 18L');
  assert.equal(t1.code, 'BT-001');
  assert.equal(t1.name, 'BUTTON 4 HOLE 18L');

  const t2 = extractMaterialCodeAndName('ZIP-YKK-05 - ZIPPER METAL ANTIQUE');
  assert.equal(t2.code, 'ZIP-YKK-05');
  assert.equal(t2.name, 'ZIPPER METAL ANTIQUE');

  const t3 = extractMaterialCodeAndName('BENANG-POLYESTER-40/2');
  assert.equal(t3.code, 'BENANG-POLYESTER-40/2');
});

test('parseSheetDate parses Indonesian and ISO formats', () => {
  const d1 = parseSheetDate('22/10/2026');
  assert.ok(d1);
  assert.equal(d1?.getFullYear(), 2026);
  assert.equal(d1?.getMonth(), 9); // Oct is 9 (0-indexed)
  assert.equal(d1?.getDate(), 22);

  const d2 = parseSheetDate('2026-10-22');
  assert.ok(d2);
  assert.equal(d2?.getFullYear(), 2026);

  assert.equal(parseSheetDate(''), null);
});

test('calculateDataAgeDays correctly measures elapsed days', () => {
  const updateDate = new Date(2026, 9, 18); // Oct 18, 2026
  const refDate = new Date(2026, 9, 22); // Oct 22, 2026
  const age = calculateDataAgeDays(updateDate, refDate);
  assert.equal(age, 4);
});

test('determineReadinessStatus identifies READY, NOT READY, and CHECK DATA conflicts', () => {
  // Case 1: Quantity fulfilled and status OKE -> READY
  const r1 = determineReadinessStatus(100, 100, 'OKE');
  assert.equal(r1.status, 'READY');

  // Case 2: Quantity surplus and status OKE -> READY
  const r2 = determineReadinessStatus(100, 120, 'OKE');
  assert.equal(r2.status, 'READY');

  // Case 3: Quantity deficit and status BELUM -> NOT READY
  const r3 = determineReadinessStatus(100, 60, 'BELUM');
  assert.equal(r3.status, 'NOT READY');

  // Case 4: Conflict! Status OKE but still deficit -> CHECK DATA
  const r4 = determineReadinessStatus(100, 50, 'OKE');
  assert.equal(r4.status, 'CHECK DATA');
  assert.ok(r4.conflictReason?.includes('kurang'));

  // Case 5: Conflict! Status BELUM but fully received -> CHECK DATA
  const r5 = determineReadinessStatus(100, 100, 'BELUM');
  assert.equal(r5.status, 'CHECK DATA');

  // Case 6: Quantity 0 or negative -> CHECK DATA
  const r6 = determineReadinessStatus(0, 0, 'OKE');
  assert.equal(r6.status, 'CHECK DATA');
});

test('evaluateMaterialRisk classifies risk levels accurately', () => {
  // High shortage with 0 received -> CRITICAL
  const crit = evaluateMaterialRisk(1000, 0, 'NOT READY', 4, testWeights);
  assert.equal(crit.riskLevel, 'CRITICAL');
  assert.equal(crit.followUpPriority, 'P1 - Segera');
  assert.ok(crit.recommendedMitigations.length > 0);

  // Fully ready and fresh data -> LOW
  const low = evaluateMaterialRisk(500, 500, 'READY', 1, testWeights);
  assert.equal(low.riskLevel, 'LOW');
  assert.equal(low.followUpPriority, 'P4 - Rutin');

  // Anomaly status -> Medium/High with check data reason
  const check = evaluateMaterialRisk(500, 200, 'CHECK DATA', 2, testWeights, 'Status konflik');
  assert.ok(check.compositeRiskScore >= 25);
});

test('parseRawRow parses end-to-end and flags discrepancies', () => {
  const raw: RawSheetRow = {
    rowIndex: 4,
    orNumber: 'OR 1095',
    style: 'KS-882 JACKET',
    updateDateRaw: '20/10/2026',
    productDisplayName: '[BTN-01] BUTTON HORN 24L',
    quantityRaw: '500',
    receivedQtyRaw: '300',
    balanceRaw: '-200',
    unit: 'GROS',
    ketRaw: 'BELUM',
  };

  const parsed = parseRawRow(raw, testWeights, new Date(2026, 9, 22));
  assert.equal(parsed.materialCode, 'BTN-01');
  assert.equal(parsed.quantity, 500);
  assert.equal(parsed.receivedQty, 300);
  assert.equal(parsed.calculatedShortage, 200);
  assert.equal(parsed.calculatedSurplus, 0);
  assert.equal(parsed.unit, 'GROS');
  assert.equal(parsed.readinessStatus, 'NOT READY');
  assert.equal(parsed.hasDiscrepancy, false);
});

test('calculateDashboardKpi respects unit isolation and counts correctly', () => {
  const row1 = parseRawRow({
    rowIndex: 2,
    orNumber: 'OR 1095',
    style: 'STYLE A',
    updateDateRaw: '2026-10-21',
    productDisplayName: '[FAB-01] FABRIC TWILL',
    quantityRaw: '1000',
    receivedQtyRaw: '1000',
    balanceRaw: '0',
    unit: 'YDS',
    ketRaw: 'OKE',
  }, testWeights);

  const row2 = parseRawRow({
    rowIndex: 3,
    orNumber: 'OR 1095',
    style: 'STYLE A',
    updateDateRaw: '2026-10-15', // stale (> 3 days)
    productDisplayName: '[BTN-01] BUTTONS',
    quantityRaw: '500',
    receivedQtyRaw: '200',
    balanceRaw: '-300',
    unit: 'PCS',
    ketRaw: 'BELUM',
  }, testWeights);

  const kpi = calculateDashboardKpi([row1, row2]);
  assert.equal(kpi.totalRows, 2);
  assert.equal(kpi.readyRows, 1);
  assert.equal(kpi.notReadyRows, 1);
  assert.equal(kpi.readinessPercentage, 50);
  assert.equal(kpi.staleDataCount, 1);

  // Shortage grouped by unit: PCS should have 300, YDS should not be combined with PCS!
  assert.equal(kpi.shortageByUnit.length, 1);
  assert.equal(kpi.shortageByUnit[0].unit, 'PCS');
  assert.equal(kpi.shortageByUnit[0].totalShortage, 300);
});

test('detectHeaderAndMapping identifies Rekap headers correctly', () => {
  const sampleSheet = [
    ['Header Notes', 'PPIC REKAP SUMMARY', '', '', ''],
    ['No', 'OR', 'Style', 'Tanggal', 'Order Lines/Product/Display Name', 'Order Lines/Quantity', 'Order Lines/Received Qty', 'Kekurangan/Kelebihan', 'Satuan', 'Ket'],
    ['1', 'OR 1095', 'KS-882', '20/10/2026', '[BTN-01] BUTTON', '500', '500', '0', 'GROS', 'OKE'],
  ];

  const detected = detectHeaderAndMapping(sampleSheet);
  assert.equal(detected.headerRowIndex, 1);
  assert.equal(detected.mapping.colOr, 1);
  assert.equal(detected.mapping.colStyle, 2);
  assert.equal(detected.mapping.colDate, 3);
  assert.equal(detected.mapping.colProduct, 4);
  assert.equal(detected.mapping.colQuantity, 5);
  assert.equal(detected.mapping.colReceived, 6);
  assert.equal(detected.mapping.colBalance, 7);
  assert.equal(detected.mapping.colUnit, 8);
  assert.equal(detected.mapping.colKet, 9);
});
