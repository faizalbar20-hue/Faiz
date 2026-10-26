import React, { useState, useEffect } from 'react';
import { RefreshCw, Clock, FileSpreadsheet, Bell } from 'lucide-react';

interface NavbarProps {
  isSyncing: boolean;
  onManualRefresh: () => void;
  lastSyncTime: Date | null;
  syncIntervalSeconds: number;
  autoSyncEnabled: boolean;
  isDemoMode: boolean;
  onToggleDemoMode: () => void;
  spreadsheetId: string;
  sheetName: string;
  criticalCount: number;
  onOpenCriticalNotifications: () => void;
}

export const Navbar: React.FC<NavbarProps> = React.memo(({
  isSyncing,
  onManualRefresh,
  lastSyncTime,
  syncIntervalSeconds,
  autoSyncEnabled,
  isDemoMode,
  onToggleDemoMode,
  spreadsheetId,
  sheetName,
  criticalCount,
  onOpenCriticalNotifications,
}) => {
  // Localized countdown ticker so parent App component does not re-render every second
  const [countdown, setCountdown] = useState<number>(syncIntervalSeconds);

  useEffect(() => {
    setCountdown(syncIntervalSeconds);
  }, [syncIntervalSeconds, lastSyncTime]);

  useEffect(() => {
    if (!autoSyncEnabled || isDemoMode) return;

    const interval = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? syncIntervalSeconds : prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [autoSyncEnabled, isDemoMode, syncIntervalSeconds]);

  const formatTime = (d: Date | null) => {
    if (!d) return 'Belum pernah';
    return d.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-sm sm:text-base tracking-tight text-slate-100">
                  PPIC Material Readiness &amp; Risk
                </span>
                {isDemoMode ? (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono font-medium">
                    DEMO DATA
                  </span>
                ) : (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] px-1.5 py-0.5 rounded font-mono font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    LIVE SHEETS
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                {isDemoMode
                  ? 'Simulasi Garment PPIC Rekap Sheet'
                  : spreadsheetId
                  ? `Sheet: ${sheetName || 'Rekap'} • ID: ${spreadsheetId.slice(0, 10)}...`
                  : 'Google Sheets Belum Terhubung'}
              </p>
            </div>
          </div>

          {/* Controls & Sync Status */}
          <div className="flex items-center space-x-3">
            {/* Sync Timestamp & Countdown */}
            <div className="hidden md:flex flex-col text-right text-xs">
              <div className="flex items-center justify-end space-x-1.5 text-slate-300 font-medium">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Update: {formatTime(lastSyncTime)}</span>
              </div>
              {autoSyncEnabled && !isDemoMode && (
                <span className="text-[10px] text-slate-400">
                  Auto-sync: {countdown}s
                </span>
              )}
            </div>

            {/* Critical Notification Bell */}
            <button
              onClick={onOpenCriticalNotifications}
              className={`relative p-2 rounded-md border text-xs font-semibold transition flex items-center justify-center ${
                criticalCount > 0
                  ? 'bg-red-950/40 border-red-500/80 text-red-200 hover:bg-red-900/60 shadow-xs ring-1 ring-red-500/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title={
                criticalCount > 0
                  ? `${criticalCount} Kebutuhan Material Kritis - Klik untuk Melihat`
                  : 'Tidak ada material kritis saat ini'
              }
              aria-label="Notifikasi Material Kritis"
            >
              <Bell className={`w-4 h-4 ${criticalCount > 0 ? 'text-red-400' : 'text-slate-400'}`} />
              {criticalCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white font-extrabold text-[10px] min-w-4.5 h-4.5 px-1 rounded-full flex items-center justify-center border-2 border-slate-900 shadow-xs animate-pulse">
                  {criticalCount > 99 ? '99+' : criticalCount}
                </span>
              )}
            </button>

            {/* Refresh Button */}
            <button
              onClick={onManualRefresh}
              disabled={isSyncing}
              title="Refresh Data Sekarang"
              className="inline-flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-md text-xs font-medium transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Menyinkronkan...' : 'Refresh'}</span>
            </button>

            {/* Mode Switcher */}
            <button
              onClick={onToggleDemoMode}
              className={`text-xs px-2.5 py-1.5 rounded-md border font-medium transition ${
                isDemoMode
                  ? 'bg-amber-950/40 border-amber-600 text-amber-200 hover:bg-amber-900/50'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {isDemoMode ? 'Ganti ke Data Nyata' : 'Mode Demo'}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
});

Navbar.displayName = 'Navbar';
