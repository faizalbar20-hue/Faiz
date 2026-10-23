import React from 'react';
import {
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  LogOut,
  UserCheck,
} from 'lucide-react';
import { User } from 'firebase/auth';

interface NavbarProps {
  currentUser: User | null;
  onSignIn: () => void;
  onSignOut: () => void;
  isAuthenticating: boolean;
  isSyncing: boolean;
  onManualRefresh: () => void;
  lastSyncTime: Date | null;
  nextSyncSeconds: number;
  autoSyncEnabled: boolean;
  isDemoMode: boolean;
  onToggleDemoMode: () => void;
  spreadsheetId: string;
  sheetName: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onSignIn,
  onSignOut,
  isAuthenticating,
  isSyncing,
  onManualRefresh,
  lastSyncTime,
  nextSyncSeconds,
  autoSyncEnabled,
  isDemoMode,
  onToggleDemoMode,
  spreadsheetId,
  sheetName,
}) => {
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
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-base sm:text-lg tracking-tight text-slate-100">
                  PPIC Material Readiness & Risk
                </span>
                {isDemoMode ? (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs px-2 py-0.5 rounded font-mono font-medium">
                    DEMO DATA
                  </span>
                ) : (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs px-2 py-0.5 rounded font-mono font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    LIVE SHEETS
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
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
              {autoSyncEnabled && (
                <span className="text-[11px] text-slate-400">
                  Auto-sync: {nextSyncSeconds}s
                </span>
              )}
            </div>

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

            {/* Google Account */}
            {currentUser ? (
              <div className="flex items-center space-x-2 pl-2 border-l border-slate-800">
                <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-xs font-bold text-white overflow-hidden">
                  {currentUser.photoURL ? (
                    <img src={currentUser.photoURL} alt="User" className="w-full h-full object-cover" />
                  ) : (
                    (currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()
                  )}
                </div>
                <div className="hidden lg:block text-left text-xs">
                  <div className="font-medium text-slate-200 truncate max-w-[120px]">
                    {currentUser.displayName || 'PPIC User'}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[120px]">
                    {currentUser.email}
                  </div>
                </div>
                <button
                  onClick={onSignOut}
                  title="Sign out dari Google"
                  className="text-slate-400 hover:text-red-400 p-1 rounded transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={onSignIn}
                disabled={isAuthenticating}
                className="inline-flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-1.5 rounded-md transition shadow-sm disabled:opacity-50"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>{isAuthenticating ? 'Menghubungkan...' : 'Sign In Google'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
