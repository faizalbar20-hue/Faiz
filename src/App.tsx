/**
 * Material Readiness & Risk Monitoring Dashboard (PPIC)
 * Single Source of Truth: Google Sheets (Sheet "Rekap")
 * @license Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  initAuth,
  googleSignIn,
  googleSignOut,
  getCachedAccessToken,
  setCachedAccessToken,
} from './services/googleAuth';
import { fetchSheetValues, SheetsApiError, extractSpreadsheetId } from './services/sheetsService';
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
import { AlertTriangle, Database, Info, Sparkles } from 'lucide-react';

const DEFAULT_SETTINGS: AppSettings = {
  spreadsheetId: '', // User inputs their real Google Sheet ID
  sheetName: 'Rekap',
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
  useDemoData: true, // Initially true so the dashboard is immediately functional with PPIC demo data until real sheet is linked
};

export default function App() {
  // App Settings with localStorage persistence
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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);

  // Sync and Data state
  const [items, setItems] = useState<ParsedMaterialItem[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [nextSyncSeconds, setNextSyncSeconds] = useState<number>(settings.syncIntervalSeconds);

  // Modal inspection
  const [selectedMaterial, setSelectedMaterial] = useState<ParsedMaterialItem | null>(null);

  // Save settings helper
  const updateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem('ppic_dashboard_settings', JSON.stringify(newSettings));
    } catch (e) {
      console.warn('Failed to persist settings', e);
    }
  };

  // Auth initialization
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setCurrentUser(user);
        setAccessToken(token);
        setCachedAccessToken(token);
      },
      () => {
        setCurrentUser(null);
        setAccessToken(null);
      }
    );
    return () => unsubscribe();
  }, []);

  // Main Data Synchronization Routine
  const syncData = useCallback(async () => {
    const startTime = Date.now();
    setIsSyncing(true);
    setLastError(null);

    // Case 1: Demo mode
    if (settings.useDemoData) {
      // Simulate quick processing
      const demoItems = getDemoMaterialItems(settings.riskWeights);
      setItems(demoItems);
      setLastSyncTime(new Date());
      setIsSyncing(false);
      setNextSyncSeconds(settings.syncIntervalSeconds);

      const log: SyncLogEntry = {
        id: String(Date.now()),
        timestamp: new Date(),
        status: 'SUCCESS',
        rowCount: demoItems.length,
        message: `Sinkronisasi Simulasi DEMO berhasil (${demoItems.length} baris material dimuat).`,
        durationMs: Date.now() - startTime,
        source: 'DEMO_DATA',
      };
      setSyncLogs((prev) => [log, ...prev.slice(0, 24)]);
      return;
    }

    // Case 2: Real Google Sheets mode
    const cleanId = extractSpreadsheetId(settings.spreadsheetId);
    if (!cleanId) {
      setIsSyncing(false);
      setLastError('Spreadsheet ID belum diisi. Silakan masukkan link atau ID Google Sheets pada tab Settings.');
      return;
    }

    const token = accessToken || getCachedAccessToken();
    if (!token) {
      setIsSyncing(false);
      setLastError('Diperlukan otentikasi Google. Silakan klik tombol "Sign In Google" di navbar atas untuk mengakses spreadsheet Anda.');
      return;
    }

    try {
      const result = await fetchSheetValues(
        cleanId,
        settings.sheetName || 'Rekap',
        token,
        settings.riskWeights,
        settings.columnMapping
      );

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
        message: `Sinkronisasi Google Sheets '${result.activeSheetName}' berhasil (${result.items.length} baris diproses).`,
        durationMs: Date.now() - startTime,
        source: 'GOOGLE_SHEETS',
      };
      setSyncLogs((prev) => [log, ...prev.slice(0, 24)]);
    } catch (err: unknown) {
      const errMsg =
        err instanceof SheetsApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : 'Gagal menyinkronkan data Google Sheets';

      setLastError(errMsg);

      const log: SyncLogEntry = {
        id: String(Date.now()),
        timestamp: new Date(),
        status: 'ERROR',
        message: `Gagal sinkronisasi: ${errMsg}`,
        durationMs: Date.now() - startTime,
        source: 'GOOGLE_SHEETS',
      };
      setSyncLogs((prev) => [log, ...prev.slice(0, 24)]);
    } finally {
      setIsSyncing(false);
      setNextSyncSeconds(settings.syncIntervalSeconds);
    }
  }, [
    settings.useDemoData,
    settings.spreadsheetId,
    settings.sheetName,
    settings.riskWeights,
    settings.columnMapping,
    settings.syncIntervalSeconds,
    accessToken,
  ]);

  // Initial load
  useEffect(() => {
    syncData();
  }, [syncData]);

  // Auto-sync countdown timer
  useEffect(() => {
    if (!settings.autoSyncEnabled) return;

    const interval = setInterval(() => {
      setNextSyncSeconds((prev) => {
        if (prev <= 1) {
          syncData();
          return settings.syncIntervalSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [settings.autoSyncEnabled, settings.syncIntervalSeconds, syncData]);

  // Handle Google Sign In
  const handleSignIn = async () => {
    setIsAuthenticating(true);
    setLastError(null);
    try {
      const res = await googleSignIn();
      setCurrentUser(res.user);
      setAccessToken(res.accessToken);
      // If we were in demo mode and now logged in, prompt or switch to real
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login Google dibatalkan atau gagal.';
      setLastError(msg);
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Handle Google Sign Out
  const handleSignOut = async () => {
    await googleSignOut();
    setCurrentUser(null);
    setAccessToken(null);
  };

  // Toggle Demo Mode
  const handleToggleDemoMode = () => {
    const nextVal = !settings.useDemoData;
    updateSettings({ ...settings, useDemoData: nextVal });
    if (!nextVal && !settings.spreadsheetId) {
      setActiveTab('settings');
    }
  };

  // Compute Dashboard KPI
  const kpi: PpicDashboardKpi = calculateDashboardKpi(items);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      {/* Top Navbar */}
      <Navbar
        currentUser={currentUser}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        isAuthenticating={isAuthenticating}
        isSyncing={isSyncing}
        onManualRefresh={syncData}
        lastSyncTime={lastSyncTime}
        nextSyncSeconds={nextSyncSeconds}
        autoSyncEnabled={settings.autoSyncEnabled}
        isDemoMode={settings.useDemoData}
        onToggleDemoMode={handleToggleDemoMode}
        spreadsheetId={settings.spreadsheetId}
        sheetName={settings.sheetName}
      />

      {/* Demo Notice Banner */}
      {settings.useDemoData && (
        <div className="bg-amber-500/10 border-b border-amber-300/40 text-amber-900 px-4 py-2 text-xs flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-200 border border-amber-400 text-[10px] text-amber-900">
              SIMULASI DEMO
            </span>
            <span>
              Sedang menampilkan data contoh manufaktur garment (OR 1095, OR 1014, OR 1036) sesuai struktur kolom acuan Rekap.
            </span>
          </div>
          <button
            onClick={() => {
              setActiveTab('settings');
            }}
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 underline whitespace-nowrap"
          >
            Hubungkan Google Sheets Nyata Anda di Settings &rarr;
          </button>
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
              currentUser={currentUser}
              spreadsheetId={settings.spreadsheetId}
              sheetName={settings.sheetName}
              isSyncing={isSyncing}
              lastSyncTime={lastSyncTime}
              lastError={lastError}
              syncLogs={syncLogs}
              items={items}
              onManualRefresh={syncData}
              isDemoMode={settings.useDemoData}
              onSignIn={handleSignIn}
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
