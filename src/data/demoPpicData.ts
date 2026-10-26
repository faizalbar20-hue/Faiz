/**
 * Realistic Garment / Apparel PPIC Sample Data
 * STRICTLY LABELED AS DEMO SIMULATION.
 * Follows exact column structure B to J of the "Rekap" sheet:
 * B: OR
 * C: Style
 * D: Tanggal (Last Updated Date)
 * E: Order Lines/Product/Display Name
 * F: Order Lines/Quantity
 * G: Order Lines/Received Qty
 * H: Kekurangan/Kelebihan
 * I: Satuan
 * J: Ket
 */

import { RawSheetRow, ParsedMaterialItem, RiskWeightsConfig } from '../types/ppic';
import { parseRawRow } from '../utils/ppicCalculations';

export const DEMO_RAW_ROWS: RawSheetRow[] = [
  // OR 1095 - Style: KS-882 ANORAK JACKET
  {
    rowIndex: 2,
    orNumber: 'OR 1095',
    style: 'KS-882 ANORAK',
    updateDateRaw: '2026-10-22', // Fresh today
    productDisplayName: '[KN-TASLAN] KAIN TASLAN WATERPROOF NAVY',
    quantityRaw: '1250',
    receivedQtyRaw: '1250',
    balanceRaw: '0',
    unit: 'YDS',
    ketRaw: 'OKE',
  },
  {
    rowIndex: 3,
    orNumber: 'OR 1095',
    style: 'KS-882 ANORAK',
    updateDateRaw: '2026-10-21',
    productDisplayName: '[LN-MESH] LINING MESH POLYESTER BLACK',
    quantityRaw: '680',
    receivedQtyRaw: '680',
    balanceRaw: '0',
    unit: 'YDS',
    ketRaw: 'OKE',
  },
  {
    rowIndex: 4,
    orNumber: 'OR 1095',
    style: 'KS-882 ANORAK',
    updateDateRaw: '2026-10-18', // 4 days ago -> Stale (> 3 days)
    productDisplayName: '[ZIP-VIS-05] ZIPPER VISLON 5 OPEN-END 70CM',
    quantityRaw: '850',
    receivedQtyRaw: '350',
    balanceRaw: '-500',
    unit: 'PCS',
    ketRaw: 'BELUM',
  },
  {
    rowIndex: 5,
    orNumber: 'OR 1095',
    style: 'KS-882 ANORAK',
    updateDateRaw: '2026-10-08', // Obsolete older date (will be filtered out by filterLatestMaterialUpdates)
    productDisplayName: '[STP-SNAP] SNAP BUTTON METAL 15MM GUNMETAL',
    quantityRaw: '250',
    receivedQtyRaw: '0',
    balanceRaw: '-250',
    unit: 'GROS',
    ketRaw: 'BELUM',
  },
  {
    rowIndex: 6,
    orNumber: 'OR 1095',
    style: 'KS-882 ANORAK',
    updateDateRaw: '2026-10-15', // Latest valid update date (kept by filterLatestMaterialUpdates)
    productDisplayName: '[STP-SNAP] SNAP BUTTON METAL 15MM GUNMETAL',
    quantityRaw: '250',
    receivedQtyRaw: '0',
    balanceRaw: '-250',
    unit: 'GROS',
    ketRaw: 'BELUM',
  },
  {
    rowIndex: 6,
    orNumber: 'OR 1095',
    style: 'KS-882 ANORAK',
    updateDateRaw: '2026-10-20',
    productDisplayName: '[TRM-ELAST] ELASTIC BAND 2.5CM BLACK',
    quantityRaw: '420',
    receivedQtyRaw: '420',
    balanceRaw: '0',
    unit: 'YDS',
    ketRaw: 'OKE',
  },

  // OR 1014 - Style: WD-302 DENIM OVERSHIRT
  {
    rowIndex: 7,
    orNumber: 'OR 1014',
    style: 'WD-302 DENIM',
    updateDateRaw: '2026-10-22',
    productDisplayName: '[DNM-12OZ] FABRIC DENIM 12OZ RAW INDIGO',
    quantityRaw: '2400',
    receivedQtyRaw: '1800',
    balanceRaw: '-600',
    unit: 'YDS',
    ketRaw: 'BELUM',
  },
  {
    rowIndex: 8,
    orNumber: 'OR 1014',
    style: 'WD-302 DENIM',
    updateDateRaw: '2026-10-21',
    productDisplayName: '[TH-POLY-20] BENANG SEWING 20/2 TOBACCO GOLD',
    quantityRaw: '85',
    receivedQtyRaw: '85',
    balanceRaw: '0',
    unit: 'CONE',
    ketRaw: 'OKE',
  },
  {
    rowIndex: 9,
    orNumber: 'OR 1014',
    style: 'WD-302 DENIM',
    updateDateRaw: '2026-10-19', // Conflict: Ket OKE but physically short!
    productDisplayName: '[RVT-COPPER] RIVET COPPER CLASSIC 9MM',
    quantityRaw: '150',
    receivedQtyRaw: '50',
    balanceRaw: '-100',
    unit: 'GROS',
    ketRaw: 'OKE', // CHECK DATA TRIGGER!
  },
  {
    rowIndex: 10,
    orNumber: 'OR 1014',
    style: 'WD-302 DENIM',
    updateDateRaw: '2026-10-22',
    productDisplayName: '[LBL-MAIN] WOVEN MAIN LABEL "HERITAGE CO"',
    quantityRaw: '1200',
    receivedQtyRaw: '1200',
    balanceRaw: '0',
    unit: 'PCS',
    ketRaw: 'OKE',
  },

  // OR 1036 - Style: CT-710 CHINO TROUSERS
  {
    rowIndex: 11,
    orNumber: 'OR 1036',
    style: 'CT-710 CHINO',
    updateDateRaw: '2026-10-16', // Stale
    productDisplayName: '[TWL-STRETCH] COTTON TWILL 280GSM KHAKI',
    quantityRaw: '1850',
    receivedQtyRaw: '1200',
    balanceRaw: '-650',
    unit: 'YDS',
    ketRaw: 'BELUM',
  },
  {
    rowIndex: 12,
    orNumber: 'OR 1036',
    style: 'CT-710 CHINO',
    updateDateRaw: '2026-10-20',
    productDisplayName: '[PKT-TC] POCKETING FABRIC TC 65/35 OFF WHITE',
    quantityRaw: '450',
    receivedQtyRaw: '450',
    balanceRaw: '0',
    unit: 'YDS',
    ketRaw: 'OKE',
  },
  {
    rowIndex: 13,
    orNumber: 'OR 1036',
    style: 'CT-710 CHINO',
    updateDateRaw: '2026-10-21',
    productDisplayName: '[ZIP-BRASS-04] ZIPPER BRASS #4 CLOSED-END 18CM',
    quantityRaw: '950',
    receivedQtyRaw: '950',
    balanceRaw: '0',
    unit: 'PCS',
    ketRaw: 'OKE',
  },
  {
    rowIndex: 14,
    orNumber: 'OR 1036',
    style: 'CT-710 CHINO',
    updateDateRaw: '2026-10-17', // Discrepancy: Ket BELUM but received == quantity
    productDisplayName: '[BTN-HORN-24] BUTTON HORN 4-HOLE 24L BROWN',
    quantityRaw: '80',
    receivedQtyRaw: '80',
    balanceRaw: '0',
    unit: 'GROS',
    ketRaw: 'BELUM', // CHECK DATA TRIGGER!
  },
  {
    rowIndex: 15,
    orNumber: 'OR 1036',
    style: 'CT-710 CHINO',
    updateDateRaw: '2026-10-22',
    productDisplayName: '[FUS-INT-30] FUSIBLE INTERLINING 30D WHITE',
    quantityRaw: '300',
    receivedQtyRaw: '350', // Surplus: +50 YDS
    balanceRaw: '50',
    unit: 'YDS',
    ketRaw: 'OKE',
  },

  // OR 1050 - Style: PL-108 POLO PIQUE SPORT
  {
    rowIndex: 16,
    orNumber: 'OR 1050',
    style: 'PL-108 POLO',
    updateDateRaw: '2026-10-14', // 8 days stale -> Critical Stale
    productDisplayName: '[FAB-PIQUE] COTTON COMBED PIQUE 24S MAROON',
    quantityRaw: '980',
    receivedQtyRaw: '0',
    balanceRaw: '-980',
    unit: 'KG',
    ketRaw: 'BELUM',
  },
  {
    rowIndex: 17,
    orNumber: 'OR 1050',
    style: 'PL-108 POLO',
    updateDateRaw: '2026-10-21',
    productDisplayName: '[RIB-COLLAR] FLAT KNIT COLLAR & CUFF SET MAROON',
    quantityRaw: '600',
    receivedQtyRaw: '600',
    balanceRaw: '0',
    unit: 'SET',
    ketRaw: 'OKE',
  },
];

export function getDemoMaterialItems(weights: RiskWeightsConfig): ParsedMaterialItem[] {
  const refDate = new Date(); // Today
  return DEMO_RAW_ROWS.map(raw => parseRawRow(raw, weights, refDate));
}
