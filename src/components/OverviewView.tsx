import React, { useState, useMemo } from 'react';
import {
  Boxes,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Layers,
  ShieldAlert,
  ArrowRight,
  Search,
  RotateCcw,
  Tag,
} from 'lucide-react';
import { PpicDashboardKpi, ParsedMaterialItem } from '../types/ppic';
import { calculateDashboardKpi } from '../utils/ppicCalculations';

interface OverviewViewProps {
  kpi: PpicDashboardKpi;
  items: ParsedMaterialItem[];
  staleThresholdDays: number;
  onNavigateToTab: (tab: 'readiness' | 'risk' | 'sync') => void;
  onSelectMaterial: (item: ParsedMaterialItem) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  kpi: globalKpi,
  items,
  staleThresholdDays,
  onNavigateToTab,
  onSelectMaterial,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrFilter, setSelectedOrFilter] = useState<string>('ALL');

  // Precompute OR stats in O(N) single-pass to prevent CPU spikes
  const { uniqueOrs, orStatsMap } = useMemo(() => {
    const map = new Map<string, { count: number; hasNotReady: boolean }>();
    for (const item of items) {
      if (!item.orNumber || item.orNumber === '-') continue;
      let entry = map.get(item.orNumber);
      if (!entry) {
        entry = { count: 0, hasNotReady: false };
        map.set(item.orNumber, entry);
      }
      entry.count += 1;
      if (item.readinessStatus === 'NOT READY') {
        entry.hasNotReady = true;
      }
    }
    return {
      uniqueOrs: Array.from(map.keys()).sort(),
      orStatsMap: map,
    };
  }, [items]);

  // Filter items by search term (OR or Style) or selected OR chip
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (!item) return false;
      if (selectedOrFilter !== 'ALL' && item.orNumber !== selectedOrFilter) {
        return false;
      }
      if (searchTerm && searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const match =
          String(item.orNumber || '').toLowerCase().includes(q) ||
          String(item.style || '').toLowerCase().includes(q) ||
          String(item.materialCode || '').toLowerCase().includes(q) ||
          String(item.materialName || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [items, searchTerm, selectedOrFilter]);

  const isFiltered = Boolean(searchTerm.trim() || selectedOrFilter !== 'ALL');

  // Calculate dynamic KPIs for filtered items
  const activeKpi = useMemo(() => {
    if (!isFiltered) return globalKpi;
    return calculateDashboardKpi(filteredItems);
  }, [isFiltered, filteredItems, globalKpi]);

  // Donut geometry for active KPI
  const total = Math.max(1, activeKpi.totalRows || 0);
  const readyPct = Math.max(0, Math.min(100, ((activeKpi.readyRows || 0) / total) * 100));
  const notReadyPct = Math.max(0, Math.min(100, ((activeKpi.notReadyRows || 0) / total) * 100));
  const checkDataPct = Math.max(0, Math.min(100, ((activeKpi.checkDataRows || 0) / total) * 100));

  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const readyStroke = Math.max(0, Math.min(circumference, (readyPct / 100) * circumference)) || 0;
  const notReadyStroke = Math.max(0, Math.min(circumference, (notReadyPct / 100) * circumference)) || 0;
  const checkDataStroke = Math.max(0, Math.min(circumference, (checkDataPct / 100) * circumference)) || 0;

  // Top Critical Materials for active items
  const urgentItems = useMemo(() => {
    return filteredItems
      .filter((i) => i.riskLevel === 'CRITICAL' || i.riskLevel === 'HIGH')
      .sort((a, b) => b.compositeRiskScore - a.compositeRiskScore)
      .slice(0, 5);
  }, [filteredItems]);

  const resetFilter = () => {
    setSearchTerm('');
    setSelectedOrFilter('ALL');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Ringkasan Kesiapan Material &amp; Risiko PPIC
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Monitoring kesiapan pasokan per OR &amp; Style, agregasi kekurangan per satuan, dan identifikasi risiko operasional.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onNavigateToTab('readiness')}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition"
          >
            <span>Buka Tabel Material</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* NEW: Dedicated Search Bar for OR and Style on Overview */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari OR atau Style (contoh: OR 1095, KS-882, Chino, dsb.)..."
              className="w-full pl-9 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          {isFiltered && (
            <button
              onClick={resetFilter}
              className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filter</span>
            </button>
          )}
        </div>

        {/* Quick Filter Chips for OR numbers */}
        {uniqueOrs.length > 0 && (
          <div className="flex items-center space-x-2 pt-1 overflow-x-auto text-xs">
            <span className="text-slate-400 text-[11px] font-medium shrink-0 flex items-center gap-1">
              <Tag className="w-3 h-3" /> Filter Cepat OR:
            </span>
            <button
              onClick={() => setSelectedOrFilter('ALL')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition shrink-0 ${
                selectedOrFilter === 'ALL'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Semua OR ({items.length})
            </button>
            {uniqueOrs.map((or) => {
              const stat = orStatsMap.get(or) || { count: 0, hasNotReady: false };
              return (
                <button
                  key={or}
                  onClick={() => setSelectedOrFilter(selectedOrFilter === or ? 'ALL' : or)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition shrink-0 flex items-center space-x-1 border ${
                    selectedOrFilter === or
                      ? 'bg-blue-600 text-white border-blue-600'
                      : stat.hasNotReady
                      ? 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>{or}</span>
                  <span className="text-[10px] opacity-75">({stat.count})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Filter status indicator */}
        {isFiltered && (
          <div className="text-xs text-blue-800 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg flex items-center justify-between">
            <span>
              Menampilkan hasil filter untuk: <strong>{searchTerm || selectedOrFilter}</strong> ({filteredItems.length} baris material)
            </span>
            <button onClick={resetFilter} className="underline text-blue-700 font-semibold text-[11px]">
              Tampilkan Semua
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Material (Unik & Terkini) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">Total Material</span>
            <Boxes className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900">{activeKpi.uniqueMaterialsCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Kode material unik pada {activeKpi.affectedOrCount} OR
            </div>
          </div>
        </div>

        {/* Ready */}
        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-xs font-medium uppercase tracking-wider">Material Ready</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700">{activeKpi.readyRows}</div>
            <div className="text-[11px] text-emerald-600 mt-0.5 font-medium">
              {activeKpi.readinessPercentage}% terpenuhi (OKE)
            </div>
          </div>
        </div>

        {/* Not Ready */}
        <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-800">
            <span className="text-xs font-medium uppercase tracking-wider">Material Belum Ready</span>
            <XCircle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-extrabold text-amber-800">{activeKpi.notReadyRows}</div>
            <div className="text-[11px] text-amber-700 mt-0.5 font-medium">
              Terdampak pada {activeKpi.affectedOrCount} OR &amp; {activeKpi.affectedStyleCount} Style
            </div>
          </div>
        </div>

        {/* Check Data / Conflict */}
        <div className="bg-white p-4 rounded-xl border border-purple-200 bg-purple-50/20 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-purple-800">
            <span className="text-xs font-medium uppercase tracking-wider">Check Data / Anomali</span>
            <AlertTriangle className="w-4 h-4 text-purple-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-extrabold text-purple-900">{activeKpi.checkDataRows}</div>
            <div className="text-[11px] text-purple-700 mt-0.5 font-medium">
              Status &amp; kuantitas bertentangan
            </div>
          </div>
        </div>
      </div>

      {/* Secondary KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Risk Critical & High */}
        <div className="bg-white p-4 rounded-xl border border-red-200 bg-red-50/10 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-red-700">
              Risiko Kritis &amp; Tinggi
            </div>
            <div className="text-2xl font-bold text-red-900 mt-1">
              {activeKpi.criticalRiskCount + activeKpi.highRiskCount} Item
            </div>
            <div className="text-[11px] text-red-600 mt-0.5">
              {activeKpi.criticalRiskCount} Kritis (P1) • {activeKpi.highRiskCount} Tinggi (P2)
            </div>
          </div>
          <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center text-red-600">
            <ShieldAlert className="w-6 h-6" />
          </div>
        </div>

        {/* Stale Data Alert */}
        <div className="bg-white p-4 rounded-xl border border-orange-200 bg-orange-50/10 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-orange-700">
              Data Usang (Stale)
            </div>
            <div className="text-2xl font-bold text-orange-900 mt-1">
              {activeKpi.staleDataCount} Item
            </div>
            <div className="text-[11px] text-orange-600 mt-0.5">
              Tidak diupdate &gt; {staleThresholdDays} hari (Kolom D)
            </div>
          </div>
          <div className="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Affected OR & Style */}
        <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/10 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              Dampak Produksi (OR/Style)
            </div>
            <div className="text-2xl font-bold text-blue-900 mt-1">
              {activeKpi.affectedOrCount} OR / {activeKpi.affectedStyleCount} Style
            </div>
            <div className="text-[11px] text-blue-600 mt-0.5">
              Berpotensi tertunda karena material belum ready
            </div>
          </div>
          <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
            <Layers className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Visual Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Donut Chart: Status Kesiapan */}
        <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Komposisi Kesiapan Material
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Persentase baris material berstatus READY vs NOT READY vs CHECK DATA
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 my-4">
            <div className="relative w-44 h-44 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  className="stroke-slate-100"
                  strokeWidth="18"
                  fill="none"
                />
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  className="stroke-emerald-500 transition-all duration-700"
                  strokeWidth="18"
                  strokeDasharray={`${readyStroke} ${circumference}`}
                  strokeDashoffset="0"
                  fill="none"
                />
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  className="stroke-amber-500 transition-all duration-700"
                  strokeWidth="18"
                  strokeDasharray={`${notReadyStroke} ${circumference}`}
                  strokeDashoffset={-readyStroke}
                  fill="none"
                />
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  className="stroke-purple-500 transition-all duration-700"
                  strokeWidth="18"
                  strokeDasharray={`${checkDataStroke} ${circumference}`}
                  strokeDashoffset={-(readyStroke + notReadyStroke)}
                  fill="none"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-extrabold text-slate-900">
                  {activeKpi.readinessPercentage}%
                </span>
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Kesiapan
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-xs bg-emerald-500 shrink-0"></span>
                <span className="text-slate-600">READY:</span>
                <span className="font-semibold text-slate-900">
                  {activeKpi.readyRows} ({readyPct.toFixed(1)}%)
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-xs bg-amber-500 shrink-0"></span>
                <span className="text-slate-600">NOT READY:</span>
                <span className="font-semibold text-slate-900">
                  {activeKpi.notReadyRows} ({notReadyPct.toFixed(1)}%)
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-xs bg-purple-500 shrink-0"></span>
                <span className="text-slate-600">CHECK DATA:</span>
                <span className="font-semibold text-slate-900">
                  {activeKpi.checkDataRows} ({checkDataPct.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg text-[11px] text-slate-500 border border-slate-200">
            <strong>Kaidah PPIC:</strong> Kesiapan dihitung dari baris yang terpenuhi kuantitasnya dan status sumber OKE.
          </div>
        </div>

        {/* Risk Level Distribution Bar Chart */}
        <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Distribusi Tingkat Risiko Material
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Berdasarkan gabungan Shortage Severity, Umur Data Kolom D, dan Anomali
            </p>
          </div>

          <div className="grid grid-cols-4 gap-3 my-4">
            <div className="flex flex-col items-center bg-red-50 border border-red-200 rounded-lg p-3">
              <span className="text-[11px] font-bold text-red-800 uppercase">CRITICAL</span>
              <span className="text-2xl font-black text-red-700 my-1">{activeKpi.criticalRiskCount}</span>
              <span className="text-[10px] text-red-600 text-center font-medium">P1 - Segera</span>
              <div className="w-full bg-red-200 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-red-600 h-full rounded-full"
                  style={{ width: `${(activeKpi.criticalRiskCount / total) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="flex flex-col items-center bg-orange-50 border border-orange-200 rounded-lg p-3">
              <span className="text-[11px] font-bold text-orange-800 uppercase">HIGH</span>
              <span className="text-2xl font-black text-orange-700 my-1">{activeKpi.highRiskCount}</span>
              <span className="text-[10px] text-orange-600 text-center font-medium">P2 - Tinggi</span>
              <div className="w-full bg-orange-200 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-orange-600 h-full rounded-full"
                  style={{ width: `${(activeKpi.highRiskCount / total) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="flex flex-col items-center bg-amber-50 border border-amber-200 rounded-lg p-3">
              <span className="text-[11px] font-bold text-amber-800 uppercase">MEDIUM</span>
              <span className="text-2xl font-black text-amber-700 my-1">{activeKpi.mediumRiskCount}</span>
              <span className="text-[10px] text-amber-600 text-center font-medium">P3 - Sedang</span>
              <div className="w-full bg-amber-200 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-amber-600 h-full rounded-full"
                  style={{ width: `${(activeKpi.mediumRiskCount / total) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="flex flex-col items-center bg-slate-50 border border-slate-200 rounded-lg p-3">
              <span className="text-[11px] font-bold text-slate-700 uppercase">LOW</span>
              <span className="text-2xl font-black text-slate-800 my-1">{activeKpi.lowRiskCount}</span>
              <span className="text-[10px] text-slate-500 text-center font-medium">Monitoring Rutin</span>
              <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-slate-600 h-full rounded-full"
                  style={{ width: `${(activeKpi.lowRiskCount / total) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
            <span className="text-slate-500">
              Total {activeKpi.criticalRiskCount + activeKpi.highRiskCount} item membutuhkan tindakan mitigasi tim PPIC.
            </span>
            <button
              onClick={() => onNavigateToTab('risk')}
              className="text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1"
            >
              <span>Lihat Matriks Risiko</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Unit-Isolated Shortage Summary & Top Shortage Materials */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Total Kekurangan Dikelompokkan Berdasarkan Satuan */}
        <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Total Kekurangan per Satuan
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pemisahan kuantitas sesuai satuan asli (YDS, GROS, PCS, KG, dsb.)
              </p>
            </div>
            <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-mono font-semibold">
              PPIC Standard
            </span>
          </div>

          {activeKpi.shortageByUnit.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Tidak ada kekurangan material tercatat untuk pencarian ini.
            </div>
          ) : (
            <div className="space-y-3">
              {activeKpi.shortageByUnit.map((item) => (
                <div
                  key={item.unit}
                  className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {item.unit}
                      </span>
                      <span className="text-xs text-slate-500">
                        {item.itemCount} baris material
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Mempengaruhi OR: {item.affectedORs.slice(0, 3).join(', ')}
                      {item.affectedORs.length > 3 && ` +${item.affectedORs.length - 3} lainnya`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-extrabold text-amber-700">
                      - {item.totalShortage.toLocaleString()} {item.unit}
                    </div>
                    <div className="text-[10px] text-slate-400">Total Defisit</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Critical Action Items */}
        <div className="lg:col-span-7 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Material Prioritas Penanganan Kritis
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Item dengan kekurangan tertinggi atau umur data usang yang berpotensi menghambat produksi
              </p>
            </div>
            <button
              onClick={() => onNavigateToTab('risk')}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Lihat Semua ({urgentItems.length})
            </button>
          </div>

          {urgentItems.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Tidak ada material berisiko kritis untuk pencarian ini.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {urgentItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelectMaterial(item)}
                  className="py-3 flex items-start justify-between hover:bg-slate-50/80 px-2 rounded-lg cursor-pointer transition"
                >
                  <div className="space-y-1 pr-3 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {item.materialCode}
                      </span>
                      <span className="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded font-mono">
                        {item.orNumber}
                      </span>
                      <span className="text-[11px] text-slate-500 truncate">
                        {item.style}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 truncate max-w-md">
                      {item.materialName}
                    </div>
                    <div className="flex items-center space-x-2 text-[11px]">
                      <span className="text-red-600 font-semibold">
                        Kurang: {item.calculatedShortage.toLocaleString()} {item.unit}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-500">
                        Diterima: {item.receivedQty.toLocaleString()} / {item.quantity.toLocaleString()}
                      </span>
                      {item.dataAgeDays !== null && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className={item.isStale ? 'text-orange-600 font-medium' : 'text-slate-500'}>
                            Update: {item.dataAgeDays} hari lalu
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`inline-block px-2 py-0.5 text-[11px] font-bold rounded border ${
                        item.riskLevel === 'CRITICAL'
                          ? 'bg-red-100 text-red-800 border-red-200'
                          : 'bg-orange-100 text-orange-800 border-orange-200'
                      }`}
                    >
                      {item.riskLevel} ({item.compositeRiskScore})
                    </span>
                    <div className="text-[10px] text-slate-400 mt-1">
                      {item.followUpPriority}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
