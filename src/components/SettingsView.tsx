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
} from 'lucide-react';
import { AppSettings, ColumnMappingConfig, RiskWeightsConfig } from '../types/ppic';

interface SettingsViewProps {
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => void;
  onResetDefaults: () => void;
  availableSheets?: string[];
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSaveSettings,
  onResetDefaults,
  availableSheets = [],
}) => {
  const [formState, setFormState] = useState<AppSettings>({ ...settings });
  const [saveSuccess, setSaveSuccess] = useState(false);

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
    onSaveSettings(formState);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // Helper to convert 0-indexed column number to Excel column letters (A, B, C, ...)
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

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Pengaturan Integrasi &amp; Parameter Risiko PPIC
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Konfigurasi Spreadsheet ID, sheet target, interval sinkronisasi otomatis, ambang batas umur data, dan bobot audit risiko.
          </p>
        </div>
        {saveSuccess && (
          <div className="flex items-center space-x-1 text-emerald-700 bg-emerald-50 border border-emerald-300 px-3 py-1.5 rounded-lg text-xs font-semibold animate-fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span>Pengaturan Berhasil Disimpan</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Google Sheets Connection */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
            <FileSpreadsheet className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              1. Sumber Data Google Sheets (Single Source of Truth)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Google Spreadsheet ID atau URL Lengkap:
              </label>
              <input
                type="text"
                value={formState.spreadsheetId}
                onChange={(e) => setFormState({ ...formState, spreadsheetId: e.target.value })}
                placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit..."
                className="w-full text-xs font-mono p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Bisa memasukkan URL lengkap dari address bar browser atau hanya kode Spreadsheet ID.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Worksheet / Tab (Default: Rekap):
              </label>
              <input
                type="text"
                value={formState.sheetName}
                onChange={(e) => setFormState({ ...formState, sheetName: e.target.value })}
                placeholder="Rekap"
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
              {availableSheets.length > 0 && (
                <div className="mt-1 text-[11px] text-slate-500">
                  Sheet terdeteksi di dokumen:{' '}
                  {availableSheets.map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setFormState({ ...formState, sheetName: s })}
                      className="inline-block text-blue-600 hover:underline mr-1 font-medium"
                    >
                      [{s}]
                    </button>
                  ))}
                </div>
              )}
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
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={30}>30 Detik (Sangat Cepat)</option>
                  <option value={60}>60 Detik (Rekomendasi Default PPIC)</option>
                  <option value={120}>120 Detik (2 Menit)</option>
                  <option value={300}>300 Detik (5 Menit)</option>
                  <option value={600}>600 Detik (10 Menit)</option>
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
                  <span>Aktifkan</span>
                </label>
              </div>
            </div>
          </div>
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
            {/* Stale Threshold */}
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

            {/* Weights Overview */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-2">
                <span>Total Pembobotan Risiko:</span>
                <span className={Math.abs(totalWeights - 1.0) < 0.01 ? 'text-emerald-700' : 'text-amber-700'}>
                  {(totalWeights * 100).toFixed(0)}%
                </span>
              </div>

              {/* Slider 1: Shortage Weight */}
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

              {/* Slider 2: Stale Weight */}
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

              {/* Slider 3: Inconsistency Weight */}
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

          <p className="text-xs text-slate-500">
            Secara default aplikasi menggunakan pemetaan acuan sheet Rekap (Kolom B sampai J). Anda dapat menyesuaikan indeks kolom jika letak kolom pada file Anda bergeser:
          </p>

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

      {/* Guide Card */}
      <div className="bg-slate-900 text-slate-200 p-5 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center space-x-2">
          <HelpCircle className="w-5 h-5 text-blue-400" />
          <h3 className="text-sm font-bold tracking-tight text-white uppercase">
            Panduan Menghubungkan Google Sheets untuk Tim PPIC
          </h3>
        </div>
        <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-300 leading-relaxed">
          <li>
            Pastikan spreadsheet memiliki sheet bernama <strong>Rekap</strong> dengan baris header acuan di baris atas.
          </li>
          <li>
            Salin link Google Sheets dari browser dan tempelkan ke kolom <em>Spreadsheet ID</em> di atas.
          </li>
          <li>
            Klik tombol <strong>Sign In Google</strong> pada navbar atas agar akun Anda diberi otorisasi membaca spreadsheet tanpa perlu mempublikasikan file secara publik.
          </li>
          <li>
            Dashboard akan memproses data nyata dan melakukan sinkronisasi otomatis sesuai interval (default 60 detik) saat spreadsheet diubah oleh tim.
          </li>
        </ol>
      </div>
    </div>
  );
};
