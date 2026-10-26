/**
 * Material Readiness & Risk Monitoring Dashboard (PPIC)
 * Single Source of Truth: Google Sheets (Sheet "Rekap")
 * Performance Optimized: Fingerprint-based auto-sync, memory leak guards,
 * Production Schedule integration, and Critical Bell Notifications.
 * @license Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { fetchLiveSheetData, SheetsApiError, extractSpreadsheetId } from './services/sheetsService';
import { getDemoMaterialItems } from './data/demoPpicData';
import {
  AppSettings,
  ParsedMaterialItem,
  PpicDashboardKpi,
  SyncLogEntry,
  ProductionSchedule,
  MaterialFollowUp,
} from './types/ppic';
import {
  calculateDashboardKpi,
  filterLatestMaterialUpdates,
  enrichItemsWithSchedulesAndFollowUps,
} from './utils/ppicCalculations';
import {
  loadProductionSchedules,
  upsertProductionSchedule,
  deleteProductionSchedule,
  loadFollowUps,
  toggleMaterialFollowUp,
  syncDataToAppsScript,
} from './services/scheduleAndFollowUpService';

import { Navbar } from './components/Navbar';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { OverviewView } from './components/OverviewView';
import { ReadinessView } from './components/ReadinessView';
import { RiskAnalysisView } from './components/RiskAnalysisView';
import { ProductionScheduleView } from './components/ProductionScheduleView';
import { SyncStatusView } from './components/SyncStatusView';
import { SettingsView } from './components/SettingsView';
import { MaterialDetailModal } from './components/MaterialDetailModal';
import { CriticalNotificationModal } from './components/CriticalNotificationModal';
import {
  AlertTriangle,
  Link2,
  FileSpreadsheet,
  CheckCircle2,
  X,
} from 'lucide-react';

import { ErrorBoundary } from './components/ErrorBoundary';

const DEFAULT_SETTINGS: AppSettings = {
  spreadsheetId: '',
  sheetName: 'Rekap',
  appsScriptUrl: '',
  syncIntervalSeconds: 60,
  autoSyncEnabled: true,
  staleThresholdDays: 3,
  riskWeights: {
    shortageWeight: 0.6,
    staleWeight: 0.25,
    inconsistencyWeight: 0.15,
    staleThresholdDays: 3,
  },
  columnMapping: {
    colOr: 1, // B
    colStyle: 2, // C
    colDate: 3, // D
    colProduct: 4, // E
    colQuantity: 5, // F
    colReceived: 6, // G
    colBalance: 7, // H
    colUnit: 8, // I
    colKet: 9, // J
  },
  useDemoData: true,
};

export default function App() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('ppic_dashboard_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            ...DEFAULT_SETTINGS,
            ...parsed,
            riskWeights: {
              ...DEFAULT_SETTINGS.riskWeights,
              ...(parsed.riskWeights || {}),
            },
            columnMapping: {
              ...DEFAULT_SETTINGS.columnMapping,
              ...(parsed.columnMapping || {}),
            },
          };
        }
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage', e);
    }
    return DEFAULT_SETTINGS;
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // Raw items from spreadsheet/demo
  const [rawItems, setRawItems] = useState<ParsedMaterialItem[]>([]);
  // Schedules & Follow-Up persisted state
  const [schedules, setSchedules] = useState<ProductionSchedule[]>(() => loadProductionSchedules());
  const [followUps, setFollowUps] = useState<Record<string, MaterialFollowUp>>(() => loadFollowUps());

  // Critical Notification Modal
  const [isCriticalModalOpen, setIsCriticalModalOpen] = useState(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);

  // Non-blocking toast notification
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Quick connect input for real mode
  const [quickSheetUrl, setQuickSheetUrl] = useState<string>('');

  // Modal inspection
  const [selectedMaterial, setSelectedMaterial] = useState<ParsedMaterialItem | null>(null);

  // Guard against concurrent fetch calls and memory leak
  const isSyncingRef = useRef(false);
  const lastFingerprintRef = useRef<string>('');

  const showToast = useCallback((text: string, type: 'success' | 'error') => {
    setToastMessage({ text, type });
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  const updateSettings = useCallback((newSettings: AppSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem('ppic_dashboard_settings', JSON.stringify(newSettings));
    } catch (e) {
      console.warn('Failed to persist settings', e);
    }
  }, []);

  // Main Data Synchronization Routine with Fingerprint Compare (Prevents GC thrashing & memory leaks)
  const syncData = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    const startTime = Date.now();
    setIsSyncing(true);
    setLastError(null);

    // Case 1: Demo mode
    if (settings.useDemoData) {
      const demoItems = getDemoMaterialItems(settings.riskWeights);
      const demoFingerprint = `DEMO:${demoItems.length}:${demoItems[0]?.id || ''}`;

      if (demoFingerprint !== lastFingerprintRef.current) {
        lastFingerprintRef.current = demoFingerprint;
        setRawItems(demoItems);
      }

      setLastSyncTime(new Date());
      setIsSyncing(false);
      isSyncingRef.current = false;

      const log: SyncLogEntry = {
        id: String(Date.now()),
        timestamp: new Date(),
        status: 'SUCCESS',
        rowCount: demoItems.length,
        message: `Simulasi DEMO dimuat (${demoItems.length} baris material).`,
        durationMs: Date.now() - startTime,
        source: 'DEMO_DATA',
      };
      setSyncLogs((prev) => [log, ...prev.slice(0, 19)]);
      return;
    }

    // Case 2: Real Google Sheets mode
    const cleanId = extractSpreadsheetId(settings.spreadsheetId);
    if (!cleanId && !settings.appsScriptUrl) {
      setIsSyncing(false);
      isSyncingRef.current = false;
      setRawItems([]);
      setLastError(
        'Spreadsheet ID belum diisi. Masukkan URL atau ID Google Sheets Anda pada form di bawah ini untuk membaca data.'
      );
      return;
    }

    try {
      const result = await fetchLiveSheetData({
        spreadsheetId: cleanId,
        sheetName: settings.sheetName || 'Rekap',
        appsScriptUrl: settings.appsScriptUrl,
        weights: settings.riskWeights,
        customMapping: settings.columnMapping,
      });

      // Compute lightweight data fingerprint to check if sheet changed
      const firstRow = result.items[0];
      const lastRow = result.items[result.items.length - 1];
      const newFingerprint = `${result.items.length}:${firstRow?.id || ''}_${firstRow?.updateDateFormatted || ''}:${lastRow?.id || ''}_${lastRow?.receivedQty || ''}`;

      if (newFingerprint !== lastFingerprintRef.current) {
        lastFingerprintRef.current = newFingerprint;
        setRawItems(result.items);
      }

      setDetectedHeaders(result.detectedHeaders);
      setAvailableSheets(result.availableSheets);
      setLastSyncTime(new Date());
      setLastError(null);

      const log: SyncLogEntry = {
        id: String(Date.now()),
        timestamp: new Date(),
        status: 'SUCCESS',
        rowCount: result.items.length,
        message: `Sinkronisasi Google Sheets '${result.activeSheetName}' sukses (${result.items.length} baris diproses).`,
        durationMs: Date.now() - startTime,
        source: 'GOOGLE_SHEETS',
      };
      setSyncLogs((prev) => [log, ...prev.slice(0, 19)]);
    } catch (err: unknown) {
      const errMsg =
        err instanceof SheetsApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : 'Gagal menyinkronkan data Google Sheets';

      setLastError(errMsg);
      setRawItems([]);

      const log: SyncLogEntry = {
        id: String(Date.now()),
        timestamp: new Date(),
        status: 'ERROR',
        message: `Gagal sinkronisasi: ${errMsg}`,
        durationMs: Date.now() - startTime,
        source: 'GOOGLE_SHEETS',
      };
      setSyncLogs((prev) => [log, ...prev.slice(0, 19)]);
    } finally {
      setIsSyncing(false);
      isSyncingRef.current = false;
    }
  }, [
    settings.useDemoData,
    settings.spreadsheetId,
    settings.sheetName,
    settings.appsScriptUrl,
    settings.riskWeights,
    settings.columnMapping,
  ]);

  // Initial load
  useEffect(() => {
    syncData();
  }, [syncData]);

  // Auto-sync interval
  useEffect(() => {
    if (!settings.autoSyncEnabled || settings.useDemoData) return;

    const intervalMs = Math.max(10, settings.syncIntervalSeconds) * 1000;
    const timer = setInterval(() => {
      syncData();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [settings.autoSyncEnabled, settings.useDemoData, settings.syncIntervalSeconds, syncData]);

  // DEDUPLICATED & ENRICHED MATERIAL ITEMS (Requirement 4 & Requirement 3)
  // Only the most recent valid update for each unique OR + material combination is used.
  const items = useMemo(() => {
    // Step 1: Filter out obsolete updates per OR + Material
    const latestItems = filterLatestMaterialUpdates(rawItems);
    // Step 2: Enrich with production schedule, remaining days, and follow-up status
    return enrichItemsWithSchedulesAndFollowUps(
      latestItems,
      schedules,
      followUps,
      settings.riskWeights
    );
  }, [rawItems, schedules, followUps, settings.riskWeights]);

  // Memoized KPI calculation: Only runs when items array actually changes!
  const kpi: PpicDashboardKpi = useMemo(() => calculateDashboardKpi(items), [items]);

  // Critical items for bell notification
  const criticalItems = useMemo(() => {
    return items.filter((i) => i.riskLevel === 'CRITICAL');
  }, [items]);

  // Production Schedule Handlers (Requirement 2)
  const handleSaveSchedule = useCallback(
    (
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
    ) => {
      const res = upsertProductionSchedule(data, existingId);
      if (res.success && res.item) {
        setSchedules(loadProductionSchedules());
        showToast(res.message, 'success');
      } else {
        showToast(res.message, 'error');
      }
      return res;
    },
    [showToast]
  );

  const handleDeleteSchedule = useCallback(
    (id: string) => {
      const res = deleteProductionSchedule(id);
      if (res.success) {
        setSchedules(loadProductionSchedules());
        showToast(res.message, 'success');
      } else {
        showToast(res.message, 'error');
      }
      return res;
    },
    [showToast]
  );

  // Follow-Up Toggle Handler (Requirement 5)
  const handleToggleFollowUp = useCallback(
    (item: ParsedMaterialItem) => {
      const matKey = `${(item.orNumber || '').trim().toUpperCase()}___${(item.materialCode || '').trim().toUpperCase()}`;
      const updated = toggleMaterialFollowUp(matKey, item.orNumber, item.materialCode);
      setFollowUps(loadFollowUps());
      showToast(
        updated.isFollowedUp
          ? `Status ${item.materialCode} (${item.orNumber}) ditandai Sudah Follow-up.`
          : `Status ${item.materialCode} (${item.orNumber}) diubah menjadi Belum Follow-up.`,
        'success'
      );
    },
    [showToast]
  );

  // Sync to Google Sheets via Apps Script
  const handleSyncSchedulesToSheets = useCallback(async () => {
    if (!settings.appsScriptUrl) {
      return { success: false, message: 'URL Google Apps Script belum diisi di Pengaturan.' };
    }
    const res = await syncDataToAppsScript(settings.appsScriptUrl, { schedules, followUps });
    return res;
  }, [settings.appsScriptUrl, schedules, followUps]);

  const handleToggleDemoMode = useCallback(() => {
    const nextVal = !settings.useDemoData;
    const newSettings = { ...settings, useDemoData: nextVal };
    updateSettings(newSettings);
    if (!nextVal && !newSettings.spreadsheetId) {
      setRawItems([]);
      setActiveTab('settings');
    }
  }, [settings, updateSettings]);

  // Quick connect handler
  const handleQuickConnect = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!quickSheetUrl.trim()) return;
      const cleanId = extractSpreadsheetId(quickSheetUrl);
      const newSettings: AppSettings = {
        ...settings,
        spreadsheetId: cleanId,
        useDemoData: false,
      };
      updateSettings(newSettings);
      showToast('Menghubungkan ke Google Sheets...', 'success');
    },
    [quickSheetUrl, settings, updateSettings, showToast]
  );

  // Test connection button in settings
  const handleTestConnection = useCallback(
    async (testId: string, testSheet: string) => {
      setIsTestingConnection(true);
      setLastError(null);
      try {
        const res = await fetchLiveSheetData({
          spreadsheetId: extractSpreadsheetId(testId),
          sheetName: testSheet || 'Rekap',
          appsScriptUrl: settings.appsScriptUrl,
          weights: settings.riskWeights,
          customMapping: settings.columnMapping,
        });
        setRawItems(res.items);
        setLastSyncTime(new Date());
        showToast(
          `Koneksi Berhasil! Terbaca ${res.items.length} baris material dari sheet '${res.activeSheetName}'.`,
          'success'
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Koneksi gagal.';
        setLastError(msg);
        showToast(`Koneksi Gagal: ${msg}`, 'error');
      } finally {
        setIsTestingConnection(false);
      }
    },
    [settings.appsScriptUrl, settings.riskWeights, settings.columnMapping, showToast]
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center space-x-2 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold animate-fade-in transition bg-white border-slate-200 text-slate-800">
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="p-1 hover:bg-slate-100 rounded text-slate-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Navbar with Critical Bell Notification */}
      <Navbar
        isSyncing={isSyncing}
        onManualRefresh={syncData}
        lastSyncTime={lastSyncTime}
        syncIntervalSeconds={settings.syncIntervalSeconds}
        autoSyncEnabled={settings.autoSyncEnabled}
        isDemoMode={settings.useDemoData}
        onToggleDemoMode={handleToggleDemoMode}
        spreadsheetId={settings.spreadsheetId}
        sheetName={settings.sheetName}
        criticalCount={criticalItems.length}
        onOpenCriticalNotifications={() => setIsCriticalModalOpen(true)}
      />

      {/* Mode Banner */}
      {settings.useDemoData ? (
        <div className="bg-amber-500/10 border-b border-amber-300/40 text-amber-900 px-4 py-2 text-xs flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-200 border border-amber-400 text-[10px] text-amber-900">
              SIMULASI DEMO AKTIF
            </span>
            <span>
              Menampilkan data simulasi pabrik garmen terintegrasi jadwal &amp; notifikasi kritis. Ingin melihat data Google Sheets sendiri?
            </span>
          </div>
          <button
            onClick={() => {
              updateSettings({ ...settings, useDemoData: false });
              setActiveTab('settings');
            }}
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 underline whitespace-nowrap"
          >
            Beralih ke Data Nyata &amp; Hubungkan Spreadsheet &rarr;
          </button>
        </div>
      ) : (
        <div className="bg-emerald-500/10 border-b border-emerald-300/40 text-emerald-950 px-4 py-2 text-xs flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-200 border border-emerald-400 text-[10px] text-emerald-900">
              MODE DATA NYATA (LIVE)
            </span>
            <span>
              {settings.spreadsheetId
                ? `Membaca Google Sheets [${settings.sheetName || 'Rekap'}]`
                : 'Menunggu input link Google Sheets nyata Anda'}
            </span>
          </div>
          <button
            onClick={() => setActiveTab('settings')}
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 underline"
          >
            Ubah Pengaturan Sheet
          </button>
        </div>
      )}

      {/* Real Data Mode Prompt when no spreadsheet configured */}
      {!settings.useDemoData && (!settings.spreadsheetId || items.length === 0) && (
        <div className="max-w-7xl w-full mx-auto p-4 sm:p-6">
          <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div className="space-y-2 flex-1">
                <h2 className="text-lg font-bold text-slate-900">
                  Hubungkan Google Sheets Nyata Anda
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Tempelkan tautan (link) Google Sheets Anda yang memiliki sheet bernama <strong>Rekap</strong>.
                  Data akan langsung disinkronkan ke dashboard secara cepat dan ringan.
                </p>

                {lastError && (
                  <div className="bg-red-50 border border-red-200 p-3 rounded-lg text-xs text-red-800 space-y-1 my-2">
                    <div className="font-bold flex items-center space-x-1">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>Kendala Koneksi:</span>
                    </div>
                    <p className="leading-snug">{lastError}</p>
                  </div>
                )}

                <form onSubmit={handleQuickConnect} className="pt-2 flex flex-col sm:flex-row gap-2 max-w-2xl">
                  <input
                    type="text"
                    value={quickSheetUrl}
                    onChange={(e) => setQuickSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5.../edit"
                    className="flex-1 text-xs font-mono p-3 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                  <button
                    type="submit"
                    disabled={isSyncing || !quickSheetUrl.trim()}
                    className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-sm transition disabled:opacity-50 shrink-0 flex items-center justify-center space-x-2"
                  >
                    <Link2 className="w-4 h-4" />
                    <span>{isSyncing ? 'Membaca...' : 'Hubungkan & Tarik Data'}</span>
                  </button>
                </form>

                <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
                  <div className="font-semibold text-slate-700">Tips Penting:</div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-600">
                    <li>
                      Pastikan pada Google Sheets, tombol <strong>Bagikan (Share)</strong> di pojok kanan atas disetel ke: <strong>&quot;Siapa saja yang memiliki link&quot; &rarr; Penglihat (Viewer)</strong>.
                    </li>
                    <li>
                      Pastikan tab lembar kerja bernama <strong>Rekap</strong> dan baris data dimulai setelah baris header.
                    </li>
                    <li>
                      Ingin kembali melihat data contoh sementara?{' '}
                      <button
                        onClick={() => updateSettings({ ...settings, useDemoData: true })}
                        className="text-blue-600 hover:underline font-semibold"
                      >
                        Klik di sini untuk Aktifkan Mode Demo
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="flex-1 flex flex-col md:flex-row max-w-7xl w-full mx-auto">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} kpi={kpi} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">
          <ErrorBoundary isTabLevel fallbackTitle="Gagal memuat Ringkasan Overview">
            {activeTab === 'overview' && (
              <OverviewView
                kpi={kpi}
                items={items}
                staleThresholdDays={settings.staleThresholdDays}
                onNavigateToTab={(tab) => setActiveTab(tab)}
                onSelectMaterial={setSelectedMaterial}
              />
            )}
          </ErrorBoundary>

          <ErrorBoundary isTabLevel fallbackTitle="Gagal memuat Tabel Material Readiness">
            {activeTab === 'readiness' && (
              <ReadinessView
                items={items}
                staleThresholdDays={settings.staleThresholdDays}
                onSelectMaterial={setSelectedMaterial}
                onToggleFollowUp={handleToggleFollowUp}
              />
            )}
          </ErrorBoundary>

          <ErrorBoundary isTabLevel fallbackTitle="Gagal memuat Risk Analysis">
            {activeTab === 'risk' && (
              <RiskAnalysisView
                items={items}
                riskWeights={settings.riskWeights}
                onSelectMaterial={setSelectedMaterial}
              />
            )}
          </ErrorBoundary>

          {/* Dedicated Production Schedule View (Requirement 2) */}
          <ErrorBoundary isTabLevel fallbackTitle="Gagal memuat Manajemen Jadwal Produksi">
            {activeTab === 'schedule' && (
              <ProductionScheduleView
                schedules={schedules}
                items={items}
                appsScriptUrl={settings.appsScriptUrl}
                onSaveSchedule={handleSaveSchedule}
                onDeleteSchedule={handleDeleteSchedule}
                onSyncToGoogleSheets={handleSyncSchedulesToSheets}
                onNavigateToTab={(tab) => setActiveTab(tab)}
              />
            )}
          </ErrorBoundary>

          <ErrorBoundary isTabLevel fallbackTitle="Gagal memuat Status Sinkronisasi">
            {activeTab === 'sync' && (
              <SyncStatusView
                spreadsheetId={settings.spreadsheetId}
                sheetName={settings.sheetName}
                isSyncing={isSyncing}
                lastSyncTime={lastSyncTime}
                lastError={lastError}
                syncLogs={syncLogs}
                items={items}
                onManualRefresh={syncData}
                isDemoMode={settings.useDemoData}
                detectedHeaders={detectedHeaders}
              />
            )}
          </ErrorBoundary>

          <ErrorBoundary isTabLevel fallbackTitle="Gagal memuat Pengaturan">
            {activeTab === 'settings' && (
              <SettingsView
                settings={settings}
                onSaveSettings={(newSettings) => {
                  updateSettings(newSettings);
                  syncData();
                }}
                onResetDefaults={() => {
                  updateSettings(DEFAULT_SETTINGS);
                  syncData();
                }}
                availableSheets={availableSheets}
                onTestConnection={handleTestConnection}
                isTestingConnection={isTestingConnection}
              />
            )}
          </ErrorBoundary>
        </main>
      </div>

      {/* Critical Notification Bell Modal (Requirement 1) */}
      <CriticalNotificationModal
        isOpen={isCriticalModalOpen}
        onClose={() => setIsCriticalModalOpen(false)}
        criticalItems={criticalItems}
        onSelectMaterial={setSelectedMaterial}
        onToggleFollowUp={handleToggleFollowUp}
        onNavigateToSchedule={() => {
          setIsCriticalModalOpen(false);
          setActiveTab('schedule');
        }}
      />

      {/* Material Detail Drawer / Modal */}
      <MaterialDetailModal
        item={selectedMaterial}
        onClose={() => setSelectedMaterial(null)}
        staleThresholdDays={settings.staleThresholdDays}
      />
    </div>
  );
}
