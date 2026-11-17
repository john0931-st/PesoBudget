import React, { useState, useMemo, useRef } from 'react';
import { MonthData, RowId } from '../types/budget';
import { formatPHP } from '../utils/currency';
import {
  Calculator,
  CheckCircle2,
  Clock,
  Layers,
  ExternalLink,
} from 'lucide-react';
import {
  CombinedMonthData,
  computeOverallWorkbookData,
} from '../utils/monthGrouping';
import { HistoricalProgressionChart } from './HistoricalProgressionChart';
import { useTrackpadSwipe } from '../hooks/useTrackpadSwipe';
import { useCurrency } from '../hooks/useCurrency';

interface MonthlySummaryProps {
  monthData: MonthData;
  allMonths?: Record<string, MonthData>;
  onOpenSalaryModal: () => void;
  onSelectMonth?: (monthId: string) => void;
}

export const MonthlySummary: React.FC<MonthlySummaryProps> = ({
  monthData,
  allMonths = {},
  onOpenSalaryModal,
  onSelectMonth,
}) => {
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  useCurrency();

  // Compute Overall Workbook Summary (aggregating all sheets across all months)
  const combinedMonth: CombinedMonthData = useMemo(() => {
    const validMonths = Object.keys(allMonths).length > 0 ? allMonths : { [monthData.id]: monthData };
    return computeOverallWorkbookData(validMonths);
  }, [allMonths, monthData]);

  const totalCards = 5;

  const handleNextCard = () => {
    setCurrentCardIndex((prev) => (prev + 1) % totalCards);
  };

  const handlePrevCard = () => {
    setCurrentCardIndex((prev) => (prev - 1 + totalCards) % totalCards);
  };

  // Touch / swipe gesture handlers for modern and convenient navigation
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useTrackpadSwipe({
    ref: cardContainerRef,
    onNext: handleNextCard,
    onPrev: handlePrevCard,
  });

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const diffX = touchStartX.current - e.changedTouches[0].clientX;
    const diffY = touchStartY.current - e.changedTouches[0].clientY;

    // Detect horizontal swipe (horizontal delta > 40px and greater than vertical delta)
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 40) {
      if (diffX > 0) {
        handleNextCard();
      } else {
        handlePrevCard();
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  if (!combinedMonth) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center text-slate-500 dark:text-slate-400">
        No monthly sheet data available.
      </div>
    );
  }

  // Combined Monthly Totals
  const {
    totalExpenses,
    plannedMetrobank,
    plannedQrPh,
    actualTotalWithdrawn,
    governmentSavings,
    gotymeVal,
    balanceVal,
    personalSavings,
    totalCombinedSavings,
    salaryVal,
    cutoffSummaries,
    sheets,
    displayName,
    tableTitle,
    sheetCount,
  } = combinedMonth;

  // Deferred bills list collected across all sheets
  const nextPayrollItems: { id: string; label: string; amount: number; note?: string; sheetName: string }[] = [];
  sheets.forEach((sheet) => {
    Object.keys(sheet.rows).forEach((id) => {
      const row = sheet.rows[id as RowId];
      if (row && row.remarks === 'Next Payroll') {
        const val = (row.cutoff15th?.value || 0) + (row.monthly?.value && !row.cutoff15th?.value ? row.monthly.value : 0);
        if (val > 0) {
          nextPayrollItems.push({
            id: `${sheet.id}_${id}`,
            label: row.label,
            amount: val,
            note: row.monthly?.note || row.cutoff15th?.note,
            sheetName: sheet.name,
          });
        }
      }
    });
  });

  const actualMetroCash = Math.max(0, actualTotalWithdrawn - plannedQrPh);

  // Compact layout styling
  const densityPadding = 'p-2.5 sm:p-3.5';

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col select-none space-y-1">
      {/* Top Header: Overall Summary Indicator & Adjust Salary */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 shrink-0">
        <div className="flex items-center gap-2">
          <div className="text-xs lg:text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
            Overall Summary · <span className="font-mono text-emerald-800 dark:text-emerald-400">{sheetCount} Sheets</span>
          </div>

          <button
            onClick={onOpenSalaryModal}
            className="inline-flex items-center gap-1 px-2 py-0.5 lg:px-2.5 lg:py-1 text-xs lg:text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer shadow-2xs"
          >
            <Calculator className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-slate-500 dark:text-slate-400" />
            <span>Adjust Salary</span>
          </button>
        </div>
      </div>

      {/* Modern Bullet Page Indicator (No Numbers, Clean Modern Design Just Above the Cards) */}
      <div className="flex items-center justify-center gap-1.5 py-0.5 shrink-0">
        {Array.from({ length: totalCards }).map((_, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setCurrentCardIndex(idx)}
            className={`transition-all duration-300 rounded-full focus:outline-none cursor-pointer ${
              currentCardIndex === idx
                ? 'w-7 sm:w-8 h-1.5 bg-slate-900 dark:bg-emerald-400 shadow-2xs'
                : 'w-2 h-1.5 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600'
            }`}
            title={`Card ${idx + 1}`}
            aria-label={`Go to page ${idx + 1}`}
          />
        ))}
      </div>

      {/* The Card (Fits screen height, Pages 1 & 2 internally scrollable, Pages 3+ fitted without scrollbars) */}
      <div
        ref={cardContainerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="w-full flex-1 min-h-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xs p-3 sm:p-4 lg:p-5 transition-all touch-pan-y overscroll-x-contain flex flex-col justify-between overflow-hidden"
      >
        {/* CARD 0 (PAGE 1): OBLIGATIONS & LIQUID SURPLUS - SCROLLABLE */}
        {currentCardIndex === 0 && (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-1 space-y-1.5 sm:space-y-2 lg:space-y-3 animate-in fade-in duration-150 w-full">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-1 lg:pb-2 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-xs sm:text-sm lg:text-base xl:text-lg font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                  Overall Summary - Obligations & Liquid Surplus
                </h3>
                <p className="text-[10px] lg:text-xs xl:text-sm text-slate-500 dark:text-slate-400">
                  Reconciled across {sheetCount} sheets ({sheets.map((s) => s.name).join(' + ')})
                </p>
              </div>
              <span className="font-mono text-[11px] lg:text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                {sheetCount} Sheets
              </span>
            </div>

            <div className="space-y-1 lg:space-y-2 text-xs lg:text-sm xl:text-base bg-slate-50 dark:bg-slate-800/60 p-2 sm:p-2.5 lg:p-4 rounded-xl border border-slate-200 dark:border-slate-700 font-mono my-auto">
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300 font-sans font-medium text-[10.5px] sm:text-xs lg:text-sm xl:text-base">Gross Monthly Salary:</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400 text-xs sm:text-sm lg:text-base xl:text-lg tabular-nums">
                    {formatPHP(salaryVal)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300 font-sans font-medium text-[10.5px] sm:text-xs lg:text-sm xl:text-base">• Metrobank (Withdrawn Money for Bills):</span>
                  <span className="font-semibold text-blue-700 dark:text-blue-400 tabular-nums text-[10.5px] sm:text-xs lg:text-sm xl:text-base">
                    {formatPHP(plannedMetrobank)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300 font-sans font-medium text-[10.5px] sm:text-xs lg:text-sm xl:text-base">• QR PH (Digital Payment for Lazada):</span>
                  <span className="font-semibold text-purple-700 dark:text-purple-400 tabular-nums text-[10.5px] sm:text-xs lg:text-sm xl:text-base">
                    {formatPHP(plannedQrPh)}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-0.5 lg:pt-1.5 font-medium">
                  <span className="text-slate-900 dark:text-slate-100 font-sans font-bold text-[10.5px] sm:text-xs lg:text-sm xl:text-base">Total Monthly Obligations:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm lg:text-base xl:text-lg tabular-nums">
                    {formatPHP(Math.abs(totalExpenses))}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-700 dark:text-slate-300 font-sans font-medium text-[10.5px] sm:text-xs lg:text-sm xl:text-base">Government Savings (MP2):</span>
                  <span className="font-semibold text-teal-700 dark:text-teal-400 tabular-nums text-[10.5px] sm:text-xs lg:text-sm xl:text-base">
                    {formatPHP(Math.abs(governmentSavings))}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-slate-700 dark:text-slate-300 font-sans font-medium text-[10.5px] sm:text-xs lg:text-sm xl:text-base">Personal Savings:</span>
                    <div className="text-[9.5px] lg:text-xs text-slate-500 dark:text-slate-400 font-mono">Combined: GoTyme ({formatPHP(gotymeVal)}) + Balance ({formatPHP(balanceVal)})</div>
                  </div>
                  <span className="font-semibold text-indigo-700 dark:text-indigo-400 tabular-nums text-[10.5px] sm:text-xs lg:text-sm xl:text-base">
                    {formatPHP(personalSavings)}
                  </span>
                </div>

                {/* Personal Savings Combined Stash Box */}
                <div className="bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-lg p-1.5 sm:p-2 lg:p-3 mt-0.5 space-y-0.5 lg:space-y-1">
                  <div className="flex items-center justify-between font-sans">
                    <div>
                      <span className="text-[11px] sm:text-xs lg:text-sm xl:text-base font-bold text-indigo-950 dark:text-indigo-200">
                        Personal Savings (GoTyme + Ending Balance):
                      </span>
                      <div className="text-[9.5px] lg:text-xs text-indigo-700 dark:text-indigo-300 font-mono">
                        GoTyme ({formatPHP(gotymeVal)}) + Ending Balance ({formatPHP(balanceVal)})
                      </div>
                    </div>
                    <span className="font-mono font-black text-indigo-950 dark:text-indigo-200 text-xs sm:text-sm lg:text-base xl:text-lg tabular-nums">
                      {formatPHP(personalSavings)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-0.5 lg:pt-1 border-t border-indigo-200/60 dark:border-indigo-800/60 font-sans">
                    <span className="text-[9.5px] lg:text-xs text-slate-600 dark:text-slate-300">
                      Total Savings Stash (MP2 + Personal):
                    </span>
                    <span className="font-mono font-bold text-emerald-800 dark:text-emerald-400 text-[11px] lg:text-sm tabular-nums">
                      {formatPHP(totalCombinedSavings)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-[10px] lg:text-xs xl:text-sm text-slate-400 dark:text-slate-500 text-center shrink-0 pt-1 border-t border-slate-100 dark:border-slate-800">
                All monthly obligations and liquid savings reconcile with zero variance.
              </div>
            </div>
          )}

          {/* CARD 1 (PAGE 2): 15-DAY CUTOFFS CONTRIBUTION - FITTED WHOLE, NO SCROLLBAR */}
          {currentCardIndex === 1 && (
            <div className="flex-1 flex flex-col justify-between min-h-0 overflow-y-auto overflow-x-hidden pr-0.5 space-y-1.5 sm:space-y-2 animate-in fade-in duration-150 w-full">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-1 lg:pb-2 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-xs sm:text-sm lg:text-base xl:text-lg font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                    {tableTitle} - 15-Day Cutoffs Contribution
                  </h3>
                  <p className="text-[10px] lg:text-xs xl:text-sm text-slate-500 dark:text-slate-400">
                    Table Title on both sheets: <strong className="text-slate-800 dark:text-slate-200 font-mono">{tableTitle}</strong>
                  </p>
                </div>
                <span className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400 font-mono">
                  {sheetCount} Cutoff Sheets
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 lg:gap-3 my-auto">
                {cutoffSummaries.map((cutoff, idx) => (
                  <div
                    key={cutoff.id}
                    onClick={() => onSelectMonth?.(cutoff.id)}
                    className="bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100/90 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2 sm:p-2.5 lg:p-3.5 space-y-1 lg:space-y-1.5 cursor-pointer transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] lg:text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 group-hover:bg-slate-900 dark:group-hover:bg-emerald-600 group-hover:text-white px-1.5 py-0.2 rounded transition-colors">
                          Sheet {idx + 1}
                        </span>
                        <span className="text-xs lg:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{cutoff.name}</span>
                      </div>
                      <ExternalLink className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-100 transition-colors" />
                    </div>

                    <div className="space-y-0.5 lg:space-y-1 text-[10.5px] sm:text-[11px] lg:text-xs xl:text-sm font-mono">
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Base Salary:</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatPHP(cutoff.salary)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Expenses:</span>
                        <span className="font-bold text-rose-700 dark:text-rose-400">{formatPHP(cutoff.expenses)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Gov (MP2):</span>
                        <span className="font-semibold text-teal-700 dark:text-teal-400">{formatPHP(cutoff.govSavings)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400" title="Combined GoTyme + Ending Balance">
                        <span>Personal Savings:</span>
                        <span className="font-semibold text-indigo-700 dark:text-indigo-400">{formatPHP(cutoff.personalSavings)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400 pt-0.5 border-t border-slate-200 dark:border-slate-700">
                        <span>Ending Balance:</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">{formatPHP(cutoff.endingBalance)}</span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Full Month Total Card */}
                <div className="bg-emerald-50/80 dark:bg-emerald-950/40 border-2 border-emerald-300 dark:border-emerald-700 rounded-xl p-2 sm:p-2.5 lg:p-3.5 space-y-1 lg:space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] lg:text-xs font-bold bg-emerald-600 text-white px-1.5 py-0.2 rounded uppercase">
                      Full Month Total
                    </span>
                    <span className="text-[11px] lg:text-xs font-bold text-emerald-950 dark:text-emerald-300 font-mono">
                      {sheetCount} Sheets
                    </span>
                  </div>

                  <div className="space-y-0.5 lg:space-y-1 text-[10.5px] sm:text-[11px] lg:text-xs xl:text-sm font-mono pt-0.5">
                    <div className="flex justify-between text-emerald-900 dark:text-emerald-200">
                      <span>Gross Salary:</span>
                      <span className="font-bold text-emerald-800 dark:text-emerald-400">{formatPHP(salaryVal)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-900 dark:text-emerald-200">
                      <span>Total Bills:</span>
                      <span className="font-bold text-rose-800 dark:text-rose-400">{formatPHP(Math.abs(totalExpenses))}</span>
                    </div>
                    <div className="flex justify-between text-emerald-900 dark:text-emerald-200">
                      <span>Gov MP2:</span>
                      <span className="font-bold text-teal-800 dark:text-teal-400">{formatPHP(Math.abs(governmentSavings))}</span>
                    </div>
                    <div className="flex justify-between text-emerald-900 dark:text-emerald-200" title="Combined GoTyme + Ending Balance">
                      <span>Personal Stash:</span>
                      <span className="font-bold text-indigo-800 dark:text-indigo-400">{formatPHP(personalSavings)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-900 dark:text-emerald-200 pt-0.5 border-t border-emerald-200 dark:border-emerald-800">
                      <span>Ending Carryover:</span>
                      <span className="font-black text-emerald-950 dark:text-emerald-300 text-xs sm:text-sm lg:text-base">{formatPHP(balanceVal)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-[10px] lg:text-xs xl:text-sm text-slate-400 dark:text-slate-500 text-center shrink-0 pt-1 border-t border-slate-100 dark:border-slate-800">
                15th Kinsenas and 30th Katapusan cutoff contributions combined.
              </div>
            </div>
          )}

          {/* CARD 2 (PAGE 3): BANK OUTFLOW & CASH TRACKING - FITTED WHOLE, NO SCROLLBAR */}
          {currentCardIndex === 2 && (
            <div className="flex-1 min-h-0 flex flex-col justify-between overflow-y-auto overflow-x-hidden pr-0.5 space-y-1.5 sm:space-y-2 animate-in fade-in duration-150 w-full">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-1.5 lg:pb-2 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-xs sm:text-sm lg:text-base xl:text-lg font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                    {tableTitle} - Bank Withdrawal & Cash Tracking
                  </h3>
                  <p className="text-[10px] lg:text-xs xl:text-sm text-slate-500 dark:text-slate-400">
                    Metrobank ATM physical cash vs QR PH digital payment channel for Lazada
                  </p>
                </div>
                <span className="text-[11px] lg:text-xs font-mono text-slate-500 dark:text-slate-400">Recorded in Remarks</span>
              </div>

              <div className="my-auto py-1.5">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
                  <div className="bg-slate-900 dark:bg-slate-800 border border-transparent dark:border-slate-700 text-white rounded-xl p-3 sm:p-4 lg:p-5 space-y-1 shadow-2xs">
                    <div className="text-[11px] lg:text-xs xl:text-sm text-slate-300 font-medium">Metrobank (Withdrawn Money)</div>
                    <div className="font-mono text-lg sm:text-xl lg:text-2xl xl:text-3xl font-bold text-white tabular-nums">
                      {formatPHP(actualMetroCash)}
                    </div>
                    <div className="text-[10px] lg:text-xs text-slate-400">
                      ATM cash (Planned: {formatPHP(plannedMetrobank)})
                    </div>
                  </div>

                  <div className="bg-slate-900 dark:bg-slate-800 border border-transparent dark:border-slate-700 text-white rounded-xl p-3 sm:p-4 lg:p-5 space-y-1 shadow-2xs">
                    <div className="text-[11px] lg:text-xs xl:text-sm text-slate-300 font-medium">QR PH (Digital Payment)</div>
                    <div className="font-mono text-lg sm:text-xl lg:text-2xl xl:text-3xl font-bold text-purple-300 tabular-nums">
                      {formatPHP(plannedQrPh)}
                    </div>
                    <div className="text-[10px] lg:text-xs text-slate-400">
                      Payment for Lazada (Planned: {formatPHP(plannedQrPh)})
                    </div>
                  </div>

                  <div className="bg-slate-900 dark:bg-slate-800 border border-transparent dark:border-slate-700 text-white rounded-xl p-3 sm:p-4 lg:p-5 space-y-1 shadow-2xs">
                    <div className="text-[11px] lg:text-xs xl:text-sm text-slate-300 font-medium">Total Actual Outflow</div>
                    <div className="font-mono text-lg sm:text-xl lg:text-2xl xl:text-3xl font-bold text-emerald-400 tabular-nums">
                      {formatPHP(actualTotalWithdrawn)}
                    </div>
                    <div className="text-[10px] lg:text-xs text-slate-400">
                      ATM Cash + QR PH (Auto-sum)
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 lg:p-4 text-xs lg:text-sm text-slate-600 dark:text-slate-300 space-y-0.5 shrink-0 mt-auto">
                <strong className="text-slate-800 dark:text-slate-100 text-[11px] lg:text-sm">Payment Outflow Clarity:</strong>
                <p className="text-[10px] lg:text-xs xl:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  Metrobank is the ATM withdrawal to pay physical bills. QR PH is the direct digital payment method for Lazada. Together, they represent the total capital outflow with zero double-counting.
                </p>
              </div>
            </div>
          )}

          {/* CARD 3 (PAGE 4): DEFERRED BILLS (NEXT PAYROLL REMARKS) - FITTED, NO SCROLLBAR */}
          {currentCardIndex === 3 && (
            <div className="flex-1 min-h-0 flex flex-col justify-between overflow-y-auto overflow-x-hidden pr-0.5 animate-in fade-in duration-150 w-full">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-1.5 lg:pb-2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-amber-600 dark:text-amber-400" />
                  <h3 className="text-xs sm:text-sm lg:text-base xl:text-lg font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                    {tableTitle} - Deferred Items (Next Payroll Remarks)
                  </h3>
                </div>
                <span className="text-[10px] lg:text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-transparent dark:border-amber-800/60 px-2 py-0.5 rounded font-mono">
                  {nextPayrollItems.length} Deferred Bill{nextPayrollItems.length !== 1 ? 's' : ''}
                </span>
              </div>

              {nextPayrollItems.length === 0 ? (
                <div className="my-auto p-6 lg:p-8 bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-center text-xs lg:text-sm text-slate-500 dark:text-slate-400 space-y-1.5 flex flex-col items-center justify-center">
                  <CheckCircle2 className="w-9 h-9 lg:w-11 lg:h-11 text-emerald-600 dark:text-emerald-400" />
                  <div className="font-bold text-slate-800 dark:text-slate-100 text-sm lg:text-base">All Bills Fully Settled (OK)</div>
                  <div className="text-slate-500 dark:text-slate-400 max-w-sm lg:max-w-md mx-auto text-[11px] lg:text-xs xl:text-sm leading-relaxed">
                    No expenses are deferred to next payroll. All obligations are cleared.
                  </div>
                </div>
              ) : (
                <div className="my-auto grid grid-cols-1 sm:grid-cols-2 gap-2 lg:gap-3">
                  {nextPayrollItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2 lg:p-3 text-xs lg:text-sm bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100/90 dark:hover:bg-slate-800 transition-colors"
                    >
                      <div className="truncate mr-2">
                        <div className="font-bold text-slate-900 dark:text-slate-100 truncate text-[11px] lg:text-sm">{item.label}</div>
                        <div className="text-[9px] lg:text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                          Sheet: {item.sheetName} {item.note ? `· ${item.note}` : ''}
                        </div>
                      </div>

                      <div className="text-right font-mono shrink-0">
                        <div className="font-bold text-amber-900 dark:text-amber-300 text-xs lg:text-sm tabular-nums">
                          {formatPHP(item.amount)}
                        </div>
                        <span className="text-[9px] lg:text-[11px] text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 px-1 py-0.2 rounded font-sans font-semibold">
                          Next Payroll
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-[10px] lg:text-xs xl:text-sm text-slate-400 dark:text-slate-500 text-center shrink-0 pt-1 border-t border-slate-100 dark:border-slate-800">
                Deferred expenses carry forward to preserve liquid cash buffer for current bills.
              </div>
            </div>
          )}

          {/* CARD 4 (PAGE 5): HISTORICAL CALENDAR MONTHS PROGRESSION (JANUARY TO DECEMBER) */}
          {currentCardIndex === 4 && (
            <div className="flex-1 min-h-0 flex flex-col justify-between overflow-y-auto overflow-x-hidden pr-0.5 animate-in fade-in duration-150 w-full">
              <HistoricalProgressionChart
                allMonths={allMonths}
                activeMonthData={monthData}
                onSelectMonth={onSelectMonth}
              />
            </div>
          )}
        </div>
    </div>
  );
};
