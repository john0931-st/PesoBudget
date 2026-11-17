import { MonthData } from '../types/budget';
import { INITIAL_ROW_ORDER } from './storage';
import { getActiveCurrencyConfig } from './currency';
import { computeOverallWorkbookData, groupSheetsByCalendarMonth } from './monthGrouping';

/**
 * Exports a single month to CSV
 */
export function exportMonthToCSV(month: MonthData): void {
  const rows = month.rows;
  const currencyCode = getActiveCurrencyConfig().code;
  const lines: string[] = [];

  // Title
  lines.push(`"PesoBudget - ${month.name} Budget & Payroll Ledger"`);
  lines.push(`"Generated: ${new Date().toLocaleDateString('en-PH')}"`);
  lines.push('');

  // Table Headers
  lines.push(`"Payments","Monthly (${currencyCode})","15th (${currencyCode})","Remarks","Notes"`);

  // Rows
  const orderedIds = month.rowOrder && month.rowOrder.length > 0
    ? Array.from(new Set([...month.rowOrder, ...Object.keys(rows)]))
    : INITIAL_ROW_ORDER;
  for (const rowId of orderedIds) {
    const row = rows[rowId];
    if (!row) continue;

    const monthlyVal = row.monthly.value.toFixed(2);
    const cutoffVal = row.cutoff15th.value.toFixed(2);
    const remarks = (row.remarks || '').replace(/"/g, '""');
    const notes = [
      row.monthly.note ? `Monthly: ${row.monthly.note}` : '',
      row.cutoff15th.note ? `15th: ${row.cutoff15th.note}` : '',
    ]
      .filter(Boolean)
      .join(' | ')
      .replace(/"/g, '""');

    lines.push(`"${row.label}","${monthlyVal}","${cutoffVal}","${remarks}","${notes}"`);
  }

  // Summary section
  lines.push('');
  lines.push('"SUMMARY & FORMULAS"');
  lines.push(`"Metrobank Auto Sum","${rows['metrobank']?.monthly.value.toFixed(2)}","${rows['metrobank']?.cutoff15th.value.toFixed(2)}"`);
  lines.push(`"Total (QR PH + Metrobank)","${rows['total']?.monthly.value.toFixed(2)}","${rows['total']?.cutoff15th.value.toFixed(2)}"`);
  lines.push(`"Salary (Base + Carried Prev)","${rows['salary']?.monthly.value.toFixed(2)}","${rows['salary']?.cutoff15th.value.toFixed(2)}"`);
  lines.push(`"Balance ((Total - Salary) - (MP2 + Gotyme))","${rows['balance']?.monthly.value.toFixed(2)}","${rows['balance']?.cutoff15th.value.toFixed(2)}"`);

  triggerDownload(
    lines.join('\n'),
    `pesobudget_${month.name.toLowerCase().replace(/\s+/g, '_')}.csv`,
    'text/csv;charset=utf-8;'
  );
}

/**
 * Exports ALL months (January to Present) to a consolidated multi-month CSV
 */
export function exportAllMonthsToCSV(months: Record<string, MonthData>): void {
  const currencyCode = getActiveCurrencyConfig().code;
  const lines: string[] = [];
  lines.push(`"Month","Payments","Monthly (${currencyCode})","15th (${currencyCode})","Remarks","Notes"`);

  // Sort months chronologically if possible
  const monthList = Object.values(months);

  for (const month of monthList) {
    const rows = month.rows;
    const orderedIds = month.rowOrder && month.rowOrder.length > 0
      ? Array.from(new Set([...month.rowOrder, ...Object.keys(rows)]))
      : INITIAL_ROW_ORDER;
    for (const rowId of orderedIds) {
      const row = rows[rowId];
      if (!row) continue;

      const monthlyVal = row.monthly.value.toFixed(2);
      const cutoffVal = row.cutoff15th.value.toFixed(2);
      const remarks = (row.remarks || '').replace(/"/g, '""');
      const notes = [
        row.monthly.note ? `Monthly: ${row.monthly.note}` : '',
        row.cutoff15th.note ? `15th: ${row.cutoff15th.note}` : '',
      ]
        .filter(Boolean)
        .join(' | ')
        .replace(/"/g, '""');

      lines.push(
        `"${month.name}","${row.label}","${monthlyVal}","${cutoffVal}","${remarks}","${notes}"`
      );
    }
  }

  triggerDownload(
    lines.join('\n'),
    `pesobudget_all_months_jan_to_present.csv`,
    'text/csv;charset=utf-8;'
  );
}

/**
 * Exports complete backup in JSON format
 */
export function exportAllMonthsToJSON(months: Record<string, MonthData>): void {
  const payload = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    currency: getActiveCurrencyConfig().code,
    monthsCount: Object.keys(months).length,
    months,
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  triggerDownload(
    jsonStr,
    `pesobudget_backup_${new Date().toISOString().slice(0, 10)}.json`,
    'application/json;charset=utf-8;'
  );
}

/**
 * Downloads a ready-to-fill CSV template spanning January 2026 to Present (October 2026)
 */
export function downloadJanuaryToPresentTemplate(): void {
  const months = [
    'January 2026',
    'February 2026',
    'March 2026',
    'April 2026',
    'May 2026',
    'June 2026',
    'July 2026',
    'August 2026',
    'September 2026',
    'October 2026',
  ];

  const standardLabels = [
    'Rent',
    'Water bill',
    'Electric bill',
    'Gas',
    'Meal',
    'Mobile load',
    'Others',
    'Lazada',
    'QR PH',
    'Metrobank',
    'Total',
    'Salary',
    'Balance',
    'MP2',
    'Gotyme',
  ];

  const currencyCode = getActiveCurrencyConfig().code;
  const lines: string[] = [];
  lines.push(`"Month","Payments","Monthly (${currencyCode})","15th (${currencyCode})","Remarks","Notes"`);

  for (const m of months) {
    for (const label of standardLabels) {
      let defaultRemarks = 'OK';
      if (['QR PH', 'Metrobank'].includes(label)) defaultRemarks = '';
      if (['Total', 'Salary', 'Balance'].includes(label)) defaultRemarks = '';
      lines.push(`"${m}","${label}","0.00","0.00","${defaultRemarks}",""`);
    }
  }

  triggerDownload(
    lines.join('\n'),
    'pesobudget_template_january_to_present.csv',
    'text/csv;charset=utf-8;'
  );
}

/**
 * Exports complete 7-section Whole Overall Summary to CSV
 */
export function exportSummaryToCSV(months: Record<string, MonthData>): void {
  const combined = computeOverallWorkbookData(months);
  const grouped = groupSheetsByCalendarMonth(months);
  const historical = Object.values(grouped);
  const currencyCode = getActiveCurrencyConfig().code;
  const lines: string[] = [];

  lines.push('"PESOBUDGET - OVERALL FINANCIAL SUMMARY & ANALYTICS REPORT"');
  lines.push(`"Generated: ${new Date().toLocaleDateString('en-PH')}"`);
  lines.push(`"Sheets Combined: ${combined.sheetCount}"`);
  lines.push('');

  lines.push('"PAGE 1: OVERALL FINANCIAL SNAPSHOT & KEY METRICS"');
  lines.push(`"Metric","Amount (${currencyCode})","Description"`);
  lines.push(`"Total Monthly Bills","${Math.abs(combined.totalExpenses).toFixed(2)}","House, utilities, loans & Lazada"`);
  lines.push(`"Metrobank ATM Cash","${combined.plannedMetrobank.toFixed(2)}","Physical cash withdrawn for bills"`);
  lines.push(`"QR PH Digital Transfer","${combined.plannedQrPh.toFixed(2)}","Digital payments for Lazada/Shopee"`);
  lines.push(`"Total Gross Salary","${combined.salaryVal.toFixed(2)}","Total earnings across cutoffs"`);
  lines.push(`"Net Surplus / Ending Balance","${combined.balanceVal.toFixed(2)}","Salary - Total Outflow"`);
  lines.push(`"Pag-IBIG MP2 Government Savings","${Math.abs(combined.governmentSavings).toFixed(2)}","Locked government sovereign savings"`);
  lines.push(`"GoTyme Personal Stash","${combined.gotymeVal.toFixed(2)}","Liquid emergency & personal savings"`);
  lines.push(`"Personal Savings (GoTyme + Balance)","${combined.personalSavings.toFixed(2)}","Total liquid personal reserve"`);
  lines.push(`"Total Combined Stash","${combined.totalCombinedSavings.toFixed(2)}","Government (MP2) + Personal Savings"`);
  lines.push('');

  lines.push('"PAGE 2: PAYROLL SETTLEMENT & CUTOFF ANALYSIS"');
  lines.push(`"Cutoff Sheet","Expenses (${currencyCode})","Salary (${currencyCode})","MP2 Savings (${currencyCode})","Personal Savings (${currencyCode})","Ending Balance (${currencyCode})"`);
  combined.cutoffSummaries.forEach((cs) => {
    lines.push(`"${cs.name}","${cs.expenses.toFixed(2)}","${cs.salary.toFixed(2)}","${cs.govSavings.toFixed(2)}","${cs.personalSavings.toFixed(2)}","${cs.endingBalance.toFixed(2)}"`);
  });
  lines.push('');

  lines.push('"PAGE 3: EXPENSE CATEGORY BREAKDOWN"');
  lines.push(`"Category","Amount (${currencyCode})","Share of Total Bills (%)"`);
  combined.expenseCategories.forEach((cat) => {
    const pct = combined.totalExpenses > 0 ? (cat.amount / combined.totalExpenses) * 100 : 0;
    lines.push(`"${cat.label}","${cat.amount.toFixed(2)}","${pct.toFixed(1)}%"`);
  });
  lines.push('');

  lines.push('"PAGE 4: CASH FLOW (ATM CASH VS DIGITAL)"');
  lines.push(`"Channel","Amount (${currencyCode})","Description"`);
  lines.push(`"Metrobank ATM Cash","${combined.plannedMetrobank.toFixed(2)}","Physical cash withdrawal"`);
  lines.push(`"QR PH Digital Transfer","${combined.plannedQrPh.toFixed(2)}","InstaPay / QR digital payments"`);
  lines.push(`"Total Disbursed","${(combined.plannedMetrobank + combined.plannedQrPh).toFixed(2)}","Sum of all disbursements"`);
  lines.push('');

  lines.push('"PAGE 5: EXECUTIVE SAVINGS & STASH BREAKDOWN"');
  lines.push(`"Savings Vehicle","Amount (${currencyCode})","Category","Liquidity"`);
  lines.push(`"Pag-IBIG MP2 Government","${Math.abs(combined.governmentSavings).toFixed(2)}","Government Sovereign Fund","5-Year Maturity"`);
  lines.push(`"GoTyme Stash","${combined.gotymeVal.toFixed(2)}","Personal Bank","Immediate Liquid"`);
  lines.push(`"Payroll Ending Balance","${combined.balanceVal.toFixed(2)}","Operating Surplus","Immediate Liquid"`);
  lines.push(`"Total Personal Savings","${combined.personalSavings.toFixed(2)}","GoTyme + Ending Balance","Combined Liquid"`);
  lines.push(`"Grand Total Savings","${combined.totalCombinedSavings.toFixed(2)}","MP2 + Personal Savings","All Reserves"`);
  lines.push('');

  lines.push('"PAGE 6: CASH FLOW WATERFALL & NET POSITION"');
  lines.push(`"Flow Item","Amount (${currencyCode})","Net Effect"`);
  lines.push(`"(+) Total Annual Salary","${combined.salaryVal.toFixed(2)}","Inflow"`);
  lines.push(`"(-) Metrobank & QR PH Bills","${(-Math.abs(combined.totalExpenses)).toFixed(2)}","Outflow"`);
  lines.push(`"(-) Pag-IBIG MP2 Government Savings","${(-Math.abs(combined.governmentSavings)).toFixed(2)}","Savings Allocation"`);
  lines.push(`"(=) Net Personal Savings (GoTyme + Balance)","${combined.personalSavings.toFixed(2)}","Final Net Position"`);
  lines.push('');

  lines.push('"PAGE 7: MULTI-MONTH HISTORICAL PROGRESSION"');
  lines.push(`"Calendar Month","Total Bills (${currencyCode})","Salary (${currencyCode})","Pag-IBIG MP2 (${currencyCode})","Personal Savings (${currencyCode})","Ending Balance (${currencyCode})"`);
  historical.forEach((hm) => {
    lines.push(`"${hm.displayName}","${hm.totalExpenses.toFixed(2)}","${hm.salaryVal.toFixed(2)}","${hm.governmentSavings.toFixed(2)}","${hm.personalSavings.toFixed(2)}","${hm.balanceVal.toFixed(2)}"`);
  });

  triggerDownload(lines.join('\n'), 'pesobudget_whole_summary_report.csv', 'text/csv;charset=utf-8;');
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
