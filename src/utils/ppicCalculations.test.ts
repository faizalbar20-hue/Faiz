import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterLatestMaterialUpdates,
  evaluateMaterialRisk,
  evaluateProductionImpact,
  enrichItemsWithSchedulesAndFollowUps,
} from './ppicCalculations';
import {
  ParsedMaterialItem,
  ProductionSchedule,
  RiskWeightsConfig,
} from '../types/ppic';

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

describe('Dampak Produksi (Production Impact) Rules & Urgency Classification', () => {
  const referenceToday = new Date('2026-10-25');

  // Scenario 1: Ready + sufficient quantity + near production date -> "Tidak Berdampak"
  test('Condition 1: Ready and sufficient quantity yields "Tidak Berdampak"', () => {
    const schedule: ProductionSchedule = {
      id: 'sched-ready',
      orNumber: 'OR 1001',
      productionDate: '2026-10-26', // tomorrow
      createdAt: '2026-10-20',
      updatedAt: '2026-10-20',
    };

    const impact = evaluateProductionImpact(
      {
        quantity: 500,
        receivedQty: 500,
        calculatedShortage: 0,
        readinessStatus: 'READY',
        unit: 'YDS',
        productionSchedule: schedule,
      },
      referenceToday
    );

    assert.equal(impact.level, 'TIDAK_BERDAMPAK');
    assert.equal(impact.label, 'Tidak Berdampak');
    assert.ok(impact.reason.includes('Material telah terpenuhi'));
    assert.equal(impact.daysToProduction, 1);
  });

  // Scenario 2: Deficit + far production date (>14 days) -> "Rendah"
  test('Condition 2: Deficit with plenty of lead time (>14 days) yields "Rendah"', () => {
    const schedule: ProductionSchedule = {
      id: 'sched-far',
      orNumber: 'OR 1002',
      productionDate: '2026-11-15', // 21 days in future (> 14 days)
      createdAt: '2026-10-20',
      updatedAt: '2026-10-20',
    };

    const impact = evaluateProductionImpact(
      {
        quantity: 1000,
        receivedQty: 200,
        calculatedShortage: 800,
        readinessStatus: 'NOT READY',
        unit: 'PCS',
        productionSchedule: schedule,
      },
      referenceToday
    );

    assert.equal(impact.level, 'RENDAH');
    assert.equal(impact.label, 'Rendah');
    assert.equal(impact.daysToProduction, 21);
    assert.ok(impact.reason.includes('masih memadai untuk pemenuhan defisit 800 PCS'));
  });

  // Scenario 3: Deficit + tomorrow (1 day <= 3 days) -> "Kritis"
  test('Condition 3: Deficit with imminent production (1 day away) yields "Kritis"', () => {
    const schedule: ProductionSchedule = {
      id: 'sched-imminent',
      orNumber: 'OR 1003',
      productionDate: '2026-10-26', // tomorrow (1 day <= 3 days)
      createdAt: '2026-10-20',
      updatedAt: '2026-10-20',
    };

    const impact = evaluateProductionImpact(
      {
        quantity: 600,
        receivedQty: 100,
        calculatedShortage: 500,
        readinessStatus: 'NOT READY',
        unit: 'YDS',
        productionSchedule: schedule,
      },
      referenceToday
    );

    assert.equal(impact.level, 'KRITIS');
    assert.equal(impact.label, 'Kritis');
    assert.equal(impact.daysToProduction, 1);
    assert.ok(impact.reason.includes('waktu sangat mepet dengan defisit 500 YDS'));
  });

  // Scenario 4: Deficit + overdue (< 0 days) -> "Kritis"
  test('Condition 4: Deficit with overdue schedule (< 0 days) yields "Kritis"', () => {
    const schedule: ProductionSchedule = {
      id: 'sched-overdue',
      orNumber: 'OR 1004',
      productionDate: '2026-10-23', // 2 days ago (< 0 days)
      createdAt: '2026-10-20',
      updatedAt: '2026-10-20',
    };

    const impact = evaluateProductionImpact(
      {
        quantity: 300,
        receivedQty: 50,
        calculatedShortage: 250,
        readinessStatus: 'NOT READY',
        unit: 'KG',
        productionSchedule: schedule,
      },
      referenceToday
    );

    assert.equal(impact.level, 'KRITIS');
    assert.equal(impact.label, 'Kritis');
    assert.equal(impact.daysToProduction, -2);
    assert.ok(impact.reason.includes('🚨 Overdue produksi 2 hari lalu'));
  });

  // Scenario 5: Same material used across 2 different ORs has differing impacts based on each schedule
  test('Condition 5: Same material across different OR schedules produces distinct impacts', () => {
    const itemOrA: ParsedMaterialItem = {
      id: 'OR-A-FABRIC',
      rowIndex: 10,
      orNumber: 'OR-ALPHA',
      style: 'POLO-01',
      materialCode: 'FAB-COTTON',
      materialName: 'Cotton Combed 30s',
      productDisplayName: 'Cotton Combed 30s',
      quantity: 1000,
      receivedQty: 200,
      recordedBalance: -800,
      calculatedShortage: 800,
      calculatedSurplus: 0,
      unit: 'KG',
      originalUnit: 'KG',
      sourceStatus: 'BELUM',
      readinessStatus: 'NOT READY',
      updateDate: new Date('2026-10-24'),
      updateDateFormatted: '24 Okt 2026',
      dataAgeDays: 1,
      isStale: false,
      hasDiscrepancy: false,
      validationWarnings: [],
      shortageRiskScore: 80,
      staleRiskScore: 10,
      compositeRiskScore: 70,
      riskLevel: 'HIGH',
      riskReasons: [],
      recommendedMitigations: [],
      followUpPriority: 'P2 - Tinggi',
    };

    const itemOrB: ParsedMaterialItem = {
      ...itemOrA,
      id: 'OR-B-FABRIC',
      rowIndex: 11,
      orNumber: 'OR-BETA',
      style: 'TSHIRT-02',
    };

    const schedules: ProductionSchedule[] = [
      {
        id: 'sched-alpha',
        orNumber: 'OR-ALPHA',
        productionDate: '2026-10-27', // 2 days away (<= 3 days -> Kritis)
        createdAt: '2026-10-20',
        updatedAt: '2026-10-20',
      },
      {
        id: 'sched-beta',
        orNumber: 'OR-BETA',
        productionDate: '2026-11-20', // 26 days away (> 14 days -> Rendah)
        createdAt: '2026-10-20',
        updatedAt: '2026-10-20',
      },
    ];

    const enriched = enrichItemsWithSchedulesAndFollowUps(
      [itemOrA, itemOrB],
      schedules,
      {},
      DEFAULT_WEIGHTS,
      referenceToday
    );

    const enrichedOrA = enriched.find((i) => i.orNumber === 'OR-ALPHA');
    const enrichedOrB = enriched.find((i) => i.orNumber === 'OR-BETA');

    assert.ok(enrichedOrA?.productionImpact, 'OR-ALPHA must have impact evaluated');
    assert.ok(enrichedOrB?.productionImpact, 'OR-BETA must have impact evaluated');

    assert.equal(enrichedOrA.productionImpact.level, 'KRITIS', 'OR-ALPHA production in 2 days must be KRITIS');
    assert.equal(enrichedOrB.productionImpact.level, 'RENDAH', 'OR-BETA production in 26 days must be RENDAH');
  });

  // Scenario 6: No production schedule -> "Jadwal Belum Tersedia"
  test('Condition 6: Missing production schedule reports "Jadwal Belum Tersedia" truthfully', () => {
    const impact = evaluateProductionImpact(
      {
        quantity: 500,
        receivedQty: 100,
        calculatedShortage: 400,
        readinessStatus: 'NOT READY',
        unit: 'MTR',
        productionSchedule: null, // No schedule
      },
      referenceToday
    );

    assert.equal(impact.level, 'BELUM_TERJADWAL');
    assert.equal(impact.label, 'Jadwal Belum Tersedia');
    assert.equal(impact.productionDateDisplay, 'Jadwal Belum Tersedia');
    assert.equal(impact.daysToProduction, null);
    assert.ok(impact.reason.includes('jadwal produksi per OR belum diinput'));
  });

  // Scenario 7: Multiple updates of same material in an OR -> only latest update (Column D) counts
  test('Condition 7: Deduplication uses newest update date so outdated deficit status is not evaluated', () => {
    const oldUpdateRow: ParsedMaterialItem = {
      id: 'OR-DUP-OLD',
      rowIndex: 20,
      orNumber: 'OR-999',
      style: 'JACKET-01',
      materialCode: 'ZIPPER-5',
      materialName: 'Zipper #5 Metal',
      productDisplayName: 'Zipper #5 Metal',
      quantity: 100,
      receivedQty: 0,
      recordedBalance: -100,
      calculatedShortage: 100, // old deficit
      calculatedSurplus: 0,
      unit: 'PCS',
      originalUnit: 'PCS',
      sourceStatus: 'BELUM',
      readinessStatus: 'NOT READY',
      updateDate: new Date('2026-10-10'),
      updateDateFormatted: '10 Okt 2026',
      dataAgeDays: 15,
      isStale: true,
      hasDiscrepancy: false,
      validationWarnings: [],
      shortageRiskScore: 100,
      staleRiskScore: 80,
      compositeRiskScore: 90,
      riskLevel: 'CRITICAL',
      riskReasons: [],
      recommendedMitigations: [],
      followUpPriority: 'P1 - Segera',
    };

    const newUpdateRow: ParsedMaterialItem = {
      ...oldUpdateRow,
      id: 'OR-DUP-NEW',
      rowIndex: 25,
      receivedQty: 100, // now fully received!
      calculatedShortage: 0,
      readinessStatus: 'READY',
      sourceStatus: 'OKE',
      updateDate: new Date('2026-10-24'),
      updateDateFormatted: '24 Okt 2026',
      dataAgeDays: 1,
      isStale: false,
    };

    // Filter latest updates first
    const deduplicated = filterLatestMaterialUpdates([oldUpdateRow, newUpdateRow]);
    assert.equal(deduplicated.length, 1, 'Only 1 row must remain');
    assert.equal(deduplicated[0].id, 'OR-DUP-NEW');
    assert.equal(deduplicated[0].readinessStatus, 'READY');

    // Enrich with schedule tomorrow
    const schedule: ProductionSchedule = {
      id: 'sched-999',
      orNumber: 'OR-999',
      productionDate: '2026-10-26', // tomorrow
      createdAt: '2026-10-20',
      updatedAt: '2026-10-20',
    };

    const enriched = enrichItemsWithSchedulesAndFollowUps(
      deduplicated,
      [schedule],
      {},
      DEFAULT_WEIGHTS,
      referenceToday
    );

    assert.equal(enriched[0].productionImpact?.level, 'TIDAK_BERDAMPAK');
    assert.equal(enriched[0].productionImpact?.label, 'Tidak Berdampak');
  });
});
