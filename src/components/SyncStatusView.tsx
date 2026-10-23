import React from 'react';
import {
  RefreshCw,
  CheckCircle2,
  AlertOctagon,
  Clock,
  Database,
  FileSpreadsheet,
  ShieldCheck,
  AlertTriangle,
  History,
  Activity,
  UserCheck,
} from 'lucide-react';
import { SyncLogEntry, ParsedMaterialItem } from '../types/ppic';
import { User } from 'firebase/auth';

interface SyncStatusViewProps {
  currentUser: User | null;
  spreadsheetId: string;
  sheetName: string;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  lastError: string | null;
  syncLogs: SyncLogEntry[];
  items: ParsedMaterialItem[];
  onManualRefresh: () => void;
  isDemoMode: boolean;
  onSignIn: () => void;
  detectedHeaders: string[];
}

export const SyncStatusView: React.FC<SyncStatusViewProps> = ({
  currentUser,
  spreadsheetId,
  sheetName,
  isSyncing,
  lastSyncTime,
  lastError,
  syncLogs,
  items,
  onManualRefresh,
  isDemoMode,
  onSignIn,
  detectedHeaders,
}) => {
  // Items with data validation issues or formula discrepancies
  const issueItems = items.filter(
    (i) => i.readinessStatus === 'CHECK DATA' || i.hasDiscrepancy || i.validationWarnings.length > 0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Data &amp; Sync Status Monitoring
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Status koneksi Google Sheets API, log sinkronisasi berkala, dan rekap validasi integritas baris data.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={onManualRefresh}
            disabled={isSyncing}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Ulang Sekarang'}</span>
          </button>
        </div>
      </div>

      {/* Connection Diagnostic Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Connection State */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Status Integrasi
            </span>
            <Database className="w-4 h-4 text-slate-400" />
          </div>
          <div className="my-3">
            {isDemoMode ? (
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-amber-500"></span>
                <span className="text-base font-bold text-amber-700">Mode Simulasi DEMO</span>
              </div>
            ) : lastError ? (
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                <span className="text-base font-bold text-red-700">Koneksi Error</span>
              </div>
            ) : currentUser ? (
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-base font-bold text-emerald-700">Terhubung ke Google Sheets</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-full bg-slate-400"></span>
                <span className="text-base font-bold text-slate-700">Perlu Sign In Google</span>
              </div>
            )}
            <div className="text-xs text-slate-500 mt-1">
              {isDemoMode
                ? 'Menggunakan dataset simulasi PPIC Garment internal'
                : spreadsheetId
                ? `Target: Sheet '${sheetName}' (ID: ${spreadsheetId.slice(0, 12)}...)`
                : 'Spreadsheet ID belum dikonfigurasi'}
            </div>
          </div>
          {!currentUser && !isDemoMode && (
            <button
              onClick={onSignIn}
              className="w-full text-xs py-1.5 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition"
            >
              Sign In Akun Google
            </button>
          )}
        </div>

        {/* Auth / Account State */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Otorisasi Pengguna
            </span>
            <UserCheck className="w-4 h-4 text-slate-400" />
          </div>
          <div className="my-3">
            <div className="text-sm font-bold text-slate-800 truncate">
              {currentUser ? currentUser.displayName || currentUser.email : 'Belum Login'}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 truncate">
              {currentUser ? currentUser.email : 'Menggunakan token client-side OAuth Bearer'}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 border-t border-slate-100 pt-2 flex items-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Scope: spreadsheets.readonly</span>
          </div>
        </div>

        {/* Sync Frequency & Cache */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Sinkronisasi Terakhir
            </span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="my-3">
            <div className="text-lg font-bold text-slate-900">
              {lastSyncTime
                ? lastSyncTime.toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : 'Belum sinkron'}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {lastSyncTime
                ? `${lastSyncTime.toLocaleDateString('id-ID', { dateStyle: 'medium' })}`
                : 'Tekan tombol Refresh untuk memulai'}
            </div>
          </div>
          <div className="text-[11px] text-slate-400 border-t border-slate-100 pt-2">
            Total {items.length} baris material tersimpan di memori
          </div>
        </div>
      </div>

      {/* Error Banner if any */}
      {lastError && (
        <div className="bg-red-50 border border-red-300 p-4 rounded-xl text-xs text-red-800 flex items-start space-x-3">
          <AlertOctagon className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-sm text-red-900">Terjadi Kendala Koneksi Google Sheets:</div>
            <div className="mt-1 font-mono text-[11px] bg-red-100/60 p-2 rounded border border-red-200">
              {lastError}
            </div>
            <div className="mt-2 text-slate-600">
              <strong>Solusi:</strong> Pastikan spreadsheet dibagikan ke email Anda, Spreadsheet ID valid, dan sheet bernama &apos;{sheetName}&apos; ada di dalam dokumen.
            </div>
          </div>
        </div>
      )}

      {/* Detected Headers */}
      {detectedHeaders.length > 0 && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
            Header Kolom Terdeteksi Otomatis dari Sheet:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {detectedHeaders.map((hdr, idx) => (
              <span
                key={idx}
                className="px-2 py-1 bg-slate-100 text-slate-700 text-xs font-mono rounded border border-slate-200"
              >
                Col {String.fromCharCode(65 + idx)}: <strong>{hdr || '(Kosong)'}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Data Integrity & Row Issues Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Rekap Validasi Data &amp; Anomali Nilai Baris
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Daftar baris data yang memiliki konflik status sumber vs kuantitas, format tanggal tidak standar, atau formula selisih berbeda
            </p>
          </div>
          <span className="text-xs bg-purple-100 text-purple-900 border border-purple-200 font-bold px-2 py-0.5 rounded">
            {issueItems.length} Anomali Terdeteksi
          </span>
        </div>

        {issueItems.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            Seluruh data bersih. Tidak ada anomali status atau ketidaksesuaian formula yang ditemukan.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <th className="py-2.5 px-3 text-center">Row</th>
                  <th className="py-2.5 px-3">OR / Style</th>
                  <th className="py-2.5 px-3">Material</th>
                  <th className="py-2.5 px-3 text-right">Kebutuhan</th>
                  <th className="py-2.5 px-3 text-right">Diterima</th>
                  <th className="py-2.5 px-3 text-center">Status Kolom J</th>
                  <th className="py-2.5 px-3">Catatan Anomali / Peringatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {issueItems.map((item) => (
                  <tr key={item.id} className="hover:bg-purple-50/40">
                    <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                      #{item.rowIndex}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {item.orNumber} <span className="text-slate-500 font-normal">({item.style})</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-800">{item.materialCode}</div>
                      <div className="text-[11px] text-slate-500">{item.materialName}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium">
                      {item.quantity.toLocaleString()} {item.unit}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium">
                      {item.receivedQty.toLocaleString()} {item.unit}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                        {item.sourceStatus || '-'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-purple-900 font-medium">
                      {item.validationWarnings.join(' • ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sync History Logs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Riwayat Aktivitas Sinkronisasi (Sync Log)
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {syncLogs.length} Event Terakhir
          </span>
        </div>

        <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
          {syncLogs.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs">Belum ada aktivitas sinkronisasi.</div>
          ) : (
            syncLogs.map((log) => (
              <div key={log.id} className="p-3 text-xs flex items-center justify-between hover:bg-slate-50">
                <div className="flex items-center space-x-3">
                  {log.status === 'SUCCESS' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  )}
                  {log.status === 'ERROR' && (
                    <AlertOctagon className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  {log.status === 'LOADING' && (
                    <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                  )}
                  <div>
                    <div className="font-medium text-slate-800">{log.message}</div>
                    <div className="text-[10px] text-slate-400">
                      Sumber: {log.source} {log.durationMs && `• Waktu: ${log.durationMs}ms`}
                    </div>
                  </div>
                </div>
                <div className="text-[11px] font-mono text-slate-400 shrink-0">
                  {log.timestamp.toLocaleTimeString('id-ID')}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
