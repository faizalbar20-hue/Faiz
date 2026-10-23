import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  AlertOctagon,
  Clock,
  CalendarX2,
  CheckCircle2,
  Info,
  ChevronRight,
  Filter,
  Layers,
  ArrowUpRight,
  HelpCircle,
} from 'lucide-react';
import { ParsedMaterialItem, RiskLevel, RiskWeightsConfig } from '../types/ppic';

interface RiskAnalysisViewProps {
  items: ParsedMaterialItem[];
  riskWeights: RiskWeightsConfig;
  onSelectMaterial: (item: ParsedMaterialItem) => void;
}

export const RiskAnalysisView: React.FC<RiskAnalysisViewProps> = ({
  items,
  riskWeights,
  onSelectMaterial,
}) => {
  const [selectedRiskTab, setSelectedRiskTab] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | 'SHORTAGE' | 'STALE' | 'DELIVERY'>('ALL');

  // Filter items
  const riskyItems = useMemo(() => {
    return items
      .filter((item) => {
        if (selectedRiskTab !== 'ALL' && item.riskLevel !== selectedRiskTab) return false;
        if (selectedCategory === 'SHORTAGE' && item.calculatedShortage <= 0) return false;
        if (selectedCategory === 'STALE' && !item.isStale) return false;
        return true;
      })
      .sort((a, b) => b.compositeRiskScore - a.compositeRiskScore);
  }, [items, selectedRiskTab, selectedCategory]);

  const counts = useMemo(() => {
    return {
      critical: items.filter((i) => i.riskLevel === 'CRITICAL').length,
      high: items.filter((i) => i.riskLevel === 'HIGH').length,
      medium: items.filter((i) => i.riskLevel === 'MEDIUM').length,
      low: items.filter((i) => i.riskLevel === 'LOW').length,
      shortage: items.filter((i) => i.calculatedShortage > 0).length,
      stale: items.filter((i) => i.isStale).length,
    };
  }, [items]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-6 h-6 text-red-600" />
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                Material Risk Analysis &amp; Mitigation PPIC
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl">
              Audit risiko objektif berdasarkan kekurangan fisik dan kebaruan informasi. Sistem secara ketat membedakan kekurangan stok dari durasi keterlambatan pengiriman.
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs font-mono bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-slate-500">Bobot:</span>
            <span className="font-semibold text-slate-700">Shortage {(riskWeights.shortageWeight * 100).toFixed(0)}%</span>
            <span className="text-slate-300">•</span>
            <span className="font-semibold text-slate-700">Stale {(riskWeights.staleWeight * 100).toFixed(0)}%</span>
            <span className="text-slate-300">•</span>
            <span className="font-semibold text-slate-700">Anomali {(riskWeights.inconsistencyWeight * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* 3 Dedicated Risk Category Banners (MANDATORY SEPARATION) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Category A: Material Shortage Risk */}
        <div
          onClick={() => setSelectedCategory(selectedCategory === 'SHORTAGE' ? 'ALL' : 'SHORTAGE')}
          className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
            selectedCategory === 'SHORTAGE'
              ? 'bg-amber-50/80 border-amber-400 ring-2 ring-amber-400/30'
              : 'bg-white border-slate-200 hover:border-amber-300 shadow-xs'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                A. Material Shortage Risk
              </span>
              <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                {counts.shortage} Item
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-2">
              Dihitung dari selisih kuantitas fisik (kebutuhan vs diterima) dan rasio pemenuhan stok.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-amber-100 text-[11px] font-medium text-amber-900 flex items-center justify-between">
            <span>Filter Kategori Shortage</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Category B: Stale Data Risk */}
        <div
          onClick={() => setSelectedCategory(selectedCategory === 'STALE' ? 'ALL' : 'STALE')}
          className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
            selectedCategory === 'STALE'
              ? 'bg-orange-50/80 border-orange-400 ring-2 ring-orange-400/30'
              : 'bg-white border-slate-200 hover:border-orange-300 shadow-xs'
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-orange-800">
                B. Stale Data Risk
              </span>
              <span className="text-xs font-bold bg-orange-100 text-orange-800 px-2 py-0.5 rounded">
                {counts.stale} Item
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-2">
              Dihitung dari umur data sejak tanggal update (Kolom D). Menandai data yang belum diperbarui &gt; {riskWeights.staleThresholdDays} hari untuk verifikasi ulang.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-orange-100 text-[11px] font-medium text-orange-900 flex items-center justify-between">
            <span>Filter Kategori Data Usang</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Category C: Delivery Delay Risk */}
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-2 right-2">
            <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono">
              Info Status
            </span>
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <CalendarX2 className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                C. Delivery Delay Risk
              </span>
            </div>
            <div className="mt-3 bg-amber-50 border border-amber-200 p-2.5 rounded-lg text-xs text-amber-900 font-medium">
              ⚠️ Belum dapat dinilai: data jadwal pengiriman belum tersedia
            </div>
            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
              Kolom D merupakan <em>tanggal terakhir pembaruan informasi</em>, bukan jadwal kedatangan atau tanggal kebutuhan. Sistem menolak mengasumsikan keterlambatan pengiriman tanpa data jadwal yang valid.
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-200 text-[10px] text-slate-400">
            Dapat diaktifkan bila spreadsheet menambahkan kolom ETA &amp; Required Date.
          </div>
        </div>
      </div>

      {/* Transparent Formula Explainer */}
      <div className="bg-blue-50/60 border border-blue-200 p-4 rounded-xl text-xs text-blue-900 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-start space-x-2.5">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Formula Perhitungan Skor Risiko (Auditable Risk Scoring):</div>
            <div className="font-mono text-[11px] text-blue-800 mt-0.5">
              Skor Risiko = (Defisit % × {(riskWeights.shortageWeight * 100).toFixed(0)}%) + (Skor Umur Data × {(riskWeights.staleWeight * 100).toFixed(0)}%) + (Faktor Anomali × {(riskWeights.inconsistencyWeight * 100).toFixed(0)}%)
            </div>
          </div>
        </div>
        <div className="text-[11px] text-blue-700">
          Ambang Batas: <strong>CRITICAL</strong> &ge;75 | <strong>HIGH</strong> 50–74 | <strong>MEDIUM</strong> 25–49 | <strong>LOW</strong> &lt;25
        </div>
      </div>

      {/* Tabs and Filter Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center space-x-1.5 overflow-x-auto">
          <button
            onClick={() => setSelectedRiskTab('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedRiskTab === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Semua Tingkat ({items.length})
          </button>
          <button
            onClick={() => setSelectedRiskTab('CRITICAL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedRiskTab === 'CRITICAL'
                ? 'bg-red-600 text-white'
                : 'bg-white text-red-700 hover:bg-red-50 border border-red-200'
            }`}
          >
            CRITICAL ({counts.critical})
          </button>
          <button
            onClick={() => setSelectedRiskTab('HIGH')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedRiskTab === 'HIGH'
                ? 'bg-orange-600 text-white'
                : 'bg-white text-orange-700 hover:bg-orange-50 border border-orange-200'
            }`}
          >
            HIGH ({counts.high})
          </button>
          <button
            onClick={() => setSelectedRiskTab('MEDIUM')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedRiskTab === 'MEDIUM'
                ? 'bg-amber-600 text-white'
                : 'bg-white text-amber-700 hover:bg-amber-50 border border-amber-200'
            }`}
          >
            MEDIUM ({counts.medium})
          </button>
          <button
            onClick={() => setSelectedRiskTab('LOW')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedRiskTab === 'LOW'
                ? 'bg-slate-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            LOW ({counts.low})
          </button>
        </div>

        <div className="text-xs text-slate-500">
          Menampilkan <strong>{riskyItems.length}</strong> material berisiko
        </div>
      </div>

      {/* Risk Assessment Matrix / Action Cards */}
      <div className="space-y-4">
        {riskyItems.length === 0 ? (
          <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-400 text-xs">
            Tidak ada item material yang sesuai dengan filter tingkat risiko ini.
          </div>
        ) : (
          riskyItems.map((item) => {
            const isCrit = item.riskLevel === 'CRITICAL';
            const isHigh = item.riskLevel === 'HIGH';

            return (
              <div
                key={item.id}
                onClick={() => onSelectMaterial(item)}
                className={`bg-white rounded-xl border p-5 shadow-xs hover:shadow-md cursor-pointer transition ${
                  isCrit
                    ? 'border-red-300 bg-red-50/10'
                    : isHigh
                    ? 'border-orange-200 bg-orange-50/5'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  {/* Left: Material Info */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-extrabold rounded border ${
                          isCrit
                            ? 'bg-red-100 text-red-800 border-red-300'
                            : isHigh
                            ? 'bg-orange-100 text-orange-800 border-orange-300'
                            : item.riskLevel === 'MEDIUM'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                      >
                        {item.riskLevel} (Skor: {item.compositeRiskScore})
                      </span>
                      <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded font-mono">
                        {item.materialCode}
                      </span>
                      <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                        {item.orNumber}
                      </span>
                      <span className="text-xs text-slate-600 font-medium">
                        Style: {item.style}
                      </span>
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                        Prioritas: {item.followUpPriority}
                      </span>
                    </div>

                    <div className="text-sm font-semibold text-slate-800">
                      {item.materialName}
                    </div>

                    {/* Quantity stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                      <div className="bg-slate-50 p-2 rounded border border-slate-100">
                        <span className="text-slate-400 block text-[10px]">Kebutuhan</span>
                        <span className="font-bold text-slate-900">
                          {item.quantity.toLocaleString()} {item.unit}
                        </span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded border border-slate-100">
                        <span className="text-slate-400 block text-[10px]">Diterima</span>
                        <span className="font-bold text-slate-700">
                          {item.receivedQty.toLocaleString()} {item.unit}
                        </span>
                      </div>
                      <div className="bg-amber-50 p-2 rounded border border-amber-200">
                        <span className="text-amber-700 block text-[10px]">Kekurangan Fisik</span>
                        <span className="font-extrabold text-amber-900">
                          {item.calculatedShortage > 0
                            ? `- ${item.calculatedShortage.toLocaleString()} ${item.unit}`
                            : '0'}
                        </span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded border border-slate-100">
                        <span className="text-slate-400 block text-[10px]">Umur Data (Kolom D)</span>
                        <span
                          className={`font-bold ${
                            item.isStale ? 'text-orange-600' : 'text-slate-700'
                          }`}
                        >
                          {item.dataAgeDays !== null ? `${item.dataAgeDays} hari lalu` : '-'}
                        </span>
                      </div>
                    </div>

                    {/* Risk Causes / Justification */}
                    <div className="pt-2">
                      <div className="text-xs font-bold text-slate-700 mb-1">
                        Penyebab Risiko Teridentifikasi:
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-xs text-slate-600">
                        {item.riskReasons.map((reason, idx) => (
                          <li key={idx} className="leading-snug">
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Right: Operational Mitigations */}
                  <div className="lg:w-80 bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center space-x-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>Rekomendasi Tindakan PPIC</span>
                      </div>
                      <div className="space-y-1.5">
                        {item.recommendedMitigations.map((action, idx) => (
                          <div
                            key={idx}
                            className="text-xs bg-white p-2 rounded border border-slate-200 text-slate-700 font-medium leading-snug flex items-start space-x-1.5"
                          >
                            <span className="text-blue-500 font-bold shrink-0">›</span>
                            <span>{action}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-blue-600 font-semibold">
                      <span>Buka Form Investigasi</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
