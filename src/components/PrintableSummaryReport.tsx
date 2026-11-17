import React from 'react';
import { MonthData } from '../types/budget';
import { formatPHP } from '../utils/currency';
import { useCurrency } from '../hooks/useCurrency';
import {
  CombinedMonthData,
  groupSheetsByCalendarMonth,
  extractMonthKey,
} from '../utils/monthGrouping';
import {
  Landmark,
  Wallet,
  PiggyBank,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  TrendingUp,
  CreditCard,
  Calendar,
  FileSpreadsheet,
} from 'lucide-react';

interface PrintableSummaryReportProps {
  combinedMonth: CombinedMonthData;
  allMonths: Record<string, MonthData>;
  activeMonthData: MonthData;
}

export const PrintableSummaryReport: React.FC<PrintableSummaryReportProps> = ({
  combinedMonth,
  allMonths,
  activeMonthData,
}) => {
  useCurrency();
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
    settledAmount,
    nextPayrollAmount,
    settledCount,
    nextPayrollCount,
    settlementPercent,
    savingsRate,
    govSavingsRate,
    expenseCategories,
    cutoffSummaries,
    sheets,
    displayName,
    tableTitle,
    sheetCount,
  } = combinedMonth;

  const plannedTotal = plannedMetrobank + plannedQrPh;

  // Group historical progression
  const groupedMonths = groupSheetsByCalendarMonth(allMonths);
  const historicalList = Object.values(groupedMonths).map((cm) => ({
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
  }));

  const fallbackHistorical =
    historicalList.length > 0
      ? historicalList
      : Object.values(allMonths).map((s) => ({
          key: s.id,
          name: s.name,
          tableTitle: s.sheetTitle || s.name,
          sheetCount: 1,
          expenses: s.rows['total']?.cutoff15th?.value || s.rows['total']?.monthly?.value || 0,
          salary: s.rows['salary']?.cutoff15th?.value || s.rows['salary']?.monthly?.value || 0,
          govSavings: s.rows['mp2']?.cutoff15th?.value || s.rows['mp2']?.monthly?.value || 0,
          personalSavings:
            (s.rows['gotyme']?.cutoff15th?.value || s.rows['gotyme']?.monthly?.value || 0) +
            (s.rows['balance']?.cutoff15th?.value || s.rows['balance']?.monthly?.value || 0),
          totalSavings:
            (s.rows['mp2']?.cutoff15th?.value || s.rows['mp2']?.monthly?.value || 0) +
            (s.rows['gotyme']?.cutoff15th?.value || s.rows['gotyme']?.monthly?.value || 0) +
            (s.rows['balance']?.cutoff15th?.value || s.rows['balance']?.monthly?.value || 0),
          balance: s.rows['balance']?.cutoff15th?.value || s.rows['balance']?.monthly?.value || 0,
        }));

  return (
    <div className="w-full bg-white text-slate-800 space-y-6 print:space-y-6 font-sans">
      {/* =========================================================================
          EXECUTIVE MASTER HEADER
         ========================================================================= */}
      <div className="border-b-2 border-slate-900 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
              ₱
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase">
              Overall Financial Summary & Executive Analytics
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Complete 7-Page Multi-Section Report · Aggregated across {sheetCount} sheet{sheetCount > 1 ? 's' : ''} ({sheets.map((s) => s.name).join(' + ')})
          </p>
        </div>
        <div className="text-right font-mono text-xs">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 block">Report Generated</span>
          <span className="font-bold text-slate-700">
            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* =========================================================================
          SECTION 1 (PAGE 1): FINANCIAL SNAPSHOT & KEY METRICS
         ========================================================================= */}
      <div className="space-y-3 break-inside-avoid">
        <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-bold text-[10px] uppercase">
              Section 1 (Page 1)
            </span>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              Financial Snapshot & Key Metrics
            </h2>
          </div>
          <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
            Net Surplus: {formatPHP(balanceVal)}
          </span>
        </div>

        {/* 5 KPI Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {/* Total Bills */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
            <span className="text-[10px] font-semibold text-slate-500 uppercase block">1. Total Monthly Bills</span>
            <div className="font-mono text-lg font-black text-slate-900 mt-1 tabular-nums">
              {formatPHP(Math.abs(totalExpenses))}
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">Rent, utilities, loans & Lazada</span>
          </div>

          {/* Metrobank Cash */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3">
            <span className="text-[10px] font-semibold text-blue-800 uppercase block">2. Metrobank ATM Cash</span>
            <div className="font-mono text-lg font-black text-blue-700 mt-1 tabular-nums">
              {formatPHP(plannedMetrobank)}
            </div>
            <span className="text-[10px] text-blue-700 block mt-0.5">Physical cash for bills</span>
          </div>

          {/* QR PH */}
          <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-3">
            <span className="text-[10px] font-semibold text-purple-800 uppercase block">3. QR PH Digital</span>
            <div className="font-mono text-lg font-black text-purple-700 mt-1 tabular-nums">
              {formatPHP(plannedQrPh)}
            </div>
            <span className="text-[10px] text-purple-700 block mt-0.5">Digital transfer for Lazada</span>
          </div>

          {/* Pag-IBIG MP2 */}
          <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3">
            <span className="text-[10px] font-semibold text-emerald-800 uppercase block">4. Gov (Pag-IBIG MP2)</span>
            <div className="font-mono text-lg font-black text-emerald-950 mt-1 tabular-nums">
              {formatPHP(Math.abs(governmentSavings))}
            </div>
            <span className="text-[10px] text-emerald-700 block mt-0.5">{govSavingsRate}% of total salary</span>
          </div>

          {/* Personal Savings */}
          <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-3">
            <span className="text-[10px] font-semibold text-indigo-800 uppercase block">5. Personal Savings</span>
            <div className="font-mono text-lg font-black text-indigo-950 mt-1 tabular-nums">
              {formatPHP(personalSavings)}
            </div>
            <span className="text-[10px] text-indigo-700 block mt-0.5">GoTyme ({formatPHP(gotymeVal)}) + Bal ({formatPHP(balanceVal)})</span>
          </div>
        </div>

        {/* Supporting Metrics Bar */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div>
            <span className="text-slate-500 block text-[10px]">Gross Salary:</span>
            <span className="font-bold text-emerald-700 text-sm">{formatPHP(salaryVal)}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">Total Savings Rate:</span>
            <span className="font-bold text-slate-900 text-sm">{savingsRate}% of salary</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">Settled Bills (OK):</span>
            <span className="font-bold text-emerald-700 text-sm">{settlementPercent}% ({settledCount} items)</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">Deferred to Next Payroll:</span>
            <span className="font-bold text-amber-700 text-sm">{formatPHP(nextPayrollAmount)} ({nextPayrollCount} items)</span>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 2 (PAGE 2): 15-DAY CUTOFFS CONTRIBUTION
         ========================================================================= */}
      <div className="space-y-3 break-inside-avoid">
        <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-bold text-[10px] uppercase">
              Section 2 (Page 2)
            </span>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              {tableTitle} - 15-Day Cutoffs Contribution & Settlement
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {sheetCount} Cutoff Sheets Combined
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                <th className="py-2.5 px-3">Cutoff Period</th>
                <th className="py-2.5 px-3">Sheet Name</th>
                <th className="py-2.5 px-3 text-right">Total Expenses</th>
                <th className="py-2.5 px-3 text-right">Gross Salary</th>
                <th className="py-2.5 px-3 text-right">Pag-IBIG MP2</th>
                <th className="py-2.5 px-3 text-right">Personal Savings</th>
                <th className="py-2.5 px-3 text-right">Ending Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
              {cutoffSummaries.map((cutoff, idx) => (
                <tr key={cutoff.id} className="hover:bg-slate-50/60">
                  <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">
                    Cutoff {idx + 1} ({cutoff.cutoffLabel})
                  </td>
                  <td className="py-2.5 px-3 font-sans text-slate-600">{cutoff.name}</td>
                  <td className="py-2.5 px-3 text-right text-rose-700 font-bold">{formatPHP(cutoff.expenses)}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-700 font-bold">{formatPHP(cutoff.salary)}</td>
                  <td className="py-2.5 px-3 text-right text-teal-700 font-bold">{formatPHP(cutoff.govSavings)}</td>
                  <td className="py-2.5 px-3 text-right text-indigo-700 font-bold">{formatPHP(cutoff.personalSavings)}</td>
                  <td className="py-2.5 px-3 text-right font-bold">{formatPHP(cutoff.endingBalance)}</td>
                </tr>
              ))}
              <tr className="bg-emerald-50/60 font-bold text-slate-900 border-t-2 border-emerald-300">
                <td className="py-2.5 px-3 font-sans uppercase">Full Month Total</td>
                <td className="py-2.5 px-3 font-sans text-emerald-800">{sheetCount} Sheets Combined</td>
                <td className="py-2.5 px-3 text-right text-rose-800 font-black">{formatPHP(Math.abs(totalExpenses))}</td>
                <td className="py-2.5 px-3 text-right text-emerald-800 font-black">{formatPHP(salaryVal)}</td>
                <td className="py-2.5 px-3 text-right text-teal-800 font-black">{formatPHP(Math.abs(governmentSavings))}</td>
                <td className="py-2.5 px-3 text-right text-indigo-800 font-black">{formatPHP(personalSavings)}</td>
                <td className="py-2.5 px-3 text-right font-black">{formatPHP(balanceVal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          SECTION 3 (PAGE 3): EXPENSE CATEGORY BREAKDOWN
         ========================================================================= */}
      <div className="space-y-3 break-inside-avoid">
        <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-bold text-[10px] uppercase">
              Section 3 (Page 3)
            </span>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              {tableTitle} - Expense Category Share & Distribution
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            Total Bills: {formatPHP(Math.abs(totalExpenses))}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {expenseCategories.map((item) => {
            const pct = totalExpenses > 0 ? (item.amount / totalExpenses) * 100 : 0;
            return (
              <div key={item.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-slate-900">{item.label}</span>
                  <span className="font-mono font-bold text-slate-900 text-xs">{formatPHP(item.amount)}</span>
                </div>
                <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-slate-800" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>Share of Total Bills:</span>
                  <span className="font-mono font-bold text-slate-700">{pct.toFixed(1)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          SECTION 4 (PAGE 4): CASH OUTFLOWS (METROBANK & QR PH)
         ========================================================================= */}
      <div className="space-y-3 break-inside-avoid">
        <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-bold text-[10px] uppercase">
              Section 4 (Page 4)
            </span>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              {tableTitle} - Cash Outflows: Metrobank ATM & QR PH Digital
            </h2>
          </div>
          <span className="font-mono text-xs font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded">
            Planned Outflow: {formatPHP(plannedTotal)}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Planned Channels */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-2">
              Planned Outflow Channels
            </div>
            <div className="flex justify-between p-2.5 bg-white rounded-lg border border-slate-200 font-mono text-xs">
              <span className="font-sans font-medium text-slate-700">Metrobank (Withdrawn Cash):</span>
              <strong className="text-blue-700 font-bold">{formatPHP(plannedMetrobank)}</strong>
            </div>
            <div className="flex justify-between p-2.5 bg-white rounded-lg border border-slate-200 font-mono text-xs">
              <span className="font-sans font-medium text-slate-700">QR PH (Digital Payment for Lazada):</span>
              <strong className="text-purple-700 font-bold">{formatPHP(plannedQrPh)}</strong>
            </div>
            <div className="flex justify-between p-2.5 bg-emerald-50 rounded-lg border border-emerald-200 font-mono text-xs">
              <span className="font-sans font-bold text-emerald-900">Total Planned Obligations:</span>
              <strong className="text-emerald-950 font-black">{formatPHP(plannedTotal)}</strong>
            </div>
          </div>

          {/* Settlement Progress */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                Settlement Status
              </div>
              <span className="font-mono text-xs font-bold text-emerald-700">
                {settlementPercent}% Settled
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-xs">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                <span className="text-[10px] text-emerald-800 block font-sans">OK (Settled):</span>
                <span className="font-bold text-emerald-900 text-sm block mt-0.5">{formatPHP(settledAmount)}</span>
                <span className="text-[10px] text-emerald-700">{settledCount} items</span>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <span className="text-[10px] text-amber-800 block font-sans">Next Payroll:</span>
                <span className="font-bold text-amber-900 text-sm block mt-0.5">{formatPHP(nextPayrollAmount)}</span>
                <span className="text-[10px] text-amber-700">{nextPayrollCount} items</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 5 (PAGE 5): EXECUTIVE SAVINGS & STASH BREAKDOWN
         ========================================================================= */}
      <div className="space-y-3 break-inside-avoid">
        <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-bold text-[10px] uppercase">
              Section 5 (Page 5)
            </span>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              {tableTitle} - Savings Portfolio: Government vs Personal
            </h2>
          </div>
          <span className="font-mono text-xs font-bold text-emerald-950 bg-emerald-100 px-2.5 py-0.5 rounded">
            Total Combined Stash: {formatPHP(totalCombinedSavings)}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Government Savings */}
          <div className="bg-emerald-50/80 border border-emerald-300 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-950 uppercase">Government Savings</span>
              <span className="text-[10px] bg-emerald-200 text-emerald-900 font-bold px-2 py-0.5 rounded-full">
                Pag-IBIG MP2
              </span>
            </div>
            <div className="font-mono text-xl font-black text-emerald-950">
              {formatPHP(Math.abs(governmentSavings))}
            </div>
            <p className="text-[11px] text-emerald-800 bg-white/70 p-2.5 rounded-lg border border-emerald-200/60 leading-relaxed">
              100% Tax-free government guaranteed dividend fund (averages 6.5% – 7.5% annual yield with 5-year lock-in maturity).
            </p>
          </div>

          {/* Personal Savings */}
          <div className="bg-indigo-50/80 border border-indigo-300 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-950 uppercase">Personal Savings</span>
              <span className="text-[10px] bg-indigo-200 text-indigo-900 font-bold px-2 py-0.5 rounded-full">
                GoTyme + Ending Balance
              </span>
            </div>
            <div className="font-mono text-xl font-black text-indigo-950">
              {formatPHP(personalSavings)}
            </div>
            <div className="text-[11px] text-indigo-800 bg-white/70 p-2.5 rounded-lg border border-indigo-200/60 font-mono space-y-1">
              <div className="flex justify-between">
                <span>• GoTyme Go Save Stash:</span>
                <span className="font-bold">{formatPHP(gotymeVal)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Liquid Ending Balance:</span>
                <span className="font-bold">{formatPHP(balanceVal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 6 (PAGE 6): CASH FLOW WATERFALL & NET POSITION
         ========================================================================= */}
      <div className="space-y-3 break-inside-avoid">
        <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-bold text-[10px] uppercase">
              Section 6 (Page 6)
            </span>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              {tableTitle} - Monthly Cash Flow Waterfall & Net Position
            </h2>
          </div>
          <span className="font-mono text-xs font-bold text-indigo-900 bg-indigo-100 px-2.5 py-0.5 rounded">
            Personal Savings: {formatPHP(personalSavings)}
          </span>
        </div>

        {/* 4 Waterfall Stages */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <span className="text-[10px] font-bold text-emerald-800 uppercase block">1. Total Annual Salary</span>
            <div className="font-mono text-base font-extrabold text-emerald-950 my-1">
              {formatPHP(salaryVal)}
            </div>
            <span className="text-[10px] text-emerald-700">Combined payroll cutoffs</span>
          </div>

          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
            <span className="text-[10px] font-bold text-rose-800 uppercase block">2. Total Bills</span>
            <div className="font-mono text-base font-extrabold text-rose-950 my-1">
              {formatPHP(Math.abs(totalExpenses))}
            </div>
            <span className="text-[10px] text-rose-700">Rent, utilities, food & loans</span>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <span className="text-[10px] font-bold text-blue-800 uppercase block">3. Metrobank Cash</span>
            <div className="font-mono text-base font-extrabold text-blue-950 my-1">
              {formatPHP(plannedMetrobank)}
            </div>
            <span className="text-[10px] text-blue-700">Withdrawn ATM Cash</span>
          </div>

          <div className="bg-emerald-50/80 border border-emerald-300 rounded-xl p-3">
            <span className="text-[10px] font-bold text-emerald-900 uppercase block">4. Gov: MP2</span>
            <div className="font-mono text-base font-extrabold text-emerald-950 my-1">
              {formatPHP(Math.abs(governmentSavings))}
            </div>
            <span className="text-[10px] text-emerald-700">Pag-IBIG MP2 Government Stash</span>
          </div>
        </div>

        {/* Final Net Personal Savings Box */}
        <div className="bg-indigo-50/90 border-2 border-indigo-300 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-950 uppercase tracking-wide">
              5. Final Net Personal Savings
            </span>
            <span className="text-[11px] bg-indigo-200 text-indigo-900 font-bold px-2 py-0.5 rounded-full">
              GoTyme + Ending Balance
            </span>
          </div>
          <div className="font-mono text-2xl font-black text-indigo-950">
            {formatPHP(personalSavings)}
          </div>
          <div className="text-xs text-indigo-900 bg-white/80 p-2.5 rounded-lg border border-indigo-200/70 font-mono space-y-1">
            <div className="flex justify-between">
              <span>• GoTyme Go Save Stash:</span>
              <span className="font-bold">{formatPHP(gotymeVal)}</span>
            </div>
            <div className="flex justify-between">
              <span>• Liquid Ending Balance:</span>
              <span className="font-bold">{formatPHP(balanceVal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION 7 (PAGE 7): MULTI-MONTH HISTORICAL PROGRESSION
         ========================================================================= */}
      <div className="space-y-3 break-inside-avoid">
        <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-bold text-[10px] uppercase">
              Section 7 (Page 7)
            </span>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              Multi-Month Historical Progression Ledger
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {fallbackHistorical.length} Months Tracked
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px]">
                <th className="py-2.5 px-3">Calendar Month</th>
                <th className="py-2.5 px-3 text-right">Total Bills</th>
                <th className="py-2.5 px-3 text-right">Gross Salary</th>
                <th className="py-2.5 px-3 text-right">Pag-IBIG MP2</th>
                <th className="py-2.5 px-3 text-right">Personal Savings</th>
                <th className="py-2.5 px-3 text-right">Total Stash</th>
                <th className="py-2.5 px-3 text-right">Ending Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
              {fallbackHistorical.map((hm) => (
                <tr key={hm.key} className="hover:bg-slate-50/60">
                  <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">{hm.name}</td>
                  <td className="py-2.5 px-3 text-right text-rose-700 font-bold">{formatPHP(hm.expenses)}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-700 font-bold">{formatPHP(hm.salary)}</td>
                  <td className="py-2.5 px-3 text-right text-teal-700 font-bold">{formatPHP(hm.govSavings)}</td>
                  <td className="py-2.5 px-3 text-right text-indigo-700 font-bold">{formatPHP(hm.personalSavings)}</td>
                  <td className="py-2.5 px-3 text-right font-black text-emerald-950">{formatPHP(hm.totalSavings)}</td>
                  <td className="py-2.5 px-3 text-right font-bold">{formatPHP(hm.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer verification note */}
      <div className="pt-3 border-t border-slate-200 text-center text-[10px] text-slate-400 font-mono">
        PesoBudget Comprehensive Financial Analytics Ledger · Developed with Google AI Studio © 2026
      </div>
    </div>
  );
};
