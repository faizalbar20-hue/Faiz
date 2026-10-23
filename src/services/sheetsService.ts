/**
 * Google Sheets API Service
 * Interacts directly with Google Sheets v4 REST API using client-side OAuth Bearer token
 * Also provides sheet metadata and column mapping detection.
 */

import { RawSheetRow, ParsedMaterialItem, ColumnMappingConfig, RiskWeightsConfig } from '../types/ppic';
import { detectHeaderAndMapping, parseRawRow } from '../utils/ppicCalculations';

export interface SheetFetchResult {
  items: ParsedMaterialItem[];
  availableSheets: string[];
  activeSheetName: string;
  detectedHeaders: string[];
  mapping: ColumnMappingConfig;
  rawRowCount: number;
}

export class SheetsApiError extends Error {
  code: string;
  status?: number;

  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = 'SheetsApiError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Extracts spreadsheet ID from full URL or returns trimmed ID.
 * Supports: https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0
 */
export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) {
    return match[1];
  }
  return trimmed;
}

/**
 * Fetch list of worksheet titles in the spreadsheet.
 */
export async function getSpreadsheetSheets(
  spreadsheetId: string,
  accessToken: string
): Promise<string[]> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}?fields=sheets.properties.title`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new SheetsApiError('Sesi login Google telah berakhir. Silakan sign in kembali.', 'UNAUTHORIZED', 401);
    }
    if (response.status === 403) {
      throw new SheetsApiError(
        'Akses ditolak (403). Akun Google Anda tidak memiliki izin akses ke spreadsheet ini. Minta izin akses (Viewer) kepada pemilik sheet.',
        'FORBIDDEN',
        403
      );
    }
    if (response.status === 404) {
      throw new SheetsApiError(
        `Spreadsheet ID '${cleanId}' tidak ditemukan (404). Pastikan URL atau ID Google Sheets benar.`,
        'NOT_FOUND',
        404
      );
    }
    const errBody = await response.text();
    throw new SheetsApiError(`Gagal membaca metadata spreadsheet: ${errBody}`, 'FETCH_FAILED', response.status);
  }

  const data = await response.json();
  const sheets: string[] = [];
  if (data.sheets && Array.isArray(data.sheets)) {
    for (const s of data.sheets) {
      if (s.properties?.title) {
        sheets.push(s.properties.title);
      }
    }
  }

  return sheets;
}

/**
 * Fetch data values from the specified worksheet range.
 */
export async function fetchSheetValues(
  spreadsheetId: string,
  sheetName: string,
  accessToken: string,
  weights: RiskWeightsConfig,
  customMapping?: ColumnMappingConfig
): Promise<SheetFetchResult> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  if (!cleanId) {
    throw new SheetsApiError('Spreadsheet ID belum diisi.', 'MISSING_ID');
  }

  // 1. Get available sheets
  let availableSheets: string[] = [];
  try {
    availableSheets = await getSpreadsheetSheets(cleanId, accessToken);
  } catch (err: unknown) {
    if (err instanceof SheetsApiError) throw err;
    console.warn('Could not fetch sheet list, proceeding with requested sheet name', err);
  }

  // Verify sheetName exists if list was retrieved
  let targetSheet = sheetName.trim();
  if (availableSheets.length > 0) {
    const found = availableSheets.find(s => s.toLowerCase() === targetSheet.toLowerCase());
    if (found) {
      targetSheet = found;
    } else {
      // Check if 'Rekap' or first sheet exists
      const rekapSheet = availableSheets.find(s => s.toLowerCase().includes('rekap'));
      if (rekapSheet) {
        targetSheet = rekapSheet;
      } else {
        throw new SheetsApiError(
          `Sheet '${sheetName}' tidak ditemukan di spreadsheet ini. Sheet yang tersedia: ${availableSheets.join(', ')}`,
          'SHEET_NOT_FOUND',
          404
        );
      }
    }
  }

  // 2. Fetch cell values range A1:Z1000
  const range = `'${targetSheet}'!A1:Z1000`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new SheetsApiError('Sesi Google Auth kedaluwarsa. Silakan login kembali.', 'UNAUTHORIZED', 401);
    }
    if (response.status === 403) {
      throw new SheetsApiError(
        'Akses ditolak (403). Pastikan spreadsheet dibagikan ke akun Google Anda.',
        'FORBIDDEN',
        403
      );
    }
    const errText = await response.text();
    throw new SheetsApiError(`Gagal mengambil data sheet: ${errText}`, 'FETCH_FAILED', response.status);
  }

  const json = await response.json();
  const rawRows: unknown[][] = json.values || [];

  if (rawRows.length === 0) {
    throw new SheetsApiError(`Worksheet '${targetSheet}' kosong (tidak ada baris data).`, 'EMPTY_SHEET');
  }

  // 3. Detect Header and Mapping
  const { headerRowIndex, mapping: detectedMapping, detectedHeaders } = detectHeaderAndMapping(rawRows);
  const activeMapping = customMapping || detectedMapping;

  // 4. Parse rows starting after the header
  const items: ParsedMaterialItem[] = [];
  const referenceDate = new Date();

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    // Skip empty filler rows
    const isRowAllEmpty = row.every(c => c === null || c === undefined || String(c).trim() === '');
    if (isRowAllEmpty) continue;

    const orNumber = String(row[activeMapping.colOr] || '').trim();
    const style = String(row[activeMapping.colStyle] || '').trim();
    const product = String(row[activeMapping.colProduct] || '').trim();

    // Must have at least product or OR to be considered a material row
    if (!product && !orNumber) continue;

    const rawItem: RawSheetRow = {
      rowIndex: r + 1,
      orNumber,
      style,
      updateDateRaw: String(row[activeMapping.colDate] || '').trim(),
      productDisplayName: product,
      quantityRaw: (row[activeMapping.colQuantity] as string | number | undefined) ?? 0,
      receivedQtyRaw: (row[activeMapping.colReceived] as string | number | undefined) ?? 0,
      balanceRaw: (row[activeMapping.colBalance] as string | number | undefined) ?? 0,
      unit: String(row[activeMapping.colUnit] || '').trim(),
      ketRaw: String(row[activeMapping.colKet] || '').trim(),
    };

    const parsed = parseRawRow(rawItem, weights, referenceDate);
    items.push(parsed);
  }

  if (items.length === 0) {
    throw new SheetsApiError(
      `Tidak ditemukan baris data material valid pada sheet '${targetSheet}' setelah baris header #${headerRowIndex + 1}.`,
      'NO_VALID_DATA'
    );
  }

  return {
    items,
    availableSheets,
    activeSheetName: targetSheet,
    detectedHeaders,
    mapping: activeMapping,
    rawRowCount: rawRows.length,
  };
}
