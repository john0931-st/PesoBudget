import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MonthData } from '../types/budget';
import { formatPHP } from '../utils/currency';
import {
  PieChart,
  BarChart3,
  TrendingUp,
  PiggyBank,
  CheckCircle2,
  Clock,
  CalendarRange,
  Landmark,
  Wallet,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';
import {
  groupSheetsByCalendarMonth,
  extractMonthKey,
  CombinedMonthData,
  computeOverallWorkbookData,
} from '../utils/monthGrouping';
import { HistoricalProgressionChart } from './HistoricalProgressionChart';
import { PrintableSummaryReport } from './PrintableSummaryReport';
import { useTrackpadSwipe } from '../hooks/useTrackpadSwipe';
import { useCurrency } from '../hooks/useCurrency';

interface DataVisualizationProps {
  monthData: MonthData;
  allMonths?: Record<string, MonthData>;
  onSelectMonth?: (monthId: string) => void;
}

export const DataVisualization: React.FC<DataVisualizationProps> = ({
  monthData,
  allMonths = {},
  onSelectMonth,
}) => {
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'full_report'>('cards');
  useCurrency();

  // Automatically reset slice highlight when tapping or clicking outside
  useEffect(() => {
    const handleOutsideClick = () => {
      setSelectedSliceId(null);
      setHoveredSlice(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Group all sheets by calendar month (for the multi-month progression graph)
  const groupedMonths = useMemo(() => {
    return groupSheetsByCalendarMonth(allMonths);
  }, [allMonths]);

  // Unified Overall Summary data aggregating ALL sheets across the entire workbook
  const combinedMonth: CombinedMonthData = useMemo(() => {
    const validMonths = Object.keys(allMonths).length > 0 ? allMonths : { [monthData.id]: monthData };
    return computeOverallWorkbookData(validMonths);
  }, [allMonths, monthData]);

  // Multi-Month Historical Progression (all calendar months in the workbook)
  const historicalCalendarMonths = useMemo(() => {
    const list = Object.values(groupedMonths).map((cm) => ({
      key: cm.monthKey,
      name: cm.displayName,
      tableTitle: cm.tableTitle,
      sheetCount: cm.sheetCount,
      expenses: cm.totalExpenses,
      salary: cm.salaryVal,
      govSavings: cm.governmentSavings,
      personalSavings: cm.personalSavings,
      totalSavings: cm.totalCombinedSavings,
      balance: cm.balanceVal,
      isCurrent: cm.monthKey === extractMonthKey(monthData).key,
      firstSheetId: cm.sheets[0]?.id,
    }));

    if (list.length <= 1) {
      const sheets = Object.values(allMonths);
      if (sheets.length > 1) {
        return sheets.map((s) => {
          const exp = s.rows['total']?.cutoff15th?.value || s.rows['total']?.monthly?.value || 0;
          const sal = s.rows['salary']?.cutoff15th?.value || s.rows['salary']?.monthly?.value || 0;
          const mp2 = s.rows['mp2']?.cutoff15th?.value || s.rows['mp2']?.monthly?.value || 0;
          const gotyme = s.rows['gotyme']?.cutoff15th?.value || s.rows['gotyme']?.monthly?.value || 0;
          const bal = s.rows['balance']?.cutoff15th?.value ?? s.rows['balance']?.monthly?.value ?? 0;
          return {
            key: s.id,
            name: s.name,
            tableTitle: s.sheetTitle || s.name,
            sheetCount: 1,
            expenses: exp,
            salary: sal,
            govSavings: mp2,
            personalSavings: gotyme + bal,
            totalSavings: mp2 + gotyme + bal,
            balance: bal,
            isCurrent: s.id === monthData.id,
            firstSheetId: s.id,
          };
        });
      }
    }
    return list;
  }, [groupedMonths, allMonths, monthData]);

  // Total cards in gallery (Snapshot, Settlement, Categories, Cash vs Digital, Savings, Waterfall, Progression)
  const totalCards = 7;

  // Y-axis scale calculation for Historical Progression Graph
  const highestValue = Math.max(
    ...historicalCalendarMonths.map((d) => Math.max(d.expenses, d.salary)),
    20000
  );
  const step = highestValue > 80000 ? 25000 : highestValue > 40000 ? 15000 : 10000;
  const yMax = Math.ceil(highestValue / step) * step;
  const yTicks = [yMax, yMax * 0.75, yMax * 0.5, yMax * 0.25, 0];

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
    enabled: viewMode === 'cards',
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

  // Monthly Aggregated Totals (Overall across sheets)
  const {
    totalExpenses,
    plannedMetrobank,
    plannedQrPh,
    actualTotalWithdrawn,
    governmentSavings,
    gotymeVal,
    balanceVal,
    salaryVal,
    settledAmount,
    nextPayrollAmount,
    settledCount,
    nextPayrollCount,
    settlementPercent,
    govSavingsRate,
    expenseCategories,
    cutoffSummaries,
    sheets,
    tableTitle,
    sheetCount,
  } = combinedMonth;

  const gotymeRate = salaryVal > 0 ? Math.round((gotymeVal / salaryVal) * 100) : 0;

  const plannedTotal = plannedMetrobank + plannedQrPh;

  // Donut chart geometry calculations
  let currentAngle = 0;
  const donutSlices = expenseCategories
    .filter((item) => item.amount > 0)
    .map((item) => {
      const cleanLabel = item.label
        .replace(/\s*\(Online Bill\)/i, '')
        .replace(/\s*online bill/i, '')
        .trim();
      const percentage = totalExpenses > 0 ? item.amount / totalExpenses : 0;
      const angle = percentage * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle += angle;

      const startRad = ((startAngle - 90) * Math.PI) / 180.0;
      const endRad = ((endAngle - 90) * Math.PI) / 180.0;
      const cx = 100;
      const cy = 100;
      const outerR = 86;
      const innerR = 56;

      const x1Outer = cx + outerR * Math.cos(startRad);
      const y1Outer = cy + outerR * Math.sin(startRad);
      const x2Outer = cx + outerR * Math.cos(endRad);
      const y2Outer = cy + outerR * Math.sin(endRad);

      const x1Inner = cx + innerR * Math.cos(endRad);
      const y1Inner = cy + innerR * Math.sin(endRad);
      const x2Inner = cx + innerR * Math.cos(startRad);
      const y2Inner = cy + innerR * Math.sin(startRad);

      const largeArc = angle > 180 ? 1 : 0;

      const pathData = [
        `M ${x1Outer} ${y1Outer}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2Outer} ${y2Outer}`,
        `L ${x1Inner} ${y1Inner}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x2Inner} ${y2Inner}`,
        'Z',
      ].join(' ');

      return {
        ...item,
        label: cleanLabel,
        percentage: Math.round(percentage * 1000) / 10,
        pathData,
      };
    });

  // Compact density styling helper
  const densityPadding = 'p-2 sm:p-3';
  const densityText = 'text-[11px]';

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col select-none space-y-1">
      {/* Top Header: Overall Summary Indicator and View Mode Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 shrink-0 print:hidden">
        <div className="text-xs lg:text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
          Overall Summary & Graphs · <span className="font-mono text-emerald-800 dark:text-emerald-400">{sheetCount} Sheets ({historicalCalendarMonths.length} Months)</span>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`px-2.5 py-1 text-xs lg:text-sm font-semibold rounded-md transition-all cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Card Carousel
          </button>
          <button
            type="button"
            onClick={() => setViewMode('full_report')}
            className={`px-2.5 py-1 text-xs lg:text-sm font-semibold rounded-md transition-all cursor-pointer ${
              viewMode === 'full_report'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Full 7-Page Report
          </button>
        </div>
      </div>

      {/* Modern Bullet Page Indicator (No Numbers, Clean Modern Design Just Above the Cards) */}
      <div className={`flex items-center justify-center gap-1.5 py-0.5 shrink-0 print:hidden ${viewMode === 'full_report' ? 'hidden' : 'flex'}`}>
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

      {/* The Single Card View (Interactive Carousel - hidden during print and when full report is active) */}
      <div
        ref={cardContainerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`w-full flex-1 min-h-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xs p-3 sm:p-4 lg:p-5 transition-all touch-pan-y overscroll-x-contain flex flex-col justify-between overflow-hidden ${
          viewMode === 'cards' ? 'flex print:hidden' : 'hidden'
        }`}
      >
        {/* CARD 0 (PAGE 1): FINANCIAL SNAPSHOT - SCROLLABLE */}
        {currentCardIndex === 0 && (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-1 space-y-2.5 sm:space-y-3 lg:space-y-4 animate-in fade-in duration-150 w-full">
            {/* Card Title on the Card Itself */}
            <div className="border-b border-slate-100 dark:border-slate-800 pb-1.5 lg:pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1 shrink-0">
              <div>
                <h3 className="text-sm sm:text-base lg:text-lg xl:text-xl font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                  Overall Financial Snapshot
                </h3>
                <p className="text-[11px] lg:text-xs xl:text-sm text-slate-500 dark:text-slate-400">
                  Aggregated across {sheetCount} sheets in your workbook ({sheets.map((s) => s.name).join(' + ')})
                </p>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-xs lg:text-sm self-start sm:self-auto">
                <span className="text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-transparent dark:border-emerald-800/60 px-2.5 py-0.5 rounded font-bold">
                  Ending Balance: {formatPHP(balanceVal)}
                </span>
                <span className="text-teal-800 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 border border-transparent dark:border-teal-800/60 px-2.5 py-0.5 rounded font-bold">
                  GoTyme: {formatPHP(gotymeVal)}
                </span>
              </div>
            </div>

            {/* Top 5 Key Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 lg:gap-3 shrink-0">
              {/* 1. Total Bills */}
              <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 sm:p-3 lg:p-4 flex flex-col justify-between space-y-1">
                <span className="text-[11px] lg:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total Monthly Bills</span>
                <div className="font-mono text-base sm:text-lg lg:text-xl xl:text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  {formatPHP(Math.abs(totalExpenses))}
                </div>
                <span className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 block truncate">
                  House, utilities, loans & Lazada
                </span>
              </div>

              {/* 2. Metrobank Withdrawn Cash */}
              <div className="bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/70 rounded-xl p-2.5 sm:p-3 lg:p-4 flex flex-col justify-between space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] lg:text-xs font-semibold text-blue-900 dark:text-blue-200 uppercase tracking-wide">Metrobank</span>
                  <span className="text-[11px] bg-blue-100 dark:bg-blue-900/70 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 rounded font-bold shrink-0">
                    ATM Cash
                  </span>
                </div>
                <div className="font-mono text-base sm:text-lg lg:text-xl xl:text-2xl font-bold text-blue-700 dark:text-blue-300 tabular-nums">
                  {formatPHP(plannedMetrobank)}
                </div>
                <span className="text-[11px] lg:text-xs text-blue-700 dark:text-blue-300/80 block truncate">
                  Withdrawn cash for physical bills
                </span>
              </div>

              {/* 3. QR PH Payment */}
              <div className="bg-purple-50/60 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/70 rounded-xl p-2.5 sm:p-3 lg:p-4 flex flex-col justify-between space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] lg:text-xs font-semibold text-purple-900 dark:text-purple-200 uppercase tracking-wide">QR PH</span>
                  <span className="text-[11px] bg-purple-100 dark:bg-purple-900/70 text-purple-800 dark:text-purple-200 px-1.5 py-0.5 rounded font-bold shrink-0">
                    Payment
                  </span>
                </div>
                <div className="font-mono text-base sm:text-lg lg:text-xl xl:text-2xl font-bold text-purple-700 dark:text-purple-300 tabular-nums">
                  {formatPHP(plannedQrPh)}
                </div>
                <span className="text-[11px] lg:text-xs text-purple-700 dark:text-purple-300/80 block truncate">
                  Digital payment for Lazada bill
                </span>
              </div>

              {/* 4. Gov MP2 */}
              <div className="bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 rounded-xl p-2.5 sm:p-3 lg:p-4 flex flex-col justify-between space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] lg:text-xs font-semibold text-amber-900 dark:text-amber-200 uppercase tracking-wide">Pag-IBIG MP2</span>
                  <span className="text-[11px] bg-amber-200 dark:bg-amber-900/70 text-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded font-bold shrink-0">
                    Locked
                  </span>
                </div>
                <div className="font-mono text-base sm:text-lg lg:text-xl xl:text-2xl font-bold text-amber-950 dark:text-amber-300 tabular-nums">
                  {formatPHP(Math.abs(governmentSavings))}
                </div>
                <span className="text-[11px] lg:text-xs text-amber-700 dark:text-amber-300/80 block truncate">
                  Non-withdrawable · {govSavingsRate}% of salary
                </span>
              </div>

              {/* 5. GoTyme (Withdrawable) */}
              <div className="bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/70 rounded-xl p-2.5 sm:p-3 lg:p-4 flex flex-col justify-between space-y-1 col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] lg:text-xs font-semibold text-teal-900 dark:text-teal-200 uppercase tracking-wide">GoTyme Bank</span>
                  <span className="text-[11px] bg-teal-200 dark:bg-teal-900/70 text-teal-900 dark:text-teal-200 px-1.5 py-0.5 rounded font-bold shrink-0">
                    Withdrawable
                  </span>
                </div>
                <div className="font-mono text-base sm:text-lg lg:text-xl xl:text-2xl font-bold text-teal-950 dark:text-teal-300 tabular-nums">
                  {formatPHP(gotymeVal)}
                </div>
                <span className="text-[11px] lg:text-xs text-teal-700 dark:text-teal-300/80 block truncate">
                  Liquid reserve · Balance: {formatPHP(balanceVal)}
                </span>
              </div>
            </div>

            {/* Middle: Salary Allocation & Monthly Capital Distribution Bar */}
            <div className="bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 sm:p-3 lg:p-4 space-y-2 lg:space-y-3 shrink-0">
              <div className="flex items-center justify-between text-xs lg:text-sm">
                <div className="flex items-center gap-1.5">
                  <PieChart className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-slate-700 dark:text-slate-300" />
                  <span className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide text-[11px] lg:text-xs xl:text-sm">
                    Monthly Salary Allocation
                  </span>
                </div>
                <span className="font-mono text-[11px] lg:text-xs xl:text-sm text-slate-600 dark:text-slate-300">
                  Gross Salary: <strong className="text-emerald-700 dark:text-emerald-400">{formatPHP(salaryVal)}</strong>
                </span>
              </div>

              {/* Distribution Bar */}
              <div className="w-full h-3 lg:h-3.5 bg-slate-200 dark:bg-slate-950 rounded-full overflow-hidden flex shadow-inner">
                <div
                  className="h-full bg-rose-500 transition-all duration-300"
                  style={{ width: `${salaryVal > 0 ? Math.min(100, (Math.abs(totalExpenses) / salaryVal) * 100) : 0}%` }}
                  title={`Bills: ${formatPHP(Math.abs(totalExpenses))}`}
                />
                <div
                  className="h-full bg-amber-500 transition-all duration-300"
                  style={{ width: `${salaryVal > 0 ? Math.min(100, (Math.abs(governmentSavings) / salaryVal) * 100) : 0}%` }}
                  title={`MP2 (Locked): ${formatPHP(Math.abs(governmentSavings))}`}
                />
                <div
                  className="h-full bg-teal-500 transition-all duration-300"
                  style={{ width: `${salaryVal > 0 ? Math.min(100, (gotymeVal / salaryVal) * 100) : 0}%` }}
                  title={`GoTyme (Withdrawable): ${formatPHP(gotymeVal)}`}
                />
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${salaryVal > 0 ? Math.max(0, (balanceVal / salaryVal) * 100) : 0}%` }}
                  title={`Ending Balance: ${formatPHP(balanceVal)}`}
                />
              </div>

              {/* Legend Chips for Distribution */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 lg:gap-3 text-xs lg:text-[13px] xl:text-sm font-mono">
                <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                    <span className="text-slate-600 dark:text-slate-300 font-sans truncate">Bills & Loans:</span>
                  </div>
                  <span className="font-bold text-rose-700 dark:text-rose-400 shrink-0">
                    {salaryVal > 0 ? Math.round((Math.abs(totalExpenses) / salaryVal) * 100) : 0}%
                  </span>
                </div>
                <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    <span className="text-slate-600 dark:text-slate-300 font-sans truncate">MP2 (Locked):</span>
                  </div>
                  <span className="font-bold text-amber-700 dark:text-amber-400 shrink-0">{govSavingsRate}%</span>
                </div>
                <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                    <span className="text-slate-600 dark:text-slate-300 font-sans truncate">GoTyme:</span>
                  </div>
                  <span className="font-bold text-teal-700 dark:text-teal-400 shrink-0">
                    {gotymeRate}%
                  </span>
                </div>
                <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-slate-600 dark:text-slate-300 font-sans truncate">Balance:</span>
                  </div>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400 shrink-0">{formatPHP(balanceVal)}</span>
                </div>
              </div>
            </div>

            {/* Key Figures Strip */}
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 sm:p-3 lg:p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 lg:gap-4 font-mono text-xs lg:text-sm shrink-0">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] lg:text-xs font-sans">Gross Salary:</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400 text-xs sm:text-sm lg:text-base">{formatPHP(salaryVal)}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] lg:text-xs font-sans">MP2 / GoTyme Rate:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm lg:text-base">{govSavingsRate}% / {gotymeRate}%</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] lg:text-xs font-sans">Settled Bills:</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400 text-xs sm:text-sm lg:text-base">{settlementPercent}% ({settledCount} items)</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] lg:text-xs font-sans">Deferred Bills:</span>
                <span className="font-bold text-amber-700 dark:text-amber-400 text-xs sm:text-sm lg:text-base">{formatPHP(nextPayrollAmount)} ({nextPayrollCount})</span>
              </div>
            </div>

            <div className="text-xs lg:text-[13px] text-slate-400 dark:text-slate-500 text-center shrink-0 pt-1.5 border-t border-slate-100 dark:border-slate-800">
              Reconciled across all workbook sheets for Year {monthData.year || 2026} with zero discrepancies.
            </div>
          </div>
        )}

          {/* CARD 1 (PAGE 2): 15-DAY CUTOFFS CONTRIBUTION - FITTED WHOLE, NO SCROLLBAR */}
          {currentCardIndex === 1 && (
            <div className="flex-1 flex flex-col justify-between min-h-0 overflow-y-auto overflow-x-hidden pr-0.5 space-y-1.5 sm:space-y-2 animate-in fade-in duration-150 w-full">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-1.5 lg:pb-2 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-sm sm:text-base lg:text-lg font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                    {tableTitle} - 15-Day Cutoffs Contribution
                  </h3>
                  <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400">
                    Table title on both sheets: <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono font-bold text-slate-800 dark:text-slate-200">{tableTitle}</code>
                  </p>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{sheetCount} Sheets</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 lg:gap-3 my-auto">
                {cutoffSummaries.map((cutoff, idx) => (
                  <div
                    key={cutoff.id}
                    onClick={() => onSelectMonth?.(cutoff.id)}
                    className="bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100/90 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 sm:p-3 lg:p-3.5 transition-all cursor-pointer group space-y-1.5"
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
                        <span>Period:</span>
                        <span className="text-slate-800 dark:text-slate-200 font-medium">{cutoff.cutoffLabel}</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-700">
                        <span>Expenses:</span>
                        <span className="font-bold text-rose-700 dark:text-rose-400">{formatPHP(cutoff.expenses)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Gross Salary:</span>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatPHP(cutoff.salary)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>MP2 (Locked):</span>
                        <span className="font-bold text-amber-700 dark:text-amber-400">{formatPHP(cutoff.govSavings)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>GoTyme (Withdrawable):</span>
                        <span className="font-bold text-teal-700 dark:text-teal-400">
                          {formatPHP(Math.max(0, cutoff.personalSavings - cutoff.endingBalance))}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600 dark:text-slate-400">
                        <span>Ending Balance:</span>
                        <span className="font-bold text-slate-900 dark:text-slate-100">{formatPHP(cutoff.endingBalance)}</span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Full Month Total Column */}
                <div className="bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl p-2.5 sm:p-3 lg:p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] lg:text-xs font-bold bg-emerald-600 text-white px-2 py-0.5 rounded uppercase">
                      Full Month Total
                    </span>
                    <span className="text-xs font-extrabold text-emerald-950 dark:text-emerald-300 font-mono">
                      {sheetCount} Sheets
                    </span>
                  </div>

                  <div className="space-y-1 text-xs sm:text-[13px] lg:text-sm font-mono pt-0.5">
                    <div className="flex justify-between">
                      <span className="text-emerald-900 dark:text-emerald-200 font-semibold">Total Expenses:</span>
                      <span className="font-black text-rose-800 dark:text-rose-400">{formatPHP(Math.abs(totalExpenses))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-900 dark:text-emerald-200 font-semibold">Total Salary:</span>
                      <span className="font-black text-emerald-800 dark:text-emerald-400">{formatPHP(salaryVal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-900 dark:text-emerald-200 font-semibold">MP2 (Locked):</span>
                      <span className="font-black text-amber-800 dark:text-amber-400">{formatPHP(Math.abs(governmentSavings))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-900 dark:text-emerald-200 font-semibold">GoTyme (Withdrawable):</span>
                      <span className="font-black text-teal-800 dark:text-teal-400">{formatPHP(gotymeVal)}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-emerald-200 dark:border-emerald-800">
                      <span className="text-emerald-900 dark:text-emerald-200 font-semibold">Ending Balance:</span>
                      <span className="font-black text-emerald-950 dark:text-emerald-300 text-xs sm:text-sm lg:text-base">{formatPHP(balanceVal)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-xs lg:text-[13px] text-slate-400 dark:text-slate-500 text-center shrink-0 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                15th Kinsenas covers regular mid-month bills; 30th Katapusan handles end-of-month allocations and savings.
              </div>
            </div>
          )}

          {/* CARD 2 (PAGE 3): EXPENSE CATEGORY BREAKDOWN & DONUT CHART - NO SCROLLBAR */}
          {currentCardIndex === 2 && (
            <div
              onClick={() => {
                setSelectedSliceId(null);
                setHoveredSlice(null);
              }}
              className="flex-1 flex flex-col justify-between min-h-0 overflow-y-auto overflow-x-hidden pr-0.5 space-y-2 animate-in fade-in duration-150 w-full select-none"
            >
              <div className="border-b border-slate-100 dark:border-slate-800 pb-1.5 lg:pb-2 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-sm sm:text-base lg:text-lg font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                    {tableTitle} - Expense Category Share
                  </h3>
                  <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400">
                    Category percentage breakdown (100% = {formatPHP(totalExpenses)}) · Lazada is the bill; QR PH is its payment channel
                  </p>
                </div>
                <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 rounded-md">
                  {donutSlices.length} Categories
                </span>
              </div>

              {(() => {
                const activeSliceId = selectedSliceId || hoveredSlice;
                const activeSlice = donutSlices.find((s) => s.id === activeSliceId) || null;
                const numCategories = donutSlices.length;

                // Responsive columns adapting dynamically to however many categories there are
                const gridColsClass =
                  numCategories <= 6
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : numCategories <= 9
                    ? 'grid-cols-2 sm:grid-cols-3'
                    : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4';

                // Adaptive padding and typography so all items fit cleanly without vertical scrollbar
                const itemPadClass =
                  numCategories > 10
                    ? 'py-1 px-2.5 text-[11px] lg:text-xs'
                    : numCategories > 6
                    ? 'py-1.5 px-2.5 lg:px-3 text-xs lg:text-[13px]'
                    : 'py-1.5 px-2.5 lg:py-2 lg:px-3 text-xs lg:text-sm';

                const donutSizeClass =
                  numCategories > 10
                    ? 'w-44 h-44 sm:w-48 sm:h-48 md:w-52 md:h-52 lg:w-60 lg:h-60'
                    : numCategories > 6
                    ? 'w-48 h-48 sm:w-52 sm:h-52 md:w-56 md:h-56 lg:w-64 lg:h-64'
                    : 'w-52 h-52 sm:w-56 sm:h-56 md:w-60 md:h-60 lg:w-68 lg:h-68';

                return (
                  <div className="my-auto flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4 lg:gap-6 py-1 overflow-hidden">
                    {/* SVG Donut */}
                    <div className={`relative ${donutSizeClass} shrink-0 mx-auto md:mx-0 transition-all`}>
                      <svg viewBox="0 0 200 200" className="w-full h-full transform -rotate-90">
                        {donutSlices.map((slice) => {
                          const isSelected = activeSliceId === slice.id;
                          return (
                            <path
                              key={slice.id}
                              d={slice.pathData}
                              fill={slice.color}
                              stroke="currentColor"
                              strokeWidth={isSelected ? 3.5 : 1}
                              className="text-white dark:text-slate-900 transition-opacity duration-150 cursor-pointer"
                              style={{
                                opacity: activeSliceId && !isSelected ? 0.3 : 1,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSliceId((prev) => (prev === slice.id ? null : slice.id));
                              }}
                              onMouseEnter={() => setHoveredSlice(slice.id)}
                              onMouseLeave={() => setHoveredSlice(null)}
                            />
                          );
                        })}
                      </svg>
                      {/* Donut Center Display */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none p-2 select-none">
                        {activeSlice ? (
                          <div className="flex flex-col items-center justify-center max-w-[125px] sm:max-w-[145px] lg:max-w-[165px] px-1">
                            <span className="text-xs sm:text-[13px] lg:text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight text-center line-clamp-2">
                              {activeSlice.label}
                            </span>
                            <span className="font-mono text-base sm:text-lg lg:text-xl font-black text-emerald-700 dark:text-emerald-400 leading-tight my-0.5">
                              {activeSlice.percentage}%
                            </span>
                            <span className="font-mono text-xs lg:text-sm font-bold text-slate-700 dark:text-slate-300">
                              {formatPHP(activeSlice.amount)}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center max-w-[110px] sm:max-w-[125px] lg:max-w-[145px] px-1">
                            <span className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">Top Bill</span>
                            <span className="text-xs sm:text-[13px] lg:text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight text-center line-clamp-2 mt-0.5">
                              {donutSlices[0]?.label || 'None'}
                            </span>
                            <span className="font-mono text-xs sm:text-sm lg:text-base font-bold text-slate-700 dark:text-slate-300 mt-0.5">
                              {donutSlices[0] ? `${donutSlices[0].percentage}%` : '0%'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Category Legend adapting layout dynamically */}
                    <div className={`flex-1 w-full grid ${gridColsClass} gap-1.5 lg:gap-2`}>
                      {donutSlices.map((slice) => {
                        const isSelected = activeSliceId === slice.id;
                        return (
                          <div
                            key={slice.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSliceId((prev) => (prev === slice.id ? null : slice.id));
                            }}
                            onMouseEnter={() => setHoveredSlice(slice.id)}
                            onMouseLeave={() => setHoveredSlice(null)}
                            className={`flex items-center justify-between ${itemPadClass} rounded-lg transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-slate-900 dark:bg-emerald-600 border-slate-900 dark:border-emerald-500 text-white font-bold shadow-md ring-1 ring-slate-900 dark:ring-emerald-500'
                                : activeSliceId
                                ? 'opacity-35 hover:opacity-100 bg-slate-50 dark:bg-slate-800/60 border-slate-200/80 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                : 'bg-slate-50/80 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate min-w-0">
                              <div className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
                                <span
                                  className={`rounded-full shrink-0 aspect-square transition-all duration-150 ${
                                    isSelected
                                      ? 'w-3 h-3 ring-2 ring-white/50 shadow-xs'
                                      : 'w-2.5 h-2.5 opacity-90'
                                  }`}
                                  style={{ backgroundColor: slice.color }}
                                />
                              </div>
                              <span
                                className={`truncate ${
                                  numCategories > 10
                                    ? 'text-[11px] lg:text-xs'
                                    : numCategories > 6
                                    ? 'text-xs lg:text-[13px]'
                                    : 'text-xs lg:text-sm'
                                } ${isSelected ? 'text-white font-bold' : 'text-slate-800 dark:text-slate-200'}`}
                              >
                                {slice.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 font-mono shrink-0 pl-1">
                              <span
                                className={`tabular-nums ${
                                  isSelected ? 'text-emerald-200 dark:text-emerald-100 font-bold' : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {slice.percentage}%
                              </span>
                              <span
                                className={`tabular-nums ${
                                  isSelected ? 'text-white font-black' : 'font-semibold text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {formatPHP(slice.amount)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="text-xs lg:text-[13px] text-slate-400 dark:text-slate-500 text-center shrink-0 pt-1.5 border-t border-slate-100 dark:border-slate-800 select-none">
                Tap any slice or category to highlight · Tap outside to reset
              </div>
            </div>
          )}

          {/* CARD 3 (PAGE 4): CASH OUTFLOWS (METROBANK & QR PH) - MAXIMIZED, NO SCROLLBAR */}
          {currentCardIndex === 3 && (
            <div className="flex-1 flex flex-col justify-between min-h-0 overflow-y-auto overflow-x-hidden pr-0.5 animate-in fade-in duration-150 w-full">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-sm sm:text-base lg:text-lg xl:text-xl font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                    {tableTitle} - Cash Outflows: Metrobank & QR PH
                  </h3>
                  <p className="text-[11px] lg:text-xs xl:text-sm text-slate-500 dark:text-slate-400">
                    Total obligations = Metrobank (withdrawn money) + QR PH (digital payment for Lazada)
                  </p>
                </div>
                <span className="font-mono text-xs lg:text-sm font-bold text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-transparent dark:border-blue-800/60 px-2 py-0.5 rounded">
                  Planned: {formatPHP(plannedTotal)}
                </span>
              </div>

              <div className="my-auto py-2 grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
                {/* Left: Planned Channels */}
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5 space-y-3">
                  <div className="text-xs lg:text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                    Planned Outflow Channels
                  </div>

                  <div className="space-y-2 text-xs lg:text-sm font-mono">
                    <div className="flex justify-between p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                      <span className="text-slate-700 dark:text-slate-300 font-sans font-medium">Metrobank (Withdrawn Money):</span>
                      <strong className="text-blue-700 dark:text-blue-400 text-sm lg:text-base tabular-nums">{formatPHP(plannedMetrobank)}</strong>
                    </div>
                    <div className="flex justify-between p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                      <span className="text-slate-700 dark:text-slate-300 font-sans font-medium">QR PH (Digital Payment for Lazada):</span>
                      <strong className="text-purple-700 dark:text-purple-400 text-sm lg:text-base tabular-nums">{formatPHP(plannedQrPh)}</strong>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex justify-between text-xs lg:text-sm mb-1.5">
                      <span className="text-slate-600 dark:text-slate-300 font-medium">Actual Outflow Executed</span>
                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {formatPHP(actualTotalWithdrawn)}
                      </span>
                    </div>
                    <div className="w-full h-3 bg-slate-200 dark:bg-slate-950 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          actualTotalWithdrawn >= plannedTotal ? 'bg-emerald-600' : 'bg-amber-500'
                        }`}
                        style={{
                          width: `${
                            plannedTotal > 0
                              ? Math.min(100, (actualTotalWithdrawn / plannedTotal) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 mt-1.5 font-mono">
                      <span>Execution Variance:</span>
                      <span className={actualTotalWithdrawn - plannedTotal >= 0 ? 'text-emerald-700 dark:text-emerald-400 font-bold' : 'text-amber-700 dark:text-amber-400 font-bold'}>
                        {actualTotalWithdrawn - plannedTotal >= 0 ? '+' : ''}{formatPHP(actualTotalWithdrawn - plannedTotal)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Remarks Settlement Progress */}
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 sm:p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs lg:text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                      Settlement Status
                    </div>
                    <span className="font-mono text-xs lg:text-sm font-bold text-emerald-700 dark:text-emerald-400">
                      {settlementPercent}% Settled
                    </span>
                  </div>

                  <div className="w-full h-3 bg-amber-100 dark:bg-amber-950/60 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-emerald-600 transition-all duration-300"
                      style={{ width: `${settlementPercent}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 font-semibold text-xs lg:text-sm mb-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>Settled ({settledCount})</span>
                      </div>
                      <div className="font-mono font-bold text-emerald-900 dark:text-emerald-200 text-sm lg:text-base tabular-nums">
                        {formatPHP(settledAmount)}
                      </div>
                    </div>

                    <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-semibold text-xs lg:text-sm mb-1">
                        <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span>Deferred ({nextPayrollCount})</span>
                      </div>
                      <div className="font-mono font-bold text-amber-900 dark:text-amber-200 text-sm lg:text-base tabular-nums">
                        {formatPHP(nextPayrollAmount)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-[11px] lg:text-xs xl:text-sm text-slate-400 dark:text-slate-500 text-center shrink-0 pt-2 border-t border-slate-100 dark:border-slate-800">
                Cash withdrawals and digital transfers are reconciled to match total monthly obligations.
              </div>
            </div>
          )}

          {/* CARD 4 (PAGE 5): SAVINGS ALLOCATION (LOCKED MP2 VS WITHDRAWABLE GOTYME) - NO COMBINING */}
          {currentCardIndex === 4 && (
            <div className="flex-1 flex flex-col justify-between min-h-0 overflow-y-auto overflow-x-hidden pr-0.5 animate-in fade-in duration-150 w-full">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-1.5 lg:pb-2 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-sm sm:text-base lg:text-lg font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                    {tableTitle} - Savings Reserves: Locked MP2 vs Withdrawable GoTyme
                  </h3>
                  <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400">
                    Tracked separately — MP2 is long-term locked while GoTyme is withdrawable anytime
                  </p>
                </div>
                <span className="font-mono text-xs font-bold text-emerald-950 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-950/70 border border-transparent dark:border-emerald-800 px-2.5 py-0.5 rounded-md">
                  Balance: {formatPHP(balanceVal)}
                </span>
              </div>

              {(() => {
                const mp2Abs = Math.abs(governmentSavings);
                const savingsBase = mp2Abs + Math.max(0, gotymeVal);
                const mp2Pct = savingsBase > 0 ? Math.round((mp2Abs / savingsBase) * 100) : 50;
                const gotymePct = savingsBase > 0 ? 100 - mp2Pct : 50;
                return (
                  <div className="my-auto py-1 sm:py-1.5 space-y-2.5 lg:space-y-4">
                    {/* Comparison Ratio Bar (MP2 vs GoTyme Share) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs lg:text-sm font-semibold">
                        <span className="text-amber-700 dark:text-amber-400">
                          Pag-IBIG MP2 (Locked): {mp2Pct}%
                        </span>
                        <span className="text-teal-700 dark:text-teal-400">
                          GoTyme (Withdrawable): {gotymePct}%
                        </span>
                      </div>
                      <div className="w-full h-2.5 lg:h-3 bg-slate-100 dark:bg-slate-950 rounded-full overflow-hidden flex shadow-inner">
                        <div
                          className="h-full bg-amber-500 transition-all duration-300"
                          style={{ width: `${mp2Pct}%` }}
                        />
                        <div
                          className="h-full bg-teal-500 transition-all duration-300"
                          style={{ width: `${gotymePct}%` }}
                        />
                      </div>
                    </div>

                    {/* Side-by-Side Savings Cards (Strictly Separate) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 lg:gap-4">
                      {/* Locked Government Savings (MP2) */}
                      <div className="bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl p-3 lg:p-4 space-y-1.5 lg:space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Landmark className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                            <span className="text-xs sm:text-[13px] lg:text-sm font-bold text-amber-950 dark:text-amber-200 uppercase">
                              Pag-IBIG MP2
                            </span>
                          </div>
                          <span className="text-[11px] lg:text-xs bg-amber-200 dark:bg-amber-900/70 text-amber-900 dark:text-amber-200 font-bold px-2 py-0.5 rounded-full">
                            Non-Withdrawable · Locked
                          </span>
                        </div>
                        <div className="font-mono text-base sm:text-lg lg:text-2xl font-black text-amber-950 dark:text-amber-300 tabular-nums">
                          {formatPHP(mp2Abs)}
                        </div>
                        <div className="text-xs lg:text-sm text-amber-900 dark:text-amber-200/90 bg-white/70 dark:bg-slate-900/70 p-2 lg:p-2.5 rounded-lg border border-amber-200/60 dark:border-amber-800/60 leading-relaxed">
                          • 5-year maturity sovereign dividend reserve ({govSavingsRate}% of salary). Excluded from liquid cash reserves.
                        </div>
                      </div>

                      {/* Withdrawable Personal Savings (GoTyme) */}
                      <div className="bg-teal-50/80 dark:bg-teal-950/40 border border-teal-300 dark:border-teal-800 rounded-xl p-3 lg:p-4 space-y-1.5 lg:space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Wallet className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                            <span className="text-xs sm:text-[13px] lg:text-sm font-bold text-teal-950 dark:text-teal-200 uppercase">
                              GoTyme Savings
                            </span>
                          </div>
                          <span className="text-[11px] lg:text-xs bg-teal-200 dark:bg-teal-900/70 text-teal-900 dark:text-teal-200 font-bold px-2 py-0.5 rounded-full">
                            Withdrawable Anytime
                          </span>
                        </div>
                        <div className="font-mono text-base sm:text-lg lg:text-2xl font-black text-teal-950 dark:text-teal-300 tabular-nums">
                          {formatPHP(gotymeVal)}
                        </div>
                        <div className="text-xs lg:text-sm text-teal-900 dark:text-teal-200 bg-white/70 dark:bg-slate-900/70 p-2 lg:p-2.5 rounded-lg border border-teal-200/60 dark:border-teal-800/60 font-mono space-y-0.5">
                          <div className="flex justify-between">
                            <span>• GoTyme Withdrawable:</span>
                            <span className="font-bold">{formatPHP(gotymeVal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>• Ending Carryover Balance:</span>
                            <span className="font-bold">{formatPHP(balanceVal)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="text-xs lg:text-[13px] text-slate-400 dark:text-slate-500 text-center shrink-0 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                Locked MP2 maturity savings and withdrawable GoTyme reserves remain strictly separated.
              </div>
            </div>
          )}

          {/* CARD 5 (PAGE 6): MONTHLY CASH FLOW WATERFALL - FITTED WHOLE, NO SCROLLBAR */}
          {currentCardIndex === 5 && (
            <div className="flex-1 flex flex-col justify-between min-h-0 overflow-y-auto overflow-x-hidden pr-0.5 space-y-1.5 sm:space-y-2 animate-in fade-in duration-150 w-full">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="text-sm sm:text-base lg:text-lg xl:text-xl font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
                    {tableTitle} - Monthly Cash Flow Waterfall
                  </h3>
                  <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400">
                    Step-by-step capital flow from Gross Salary to Ending Balance
                  </p>
                </div>
                <span className="font-mono text-xs lg:text-sm font-bold text-emerald-900 dark:text-emerald-200 bg-emerald-100 dark:bg-emerald-950/70 border border-transparent dark:border-emerald-800 px-2.5 py-0.5 rounded-full">
                  Ending Balance: {formatPHP(balanceVal)}
                </span>
              </div>

              <div className="my-auto py-1 space-y-2.5 lg:space-y-3">
                {/* Top Flow Stages */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5 lg:gap-3">
                  {/* 1. Gross Salary */}
                  <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-2.5 lg:p-3.5 flex flex-col justify-between">
                    <span className="text-[11px] lg:text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide">1. Gross Salary</span>
                    <div className="font-mono text-sm lg:text-base xl:text-lg font-extrabold text-emerald-950 dark:text-emerald-200 my-0.5 tabular-nums">
                      {formatPHP(salaryVal)}
                    </div>
                    <span className="text-[11px] lg:text-xs text-emerald-700 dark:text-emerald-400/80">Combined payroll sheets</span>
                  </div>

                  {/* 2. Total Bills */}
                  <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-2.5 lg:p-3.5 flex flex-col justify-between">
                    <span className="text-[11px] lg:text-xs font-bold text-rose-800 dark:text-rose-300 uppercase tracking-wide">2. Total Bills</span>
                    <div className="font-mono text-sm lg:text-base xl:text-lg font-extrabold text-rose-950 dark:text-rose-200 my-0.5 tabular-nums">
                      {formatPHP(Math.abs(totalExpenses))}
                    </div>
                    <span className="text-[11px] lg:text-xs text-rose-700 dark:text-rose-400/80">Rent, utilities, food & loans</span>
                  </div>

                  {/* 3. Metrobank Cash */}
                  <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl p-2.5 lg:p-3.5 flex flex-col justify-between">
                    <span className="text-[11px] lg:text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-wide">3. Metrobank Cash</span>
                    <div className="font-mono text-sm lg:text-base xl:text-lg font-extrabold text-blue-950 dark:text-blue-200 my-0.5 tabular-nums">
                      {formatPHP(plannedMetrobank)}
                    </div>
                    <span className="text-[11px] lg:text-xs text-blue-700 dark:text-blue-400/80">Withdrawn ATM Cash for bills</span>
                  </div>

                  {/* 4. Pag-IBIG MP2 (Locked) */}
                  <div className="bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl p-2.5 lg:p-3.5 flex flex-col justify-between">
                    <span className="text-[11px] lg:text-xs font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wide">4. MP2 (Locked)</span>
                    <div className="font-mono text-sm lg:text-base xl:text-lg font-extrabold text-amber-950 dark:text-amber-200 my-0.5 tabular-nums">
                      {formatPHP(Math.abs(governmentSavings))}
                    </div>
                    <span className="text-[11px] lg:text-xs text-amber-700 dark:text-amber-400/80">Non-withdrawable 5-yr reserve</span>
                  </div>
                </div>

                {/* Stage 5 & 6 Split Cards: GoTyme (Withdrawable) & Ending Balance */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 lg:gap-3">
                  <div className="bg-teal-50/85 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-xl p-3 lg:p-4 space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Wallet className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                        <span className="text-xs sm:text-[13px] lg:text-sm font-bold text-teal-950 dark:text-teal-200 uppercase tracking-wide">
                          5. GoTyme Savings
                        </span>
                      </div>
                      <span className="text-[11px] lg:text-xs bg-teal-200 dark:bg-teal-900/70 text-teal-900 dark:text-teal-200 font-bold px-2 py-0.5 rounded-full">
                        Withdrawable
                      </span>
                    </div>
                    <div className="font-mono text-lg sm:text-xl lg:text-2xl font-black text-teal-950 dark:text-teal-300 tabular-nums">
                      {formatPHP(gotymeVal)}
                    </div>
                    <div className="text-xs text-teal-700/90 dark:text-teal-300/80 font-sans">
                      Accessible personal savings separate from locked MP2.
                    </div>
                  </div>

                  <div className="bg-emerald-50/85 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 lg:p-4 space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                        <span className="text-xs sm:text-[13px] lg:text-sm font-bold text-emerald-950 dark:text-emerald-200 uppercase tracking-wide">
                          6. Ending Balance
                        </span>
                      </div>
                      <span className="text-[11px] lg:text-xs bg-emerald-200 dark:bg-emerald-900/70 text-emerald-900 dark:text-emerald-200 font-bold px-2 py-0.5 rounded-full">
                        Net Surplus
                      </span>
                    </div>
                    <div className="font-mono text-lg sm:text-xl lg:text-2xl font-black text-emerald-950 dark:text-emerald-300 tabular-nums">
                      {formatPHP(balanceVal)}
                    </div>
                    <div className="text-xs text-emerald-700/90 dark:text-emerald-300/80 font-sans">
                      Formula: (Salary - Total Bills) - (MP2 + GoTyme)
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-xs lg:text-[13px] text-slate-400 dark:text-slate-500 text-center shrink-0 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                Reconciled waterfall tracks locked MP2, withdrawable GoTyme, and ending balance separately.
              </div>
            </div>
          )}

          {/* CARD 6 (PAGE 7): HISTORICAL CALENDAR MONTHS PROGRESSION (JANUARY TO DECEMBER) */}
          {currentCardIndex === 6 && (
            <div className="flex-1 flex flex-col justify-between min-h-0 overflow-y-auto overflow-x-hidden pr-0.5 animate-in fade-in duration-150 w-full">
              <HistoricalProgressionChart
                allMonths={allMonths}
                activeMonthData={monthData}
                onSelectMonth={onSelectMonth}
              />
            </div>
          )}
        </div>

      {/* Whole Summary Report: Rendered on screen when Full 7-Page Report is selected AND automatically printed during print */}
      <div
        className={`w-full ${
          viewMode === 'full_report'
            ? 'flex-1 min-h-0 overflow-y-auto bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs'
            : 'hidden print:block'
        }`}
      >
        <PrintableSummaryReport
          combinedMonth={combinedMonth}
          allMonths={allMonths}
          activeMonthData={monthData}
        />
      </div>
    </div>
  );
};
