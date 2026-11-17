import React, { useState } from 'react';
import { X, Check, Calculator, ArrowRight } from 'lucide-react';
import { SalaryBreakdown } from '../types/budget';
import { formatPHP } from '../utils/currency';
import { useCurrency } from '../hooks/useCurrency';

interface SalaryConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  monthlySalary: SalaryBreakdown;
  cutoff15thSalary: SalaryBreakdown;
  onSave: (monthly: SalaryBreakdown, cutoff15th: SalaryBreakdown) => void;
}

export const SalaryConfigModal: React.FC<SalaryConfigModalProps> = ({
  isOpen,
  onClose,
  monthlySalary,
  cutoff15thSalary,
  onSave,
}) => {
  const { currency } = useCurrency();
  const sym = currency.symbol.trim();
  const [monthlyBase, setMonthlyBase] = useState(monthlySalary.baseSalary.toString());
  const [monthlyPrev, setMonthlyPrev] = useState(monthlySalary.previousBalance.toString());
  const [monthlyNote, setMonthlyNote] = useState(monthlySalary.note || '');

  const [cutoffBase, setCutoffBase] = useState(cutoff15thSalary.baseSalary.toString());
  const [cutoffPrev, setCutoffPrev] = useState(cutoff15thSalary.previousBalance.toString());
  const [cutoffNote, setCutoffNote] = useState(cutoff15thSalary.note || '');

  if (!isOpen) return null;

  const parsedMonthlyBase = parseFloat(monthlyBase) || 0;
  const parsedMonthlyPrev = parseFloat(monthlyPrev) || 0;
  const totalMonthlySalary = parsedMonthlyBase + parsedMonthlyPrev;

  const parsedCutoffBase = parseFloat(cutoffBase) || 0;
  const parsedCutoffPrev = parseFloat(cutoffPrev) || 0;
  const totalCutoffSalary = parsedCutoffBase + parsedCutoffPrev;

  const handleApply = () => {
    onSave(
      {
        baseSalary: parsedMonthlyBase,
        previousBalance: parsedMonthlyPrev,
        note: monthlyNote.trim(),
      },
      {
        baseSalary: parsedCutoffBase,
        previousBalance: parsedCutoffPrev,
        note: cutoffNote.trim(),
      }
    );
    onClose();
  };

  return (
    <div className="pb-modal-backdrop z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/70">
      <div
        className="pb-modal-card w-full max-w-xl lg:max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-400 flex items-center justify-center">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm lg:text-base font-bold text-slate-900 dark:text-slate-100">Salary & Previous Balance Computation</h2>
              <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400">
                Formula: Salary = Base Salary + Carried Previous Balance
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 text-xs lg:text-sm overflow-y-auto overscroll-contain flex-1 min-h-0">
          {/* Monthly Section */}
          <div className="bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-md p-3.5 lg:p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
              <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs lg:text-sm uppercase tracking-wide">
                Monthly Target Salary
              </span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-sm lg:text-base">
                = {formatPHP(totalMonthlySalary)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-300 mb-1 font-medium">Base Monthly Salary ({sym})</label>
                <input
                  type="number"
                  value={monthlyBase}
                  onChange={(e) => setMonthlyBase(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-300 mb-1 font-medium">Previous Balance Carried ({sym})</label>
                <input
                  type="number"
                  value={monthlyPrev}
                  onChange={(e) => setMonthlyPrev(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-300 mb-1">Notes / Description (Optional)</label>
              <input
                type="text"
                value={monthlyNote}
                onChange={(e) => setMonthlyNote(e.target.value)}
                className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="e.g. Net monthly pay after tax + savings carryover"
              />
            </div>
          </div>

          {/* 15th Cutoff Section */}
          <div className="bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-md p-3.5 lg:p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
              <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs lg:text-sm uppercase tracking-wide">
                15th Cutoff Payroll
              </span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-sm lg:text-base">
                = {formatPHP(totalCutoffSalary)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-300 mb-1 font-medium">15th Cutoff Base Pay ({sym})</label>
                <input
                  type="number"
                  value={cutoffBase}
                  onChange={(e) => setCutoffBase(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-300 mb-1 font-medium">15th Previous Balance ({sym})</label>
                <input
                  type="number"
                  value={cutoffPrev}
                  onChange={(e) => setCutoffPrev(e.target.value)}
                  className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-300 mb-1">Notes / Description (Optional)</label>
              <input
                type="text"
                value={cutoffNote}
                onChange={(e) => setCutoffNote(e.target.value)}
                className="w-full bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="e.g. Mid-month 15th payout"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs lg:text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 rounded cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs lg:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded shadow-xs cursor-pointer"
          >
            <Check className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            Save & Recalculate
          </button>
        </div>
      </div>
    </div>
  );
};
