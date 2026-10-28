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
 * Extracts optional gid (sheet ID) from URL if present.
 */
export function extractGid(input: string): string | null {
  if (!input) return null;
  const match = input.match(/[#&?]gid=([0-9]+)/);
  return match ? match[1] : null;
}

export interface FetchSheetOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Fetches sheet data via Google Visualization API CSV export.
 * Does not require OAuth popup; works as long as the spreadsheet has link sharing enabled.
 * Uses simple CORS GET request without custom headers to avoid CORS OPTIONS preflights.
 */
export async function fetchSheetViaGViz(
  spreadsheetId: string,
  sheetName: string,
  weights: RiskWeightsConfig,
  customMapping?: ColumnMappingConfig,
  options?: FetchSheetOptions
): Promise<SheetFetchResult> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  if (!cleanId) {
    throw new SheetsApiError('Spreadsheet ID belum diisi.', 'MISSING_ID');
  }

  const targetSheet = sheetName.trim() || 'Rekap';
  const extractedGid = extractGid(spreadsheetId);
  const timeoutMs = options?.timeoutMs ?? 15000;

  // Build GViz query URL with cache-busting timestamp
  const timestamp = Date.now();
  let url = `https://docs.google.com/spreadsheets/d/${cleanId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(targetSheet)}&_t=${timestamp}`;

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => {
    controller.abort();
  };

  if (options?.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      options.signal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  let response: Response;
  try {
    // Note: Do NOT add custom non-safelisted headers like 'Cache-Control' or 'Pragma' here!
    // Adding non-safelisted headers forces browsers to send an OPTIONS preflight request.
    // Google Sheets GViz endpoints do NOT return CORS headers on OPTIONS requests, causing
    // the browser to block the connection and hang until the timeout fires.
    // Cache busting is already fully guaranteed by the '_t' timestamp query parameter.
    response = await fetch(url, {
      signal: controller.signal,
    });
  } catch (err: unknown) {
    if (timedOut) {
      throw new SheetsApiError(
        `Koneksi ke Google Sheets timed out (melewati ${Math.round(timeoutMs / 1000)} detik). ` +
          'Pastikan spreadsheet disetel ke Akses Umum: "Siapa saja yang memiliki link" sebagai "Penglihat" (Viewer) dan koneksi internet stabil.',
        'TIMEOUT'
      );
    }
    const isAbort = (err as { name?: string })?.name === 'AbortError';
    if (isAbort) {
      throw new SheetsApiError('Permintaan sinkronisasi dibatalkan.', 'ABORTED');
    }
    throw new SheetsApiError(
      'Gagal menghubungi server Google Sheets. Periksa koneksi internet Anda atau pastikan URL spreadsheet valid.',
      'NETWORK_ERROR'
    );
  } finally {
    clearTimeout(timeoutId);
    if (options?.signal) {
      options.signal.removeEventListener('abort', onExternalAbort);
    }
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

  const { items, mapping: activeMapping, detectedHeaders, headerRowIndex } = parseRowsToMaterialItems(
    rawRows,
    weights,
    customMapping
  );

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
 * Parses raw 2D sheet rows into rich ParsedMaterialItem objects.
 * Dynamically processes all rows from the header row down to the last row,
 * supporting forward-fill for merged cells and handling incomplete or draft rows gracefully.
 */
export function parseRowsToMaterialItems(
  rawRows: unknown[][],
  weights: RiskWeightsConfig,
  customMapping?: ColumnMappingConfig
): {
  items: ParsedMaterialItem[];
  headerRowIndex: number;
  mapping: ColumnMappingConfig;
  detectedHeaders: string[];
} {
  const { headerRowIndex, mapping: detectedMapping, detectedHeaders } = detectHeaderAndMapping(rawRows);
  const activeMapping = customMapping || detectedMapping;

  const items: ParsedMaterialItem[] = [];
  const referenceDate = new Date();

  // Track last seen OR and Style to properly handle vertically merged cells in Google Sheets
  let lastSeenOr = '';
  let lastSeenStyle = '';

  for (let r = headerRowIndex + 1; r < rawRows.length; r++) {
    const row = rawRows[r] as unknown[];
    if (!Array.isArray(row) || row.length === 0) continue;

    const isAllEmpty = row.every((c) => !c || String(c).trim() === '');
    if (isAllEmpty) continue;

    let orNumber = String(row[activeMapping.colOr] || '').trim();
    let style = String(row[activeMapping.colStyle] || '').trim();
    const product = String(row[activeMapping.colProduct] || '').trim();

    // Forward-fill OR number if merged vertically in spreadsheet
    if (orNumber) {
      lastSeenOr = orNumber;
    } else if (product && lastSeenOr) {
      orNumber = lastSeenOr;
    }

    // Forward-fill Style if merged vertically in spreadsheet
    if (style) {
      lastSeenStyle = style;
    } else if (product && lastSeenStyle) {
      style = lastSeenStyle;
    }

    // If both product and OR are completely absent, skip this non-data row
    if (!product && !orNumber) continue;

    const rawItem: RawSheetRow = {
      rowIndex: r + 1,
      orNumber: orNumber || '-',
      style: style || '-',
      updateDateRaw: String(row[activeMapping.colDate] || '').trim(),
      productDisplayName: product || (orNumber ? `Item ${orNumber}` : '-'),
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
    headerRowIndex,
    mapping: activeMapping,
    detectedHeaders,
  };
}

/**
 * Fetches sheet data via Google Apps Script Web App URL.
 */
export async function fetchSheetViaAppsScript(
  webAppUrl: string,
  weights: RiskWeightsConfig,
  customMapping?: ColumnMappingConfig,
  options?: FetchSheetOptions
): Promise<SheetFetchResult> {
  const url = webAppUrl.trim();
  if (!url) {
    throw new SheetsApiError('URL Google Apps Script belum diisi.', 'MISSING_URL');
  }

  const separator = url.includes('?') ? '&' : '?';
  const cacheBustedUrl = `${url}${separator}_t=${Date.now()}`;
  const timeoutMs = options?.timeoutMs ?? 15000;

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (options?.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      options.signal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  let res: Response;
  try {
    res = await fetch(cacheBustedUrl, {
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (err: unknown) {
    if (timedOut) {
      throw new SheetsApiError(
        `Koneksi ke Google Apps Script timed out (melewati ${Math.round(timeoutMs / 1000)} detik).`,
        'TIMEOUT'
      );
    }
    const isAbort = (err as { name?: string })?.name === 'AbortError';
    if (isAbort) {
      throw new SheetsApiError('Permintaan sinkronisasi dibatalkan.', 'ABORTED');
    }
    throw new SheetsApiError('Gagal memanggil Google Apps Script URL. Pastikan deployment disetel ke "Anyone".', 'APPS_SCRIPT_ERROR');
  } finally {
    clearTimeout(timeoutId);
    if (options?.signal) {
      options.signal.removeEventListener('abort', onExternalAbort);
    }
  }

  if (!res.ok) {
    throw new SheetsApiError(`Google Apps Script merespons HTTP ${res.status}`, 'APPS_SCRIPT_FAILED', res.status);
  }

  const json = await res.json();
  const rawRows: unknown[][] = Array.isArray(json) ? json : json.data || json.values || [];

  if (rawRows.length === 0) {
    throw new SheetsApiError('Data yang dikembalikan dari Apps Script kosong.', 'EMPTY_DATA');
  }

  const { items, mapping: activeMapping, detectedHeaders } = parseRowsToMaterialItems(
    rawRows,
    weights,
    customMapping
  );

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
  signal?: AbortSignal;
}): Promise<SheetFetchResult> {
  const { spreadsheetId, sheetName, appsScriptUrl, accessToken, weights, customMapping, signal } = params;

  // 1. If Apps Script Web App URL provided, use it
  if (appsScriptUrl && appsScriptUrl.trim()) {
    return await fetchSheetViaAppsScript(appsScriptUrl, weights, customMapping, { signal });
  }

  // 2. Try Google Sheets API v4 if OAuth access token is valid
  if (accessToken) {
    try {
      const cleanId = extractSpreadsheetId(spreadsheetId);
      const targetSheet = sheetName.trim() || 'Rekap';
      // Dynamic unbounded range to capture all rows added to the spreadsheet (no fixed !A:Z restriction)
      const range = encodeURIComponent(targetSheet);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/${range}?valueRenderOption=FORMATTED_VALUE&_t=${Date.now()}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
        signal,
      });

      if (res.ok) {
        const json = await res.json();
        const rawRows: unknown[][] = json.values || [];
        if (rawRows.length > 0) {
          const { items, mapping: activeMapping, detectedHeaders } = parseRowsToMaterialItems(
            rawRows,
            weights,
            customMapping
          );

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
  return await fetchSheetViaGViz(spreadsheetId, sheetName, weights, customMapping, { signal });
}
