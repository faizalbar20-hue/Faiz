import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Plus,
  Edit2,
  Trash2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileSpreadsheet,
  Save,
  X,
  UploadCloud,
  Layers,
  ArrowRight,
  Info,
} from 'lucide-react';
import { ProductionSchedule, ParsedMaterialItem } from '../types/ppic';

interface ProductionScheduleViewProps {
  schedules: ProductionSchedule[];
  items: ParsedMaterialItem[];
  appsScriptUrl?: string;
  onSaveSchedule: (
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
  ) => { success: boolean; message: string };
  onDeleteSchedule: (id: string) => { success: boolean; message: string };
  onSyncToGoogleSheets?: () => Promise<{ success: boolean; message: string }>;
  onNavigateToTab?: (tab: 'risk' | 'readiness') => void;
}

export const ProductionScheduleView: React.FC<ProductionScheduleViewProps> = ({
  schedules,
  items,
  appsScriptUrl,
  onSaveSchedule,
  onDeleteSchedule,
  onSyncToGoogleSheets,
  onNavigateToTab,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form inputs
  const [formData, setFormData] = useState({
    orNumber: '',
    productionDate: '',
    materialCode: '',
    materialName: '',
    requiredQty: '',
    notes: '',
    leadTimeDays: '',
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Extract unique ORs from current material items to assist user selection
  const availableOrs = useMemo(() => {
    const map = new Map<string, { styles: Set<string>; materials: { code: string; name: string }[] }>();
    items.forEach((item) => {
      const or = (item.orNumber || '').trim();
      if (!or || or === '-') return;
      if (!map.has(or)) {
        map.set(or, { styles: new Set(), materials: [] });
      }
      const entry = map.get(or)!;
      if (item.style && item.style !== '-') entry.styles.add(item.style);
      if (item.materialCode && !entry.materials.some((m) => m.code === item.materialCode)) {
        entry.materials.push({ code: item.materialCode, name: item.materialName });
      }
    });
    return Array.from(map.entries()).map(([or, data]) => ({
      or,
      styles: Array.from(data.styles),
      materials: data.materials,
    }));
  }, [items]);

  // Materials available for currently selected OR
  const materialsForSelectedOr = useMemo(() => {
    if (!formData.orNumber) return [];
    const found = availableOrs.find((o) => o.or.toUpperCase() === formData.orNumber.trim().toUpperCase());
    return found ? found.materials : [];
  }, [formData.orNumber, availableOrs]);

  // Filtered schedules list
  const filteredSchedules = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return schedules;
    return schedules.filter((s) => {
      return (
        s.orNumber.toLowerCase().includes(q) ||
        (s.materialCode && s.materialCode.toLowerCase().includes(q)) ||
        (s.materialName && s.materialName.toLowerCase().includes(q)) ||
        s.productionDate.includes(q) ||
        (s.notes && s.notes.toLowerCase().includes(q))
      );
    });
  }, [schedules, searchTerm]);

  // Open Add modal
  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({
      orNumber: '',
      productionDate: '',
      materialCode: '',
      materialName: '',
      requiredQty: '',
      notes: '',
      leadTimeDays: '',
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  // Open Edit modal
  const handleOpenEdit = (schedule: ProductionSchedule) => {
    setEditingId(schedule.id);
    setFormData({
      orNumber: schedule.orNumber,
      productionDate: schedule.productionDate,
      materialCode: schedule.materialCode || '',
      materialName: schedule.materialName || '',
      requiredQty: schedule.requiredQty !== undefined ? String(schedule.requiredQty) : '',
      notes: schedule.notes || '',
      leadTimeDays: schedule.leadTimeDays !== undefined ? String(schedule.leadTimeDays) : '',
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  // Form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Strict Validations
    if (!formData.orNumber.trim()) {
      setFormError('Nomor OR wajib diisi.');
      return;
    }

    if (!formData.productionDate) {
      setFormError('Tanggal produksi wajib dipilih.');
      return;
    }

    const testDate = new Date(formData.productionDate);
    if (isNaN(testDate.getTime())) {
      setFormError('Format tanggal produksi tidak valid.');
      return;
    }

    const res = onSaveSchedule(
      {
        orNumber: formData.orNumber.trim().toUpperCase(),
        productionDate: formData.productionDate,
        materialCode: formData.materialCode.trim() || undefined,
        materialName: formData.materialName.trim() || undefined,
        requiredQty: formData.requiredQty ? Number(formData.requiredQty) : undefined,
        notes: formData.notes.trim() || undefined,
        leadTimeDays: formData.leadTimeDays ? Number(formData.leadTimeDays) : undefined,
      },
      editingId || undefined
    );

    if (res.success) {
      setIsFormOpen(false);
      setEditingId(null);
    } else {
      setFormError(res.message);
    }
  };

  // Delete handler
  const handleDelete = (id: string, orNumber: string) => {
    if (window.confirm(`Hapus jadwal produksi untuk ${orNumber}? Logika penilaian risiko akan kembali ke status default.`)) {
      onDeleteSchedule(id);
    }
  };

  // Sync to Google Sheets
  const handleSyncSheets = async () => {
    if (!onSyncToGoogleSheets) return;
    setIsSyncingSheets(true);
    setSyncFeedback(null);
    try {
      const res = await onSyncToGoogleSheets();
      setSyncFeedback({
        text: res.message,
        type: res.success ? 'success' : 'error',
      });
    } catch (err: any) {
      setSyncFeedback({
        text: err?.message || 'Gagal menyinkronkan ke Google Sheets',
        type: 'error',
      });
    } finally {
      setIsSyncingSheets(false);
      setTimeout(() => setSyncFeedback(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Calendar className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Manajemen Jadwal Produksi per OR
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Input dan kelola tanggal mulai produksi per nomor OR. Penilaian risiko keterlambatan dan notifikasi kritis dihitung otomatis berdasarkan sisa hari menuju jadwal ini.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {appsScriptUrl && onSyncToGoogleSheets && (
            <button
              onClick={handleSyncSheets}
              disabled={isSyncingSheets}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-300 transition disabled:opacity-50"
            >
              <UploadCloud className={`w-3.5 h-3.5 ${isSyncingSheets ? 'animate-bounce' : ''}`} />
              <span>{isSyncingSheets ? 'Menyinkronkan...' : 'Sync ke Google Sheets'}</span>
            </button>
          )}

          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Jadwal Baru</span>
          </button>
        </div>
      </div>

      {/* Sync Feedback Alert */}
      {syncFeedback && (
        <div
          className={`p-3 rounded-lg border text-xs font-medium flex items-center space-x-2 animate-fade-in ${
            syncFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          {syncFeedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{syncFeedback.text}</span>
        </div>
      )}

      {/* Storage & Persistence Transparency Banner */}
      <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs text-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start space-x-2">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-slate-900">Mekanisme Penyimpanan Data: </span>
            <span className="text-slate-600">
              Jadwal disimpan secara persisten di penyimpanan browser lokal dan langsung aktif mengkalkulasi matriks risiko.
              {appsScriptUrl
                ? ' Backend Google Apps Script terkonfigurasi untuk sinkronisasi cloud.'
                : ' Hubungkan Google Apps Script Web App di Pengaturan jika ingin auto-sync dua arah ke spreadsheet Rekap.'}
            </span>
          </div>
        </div>
        <div className="shrink-0 flex items-center space-x-2">
          <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded">
            Lokal Terverifikasi
          </span>
        </div>
      </div>

      {/* Search & Actions Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari nomor OR, kode material, atau tanggal..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
          />
        </div>

        <div className="text-xs text-slate-500 flex items-center space-x-2">
          <span>
            Total Jadwal: <strong>{schedules.length}</strong>
          </span>
        </div>
      </div>

      {/* Schedules Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-slate-200 font-semibold border-b border-slate-800">
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th className="py-3 px-4">Nomor OR</th>
                <th className="py-3 px-4">Tanggal Produksi / Kebutuhan</th>
                <th className="py-3 px-4">Sisa Waktu</th>
                <th className="py-3 px-4">Material Terkait</th>
                <th className="py-3 px-4 text-right">Kebutuhan Qty</th>
                <th className="py-3 px-4 text-center">Lead Time</th>
                <th className="py-3 px-4">Catatan Operasional</th>
                <th className="py-3 px-4 text-center w-24">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredSchedules.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    {searchTerm
                      ? 'Tidak ada jadwal yang sesuai dengan pencarian.'
                      : 'Belum ada jadwal produksi yang diinput. Klik tombol "Tambah Jadwal Baru" di atas.'}
                  </td>
                </tr>
              ) : (
                filteredSchedules.map((schedule, idx) => {
                  const targetDate = new Date(schedule.productionDate);
                  const today = new Date();
                  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  const startOfTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
                  const diffDays = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / 86400000);
                  const isOverdue = diffDays < 0;
                  const isCriticalUrgent = diffDays >= 0 && diffDays <= 3;

                  return (
                    <tr key={schedule.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4 text-center text-slate-400 font-mono text-[11px]">
                        {idx + 1}
                      </td>

                      {/* OR */}
                      <td className="py-3 px-4 font-bold text-slate-900 font-mono">
                        {schedule.orNumber}
                      </td>

                      {/* Production Date */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800 flex items-center space-x-1.5">
                          <Calendar className="w-3.5 h-3.5 text-blue-600" />
                          <span>{schedule.productionDate}</span>
                        </div>
                      </td>

                      {/* Remaining Days Badge */}
                      <td className="py-3 px-4">
                        {isOverdue ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-black bg-red-100 text-red-800 border border-red-300 animate-pulse">
                            <Clock className="w-3 h-3 text-red-600" />
                            <span>Overdue {Math.abs(diffDays)} Hari!</span>
                          </span>
                        ) : isCriticalUrgent ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>{diffDays === 0 ? 'Hari Ini' : `${diffDays} hari lagi (Mepet)`}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <span>{diffDays} hari lagi</span>
                          </span>
                        )}
                      </td>

                      {/* Material */}
                      <td className="py-3 px-4">
                        {schedule.materialCode ? (
                          <div>
                            <div className="font-semibold text-slate-800 font-mono">
                              {schedule.materialCode}
                            </div>
                            {schedule.materialName && (
                              <div className="text-[11px] text-slate-500 truncate max-w-[200px]" title={schedule.materialName}>
                                {schedule.materialName}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Semua material OR</span>
                        )}
                      </td>

                      {/* Required Qty */}
                      <td className="py-3 px-4 text-right font-medium text-slate-800">
                        {schedule.requiredQty !== undefined ? schedule.requiredQty.toLocaleString() : '-'}
                      </td>

                      {/* Lead Time */}
                      <td className="py-3 px-4 text-center">
                        {schedule.leadTimeDays ? (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px]">
                            {schedule.leadTimeDays} hari
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Notes */}
                      <td className="py-3 px-4 text-slate-600 text-[11px] max-w-xs truncate" title={schedule.notes || ''}>
                        {schedule.notes || '-'}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => handleOpenEdit(schedule)}
                            className="p-1 hover:bg-blue-50 text-blue-600 rounded transition"
                            title="Edit Jadwal"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(schedule.id, schedule.orNumber)}
                            className="p-1 hover:bg-red-50 text-red-600 rounded transition"
                            title="Hapus Jadwal"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Form Tambah / Edit */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold">
                  {editingId ? 'Edit Jadwal Produksi' : 'Tambah Jadwal Produksi Baru'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tentukan tanggal produksi untuk memicu deteksi risiko otomatis.
                </p>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="p-1 hover:bg-slate-800 text-slate-300 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* OR Number */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Nomor OR (Production Order) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.orNumber}
                  onChange={(e) => setFormData({ ...formData, orNumber: e.target.value })}
                  placeholder="Contoh: OR 1095"
                  list="or-suggestions"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white uppercase font-mono"
                  required
                />
                <datalist id="or-suggestions">
                  {availableOrs.map((o) => (
                    <option key={o.or} value={o.or}>
                      {o.styles.join(', ')}
                    </option>
                  ))}
                </datalist>
                <p className="text-[10px] text-slate-400 mt-1">
                  Pilih dari daftar OR yang ada pada spreadsheet atau ketik manual nomor OR baru.
                </p>
              </div>

              {/* Tanggal Produksi */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Tanggal Produksi / Kebutuhan <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formData.productionDate}
                  onChange={(e) => setFormData({ ...formData, productionDate: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Tanggal saat proses cutting atau sewing dimulai di pabrik.
                </p>
              </div>

              {/* Material Code (Opsional) */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Kode Material Spesifik (Opsional)
                </label>
                {materialsForSelectedOr.length > 0 ? (
                  <select
                    value={formData.materialCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      const mat = materialsForSelectedOr.find((m) => m.code === code);
                      setFormData({
                        ...formData,
                        materialCode: code,
                        materialName: mat ? mat.name : formData.materialName,
                      });
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Semua material pada OR ini</option>
                    {materialsForSelectedOr.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.code} - {m.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={formData.materialCode}
                    onChange={(e) => setFormData({ ...formData, materialCode: e.target.value })}
                    placeholder="Contoh: KN-TASLAN (Kosongkan jika berlaku untuk seluruh material OR)"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                )}
              </div>

              {/* Quantity & Lead Time Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Kebutuhan Qty (Opsional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.requiredQty}
                    onChange={(e) => setFormData({ ...formData, requiredQty: e.target.value })}
                    placeholder="Contoh: 1250"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Lead Time Pengadaan (Hari)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.leadTimeDays}
                    onChange={(e) => setFormData({ ...formData, leadTimeDays: e.target.value })}
                    placeholder="Contoh: 5"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Catatan Tambahan
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Instruksi khusus, prioritas batch, supplier pengganti..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              {/* Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs transition flex items-center space-x-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingId ? 'Simpan Perubahan' : 'Tambah Jadwal'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
