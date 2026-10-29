import React, { useState, useRef, useMemo } from 'react';
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Trash2,
  Calendar,
  Layers,
  ArrowRight,
  RefreshCw,
  FileText,
  Search,
  Eye,
  Check,
  AlertOctagon,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ExcelUploadBatch, ExcelParseSummary, ParsedMaterialItem } from '../types/ppic';
import { parseExcelWorkbook } from '../services/excelService';
import {
  saveExcelBatch,
  loadAllExcelBatches,
  deleteExcelBatch,
  findExcelBatch,
  normalizeOrKey,
  normalizeDateKey,
} from '../services/excelStorageService';

interface ExcelUploadViewProps {
  onBatchSaved: () => void;
  existingOrList: string[];
}

export const ExcelUploadView: React.FC<ExcelUploadViewProps> = ({
  onBatchSaved,
  existingOrList,
}) => {
  // Form input state
  const [orInput, setOrInput] = useState<string>('');
  const [dataDateInput, setDataDateInput] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [sheetList, setSheetList] = useState<string[]>([]);

  // Processing state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseSummary, setParseSummary] = useState<ExcelParseSummary | null>(null);

  // Filter within preview
  const [previewSearch, setPreviewSearch] = useState<string>('');
  const [previewFilter, setPreviewFilter] = useState<'ALL' | 'READY' | 'NOT_READY' | 'REVIEW'>('ALL');

  // Overwrite modal state
  const [isOverwriteModalOpen, setIsOverwriteModalOpen] = useState<boolean>(false);
  const [conflictingBatch, setConflictingBatch] = useState<ExcelUploadBatch | null>(null);

  // Inspection modal for saved batch
  const [viewingBatch, setViewingBatch] = useState<ExcelUploadBatch | null>(null);

  // Stored batches in localStorage
  const [storedBatches, setStoredBatches] = useState<ExcelUploadBatch[]>(() => loadAllExcelBatches());
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (text: string, type: 'success' | 'error') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const reloadStoredBatches = () => {
    const batches = loadAllExcelBatches();
    setStoredBatches(batches);
  };

  // Handle file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setParseError(null);
    setParseSummary(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      setWorkbook(wb);
      setSheetList(wb.SheetNames || []);
      const initialSheet = wb.SheetNames[0] || '';
      setSelectedSheet(initialSheet);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal membaca format file Excel.';
      setParseError(`File tidak dapat dibaca: ${msg}`);
      setWorkbook(null);
      setSheetList([]);
    }
  };

  // Process & Preview file
  const handleProcessFile = () => {
    if (!selectedFile || !workbook) {
      setParseError('Pilih file Excel terlebih dahulu.');
      return;
    }
    if (!orInput.trim()) {
      setParseError('Nomor OR wajib diisi.');
      return;
    }
    if (!dataDateInput.trim()) {
      setParseError('Tanggal Data wajib diisi.');
      return;
    }

    setIsProcessing(true);
    setParseError(null);

    try {
      const summary = parseExcelWorkbook(
        workbook,
        selectedFile.name,
        orInput,
        dataDateInput,
        selectedSheet
      );
      setParseSummary(summary);
      if (summary.items.length === 0) {
        setParseError('Tidak ditemukan baris material valid pada lembar kerja yang dipilih.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan saat memproses Excel.';
      setParseError(msg);
      setParseSummary(null);
    } finally {
      setIsProcessing(false);
    }
  };

  // Switch sheet
  const handleSheetChange = (newSheet: string) => {
    setSelectedSheet(newSheet);
    if (workbook && selectedFile && orInput && dataDateInput) {
      try {
        const summary = parseExcelWorkbook(
          workbook,
          selectedFile.name,
          orInput,
          dataDateInput,
          newSheet
        );
        setParseSummary(summary);
      } catch (err) {
        console.warn('Sheet change parse error', err);
      }
    }
  };

  // Attempt to save batch
  const handleInitiateSave = () => {
    if (!parseSummary || parseSummary.items.length === 0) {
      showToast('Tidak ada data material yang dapat disimpan.', 'error');
      return;
    }

    const cleanOr = normalizeOrKey(orInput);
    const cleanDate = normalizeDateKey(dataDateInput);

    // Check if batch already exists
    const existing = findExcelBatch(cleanOr, cleanDate);
    if (existing) {
      setConflictingBatch(existing);
      setIsOverwriteModalOpen(true);
      return;
    }

    // Save directly if no conflict
    commitBatchSave(false);
  };

  // Commit save to localStorage
  const commitBatchSave = (overwrite: boolean) => {
    if (!parseSummary) return;

    const cleanOr = normalizeOrKey(orInput);
    const cleanDate = normalizeDateKey(dataDateInput);
    const batchId = overwrite && conflictingBatch ? conflictingBatch.id : `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const newBatch: ExcelUploadBatch = {
      id: batchId,
      orNumber: cleanOr,
      dataDate: cleanDate,
      fileName: selectedFile?.name || 'upload.xlsx',
      uploadedAt: new Date().toISOString(),
      source: 'EXCEL_UPLOAD',
      sheetName: selectedSheet,
      totalRows: parseSummary.totalRowsRead,
      validRows: parseSummary.validRowsCount,
      reviewRows: parseSummary.reviewRowsCount,
      rejectedRows: parseSummary.rejectedRowsCount,
      rejectedReasons: parseSummary.rejectedReasons,
      items: parseSummary.items.map((it) => ({
        ...it,
        batchId,
        orNumber: cleanOr,
        dataDate: cleanDate,
      })),
    };

    const res = saveExcelBatch(newBatch, overwrite);
    if (res.success) {
      showToast(res.message, 'success');
      reloadStoredBatches();
      onBatchSaved();
      // Reset upload form
      setParseSummary(null);
      setSelectedFile(null);
      setWorkbook(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setIsOverwriteModalOpen(false);
      setConflictingBatch(null);
    } else {
      showToast(res.message, 'error');
    }
  };

  // Delete batch handler
  const handleDeleteBatch = (batchId: string, orNumber: string, date: string) => {
    if (window.confirm(`Hapus seluruh data upload Excel untuk ${orNumber} (${date})? Data Google Spreadsheet tidak akan terpengaruh.`)) {
      const res = deleteExcelBatch(batchId);
      if (res.success) {
        showToast(res.message, 'success');
        reloadStoredBatches();
        onBatchSaved();
      } else {
        showToast(res.message, 'error');
      }
    }
  };

  // Reset form
  const handleResetForm = () => {
    setParseSummary(null);
    setSelectedFile(null);
    setWorkbook(null);
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Filter preview items
  const filteredPreviewItems = useMemo(() => {
    if (!parseSummary) return [];
    return parseSummary.items.filter((item) => {
      if (previewFilter === 'READY' && item.readinessStatus !== 'READY') return false;
      if (previewFilter === 'NOT_READY' && item.readinessStatus !== 'NOT READY') return false;
      if (previewFilter === 'REVIEW' && !item.needsReview) return false;

      if (previewSearch.trim()) {
        const q = previewSearch.toLowerCase().trim();
        const mCode = item.materialCode.toLowerCase().includes(q);
        const mName = item.materialName.toLowerCase().includes(q);
        const mUnit = item.unit.toLowerCase().includes(q);
        if (!mCode && !mName && !mUnit) return false;
      }
      return true;
    });
  }, [parseSummary, previewFilter, previewSearch]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-5 right-5 z-50 flex items-center space-x-2 px-4 py-3 rounded-xl shadow-xl text-xs font-semibold text-white transition-all animate-bounce ${
            toastMessage.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertOctagon className="w-4 h-4 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Upload className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                Upload &amp; Integrasi File Excel Material
              </h1>
              <p className="text-xs text-slate-500">
                Gabungkan data material terbaru dari file Excel (.xlsx / .xls) bersama data Google Spreadsheet secara terpadu.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className="px-3 py-1.5 bg-slate-100 text-slate-700 font-medium rounded-lg border border-slate-200">
            Tersimpan: <strong>{storedBatches.length} Kelompok Upload</strong>
          </span>
        </div>
      </div>

      {/* Upload Form Card */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
        <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Formulir Input Kelompok Data Excel
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">
            * Nomor OR dan Tanggal Data wajib diisi oleh pengguna
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* OR Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nomor OR <span className="text-red-500">*</span>:
            </label>
            <input
              type="text"
              value={orInput}
              onChange={(e) => setOrInput(e.target.value)}
              placeholder="Contoh: OR 1096 atau 1096"
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
            {existingOrList.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                <span className="text-[10px] text-slate-400">Pilih cepat:</span>
                {existingOrList.slice(0, 5).map((or) => (
                  <button
                    key={or}
                    type="button"
                    onClick={() => setOrInput(or)}
                    className="text-[10px] bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 px-1.5 py-0.5 rounded transition"
                  >
                    {or}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tanggal Data Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Tanggal Data <span className="text-red-500">*</span>:
            </label>
            <div className="relative">
              <input
                type="date"
                value={dataDateInput}
                onChange={(e) => setDataDateInput(e.target.value)}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Tanggal pembaruan data yang menjadi identitas kelompok material.
            </p>
          </div>

          {/* Worksheet Selector (if workbook loaded) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Lembar Kerja (Worksheet):
            </label>
            <select
              disabled={sheetList.length <= 1}
              value={selectedSheet}
              onChange={(e) => handleSheetChange(e.target.value)}
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 font-medium"
            >
              {sheetList.length === 0 ? (
                <option value="">(Pilih file Excel terlebih dahulu)</option>
              ) : (
                sheetList.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))
              )}
            </select>
            <p className="text-[10px] text-slate-400 mt-1">
              {sheetList.length > 1
                ? `${sheetList.length} lembar kerja ditemukan dalam file.`
                : 'Membaca lembar kerja aktif otomatis.'}
            </p>
          </div>
        </div>

        {/* File Dropzone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
            selectedFile
              ? 'border-blue-400 bg-blue-50/40'
              : 'border-slate-300 hover:border-blue-400 bg-slate-50/50 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
              <Upload className="w-6 h-6" />
            </div>

            {selectedFile ? (
              <div>
                <p className="text-xs font-bold text-slate-800">{selectedFile.name}</p>
                <p className="text-[11px] text-slate-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB • Klik untuk mengganti file
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs font-bold text-slate-700">
                  Klik di sini untuk memilih file Excel (.xlsx / .xls)
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Mendukung format Order Lines Odoo, Rekapitulasi Material, dan PPIC Export
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Error Notice */}
        {parseError && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl text-xs flex items-start space-x-2.5">
            <AlertOctagon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold">Gagal Memproses File: </span>
              <span>{parseError}</span>
            </div>
          </div>
        )}

        {/* Process Button */}
        <div className="flex items-center justify-end space-x-3 pt-2">
          {selectedFile && (
            <button
              type="button"
              onClick={handleResetForm}
              className="px-4 py-2 border border-slate-300 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-semibold transition"
            >
              Reset
            </button>
          )}

          <button
            type="button"
            disabled={!selectedFile || !orInput.trim() || !dataDateInput.trim() || isProcessing}
            onClick={handleProcessFile}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center space-x-2"
          >
            {isProcessing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Layers className="w-3.5 h-3.5" />
            )}
            <span>{isProcessing ? 'Memproses Baris...' : 'Proses & Pratinjau File'}</span>
          </button>
        </div>
      </div>

      {/* Validation Summary & Preview Section */}
      {parseSummary && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6 animate-fade-in">
          <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <h2 className="text-sm font-bold text-slate-900">
                  Pratinjau Hasil Pembacaan &amp; Validasi Excel
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Kelompok: <strong>{orInput}</strong> • Tanggal: <strong>{dataDateInput}</strong> • File: {parseSummary.fileName}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleInitiateSave}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition flex items-center space-x-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Konfirmasi &amp; Simpan ke Dashboard</span>
              </button>
            </div>
          </div>

          {/* Validation Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500 block">Total Baris Terbaca</span>
              <span className="text-xl font-extrabold text-slate-900 mt-1 block">
                {parseSummary.totalRowsRead}
              </span>
              <span className="text-[10px] text-slate-400">Sheet: {parseSummary.selectedSheet}</span>
            </div>

            <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200">
              <span className="text-[11px] font-semibold text-emerald-800 block">Baris Valid</span>
              <span className="text-xl font-extrabold text-emerald-700 mt-1 block">
                {parseSummary.validRowsCount}
              </span>
              <span className="text-[10px] text-emerald-600">Lolos verifikasi rumus</span>
            </div>

            <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200">
              <span className="text-[11px] font-semibold text-amber-800 block">Perlu Pemeriksaan</span>
              <span className="text-xl font-extrabold text-amber-700 mt-1 block">
                {parseSummary.reviewRowsCount}
              </span>
              <span className="text-[10px] text-amber-600">Pola kode/satuan kosong</span>
            </div>

            <div className="bg-red-50 p-3.5 rounded-xl border border-red-200">
              <span className="text-[11px] font-semibold text-red-800 block">Baris Ditolak</span>
              <span className="text-xl font-extrabold text-red-700 mt-1 block">
                {parseSummary.rejectedRowsCount}
              </span>
              <span className="text-[10px] text-red-600">Format tidak valid</span>
            </div>
          </div>

          {/* Rejected Details (if any) */}
          {parseSummary.rejectedReasons.length > 0 && (
            <div className="bg-red-50/70 border border-red-200 rounded-lg p-3 text-xs text-red-800 space-y-1">
              <div className="font-bold flex items-center space-x-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                <span>Catatan Baris Ditolak:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-red-700">
                {parseSummary.rejectedReasons.slice(0, 5).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview Filters & Search */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={previewSearch}
                onChange={(e) => setPreviewSearch(e.target.value)}
                placeholder="Cari kode atau nama material..."
                className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
              />
            </div>

            <div className="flex items-center space-x-1.5 self-end sm:self-auto text-xs">
              <button
                type="button"
                onClick={() => setPreviewFilter('ALL')}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  previewFilter === 'ALL'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Semua ({parseSummary.items.length})
              </button>
              <button
                type="button"
                onClick={() => setPreviewFilter('READY')}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  previewFilter === 'READY'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                READY ({parseSummary.items.filter((i) => i.readinessStatus === 'READY').length})
              </button>
              <button
                type="button"
                onClick={() => setPreviewFilter('NOT_READY')}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  previewFilter === 'NOT_READY'
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                BELUM READY ({parseSummary.items.filter((i) => i.readinessStatus === 'NOT READY').length})
              </button>
              {parseSummary.reviewRowsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setPreviewFilter('REVIEW')}
                  className={`px-2.5 py-1 rounded font-medium transition ${
                    previewFilter === 'REVIEW'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Perlu Cek ({parseSummary.reviewRowsCount})
                </button>
              )}
            </div>
          </div>

          {/* Interactive Preview Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Nomor OR</th>
                  <th className="py-2.5 px-3">Tanggal Data</th>
                  <th className="py-2.5 px-3">Kode Material</th>
                  <th className="py-2.5 px-3">Nama Material</th>
                  <th className="py-2.5 px-3">Satuan</th>
                  <th className="py-2.5 px-3 text-right">Kebutuhan</th>
                  <th className="py-2.5 px-3 text-right">Diterima</th>
                  <th className="py-2.5 px-3 text-right">Kekurangan</th>
                  <th className="py-2.5 px-3 text-center">Kesiapan</th>
                  <th className="py-2.5 px-3">Catatan Validasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredPreviewItems.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-6 text-center text-slate-400">
                      Tidak ada material yang sesuai dengan filter.
                    </td>
                  </tr>
                ) : (
                  filteredPreviewItems.map((item, idx) => (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50 transition ${
                        item.needsReview ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                        {item.orNumber}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                        {item.dataDate || item.updateDateFormatted}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-blue-700 whitespace-nowrap">
                        {item.materialCode}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800 min-w-48">
                        {item.materialName}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[11px] font-bold">
                          {item.unit}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                        {item.quantity.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                        {item.receivedQty.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                        <span
                          className={
                            item.kekurangan !== undefined && item.kekurangan < 0
                              ? 'text-red-600'
                              : 'text-emerald-600'
                          }
                        >
                          {item.kekurangan !== undefined
                            ? item.kekurangan.toLocaleString('id-ID')
                            : (item.receivedQty - item.quantity).toLocaleString('id-ID')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {item.readinessStatus === 'READY' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            READY
                          </span>
                        ) : item.readinessStatus === 'NOT READY' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            BELUM READY
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
                            CHECK DATA
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-500">
                        {item.validationWarnings && item.validationWarnings.length > 0 ? (
                          <span className="text-amber-700 font-medium">
                            {item.validationWarnings.join(', ')}
                          </span>
                        ) : (
                          <span className="text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 inline" /> Valid
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Confirm Save Bar */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              Rumus Kesiapan:{' '}
              <span className="font-mono font-semibold bg-white px-2 py-0.5 rounded border border-slate-200">
                Kekurangan = Diterima - Kebutuhan
              </span>
              {' • '}
              <span className="text-emerald-700 font-bold">Kekurangan &ge; 0: READY</span>
              {' • '}
              <span className="text-amber-700 font-bold">Kekurangan &lt; 0: BELUM READY</span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleResetForm}
                className="px-4 py-2 border border-slate-300 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-semibold transition"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleInitiateSave}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center space-x-2"
              >
                <Check className="w-4 h-4" />
                <span>Simpan {parseSummary.items.length} Material ke Dashboard</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stored Batches Table */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-blue-600" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Riwayat Kelompok Upload Excel Tersimpan
            </h2>
          </div>
          <span className="text-xs font-medium text-slate-500">
            {storedBatches.length} Kelompok Terdaftar
          </span>
        </div>

        {storedBatches.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            Belum ada kelompok data upload Excel yang tersimpan secara lokal.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Nomor OR</th>
                  <th className="py-2.5 px-3">Tanggal Data</th>
                  <th className="py-2.5 px-3">File Sumber</th>
                  <th className="py-2.5 px-3">Waktu Upload</th>
                  <th className="py-2.5 px-3 text-center">Total Material</th>
                  <th className="py-2.5 px-3 text-center">Status Kesiapan</th>
                  <th className="py-2.5 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {storedBatches.map((batch) => {
                  const readyCount = batch.items.filter((i) => i.readinessStatus === 'READY').length;
                  const notReadyCount = batch.items.filter((i) => i.readinessStatus === 'NOT READY').length;
                  return (
                    <tr key={batch.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-3 font-bold text-slate-900">{batch.orNumber}</td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-600">{batch.dataDate}</td>
                      <td className="py-3 px-3 font-medium text-slate-800 max-w-44 truncate" title={batch.fileName}>
                        {batch.fileName}
                      </td>
                      <td className="py-3 px-3 text-[11px] text-slate-500">
                        {new Date(batch.uploadedAt).toLocaleString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-3 text-center font-bold font-mono">
                        {batch.items.length} item
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex items-center space-x-1.5 text-[10px]">
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                            {readyCount} Ready
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                            {notReadyCount} Belum
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => setViewingBatch(batch)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold transition"
                        >
                          Lihat Item
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBatch(batch.id, batch.orNumber, batch.dataDate)}
                          className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded text-[11px] font-semibold transition"
                          title="Hapus kelompok upload ini"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Overwrite Confirmation Modal (Scenario 12, 13) */}
      {isOverwriteModalOpen && conflictingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center space-x-3 text-amber-600 border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Konfirmasi Penggantian Data Upload
                </h3>
                <p className="text-xs text-slate-500">
                  Kombinasi OR dan Tanggal Data sudah pernah diupload.
                </p>
              </div>
            </div>

            <div className="bg-amber-50/60 border border-amber-200 p-4 rounded-xl text-xs text-slate-700 space-y-2">
              <p>
                Kelompok data upload Excel untuk <strong>{conflictingBatch.orNumber}</strong> pada tanggal{' '}
                <strong>{conflictingBatch.dataDate}</strong> sudah tersimpan sebelumnya:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-600 pl-1 font-mono">
                <li>File sebelumnya: {conflictingBatch.fileName}</li>
                <li>
                  Waktu upload: {new Date(conflictingBatch.uploadedAt).toLocaleString('id-ID')}
                </li>
                <li>Jumlah material lama: {conflictingBatch.items.length} item</li>
              </ul>
              <p className="text-[11px] text-amber-900 font-medium pt-1">
                ⚠️ Memilih &quot;Ganti Data&quot; hanya akan mengganti kelompok upload Excel ini. Data Google Spreadsheet dan upload OR/tanggal lainnya tetap aman dan tidak akan berubah.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsOverwriteModalOpen(false);
                  setConflictingBatch(null);
                  showToast('Penyimpanan dibatalkan. Data lama tetap utuh.', 'error');
                }}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold transition"
              >
                Batal (Pertahankan Data Lama)
              </button>

              <button
                type="button"
                onClick={() => commitBatchSave(true)}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
              >
                Ganti Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal for Stored Batch */}
      {viewingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold">
                    Detail Kelompok Upload: {viewingBatch.orNumber} ({viewingBatch.dataDate})
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    File: {viewingBatch.fileName} • {viewingBatch.items.length} Material
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingBatch(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-2.5">#</th>
                    <th className="py-2 px-2.5">Kode Material</th>
                    <th className="py-2 px-2.5">Nama Material</th>
                    <th className="py-2 px-2.5">Satuan</th>
                    <th className="py-2 px-2.5 text-right">Kebutuhan</th>
                    <th className="py-2 px-2.5 text-right">Diterima</th>
                    <th className="py-2 px-2.5 text-right">Kekurangan</th>
                    <th className="py-2 px-2.5 text-center">Kesiapan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {viewingBatch.items.map((it, idx) => (
                    <tr key={it.id} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="py-2 px-2.5 font-mono font-bold text-blue-700">{it.materialCode}</td>
                      <td className="py-2 px-2.5 font-medium">{it.materialName}</td>
                      <td className="py-2 px-2.5 font-mono">{it.unit}</td>
                      <td className="py-2 px-2.5 text-right font-mono font-semibold">
                        {it.quantity.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono font-semibold">
                        {it.receivedQty.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono font-bold">
                        <span className={it.kekurangan !== undefined && it.kekurangan < 0 ? 'text-red-600' : 'text-emerald-600'}>
                          {it.kekurangan !== undefined ? it.kekurangan.toLocaleString('id-ID') : (it.receivedQty - it.quantity).toLocaleString('id-ID')}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            it.readinessStatus === 'READY'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {it.readinessStatus === 'READY' ? 'READY' : 'BELUM READY'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-slate-50 p-3 border-t border-slate-200 text-right shrink-0">
              <button
                type="button"
                onClick={() => setViewingBatch(null)}
                className="px-4 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
