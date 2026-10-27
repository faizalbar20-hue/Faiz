import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  ArrowRight,
  Search,
  RotateCcw,
  Tag,
  Calendar,
  AlertCircle,
  Info,
  CalendarClock,
} from 'lucide-react';
import { PpicDashboardKpi, ParsedMaterialItem, ProductionImpactLevel } from '../types/ppic';
import { calculateDashboardKpi } from '../utils/ppicCalculations';

interface OverviewViewProps {
  kpi: PpicDashboardKpi;
  items: ParsedMaterialItem[];
  staleThresholdDays: number;
  onNavigateToTab: (tab: 'readiness' | 'risk' | 'schedule' | 'sync') => void;
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
  const [impactFilter, setImpactFilter] = useState<ProductionImpactLevel | 'ALL'>('ALL');
  const [impactPage, setImpactPage] = useState<number>(1);
  const pageSize = 10;

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

  // Donut geometry for active KPI (Clean READY vs NOT READY without anomaly indicators)
  const total = Math.max(1, activeKpi.totalRows || 0);
  const readyPct = Math.max(0, Math.min(100, ((activeKpi.readyRows || 0) / total) * 100));
  const notReadyPct = Math.max(0, Math.min(100, (((activeKpi.notReadyRows || 0) + (activeKpi.checkDataRows || 0)) / total) * 100));

  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const readyStroke = Math.max(0, Math.min(circumference, (readyPct / 100) * circumference)) || 0;
  const notReadyStroke = Math.max(0, Math.min(circumference, (notReadyPct / 100) * circumference)) || 0;

  // Top Critical Materials for active items
  const urgentItems = useMemo(() => {
    return filteredItems
      .filter((i) => i.riskLevel === 'CRITICAL' || i.riskLevel === 'HIGH')
      .sort((a, b) => b.compositeRiskScore - a.compositeRiskScore)
      .slice(0, 5);
  }, [filteredItems]);

  // Production Impact items sorted by urgency (Critical / High first)
  const impactItems = useMemo(() => {
    return filteredItems.filter((item) => {
      if (impactFilter === 'ALL') return true;
      return item.productionImpact?.level === impactFilter;
    });
  }, [filteredItems, impactFilter]);

  const impactCounts = useMemo(() => {
    const counts = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      TIDAK_BERDAMPAK: 0,
      BELUM_TERJADWAL: 0,
    };
    for (const item of filteredItems) {
      const lvl = item.productionImpact?.level;
      if (lvl === 'KRITIS') counts.CRITICAL++;
      else if (lvl === 'TINGGI') counts.HIGH++;
      else if (lvl === 'SEDANG') counts.MEDIUM++;
      else if (lvl === 'RENDAH') counts.LOW++;
      else if (lvl === 'TIDAK_BERDAMPAK') counts.TIDAK_BERDAMPAK++;
      else if (lvl === 'BELUM_TERJADWAL') counts.BELUM_TERJADWAL++;
    }
    return counts;
  }, [filteredItems]);

  // Paginated impact items to keep memory and DOM light
  const paginatedImpactItems = useMemo(() => {
    const start = (impactPage - 1) * pageSize;
    return impactItems.slice(start, start + pageSize);
  }, [impactItems, impactPage]);

  const totalImpactPages = Math.max(1, Math.ceil(impactItems.length / pageSize));

  const resetFilter = () => {
    setSearchTerm('');
    setSelectedOrFilter('ALL');
    setImpactFilter('ALL');
    setImpactPage(1);
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
            Monitoring kesiapan pasokan per OR, agregasi kekurangan per satuan, dan evaluasi dampak ketersediaan terhadap jadwal produksi.
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

      {/* Dedicated Search Bar for OR and Style on Overview */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setImpactPage(1);
              }}
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
              onClick={() => {
                setSelectedOrFilter('ALL');
                setImpactPage(1);
              }}
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
                  onClick={() => {
                    setSelectedOrFilter(selectedOrFilter === or ? 'ALL' : or);
                    setImpactPage(1);
                  }}
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

      {/* Balanced 4-Card Primary KPI Grid (Total Material and Check Data Anomali removed cleanly) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Material Ready */}
        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-xs font-semibold uppercase tracking-wider">Material Ready</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700">{activeKpi.readyRows}</div>
            <div className="text-[11px] text-emerald-600 mt-0.5 font-medium">
              {activeKpi.readinessPercentage}% terpenuhi (Kebutuhan aman)
            </div>
          </div>
        </div>

        {/* Card 2: Material Belum Ready */}
        <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-800">
            <span className="text-xs font-semibold uppercase tracking-wider">Material Belum Ready</span>
            <XCircle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-extrabold text-amber-800">{activeKpi.notReadyRows}</div>
            <div className="text-[11px] text-amber-700 mt-0.5 font-medium">
              Terdampak pada {activeKpi.affectedOrCount} OR &amp; {activeKpi.affectedStyleCount} Style
            </div>
          </div>
        </div>

        {/* Card 3: Risiko Kritis & Tinggi */}
        <div className="bg-white p-4 rounded-xl border border-red-200 bg-red-50/10 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-red-700">
            <span className="text-xs font-semibold uppercase tracking-wider">Risiko Kritis &amp; Tinggi</span>
            <ShieldAlert className="w-4 h-4 text-red-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-extrabold text-red-900">
              {activeKpi.criticalRiskCount + activeKpi.highRiskCount}
            </div>
            <div className="text-[11px] text-red-600 mt-0.5 font-medium">
              {activeKpi.criticalRiskCount} Kritis (P1) • {activeKpi.highRiskCount} Tinggi (P2)
            </div>
          </div>
        </div>

        {/* Card 4: Data Usang (Stale) */}
        <div className="bg-white p-4 rounded-xl border border-orange-200 bg-orange-50/10 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-orange-700">
            <span className="text-xs font-semibold uppercase tracking-wider">Data Usang (Stale)</span>
            <Clock className="w-4 h-4 text-orange-600" />
          </div>
          <div className="mt-2">
            <div className="text-2xl sm:text-3xl font-extrabold text-orange-900">{activeKpi.staleDataCount}</div>
            <div className="text-[11px] text-orange-600 mt-0.5 font-medium">
              Tidak diupdate &gt; {staleThresholdDays} hari (Kolom D)
            </div>
          </div>
        </div>
      </div>

      {/* Visual Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Donut Chart: Status Kesiapan (Ready vs Belum Ready) */}
        <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Komposisi Kesiapan Material
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Rasio keterpenuhan material berdasarkan data rekap terbaru
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

            <div className="space-y-3 text-xs">
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-xs bg-emerald-500 shrink-0"></span>
                <span className="text-slate-600">READY:</span>
                <span className="font-semibold text-slate-900">
                  {activeKpi.readyRows} ({readyPct.toFixed(1)}%)
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="w-3 h-3 rounded-xs bg-amber-500 shrink-0"></span>
                <span className="text-slate-600">BELUM READY:</span>
                <span className="font-semibold text-slate-900">
                  {activeKpi.notReadyRows + activeKpi.checkDataRows} ({notReadyPct.toFixed(1)}%)
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
              Berdasarkan gabungan Shortage Severity, Umur Data Kolom D, dan Kedekatan Jadwal Produksi
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

      {/* REVAMPED FEATURE: Monitoring Dampak Produksi per OR */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <CalendarClock className="w-5 h-5 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Monitoring Dampak Produksi per OR
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              Penilaian urgensi risiko material terhadap jadwal produksi per OR berdasarkan tanggal kebutuhan, ketersediaan terkini, dan sisa hari waktu pemenuhan.
            </p>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => onNavigateToTab('schedule')}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold border border-blue-200 transition"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Kelola Jadwal OR</span>
            </button>
          </div>
        </div>

        {/* Impact Filter Tabs */}
        <div className="px-5 pt-3 pb-2 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 font-medium text-[11px] mr-1">Tingkat Dampak:</span>
          <button
            onClick={() => {
              setImpactFilter('ALL');
              setImpactPage(1);
            }}
            className={`px-2.5 py-1 rounded-md font-semibold transition ${
              impactFilter === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
            }`}
          >
            Semua ({filteredItems.length})
          </button>

          <button
            onClick={() => {
              setImpactFilter('KRITIS');
              setImpactPage(1);
            }}
            className={`px-2.5 py-1 rounded-md font-semibold transition flex items-center space-x-1 ${
              impactFilter === 'KRITIS'
                ? 'bg-red-600 text-white'
                : 'bg-red-50 text-red-800 hover:bg-red-100 border border-red-200'
            }`}
          >
            <span>Kritis (&le; 3 Hari / Overdue)</span>
            <span className="text-[10px] font-bold px-1 rounded bg-black/10">
              {impactCounts.CRITICAL}
            </span>
          </button>

          <button
            onClick={() => {
              setImpactFilter('TINGGI');
              setImpactPage(1);
            }}
            className={`px-2.5 py-1 rounded-md font-semibold transition flex items-center space-x-1 ${
              impactFilter === 'TINGGI'
                ? 'bg-orange-600 text-white'
                : 'bg-orange-50 text-orange-800 hover:bg-orange-100 border border-orange-200'
            }`}
          >
            <span>Tinggi (4–7 Hari)</span>
            <span className="text-[10px] font-bold px-1 rounded bg-black/10">
              {impactCounts.HIGH}
            </span>
          </button>

          <button
            onClick={() => {
              setImpactFilter('SEDANG');
              setImpactPage(1);
            }}
            className={`px-2.5 py-1 rounded-md font-semibold transition flex items-center space-x-1 ${
              impactFilter === 'SEDANG'
                ? 'bg-amber-600 text-white'
                : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200'
            }`}
          >
            <span>Sedang (8–14 Hari)</span>
            <span className="text-[10px] font-bold px-1 rounded bg-black/10">
              {impactCounts.MEDIUM}
            </span>
          </button>

          <button
            onClick={() => {
              setImpactFilter('RENDAH');
              setImpactPage(1);
            }}
            className={`px-2.5 py-1 rounded-md font-semibold transition flex items-center space-x-1 ${
              impactFilter === 'RENDAH'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200'
            }`}
          >
            <span>Rendah (&gt; 14 Hari)</span>
            <span className="text-[10px] font-bold px-1 rounded bg-black/10">
              {impactCounts.LOW}
            </span>
          </button>

          <button
            onClick={() => {
              setImpactFilter('TIDAK_BERDAMPAK');
              setImpactPage(1);
            }}
            className={`px-2.5 py-1 rounded-md font-semibold transition flex items-center space-x-1 ${
              impactFilter === 'TIDAK_BERDAMPAK'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
            }`}
          >
            <span>Tidak Berdampak (Ready)</span>
            <span className="text-[10px] font-bold px-1 rounded bg-black/10">
              {impactCounts.TIDAK_BERDAMPAK}
            </span>
          </button>

          <button
            onClick={() => {
              setImpactFilter('BELUM_TERJADWAL');
              setImpactPage(1);
            }}
            className={`px-2.5 py-1 rounded-md font-semibold transition flex items-center space-x-1 ${
              impactFilter === 'BELUM_TERJADWAL'
                ? 'bg-slate-700 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
            }`}
          >
            <span>Jadwal Belum Tersedia</span>
            <span className="text-[10px] font-bold px-1 rounded bg-black/10">
              {impactCounts.BELUM_TERJADWAL}
            </span>
          </button>
        </div>

        {/* Impact Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Nomor OR &amp; Style</th>
                <th className="py-3 px-4">Kode &amp; Nama Material</th>
                <th className="py-3 px-4">Tanggal Produksi</th>
                <th className="py-3 px-4">Status Material</th>
                <th className="py-3 px-4">Kebutuhan vs Kurang</th>
                <th className="py-3 px-4">Tingkat Dampak</th>
                <th className="py-3 px-4">Alasan Penetapan Dampak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedImpactItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    <Info className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                    Tidak ada material pada filter dampak ini.
                  </td>
                </tr>
              ) : (
                paginatedImpactItems.map((item) => {
                  const impact = item.productionImpact;
                  const isReady = item.readinessStatus === 'READY';
                  const days = impact?.daysToProduction;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => onSelectMaterial(item)}
                      className="hover:bg-blue-50/40 cursor-pointer transition"
                    >
                      {/* Nomor OR */}
                      <td className="py-3 px-4 align-top">
                        <div className="font-bold text-slate-900 font-mono">{item.orNumber}</div>
                        <div className="text-[11px] text-slate-500">{item.style}</div>
                      </td>

                      {/* Material */}
                      <td className="py-3 px-4 align-top">
                        <div className="font-bold text-slate-800 font-mono text-[11px]">
                          {item.materialCode}
                        </div>
                        <div className="text-slate-600 truncate max-w-xs">{item.materialName}</div>
                      </td>

                      {/* Tanggal Produksi */}
                      <td className="py-3 px-4 align-top">
                        {impact?.productionDateDisplay === 'Jadwal Belum Tersedia' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            Jadwal Belum Tersedia
                          </span>
                        ) : (
                          <div>
                            <div className="font-semibold text-slate-900 font-mono">
                              {impact?.productionDateDisplay}
                            </div>
                            <div className="text-[10px] mt-0.5">
                              {days !== null && days !== undefined ? (
                                days < 0 ? (
                                  <span className="text-red-700 font-bold bg-red-100 px-1.5 py-0.2 rounded">
                                    Overdue {Math.abs(days)} hari
                                  </span>
                                ) : days === 0 ? (
                                  <span className="text-red-700 font-bold bg-red-100 px-1.5 py-0.2 rounded">
                                    Hari ini
                                  </span>
                                ) : days <= 3 ? (
                                  <span className="text-red-700 font-bold bg-red-50 px-1.5 py-0.2 rounded">
                                    {days} hari lagi
                                  </span>
                                ) : (
                                  <span className="text-slate-500 font-medium">
                                    {days} hari lagi
                                  </span>
                                )
                              ) : (
                                '-'
                              )}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Status Material */}
                      <td className="py-3 px-4 align-top">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                            isReady
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-amber-100 text-amber-900 border-amber-300'
                          }`}
                        >
                          {item.readinessStatus}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-1">
                          Update: {item.updateDateFormatted}
                        </div>
                      </td>

                      {/* Kebutuhan vs Kurang */}
                      <td className="py-3 px-4 align-top whitespace-nowrap">
                        <div className="text-slate-700">
                          Butuh: <strong>{item.quantity.toLocaleString()}</strong> {item.unit}
                        </div>
                        <div
                          className={`text-[11px] font-bold ${
                            item.calculatedShortage > 0 ? 'text-red-600' : 'text-emerald-600'
                          }`}
                        >
                          {item.calculatedShortage > 0
                            ? `Defisit: -${item.calculatedShortage.toLocaleString()} ${item.unit}`
                            : 'Terpenuhi (0)'}
                        </div>
                      </td>

                      {/* Tingkat Dampak */}
                      <td className="py-3 px-4 align-top">
                        <span
                          className={`inline-block px-2.5 py-1 rounded text-xs font-bold border ${
                            impact?.badgeColor || 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}
                        >
                          {impact?.label || 'Belum Ditetapkan'}
                        </span>
                      </td>

                      {/* Alasan Penetapan Dampak */}
                      <td className="py-3 px-4 align-top">
                        <p className="text-slate-700 leading-snug max-w-sm">
                          {impact?.reason || '-'}
                        </p>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Summary */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Menampilkan <strong>{paginatedImpactItems.length}</strong> dari{' '}
            <strong>{impactItems.length}</strong> kebutuhan material
          </div>

          {totalImpactPages > 1 && (
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setImpactPage((p) => Math.max(1, p - 1))}
                disabled={impactPage === 1}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-50 text-xs font-medium"
              >
                Sebelumnya
              </button>
              <span className="px-2 text-xs">
                Halaman {impactPage} dari {totalImpactPages}
              </span>
              <button
                onClick={() => setImpactPage((p) => Math.min(totalImpactPages, p + 1))}
                disabled={impactPage === totalImpactPages}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-50 text-xs font-medium"
              >
                Berikutnya
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Unit-Isolated Shortage Summary & Top Critical Materials */}
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
