/**
 * Service for Persistent Storage of Excel Upload Batches.
 * Completely decoupled from Google Sheets storage to guarantee safety.
 * Persists data to localStorage with atomic updates and duplicate detection.
 */

import { ExcelUploadBatch, ParsedMaterialItem } from '../types/ppic';

const EXCEL_BATCHES_STORAGE_KEY = 'ppic_excel_upload_batches_v1';

/**
 * Normalizes OR string for consistent comparison (e.g. "or 1096" -> "OR 1096", "1096" -> "OR 1096").
 */
export function normalizeOrKey(or: string): string {
  const clean = String(or || '').trim().toUpperCase();
  if (clean.startsWith('OR')) {
    return `OR ${clean.replace(/^OR\s*/, '').trim()}`;
  }
  return `OR ${clean}`;
}

/**
 * Normalizes date string for consistent comparison (e.g. YYYY-MM-DD).
 */
export function normalizeDateKey(dateStr: string): string {
  const str = String(dateStr || '').trim();
  if (!str) return '';
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return str;
}

/**
 * Loads all stored Excel upload batches from persistent storage.
 */
export function loadAllExcelBatches(): ExcelUploadBatch[] {
  try {
    const raw = localStorage.getItem(EXCEL_BATCHES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Re-hydrate Date objects inside items
      return parsed.map((batch) => ({
        ...batch,
        items: (batch.items || []).map((item: ParsedMaterialItem) => ({
          ...item,
          updateDate: item.updateDate ? new Date(item.updateDate) : null,
        })),
      }));
    }
  } catch (err) {
    console.warn('Gagal membaca data upload Excel dari localStorage', err);
  }
  return [];
}

/**
 * Finds an existing batch matching the exact combination of (orNumber, dataDate).
 */
export function findExcelBatch(orNumber: string, dataDate: string): ExcelUploadBatch | undefined {
  const batches = loadAllExcelBatches();
  const targetOr = normalizeOrKey(orNumber);
  const targetDate = normalizeDateKey(dataDate);

  return batches.find(
    (b) => normalizeOrKey(b.orNumber) === targetOr && normalizeDateKey(b.dataDate) === targetDate
  );
}

export interface SaveBatchResult {
  success: boolean;
  message: string;
  isDuplicate?: boolean;
  existingBatch?: ExcelUploadBatch;
  savedBatch?: ExcelUploadBatch;
}

/**
 * Saves an Excel upload batch.
 * If a batch with the same OR and Tanggal Data already exists:
 * - If overwriteExisting is false: returns isDuplicate: true and existingBatch without modifying storage.
 * - If overwriteExisting is true: atomically replaces ONLY that specific batch.
 */
export function saveExcelBatch(batch: ExcelUploadBatch, overwriteExisting = false): SaveBatchResult {
  try {
    const currentBatches = loadAllExcelBatches();
    const targetOr = normalizeOrKey(batch.orNumber);
    const targetDate = normalizeDateKey(batch.dataDate);

    const existingIndex = currentBatches.findIndex(
      (b) => normalizeOrKey(b.orNumber) === targetOr && normalizeDateKey(b.dataDate) === targetDate
    );

    if (existingIndex !== -1 && !overwriteExisting) {
      return {
        success: false,
        isDuplicate: true,
        existingBatch: currentBatches[existingIndex],
        message: `Kelompok data Excel untuk ${targetOr} pada tanggal ${targetDate} sudah tersimpan.`,
      };
    }

    // Attach batchId to each item
    const hydratedBatch: ExcelUploadBatch = {
      ...batch,
      orNumber: targetOr,
      dataDate: targetDate,
      items: batch.items.map((item) => ({
        ...item,
        orNumber: targetOr,
        dataDate: targetDate,
        batchId: batch.id,
        source: 'EXCEL_UPLOAD',
        uploadFileName: batch.fileName,
      })),
    };

    let updatedBatches: ExcelUploadBatch[];
    if (existingIndex !== -1) {
      // Replace only the existing batch
      updatedBatches = [...currentBatches];
      updatedBatches[existingIndex] = hydratedBatch;
    } else {
      // Append new batch at the beginning
      updatedBatches = [hydratedBatch, ...currentBatches];
    }

    localStorage.setItem(EXCEL_BATCHES_STORAGE_KEY, JSON.stringify(updatedBatches));

    return {
      success: true,
      savedBatch: hydratedBatch,
      message: `Data Excel untuk ${targetOr} (${targetDate}) berhasil disimpan secara permanen.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal menyimpan ke penyimpanan lokal.';
    return {
      success: false,
      message: `Gagal menyimpan data Excel: ${msg}`,
    };
  }
}

/**
 * Deletes a single batch by ID. Leaves all other batches and Google Sheets data intact.
 */
export function deleteExcelBatch(batchId: string): { success: boolean; message: string } {
  try {
    const currentBatches = loadAllExcelBatches();
    const filtered = currentBatches.filter((b) => b.id !== batchId);
    localStorage.setItem(EXCEL_BATCHES_STORAGE_KEY, JSON.stringify(filtered));
    return {
      success: true,
      message: 'Kelompok data Excel berhasil dihapus.',
    };
  } catch (err) {
    return {
      success: false,
      message: 'Gagal menghapus kelompok data Excel.',
    };
  }
}

/**
 * Clears all Excel upload batches.
 */
export function clearAllExcelBatches(): void {
  try {
    localStorage.removeItem(EXCEL_BATCHES_STORAGE_KEY);
  } catch (err) {
    console.warn('Gagal menghapus batches', err);
  }
}

/**
 * Extracts and returns all material items across all stored Excel batches.
 */
export function getAllExcelItems(): ParsedMaterialItem[] {
  const batches = loadAllExcelBatches();
  return batches.flatMap((b) => b.items || []);
}
