/**
 * Types for Material Readiness & Risk Monitoring Dashboard (PPIC)
 */

export type ReadinessStatus = 'READY' | 'NOT READY' | 'CHECK DATA';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RawSheetRow {
  rowIndex: number;
  orNumber: string; // Kolom B
  style: string; // Kolom C
  updateDateRaw: string; // Kolom D (Tanggal terakhir pembaruan)
  productDisplayName: string; // Kolom E (Order Lines/Product/Display Name)
  quantityRaw: string | number; // Kolom F (Order Lines/Quantity)
  receivedQtyRaw: string | number; // Kolom G (Order Lines/Received Qty)
  balanceRaw: string | number; // Kolom H (Kekurangan/Kelebihan)
  unit: string; // Kolom I (Satuan)
  ketRaw: string; // Kolom J (Keterangan / Ket status sumber)
}

export interface ProductionSchedule {
  id: string;
  orNumber: string;
  productionDate: string; // YYYY-MM-DD
  materialCode?: string;
  materialName?: string;
  requiredQty?: number;
  notes?: string;
  leadTimeDays?: number;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialFollowUp {
  materialKey: string; // `${orNumber}___${materialCode}`
  orNumber: string;
  materialCode: string;
  isFollowedUp: boolean;
  followedUpAt: string | null; // ISO Date String
  notes?: string;
}

export interface ParsedMaterialItem {
  id: string; // generated unique id: or-style-code-row
  rowIndex: number;
  orNumber: string;
  style: string;
  materialCode: string;
  materialName: string;
  productDisplayName: string;
  
  // Quantities
  quantity: number; // Kebutuhan
  receivedQty: number; // Diterima
  recordedBalance: number; // Nilai di kolom H
  calculatedShortage: number; // Kebutuhan - Diterima (jika > 0)
  calculatedSurplus: number; // Diterima - Kebutuhan (jika > 0)
  unit: string; // Normalized display unit (e.g. YDS, PCS, GROS)
  originalUnit: string;
  
  // Statuses
  sourceStatus: string; // Nilai teks di kolom J (OKE / BELUM / etc.)
  readinessStatus: ReadinessStatus;
  statusConflictReason?: string;
  
  // Date & Age Analysis (Kolom D adalah Tanggal Update)
  updateDate: Date | null;
  updateDateFormatted: string;
  dataAgeDays: number | null; // Selisih hari dari updateDate sampai hari ini
  isStale: boolean;
  
  // Validation flags
  hasDiscrepancy: boolean; // Selisih kolom H berbeda dengan hitungan
  validationWarnings: string[];

  // Production Schedule Integration
  productionSchedule?: ProductionSchedule | null;
  daysToProduction?: number | null; // Selisih hari menuju tanggal produksi (targetDate - today)
  scheduleStatus?: 'SCHEDULED' | 'UNSCHEDULED';

  // Follow-Up tracking
  followUp?: MaterialFollowUp;

  // Risk Evaluation
  shortageRiskScore: number; // 0 - 100
  staleRiskScore: number; // 0 - 100
  compositeRiskScore: number; // 0 - 100
  riskLevel: RiskLevel;
  riskReasons: string[];
  primaryRiskReason?: string;
  recommendedMitigations: string[];
  followUpPriority: 'P1 - Segera' | 'P2 - Tinggi' | 'P3 - Sedang' | 'P4 - Rutin';
}

export interface UnitShortageSummary {
  unit: string;
  totalShortage: number;
  itemCount: number;
  affectedORs: string[];
  affectedStyles: string[];
}

export interface MaterialCodeSummary {
  materialCode: string;
  materialName: string;
  unit: string;
  totalRequired: number;
  totalReceived: number;
  totalShortage: number;
  orCount: number;
  readyCount: number;
  notReadyCount: number;
  checkDataCount: number;
}

export interface PpicDashboardKpi {
  totalRows: number;
  readyRows: number;
  notReadyRows: number;
  checkDataRows: number;
  readinessPercentage: number;
  
  uniqueMaterialsCount: number;
  affectedOrCount: number;
  affectedStyleCount: number;
  
  criticalRiskCount: number;
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
  
  staleDataCount: number;
  dataDiscrepancyCount: number;
  
  shortageByUnit: UnitShortageSummary[];
  topShortageMaterials: MaterialCodeSummary[];
}

export interface RiskWeightsConfig {
  shortageWeight: number; // default 0.60 (60%)
  staleWeight: number; // default 0.25 (25%)
  inconsistencyWeight: number; // default 0.15 (15%)
  staleThresholdDays: number; // default 3 days
}

export interface ColumnMappingConfig {
  colOr: number; // B (index 1)
  colStyle: number; // C (index 2)
  colDate: number; // D (index 3)
  colProduct: number; // E (index 4)
  colQuantity: number; // F (index 5)
  colReceived: number; // G (index 6)
  colBalance: number; // H (index 7)
  colUnit: number; // I (index 8)
  colKet: number; // J (index 9)
}

export interface AppSettings {
  spreadsheetId: string;
  sheetName: string; // Default: 'Rekap'
  appsScriptUrl?: string; // Optional Google Apps Script Web App URL
  connectionMethod?: 'AUTO' | 'GVIZ' | 'APPS_SCRIPT' | 'OAUTH';
  syncIntervalSeconds: number; // Default: 60
  autoSyncEnabled: boolean;
  staleThresholdDays: number; // Default: 3
  riskWeights: RiskWeightsConfig;
  columnMapping: ColumnMappingConfig;
  useDemoData: boolean; // Explicit toggle for previewing demo data
}

export interface SyncLogEntry {
  id: string;
  timestamp: Date;
  status: 'SUCCESS' | 'ERROR' | 'LOADING';
  rowCount?: number;
  message: string;
  durationMs?: number;
  source: 'GOOGLE_SHEETS' | 'DEMO_DATA';
}
