import React, { useState, useEffect, useMemo } from 'react';
import { RowId, CellColumn, MonthData } from '../types/budget';
import { evaluateFormulaInput } from '../utils/formula';
import { formatPHP, parseNumericString } from '../utils/currency';
import { isSharedPublicDeployment } from '../utils/storage';
import {
  FunctionSquare,
  X,
  Check,
  RotateCcw,
  AlertCircle,
  HelpCircle,
  Calculator,
  ExternalLink,
} from 'lucide-react';

interface EditFormulaModalProps {
  isOpen: boolean;
  onClose: () => void;
  rowId: RowId;
  rowLabel: string;
  column: CellColumn;
  monthData: MonthData;
  onApplyFormula: (rowId: RowId, column: 'monthly' | 'cutoff15th', newRawInput: string) => void;
  onOpenSalaryModal?: () => void;
}

export const EditFormulaModal: React.FC<EditFormulaModalProps> = ({
  isOpen,
  onClose,
  rowId,
  rowLabel,
  column,
  monthData,
  onApplyFormula,
  onOpenSalaryModal,
}) => {
  const targetCol = column === 'monthly' ? 'monthly' : 'cutoff15th';
  const row = monthData.rows[rowId];
  const currentCell = row?.[targetCol];

  // Helper values for formula breakdowns
  const houseVal = monthData.rows['rent']?.[targetCol]?.value || monthData.rows['rent']?.monthly?.value || 0;
  const waterVal = monthData.rows['water_bill']?.[targetCol]?.value || monthData.rows['water_bill']?.monthly?.value || 0;
  const gasVal = monthData.rows['gas']?.[targetCol]?.value || monthData.rows['gas']?.monthly?.value || 0;
  const mealVal = monthData.rows['meal']?.[targetCol]?.value || monthData.rows['meal']?.monthly?.value || 0;
  const othersVal = monthData.rows['others']?.[targetCol]?.value || monthData.rows['others']?.monthly?.value || 0;
  const lazadaVal = monthData.rows['lazada']?.[targetCol]?.value || monthData.rows['lazada']?.monthly?.value || 0;

  const qrVal = monthData.rows['qr_ph']?.[targetCol]?.value || monthData.rows['qr_ph']?.monthly?.value || 0;
  const metroVal = monthData.rows['metrobank']?.[targetCol]?.value || monthData.rows['metrobank']?.monthly?.value || 0;
  const totalVal = monthData.rows['total']?.[targetCol]?.value || monthData.rows['total']?.monthly?.value || 0;
  const salaryVal = monthData.rows['salary']?.[targetCol]?.value || monthData.rows['salary']?.monthly?.value || 0;
  const mp2Val = monthData.rows['mp2']?.[targetCol]?.value || monthData.rows['mp2']?.monthly?.value || 0;
  const gotymeVal = monthData.rows['gotyme']?.[targetCol]?.value || monthData.rows['gotyme']?.monthly?.value || 0;

  const baseSal = monthData.salaryBreakdown?.[targetCol]?.baseSalary || 0;
  const prevBal = monthData.salaryBreakdown?.[targetCol]?.previousBalance || 0;

  // Determine standard default formula string for this row
  const defaultFormulaString = useMemo(() => {
    switch (rowId) {
      case 'qr_ph':
        return lazadaVal > 0 ? `=${lazadaVal.toFixed(2)}` : isSharedPublicDeployment() ? '=0' : '=1015.08';
      case 'metrobank':
        return `=${houseVal} + ${waterVal} + ${gasVal} + ${mealVal} + ${othersVal}`;
      case 'total':
        return `=${qrVal.toFixed(2)} + ${metroVal.toFixed(2)}`;
      case 'salary':
        return `=${baseSal.toFixed(2)} + ${prevBal.toFixed(2)}`;
      case 'balance':
        return `=(${salaryVal.toFixed(2)} - ${totalVal.toFixed(2)}) - (${mp2Val.toFixed(2)} + ${gotymeVal.toFixed(2)})`;
      default:
        return currentCell?.rawInput || '0';
    }
  }, [rowId, lazadaVal, houseVal, waterVal, gasVal, mealVal, othersVal, qrVal, metroVal, totalVal, salaryVal, baseSal, prevBal, mp2Val, gotymeVal, currentCell]);

  const [formulaInput, setFormulaInput] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const existing = currentCell?.formula || (currentCell?.rawInput?.startsWith('=') ? currentCell.rawInput : defaultFormulaString);
      setFormulaInput(existing);
    }
  }, [isOpen, currentCell, defaultFormulaString]);

  if (!isOpen) return null;

  // Real-time evaluation of the user's formula
  const evalResult = evaluateFormulaInput(formulaInput);

  const handleApply = () => {
    onApplyFormula(rowId, targetCol, formulaInput.trim());
    onClose();
  };

  const handleResetToDefault = () => {
    setFormulaInput(defaultFormulaString);
  };

  return (
    <div
      className="pb-modal-backdrop z-50 flex items-center justify-center animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-950/70 backdrop-blur-xs" />

      {/* Modal Dialog */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="pb-modal-card relative z-10 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg lg:max-w-xl p-5 lg:p-6 text-slate-900 dark:text-slate-100 font-sans animate-in zoom-in-95 duration-150 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-400 flex items-center justify-center font-bold text-sm shadow-2xs">
              <span className="italic font-serif text-base">fx</span>
            </div>
            <div>
              <h2 className="text-base lg:text-lg font-extrabold text-slate-900 dark:text-slate-100 leading-tight">
                Edit Formula: {rowLabel}
              </h2>
              <p className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 font-mono">
                Column: {targetCol === 'monthly' ? 'Monthly' : 'Kinsenas (15th)'} · Sheet: {monthData.name}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto py-3.5 space-y-3.5 pr-1 text-xs lg:text-sm">
          {/* Row-Specific Formula Breakdown Card */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-700 rounded-xl p-3 lg:p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[11px] lg:text-xs text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                Standard Spreadsheet Logic
              </span>
              <span className="font-mono text-[10px] lg:text-xs text-purple-700 dark:text-purple-300 font-bold bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-700/70">
                {rowId.toUpperCase()}
              </span>
            </div>

            {rowId === 'qr_ph' && (
              <div className="space-y-1 text-slate-600 dark:text-slate-300">
                <p className="text-[11px] lg:text-xs leading-relaxed">
                  QR PH allocates digital funds to pay for Lazada orders directly.
                </p>
                <div className="flex justify-between items-center font-mono pt-1 text-[11px] lg:text-xs border-t border-slate-200 dark:border-slate-700">
                  <span>Lazada Bill Amount:</span>
                  <strong className="text-purple-700 dark:text-purple-400">{formatPHP(lazadaVal)}</strong>
                </div>
              </div>
            )}

            {rowId === 'metrobank' && (
              <div className="space-y-1 text-slate-600 dark:text-slate-300">
                <p className="text-[11px] lg:text-xs leading-relaxed">
                  Metrobank is the auto-sum of physical ATM cash expenses (excluding Lazada):
                </p>
                <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px] lg:text-xs pt-1 border-t border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between">
                    <span>House / Rent:</span>
                    <span className="font-semibold">{formatPHP(houseVal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Water Bill:</span>
                    <span className="font-semibold">{formatPHP(waterVal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Gas:</span>
                    <span className="font-semibold">{formatPHP(gasVal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Meal:</span>
                    <span className="font-semibold">{formatPHP(mealVal)}</span>
                  </div>
                  <div className="flex justify-between col-span-2 pt-0.5 border-t border-slate-100 dark:border-slate-700/60">
                    <span>Others:</span>
                    <span className="font-semibold">{formatPHP(othersVal)}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center font-mono pt-1 border-t border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold">
                  <span>Standard Auto-Sum:</span>
                  <span className="text-blue-700 dark:text-blue-400">{formatPHP(metroVal)}</span>
                </div>
              </div>
            )}

            {rowId === 'total' && (
              <div className="space-y-1 text-slate-600 dark:text-slate-300">
                <p className="text-[11px] lg:text-xs leading-relaxed">
                  Total is the combined sum of QR PH (digital payment) and Metrobank (ATM cash):
                </p>
                <div className="space-y-0.5 font-mono text-[11px] lg:text-xs pt-1 border-t border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between">
                    <span>QR PH (Lazada):</span>
                    <span className="font-semibold">{formatPHP(qrVal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Metrobank (Cash):</span>
                    <span className="font-semibold">{formatPHP(metroVal)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold">
                    <span>Total Obligations:</span>
                    <span className="text-cyan-700 dark:text-cyan-400">{formatPHP(totalVal)}</span>
                  </div>
                </div>
              </div>
            )}

            {rowId === 'salary' && (
              <div className="space-y-1.5 text-slate-600 dark:text-slate-300">
                <p className="text-[11px] lg:text-xs leading-relaxed">
                  Salary is your take-home base pay plus carried balance from the previous sheet:
                </p>
                <div className="space-y-0.5 font-mono text-[11px] lg:text-xs pt-1 border-t border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between">
                    <span>Base Salary:</span>
                    <span className="font-semibold">{formatPHP(baseSal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Previous Sheet Balance:</span>
                    <span className={prevBal >= 0 ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'font-semibold text-rose-700 dark:text-rose-400'}>
                      {formatPHP(prevBal)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold">
                    <span>Total Effective Salary:</span>
                    <span className="text-rose-700 dark:text-rose-400">{formatPHP(salaryVal)}</span>
                  </div>
                </div>

                {onOpenSalaryModal && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSalaryModal();
                    }}
                    className="w-full mt-1 inline-flex items-center justify-center gap-1.5 py-1.5 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-950/70 border border-rose-200 dark:border-rose-800 rounded-lg text-rose-800 dark:text-rose-300 font-semibold text-[11px] lg:text-xs transition-colors cursor-pointer"
                  >
                    <Calculator className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    <span>Open Base Salary & Previous Balance Modal</span>
                  </button>
                )}
              </div>
            )}

            {rowId === 'balance' && (
              <div className="space-y-1 text-slate-600 dark:text-slate-300">
                <p className="text-[11px] lg:text-xs leading-relaxed">
                  Original spreadsheet formula: <strong>(Salary - Total) - (MP2 + Gotyme)</strong>
                </p>
                <div className="space-y-0.5 font-mono text-[11px] lg:text-xs pt-1 border-t border-slate-200 dark:border-slate-700">
                  <div className="flex justify-between">
                    <span>1. Salary:</span>
                    <span className="font-semibold">{formatPHP(salaryVal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>2. Less Total (QR PH + Metrobank):</span>
                    <span className="font-semibold text-rose-700 dark:text-rose-400">-{formatPHP(totalVal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400 dark:text-slate-500 pl-2">
                    <span>↳ Net before savings:</span>
                    <span>{formatPHP(salaryVal - totalVal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>3. Less MP2 Government Savings:</span>
                    <span className="font-semibold text-amber-700 dark:text-amber-400">-{formatPHP(mp2Val)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>4. Less GoTyme Personal Savings:</span>
                    <span className="font-semibold text-indigo-700 dark:text-indigo-400">-{formatPHP(gotymeVal)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 font-bold">
                    <span>Final Ending Balance:</span>
                    <span className={(monthData.rows['balance']?.[targetCol]?.value || 0) >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}>
                      {formatPHP(monthData.rows['balance']?.[targetCol]?.value || 0)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Formula Input Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-xs lg:text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <span>Formula Expression</span>
                <span className="text-[10px] lg:text-xs text-slate-400 dark:text-slate-500 font-normal">(Starts with =)</span>
              </label>

              <button
                type="button"
                onClick={handleResetToDefault}
                className="inline-flex items-center gap-1 text-[11px] lg:text-xs text-purple-700 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 font-semibold cursor-pointer"
                title="Reset to default calculation formula"
              >
                <RotateCcw className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                <span>Reset to Default</span>
              </button>
            </div>

            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 font-serif italic font-bold text-slate-400 dark:text-slate-500 text-sm select-none">
                fx
              </div>
              <input
                type="text"
                value={formulaInput}
                onChange={(e) => setFormulaInput(e.target.value)}
                placeholder="=Salary - Total - (MP2 + Gotyme)"
                className="w-full bg-slate-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-950 border-2 border-purple-300 dark:border-purple-700 focus:border-purple-600 dark:focus:border-purple-400 rounded-xl pl-9 pr-24 py-2 font-mono text-xs lg:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none shadow-2xs transition-all"
                autoFocus
              />

              {/* Real-time Calculated Result Badge */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <span className={`font-mono text-[11px] lg:text-xs font-bold px-2 py-0.5 rounded border tabular-nums ${
                  evalResult.isValid
                    ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                    : 'bg-rose-50 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-700'
                }`}>
                  = {formatPHP(evalResult.value)}
                </span>
              </div>
            </div>

            {/* Error banner if formula has invalid syntax */}
            {!evalResult.isValid && (
              <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-300 text-[11px] lg:text-xs bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg p-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{evalResult.errorMessage || 'Invalid formula expression'}</span>
              </div>
            )}
          </div>

          {/* Quick Preset Buttons / Chips */}
          <div className="space-y-1 pt-1">
            <span className="text-[10px] lg:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Quick Preset Formulas:
            </span>

            <div className="flex flex-wrap gap-1.5">
              {rowId === 'balance' && (
                <>
                  <button
                    type="button"
                    onClick={() => setFormulaInput(`=(${salaryVal.toFixed(2)} - ${totalVal.toFixed(2)}) - (${mp2Val.toFixed(2)} + ${gotymeVal.toFixed(2)})`)}
                    className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300/80 dark:border-slate-700 rounded-lg text-[10.5px] lg:text-xs font-mono text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                  >
                    (Salary - Total) - (MP2 + Gotyme)
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormulaInput(`=${salaryVal.toFixed(2)} - ${totalVal.toFixed(2)}`)}
                    className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300/80 dark:border-slate-700 rounded-lg text-[10.5px] lg:text-xs font-mono text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                  >
                    Salary - Total
                  </button>
                </>
              )}

              {rowId === 'total' && (
                <button
                  type="button"
                  onClick={() => setFormulaInput(`=${qrVal.toFixed(2)} + ${metroVal.toFixed(2)}`)}
                  className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300/80 dark:border-slate-700 rounded-lg text-[10.5px] lg:text-xs font-mono text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                >
                  QR PH + Metrobank
                </button>
              )}

              {rowId === 'metrobank' && (
                <button
                  type="button"
                  onClick={() => setFormulaInput(`=${houseVal} + ${waterVal} + ${gasVal} + ${mealVal} + ${othersVal}`)}
                  className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300/80 dark:border-slate-700 rounded-lg text-[10.5px] lg:text-xs font-mono text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                >
                  House + Water + Gas + Meal + Others
                </button>
              )}

              {rowId === 'qr_ph' && (
                <button
                  type="button"
                  onClick={() => setFormulaInput(`=${lazadaVal.toFixed(2)}`)}
                  className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300/80 dark:border-slate-700 rounded-lg text-[10.5px] lg:text-xs font-mono text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                >
                  =Lazada ({formatPHP(lazadaVal)})
                </button>
              )}

              {rowId === 'salary' && (
                <button
                  type="button"
                  onClick={() => setFormulaInput(`=${baseSal.toFixed(2)} + ${prevBal.toFixed(2)}`)}
                  className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300/80 dark:border-slate-700 rounded-lg text-[10.5px] lg:text-xs font-mono text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
                >
                  Base + Previous Balance
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs lg:text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={!evalResult.isValid}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs lg:text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 active:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors cursor-pointer shadow-md"
          >
            <Check className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Apply Formula</span>
          </button>
        </div>
      </div>
    </div>
  );
};
