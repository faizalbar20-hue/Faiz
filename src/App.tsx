/**
 * Material Readiness & Risk Monitoring Dashboard (PPIC)
 * Single Source of Truth: Google Sheets (Sheet "Rekap")
 * Performance Optimized: Zero-tick root renders, memoized KPIs, fast FCP.
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
} from './types/ppic';
import { calculateDashboardKpi } from './utils/ppicCalculations';

import { Navbar } from './components/Navbar';
import { Sidebar, ActiveTab } from './components/Sidebar';
import { OverviewView } from './components/OverviewView';
import { ReadinessView } from './components/ReadinessView';
import { RiskAnalysisView } from './components/RiskAnalysisView';
import { SyncStatusView } from './components/SyncStatusView';
import { SettingsView } from './components/SettingsView';
import { MaterialDetailModal } from './components/MaterialDetailModal';
import {
  AlertTriangle,
  Link2,
  FileSpreadsheet,
  CheckCircle2,
  X,
} from 'lucide-react';

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
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to load settings from localStorage', e);
    }
    return DEFAULT_SETTINGS;
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // Sync and Data state
  const [items, setItems] = useState<ParsedMaterialItem[]>([]);
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

  // Guard against concurrent fetch calls
  const isSyncingRef = useRef(false);

  const showToast = useCallback((text: string, type: 'success' | 'error') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  const updateSettings = useCallback((newSettings: AppSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem('ppic_dashboard_settings', JSON.stringify(newSettings));
    } catch (e) {
      console.warn('Failed to persist settings', e);
    }
  }, []);

  // Main Data Synchronization Routine
  const syncData = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    const startTime = Date.now();
    setIsSyncing(true);
    setLastError(null);

    // Case 1: Demo mode
    if (settings.useDemoData) {
      const demoItems = getDemoMaterialItems(settings.riskWeights);
      setItems(demoItems);
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
      setItems([]);
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

      setItems(result.items);
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
      setItems([]);

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

  // Auto-sync interval: runs quietly at specified frequency without 1-second React re-renders!
  useEffect(() => {
    if (!settings.autoSyncEnabled || settings.useDemoData) return;

    const intervalMs = Math.max(10, settings.syncIntervalSeconds) * 1000;
    const timer = setInterval(() => {
      syncData();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [settings.autoSyncEnabled, settings.useDemoData, settings.syncIntervalSeconds, syncData]);

  const handleToggleDemoMode = useCallback(() => {
    const nextVal = !settings.useDemoData;
    const newSettings = { ...settings, useDemoData: nextVal };
    updateSettings(newSettings);
    if (!nextVal && !newSettings.spreadsheetId) {
      setItems([]);
      setActiveTab('settings');
    }
  }, [settings, updateSettings]);

  // Quick connect handler
  const handleQuickConnect = useCallback((e: React.FormEvent) => {
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
  }, [quickSheetUrl, settings, updateSettings, showToast]);

  // Test connection button in settings
  const handleTestConnection = useCallback(async (testId: string, testSheet: string) => {
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
      setItems(res.items);
      setLastSyncTime(new Date());
      showToast(`Koneksi Berhasil! Terbaca ${res.items.length} baris material dari sheet '${res.activeSheetName}'.`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Koneksi gagal.';
      setLastError(msg);
      showToast(`Koneksi Gagal: ${msg}`, 'error');
    } finally {
      setIsTestingConnection(false);
    }
  }, [settings.appsScriptUrl, settings.riskWeights, settings.columnMapping, showToast]);

  // Memoized KPI calculation: Only runs when items array actually changes!
  const kpi: PpicDashboardKpi = useMemo(() => calculateDashboardKpi(items), [items]);

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

      {/* Top Navbar */}
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
      />

      {/* Mode Banner */}
      {settings.useDemoData ? (
        <div className="bg-amber-500/10 border-b border-amber-300/40 text-amber-900 px-4 py-2 text-xs flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-200 border border-amber-400 text-[10px] text-amber-900">
              SIMULASI DEMO AKTIF
            </span>
            <span>
              Menampilkan data simulasi pabrik garmen. Ingin melihat data dari Google Sheets Anda sendiri?
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
          {activeTab === 'overview' && (
            <OverviewView
              kpi={kpi}
              items={items}
              staleThresholdDays={settings.staleThresholdDays}
              onNavigateToTab={(tab) => setActiveTab(tab)}
              onSelectMaterial={setSelectedMaterial}
            />
          )}

          {activeTab === 'readiness' && (
            <ReadinessView
              items={items}
              staleThresholdDays={settings.staleThresholdDays}
              onSelectMaterial={setSelectedMaterial}
            />
          )}

          {activeTab === 'risk' && (
            <RiskAnalysisView
              items={items}
              riskWeights={settings.riskWeights}
              onSelectMaterial={setSelectedMaterial}
            />
          )}

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
        </main>
      </div>

      {/* Material Detail Drawer / Modal */}
      <MaterialDetailModal
        item={selectedMaterial}
        onClose={() => setSelectedMaterial(null)}
        staleThresholdDays={settings.staleThresholdDays}
      />
    </div>
  );
}
