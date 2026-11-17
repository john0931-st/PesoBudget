import React, { useState, useEffect, useMemo } from 'react';
import {
  History,
  Search,
  Filter,
  Download,
  Trash2,
  ArrowRight,
  FileSpreadsheet,
  Edit3,
  PlusCircle,
  MinusCircle,
  FileText,
  Calendar,
  Layers,
  Sparkles,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { ChangeLogEntry, ChangeLogAction } from '../types/changelog';
import {
  getChangeLogs,
  subscribeChangeLogs,
  clearChangeLogsForYear,
  exportChangeLogsToCSV,
} from '../utils/changeLogService';

interface ChangeLogSheetProps {
  currentYear?: number;
  hasData?: boolean;
  onAddNewMonth?: () => void;
}

export const ChangeLogSheet: React.FC<ChangeLogSheetProps> = ({
  currentYear,
  hasData = true,
  onAddNewMonth,
}) => {
  const targetYear = currentYear || new Date().getFullYear();
  const [logs, setLogs] = useState<ChangeLogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedActionFilter, setSelectedActionFilter] = useState<string>('all');

  useEffect(() => {
    setLogs(getChangeLogs());
    const unsubscribe = subscribeChangeLogs(() => {
      setLogs(getChangeLogs());
    });
    return unsubscribe;
  }, []);

  // Strictly filter change logs to the currently selected year only
  const yearLogs = useMemo(() => {
    return logs.filter((log) => {
      if (log.year !== undefined && log.year !== null) {
        return log.year === targetYear;
      }
      if (log.timestamp) {
        const d = new Date(log.timestamp);
        return d.getFullYear() === targetYear;
      }
      return false;
    });
  }, [logs, targetYear]);

  const filteredLogs = useMemo(() => {
    return yearLogs.filter((log) => {
      // Action filter
      if (selectedActionFilter !== 'all' && log.action !== selectedActionFilter) {
        return false;
      }
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          log.sheetName?.toLowerCase().includes(q) ||
          log.description?.toLowerCase().includes(q) ||
          log.rowLabel?.toLowerCase().includes(q) ||
          log.column?.toLowerCase().includes(q) ||
          log.oldValue?.toLowerCase().includes(q) ||
          log.newValue?.toLowerCase().includes(q) ||
          log.actionLabel?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [yearLogs, selectedActionFilter, searchQuery]);

  const handleClear = () => {
    if (
      window.confirm(
        `Are you sure you want to clear all change log history for Year ${targetYear}? This action cannot be undone.`
      )
    ) {
      clearChangeLogsForYear(targetYear);
    }
  };


  const getActionBadge = (action: ChangeLogAction, label: string) => {
    switch (action) {
      case 'cell_edit':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <Edit3 className="w-3 h-3 text-blue-500 dark:text-blue-400" />
            {label}
          </span>
        );
      case 'formula_update':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            <Sparkles className="w-3 h-3 text-purple-500 dark:text-purple-400" />
            {label}
          </span>
        );
      case 'label_rename':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            <FileText className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
            {label}
          </span>
        );
      case 'remarks_change':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <FileText className="w-3 h-3 text-amber-500 dark:text-amber-400" />
            {label}
          </span>
        );
      case 'item_add':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <PlusCircle className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
            {label}
          </span>
        );
      case 'item_remove':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <MinusCircle className="w-3 h-3 text-rose-500 dark:text-rose-400" />
            {label}
          </span>
        );
      case 'sheet_create':
      case 'sheet_duplicate':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
            <Layers className="w-3 h-3 text-teal-500 dark:text-teal-400" />
            {label}
          </span>
        );
      case 'sheet_delete':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
            <Trash2 className="w-3 h-3 text-red-500 dark:text-red-400" />
            {label}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700">
            {label}
          </span>
        );
    }
  };

  // Stat calculations for the selected year
  const cellEditsCount = yearLogs.filter((l) => l.action === 'cell_edit' || l.action === 'formula_update').length;
  const itemChangesCount = yearLogs.filter((l) => l.action === 'item_add' || l.action === 'item_remove' || l.action === 'label_rename').length;
  const sheetChangesCount = yearLogs.filter((l) => l.action.startsWith('sheet_')).length;

  if (!hasData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-center shadow-2xs space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 dark:text-rose-400 shadow-inner">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div className="max-w-md lg:max-w-lg space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 text-[11px] lg:text-xs font-mono font-bold">
            <span>YEAR {targetYear}</span>
          </div>
          <h2 className="text-xl lg:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">No Data Found</h2>
          <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            There are no change log records or budget sheets found for Year {targetYear}.
          </p>
        </div>
        {onAddNewMonth && (
          <button
            type="button"
            onClick={onAddNewMonth}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-xs lg:text-sm font-bold rounded-lg shadow-xs cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Sheet for {targetYear}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-y-auto">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 py-3 sm:py-4 shadow-xs shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20 dark:border-emerald-500/30 shadow-xs">
              <History className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl lg:text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Audit Change Log</h1>
                <span className="px-2.5 py-0.5 text-xs lg:text-sm font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-transparent dark:border-emerald-800 rounded-md font-mono">
                  YEAR {targetYear}
                </span>
              </div>
              <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400">
                Audited ledger of cell edits, formula adjustments, remarks, and sheet changes recorded for {targetYear}.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => exportChangeLogsToCSV(filteredLogs)}
              disabled={filteredLogs.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs lg:text-sm font-medium bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 text-white rounded-lg shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title={`Download Year ${targetYear} Change Log as CSV spreadsheet`}
            >
              <Download className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              Export Log (CSV)
            </button>
            <button
              onClick={handleClear}
              disabled={yearLogs.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs lg:text-sm font-medium bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title={`Clear recorded change logs for Year ${targetYear}`}
            >
              <Trash2 className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              Clear Log
            </button>
          </div>
        </div>

        {/* Quick Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="bg-slate-50 dark:bg-slate-800/70 rounded-lg p-2.5 lg:p-3 border border-slate-200/60 dark:border-slate-700">
            <span className="text-[11px] lg:text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Total Logged ({targetYear})</span>
            <span className="text-lg lg:text-2xl font-bold text-slate-800 dark:text-slate-100">{yearLogs.length}</span>
          </div>
          <div className="bg-blue-50/50 dark:bg-blue-950/40 rounded-lg p-2.5 lg:p-3 border border-blue-100 dark:border-blue-800/70">
            <span className="text-[11px] lg:text-xs font-medium text-blue-600 dark:text-blue-300 uppercase tracking-wider block">Cell & Formula Edits</span>
            <span className="text-lg lg:text-2xl font-bold text-blue-800 dark:text-blue-200">{cellEditsCount}</span>
          </div>
          <div className="bg-amber-50/50 dark:bg-amber-950/40 rounded-lg p-2.5 lg:p-3 border border-amber-100 dark:border-amber-800/70">
            <span className="text-[11px] lg:text-xs font-medium text-amber-600 dark:text-amber-300 uppercase tracking-wider block">Item / Label Changes</span>
            <span className="text-lg lg:text-2xl font-bold text-amber-800 dark:text-amber-200">{itemChangesCount}</span>
          </div>
          <div className="bg-teal-50/50 dark:bg-teal-950/40 rounded-lg p-2.5 lg:p-3 border border-teal-100 dark:border-teal-800/70">
            <span className="text-[11px] lg:text-xs font-medium text-teal-600 dark:text-teal-300 uppercase tracking-wider block">Sheet Lifecycle</span>
            <span className="text-lg lg:text-2xl font-bold text-teal-800 dark:text-teal-200">{sheetChangesCount}</span>
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 py-2.5 shrink-0 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by sheet, item, description, value..."
              className="w-full pl-9 pr-3 py-1.5 text-xs lg:text-sm bg-slate-50 dark:bg-slate-950 hover:bg-slate-100/80 dark:hover:bg-slate-950 focus:bg-white dark:focus:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Action Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-slate-400 dark:text-slate-500" />
            <select
              value={selectedActionFilter}
              onChange={(e) => setSelectedActionFilter(e.target.value)}
              className="text-xs lg:text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-700 dark:text-slate-200 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">All Action Types</option>
              <option value="cell_edit">Cell Edits</option>
              <option value="formula_update">Formula Updates</option>
              <option value="label_rename">Label Renames</option>
              <option value="remarks_change">Remarks Changes</option>
              <option value="item_add">Items Added</option>
              <option value="item_remove">Items Removed</option>
              <option value="sheet_create">Sheet Created</option>
              <option value="sheet_rename">Sheet Renamed</option>
              <option value="sheet_duplicate">Sheet Duplicated</option>
              <option value="sheet_delete">Sheet Deleted</option>
            </select>
          </div>

          {/* Current Year Indicator (Locked to Selected Year) */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 font-semibold text-xs lg:text-sm font-mono">
            <Calendar className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span>Year: <strong>{targetYear}</strong></span>
          </div>

          <span className="text-xs lg:text-sm text-slate-500 dark:text-slate-400 pl-2">
            Showing <strong className="text-slate-700 dark:text-slate-200">{filteredLogs.length}</strong> of {yearLogs.length}
          </span>
        </div>
      </div>

      {/* Spreadsheet Table View */}
      <div className="flex-1 min-h-[240px] overflow-auto bg-slate-100 dark:bg-slate-950 p-2 sm:p-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800 overflow-hidden">
          {filteredLogs.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3 text-slate-400 dark:text-slate-500">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <h3 className="text-sm lg:text-base font-semibold text-slate-800 dark:text-slate-100">No Change Log Records Found for Year {targetYear}</h3>
              <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400 max-w-sm lg:max-w-md mt-1">
                {searchQuery || selectedActionFilter !== 'all'
                  ? 'No entries matched your current search filters. Try clearing filters.'
                  : `Changes you make in Year ${targetYear} monthly sheets (editing values, formulas, remarks, or adding items) will automatically appear here with a full audit trail.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs lg:text-sm">
                <thead>
                  <tr className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider text-[11px] lg:text-xs">
                    <th className="py-2.5 px-4 w-44">Date & Time</th>
                    <th className="py-2.5 px-3 w-36">Sheet / Year</th>
                    <th className="py-2.5 px-3 w-36">Action</th>
                    <th className="py-2.5 px-3 w-40">Target Row / Item</th>
                    <th className="py-2.5 px-3 w-28">Column</th>
                    <th className="py-2.5 px-3 w-56">Value Before / After</th>
                    <th className="py-2.5 px-4 min-w-[220px]">Audit Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredLogs.map((entry, index) => (
                    <tr
                      key={entry.id || index}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors text-slate-700 dark:text-slate-300"
                    >
                      {/* Date & Time */}
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap font-mono text-[11px] lg:text-xs">
                        {entry.formattedDate}
                      </td>

                      {/* Sheet Name */}
                      <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          {entry.sheetName}
                          {entry.year && (
                            <span className="text-[10px] lg:text-xs text-slate-400 dark:text-slate-500 font-mono">({entry.year})</span>
                          )}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {getActionBadge(entry.action, entry.actionLabel)}
                      </td>

                      {/* Target Row / Item */}
                      <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200">
                        {entry.rowLabel || <span className="text-slate-400 dark:text-slate-500 italic">None</span>}
                      </td>

                      {/* Column */}
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {entry.column ? (
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium text-[11px] lg:text-xs">
                            {entry.column}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 italic">-</span>
                        )}
                      </td>

                      {/* Value Before / After */}
                      <td className="py-3 px-3">
                        {entry.oldValue !== undefined || entry.newValue !== undefined ? (
                          <div className="flex items-center gap-1.5 font-mono text-[11px] lg:text-xs">
                            <span className="px-1.5 py-0.5 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 rounded border border-rose-100 dark:border-rose-800/70 line-through truncate max-w-[90px] lg:max-w-[120px]" title={entry.oldValue || '(empty)'}>
                              {entry.oldValue || '—'}
                            </span>
                            <ArrowRight className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                            <span className="px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded border border-emerald-100 dark:border-emerald-800/70 font-semibold truncate max-w-[90px] lg:max-w-[120px]" title={entry.newValue || '(empty)'}>
                              {entry.newValue || '—'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500 italic">—</span>
                        )}
                      </td>

                      {/* Details / Description */}
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 leading-relaxed">
                        {entry.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
