import React, { useMemo, useState } from 'react';
import { MonthData } from '../types/budget';
import { formatPHP } from '../utils/currency';
import { useCurrency } from '../hooks/useCurrency';
import {
  groupSheetsByCalendarMonth,
  extractMonthKey,
  extractDynamicRowLabels,
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
  const { currency } = useCurrency();
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  const groupedMonths = useMemo(() => {
    return groupSheetsByCalendarMonth(allMonths, activeMonthData);
  }, [allMonths, activeMonthData]);

  const rowLabels = useMemo(() => {
    const sheets = Object.values(allMonths);
    return extractDynamicRowLabels(sheets, activeMonthData);
  }, [allMonths, activeMonthData]);

  const salaryLabel = rowLabels.salary;
  const mp2Label = rowLabels.mp2;
  const gotymeLabel = rowLabels.gotyme;
  const balanceLabel = rowLabels.balance;

  const activeYear = useMemo(() => {
    if (activeMonthData?.year) return activeMonthData.year;
    const sheets = Object.values(allMonths);
    for (const s of sheets) {
      const extracted = extractMonthKey(s);
      if (extracted.year) return extracted.year;
    }
    return 2026;
  }, [allMonths, activeMonthData]);

  const fullYearMonths = useMemo(() => {
    return MONTHS_JAN_TO_DEC.map((m) => {
      const targetKey = `${activeYear}-${m.num}`;

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
          mp2: Math.abs(cm.governmentSavings),
          gotyme: Math.abs(cm.gotymeVal),
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
        mp2: 0,
        gotyme: 0,
        sheetCount: 0,
        firstSheetId: undefined,
        isCurrent: false,
      };
    });
  }, [groupedMonths, activeYear, activeMonthData]);

  const highestValue = Math.max(
    ...fullYearMonths.map((d) => Math.max(d.expenses, d.salary)),
    20000
  );
  const step = highestValue > 80000 ? 25000 : highestValue > 40000 ? 15000 : 10000;
  const yMax = Math.ceil(highestValue / step) * step;
  const yTicks = [yMax, yMax * 0.75, yMax * 0.5, yMax * 0.25, 0];

  const recordedCount = fullYearMonths.filter((d) => d.hasData).length;
  const totalYearSalary = fullYearMonths.reduce((acc, d) => acc + d.salary, 0);
  const totalYearExpenses = fullYearMonths.reduce((acc, d) => acc + d.expenses, 0);

  const totalYearMp2 = fullYearMonths.reduce((acc, d) => acc + (d.hasData ? d.mp2 : 0), 0);
  const totalYearGotyme = fullYearMonths.reduce((acc, d) => acc + (d.hasData ? d.gotyme : 0), 0);

  const highestSavings = Math.max(
    ...fullYearMonths.map((d) => Math.max(d.mp2, d.gotyme)),
    2000
  );
  const savStep =
    highestSavings > 40000
      ? 10000
      : highestSavings > 15000
      ? 5000
      : highestSavings > 5000
      ? 2000
      : 1000;
  const savMax = Math.ceil(highestSavings / savStep) * savStep;
  const savTicks = [savMax, savMax * 0.75, savMax * 0.5, savMax * 0.25, 0];

  const formatCompactTick = (val: number) => {
    const sym = currency.symbol.trim();
    if (val === 0) return `${sym}0`;
    const absVal = Math.abs(val);
    let label: string;
    if (absVal >= 1000) {
      const k = absVal / 1000;
      label = Number.isInteger(k) ? `${k}k` : `${Number(k.toFixed(1))}k`;
    } else {
      label = `${Math.round(absVal)}`;
    }
    return val < 0 ? `${sym}-${label}` : `${sym}${label}`;
  };

  return (
    <div className="flex-1 flex flex-col justify-between gap-2.5 lg:gap-3 min-h-0 animate-in fade-in duration-150 w-full select-none">
      {/* Header */}
      <div className="border-b border-slate-100 dark:border-slate-800 pb-1.5 lg:pb-2 flex flex-wrap items-center justify-between gap-1.5 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm sm:text-base lg:text-lg font-extrabold text-slate-900 dark:text-slate-100 uppercase tracking-wide">
            January to December Historical Progression
          </h3>
          <span className="font-mono tabular-nums text-xs font-semibold text-slate-600 dark:text-slate-300">
            · {recordedCount}/12 Months
          </span>
        </div>
      </div>

      {/* Top Chart Box: Monthly Salary vs Expenses */}
      <div className="flex-1 min-h-[180px] flex flex-col justify-between bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-2 sm:p-2.5 lg:p-3.5 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-[13px] lg:text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
              {salaryLabel} vs Expenses
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] lg:text-xs font-sans font-semibold">
            <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
              <span className="w-2.5 h-2.5 bg-emerald-600 dark:bg-emerald-500 rounded-xs inline-block" />
              <span>{salaryLabel}</span>
            </span>
            <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">
              <span className="w-2.5 h-2.5 bg-slate-900 dark:bg-sky-400 rounded-xs inline-block" />
              <span>Expenses</span>
            </span>
          </div>
        </div>

        {/* Graph Area */}
        <div className="relative flex flex-1 min-h-[118px] sm:min-h-[140px]">
          <div className="w-12 sm:w-14 lg:w-16 flex flex-col justify-between items-end pr-1.5 sm:pr-2 py-0.5 select-none shrink-0 border-r border-slate-200 dark:border-slate-700">
            {yTicks.map((tick, i) => (
              <span
                key={i}
                className="text-[11px] lg:text-xs font-mono font-medium text-slate-500 dark:text-slate-400 tabular-nums leading-none"
              >
                {formatCompactTick(tick)}
              </span>
            ))}
          </div>

          <div className="relative flex-1 flex flex-col justify-between pl-1.5 sm:pl-3">
            <div className="absolute inset-x-1.5 sm:inset-x-3 inset-y-0.5 flex flex-col justify-between pointer-events-none z-0">
              {yTicks.map((_, i) => (
                <div
                  key={i}
                  className="w-full border-b border-dashed border-slate-300 dark:border-slate-700"
                />
              ))}
            </div>

            <div className="relative z-10 w-full h-full grid grid-cols-12 gap-0.5 sm:gap-1.5 items-end pt-2 pb-0.5">
              {fullYearMonths.map((d) => {
                const expHeight =
                  d.hasData && d.expenses > 0
                    ? Math.max(5, Math.min(100, (d.expenses / yMax) * 100))
                    : 0;
                const salHeight =
                  d.hasData && d.salary > 0
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
                        ? `${salaryLabel}: ${formatPHP(d.salary)}\nTotal Bills: ${formatPHP(d.expenses)}\n${balanceLabel}: ${formatPHP(d.balance)} (${d.sheetCount} sheets)`
                        : 'No records for this month'
                    }`}
                  >
                    <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 h-full pb-1">
                      <div className="flex flex-col items-center flex-1 max-w-[14px] sm:max-w-[18px] lg:max-w-[22px] h-full justify-end">
                        {d.hasData && salHeight > 0 ? (
                          <div
                            className="w-full bg-emerald-600 dark:bg-emerald-500 rounded-t-xs transition-all duration-300 group-hover:bg-emerald-700 dark:group-hover:bg-emerald-400 shadow-2xs relative group/bar"
                            style={{ height: `${salHeight}%` }}
                          >
                            <div className="opacity-0 group-hover/bar:opacity-100 transition-opacity absolute -top-6 left-1/2 -translate-x-1/2 bg-emerald-800 dark:bg-emerald-950 text-white border border-transparent dark:border-emerald-700 text-[11px] lg:text-xs font-mono tabular-nums px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-30">
                              {salaryLabel}: {formatPHP(d.salary)}
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-0.5 bg-slate-300/80 dark:bg-slate-700 rounded-xs" />
                        )}
                      </div>

                      <div className="flex flex-col items-center flex-1 max-w-[14px] sm:max-w-[18px] lg:max-w-[22px] h-full justify-end">
                        {d.hasData && expHeight > 0 ? (
                          <div
                            className="w-full bg-slate-900 dark:bg-sky-400 rounded-t-xs transition-all duration-300 group-hover:bg-black dark:group-hover:bg-sky-300 shadow-2xs relative group/bar"
                            style={{ height: `${expHeight}%` }}
                          >
                            <div className="opacity-0 group-hover/bar:opacity-100 transition-opacity absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-900 dark:bg-slate-950 text-white border border-transparent dark:border-slate-700 text-[11px] lg:text-xs font-mono tabular-nums px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-30">
                              Exp: {formatPHP(d.expenses)}
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-0.5 bg-slate-300/80 dark:bg-slate-700 rounded-xs" />
                        )}
                      </div>
                    </div>

                    <div
                      className={`text-[11px] sm:text-xs lg:text-[13px] truncate w-full text-center transition-colors ${
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

        <div className="pt-1 border-t border-slate-200/70 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-2 text-xs lg:text-sm text-slate-600 dark:text-slate-400 shrink-0">
          <div className="text-xs lg:text-[13px] font-medium text-slate-600 dark:text-slate-300">
            Cash Flow Overview ({activeYear})
          </div>

          <div className="flex items-center gap-3 font-mono tabular-nums text-[11px] lg:text-xs xl:text-sm">
            <span className="text-emerald-700 dark:text-emerald-400">
              {salaryLabel}: <strong className="text-emerald-900 dark:text-emerald-300">{formatPHP(totalYearSalary)}</strong>
            </span>
            <span>·</span>
            <span className="text-slate-700 dark:text-slate-300">
              Bills: <strong className="text-slate-900 dark:text-sky-300">{formatPHP(totalYearExpenses)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Chart Box: Monthly Dynamic Locked Savings (MP2) vs Withdrawable Savings (GoTyme / MariBank) */}
      <div className="flex-1 min-h-[180px] flex flex-col justify-between bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-2 sm:p-2.5 lg:p-3.5 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-[13px] lg:text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
              {mp2Label} (Locked) vs {gotymeLabel} (Withdrawable)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] lg:text-xs font-sans font-semibold">
            <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 whitespace-nowrap">
              <span className="w-2.5 h-2.5 bg-amber-500 dark:bg-amber-400 rounded-xs inline-block" />
              <span>{mp2Label}</span>
            </span>
            <span className="flex items-center gap-1.5 text-teal-700 dark:text-teal-400 whitespace-nowrap">
              <span className="w-2.5 h-2.5 bg-teal-600 dark:bg-teal-400 rounded-xs inline-block" />
              <span>{gotymeLabel}</span>
            </span>
          </div>
        </div>

        <div className="relative flex flex-1 min-h-[118px] sm:min-h-[140px]">
          <div className="w-12 sm:w-14 lg:w-16 flex flex-col justify-between items-end pr-1.5 sm:pr-2 py-0.5 select-none shrink-0 border-r border-slate-200 dark:border-slate-700">
            {savTicks.map((tick, i) => (
              <span
                key={i}
                className="text-[11px] lg:text-xs font-mono font-medium text-slate-500 dark:text-slate-400 tabular-nums leading-none"
              >
                {formatCompactTick(tick)}
              </span>
            ))}
          </div>

          <div className="relative flex-1 flex flex-col justify-between pl-1.5 sm:pl-3">
            <div className="absolute inset-x-1.5 sm:inset-x-3 inset-y-0.5 flex flex-col justify-between pointer-events-none z-0">
              {savTicks.map((_, i) => (
                <div
                  key={i}
                  className="w-full border-b border-dashed border-slate-300 dark:border-slate-700"
                />
              ))}
            </div>

            <div className="relative z-10 w-full h-full grid grid-cols-12 gap-0.5 sm:gap-1.5 items-end pt-2 pb-0.5">
              {fullYearMonths.map((d) => {
                const mp2Height =
                  d.hasData && d.mp2 > 0
                    ? Math.max(5, Math.min(100, (d.mp2 / savMax) * 100))
                    : 0;
                const gotymeHeight =
                  d.hasData && d.gotyme > 0
                    ? Math.max(5, Math.min(100, (d.gotyme / savMax) * 100))
                    : 0;
                const isSelected = selectedMonthKey === d.key;

                return (
                  <div
                    key={`sav_${d.key}`}
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
                        ? `${mp2Label} (Locked): ${formatPHP(d.mp2)}\n${gotymeLabel} (Withdrawable): ${formatPHP(d.gotyme)}`
                        : 'No records for this month'
                    }`}
                  >
                    <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 h-full pb-1">
                      <div className="flex flex-col items-center flex-1 max-w-[14px] sm:max-w-[18px] lg:max-w-[22px] h-full justify-end">
                        {d.hasData && mp2Height > 0 ? (
                          <div
                            className="w-full bg-amber-500 dark:bg-amber-400 rounded-t-xs transition-all duration-300 group-hover:bg-amber-600 dark:group-hover:bg-amber-300 shadow-2xs relative group/bar"
                            style={{ height: `${mp2Height}%` }}
                          >
                            <div className="opacity-0 group-hover/bar:opacity-100 transition-opacity absolute -top-6 left-1/2 -translate-x-1/2 bg-amber-900 dark:bg-amber-950 text-white border border-transparent dark:border-amber-700 text-[11px] lg:text-xs font-mono tabular-nums px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-30">
                              {mp2Label}: {formatPHP(d.mp2)}
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-0.5 bg-slate-300/80 dark:bg-slate-700 rounded-xs" />
                        )}
                      </div>

                      <div className="flex flex-col items-center flex-1 max-w-[14px] sm:max-w-[18px] lg:max-w-[22px] h-full justify-end">
                        {d.hasData && gotymeHeight > 0 ? (
                          <div
                            className="w-full bg-teal-600 dark:bg-teal-400 rounded-t-xs transition-all duration-300 group-hover:bg-teal-700 dark:group-hover:bg-teal-300 shadow-2xs relative group/bar"
                            style={{ height: `${gotymeHeight}%` }}
                          >
                            <div className="opacity-0 group-hover/bar:opacity-100 transition-opacity absolute -top-6 left-1/2 -translate-x-1/2 bg-teal-900 dark:bg-teal-950 text-white border border-transparent dark:border-teal-700 text-[11px] lg:text-xs font-mono tabular-nums px-1.5 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-30">
                              {gotymeLabel}: {formatPHP(d.gotyme)}
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-0.5 bg-slate-300/80 dark:bg-slate-700 rounded-xs" />
                        )}
                      </div>
                    </div>

                    <div
                      className={`text-[11px] sm:text-xs lg:text-[13px] truncate w-full text-center transition-colors ${
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

        <div className="pt-1 border-t border-slate-200/70 dark:border-slate-700/70 flex flex-wrap items-center justify-between gap-2 text-xs lg:text-sm text-slate-600 dark:text-slate-400 shrink-0">
          <div className="text-xs lg:text-[13px] font-medium text-slate-600 dark:text-slate-300">
            Non-withdrawable ({mp2Label}) vs Withdrawable ({gotymeLabel})
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-[11px] lg:text-xs xl:text-sm">
            <span className="text-amber-700 dark:text-amber-400">
              {mp2Label}: <strong className="text-amber-900 dark:text-amber-300">{formatPHP(totalYearMp2)}</strong>
            </span>
            <span>·</span>
            <span className="text-teal-700 dark:text-teal-400">
              {gotymeLabel}: <strong className="text-teal-900 dark:text-teal-300">{formatPHP(totalYearGotyme)}</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
