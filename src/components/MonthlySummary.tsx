import React, { useState, useMemo, useRef } from 'react';
import { MonthData, RowId } from '../types/budget';
import { formatPHP } from '../utils/currency';
import {
  Calculator,
  CheckCircle2,
  Clock,
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

  const combinedMonth: CombinedMonthData = useMemo(() => {
    const validMonths = Object.keys(allMonths).length > 0 ? allMonths : { [monthData.id]: monthData };
    return computeOverallWorkbookData(validMonths, monthData);
  }, [allMonths, monthData]);

  const totalCards = 5;

  const handleNextCard = () => {
    setCurrentCardIndex((prev) => (prev + 1) % totalCards);
  };

  const handlePrevCard = () => {
    setCurrentCardIndex((prev) => (prev - 1 + totalCards) % totalCards);
  };

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

  const {
    totalExpenses,
    plannedMetrobank,
    plannedQrPh,
    actualTotalWithdrawn,
    governmentSavings,
    gotymeVal,
    balanceVal,
    salaryVal,
    cutoffSummaries,
    sheets,
    tableTitle,
    sheetCount,
    rowLabels,
  } = combinedMonth;

  const metroLabel = rowLabels.metrobank;
  const qrLabel = rowLabels.qr_ph;
  const mp2Label = rowLabels.mp2;
  const gotymeLabel = rowLabels.gotyme;
  const salaryLabel = rowLabels.salary;
  const balanceLabel = rowLabels.balance;
  const lazadaLabel = rowLabels.lazada;

  const nextPayrollItems: { id: string; label: string; amount: number; note?: string; sheetName: string }[] = [];
  sheets.forEach((sheet) => {
    Object.keys(sheet.rows).forEach((id) => {
      const row = sheet.rows[id as RowId];
      if (row && (row.remarks === 'Next Payroll' || row.remarks === 'Deferred')) {
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
            <span>Adjust {salaryLabel}</span>
          </button>
        </div>
      </div>

      {/* Modern Bullet Page Indicator */}
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

      {/* Card Container */}
      <div
        ref={cardContainerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="w-full flex-1 min-h-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xs p-3 sm:p-4 lg:p-5 transition-all touch-pan-y overscroll-x-contain flex flex-col justify-between overflow-hidden"
      >
        {/* CARD 0 (PAGE 1): OBLIGATIONS & LIQUID SURPLUS */}
        {currentCardIndex === 0 && (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-1 space-y-1.5 sm:space-y-2 lg:space-y-3 animate-in fade-in duration-150 w-full">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-1.5 lg:pb-2 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm sm:text-base lg:text-lg font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                  Overall Summary - Obligations & Liquid Surplus
                </h3>
                <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400">
                  Reconciled across {sheetCount} sheets ({sheets.map((s) => s.name).join(' + ')})
                </p>
              </div>
              <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-md">
                {sheetCount} Sheets
              </span>
            </div>

            <div className="space-y-1.5 lg:space-y-2.5 text-xs sm:text-[13px] lg:text-sm xl:text-base bg-slate-50 dark:bg-slate-800/60 p-2.5 sm:p-3.5 lg:p-4 rounded-xl border border-slate-200 dark:border-slate-700 font-mono my-auto">
              <div className="flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-sans font-medium text-xs sm:text-[13px] lg:text-sm xl:text-base">Gross Monthly {salaryLabel}:</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400 text-xs sm:text-sm lg:text-base xl:text-lg tabular-nums">
                  {formatPHP(salaryVal)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-sans font-medium text-xs sm:text-[13px] lg:text-sm xl:text-base">• {metroLabel} (Withdrawn Money for Bills):</span>
                <span className="font-semibold text-blue-700 dark:text-blue-400 tabular-nums text-xs sm:text-[13px] lg:text-sm xl:text-base">
                  {formatPHP(plannedMetrobank)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-sans font-medium text-xs sm:text-[13px] lg:text-sm xl:text-base">• {qrLabel} (Digital Payment for {lazadaLabel}):</span>
                <span className="font-semibold text-purple-700 dark:text-purple-400 tabular-nums text-xs sm:text-[13px] lg:text-sm xl:text-base">
                  {formatPHP(plannedQrPh)}
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-700 pt-1 lg:pt-1.5 font-medium">
                <span className="text-slate-900 dark:text-slate-100 font-sans font-bold text-xs sm:text-[13px] lg:text-sm xl:text-base">Total Monthly Obligations:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm lg:text-base xl:text-lg tabular-nums">
                  {formatPHP(Math.abs(totalExpenses))}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-slate-700 dark:text-slate-300 font-sans font-medium text-xs sm:text-[13px] lg:text-sm xl:text-base">
                    {mp2Label} <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">(Locked)</span>:
                  </span>
                  <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono">Long-term non-withdrawable government savings</div>
                </div>
                <span className="font-semibold text-amber-700 dark:text-amber-400 tabular-nums text-xs sm:text-[13px] lg:text-sm xl:text-base">
                  {formatPHP(Math.abs(governmentSavings))}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-slate-700 dark:text-slate-300 font-sans font-medium text-xs sm:text-[13px] lg:text-sm xl:text-base">
                    {gotymeLabel} <span className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold">(Withdrawable)</span>:
                  </span>
                  <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono">Accessible liquid savings stash</div>
                </div>
                <span className="font-semibold text-teal-700 dark:text-teal-400 tabular-nums text-xs sm:text-[13px] lg:text-sm xl:text-base">
                  {formatPHP(gotymeVal)}
                </span>
              </div>

              <div className="bg-emerald-50/80 dark:bg-emerald-950/45 border border-emerald-200 dark:border-emerald-800 rounded-lg p-2 sm:p-2.5 lg:p-3 mt-1 space-y-1">
                <div className="flex items-center justify-between font-sans">
                  <div>
                    <span className="text-xs sm:text-[13px] lg:text-sm xl:text-base font-bold text-emerald-950 dark:text-emerald-200">
                      Ending Liquid {balanceLabel} (Net Surplus):
                    </span>
                    <div className="text-[11px] sm:text-xs text-emerald-700 dark:text-emerald-300 font-mono">
                      ({salaryLabel} - Total Bills) - ({mp2Label} + {gotymeLabel})
                    </div>
                  </div>
                  <span className="font-mono font-black text-emerald-900 dark:text-emerald-300 text-xs sm:text-sm lg:text-base xl:text-lg tabular-nums">
                    {formatPHP(balanceVal)}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-xs lg:text-[13px] text-slate-400 dark:text-slate-500 text-center shrink-0 pt-1.5 border-t border-slate-100 dark:border-slate-800">
              All monthly obligations and liquid savings reconcile with zero variance.
            </div>
          </div>
        )}

        {/* CARD 1 (PAGE 2): 15-DAY CUTOFFS CONTRIBUTION */}
        {currentCardIndex === 1 && (
          <div className="flex-1 flex flex-col justify-between min-h-0 overflow-y-auto overflow-x-hidden pr-0.5 space-y-1.5 sm:space-y-2 animate-in fade-in duration-150 w-full">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-1.5 lg:pb-2 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm sm:text-base lg:text-lg font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                  {tableTitle} - 15-Day Cutoffs Contribution
                </h3>
                <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400">
                  Table Title on both sheets: <strong className="text-slate-800 dark:text-slate-200 font-mono">{tableTitle}</strong>
                </p>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {sheetCount} Cutoff Sheets
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 lg:gap-3 my-auto">
              {cutoffSummaries.map((cutoff, idx) => (
                <div
                  key={cutoff.id}
                  onClick={() => onSelectMonth?.(cutoff.id)}
                  className="bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100/90 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 sm:p-3 lg:p-3.5 space-y-1.5 cursor-pointer transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] lg:text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 group-hover:bg-slate-900 dark:group-hover:bg-emerald-600 group-hover:text-white px-2 py-0.5 rounded transition-colors">
                        Sheet {idx + 1}
                      </span>
                      <span className="text-xs sm:text-[13px] lg:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{cutoff.name}</span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-100 transition-colors" />
                  </div>

                  <div className="space-y-1 text-xs sm:text-[13px] lg:text-sm font-mono">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>{salaryLabel}:</span>
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatPHP(cutoff.salary)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>Expenses:</span>
                      <span className="font-bold text-rose-700 dark:text-rose-400">{formatPHP(cutoff.expenses)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>{mp2Label} (Locked):</span>
                      <span className="font-semibold text-amber-700 dark:text-amber-400">{formatPHP(cutoff.govSavings)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400">
                      <span>{gotymeLabel} (Withdrawable):</span>
                      <span className="font-semibold text-teal-700 dark:text-teal-400">
                        {formatPHP(Math.max(0, cutoff.personalSavings - cutoff.endingBalance))}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-700">
                      <span>Ending {balanceLabel}:</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">{formatPHP(cutoff.endingBalance)}</span>
                    </div>
                  </div>
                </div>
              ))}

              <div className="bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl p-2.5 sm:p-3 lg:p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] lg:text-xs font-bold bg-emerald-600 text-white px-2 py-0.5 rounded uppercase">
                    Full Month Total
                  </span>
                  <span className="text-xs font-bold text-emerald-950 dark:text-emerald-300 font-mono">
                    {sheetCount} Sheets
                  </span>
                </div>

                <div className="space-y-1 text-xs sm:text-[13px] lg:text-sm font-mono pt-0.5">
                  <div className="flex justify-between text-emerald-900 dark:text-emerald-200">
                    <span>Gross {salaryLabel}:</span>
                    <span className="font-bold text-emerald-800 dark:text-emerald-400">{formatPHP(salaryVal)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-900 dark:text-emerald-200">
                    <span>Total Bills:</span>
                    <span className="font-bold text-rose-800 dark:text-rose-400">{formatPHP(Math.abs(totalExpenses))}</span>
                  </div>
                  <div className="flex justify-between text-emerald-900 dark:text-emerald-200">
                    <span>{mp2Label} (Locked):</span>
                    <span className="font-bold text-amber-800 dark:text-amber-400">{formatPHP(Math.abs(governmentSavings))}</span>
                  </div>
                  <div className="flex justify-between text-emerald-900 dark:text-emerald-200">
                    <span>{gotymeLabel} (Withdrawable):</span>
                    <span className="font-bold text-teal-800 dark:text-teal-400">{formatPHP(gotymeVal)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-900 dark:text-emerald-200 pt-1 border-t border-emerald-200 dark:border-emerald-800">
                    <span>Ending {balanceLabel}:</span>
                    <span className="font-black text-emerald-950 dark:text-emerald-300 text-xs sm:text-sm lg:text-base">{formatPHP(balanceVal)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-xs lg:text-[13px] text-slate-400 dark:text-slate-500 text-center shrink-0 pt-1.5 border-t border-slate-100 dark:border-slate-800">
              15th Kinsenas and 30th Katapusan cutoff contributions combined.
            </div>
          </div>
        )}

        {/* CARD 2 (PAGE 3): BANK OUTFLOW & CASH TRACKING */}
        {currentCardIndex === 2 && (
          <div className="flex-1 min-h-0 flex flex-col justify-between overflow-y-auto overflow-x-hidden pr-0.5 space-y-1.5 sm:space-y-2 animate-in fade-in duration-150 w-full">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-1.5 lg:pb-2 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm sm:text-base lg:text-lg font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                  {tableTitle} - Bank Withdrawal & Cash Tracking
                </h3>
                <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400">
                  {metroLabel} ATM physical cash vs {qrLabel} digital payment channel for {lazadaLabel}
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">Recorded in Remarks</span>
            </div>

            <div className="my-auto py-1.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 lg:gap-4">
                <div className="bg-slate-900 dark:bg-slate-800 border border-transparent dark:border-slate-700 text-white rounded-xl p-3.5 sm:p-4 lg:p-5 space-y-1 shadow-2xs">
                  <div className="text-xs lg:text-sm text-slate-300 font-medium">{metroLabel} (Withdrawn Money)</div>
                  <div className="font-mono text-lg sm:text-xl lg:text-2xl xl:text-3xl font-bold text-white tabular-nums">
                    {formatPHP(actualMetroCash)}
                  </div>
                  <div className="text-xs text-slate-400">
                    ATM cash (Planned: {formatPHP(plannedMetrobank)})
                  </div>
                </div>

                <div className="bg-slate-900 dark:bg-slate-800 border border-transparent dark:border-slate-700 text-white rounded-xl p-3.5 sm:p-4 lg:p-5 space-y-1 shadow-2xs">
                  <div className="text-xs lg:text-sm text-slate-300 font-medium">{qrLabel} (Digital Payment)</div>
                  <div className="font-mono text-lg sm:text-xl lg:text-2xl xl:text-3xl font-bold text-purple-300 tabular-nums">
                    {formatPHP(plannedQrPh)}
                  </div>
                  <div className="text-xs text-slate-400">
                    Payment for {lazadaLabel} (Planned: {formatPHP(plannedQrPh)})
                  </div>
                </div>

                <div className="bg-slate-900 dark:bg-slate-800 border border-transparent dark:border-slate-700 text-white rounded-xl p-3.5 sm:p-4 lg:p-5 space-y-1 shadow-2xs">
                  <div className="text-xs lg:text-sm text-slate-300 font-medium">Total Actual Outflow</div>
                  <div className="font-mono text-lg sm:text-xl lg:text-2xl xl:text-3xl font-bold text-emerald-400 tabular-nums">
                    {formatPHP(actualTotalWithdrawn)}
                  </div>
                  <div className="text-xs text-slate-400">
                    ATM Cash + {qrLabel} (Auto-sum)
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3 lg:p-4 text-xs lg:text-sm text-slate-600 dark:text-slate-300 space-y-0.5 shrink-0 mt-auto">
              <strong className="text-slate-800 dark:text-slate-100 text-xs lg:text-sm">Payment Outflow Clarity:</strong>
              <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                {metroLabel} is the ATM withdrawal to pay physical bills. {qrLabel} is the direct digital payment method for {lazadaLabel}. Together, they represent the total capital outflow with zero double-counting.
              </p>
            </div>
          </div>
        )}

        {/* CARD 3 (PAGE 4): DEFERRED BILLS */}
        {currentCardIndex === 3 && (
          <div className="flex-1 min-h-0 flex flex-col justify-between overflow-y-auto overflow-x-hidden pr-0.5 animate-in fade-in duration-150 w-full">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-1.5 lg:pb-2 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h3 className="text-sm sm:text-base lg:text-lg font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                  {tableTitle} - Deferred Items
                </h3>
              </div>
              <span className="text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-transparent dark:border-amber-800/60 px-2.5 py-0.5 rounded-md font-mono">
                {nextPayrollItems.length} Deferred Bill{nextPayrollItems.length !== 1 ? 's' : ''}
              </span>
            </div>

            {nextPayrollItems.length === 0 ? (
              <div className="my-auto p-6 lg:p-8 bg-slate-50/70 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-center text-xs lg:text-sm text-slate-500 dark:text-slate-400 space-y-1.5 flex flex-col items-center justify-center">
                <CheckCircle2 className="w-9 h-9 lg:w-11 lg:h-11 text-emerald-600 dark:text-emerald-400" />
                <div className="font-bold text-slate-800 dark:text-slate-100 text-sm lg:text-base">All Bills Settled</div>
                <div className="text-slate-500 dark:text-slate-400 max-w-sm lg:max-w-md mx-auto text-xs lg:text-sm leading-relaxed">
                  No expenses are deferred to the next payroll. All obligations are settled.
                </div>
              </div>
            ) : (
              <div className="my-auto grid grid-cols-1 sm:grid-cols-2 gap-2.5 lg:gap-3">
                {nextPayrollItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2.5 lg:p-3 text-xs lg:text-sm bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100/90 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="truncate mr-2">
                      <div className="font-bold text-slate-900 dark:text-slate-100 truncate text-xs sm:text-[13px] lg:text-sm">{item.label}</div>
                      <div className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                        Sheet: {item.sheetName} {item.note ? `· ${item.note}` : ''}
                      </div>
                    </div>

                    <div className="text-right font-mono shrink-0">
                      <div className="font-bold text-amber-900 dark:text-amber-300 text-xs sm:text-[13px] lg:text-sm tabular-nums">
                        {formatPHP(item.amount)}
                      </div>
                      <span className="inline-flex items-center justify-end gap-1 text-[11px] text-amber-700 dark:text-amber-300 font-sans font-semibold">
                        <Clock className="w-3 h-3" />
                        <span>Deferred</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="text-xs lg:text-[13px] text-slate-400 dark:text-slate-500 text-center shrink-0 pt-1.5 border-t border-slate-100 dark:border-slate-800">
              Deferred expenses carry forward to preserve liquid cash buffer for current bills.
            </div>
          </div>
        )}

        {/* CARD 4 (PAGE 5): HISTORICAL CALENDAR MONTHS PROGRESSION */}
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
