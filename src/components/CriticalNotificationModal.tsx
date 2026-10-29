import React from 'react';
import {
  Bell,
  X,
  AlertOctagon,
  Calendar,
  Clock,
  CheckCircle2,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  CheckSquare,
  Square,
  AlertTriangle,
} from 'lucide-react';
import { ParsedMaterialItem } from '../types/ppic';

interface CriticalNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  criticalItems: ParsedMaterialItem[];
  onSelectMaterial: (item: ParsedMaterialItem) => void;
  onToggleFollowUp: (item: ParsedMaterialItem) => void;
  onNavigateToSchedule?: () => void;
}

export const CriticalNotificationModal: React.FC<CriticalNotificationModalProps> = ({
  isOpen,
  onClose,
  criticalItems,
  onSelectMaterial,
  onToggleFollowUp,
  onNavigateToSchedule,
}) => {
  if (!isOpen) return null;

  // Ensure unique list by OR and Material Code to prevent any duplicate notifications
  const uniqueCriticalItems = React.useMemo(() => {
    const seen = new Set<string>();
    const list: ParsedMaterialItem[] = [];
    for (const item of criticalItems) {
      const key = `${(item.orNumber || '').trim().toUpperCase()}___${(item.materialCode || '').trim().toUpperCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        list.push(item);
      }
    }
    return list;
  }, [criticalItems]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="bg-red-600 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0 shadow-inner">
              <Bell className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold tracking-tight">
                  Notifikasi Material Kritis PPIC
                </h2>
                <span className="bg-white text-red-700 text-xs font-black px-2 py-0.5 rounded-full shadow-xs">
                  {uniqueCriticalItems.length} Item
                </span>
              </div>
              <p className="text-xs text-red-100 mt-0.5">
                Material dengan defisit stok tinggi, keterlambatan jadwal produksi, atau keusangan data mendesak.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/20 text-white rounded-lg transition"
            title="Tutup Notifikasi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {uniqueCriticalItems.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Semua Material Dalam Kondisi Terkendali
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Tidak ada material yang berstatus <strong>CRITICAL</strong> saat ini.
                Seluruh kebutuhan material telah terpenuhi atau jadwal produksinya masih berada dalam rentang waktu aman.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500 pb-1 border-b border-slate-100">
                <span>Daftar Kebutuhan Kritis Terkini (Tanpa Duplikasi)</span>
                <span>Klik baris untuk melihat analisis lengkap</span>
              </div>

              {uniqueCriticalItems.map((item) => {
                const isFollowedUp = Boolean(item.followUp?.isFollowedUp);
                const hasSchedule = Boolean(item.productionSchedule?.productionDate);
                const isOverdue = item.daysToProduction !== null && item.daysToProduction !== undefined && item.daysToProduction < 0;

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-red-200 bg-red-50/20 hover:bg-red-50/40 transition space-y-3 shadow-2xs"
                  >
                    {/* Item Top Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-red-600 text-white shadow-2xs">
                          CRITICAL ({item.compositeRiskScore})
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-900 bg-white border border-slate-200 px-2 py-0.5 rounded">
                          {item.orNumber}
                        </span>
                        {item.source === 'EXCEL_UPLOAD' ? (
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded">
                            Excel
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 px-1.5 py-0.5 rounded">
                            Sheets
                          </span>
                        )}
                        <span className="text-xs text-slate-500 font-medium">
                          {item.style}
                        </span>
                        <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          {item.materialCode}
                        </span>
                      </div>

                      {/* Follow-up button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFollowUp(item);
                        }}
                        className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition shrink-0 ${
                          isFollowedUp
                            ? 'bg-emerald-100 border-emerald-300 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-white border-amber-300 text-amber-800 hover:bg-amber-50'
                        }`}
                        title="Ubah Status Follow-Up Tim PPIC"
                      >
                        {isFollowedUp ? (
                          <>
                            <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Sudah Follow-up</span>
                          </>
                        ) : (
                          <>
                            <Square className="w-3.5 h-3.5 text-amber-600" />
                            <span>Belum Follow-up</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Material Name */}
                    <div className="text-sm font-semibold text-slate-900">
                      {item.materialName}
                    </div>

                    {/* Critical Reason Banner */}
                    <div className="bg-red-100/70 border border-red-200 rounded-lg p-2.5 text-xs text-red-950 font-medium flex items-start space-x-2">
                      <AlertOctagon className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Alasan Dinyatakan Kritis: </span>
                        <span>{item.primaryRiskReason || item.riskReasons[0] || 'Kekurangan material melebihi ambang batas aman operasional.'}</span>
                      </div>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                      {/* Shortage */}
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-400 block font-medium">Defisit / Kekurangan</span>
                        <span className="font-black text-red-600 text-sm">
                          {item.calculatedShortage > 0
                            ? `- ${item.calculatedShortage.toLocaleString()} ${item.unit}`
                            : '0 (Anomali Data)'}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          Terima: {item.receivedQty.toLocaleString()} / {item.quantity.toLocaleString()}
                        </span>
                      </div>

                      {/* Production Date */}
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-400 block font-medium">Jadwal Produksi</span>
                        {hasSchedule ? (
                          <>
                            <span className="font-bold text-slate-900 block truncate">
                              {item.productionSchedule?.productionDate}
                            </span>
                            <span
                              className={`text-[10px] font-semibold ${
                                isOverdue ? 'text-red-600' : 'text-amber-600'
                              }`}
                            >
                              {isOverdue
                                ? `🚨 Lewat ${Math.abs(item.daysToProduction!)} hari`
                                : `⚠️ ${item.daysToProduction} hari lagi`}
                            </span>
                          </>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="text-amber-700 font-semibold text-[11px] block">
                              Belum Dijadwalkan
                            </span>
                            {onNavigateToSchedule && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onClose();
                                  onNavigateToSchedule();
                                }}
                                className="text-[10px] text-blue-600 hover:underline font-medium"
                              >
                                + Input Jadwal
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Last Update Date */}
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-400 block font-medium">Tanggal Update Terakhir</span>
                        <span className="font-semibold text-slate-800 block truncate">
                          {item.updateDateFormatted}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {item.dataAgeDays !== null ? `${item.dataAgeDays} hari lalu` : 'Format tanggal raw'}
                        </span>
                      </div>

                      {/* Follow-up info & action */}
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200 flex flex-col justify-between">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-medium">Status Follow-up</span>
                          <span
                            className={`text-[11px] font-bold ${
                              isFollowedUp ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {isFollowedUp ? 'Sudah Ditindaklanjuti' : 'Belum Ditindaklanjuti'}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            onClose();
                            onSelectMaterial(item);
                          }}
                          className="mt-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center space-x-1"
                        >
                          <span>Buka Detail</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 shrink-0">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
            <span>Notifikasi diperbarui otomatis mengikuti sinkronisasi Google Sheets &amp; Jadwal Produksi.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-xs transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
