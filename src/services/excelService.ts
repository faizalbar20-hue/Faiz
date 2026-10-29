/**
 * Service for Parsing and Validating Excel Files (.xlsx, .xls) for PPIC Material Dashboard.
 * Reads headers dynamically by name (regardless of column order), splits product codes and names,
 * maps UoM, Quantity, Received Qty, and calculates Kekurangan and Kesiapan strictly according to PPIC rules.
 */

import * as XLSX from 'xlsx';
import { ParsedMaterialItem, ExcelParseSummary, ReadinessStatus } from '../types/ppic';
import { parseNumeric } from '../utils/ppicCalculations';

export interface SplitResult {
  code: string;
  name: string;
  confidence: 'HIGH' | 'LOW';
  warning?: string;
}

/**
 * Splits combined product display name into separate materialCode and materialName.
 * Preserves leading zeros in codes, original text, and does not invent missing data.
 *
 * Supported patterns:
 * 1. [CODE] NAME (e.g. "[BTN-SNP-06] SNAP BUTTON 15MM" or "[001234] COTTON COMBED")
 * 2. CODE - NAME or CODE : NAME or CODE | NAME (e.g. "00124 - FABRIC DENIM 12OZ")
 * 3. CODE (NAME) or NAME (CODE)
 * 4. CODE NAME where CODE is alphanumeric with hyphens/digits (e.g. "FAB-PIQUE COTTON COMBED 24S")
 */
export function splitProductCodeAndName(raw: string): SplitResult {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    return {
      code: '-',
      name: '-',
      confidence: 'LOW',
      warning: 'Nama display material kosong',
    };
  }

  // Pattern 1: [CODE] NAME or [CODE]
  const bracketMatch = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (bracketMatch) {
    const code = bracketMatch[1].trim();
    const name = bracketMatch[2].trim() || code;
    return {
      code,
      name,
      confidence: 'HIGH',
    };
  }

  // Pattern 2: CODE - NAME or CODE : NAME or CODE | NAME or CODE / NAME
  // Requires whitespace around hyphen/dash so hyphenated codes (e.g. "FAB-PIQUE") are preserved
  const separatorMatch = trimmed.match(/^([A-Za-z0-9_./-]+?)(?:\s+[-:—|/]\s*|:\s+|\s*[|]\s*)(.+)$/);
  if (separatorMatch) {
    const code = separatorMatch[1].trim();
    const name = separatorMatch[2].trim();
    if (code.length >= 2 && name.length >= 2) {
      return {
        code,
        name,
        confidence: 'HIGH',
      };
    }
  }

  // Pattern 3: NAME (CODE) or (CODE) NAME
  const parenLeadingMatch = trimmed.match(/^\(([^)]+)\)\s*(.+)$/);
  if (parenLeadingMatch) {
    return {
      code: parenLeadingMatch[1].trim(),
      name: parenLeadingMatch[2].trim(),
      confidence: 'HIGH',
    };
  }
  const parenTrailingMatch = trimmed.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (parenTrailingMatch) {
    const potentialName = parenTrailingMatch[1].trim();
    const potentialCode = parenTrailingMatch[2].trim();
    // If inside parenthesis is short / code-like
    if (potentialCode.length <= 25 && /^[A-Za-z0-9_.-]+$/.test(potentialCode)) {
      return {
        code: potentialCode,
        name: potentialName,
        confidence: 'HIGH',
      };
    }
  }

  // Pattern 4: CODE NAME where CODE has hyphens/underscores/numbers (e.g. "FAB-PIQUE COMBED", "00123 FABRIC")
  const spaceTokenMatch = trimmed.match(/^([A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)+|[0-9]{3,})\s+(.+)$/);
  if (spaceTokenMatch) {
    return {
      code: spaceTokenMatch[1].trim(),
      name: spaceTokenMatch[2].trim(),
      confidence: 'HIGH',
    };
  }

  // Pattern 5: Single word or first token as code if it has both letters and numbers
  const firstWordMatch = trimmed.match(/^([A-Za-z0-9_-]{3,15})\s+(.+)$/);
  if (firstWordMatch) {
    const firstWord = firstWordMatch[1];
    const rest = firstWordMatch[2];
    const hasLetter = /[A-Za-z]/.test(firstWord);
    const hasDigit = /[0-9]/.test(firstWord);
    if (hasLetter && hasDigit) {
      return {
        code: firstWord,
        name: rest,
        confidence: 'HIGH',
      };
    }
  }

  // Fallback: Unable to split with high confidence
  // Use the entire text as name, generate short code from first token or entire text
  return {
    code: trimmed.slice(0, 30),
    name: trimmed,
    confidence: 'LOW',
    warning: 'Pola kode & nama material belum terdeteksi secara pasti. Periksa pratinjau sebelum menyimpan.',
  };
}

/**
 * Normalizes a header text for flexible, case-insensitive comparison.
 */
function normalizeHeader(str: unknown): string {
  return String(str || '')
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ExcelHeaderMapping {
  productColIndex: number;
  unitColIndex: number;
  quantityColIndex: number;
  receivedColIndex: number;
  headerRowIndex: number;
}

/**
 * Detects header columns by scanning the sheet rows.
 * Reads header names dynamically regardless of column position.
 * Supports variations like "Order Lines/Recieved Qty" vs "Order Lines/Received Qty".
 */
export function detectExcelHeaders(rows: unknown[][]): ExcelHeaderMapping | null {
  const maxScanRows = Math.min(rows.length, 30);

  for (let r = 0; r < maxScanRows; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    let productColIndex = -1;
    let unitColIndex = -1;
    let quantityColIndex = -1;
    let receivedColIndex = -1;

    for (let c = 0; c < row.length; c++) {
      const cellText = normalizeHeader(row[c]);
      if (!cellText) continue;

      // 1. Order Lines/Product/Display Name
      if (
        cellText.includes('order lines/product/display name') ||
        (cellText.includes('product') && cellText.includes('display name')) ||
        cellText === 'product/display name' ||
        cellText === 'display name' ||
        cellText === 'product display name' ||
        cellText === 'nama material' ||
        cellText === 'barang'
      ) {
        if (productColIndex === -1) productColIndex = c;
      }

      // 2. Order Lines/Product Unit of Measure/Display Name
      if (
        cellText.includes('order lines/product unit of measure/display name') ||
        (cellText.includes('unit of measure') && cellText.includes('display name')) ||
        cellText.includes('product unit of measure') ||
        cellText === 'unit of measure' ||
        cellText === 'uom' ||
        cellText === 'satuan' ||
        cellText === 'unit'
      ) {
        if (unitColIndex === -1) unitColIndex = c;
      }

      // 3. Order Lines/Quantity
      if (
        cellText.includes('order lines/quantity') ||
        cellText === 'quantity' ||
        cellText === 'qty' ||
        cellText === 'kebutuhan' ||
        cellText === 'jumlah kebutuhan'
      ) {
        if (quantityColIndex === -1) quantityColIndex = c;
      }

      // 4. Order Lines/Recieved Qty or Order Lines/Received Qty
      if (
        cellText.includes('order lines/recieved qty') ||
        cellText.includes('order lines/received qty') ||
        cellText.includes('recieved qty') ||
        cellText.includes('received qty') ||
        cellText.includes('received quantity') ||
        cellText.includes('recieved quantity') ||
        cellText.includes('diterima') ||
        cellText === 'received' ||
        cellText === 'recieved' ||
        cellText === 'terima'
      ) {
        if (receivedColIndex === -1) receivedColIndex = c;
      }
    }

    // A valid header row must contain at least product and either quantity or received
    if (productColIndex !== -1 && (quantityColIndex !== -1 || receivedColIndex !== -1)) {
      return {
        productColIndex,
        unitColIndex,
        quantityColIndex,
        receivedColIndex,
        headerRowIndex: r,
      };
    }
  }

  return null;
}

/**
 * Checks whether a raw cell contains a valid numeric value.
 */
function isValidNumericCell(val: unknown): boolean {
  if (val === null || val === undefined || val === '') return false;
  if (typeof val === 'number') return !isNaN(val);
  const str = String(val).trim();
  if (!str) return false;
  // If string contains letters (except accounting notations), it's not a valid number
  const stripped = str.replace(/[^\d.,()-]/g, '');
  return stripped.length > 0 && /[\d]/.test(stripped);
}

/**
 * Main parsing function for Excel workbooks.
 */
export function parseExcelWorkbook(
  workbook: XLSX.WorkBook,
  fileName: string,
  orNumber: string,
  dataDate: string,
  sheetNameOption?: string
): ExcelParseSummary {
  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    throw new Error('File Excel tidak memiliki lembar kerja (worksheet).');
  }

  // Select target sheet
  let targetSheetName = sheetNameOption && sheetNames.includes(sheetNameOption)
    ? sheetNameOption
    : '';

  if (!targetSheetName) {
    // Try to find a sheet containing 'order' or 'rekap' or 'material', otherwise first sheet
    const matchingSheet = sheetNames.find(
      (s) =>
        s.toLowerCase().includes('order') ||
        s.toLowerCase().includes('rekap') ||
        s.toLowerCase().includes('material') ||
        s.toLowerCase().includes('lines')
    );
    targetSheetName = matchingSheet || sheetNames[0];
  }

  const worksheet = workbook.Sheets[targetSheetName];
  if (!worksheet) {
    throw new Error(`Lembar kerja '${targetSheetName}' tidak ditemukan dalam file.`);
  }

  // Convert to 2D array of raw values
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: true,
  });

  if (rawRows.length === 0) {
    return {
      fileName,
      sheetNames,
      selectedSheet: targetSheetName,
      totalRowsRead: 0,
      validRowsCount: 0,
      reviewRowsCount: 0,
      rejectedRowsCount: 0,
      rejectedReasons: ['Lembar kerja kosong.'],
      items: [],
    };
  }

  // Detect header mapping
  const mapping = detectExcelHeaders(rawRows);
  if (!mapping) {
    throw new Error(
      `Header kolom Excel tidak dikenali pada sheet '${targetSheetName}'. Pastikan file memuat kolom: 'Order Lines/Product/Display Name', 'Order Lines/Quantity', dan 'Order Lines/Recieved Qty'.`
    );
  }

  const { productColIndex, unitColIndex, quantityColIndex, receivedColIndex, headerRowIndex } = mapping;

  const parsedItems: ParsedMaterialItem[] = [];
  const rejectedReasons: string[] = [];
  let validRowsCount = 0;
  let reviewRowsCount = 0;
  let rejectedRowsCount = 0;

  const cleanOr = orNumber.trim().toUpperCase().startsWith('OR')
    ? orNumber.trim().toUpperCase()
    : `OR ${orNumber.trim()}`;

  const cleanDate = dataDate.trim();
  const parsedUpdateDate = cleanDate ? new Date(cleanDate) : new Date();
  const updateDateFormatted = parsedUpdateDate.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const now = new Date();
  const diffTime = Math.abs(now.getTime() - parsedUpdateDate.getTime());
  const dataAgeDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // Loop through all data rows after header
  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;

    // Extract raw cell values
    const rawProduct = productColIndex !== -1 ? row[productColIndex] : '';
    const rawUnit = unitColIndex !== -1 ? row[unitColIndex] : '';
    const rawQuantity = quantityColIndex !== -1 ? row[quantityColIndex] : '';
    const rawReceived = receivedColIndex !== -1 ? row[receivedColIndex] : '';

    const productStr = String(rawProduct || '').trim();
    const unitStr = String(rawUnit || '').trim();
    const isQtyEmpty = rawQuantity === '' || rawQuantity === null || rawQuantity === undefined;
    const isRecEmpty = rawReceived === '' || rawReceived === null || rawReceived === undefined;

    // Check if entire row is empty (skip blank rows)
    if (!productStr && !unitStr && isQtyEmpty && isRecEmpty) {
      continue;
    }

    const rowNum = r + 1;
    const rowWarnings: string[] = [];
    let isRowRejected = false;
    let needsReview = false;

    // Validate Product Display Name
    if (!productStr) {
      isRowRejected = true;
      rejectedRowsCount++;
      rejectedReasons.push(`Baris #${rowNum}: Kolom Product/Display Name kosong.`);
      continue;
    }

    // Split product code and name
    const split = splitProductCodeAndName(productStr);
    if (split.confidence === 'LOW') {
      needsReview = true;
      if (split.warning) rowWarnings.push(split.warning);
    }

    // Validate Satuan
    let resolvedUnit = unitStr.toUpperCase();
    if (!resolvedUnit) {
      resolvedUnit = '-';
      needsReview = true;
      rowWarnings.push('Satuan kosong pada file sumber.');
    }

    // Validate Kebutuhan (Quantity) and Diterima (Received Qty)
    const hasValidQty = isValidNumericCell(rawQuantity);
    const hasValidRec = isValidNumericCell(rawReceived);

    if (!hasValidQty && !isQtyEmpty) {
      needsReview = true;
      rowWarnings.push(`Nilai Kebutuhan '${String(rawQuantity)}' bukan format angka valid.`);
    }
    if (!hasValidRec && !isRecEmpty) {
      needsReview = true;
      rowWarnings.push(`Nilai Diterima '${String(rawReceived)}' bukan format angka valid.`);
    }

    const quantityNum = parseNumeric(rawQuantity);
    const receivedNum = parseNumeric(rawReceived);

    // CRITICAL REQUIREMENT:
    // Rumus: Kekurangan = Diterima - Kebutuhan
    // Kesiapan: Kekurangan >= 0 => READY, Kekurangan < 0 => BELUM READY
    const kekurangan = receivedNum - quantityNum;

    let readinessStatus: ReadinessStatus = 'NOT READY';
    let statusConflictReason: string | undefined = undefined;

    if (!hasValidQty || !hasValidRec) {
      readinessStatus = 'CHECK DATA';
      statusConflictReason = 'Nilai Kebutuhan atau Diterima tidak valid';
      needsReview = true;
      rowWarnings.push('Kebutuhan atau Diterima tidak valid. Status otomatis dialihkan ke CHECK DATA.');
    } else {
      if (kekurangan >= 0) {
        readinessStatus = 'READY';
      } else {
        readinessStatus = 'NOT READY';
      }
    }

    const calculatedShortage = kekurangan < 0 ? Math.abs(kekurangan) : 0;
    const calculatedSurplus = kekurangan > 0 ? kekurangan : 0;

    const itemId = `excel-${cleanOr.replace(/\s+/g, '_')}-${r}-${split.code.replace(/[^a-zA-Z0-9]/g, '_')}`;

    const materialItem: ParsedMaterialItem = {
      id: itemId,
      rowIndex: rowNum,
      orNumber: cleanOr,
      style: '-',
      materialCode: split.code,
      materialName: split.name,
      productDisplayName: productStr,
      rawDisplayName: productStr,

      // Quantities
      quantity: quantityNum,
      receivedQty: receivedNum,
      recordedBalance: kekurangan,
      kekurangan, // Strict formula: Diterima - Kebutuhan
      calculatedShortage,
      calculatedSurplus,
      unit: resolvedUnit,
      originalUnit: unitStr,

      // Status
      sourceStatus: readinessStatus === 'READY' ? 'READY' : 'BELUM READY',
      readinessStatus,
      statusConflictReason,

      // Date
      updateDate: parsedUpdateDate,
      updateDateFormatted,
      dataAgeDays,
      isStale: dataAgeDays > 3,

      // Validation
      hasDiscrepancy: needsReview,
      validationWarnings: rowWarnings,
      needsReview,
      reviewReasons: rowWarnings,

      // Source Metadata
      source: 'EXCEL_UPLOAD',
      uploadFileName: fileName,
      dataDate: cleanDate,
      uploadedAt: new Date().toISOString(),

      // Risk scores initial placeholders
      shortageRiskScore: calculatedShortage > 0 ? Math.min(100, (calculatedShortage / (quantityNum || 1)) * 100) : 0,
      staleRiskScore: Math.min(100, dataAgeDays * 15),
      compositeRiskScore: calculatedShortage > 0 ? 80 : 20,
      riskLevel: calculatedShortage > 0 ? 'HIGH' : 'LOW',
      riskReasons: calculatedShortage > 0 ? [`Defisit ${calculatedShortage} ${resolvedUnit}`] : [],
      recommendedMitigations: calculatedShortage > 0 ? ['Follow-up pengiriman supplier'] : [],
      followUpPriority: calculatedShortage > 0 ? 'P2 - Tinggi' : 'P4 - Rutin',
    };

    parsedItems.push(materialItem);

    if (needsReview) {
      reviewRowsCount++;
    } else {
      validRowsCount++;
    }
  }

  return {
    fileName,
    sheetNames,
    selectedSheet: targetSheetName,
    totalRowsRead: parsedItems.length + rejectedRowsCount,
    validRowsCount,
    reviewRowsCount,
    rejectedRowsCount,
    rejectedReasons,
    items: parsedItems,
  };
}
