/**
 * Google Sheets Data Service
 * Supports 3 production integration approaches:
 * 1. Direct GViz CSV endpoint (Zero-popup, highly reliable for link-shared sheets)
 * 2. Google Sheets API v4 (Client-side OAuth Bearer token)
 * 3. Google Apps Script Web App (JSON endpoint)
 */

import { RawSheetRow, ParsedMaterialItem, ColumnMappingConfig, RiskWeightsConfig } from '../types/ppic';
import { detectHeaderAndMapping, parseRawRow } from '../utils/ppicCalculations';
import { parseCsv } from '../utils/csvParser';

export interface SheetFetchResult {
  items: ParsedMaterialItem[];
  availableSheets: string[];
  activeSheetName: string;
  detectedHeaders: string[];
  mapping: ColumnMappingConfig;
  rawRowCount: number;
  sourceType: 'GVIZ_LIVE' | 'SHEETS_API_V4' | 'APPS_SCRIPT';
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
 * Extracts clean spreadsheet ID from full URL or returns trimmed ID.
 */
export function extractSpreadsheetId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) {
    return match[1];
  }
  return trimmed;
}

/**
 * Fetches sheet data via Google Visualization API CSV export.
 * Does not require OAuth popup; works as long as the spreadsheet has link sharing enabled.
 */
export async function fetchSheetViaGViz(
  spreadsheetId: string,
  sheetName: string,
  weights: RiskWeightsConfig,
  customMapping?: ColumnMappingConfig
): Promise<SheetFetchResult> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  if (!cleanId) {
    throw new SheetsApiError('Spreadsheet ID belum diisi.', 'MISSING_ID');
  }

  const targetSheet = sheetName.trim() || 'Rekap';
  // GViz endpoint for CSV output
  const url = `https://docs.google.com/spreadsheets/d/${cleanId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(targetSheet)}`;

  let response: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new SheetsApiError(
        'Koneksi ke Google Sheets timed out (melewati 8 detik). Periksa kembali link spreadsheet atau koneksi internet.',
        'TIMEOUT'
      );
    }
    throw new SheetsApiError(
      'Gagal menghubungi server Google Sheets. Periksa koneksi internet Anda.',
      'NETWORK_ERROR'
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new SheetsApiError(
        `Spreadsheet ID '${cleanId}' tidak ditemukan (404). Periksa kembali ID atau link spreadsheet Anda.`,
        'NOT_FOUND',
        404
      );
    }
    throw new SheetsApiError(
      `Gagal membaca Google Sheets (HTTP ${response.status}).`,
      'FETCH_FAILED',
      response.status
    );
  }

  const csvText = await response.text();

  // If Google returns HTML login redirect or error page
  if (csvText.includes('<!DOCTYPE html>') || csvText.includes('accounts.google.com/ServiceLogin')) {
    throw new SheetsApiError(
      'Spreadsheet ini berstatus Pribadi (Private) sehingga akses ditolak. ' +
        'Cara Mengatasi: Buka Google Sheets Anda -> Klik tombol Bagikan (Share) di pojok kanan atas -> ' +
        'Ubah Akses Umum (General Access) menjadi "Siapa saja yang memiliki link" (Anyone with the link) sebagai Penglihat (Viewer).',
      'AUTH_REQUIRED',
      401
    );
  }

  const rawRows = parseCsv(csvText);

  if (!rawRows || rawRows.length === 0) {
    throw new SheetsApiError(
      `Worksheet '${targetSheet}' kosong atau tidak memiliki baris data.`,
      'EMPTY_SHEET'
    );
  }

  // Detect header row and column mapping
  const { headerRowIndex, mapping: detectedMapping, detectedHeaders } = detectHeaderAndMapping(rawRows);
  const activeMapping = customMapping || detectedMapping;

  const items: ParsedMaterialItem[] = [];
  const referenceDate = new Date();

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    const isAllEmpty = row.every((c) => !c || String(c).trim() === '');
    if (isAllEmpty) continue;

    const orNumber = String(row[activeMapping.colOr] || '').trim();
    const style = String(row[activeMapping.colStyle] || '').trim();
    const product = String(row[activeMapping.colProduct] || '').trim();

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
      `Tidak ditemukan baris material valid setelah baris header #${headerRowIndex + 1} pada sheet '${targetSheet}'. Pastikan kolom produk atau OR terisi.`,
      'NO_VALID_DATA'
    );
  }

  return {
    items,
    availableSheets: [targetSheet],
    activeSheetName: targetSheet,
    detectedHeaders,
    mapping: activeMapping,
    rawRowCount: rawRows.length,
    sourceType: 'GVIZ_LIVE',
  };
}

/**
 * Fetches sheet data via Google Apps Script Web App URL.
 */
export async function fetchSheetViaAppsScript(
  webAppUrl: string,
  weights: RiskWeightsConfig,
  customMapping?: ColumnMappingConfig
): Promise<SheetFetchResult> {
  const url = webAppUrl.trim();
  if (!url) {
    throw new SheetsApiError('URL Google Apps Script belum diisi.', 'MISSING_URL');
  }

  let res: Response;
  try {
    res = await fetch(url);
  } catch (err: unknown) {
    throw new SheetsApiError('Gagal memanggil Google Apps Script URL. Pastikan deployment disetel ke "Anyone".', 'APPS_SCRIPT_ERROR');
  }

  if (!res.ok) {
    throw new SheetsApiError(`Google Apps Script merespons HTTP ${res.status}`, 'APPS_SCRIPT_FAILED', res.status);
  }

  const json = await res.json();
  const rawRows: unknown[][] = Array.isArray(json) ? json : json.data || json.values || [];

  if (rawRows.length === 0) {
    throw new SheetsApiError('Data yang dikembalikan dari Apps Script kosong.', 'EMPTY_DATA');
  }

  const { headerRowIndex, mapping: detectedMapping, detectedHeaders } = detectHeaderAndMapping(rawRows);
  const activeMapping = customMapping || detectedMapping;

  const items: ParsedMaterialItem[] = [];
  const referenceDate = new Date();

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r] as unknown[];
    if (!Array.isArray(row) || row.length === 0) continue;

    const product = String(row[activeMapping.colProduct] || '').trim();
    const orNumber = String(row[activeMapping.colOr] || '').trim();
    if (!product && !orNumber) continue;

    const rawItem: RawSheetRow = {
      rowIndex: r + 1,
      orNumber,
      style: String(row[activeMapping.colStyle] || '').trim(),
      updateDateRaw: String(row[activeMapping.colDate] || '').trim(),
      productDisplayName: product,
      quantityRaw: (row[activeMapping.colQuantity] as string | number | undefined) ?? 0,
      receivedQtyRaw: (row[activeMapping.colReceived] as string | number | undefined) ?? 0,
      balanceRaw: (row[activeMapping.colBalance] as string | number | undefined) ?? 0,
      unit: String(row[activeMapping.colUnit] || '').trim(),
      ketRaw: String(row[activeMapping.colKet] || '').trim(),
    };

    items.push(parseRawRow(rawItem, weights, referenceDate));
  }

  return {
    items,
    availableSheets: ['Rekap'],
    activeSheetName: 'Rekap',
    detectedHeaders,
    mapping: activeMapping,
    rawRowCount: rawRows.length,
    sourceType: 'APPS_SCRIPT',
  };
}

/**
 * Unified fetch dispatcher that prioritizes the best method and falls back gracefully.
 */
export async function fetchLiveSheetData(params: {
  spreadsheetId: string;
  sheetName: string;
  appsScriptUrl?: string;
  accessToken?: string | null;
  weights: RiskWeightsConfig;
  customMapping?: ColumnMappingConfig;
}): Promise<SheetFetchResult> {
  const { spreadsheetId, sheetName, appsScriptUrl, accessToken, weights, customMapping } = params;

  // 1. If Apps Script Web App URL provided, use it
  if (appsScriptUrl && appsScriptUrl.trim()) {
    return await fetchSheetViaAppsScript(appsScriptUrl, weights, customMapping);
  }

  // 2. Try Google Sheets API v4 if OAuth access token is valid
  if (accessToken) {
    try {
      const cleanId = extractSpreadsheetId(spreadsheetId);
      const targetSheet = sheetName.trim() || 'Rekap';
      const range = `'${targetSheet}'!A1:Z1000`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.ok) {
        const json = await res.json();
        const rawRows: unknown[][] = json.values || [];
        if (rawRows.length > 0) {
          const { headerRowIndex, mapping: detectedMapping, detectedHeaders } = detectHeaderAndMapping(rawRows);
          const activeMapping = customMapping || detectedMapping;
          const items: ParsedMaterialItem[] = [];
          const referenceDate = new Date();

          for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
            const row = rawRows[r];
            if (!Array.isArray(row) || row.length === 0) continue;
            const orNumber = String(row[activeMapping.colOr] || '').trim();
            const product = String(row[activeMapping.colProduct] || '').trim();
            if (!product && !orNumber) continue;

            const rawItem: RawSheetRow = {
              rowIndex: r + 1,
              orNumber,
              style: String(row[activeMapping.colStyle] || '').trim(),
              updateDateRaw: String(row[activeMapping.colDate] || '').trim(),
              productDisplayName: product,
              quantityRaw: (row[activeMapping.colQuantity] as string | number | undefined) ?? 0,
              receivedQtyRaw: (row[activeMapping.colReceived] as string | number | undefined) ?? 0,
              balanceRaw: (row[activeMapping.colBalance] as string | number | undefined) ?? 0,
              unit: String(row[activeMapping.colUnit] || '').trim(),
              ketRaw: String(row[activeMapping.colKet] || '').trim(),
            };
            items.push(parseRawRow(rawItem, weights, referenceDate));
          }

          if (items.length > 0) {
            return {
              items,
              availableSheets: [targetSheet],
              activeSheetName: targetSheet,
              detectedHeaders,
              mapping: activeMapping,
              rawRowCount: rawRows.length,
              sourceType: 'SHEETS_API_V4',
            };
          }
        }
      }
    } catch (e) {
      console.warn('OAuth API fetch failed, falling back to direct GViz endpoint', e);
    }
  }

  // 3. Primary reliable method: Google Visualization API CSV Endpoint
  return await fetchSheetViaGViz(spreadsheetId, sheetName, weights, customMapping);
}
