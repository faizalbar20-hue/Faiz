import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterLatestMaterialUpdates,
  evaluateMaterialRisk,
  enrichItemsWithSchedulesAndFollowUps,
  parseRawRow,
} from './ppicCalculations';
import { ParsedMaterialItem, ProductionSchedule, MaterialFollowUp, RiskWeightsConfig } from '../types/ppic';

const DEFAULT_WEIGHTS: RiskWeightsConfig = {
  shortageWeight: 0.6,
  staleWeight: 0.25,
  inconsistencyWeight: 0.15,
  staleThresholdDays: 3,
};

describe('PPIC Calculations & Risk Rules', () => {
  test('filterLatestMaterialUpdates preserves only newest row for identical OR + Material', () => {
    const olderRow: ParsedMaterialItem = {
      id: 'OR-1-MAT-1-old',
      rowIndex: 2,
      orNumber: 'OR 100',
      style: 'STYLE A',
      materialCode: 'FABRIC-01',
      materialName: 'Cotton Fabric',
      productDisplayName: 'Cotton Fabric',
      quantity: 100,
      receivedQty: 20,
      recordedBalance: -80,
      calculatedShortage: 80,
      calculatedSurplus: 0,
      unit: 'YDS',
      originalUnit: 'YDS',
      sourceStatus: 'BELUM',
      readinessStatus: 'NOT READY',
      updateDate: new Date('2026-10-10'),
      updateDateFormatted: '10 Okt 2026',
      dataAgeDays: 12,
      isStale: true,
      hasDiscrepancy: false,
      validationWarnings: [],
      shortageRiskScore: 80,
      staleRiskScore: 60,
      compositeRiskScore: 75,
      riskLevel: 'CRITICAL',
      riskReasons: ['Old row'],
      recommendedMitigations: [],
      followUpPriority: 'P1 - Segera',
    };

    const newerRow: ParsedMaterialItem = {
      ...olderRow,
      id: 'OR-1-MAT-1-new',
      rowIndex: 3,
      receivedQty: 90,
      calculatedShortage: 10,
      updateDate: new Date('2026-10-22'),
      updateDateFormatted: '22 Okt 2026',
      dataAgeDays: 0,
      isStale: false,
    };

    const distinctMaterialRow: ParsedMaterialItem = {
      ...olderRow,
      id: 'OR-1-MAT-2',
      rowIndex: 4,
      materialCode: 'BUTTON-01',
      materialName: '4-Hole Button',
      updateDate: new Date('2026-10-12'),
    };

    const input = [olderRow, newerRow, distinctMaterialRow];
    const filtered = filterLatestMaterialUpdates(input);

    assert.equal(filtered.length, 2, 'Should filter out the older row for FABRIC-01 and retain distinct BUTTON-01');
    const fabricItem = filtered.find((i) => i.materialCode === 'FABRIC-01');
    assert.ok(fabricItem, 'FABRIC-01 must exist');
    assert.equal(fabricItem.id, 'OR-1-MAT-1-new', 'Must be the newer row with update date 22 Okt 2026');
    assert.equal(fabricItem.receivedQty, 90);
  });

  test('evaluateMaterialRisk sets CRITICAL when production schedule is overdue (< 0 days) and material is deficit', () => {
    const today = new Date('2026-10-25');
    const schedule: ProductionSchedule = {
      id: 'sched-1',
      orNumber: 'OR 100',
      productionDate: '2026-10-24', // 1 day in the past (Overdue!)
      createdAt: '2026-10-20',
      updatedAt: '2026-10-20',
    };

    const result = evaluateMaterialRisk(
      1000,
      400, // deficit 600
      'NOT READY',
      2,
      DEFAULT_WEIGHTS,
      undefined,
      schedule,
      today
    );

    assert.equal(result.riskLevel, 'CRITICAL');
    assert.equal(result.daysToProduction, -1);
    assert.ok(result.primaryRiskReason.includes('OVERDUE PRODUKSI'), 'Reason should clearly indicate overdue production');
  });

  test('evaluateMaterialRisk sets CRITICAL when production schedule is <= 3 days away and material is deficit', () => {
    const today = new Date('2026-10-25');
    const schedule: ProductionSchedule = {
      id: 'sched-2',
      orNumber: 'OR 200',
      productionDate: '2026-10-27', // 2 days in future (<= 3 days)
      createdAt: '2026-10-20',
      updatedAt: '2026-10-20',
    };

    const result = evaluateMaterialRisk(
      500,
      100, // deficit 400
      'NOT READY',
      1,
      DEFAULT_WEIGHTS,
      undefined,
      schedule,
      today
    );

    assert.equal(result.riskLevel, 'CRITICAL');
    assert.equal(result.daysToProduction, 2);
    assert.ok(result.primaryRiskReason.includes('Produksi dalam 2 hari'), 'Reason should indicate imminent production date');
  });

  test('evaluateMaterialRisk sets LOW risk when material is already READY even if schedule is near', () => {
    const today = new Date('2026-10-25');
    const schedule: ProductionSchedule = {
      id: 'sched-3',
      orNumber: 'OR 300',
      productionDate: '2026-10-26', // tomorrow
      createdAt: '2026-10-20',
      updatedAt: '2026-10-20',
    };

    const result = evaluateMaterialRisk(
      500,
      500, // 100% fulfilled
      'READY',
      1,
      DEFAULT_WEIGHTS,
      undefined,
      schedule,
      today
    );

    assert.equal(result.riskLevel, 'LOW');
    assert.ok(result.compositeRiskScore <= 15);
  });
});
