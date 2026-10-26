/**
 * Pure calculation and data transformation utilities for PPIC Material Readiness & Risk Analysis.
 * Decoupled from UI to enable rigorous unit testing.
 */

import {
  ParsedMaterialItem,
  RawSheetRow,
  ReadinessStatus,
  RiskLevel,
  PpicDashboardKpi,
  UnitShortageSummary,
  MaterialCodeSummary,
  RiskWeightsConfig,
  ColumnMappingConfig,
  ProductionSchedule,
  MaterialFollowUp,
} from '../types/ppic';

/**
 * Safely parse numeric value from spreadsheet cells.
 * Handles Indonesian format (1.250,50), US format (1,250.50), negative signs, and strings.
 */
export function parseNumeric(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;

  let str = String(value).trim();
  if (!str) return 0;

  // Handle accounting parentheses (100) -> -100
  const isNegative = str.startsWith('-') || (str.startsWith('(') && str.endsWith(')'));
  str = str.replace(/[()]/g, '').trim();

  // Remove currency signs or extra text
  str = str.replace(/[^\d.,-]/g, '');

  if (!str) return 0;

  // Determine whether comma or dot is the decimal separator
  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // European / Indonesian: 1.250,50
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // US: 1,250.50
      str = str.replace(/,/g, '');
    }
  } else if (hasComma && !hasDot) {
    // If format like "12,5" -> decimal. If like "1,000" -> thousands.
    const parts = str.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      str = str.replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  }

  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  return isNegative && num > 0 ? -num : num;
}

/**
 * Parses date string or Excel serial number into a valid Date object.
 * Returns null if invalid or missing.
 */
export function parseSheetDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;

  if (typeof raw === 'number') {
    // Excel serial date (e.g. 45587)
    // Excel base date: Dec 30, 1899
    if (raw > 10000 && raw < 100000) {
      const excelEpoch = new Date(1899, 11, 30);
      const millis = raw * 86400000;
      const d = new Date(excelEpoch.getTime() + millis);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const str = String(raw).trim();
  if (!str) return null;

  // Pattern: DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Pattern: YYYY-MM-DD
  const ymdMatch = str.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Standard Date.parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed;

  return null;
}

/**
 * Calculates data age in whole days compared to reference date (default: today).
 */
export function calculateDataAgeDays(updateDate: Date | null, referenceDate: Date = new Date()): number | null {
  if (!updateDate) return null;
  const start = new Date(updateDate.getFullYear(), updateDate.getMonth(), updateDate.getDate());
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Extracts material code and clean name from product display name.
 * e.g. "[BT-001] BUTTON 4 HOLE" -> code: "BT-001", name: "BUTTON 4 HOLE"
 * e.g. "KN-POLY - KAIN POLYESTER" -> code: "KN-POLY", name: "KAIN POLYESTER"
 */
export function extractMaterialCodeAndName(displayName: string): { code: string; name: string } {
  const clean = (displayName || '').trim();
  if (!clean) return { code: '-', name: 'Tidak diketahui' };

  // Format [CODE] Name
  const bracketMatch = clean.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (bracketMatch) {
    return {
      code: bracketMatch[1].trim(),
      name: bracketMatch[2].trim() || bracketMatch[1].trim(),
    };
  }

  // Format CODE - Name (requires spaces around dash or colon)
  const dashMatch = clean.match(/^([A-Z0-9_./-]+?)\s+[-:]\s+(.+)$/i);
  if (dashMatch) {
    return {
      code: dashMatch[1].trim(),
      name: dashMatch[2].trim(),
    };
  }

  // If first token is a short alphanumeric code followed by name
  const words = clean.split(/\s+/);
  if (words.length > 1 && words[0].length <= 15 && /^[A-Z0-9_./-]+$/i.test(words[0])) {
    const remaining = clean.substring(words[0].length).trim().replace(/^[-:]\s*/, '');
    if (remaining) {
      return {
        code: words[0],
        name: remaining,
      };
    }
  }

  return { code: clean, name: clean };
}

/**
 * Resolves material readiness status and detects conflicts between quantities and source status text.
 */
export function determineReadinessStatus(
  quantity: number,
  receivedQty: number,
  sourceKet: string
): { status: ReadinessStatus; conflictReason?: string } {
  const upperKet = (sourceKet || '').trim().toUpperCase();
  const isKetOke = upperKet === 'OKE' || upperKet === 'OK' || upperKet === 'READY' || upperKet === 'LENGKAP';
  const isKetBelum = upperKet === 'BELUM' || upperKet === 'PENDING' || upperKet === 'KURANG' || upperKet === 'NOT READY';

  // Check invalid or zero quantity
  if (quantity <= 0) {
    return {
      status: 'CHECK DATA',
      conflictReason: 'Kebutuhan material bernilai 0 atau negatif',
    };
  }

  const isQtyFulfilled = receivedQty >= quantity;
  const isQtyDeficit = receivedQty < quantity;

  // Conflict 1: Source says OKE, but physically deficit
  if (isKetOke && isQtyDeficit) {
    const shortage = quantity - receivedQty;
    return {
      status: 'CHECK DATA',
      conflictReason: `Status tercatat OKE, tetapi masih kurang ${shortage.toLocaleString()} unit`,
    };
  }

  // Conflict 2: Source says BELUM, but physically fulfilled
  if (isKetBelum && isQtyFulfilled) {
    return {
      status: 'CHECK DATA',
      conflictReason: 'Status tercatat BELUM, tetapi kuantitas diterima sudah memenuhi kebutuhan',
    };
  }

  // Natural READY
  if (isQtyFulfilled && (isKetOke || !upperKet)) {
    return { status: 'READY' };
  }

  // Natural NOT READY
  if (isQtyDeficit && (isKetBelum || !upperKet)) {
    return { status: 'NOT READY' };
  }

  // Other ambiguous status text
  if (!isKetOke && !isKetBelum && upperKet) {
    return {
      status: isQtyFulfilled ? 'READY' : 'NOT READY',
      conflictReason: `Keterangan sumber '${sourceKet}' perlu dikonfirmasi`,
    };
  }

  return {
    status: isQtyFulfilled ? 'READY' : 'NOT READY',
  };
}

/**
 * Calculates risk scores and generates operational mitigations with production schedule awareness.
 */
export function evaluateMaterialRisk(
  quantity: number,
  receivedQty: number,
  readinessStatus: ReadinessStatus,
  dataAgeDays: number | null,
  weights: RiskWeightsConfig,
  conflictReason?: string,
  productionSchedule?: ProductionSchedule | null,
  referenceDate: Date = new Date()
): {
  shortageRiskScore: number;
  staleRiskScore: number;
  compositeRiskScore: number;
  riskLevel: RiskLevel;
  riskReasons: string[];
  primaryRiskReason: string;
  recommendedMitigations: string[];
  followUpPriority: 'P1 - Segera' | 'P2 - Tinggi' | 'P3 - Sedang' | 'P4 - Rutin';
  daysToProduction: number | null;
  scheduleStatus: 'SCHEDULED' | 'UNSCHEDULED';
} {
  const riskReasons: string[] = [];
  const mitigations: string[] = [];
  let primaryRiskReason = 'Status normal';

  const shortage = Math.max(0, quantity - receivedQty);
  const deficitRatio = quantity > 0 ? Math.min(1, shortage / quantity) : 0;

  // 1. Calculate days to production if schedule exists
  let daysToProduction: number | null = null;
  let scheduleStatus: 'SCHEDULED' | 'UNSCHEDULED' = 'UNSCHEDULED';

  if (productionSchedule && productionSchedule.productionDate) {
    scheduleStatus = 'SCHEDULED';
    const targetDate = new Date(productionSchedule.productionDate);
    if (!isNaN(targetDate.getTime())) {
      const startOfToday = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
      const startOfTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      daysToProduction = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86400000);
    }
  }

  // 2. Shortage Risk (0 - 100)
  let shortageRiskScore = 0;
  if (readinessStatus === 'READY') {
    shortageRiskScore = 0;
  } else if (quantity > 0) {
    if (shortage === quantity) {
      shortageRiskScore = 100;
      riskReasons.push('Material belum diterima sama sekali (0% pemenuhan)');
      primaryRiskReason = '0% diterima (Stok kosong)';
    } else {
      shortageRiskScore = Math.round(30 + deficitRatio * 70);
      riskReasons.push(`Kekurangan material sebesar ${(deficitRatio * 100).toFixed(0)}% (${shortage.toLocaleString()} unit)`);
      primaryRiskReason = `Defisit ${(deficitRatio * 100).toFixed(0)}% (-${shortage.toLocaleString()})`;
    }
  }

  // 3. Stale Data Risk (0 - 100)
  let staleRiskScore = 0;
  if (dataAgeDays === null) {
    staleRiskScore = 40;
    riskReasons.push('Tanggal update tidak tercatat pada sheet');
    mitigations.push('Lengkapi tanggal pembaruan informasi material');
  } else if (dataAgeDays > weights.staleThresholdDays) {
    const overdueDays = dataAgeDays - weights.staleThresholdDays;
    staleRiskScore = Math.min(100, Math.round(40 + (overdueDays / 5) * 60));
    riskReasons.push(`Data belum diperbarui selama ${dataAgeDays} hari (melewati batas ${weights.staleThresholdDays} hari)`);
    mitigations.push('Konfirmasi status fisik terbaru ke tim gudang atau purchasing');
  } else {
    staleRiskScore = Math.round((dataAgeDays / weights.staleThresholdDays) * 20);
  }

  // 4. Inconsistency / Conflict factor (0 - 100)
  let inconsistencyRiskScore = 0;
  if (readinessStatus === 'CHECK DATA') {
    inconsistencyRiskScore = 90;
    if (conflictReason) {
      riskReasons.push(`Anomali data: ${conflictReason}`);
      primaryRiskReason = conflictReason;
    }
    mitigations.push('Klarifikasi ketidaksesuaian antara kuantitas fisik dan status keterangan pada spreadsheet');
  }

  // 5. Schedule-based Proximity & Overdue Impact
  let scheduleMultiplier = 1.0;
  let scheduleOverrideLevel: RiskLevel | null = null;

  if (scheduleStatus === 'SCHEDULED' && daysToProduction !== null) {
    if (readinessStatus === 'READY') {
      // Material ready, schedule is safe!
      riskReasons.push(`Jadwal produksi: ${productionSchedule?.productionDate} (Aman - Material Ready)`);
      primaryRiskReason = `Aman (Produksi ${productionSchedule?.productionDate})`;
    } else {
      // Material NOT READY or CHECK DATA
      if (daysToProduction < 0) {
        // OVERDUE PRODUCTION!
        const overdueDays = Math.abs(daysToProduction);
        scheduleMultiplier = 1.8;
        scheduleOverrideLevel = 'CRITICAL';
        riskReasons.unshift(`🚨 OVERDUE PRODUKSI: Jadwal produksi telah lewat ${overdueDays} hari lalu (${productionSchedule?.productionDate}) dan material masih defisit!`);
        primaryRiskReason = `🚨 OVERDUE PRODUKSI (${overdueDays} hari lalu)`;
        mitigations.unshift('Hentikan penundaan! Hubungi supplier darurat atau eskalasi pengadaan hari ini.');
      } else if (daysToProduction <= 3) {
        // <= 3 Days remaining (CRITICAL)
        scheduleMultiplier = 1.6;
        scheduleOverrideLevel = 'CRITICAL';
        riskReasons.unshift(`⚠️ MEGET JADWAL: Produksi dalam ${daysToProduction} hari (${productionSchedule?.productionDate}) dengan defisit material!`);
        primaryRiskReason = `⚠️ Kritis: Produksi dalam ${daysToProduction} hari`;
        mitigations.unshift('Koordinasi ekspedisi express & prioritaskan line sewing segera setelah tiba.');
      } else if (daysToProduction <= 7) {
        // 4 - 7 Days remaining (HIGH)
        scheduleMultiplier = 1.35;
        if (!scheduleOverrideLevel || scheduleOverrideLevel === 'LOW' || scheduleOverrideLevel === 'MEDIUM') {
          scheduleOverrideLevel = 'HIGH';
        }
        riskReasons.unshift(`Jadwal produksi mendekat dalam ${daysToProduction} hari (${productionSchedule?.productionDate})`);
        primaryRiskReason = `Jadwal produksi ${daysToProduction} hari lagi`;
        mitigations.push('Pastikan kepastian pengiriman supplier minggu ini.');
      } else if (daysToProduction <= 14) {
        // 8 - 14 Days remaining (MEDIUM)
        scheduleMultiplier = 1.1;
        riskReasons.push(`Jadwal produksi dalam ${daysToProduction} hari (${productionSchedule?.productionDate})`);
        if (!primaryRiskReason || primaryRiskReason === 'Status normal') {
          primaryRiskReason = `Jadwal produksi ${daysToProduction} hari lagi`;
        }
      } else {
        // > 14 Days remaining (Plentiful lead time)
        scheduleMultiplier = 0.85;
        riskReasons.push(`Jadwal produksi ${daysToProduction} hari lagi (${productionSchedule?.productionDate})`);
      }
    }
  } else {
    // Unscheduled
    if (readinessStatus !== 'READY') {
      riskReasons.push('⚠️ Jadwal produksi belum diatur pada sistem (Perlu Penjadwalan)');
    }
  }

  // If shortage exists, add standard mitigations
  if (shortage > 0 && readinessStatus !== 'READY') {
    mitigations.push(`Prioritaskan pemenuhan sisa kekurangan ${shortage.toLocaleString()} unit`);
    mitigations.push('Verifikasi surat jalan & jadwal kedatangan supplier');
  }

  // Calculate composite risk with weights normalized to sum 1.0
  const totalWeight = weights.shortageWeight + weights.staleWeight + weights.inconsistencyWeight;
  const wShortage = weights.shortageWeight / totalWeight;
  const wStale = weights.staleWeight / totalWeight;
  const wInconsistency = weights.inconsistencyWeight / totalWeight;

  const baseScore = shortageRiskScore * wShortage + staleRiskScore * wStale + inconsistencyRiskScore * wInconsistency;
  let compositeRiskScore = Math.min(100, Math.max(0, Math.round(baseScore * scheduleMultiplier)));

  if (readinessStatus === 'READY') {
    compositeRiskScore = Math.min(15, compositeRiskScore);
  }

  // Map to RiskLevel
  let riskLevel: RiskLevel = 'LOW';
  let followUpPriority: 'P1 - Segera' | 'P2 - Tinggi' | 'P3 - Sedang' | 'P4 - Rutin' = 'P4 - Rutin';

  if (scheduleOverrideLevel === 'CRITICAL' || compositeRiskScore >= 75 || (readinessStatus === 'NOT READY' && shortageRiskScore >= 80 && (daysToProduction === null || daysToProduction <= 7))) {
    riskLevel = 'CRITICAL';
    followUpPriority = 'P1 - Segera';
    if (!primaryRiskReason || primaryRiskReason === 'Status normal') {
      primaryRiskReason = `Defisit Kritis (${shortage.toLocaleString()})`;
    }
  } else if (scheduleOverrideLevel === 'HIGH' || compositeRiskScore >= 50 || readinessStatus === 'NOT READY') {
    riskLevel = 'HIGH';
    followUpPriority = 'P2 - Tinggi';
    if (!primaryRiskReason || primaryRiskReason === 'Status normal') {
      primaryRiskReason = `Kekurangan ${shortage.toLocaleString()}`;
    }
  } else if (compositeRiskScore >= 25 || readinessStatus === 'CHECK DATA' || staleRiskScore >= 50) {
    riskLevel = 'MEDIUM';
    followUpPriority = 'P3 - Sedang';
    if (!primaryRiskReason || primaryRiskReason === 'Status normal') {
      primaryRiskReason = conflictReason || 'Perlu pemantauan';
    }
  } else {
    riskLevel = 'LOW';
    followUpPriority = 'P4 - Rutin';
    primaryRiskReason = 'Aman / Terpenuhi';
  }

  if (mitigations.length === 0) {
    mitigations.push('Kesiapan material aman. Lakukan pemantauan rutin saat produksi dimulai.');
  }

  return {
    shortageRiskScore,
    staleRiskScore,
    compositeRiskScore,
    riskLevel,
    riskReasons,
    primaryRiskReason,
    recommendedMitigations: Array.from(new Set(mitigations)),
    followUpPriority,
    daysToProduction,
    scheduleStatus,
  };
}

/**
 * Transforms raw sheet row into a rich ParsedMaterialItem with all validations and scoring.
 */
export function parseRawRow(
  raw: RawSheetRow,
  weights: RiskWeightsConfig,
  referenceDate: Date = new Date(),
  productionSchedule?: ProductionSchedule | null
): ParsedMaterialItem {
  const { code, name } = extractMaterialCodeAndName(raw.productDisplayName);
  const quantity = Math.max(0, parseNumeric(raw.quantityRaw));
  const receivedQty = Math.max(0, parseNumeric(raw.receivedQtyRaw));
  const recordedBalance = parseNumeric(raw.balanceRaw);

  const calculatedShortage = Math.max(0, quantity - receivedQty);
  const calculatedSurplus = Math.max(0, receivedQty - quantity);

  // Check formula discrepancy in Column H
  const conventionA = receivedQty - quantity;
  const conventionB = quantity - receivedQty;
  const diffA = Math.abs(recordedBalance - conventionA);
  const diffB = Math.abs(recordedBalance - conventionB);
  const isDirectMatch = recordedBalance === 0 && calculatedShortage === 0;

  const hasDiscrepancy = !isDirectMatch && diffA > 0.01 && diffB > 0.01 && raw.balanceRaw !== '';

  const validationWarnings: string[] = [];
  if (hasDiscrepancy) {
    validationWarnings.push(
      `Nilai Kolom H (${recordedBalance}) berbeda dengan hitungan selisih (${conventionA} atau ${conventionB})`
    );
  }

  // Status determination
  const { status: readinessStatus, conflictReason } = determineReadinessStatus(
    quantity,
    receivedQty,
    raw.ketRaw
  );

  if (conflictReason) {
    validationWarnings.push(conflictReason);
  }

  // Date parsing (Kolom D)
  const updateDate = parseSheetDate(raw.updateDateRaw);
  const dataAgeDays = calculateDataAgeDays(updateDate, referenceDate);
  const isStale = dataAgeDays !== null && dataAgeDays > weights.staleThresholdDays;

  let updateDateFormatted = '-';
  if (updateDate) {
    updateDateFormatted = updateDate.toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } else if (raw.updateDateRaw) {
    updateDateFormatted = String(raw.updateDateRaw);
    validationWarnings.push(`Format tanggal '${raw.updateDateRaw}' tidak standar`);
  }

  // Risk evaluation with production schedule
  const risk = evaluateMaterialRisk(
    quantity,
    receivedQty,
    readinessStatus,
    dataAgeDays,
    weights,
    conflictReason,
    productionSchedule,
    referenceDate
  );

  const normalizedUnit = (raw.unit || '').trim().toUpperCase() || 'UNIT';

  return {
    id: `${raw.orNumber || 'NO-OR'}-${raw.style || 'NO-STYLE'}-${code}-${raw.rowIndex}`,
    rowIndex: raw.rowIndex,
    orNumber: (raw.orNumber || '-').trim(),
    style: (raw.style || '-').trim(),
    materialCode: code,
    materialName: name,
    productDisplayName: raw.productDisplayName || `${code} - ${name}`,
    quantity,
    receivedQty,
    recordedBalance,
    calculatedShortage,
    calculatedSurplus,
    unit: normalizedUnit,
    originalUnit: raw.unit || '',
    sourceStatus: (raw.ketRaw || '').trim(),
    readinessStatus,
    statusConflictReason: conflictReason,
    updateDate,
    updateDateFormatted,
    dataAgeDays,
    isStale,
    hasDiscrepancy,
    validationWarnings,
    productionSchedule: productionSchedule || null,
    daysToProduction: risk.daysToProduction,
    scheduleStatus: risk.scheduleStatus,
    shortageRiskScore: risk.shortageRiskScore,
    staleRiskScore: risk.staleRiskScore,
    compositeRiskScore: risk.compositeRiskScore,
    riskLevel: risk.riskLevel,
    riskReasons: risk.riskReasons,
    primaryRiskReason: risk.primaryRiskReason,
    recommendedMitigations: risk.recommendedMitigations,
    followUpPriority: risk.followUpPriority,
  };
}

/**
 * Filters material rows so that for each unique OR + Material combination,
 * only the row(s) with the most recent updateDate are preserved.
 *
 * Rules:
 * - Group key: `${orNumber}___${materialCode}` (fallback: productDisplayName).
 * - If multiple rows exist for the same material in the same OR:
 *   - Sort by updateDate descending (with valid dates taking precedence over null/invalid dates).
 *   - Keep only the rows matching the latest updateDate.
 * - Distinct materials within the same OR are ALWAYS preserved (e.g., fabric vs thread vs buttons).
 * - Distinct ORs are ALWAYS preserved.
 * - If a material has no valid update date at all, it is retained (with a validation flag) so data is never silently dropped.
 */
export function filterLatestMaterialUpdates(items: ParsedMaterialItem[]): ParsedMaterialItem[] {
  if (!items || items.length <= 1) return items;

  // Group by OR and Material Code
  const groups = new Map<string, ParsedMaterialItem[]>();

  for (const item of items) {
    const orKey = (item.orNumber || '-').trim().toUpperCase();
    const codeKey = (item.materialCode && item.materialCode !== '-' ? item.materialCode : item.productDisplayName || '-').trim().toUpperCase();
    const groupKey = `${orKey}___${codeKey}`;

    let list = groups.get(groupKey);
    if (!list) {
      list = [];
      groups.set(groupKey, list);
    }
    list.push(item);
  }

  const result: ParsedMaterialItem[] = [];

  for (const list of groups.values()) {
    if (list.length === 1) {
      result.push(list[0]);
      continue;
    }

    // Multiple rows for this OR + Material pair.
    // Find the latest valid date timestamp
    let maxTime: number | null = null;
    for (const item of list) {
      if (item.updateDate instanceof Date && !isNaN(item.updateDate.getTime())) {
        const t = item.updateDate.getTime();
        if (maxTime === null || t > maxTime) {
          maxTime = t;
        }
      }
    }

    if (maxTime !== null) {
      // Keep only rows matching the latest timestamp
      const latestRows = list.filter(
        (item) => item.updateDate instanceof Date && !isNaN(item.updateDate.getTime()) && item.updateDate.getTime() === maxTime
      );
      if (latestRows.length > 0) {
        result.push(...latestRows);
        continue;
      }
    }

    // If no valid dates at all, pick the last row by rowIndex
    const latestRowIndex = Math.max(...list.map((i) => i.rowIndex));
    const fallbackRow = list.find((i) => i.rowIndex === latestRowIndex) || list[list.length - 1];
    result.push(fallbackRow);
  }

  // Sort by original rowIndex ascending to keep natural spreadsheet flow
  return result.sort((a, b) => a.rowIndex - b.rowIndex);
}

/**
 * Enriches items with Production Schedules, Follow-Up statuses, and dynamic risk re-calculation.
 */
export function enrichItemsWithSchedulesAndFollowUps(
  items: ParsedMaterialItem[],
  schedules: ProductionSchedule[],
  followUps: Record<string, MaterialFollowUp>,
  weights: RiskWeightsConfig,
  referenceDate: Date = new Date()
): ParsedMaterialItem[] {
  if (!items || items.length === 0) return [];

  // Index schedules by OR + materialCode (specific) and OR (generic)
  const scheduleByOrAndMat = new Map<string, ProductionSchedule>();
  const scheduleByOrOnly = new Map<string, ProductionSchedule>();

  for (const s of schedules) {
    const orKey = (s.orNumber || '').trim().toUpperCase();
    if (!orKey) continue;

    if (s.materialCode && s.materialCode.trim()) {
      const matKey = `${orKey}___${s.materialCode.trim().toUpperCase()}`;
      scheduleByOrAndMat.set(matKey, s);
    } else {
      // General OR schedule
      scheduleByOrOnly.set(orKey, s);
    }
  }

  return items.map((item) => {
    const orKey = (item.orNumber || '').trim().toUpperCase();
    const matKey = `${orKey}___${(item.materialCode || '').trim().toUpperCase()}`;

    // Find schedule: specific material schedule takes precedence, then OR schedule
    const sched = scheduleByOrAndMat.get(matKey) || scheduleByOrOnly.get(orKey) || null;

    // Find follow-up record
    const followUp = followUps[matKey] || {
      materialKey: matKey,
      orNumber: item.orNumber,
      materialCode: item.materialCode,
      isFollowedUp: false,
      followedUpAt: null,
    };

    // Re-evaluate risk with current schedule
    const risk = evaluateMaterialRisk(
      item.quantity,
      item.receivedQty,
      item.readinessStatus,
      item.dataAgeDays,
      weights,
      item.statusConflictReason,
      sched,
      referenceDate
    );

    return {
      ...item,
      productionSchedule: sched,
      daysToProduction: risk.daysToProduction,
      scheduleStatus: risk.scheduleStatus,
      followUp,
      shortageRiskScore: risk.shortageRiskScore,
      staleRiskScore: risk.staleRiskScore,
      compositeRiskScore: risk.compositeRiskScore,
      riskLevel: risk.riskLevel,
      riskReasons: risk.riskReasons,
      primaryRiskReason: risk.primaryRiskReason,
      recommendedMitigations: risk.recommendedMitigations,
      followUpPriority: risk.followUpPriority,
    };
  });
}

/**
 * Calculates aggregate KPIs for the dashboard, respecting unit segregation.
 */
export function calculateDashboardKpi(items: ParsedMaterialItem[]): PpicDashboardKpi {
  const totalRows = items.length;
  let readyRows = 0;
  let notReadyRows = 0;
  let checkDataRows = 0;

  let criticalRiskCount = 0;
  let highRiskCount = 0;
  let mediumRiskCount = 0;
  let lowRiskCount = 0;

  let staleDataCount = 0;
  let dataDiscrepancyCount = 0;

  const uniqueMaterials = new Set<string>();
  const affectedOrSet = new Set<string>();
  const affectedStyleSet = new Set<string>();

  // Unit aggregation maps (never sum different units!)
  const unitShortageMap = new Map<string, { totalShortage: number; count: number; ors: Set<string>; styles: Set<string> }>();
  const materialSummaryMap = new Map<string, MaterialCodeSummary>();

  for (const item of items) {
    uniqueMaterials.add(item.materialCode);

    if (item.readinessStatus === 'READY') {
      readyRows++;
    } else if (item.readinessStatus === 'NOT READY') {
      notReadyRows++;
      if (item.orNumber && item.orNumber !== '-') affectedOrSet.add(item.orNumber);
      if (item.style && item.style !== '-') affectedStyleSet.add(item.style);
    } else {
      checkDataRows++;
    }

    if (item.riskLevel === 'CRITICAL') criticalRiskCount++;
    else if (item.riskLevel === 'HIGH') highRiskCount++;
    else if (item.riskLevel === 'MEDIUM') mediumRiskCount++;
    else lowRiskCount++;

    if (item.isStale) staleDataCount++;
    if (item.hasDiscrepancy || item.statusConflictReason) dataDiscrepancyCount++;

    // Unit shortage breakdown
    if (item.calculatedShortage > 0) {
      const u = item.unit;
      if (!unitShortageMap.has(u)) {
        unitShortageMap.set(u, { totalShortage: 0, count: 0, ors: new Set(), styles: new Set() });
      }
      const entry = unitShortageMap.get(u)!;
      entry.totalShortage += item.calculatedShortage;
      entry.count += 1;
      if (item.orNumber) entry.ors.add(item.orNumber);
      if (item.style) entry.styles.add(item.style);
    }

    // Material Code Summary
    const matKey = `${item.materialCode}___${item.unit}`;
    if (!materialSummaryMap.has(matKey)) {
      materialSummaryMap.set(matKey, {
        materialCode: item.materialCode,
        materialName: item.materialName,
        unit: item.unit,
        totalRequired: 0,
        totalReceived: 0,
        totalShortage: 0,
        orCount: 0,
        readyCount: 0,
        notReadyCount: 0,
        checkDataCount: 0,
      });
    }
    const matSummary = materialSummaryMap.get(matKey)!;
    matSummary.totalRequired += item.quantity;
    matSummary.totalReceived += item.receivedQty;
    matSummary.totalShortage += item.calculatedShortage;
    matSummary.orCount += 1;
    if (item.readinessStatus === 'READY') matSummary.readyCount++;
    else if (item.readinessStatus === 'NOT READY') matSummary.notReadyCount++;
    else matSummary.checkDataCount++;
  }

  const readinessPercentage = totalRows > 0 ? Math.round((readyRows / totalRows) * 1000) / 10 : 0;

  const shortageByUnit: UnitShortageSummary[] = Array.from(unitShortageMap.entries()).map(([unit, data]) => ({
    unit,
    totalShortage: Math.round(data.totalShortage * 100) / 100,
    itemCount: data.count,
    affectedORs: Array.from(data.ors),
    affectedStyles: Array.from(data.styles),
  })).sort((a, b) => b.totalShortage - a.totalShortage);

  const topShortageMaterials: MaterialCodeSummary[] = Array.from(materialSummaryMap.values())
    .filter(m => m.totalShortage > 0)
    .sort((a, b) => b.totalShortage - a.totalShortage)
    .slice(0, 10);

  return {
    totalRows,
    readyRows,
    notReadyRows,
    checkDataRows,
    readinessPercentage,
    uniqueMaterialsCount: uniqueMaterials.size,
    affectedOrCount: affectedOrSet.size,
    affectedStyleCount: affectedStyleSet.size,
    criticalRiskCount,
    highRiskCount,
    mediumRiskCount,
    lowRiskCount,
    staleDataCount,
    dataDiscrepancyCount,
    shortageByUnit,
    topShortageMaterials,
  };
}

/**
 * Dynamically detects the header row and column mapping from a 2D array of spreadsheet values.
 */
export function detectHeaderAndMapping(rows: unknown[][]): {
  headerRowIndex: number;
  mapping: ColumnMappingConfig;
  detectedHeaders: string[];
} {
  // Default standard Rekap mapping (Columns B to J, 0-indexed: B=1, C=2, D=3, E=4, F=5, G=6, H=7, I=8, J=9)
  const defaultMapping: ColumnMappingConfig = {
    colOr: 1,
    colStyle: 2,
    colDate: 3,
    colProduct: 4,
    colQuantity: 5,
    colReceived: 6,
    colBalance: 7,
    colUnit: 8,
    colKet: 9,
  };

  if (!rows || rows.length === 0) {
    return { headerRowIndex: 0, mapping: defaultMapping, detectedHeaders: [] };
  }

  // Scan first 15 rows for header row
  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    const rowStrings = row.map(cell => String(cell || '').trim().toLowerCase());

    const hasOr = rowStrings.some(s => s === 'or' || s.includes('order ref') || s.startsWith('or '));
    const hasStyle = rowStrings.some(s => s.includes('style') || s.includes('model'));
    const hasProduct = rowStrings.some(s => s.includes('product') || s.includes('material') || s.includes('item'));
    const hasQty = rowStrings.some(s => s.includes('quantity') || s === 'qty' || s.includes('kebutuhan'));

    // If at least 3 matching keywords found, this is the header row!
    if ((hasOr && hasStyle) || (hasProduct && hasQty)) {
      const mapping = { ...defaultMapping };
      rowStrings.forEach((colStr, idx) => {
        if (colStr === 'or' || colStr.includes('order reference')) mapping.colOr = idx;
        else if (colStr.includes('style')) mapping.colStyle = idx;
        else if (colStr.includes('tanggal') || colStr.includes('date') || colStr.includes('update')) mapping.colDate = idx;
        else if (colStr.includes('product') || colStr.includes('material') || colStr.includes('display name')) mapping.colProduct = idx;
        else if (colStr.includes('received') || colStr.includes('diterima')) mapping.colReceived = idx;
        else if (colStr.includes('quantity') || colStr === 'qty' || colStr.includes('kebutuhan')) mapping.colQuantity = idx;
        else if (colStr.includes('kurang') || colStr.includes('balance') || colStr.includes('selisih') || colStr.includes('kelebihan')) mapping.colBalance = idx;
        else if (colStr.includes('satuan') || colStr.includes('unit') || colStr === 'uom') mapping.colUnit = idx;
        else if (colStr === 'ket' || colStr.includes('status') || colStr.includes('keterangan')) mapping.colKet = idx;
      });

      return {
        headerRowIndex: r,
        mapping,
        detectedHeaders: row.map(c => String(c || '').trim()),
      };
    }
  }

  return { headerRowIndex: 0, mapping: defaultMapping, detectedHeaders: [] };
}
