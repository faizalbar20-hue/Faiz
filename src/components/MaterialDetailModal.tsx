import React from 'react';
import {
  X,
  Boxes,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Info,
  Calendar,
  Layers,
  ArrowRight,
  ClipboardList,
} from 'lucide-react';
import { ParsedMaterialItem } from '../types/ppic';

interface MaterialDetailModalProps {
  item: ParsedMaterialItem | null;
  onClose: () => void;
  staleThresholdDays: number;
}

export const MaterialDetailModal: React.FC<MaterialDetailModalProps> = ({
  item,
  onClose,
  staleThresholdDays,
}) => {
  if (!item) return null;

  const isCrit = item.riskLevel === 'CRITICAL';
  const isHigh = item.riskLevel === 'HIGH';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-900 text-white flex items-start justify-between">
          <div className="space-y-1 pr-4">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded">
                Row #{item.rowIndex}
              </span>
              <span className="text-xs font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                OR: {item.orNumber}
              </span>
              <span className="text-xs text-slate-300 font-medium">
                Style: {item.style}
              </span>
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
              <span>{item.materialCode}</span>
              <span className="text-slate-400 font-normal text-sm">
                ({item.unit})
              </span>
            </h2>
            <p className="text-xs text-slate-300 line-clamp-2">
              {item.materialName}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto text-xs">
          {/* Status & Risk Badges Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Kesiapan Material
              </span>
              {item.readinessStatus === 'READY' && (
                <span className="inline-flex items-center space-x-1 font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>READY</span>
                </span>
              )}
              {item.readinessStatus === 'NOT READY' && (
                <span className="inline-flex items-center space-x-1 font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded text-[11px]">
                  <XCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>NOT READY</span>
                </span>
              )}
              {item.readinessStatus === 'CHECK DATA' && (
                <span className="inline-flex items-center space-x-1 font-bold text-purple-900 bg-purple-100 px-2 py-0.5 rounded text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5 text-purple-600" />
                  <span>CHECK DATA</span>
                </span>
              )}
            </div>

            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Tingkat Risiko
              </span>
              <span
                className={`inline-block px-2 py-0.5 font-bold rounded text-[11px] ${
                  isCrit
                    ? 'bg-red-100 text-red-800'
                    : isHigh
                    ? 'bg-orange-100 text-orange-800'
                    : item.riskLevel === 'MEDIUM'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {item.riskLevel} ({item.compositeRiskScore})
              </span>
            </div>

            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Prioritas Tindakan
              </span>
              <span className="font-semibold text-slate-800 text-[11px] block mt-0.5">
                {item.followUpPriority}
              </span>
            </div>

            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                Status Kolom J
              </span>
              <span className="font-mono font-bold text-slate-800 text-[11px] block mt-0.5">
                {item.sourceStatus || '(Kosong)'}
              </span>
            </div>
          </div>

          {/* Production Schedule & Follow-up Section */}
          <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-200 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 font-bold text-slate-900 uppercase tracking-wider text-xs">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>Jadwal Produksi &amp; Dampak PPIC</span>
              </div>
              <div className="flex items-center space-x-2">
                {item.productionImpact && (
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${item.productionImpact.badgeColor}`}
                  >
                    Dampak: {item.productionImpact.label}
                  </span>
                )}
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    item.followUp?.isFollowedUp
                      ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                      : 'bg-amber-100 border-amber-300 text-amber-900'
                  }`}
                >
                  {item.followUp?.isFollowedUp ? '✓ SUDAH FOLLOW-UP' : 'BELUM FOLLOW-UP'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-medium">Jadwal Produksi OR</span>
                <span className="font-bold text-slate-900 text-xs">
                  {item.productionImpact?.productionDateDisplay || item.productionSchedule?.productionDate || 'Jadwal Belum Tersedia'}
                </span>
                {item.daysToProduction !== null && item.daysToProduction !== undefined && (
                  <span
                    className={`block text-[10px] font-semibold mt-0.5 ${
                      item.daysToProduction < 0
                        ? 'text-red-600 font-black'
                        : item.daysToProduction <= 3
                        ? 'text-amber-600'
                        : 'text-slate-500'
                    }`}
                  >
                    {item.daysToProduction < 0
                      ? `🚨 Overdue ${Math.abs(item.daysToProduction)} hari lalu`
                      : `Sisa waktu: ${item.daysToProduction} hari lagi`}
                  </span>
                )}
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-medium">Alasan Penetapan Dampak</span>
                <span className="text-xs font-semibold text-slate-700 block">
                  {item.productionImpact?.reason || item.primaryRiskReason || 'Normal'}
                </span>
                {item.followUp?.followedUpAt && (
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    Follow-up pada: {new Date(item.followUp.followedUpAt).toLocaleString('id-ID')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quantity & Formula Inspection */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 uppercase tracking-wider text-xs">
                Audit Kuantitas &amp; Formula Kolom H
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                Satuan: {item.unit}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-400 text-[10px] block">Kebutuhan (Qty)</span>
                <span className="text-sm font-extrabold text-slate-900">
                  {item.quantity.toLocaleString()}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-400 text-[10px] block">Diterima (Received)</span>
                <span className="text-sm font-extrabold text-slate-800">
                  {item.receivedQty.toLocaleString()}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-400 text-[10px] block">Tercatat Kolom H</span>
                <span className="text-sm font-extrabold text-slate-800">
                  {item.recordedBalance}
                </span>
              </div>
              <div className="bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                <span className="text-amber-700 text-[10px] block font-medium">Defisit Terhitung</span>
                <span className="text-sm font-black text-amber-900">
                  {item.calculatedShortage > 0
                    ? `- ${item.calculatedShortage.toLocaleString()}`
                    : item.calculatedSurplus > 0
                    ? `+ ${item.calculatedSurplus.toLocaleString()} (Lebih)`
                    : '0 (Pas)'}
                </span>
              </div>
            </div>

            {item.hasDiscrepancy && (
              <div className="bg-amber-100/70 border border-amber-300 p-2.5 rounded-lg text-amber-900 font-medium">
                ⚠️ <strong>Peringatan Rumus Kolom H:</strong> Nilai selisih yang tertulis di sheet ({item.recordedBalance}) berbeda dari selisih matematis ({item.receivedQty - item.quantity}).
              </div>
            )}

            {item.statusConflictReason && (
              <div className="bg-purple-100/70 border border-purple-300 p-2.5 rounded-lg text-purple-900 font-medium">
                ⚠️ <strong>Konflik Status:</strong> {item.statusConflictReason}
              </div>
            )}
          </div>

          {/* Date & Staleness Analysis */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-slate-600" />
                <span className="font-bold text-slate-900 uppercase tracking-wider text-xs">
                  Analisis Umur Data (Kolom D)
                </span>
              </div>
              {item.isStale ? (
                <span className="bg-orange-100 text-orange-800 border border-orange-200 px-2 py-0.5 rounded font-bold text-[10px]">
                  DATA USANG &gt; {staleThresholdDays} HARI
                </span>
              ) : (
                <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-semibold text-[10px]">
                  DATA SEGAR
                </span>
              )}
            </div>

            <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
              <div>
                <span className="text-slate-500 block text-[11px]">Tanggal Terakhir Pembaruan:</span>
                <span className="font-bold text-slate-900 text-xs">
                  {item.updateDateFormatted}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block text-[11px]">Umur Informasi:</span>
                <span className="font-bold text-slate-900 text-xs">
                  {item.dataAgeDays !== null ? `${item.dataAgeDays} Hari` : 'Tidak tercatat'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed italic">
              *Catatan Aturan Khusus PPIC: Kolom D adalah tanggal terakhir pembaruan informasi material pada sheet Rekap. Umur data digunakan untuk mengingatkan tim agar memverifikasi kebaruan stok, bukan sebagai durasi keterlambatan pengiriman.
            </p>
          </div>

          {/* Operational Mitigations Checklist */}
          <div className="space-y-2">
            <div className="flex items-center space-x-1.5">
              <ClipboardList className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-slate-900 uppercase tracking-wider text-xs">
                Rekomendasi Tindakan Operasional PPIC
              </span>
            </div>

            <div className="space-y-2">
              {item.recommendedMitigations.map((action, idx) => (
                <div
                  key={idx}
                  className="bg-blue-50/50 border border-blue-200/80 p-2.5 rounded-lg text-slate-800 flex items-start space-x-2 font-medium"
                >
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>{action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg transition"
          >
            Tutup Detail
          </button>
        </div>
      </div>
    </div>
  );
};
