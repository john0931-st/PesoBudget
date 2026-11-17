import React, { useMemo, useState } from 'react';
import { MonthData } from '../types/budget';
import { formatPHP } from '../utils/currency';
import {
  groupSheetsByCalendarMonth,
  extractMonthKey,
} from '../utils/monthGrouping';

interface HistoricalProgressionChartProps {
  allMonths?: Record<string, MonthData>;
  activeMonthData?: MonthData;
  onSelectMonth?: (monthId: string) => void;
}

const MONTHS_JAN_TO_DEC = [
  { index: 0, num: '01', short: 'Jan', full: 'January' },
  { index: 1, num: '02', short: 'Feb', full: 'February' },
  { index: 2, num: '03', short: 'Mar', full: 'March' },
  { index: 3, num: '04', short: 'Apr', full: 'April' },
  { index: 4, num: '05', short: 'May', full: 'May' },
  { index: 5, num: '06', short: 'Jun', full: 'June' },
  { index: 6, num: '07', short: 'Jul', full: 'July' },
  { index: 7, num: '08', short: 'Aug', full: 'August' },
  { index: 8, num: '09', short: 'Sep', full: 'September' },
  { index: 9, num: '10', short: 'Oct', full: 'October' },
  { index: 10, num: '11', short: 'Nov', full: 'November' },
  { index: 11, num: '12', short: 'Dec', full: 'December' },
];

export const HistoricalProgressionChart: React.FC<HistoricalProgressionChartProps> = ({
  allMonths = {},
  activeMonthData,
  onSelectMonth,
}) => {
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  // Group all sheets by calendar month
  const groupedMonths = useMemo(() => {
    return groupSheetsByCalendarMonth(allMonths);
  }, [allMonths]);

  // Determine active reference year
  const activeYear = useMemo(() => {
    const sheets = Object.values(allMonths);
    for (const s of sheets) {
      const extracted = extractMonthKey(s);
      if (extracted.year) return extracted.year;
    }
    return 2026;
  }, [allMonths]);

  // Build the strict 12-month January to December array
  const fullYearMonths = useMemo(() => {
    return MONTHS_JAN_TO_DEC.map((m) => {
      const targetKey = `${activeYear}-${m.num}`;

      // Try exact year-month key, then fallback to match by monthIndex across groupedMonths
      const cm =
        groupedMonths[targetKey] ||
        Object.values(groupedMonths).find((g) => {
          if (g.sheets[0]) {
            return extractMonthKey(g.sheets[0]).monthIndex === m.index;
          }
          return false;
        });

      if (cm) {
        return {
          key: cm.monthKey || targetKey,
          short: m.short,
          full: m.full,
          year: activeYear,
          hasData: true,
          expenses: cm.totalExpenses,
          salary: cm.salaryVal,
          balance: cm.balanceVal,
          governmentSavings: cm.governmentSavings,
          personalSavings: cm.personalSavings,
          sheetCount: cm.sheetCount,
          firstSheetId: cm.sheets[0]?.id,
          isCurrent:
            activeMonthData &&
            (cm.monthKey === extractMonthKey(activeMonthData).key ||
              cm.sheets.some((s) => s.id === activeMonthData.id)),
        };
      }

      return {
        key: targetKey,
        short: m.short,
        full: m.full,
        year: activeYear,
        hasData: false,
        expenses: 0,
        salary: 0,
        balance: 0,
        governmentSavings: 0,
        personalSavings: 0,
        sheetCount: 0,
        firstSheetId: undefined,
        isCurrent: false,
      };
    });
  }, [groupedMonths, activeYear, activeMonthData]);

  // Calculate dynamic Y-axis scale based on highest recorded value
  const highestValue = Math.max(
    ...fullYearMonths.map((d) => Math.max(d.expenses, d.salary)),
    20000
  );
  const step = highestValue > 80000 ? 25000 : highestValue > 40000 ? 15000 : 10000;
  const yMax = Math.ceil(highestValue / step) * step;
  const yTicks = [yMax, yMax * 0.75, yMax * 0.5, yMax * 0.25, 0];

  // Total recorded months count with active data
  const recordedCount = fullYearMonths.filter((d) => d.hasData).length;
  const totalYearSalary = fullYearMonths.reduce((acc, d) => acc + d.salary, 0);
  const totalYearExpenses = fullYearMonths.reduce((acc, d) => acc + d.expenses, 0);

  return (
    <div className="space-y-2 animate-in fade-in duration-150 w-full select-none">
      {/* Header & Legend */}
      <div className="border-b border-slate-100 dark:border-slate-800 pb-1.5 lg:pb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xs sm:text-sm lg:text-base xl:text-lg font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
              January to December Historical Progression
            </h3>
            <span className="font-mono text-[10px] lg:text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              {recordedCount}/12 Months
            </span>
          </div>
          <p className="text-[10px] lg:text-xs xl:text-sm text-slate-500 dark:text-slate-400">
            Compact 12-month calendar view with all months, salaries, and expenses visible simultaneously
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs lg:text-sm font-mono self-start sm:self-auto shrink-0">
          <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
            <span className="w-2.5 h-2.5 lg:w-3 lg:h-3 bg-slate-900 dark:bg-sky-400 rounded-xs inline-block shadow-2xs" />
            <span className="font-sans font-semibold text-[10px] lg:text-xs">Expenses</span>
          </span>
          <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
            <span className="w-2.5 h-2.5 lg:w-3 lg:h-3 bg-emerald-600 dark:bg-emerald-500 rounded-xs inline-block shadow-2xs" />
            <span className="font-sans font-semibold text-[10px] lg:text-xs">Salary</span>
          </span>
        </div>
      </div>

      {/* Main Chart Box */}
      <div className="bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-2 sm:p-2.5 lg:p-4 space-y-1.5 lg:space-y-2.5">
        {/* Graph Area */}
        <div className="relative flex h-36 sm:h-44 lg:h-56 xl:h-64">
          {/* Y-Axis Label Column */}
          <div className="w-11 sm:w-14 lg:w-16 flex flex-col justify-between items-end pr-1.5 sm:pr-2 py-0.5 select-none shrink-0 border-r border-slate-200 dark:border-slate-700">
            {yTicks.map((tick, i) => (
              <span
                key={i}
                className="text-[9px] sm:text-[10px] lg:text-xs font-mono font-medium text-slate-400 dark:text-slate-500 tabular-nums leading-none"
              >
                {tick === 0 ? '₱0' : `₱${Math.round(tick / 1000)}k`}
              </span>
            ))}
          </div>

          {/* 12-Month Plot Area */}
          <div className="relative flex-1 flex flex-col justify-between pl-1.5 sm:pl-3">
            {/* Dotted Horizontal Grid Lines */}
            <div className="absolute inset-x-1.5 sm:inset-x-3 inset-y-0.5 flex flex-col justify-between pointer-events-none z-0">
              {yTicks.map((_, i) => (
                <div
                  key={i}
                  className="w-full border-b border-dashed border-slate-300 dark:border-slate-700"
                />
              ))}
            </div>

            {/* 12 Columns Grid (Jan to Dec) */}
            <div className="relative z-10 w-full h-full grid grid-cols-12 gap-0.5 sm:gap-1.5 items-end pt-2 pb-0.5">
              {fullYearMonths.map((d) => {
                const expHeight = d.hasData
                  ? Math.max(5, Math.min(100, (d.expenses / yMax) * 100))
                  : 0;
                const salHeight = d.hasData
                  ? Math.max(5, Math.min(100, (d.salary / yMax) * 100))
                  : 0;
                const isSelected = selectedMonthKey === d.key;

                return (
                  <div
                    key={d.key}
                    onClick={() => {
                      setSelectedMonthKey(d.key);
                      if (d.firstSheetId) onSelectMonth?.(d.firstSheetId);
                    }}
                    className={`flex flex-col items-center justify-end h-full w-full rounded transition-all cursor-pointer group py-0.5 px-0.5 ${
                      d.isCurrent || isSelected
                        ? 'bg-slate-200/80 dark:bg-slate-800/80 ring-1 ring-slate-400 dark:ring-slate-600 font-bold'
                        : d.hasData
                        ? 'hover:bg-slate-100/90 dark:hover:bg-slate-800/60'
                        : 'opacity-65 hover:opacity-100'
                    }`}
                    title={`${d.full} ${d.year}\n${
                      d.hasData
                        ? `Gross Salary: ${formatPHP(d.salary)}\nTotal Bills: ${formatPHP(d.expenses)}\nSurplus: ${formatPHP(d.balance)} (${d.sheetCount} sheets)`
                        : 'No records for this month'
                    }`}
                  >
                    {/* Paired Vertical Bars */}
                    <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 h-full pb-1">
                      {/* Expenses Bar */}
                      <div className="flex flex-col items-center flex-1 max-w-[14px] sm:max-w-[18px] lg:max-w-[22px] h-full justify-end">
                        {d.hasData && expHeight > 0 ? (
                          <div
                            className="w-full bg-slate-900 dark:bg-sky-400 rounded-t-xs transition-all duration-300 group-hover:bg-black dark:group-hover:bg-sky-300 shadow-2xs relative group/bar"
                            style={{ height: `${expHeight}%` }}
                          >
                            {/* Hover tooltip badge */}
                            <div className="opacity-0 group-hover/bar:opacity-100 transition-opacity absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-900 dark:bg-slate-950 text-white border border-transparent dark:border-slate-700 text-[9px] lg:text-xs font-mono px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-30">
                              Exp: {formatPHP(d.expenses)}
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-0.5 bg-slate-300/80 dark:bg-slate-700 rounded-xs" />
                        )}
                      </div>

                      {/* Salary Bar */}
                      <div className="flex flex-col items-center flex-1 max-w-[14px] sm:max-w-[18px] lg:max-w-[22px] h-full justify-end">
                        {d.hasData && salHeight > 0 ? (
                          <div
                            className="w-full bg-emerald-600 dark:bg-emerald-500 rounded-t-xs transition-all duration-300 group-hover:bg-emerald-700 dark:group-hover:bg-emerald-400 shadow-2xs relative group/bar"
                            style={{ height: `${salHeight}%` }}
                          >
                            {/* Hover tooltip badge */}
                            <div className="opacity-0 group-hover/bar:opacity-100 transition-opacity absolute -top-6 left-1/2 -translate-x-1/2 bg-emerald-800 dark:bg-emerald-950 text-white border border-transparent dark:border-emerald-700 text-[9px] lg:text-xs font-mono px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-30">
                              Sal: {formatPHP(d.salary)}
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-0.5 bg-slate-300/80 dark:bg-slate-700 rounded-xs" />
                        )}
                      </div>
                    </div>

                    {/* Month Label (Jan - Dec) */}
                    <div
                      className={`text-[9px] sm:text-[11px] lg:text-xs xl:text-sm truncate w-full text-center transition-colors ${
                        d.hasData
                          ? 'font-bold text-slate-900 dark:text-slate-100'
                          : 'font-medium text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {d.short}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend & Total Summary Strip */}
        <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs lg:text-sm text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-1.5 text-[11px] lg:text-xs xl:text-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            <span>Full 12-Month Calendar Year ({activeYear})</span>
          </div>

          <div className="flex items-center gap-3 font-mono text-[11px] lg:text-xs xl:text-sm">
            <span className="text-slate-700 dark:text-slate-300">
              Year Bills: <strong className="text-slate-900 dark:text-sky-300">{formatPHP(totalYearExpenses)}</strong>
            </span>
            <span>·</span>
            <span className="text-emerald-700 dark:text-emerald-400">
              Year Salary: <strong className="text-emerald-900 dark:text-emerald-300">{formatPHP(totalYearSalary)}</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
