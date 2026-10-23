import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Download,
  Eye,
  RotateCcw,
  SlidersHorizontal,
  Calendar,
} from 'lucide-react';
import { ParsedMaterialItem, ReadinessStatus, RiskLevel } from '../types/ppic';

interface ReadinessViewProps {
  items: ParsedMaterialItem[];
  staleThresholdDays: number;
  onSelectMaterial: (item: ParsedMaterialItem) => void;
}

type SortField = 'materialCode' | 'orNumber' | 'quantity' | 'calculatedShortage' | 'dataAgeDays' | 'compositeRiskScore' | 'readinessStatus';

export const ReadinessView: React.FC<ReadinessViewProps> = ({
  items,
  staleThresholdDays,
  onSelectMaterial,
}) => {
  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [dateSearchTerm, setDateSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [riskFilter, setRiskFilter] = useState<string>('ALL');
  const [orFilter, setOrFilter] = useState<string>('ALL');
  const [unitFilter, setUnitFilter] = useState<string>('ALL');
  const [onlyStale, setOnlyStale] = useState<boolean>(false);

  // Sorting & Pagination
  const [sortField, setSortField] = useState<SortField>('calculatedShortage');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);

  // Distinct Filter options
  const uniqueOrs = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.orNumber && i.orNumber !== '-') set.add(i.orNumber);
    });
    return Array.from(set).sort();
  }, [items]);

  const uniqueUnits = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.unit) set.add(i.unit);
    });
    return Array.from(set).sort();
  }, [items]);

  // Filter and sort items
  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        // Search term in code, name, OR, or Style
        if (searchTerm) {
          const q = searchTerm.toLowerCase();
          const match =
            item.materialCode.toLowerCase().includes(q) ||
            item.materialName.toLowerCase().includes(q) ||
            item.orNumber.toLowerCase().includes(q) ||
            item.style.toLowerCase().includes(q);
          if (!match) return false;
        }

        // Tanggal Update Search
        if (dateSearchTerm.trim()) {
          const dq = dateSearchTerm.toLowerCase().trim();
          const matchDate =
            item.updateDateFormatted.toLowerCase().includes(dq) ||
            (item.dataAgeDays !== null && `${item.dataAgeDays} hari`.includes(dq)) ||
            (item.updateDate ? item.updateDate.toISOString().toLowerCase().includes(dq) : false);
          if (!matchDate) return false;
        }

        // Status Filter
        if (statusFilter !== 'ALL' && item.readinessStatus !== statusFilter) return false;

        // Risk Filter
        if (riskFilter !== 'ALL' && item.riskLevel !== riskFilter) return false;

        // OR Filter
        if (orFilter !== 'ALL' && item.orNumber !== orFilter) return false;

        // Unit Filter
        if (unitFilter !== 'ALL' && item.unit !== unitFilter) return false;

        // Only Stale Filter
        if (onlyStale && !item.isStale) return false;

        return true;
      })
      .sort((a, b) => {
        let valA: any = a[sortField];
        let valB: any = b[sortField];

        if (sortField === 'dataAgeDays') {
          valA = a.dataAgeDays ?? -1;
          valB = b.dataAgeDays ?? -1;
        }

        if (typeof valA === 'string') {
          return sortDirection === 'asc'
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        }

        return sortDirection === 'asc' ? valA - valB : valB - valA;
      });
  }, [items, searchTerm, dateSearchTerm, statusFilter, riskFilter, orFilter, unitFilter, onlyStale, sortField, sortDirection]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredItems.length / pageSize) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const resetFilters = () => {
    setSearchTerm('');
    setDateSearchTerm('');
    setStatusFilter('ALL');
    setRiskFilter('ALL');
    setOrFilter('ALL');
    setUnitFilter('ALL');
    setOnlyStale(false);
    setCurrentPage(1);
  };

  // CSV Export for PPIC reporting
  const exportCsv = () => {
    const headers = [
      'Row',
      'OR',
      'Style',
      'Material Code',
      'Material Name',
      'Quantity Required',
      'Received Qty',
      'Recorded Balance (Col H)',
      'Calculated Shortage',
      'Unit',
      'Tanggal Update',
      'Data Age (Days)',
      'Source Status (Col J)',
      'Readiness Status',
      'Risk Level',
      'Risk Score',
      'Discrepancy Note',
    ];

    const rows = filteredItems.map((i) => [
      i.rowIndex,
      `"${i.orNumber}"`,
      `"${i.style}"`,
      `"${i.materialCode}"`,
      `"${i.materialName.replace(/"/g, '""')}"`,
      i.quantity,
      i.receivedQty,
      i.recordedBalance,
      i.calculatedShortage,
      `"${i.unit}"`,
      `"${i.updateDateFormatted}"`,
      i.dataAgeDays ?? '',
      `"${i.sourceStatus}"`,
      `"${i.readinessStatus}"`,
      `"${i.riskLevel}"`,
      i.compositeRiskScore,
      `"${(i.validationWarnings || []).join('; ')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ppic_material_readiness_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* View Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Tabel Monitoring Kesiapan Material (Material Readiness)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Validasi pemenuhan kebutuhan vs stok diterima, identifikasi anomali status, dan umur data kolom D.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={exportCsv}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-3">
          {/* Search Box Material / OR / Style */}
          <div className="md:col-span-3 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari kode, nama, OR, style..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
          </div>

          {/* Search Box Tanggal Update */}
          <div className="md:col-span-3 relative">
            <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={dateSearchTerm}
              onChange={(e) => {
                setDateSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari Tanggal Update (misal: 22/10, Okt)..."
              className="w-full pl-9 pr-7 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
            {dateSearchTerm && (
              <button
                type="button"
                onClick={() => {
                  setDateSearchTerm('');
                  setCurrentPage(1);
                }}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
                title="Hapus pencarian tanggal"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="md:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-2 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Semua Status</option>
              <option value="READY">READY (Terpenuhi)</option>
              <option value="NOT READY">NOT READY (Kurang)</option>
              <option value="CHECK DATA">CHECK DATA (Anomali)</option>
            </select>
          </div>

          {/* Risk Filter */}
          <div className="md:col-span-2">
            <select
              value={riskFilter}
              onChange={(e) => {
                setRiskFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-2 px-2.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Semua Risiko</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>

          {/* OR Filter */}
          <div className="md:col-span-1">
            <select
              value={orFilter}
              onChange={(e) => {
                setOrFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-2 px-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Filter Nomor OR"
            >
              <option value="ALL">Semua OR</option>
              {uniqueOrs.map((or) => (
                <option key={or} value={or}>
                  {or}
                </option>
              ))}
            </select>
          </div>

          {/* Unit Filter */}
          <div className="md:col-span-1">
            <select
              value={unitFilter}
              onChange={(e) => {
                setUnitFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-2 px-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Filter Satuan"
            >
              <option value="ALL">Semua Satuan</option>
              {uniqueUnits.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Badges & Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center space-x-3">
            <label className="flex items-center space-x-1.5 cursor-pointer text-slate-700 font-medium select-none">
              <input
                type="checkbox"
                checked={onlyStale}
                onChange={(e) => {
                  setOnlyStale(e.target.checked);
                  setCurrentPage(1);
                }}
                className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <span className="flex items-center space-x-1">
                <Clock className="w-3 h-3 text-orange-500" />
                <span>Hanya Data Usang (&gt; {staleThresholdDays} hari)</span>
              </span>
            </label>
          </div>

          <div className="flex items-center space-x-2 text-slate-500">
            <span>
              Menampilkan <strong>{filteredItems.length}</strong> dari <strong>{items.length}</strong> material
            </span>
            {(searchTerm || dateSearchTerm || statusFilter !== 'ALL' || riskFilter !== 'ALL' || orFilter !== 'ALL' || unitFilter !== 'ALL' || onlyStale) && (
              <button
                onClick={resetFilters}
                className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800 font-medium ml-2"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Filter</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Material Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-slate-200 font-semibold border-b border-slate-800">
                <th className="py-3 px-3 w-12 text-center">Row</th>
                <th
                  onClick={() => handleSort('orNumber')}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-800 transition"
                >
                  <div className="flex items-center space-x-1">
                    <span>OR / Style</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('materialCode')}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-800 transition"
                >
                  <div className="flex items-center space-x-1">
                    <span>Kode &amp; Nama Material</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('quantity')}
                  className="py-3 px-3 text-right cursor-pointer hover:bg-slate-800 transition"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Kebutuhan</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th className="py-3 px-3 text-right">Diterima</th>
                <th
                  onClick={() => handleSort('calculatedShortage')}
                  className="py-3 px-3 text-right cursor-pointer hover:bg-slate-800 transition"
                >
                  <div className="flex items-center justify-end space-x-1">
                    <span>Kekurangan</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th className="py-3 px-3 text-center">Satuan</th>
                <th
                  onClick={() => handleSort('dataAgeDays')}
                  className="py-3 px-3 cursor-pointer hover:bg-slate-800 transition"
                >
                  <div className="flex items-center space-x-1">
                    <span>Tanggal Update</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th className="py-3 px-3 text-center">Status Rekap</th>
                <th
                  onClick={() => handleSort('readinessStatus')}
                  className="py-3 px-3 text-center cursor-pointer hover:bg-slate-800 transition"
                >
                  <div className="flex items-center justify-center space-x-1">
                    <span>Kesiapan</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('compositeRiskScore')}
                  className="py-3 px-3 text-center cursor-pointer hover:bg-slate-800 transition"
                >
                  <div className="flex items-center justify-center space-x-1">
                    <span>Risiko</span>
                    <ArrowUpDown className="w-3 h-3 opacity-60" />
                  </div>
                </th>
                <th className="py-3 px-3 text-center w-14">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-400">
                    Tidak ada material yang cocok dengan kriteria pencarian dan filter.
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item) => {
                  const hasShortage = item.calculatedShortage > 0;
                  const hasSurplus = item.calculatedSurplus > 0;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => onSelectMaterial(item)}
                      className="hover:bg-blue-50/50 cursor-pointer transition"
                    >
                      {/* Row index */}
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                        #{item.rowIndex}
                      </td>

                      {/* OR / Style */}
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{item.orNumber}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[120px]">
                          {item.style}
                        </div>
                      </td>

                      {/* Product */}
                      <td className="py-2.5 px-3 min-w-[200px] max-w-[280px]">
                        <div className="font-bold text-slate-800 flex items-center space-x-1">
                          <span>{item.materialCode}</span>
                          {item.hasDiscrepancy && (
                            <span
                              title="Formula Kolom H tidak sinkron"
                              className="text-amber-500 font-mono text-[10px]"
                            >
                              ⚠️
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-600 truncate" title={item.materialName}>
                          {item.materialName}
                        </div>
                      </td>

                      {/* Required Quantity */}
                      <td className="py-2.5 px-3 text-right font-medium text-slate-900">
                        {item.quantity.toLocaleString()}
                      </td>

                      {/* Received Quantity */}
                      <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                        {item.receivedQty.toLocaleString()}
                      </td>

                      {/* Shortage / Surplus */}
                      <td className="py-2.5 px-3 text-right">
                        {hasShortage ? (
                          <span className="font-extrabold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                            - {item.calculatedShortage.toLocaleString()}
                          </span>
                        ) : hasSurplus ? (
                          <span className="font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-[11px]">
                            + {item.calculatedSurplus.toLocaleString()} (Lebih)
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-semibold">0</span>
                        )}
                      </td>

                      {/* Unit */}
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded font-mono text-[11px]">
                          {item.unit}
                        </span>
                      </td>

                      {/* Update Date & Age */}
                      <td className="py-2.5 px-3">
                        <div className="text-slate-800">{item.updateDateFormatted}</div>
                        {item.dataAgeDays !== null ? (
                          <div
                            className={`text-[10px] flex items-center space-x-1 ${
                              item.isStale
                                ? 'text-orange-600 font-semibold'
                                : 'text-slate-400'
                            }`}
                          >
                            {item.isStale && <Clock className="w-2.5 h-2.5" />}
                            <span>{item.dataAgeDays} hari lalu</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400">Tgl tidak valid</span>
                        )}
                      </td>

                      {/* Source Ket (Kolom J) */}
                      <td className="py-2.5 px-3 text-center">
                        <span className="text-[11px] font-mono text-slate-600 px-1.5 py-0.5 bg-slate-100 rounded">
                          {item.sourceStatus || '-'}
                        </span>
                      </td>

                      {/* Readiness Status */}
                      <td className="py-2.5 px-3 text-center">
                        {item.readinessStatus === 'READY' && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>READY</span>
                          </span>
                        )}
                        {item.readinessStatus === 'NOT READY' && (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                            <XCircle className="w-3 h-3 text-amber-700" />
                            <span>NOT READY</span>
                          </span>
                        )}
                        {item.readinessStatus === 'CHECK DATA' && (
                          <span
                            title={item.statusConflictReason}
                            className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-200"
                          >
                            <AlertTriangle className="w-3 h-3 text-purple-700" />
                            <span>CHECK DATA</span>
                          </span>
                        )}
                      </td>

                      {/* Risk Level Badge */}
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-extrabold rounded border ${
                            item.riskLevel === 'CRITICAL'
                              ? 'bg-red-100 text-red-800 border-red-300'
                              : item.riskLevel === 'HIGH'
                              ? 'bg-orange-100 text-orange-800 border-orange-300'
                              : item.riskLevel === 'MEDIUM'
                              ? 'bg-amber-100 text-amber-800 border-amber-300'
                              : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}
                        >
                          {item.riskLevel}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectMaterial(item);
                          }}
                          className="p-1 hover:bg-blue-100 text-blue-600 rounded transition"
                          title="Lihat Detail & Rekomendasi"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center space-x-2">
            <span>Baris per halaman:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="py-1 px-2 bg-white border border-slate-300 rounded text-xs"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span>
              Halaman <strong>{currentPage}</strong> dari <strong>{totalPages}</strong>
            </span>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-2.5 py-1 rounded bg-white border border-slate-300 font-medium hover:bg-slate-100 disabled:opacity-40 transition"
            >
              Sebelumnya
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
              const p = idx + 1;
              return (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`w-7 h-7 rounded font-medium ${
                    currentPage === p
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {p}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-2.5 py-1 rounded bg-white border border-slate-300 font-medium hover:bg-slate-100 disabled:opacity-40 transition"
            >
              Berikutnya
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
