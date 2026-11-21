/**
 * @file NewMonthModal.tsx
 * @description Dialog for adding a new budget month sheet in PesoBudget.
 * 
 * Supports:
 * - 15-day payroll cutoff presets (1st–15th and 16th–31st) where both sheets have the same
 *   table title (e.g. "JANUARY") and automatically compute together into 1 monthly report.
 * - Empty default template where all expense items are empty, formula rows are preserved,
 *   and Salary automatically equals (carried previous balance + manual input current salary).
 * - Or copying existing values from the current active month.
 */

import React, { useState } from 'react';
import { X, Calendar, Copy, Sparkles, Check, DollarSign, Layers } from 'lucide-react';
import { formatCurrency } from '../utils/currency';
import { useCurrency } from '../hooks/useCurrency';

interface NewMonthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMonthName: string;
  carriedBalanceMonthly?: number;
  carriedBalanceKinsenas?: number;
  defaultBaseSalaryMonthly?: number;
  defaultBaseSalaryKinsenas?: number;
  initialYear?: number;
  availableYears?: number[];
  deferredCount?: number;
  deferredTotal?: number;
  onConfirm: (
    monthName: string,
    shouldCopyCurrent: boolean,
    manualSalaryMonthly?: number,
    manualSalaryKinsenas?: number,
    targetYear?: number,
    includePreviousBalance?: boolean,
    carryOverDeferred?: boolean
  ) => void;
}

const MONTHS_LIST = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const NewMonthModal: React.FC<NewMonthModalProps> = ({
  isOpen,
  onClose,
  currentMonthName,
  carriedBalanceMonthly = 0,
  carriedBalanceKinsenas = 0,
  defaultBaseSalaryMonthly = 0,
  defaultBaseSalaryKinsenas = 0,
  initialYear = 2026,
  availableYears = [2024, 2025, 2026, 2027, 2028],
  deferredCount = 0,
  deferredTotal = 0,
  onConfirm,
}) => {
  useCurrency();
  const [selectedMonth, setSelectedMonth] = useState('January');
  const [selectedYear, setSelectedYear] = useState<string>(String(initialYear || 2026));
  const [customYearInput, setCustomYearInput] = useState('');
  const [isCustomYear, setIsCustomYear] = useState(false);
  const [name, setName] = useState('');
  // Default is false (empty template where all expense rows are empty and salary = prev balance + current salary)
  const [copyCurrent, setCopyCurrent] = useState(false);
  // Option inside Clean Default Template: include carried previous balance or start with ₱0.00 previous balance
  const [includePreviousBalance, setIncludePreviousBalance] = useState(true);
  // Option inside Clean Default Template: carry over Deferred (Next Payroll) bills from active sheet
  const [carryOverDeferred, setCarryOverDeferred] = useState(deferredCount > 0);

  // Manual current salary inputs
  const [manualSalaryKinsenas, setManualSalaryKinsenas] = useState<string>(
    defaultBaseSalaryKinsenas > 0 ? defaultBaseSalaryKinsenas.toString() : ''
  );
  const [manualSalaryMonthly, setManualSalaryMonthly] = useState<string>(
    defaultBaseSalaryMonthly > 0 ? defaultBaseSalaryMonthly.toString() : ''
  );

  // Sync initialYear and default salary inputs when modal opens
  React.useEffect(() => {
    if (isOpen) {
      if (initialYear) {
        setSelectedYear(String(initialYear));
        setIsCustomYear(false);
      }
      setIncludePreviousBalance(true);
      setCarryOverDeferred(deferredCount > 0);
      setManualSalaryKinsenas(
        defaultBaseSalaryKinsenas > 0 ? defaultBaseSalaryKinsenas.toString() : ''
      );
      setManualSalaryMonthly(
        defaultBaseSalaryMonthly > 0 ? defaultBaseSalaryMonthly.toString() : ''
      );
    }
  }, [initialYear, isOpen, defaultBaseSalaryKinsenas, defaultBaseSalaryMonthly, deferredCount]);

  if (!isOpen) return null;

  const numSalaryKinsenas = parseFloat(manualSalaryKinsenas) || 0;
  const effectiveCarriedBalanceKinsenas =
    !copyCurrent && !includePreviousBalance ? 0 : carriedBalanceKinsenas;
  const totalStartingSalaryKinsenas = effectiveCarriedBalanceKinsenas + numSalaryKinsenas;
  const activeTargetYear = isCustomYear && customYearInput ? customYearInput : selectedYear;

  const handleApplyPreset = (cutoff: '1-15' | '16-31' | 'full') => {
    if (cutoff === '1-15') {
      setName(`${selectedMonth} 1-15`);
    } else if (cutoff === '16-31') {
      const daysInMonth = ['April', 'June', 'September', 'November'].includes(selectedMonth) ? '30' : selectedMonth === 'February' ? '28' : '31';
      setName(`${selectedMonth} 16-${daysInMonth}`);
    } else {
      setName(`${selectedMonth} ${activeTargetYear}`);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const parsedYear = parseInt(activeTargetYear, 10) || 2026;

    onConfirm(
      name.trim(),
      copyCurrent,
      parseFloat(manualSalaryMonthly) || 0,
      parseFloat(manualSalaryKinsenas) || 0,
      parsedYear,
      copyCurrent ? true : includePreviousBalance,
      copyCurrent ? false : carryOverDeferred
    );

    setName('');
    onClose();
  };

  return (
    <div
      className="pb-modal-backdrop z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/70 select-none"
      onClick={onClose}
    >
      <div
        className="pb-modal-card w-full max-w-md lg:max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center border border-transparent dark:border-slate-700">
              <Calendar className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm lg:text-base font-bold text-slate-900 dark:text-slate-100">Add New Budget Sheet</h2>
              <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400">15-day cutoff sheet or full month cycle</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="p-4 sm:p-5 space-y-3.5 text-xs lg:text-sm overflow-y-auto overscroll-contain flex-1 min-h-0">
          {/* Modern Which Year to be Placed Selector */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-700 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs lg:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Which year to be placed:</span>
              </label>
              <span className="text-[10px] lg:text-xs bg-slate-900 dark:bg-slate-800 dark:border dark:border-slate-700 text-white font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                Year {activeTargetYear}
              </span>
            </div>

            {/* Quick Year Selection Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              {availableYears.map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => {
                    setSelectedYear(String(yr));
                    setIsCustomYear(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs lg:text-sm font-bold font-mono transition-all cursor-pointer border ${
                    !isCustomYear && selectedYear === String(yr)
                      ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-500 shadow-2xs'
                      : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300/80 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {yr}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setIsCustomYear(true)}
                className={`px-2.5 py-1.5 rounded-lg text-xs lg:text-sm font-semibold transition-all cursor-pointer border ${
                  isCustomYear
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                    : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-slate-300/80 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                Custom Year
              </button>
            </div>

            {isCustomYear && (
              <div className="pt-1 flex items-center gap-2">
                <input
                  type="number"
                  min="2000"
                  max="2099"
                  value={customYearInput}
                  onChange={(e) => setCustomYearInput(e.target.value)}
                  placeholder="e.g. 2029"
                  className="w-28 bg-white dark:bg-slate-950 border border-emerald-400 dark:border-emerald-500 rounded-lg px-2.5 py-1 text-xs lg:text-sm font-bold font-mono text-slate-900 dark:text-slate-100 focus:outline-none"
                  autoFocus
                />
                <span className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400">Enter custom 4-digit year</span>
              </div>
            )}
          </div>

          {/* Quick 15-Day Cutoff Presets */}
          <div className="bg-emerald-50/60 dark:bg-emerald-950/35 border border-emerald-200/80 dark:border-emerald-800/70 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-emerald-950 dark:text-emerald-200 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                15-Day Cutoff Quick Presets (2 Sheets = 1 Month)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] lg:text-xs text-slate-600 dark:text-slate-300 font-semibold">Month:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-white dark:bg-slate-950 border border-emerald-300 dark:border-emerald-700 rounded px-2 py-1 text-xs lg:text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none"
              >
                {MONTHS_LIST.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>

              <span className="text-[11px] lg:text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                under Year <strong className="font-mono font-bold text-slate-900 dark:text-white">{activeTargetYear}</strong>
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => handleApplyPreset('1-15')}
                className="px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/80 rounded font-medium text-[11px] lg:text-xs cursor-pointer transition-colors"
              >
                Cutoff 1: {selectedMonth} 1-15
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('16-31')}
                className="px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/80 rounded font-medium text-[11px] lg:text-xs cursor-pointer transition-colors"
              >
                Cutoff 2: {selectedMonth} 16-31
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('full')}
                className="px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/80 rounded font-medium text-[11px] lg:text-xs cursor-pointer transition-colors"
              >
                Full {selectedMonth} {activeTargetYear}
              </button>
            </div>

            <p className="text-[10px] lg:text-xs text-emerald-800/80 dark:text-emerald-300/80 leading-normal">
              Table title on both sheets remains <strong>{selectedMonth.toUpperCase()}</strong> under year <strong>{activeTargetYear}</strong>.
            </p>
          </div>

          {/* Month & Year Title */}
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
              Sheet Tab Name
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. January 1-15, January 16-31, or October 2026"
              className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:focus:ring-emerald-500 text-sm lg:text-base font-medium"
              required
            />
          </div>

          {/* Starting Template Choice */}
          <div className="space-y-2 pt-1">
            <label className="block text-slate-700 dark:text-slate-300 font-semibold">Starting Template</label>

            {/* Option 1: Clean Default Template */}
            <div
              onClick={() => setCopyCurrent(false)}
              className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                !copyCurrent
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-500 text-emerald-950 dark:text-emerald-100 shadow-2xs'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-800 dark:text-slate-200'
              }`}
            >
              <input
                type="radio"
                checked={!copyCurrent}
                onChange={() => setCopyCurrent(false)}
                className="mt-0.5 accent-emerald-600"
              />
              <div className="text-xs lg:text-sm flex-1">
                <div className="font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                    Clean Default Template
                  </span>
                  <span className="text-[10px] lg:text-xs bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-bold px-1.5 py-0.5 rounded">
                    Recommended
                  </span>
                </div>
                <div className="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed text-[11px] lg:text-xs">
                  All expense cells start empty. Formula rows (Metrobank, Total, Balance) are preserved, and Salary equals{' '}
                  <strong className="text-slate-700 dark:text-slate-200">
                    {includePreviousBalance ? 'previous balance + current salary' : `current salary only (${formatCurrency(0)} previous balance)`}
                  </strong>.
                </div>

                {/* Previous Balance Option inside Clean Default Template */}
                {!copyCurrent && (
                  <div
                    className="mt-2.5 pt-2.5 border-t border-emerald-200/80 dark:border-emerald-800/60 space-y-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-[10px] lg:text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300">
                      Previous Balance Option
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIncludePreviousBalance(true)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] lg:text-xs font-bold text-left transition-all cursor-pointer flex items-center justify-between gap-1 ${
                          includePreviousBalance
                            ? 'bg-emerald-700 dark:bg-emerald-600 text-white border-emerald-700 dark:border-emerald-500 shadow-2xs'
                            : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">Carry Prev. Balance</span>
                        <span className="font-mono text-[10px] opacity-90 shrink-0">
                          {formatCurrency(carriedBalanceKinsenas)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIncludePreviousBalance(false)}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] lg:text-xs font-bold text-left transition-all cursor-pointer flex items-center justify-between gap-1 ${
                          !includePreviousBalance
                            ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-500 shadow-2xs'
                            : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="truncate">No Previous Balance</span>
                        <span className="font-mono text-[10px] opacity-90 shrink-0">{formatCurrency(0)}</span>
                      </button>
                    </div>

                    {deferredCount > 0 && (
                      <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-800/50 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] lg:text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                          <span>Deferred Bills From {currentMonthName}</span>
                          <span className="font-mono">
                            {deferredCount} item{deferredCount !== 1 ? 's' : ''} · {formatCurrency(deferredTotal)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setCarryOverDeferred(true)}
                            className={`px-2.5 py-1.5 rounded-lg border text-[11px] lg:text-xs font-bold text-left transition-all cursor-pointer flex items-center justify-between gap-1 ${
                              carryOverDeferred
                                ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                                : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            <span className="truncate">Carry Deferred Bills</span>
                            <span className="font-mono text-[10px] opacity-90 shrink-0">{deferredCount}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setCarryOverDeferred(false)}
                            className={`px-2.5 py-1.5 rounded-lg border text-[11px] lg:text-xs font-bold text-left transition-all cursor-pointer flex items-center justify-between gap-1 ${
                              !carryOverDeferred
                                ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-500 shadow-2xs'
                                : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            <span className="truncate">Leave Bills Empty</span>
                            <span className="font-mono text-[10px] opacity-90 shrink-0">0</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Option 2: Copy All from Current Month */}
            <div
              onClick={() => setCopyCurrent(true)}
              className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                copyCurrent
                  ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-500 text-blue-950 dark:text-blue-100 shadow-2xs'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-800 dark:text-slate-200'
              }`}
            >
              <input
                type="radio"
                checked={copyCurrent}
                onChange={() => setCopyCurrent(true)}
                className="mt-0.5 accent-blue-600"
              />
              <div className="text-xs lg:text-sm flex-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Copy className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
                  <span>Copy All Values from {currentMonthName}</span>
                </div>
                <div className="text-slate-500 dark:text-slate-400 mt-1 leading-relaxed text-[11px] lg:text-xs">
                  Copies standard amounts and remarks from {currentMonthName}.
                </div>
              </div>
            </div>
          </div>

          {/* Salary & Previous Balance Preview Box */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-[11px] lg:text-xs font-semibold text-slate-700 dark:text-slate-200">
              <span className="flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Salary Computation Preview (15th Kinsenas)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs lg:text-sm">
              <div>
                <label className="block text-[10px] lg:text-xs text-slate-500 dark:text-slate-400 font-semibold mb-0.5">
                  Previous Balance:
                </label>
                <div className="font-mono font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded flex items-center justify-between gap-1">
                  <span>{formatCurrency(effectiveCarriedBalanceKinsenas)}</span>
                  {!copyCurrent && !includePreviousBalance && (
                    <span className="text-[10px] font-sans font-semibold text-slate-500 dark:text-slate-400">No carryover</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[10px] lg:text-xs text-slate-500 dark:text-slate-400 font-semibold mb-0.5">
                  Manual Input Current Salary:
                </label>
                <input
                  type="number"
                  step="any"
                  value={manualSalaryKinsenas}
                  onChange={(e) => setManualSalaryKinsenas(e.target.value)}
                  placeholder="0.00"
                  className="w-full font-mono font-bold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-slate-900 dark:focus:border-emerald-500 rounded px-2 py-1 text-xs lg:text-sm focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs lg:text-sm">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Total Starting Salary:
              </span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                {formatCurrency(totalStartingSalaryKinsenas)}
              </span>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs lg:text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs lg:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 rounded-lg shadow-xs cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Create Sheet</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
