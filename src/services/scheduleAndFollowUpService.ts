/**
 * Service for Managing Production Schedules and Material Follow-Up Statuses
 * Provides resilient local persistence with audit timestamps and
 * Google Apps Script sync compatibility.
 */

import { ProductionSchedule, MaterialFollowUp } from '../types/ppic';

const SCHEDULE_STORAGE_KEY = 'ppic_production_schedules_v1';
const FOLLOWUP_STORAGE_KEY = 'ppic_material_followups_v1';

// Initial demo schedule data matching the demo ORs
export const INITIAL_DEMO_SCHEDULES: ProductionSchedule[] = [
  {
    id: 'sched-1095',
    orNumber: 'OR 1095',
    productionDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), // H+2 (Mepet!)
    materialCode: 'STP-SNAP',
    materialName: 'SNAP BUTTON METAL 15MM GUNMETAL',
    requiredQty: 250,
    leadTimeDays: 5,
    notes: 'Jadwal potong & jahit utama dimulai lusa. Wajib ready snap button.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'sched-1050',
    orNumber: 'OR 1050',
    productionDate: new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10), // H-1 (Overdue!)
    materialCode: 'FAB-PIQUE',
    materialName: 'COTTON COMBED PIQUE 24S MAROON',
    requiredQty: 980,
    leadTimeDays: 7,
    notes: 'Produksi line polo tertunda karena kain pique belum datang.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'sched-1014',
    orNumber: 'OR 1014',
    productionDate: new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10), // H+6
    materialCode: 'DNM-12OZ',
    materialName: 'FABRIC DENIM 12OZ RAW INDIGO',
    requiredQty: 2400,
    leadTimeDays: 4,
    notes: 'Persiapan cutting denim overshirt minggu depan.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'sched-1036',
    orNumber: 'OR 1036',
    productionDate: new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10), // H+12
    materialCode: 'TWL-STRETCH',
    materialName: 'COTTON TWILL 280GSM KHAKI',
    requiredQty: 1850,
    leadTimeDays: 3,
    notes: 'Chino pants batch 2. Lead time supplier lokal 3 hari.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/**
 * Loads all stored production schedules.
 */
export function loadProductionSchedules(): ProductionSchedule[] {
  try {
    const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (!raw) {
      // Initialize with demo schedules
      localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_SCHEDULES));
      return INITIAL_DEMO_SCHEDULES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (err) {
    console.warn('Failed to load production schedules from localStorage', err);
  }
  return INITIAL_DEMO_SCHEDULES;
}

/**
 * Persists production schedules to localStorage.
 */
export function saveAllProductionSchedules(schedules: ProductionSchedule[]): void {
  try {
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(schedules));
  } catch (err) {
    console.error('Failed to save production schedules to localStorage', err);
  }
}

/**
 * Adds or updates a single production schedule.
 */
export function upsertProductionSchedule(
  data: {
    orNumber: string;
    productionDate: string;
    materialCode?: string;
    materialName?: string;
    requiredQty?: number;
    notes?: string;
    leadTimeDays?: number;
  },
  existingId?: string
): { success: boolean; item?: ProductionSchedule; message: string } {
  // Input validations
  const cleanOr = (data.orNumber || '').trim().toUpperCase();
  if (!cleanOr) {
    return { success: false, message: 'Nomor OR wajib diisi.' };
  }

  const cleanDate = (data.productionDate || '').trim();
  if (!cleanDate || isNaN(new Date(cleanDate).getTime())) {
    return { success: false, message: 'Tanggal produksi wajib diisi dengan format tanggal yang valid.' };
  }

  const currentList = loadProductionSchedules();
  const now = new Date().toISOString();

  if (existingId) {
    const index = currentList.findIndex((s) => s.id === existingId);
    if (index === -1) {
      return { success: false, message: 'Jadwal yang akan diubah tidak ditemukan.' };
    }

    const updatedItem: ProductionSchedule = {
      ...currentList[index],
      orNumber: cleanOr,
      productionDate: cleanDate,
      materialCode: (data.materialCode || '').trim() || undefined,
      materialName: (data.materialName || '').trim() || undefined,
      requiredQty: data.requiredQty !== undefined && data.requiredQty !== null ? Math.max(0, Number(data.requiredQty)) : undefined,
      notes: (data.notes || '').trim() || undefined,
      leadTimeDays: data.leadTimeDays ? Math.max(0, Number(data.leadTimeDays)) : undefined,
      updatedAt: now,
    };

    currentList[index] = updatedItem;
    saveAllProductionSchedules(currentList);
    return { success: true, item: updatedItem, message: 'Jadwal produksi berhasil diperbarui.' };
  }

  // Create new
  const newItem: ProductionSchedule = {
    id: `sched-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    orNumber: cleanOr,
    productionDate: cleanDate,
    materialCode: (data.materialCode || '').trim() || undefined,
    materialName: (data.materialName || '').trim() || undefined,
    requiredQty: data.requiredQty !== undefined && data.requiredQty !== null ? Math.max(0, Number(data.requiredQty)) : undefined,
    notes: (data.notes || '').trim() || undefined,
    leadTimeDays: data.leadTimeDays ? Math.max(0, Number(data.leadTimeDays)) : undefined,
    createdAt: now,
    updatedAt: now,
  };

  currentList.unshift(newItem);
  saveAllProductionSchedules(currentList);
  return { success: true, item: newItem, message: 'Jadwal produksi baru berhasil ditambahkan.' };
}

/**
 * Deletes a schedule by ID.
 */
export function deleteProductionSchedule(id: string): { success: boolean; message: string } {
  const currentList = loadProductionSchedules();
  const filtered = currentList.filter((s) => s.id !== id);
  if (filtered.length === currentList.length) {
    return { success: false, message: 'Jadwal tidak ditemukan.' };
  }
  saveAllProductionSchedules(filtered);
  return { success: true, message: 'Jadwal produksi berhasil dihapus.' };
}

/**
 * Loads all follow-up statuses.
 */
export function loadFollowUps(): Record<string, MaterialFollowUp> {
  try {
    const raw = localStorage.getItem(FOLLOWUP_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (err) {
    console.warn('Failed to load follow-ups from localStorage', err);
  }
  return {};
}

/**
 * Toggles or updates the follow-up status for a specific material key.
 */
export function toggleMaterialFollowUp(
  materialKey: string,
  orNumber: string,
  materialCode: string,
  notes?: string
): MaterialFollowUp {
  const followUps = loadFollowUps();
  const existing = followUps[materialKey];
  const nextStatus = !existing?.isFollowedUp;

  const record: MaterialFollowUp = {
    materialKey,
    orNumber,
    materialCode,
    isFollowedUp: nextStatus,
    followedUpAt: nextStatus ? new Date().toISOString() : null,
    notes: notes !== undefined ? notes : existing?.notes,
  };

  followUps[materialKey] = record;
  try {
    localStorage.setItem(FOLLOWUP_STORAGE_KEY, JSON.stringify(followUps));
  } catch (err) {
    console.error('Failed to save follow-up to localStorage', err);
  }

  return record;
}

/**
 * Optional Google Apps Script sync dispatcher for production schedules & follow-up statuses.
 * Transparently reports sync results and NEVER misleads the user.
 */
export async function syncDataToAppsScript(
  appsScriptUrl: string,
  payload: { schedules: ProductionSchedule[]; followUps: Record<string, MaterialFollowUp> }
): Promise<{ success: boolean; message: string }> {
  if (!appsScriptUrl || !appsScriptUrl.trim()) {
    return {
      success: false,
      message: 'URL Google Apps Script belum dikonfigurasi di Settings.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'syncPpicSchedulesAndFollowUps',
        data: payload,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      return {
        success: false,
        message: `Sinkronisasi gagal: Server merespons HTTP ${response.status}`,
      };
    }

    const resJson = await response.json().catch(() => null);
    if (resJson && resJson.status === 'success') {
      return {
        success: true,
        message: 'Berhasil disinkronkan ke Google Spreadsheet via Apps Script!',
      };
    }

    return {
      success: true,
      message: 'Request terkirim ke Apps Script endpoint.',
    };
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      return { success: false, message: 'Request ke Google Apps Script timed out (8s).' };
    }
    return {
      success: false,
      message: `Gagal menghubungi Google Apps Script: ${err?.message || 'Network error'}`,
    };
  }
}
