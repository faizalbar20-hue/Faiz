import React from 'react';
import {
  LayoutDashboard,
  Boxes,
  AlertOctagon,
  RefreshCw,
  Settings,
  ShieldAlert,
  Info,
  Calendar,
  Upload,
} from 'lucide-react';
import { PpicDashboardKpi } from '../types/ppic';

export type ActiveTab = 'overview' | 'readiness' | 'risk' | 'schedule' | 'upload' | 'sync' | 'settings';

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  kpi: PpicDashboardKpi;
  excelBatchCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, kpi, excelBatchCount = 0 }) => {
  const navItems = [
    {
      id: 'overview' as ActiveTab,
      label: 'Overview',
      sublabel: 'KPI & Komposisi',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'readiness' as ActiveTab,
      label: 'Material Readiness',
      sublabel: 'Tabel Kesiapan Item',
      icon: Boxes,
      badge: kpi.notReadyRows > 0 ? `${kpi.notReadyRows} Kurang` : null,
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    },
    {
      id: 'upload' as ActiveTab,
      label: 'Upload Excel',
      sublabel: 'Import Data OR & Tgl',
      icon: Upload,
      badge: excelBatchCount > 0 ? `${excelBatchCount} Batch` : null,
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    },
    {
      id: 'risk' as ActiveTab,
      label: 'Risk Analysis',
      sublabel: 'Matriks & Rekomendasi',
      icon: ShieldAlert,
      badge: kpi.criticalRiskCount > 0 ? `${kpi.criticalRiskCount} Kritis` : null,
      badgeColor: 'bg-red-100 text-red-800 border-red-200',
    },
    {
      id: 'schedule' as ActiveTab,
      label: 'Jadwal Produksi',
      sublabel: 'Input & Waktu OR',
      icon: Calendar,
      badge: null,
    },
    {
      id: 'sync' as ActiveTab,
      label: 'Data & Sync Status',
      sublabel: 'Koneksi & Anomali',
      icon: RefreshCw,
      badge: kpi.dataDiscrepancyCount > 0 ? `${kpi.dataDiscrepancyCount} Cek` : null,
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    },
    {
      id: 'settings' as ActiveTab,
      label: 'Settings',
      sublabel: 'Konfigurasi & Bobot',
      icon: Settings,
      badge: null,
    },
  ];

  return (
    <aside className="w-full md:w-64 bg-slate-900 border-r border-slate-800 text-slate-300 flex flex-col shrink-0">
      <div className="p-4 border-b border-slate-800">
        <div className="text-xs uppercase tracking-wider font-semibold text-slate-400">
          Modul PPIC
        </div>
        <div className="text-sm font-medium text-slate-200 mt-0.5">
          Monitoring Material Rekap
        </div>
      </div>

      <nav className="p-3 space-y-1 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-sm font-medium transition group ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                  : 'hover:bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-3 min-w-0">
                <Icon
                  className={`w-5 h-5 shrink-0 transition ${
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'
                  }`}
                />
                <div className="truncate">
                  <div className="truncate leading-snug">{item.label}</div>
                  <div
                    className={`text-[11px] truncate ${
                      isActive ? 'text-blue-100' : 'text-slate-400'
                    }`}
                  >
                    {item.sublabel}
                  </div>
                </div>
              </div>

              {item.badge && (
                <span
                  className={`ml-2 px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
                    isActive ? 'bg-white/20 text-white border-white/30' : item.badgeColor
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Quick Status Footer */}
      <div className="p-3 m-3 bg-slate-800/80 rounded-lg border border-slate-700/60 text-xs">
        <div className="flex items-center space-x-1.5 text-slate-300 font-medium mb-1">
          <Info className="w-3.5 h-3.5 text-blue-400" />
          <span>Status Rekap Saat Ini</span>
        </div>
        <div className="text-slate-400 space-y-0.5">
          <div className="flex justify-between">
            <span>Kesiapan:</span>
            <span className="font-semibold text-slate-200">
              {kpi.readinessPercentage}% ({kpi.readyRows}/{kpi.totalRows})
            </span>
          </div>
          <div className="flex justify-between">
            <span>OR Terdampak:</span>
            <span className="font-semibold text-amber-300">{kpi.affectedOrCount} OR</span>
          </div>
          <div className="flex justify-between">
            <span>Data Usang:</span>
            <span className="font-semibold text-orange-300">{kpi.staleDataCount} Item</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
