import React, { useState } from 'react';
import {
  Save,
  RotateCcw,
  Sliders,
  FileSpreadsheet,
  HelpCircle,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  TableProperties,
  Copy,
  Terminal,
  AlertTriangle,
  Play,
  RefreshCw,
} from 'lucide-react';
import { AppSettings, ColumnMappingConfig, RiskWeightsConfig } from '../types/ppic';

interface SettingsViewProps {
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
  onResetDefaults: () => void;
  availableSheets?: string[];
  onTestConnection?: (spreadsheetId: string, sheetName: string) => Promise<void>;
  isTestingConnection?: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSaveSettings,
  onResetDefaults,
  availableSheets = [],
  onTestConnection,
  isTestingConnection = false,
}) => {
  const [formState, setFormState] = useState<AppSettings>({ ...settings });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [activeIntegrationMethod, setActiveIntegrationMethod] = useState<'DIRECT' | 'APPS_SCRIPT' | 'OAUTH'>(
    formState.appsScriptUrl ? 'APPS_SCRIPT' : 'DIRECT'
  );

  const handleWeightChange = (
    field: keyof Omit<RiskWeightsConfig, 'staleThresholdDays'>,
    val: number
  ) => {
    setFormState((prev) => ({
      ...prev,
      riskWeights: {
        ...prev.riskWeights,
        [field]: val,
      },
    }));
  };

  const handleColumnChange = (field: keyof ColumnMappingConfig, colIdx: number) => {
    setFormState((prev) => ({
      ...prev,
      columnMapping: {
        ...prev.columnMapping,
        [field]: colIdx,
      },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = formState.spreadsheetId?.trim();
    const cleanScript = formState.appsScriptUrl?.trim();
    const updatedSettings = {
      ...formState,
      useDemoData: cleanId || cleanScript ? false : formState.useDemoData,
    };
    onSaveSettings(updatedSettings);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const colLetter = (idx: number) => {
    return String.fromCharCode(65 + idx);
  };

  const columnOptions = Array.from({ length: 26 }, (_, i) => ({
    index: i,
    label: `Kolom ${colLetter(i)} (Index ${i})`,
  }));

  const totalWeights =
    formState.riskWeights.shortageWeight +
    formState.riskWeights.staleWeight +
    formState.riskWeights.inconsistencyWeight;

  const sampleAppsScriptCode = `function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Rekap") || ss.getSheets()[0];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) {
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }
  // Membaca seluruh baris dinamis dari baris 1 sampai baris terbawah (mencakup baris baru)
  var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}`;

  const copyAppsScript = () => {
    navigator.clipboard.writeText(sampleAppsScriptCode);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Pengaturan Integrasi Google Sheets &amp; Parameter PPIC
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Konfigurasi koneksi spreadsheet, interval auto-sync, umur data usang, bobot risiko, dan pemetaan kolom.
          </p>
        </div>
        {saveSuccess && (
          <div className="flex items-center space-x-1.5 text-emerald-800 bg-emerald-50 border border-emerald-300 px-3.5 py-2 rounded-lg text-xs font-semibold animate-fade-in shadow-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Pengaturan Berhasil Disimpan &amp; Disinkronkan!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Google Sheets Connection */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                1. Sumber Data Google Sheets (Single Source of Truth)
              </h2>
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <button
                type="button"
                onClick={() => setActiveIntegrationMethod('DIRECT')}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  activeIntegrationMethod === 'DIRECT'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Link Langsung (Rekomendasi)
              </button>
              <button
                type="button"
                onClick={() => setActiveIntegrationMethod('APPS_SCRIPT')}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  activeIntegrationMethod === 'APPS_SCRIPT'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Google Apps Script
              </button>
            </div>
          </div>

          {activeIntegrationMethod === 'DIRECT' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Google Spreadsheet ID atau Link URL Lengkap:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formState.spreadsheetId}
                    onChange={(e) => setFormState({ ...formState, spreadsheetId: e.target.value })}
                    placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit..."
                    className="flex-1 text-xs font-mono p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                  {onTestConnection && (
                    <button
                      type="button"
                      disabled={isTestingConnection || !formState.spreadsheetId}
                      onClick={() => onTestConnection(formState.spreadsheetId, formState.sheetName)}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition disabled:opacity-50 shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTestingConnection ? 'animate-spin' : ''}`} />
                      <span>{isTestingConnection ? 'Menguji...' : 'Uji Koneksi'}</span>
                    </button>
                  )}
                </div>
                <div className="mt-2 bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs text-blue-900 space-y-1">
                  <div className="font-bold flex items-center space-x-1">
                    <span>💡 Cara Cepat Menghubungkan Google Sheets Anda:</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-0.5 text-[11px] text-blue-800">
                    <li>Buka dokumen Google Sheets Anda.</li>
                    <li>Klik tombol hijau <strong>Bagikan (Share)</strong> di pojok kanan atas.</li>
                    <li>Di bagian <em>Akses umum</em>, ubah dari &quot;Dibatasi&quot; menjadi <strong>&quot;Siapa saja yang memiliki link&quot; (Anyone with the link)</strong> dengan peran <strong>Penglihat (Viewer)</strong>.</li>
                    <li>Salin link dokumen dari address bar dan tempelkan di kotak input di atas.</li>
                  </ol>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Worksheet / Sheet (Default: Rekap):
                  </label>
                  <input
                    type="text"
                    value={formState.sheetName}
                    onChange={(e) => setFormState({ ...formState, sheetName: e.target.value })}
                    placeholder="Rekap"
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white font-medium"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Aplikasi akan membaca tab ini sebagai sumber data utama.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Interval Sinkronisasi Otomatis:
                  </label>
                  <div className="flex items-center space-x-2">
                    <select
                      value={formState.syncIntervalSeconds}
                      onChange={(e) =>
                        setFormState({ ...formState, syncIntervalSeconds: Number(e.target.value) })
                      }
                      className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    >
                      <option value={30}>30 Detik (Sangat Cepat)</option>
                      <option value={60}>60 Detik (Rekomendasi Default PPIC)</option>
                      <option value={120}>120 Detik (2 Menit)</option>
                      <option value={300}>300 Detik (5 Menit)</option>
                    </select>

                    <label className="flex items-center space-x-1.5 text-xs text-slate-700 font-medium whitespace-nowrap cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formState.autoSyncEnabled}
                        onChange={(e) =>
                          setFormState({ ...formState, autoSyncEnabled: e.target.checked })
                        }
                        className="w-4 h-4 text-blue-600 rounded border-slate-300"
                      />
                      <span>Auto-Sync</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Google Apps Script Web App URL:
                </label>
                <input
                  type="text"
                  value={formState.appsScriptUrl || ''}
                  onChange={(e) => setFormState({ ...formState, appsScriptUrl: e.target.value })}
                  placeholder="https://script.google.com/macros/s/AKfycbx.../exec"
                  className="w-full text-xs font-mono p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div className="bg-slate-900 text-slate-200 p-4 rounded-xl text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 text-blue-400 font-bold">
                    <Terminal className="w-4 h-4" />
                    <span>Kode Macro Google Apps Script (Ekstensi &gt; Apps Script):</span>
                  </div>
                  <button
                    type="button"
                    onClick={copyAppsScript}
                    className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] border border-slate-700 transition"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedScript ? 'Tersalin!' : 'Salin Kode'}</span>
                  </button>
                </div>
                <pre className="font-mono text-[11px] bg-slate-950 p-2.5 rounded overflow-x-auto text-emerald-400">
                  {sampleAppsScriptCode}
                </pre>
                <p className="text-[11px] text-slate-400">
                  Deploy sebagai Web App dengan akses &quot;Anyone&quot;.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Stale Data & Risk Weights */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
            <Sliders className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              2. Ambang Batas Umur Data &amp; Pembobotan Risiko
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Batas Umur Data Kolom D (Hari):
              </label>
              <div className="flex items-center space-x-3">
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={formState.staleThresholdDays}
                  onChange={(e) => {
                    const days = Math.max(1, Number(e.target.value));
                    setFormState({
                      ...formState,
                      staleThresholdDays: days,
                      riskWeights: {
                        ...formState.riskWeights,
                        staleThresholdDays: days,
                      },
                    });
                  }}
                  className="w-24 text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-900"
                />
                <span className="text-xs text-slate-500">
                  Data yang tidak diupdate lebih dari {formState.staleThresholdDays} hari akan ditandai <strong>Stale Data (Usang)</strong> untuk dikonfirmasi ulang.
                </span>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-2">
                <span>Total Pembobotan Risiko:</span>
                <span className={Math.abs(totalWeights - 1.0) < 0.01 ? 'text-emerald-700 font-extrabold' : 'text-amber-700 font-extrabold'}>
                  {(totalWeights * 100).toFixed(0)}%
                </span>
              </div>

              <div className="space-y-1 mb-3">
                <div className="flex justify-between text-[11px] font-medium text-slate-700">
                  <span>Bobot Shortage Defisit</span>
                  <span>{(formState.riskWeights.shortageWeight * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={formState.riskWeights.shortageWeight}
                  onChange={(e) => handleWeightChange('shortageWeight', Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg cursor-pointer accent-blue-600"
                />
              </div>

              <div className="space-y-1 mb-3">
                <div className="flex justify-between text-[11px] font-medium text-slate-700">
                  <span>Bobot Umur Data (Kolom D)</span>
                  <span>{(formState.riskWeights.staleWeight * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.5}
                  step={0.05}
                  value={formState.riskWeights.staleWeight}
                  onChange={(e) => handleWeightChange('staleWeight', Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg cursor-pointer accent-orange-600"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-medium text-slate-700">
                  <span>Bobot Anomali / Konflik Data</span>
                  <span>{(formState.riskWeights.inconsistencyWeight * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.4}
                  step={0.05}
                  value={formState.riskWeights.inconsistencyWeight}
                  onChange={(e) => handleWeightChange('inconsistencyWeight', Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg cursor-pointer accent-purple-600"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Column Mapping */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
            <TableProperties className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              3. Pemetaan Kolom Spreadsheet (Column Mapping)
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Kolom B: OR (Order Reference)
              </label>
              <select
                value={formState.columnMapping.colOr}
                onChange={(e) => handleColumnChange('colOr', Number(e.target.value))}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded"
              >
                {columnOptions.map((opt) => (
                  <option key={opt.index} value={opt.index}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Kolom C: Style (Model Produksi)
              </label>
              <select
                value={formState.columnMapping.colStyle}
                onChange={(e) => handleColumnChange('colStyle', Number(e.target.value))}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded"
              >
                {columnOptions.map((opt) => (
                  <option key={opt.index} value={opt.index}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Kolom D: Tanggal Terakhir Update
              </label>
              <select
                value={formState.columnMapping.colDate}
                onChange={(e) => handleColumnChange('colDate', Number(e.target.value))}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded"
              >
                {columnOptions.map((opt) => (
                  <option key={opt.index} value={opt.index}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Kolom E: Product / Display Name
              </label>
              <select
                value={formState.columnMapping.colProduct}
                onChange={(e) => handleColumnChange('colProduct', Number(e.target.value))}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded"
              >
                {columnOptions.map((opt) => (
                  <option key={opt.index} value={opt.index}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Kolom F: Quantity (Kebutuhan)
              </label>
              <select
                value={formState.columnMapping.colQuantity}
                onChange={(e) => handleColumnChange('colQuantity', Number(e.target.value))}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded"
              >
                {columnOptions.map((opt) => (
                  <option key={opt.index} value={opt.index}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Kolom G: Received Qty (Diterima)
              </label>
              <select
                value={formState.columnMapping.colReceived}
                onChange={(e) => handleColumnChange('colReceived', Number(e.target.value))}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded"
              >
                {columnOptions.map((opt) => (
                  <option key={opt.index} value={opt.index}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Kolom H: Kekurangan / Kelebihan
              </label>
              <select
                value={formState.columnMapping.colBalance}
                onChange={(e) => handleColumnChange('colBalance', Number(e.target.value))}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded"
              >
                {columnOptions.map((opt) => (
                  <option key={opt.index} value={opt.index}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Kolom I: Satuan (UoM)
              </label>
              <select
                value={formState.columnMapping.colUnit}
                onChange={(e) => handleColumnChange('colUnit', Number(e.target.value))}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded"
              >
                {columnOptions.map((opt) => (
                  <option key={opt.index} value={opt.index}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Kolom J: Ket (Status Sumber OKE/BELUM)
              </label>
              <select
                value={formState.columnMapping.colKet}
                onChange={(e) => handleColumnChange('colKet', Number(e.target.value))}
                className="w-full text-xs p-2 bg-slate-50 border border-slate-300 rounded"
              >
                {columnOptions.map((opt) => (
                  <option key={opt.index} value={opt.index}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={onResetDefaults}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Kembalikan ke Default Acuan</span>
          </button>

          <button
            type="submit"
            className="inline-flex items-center space-x-1.5 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition"
          >
            <Save className="w-4 h-4" />
            <span>Simpan &amp; Terapkan Konfigurasi</span>
          </button>
        </div>
      </form>
    </div>
  );
};
