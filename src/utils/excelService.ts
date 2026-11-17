import * as XLSX from 'xlsx';
import { MonthData, RowId } from '../types/budget';
import { INITIAL_ROW_ORDER, ROW_CONFIG, createEmptyDefaultMonth } from './storage';
import { recalculateMonthData } from './computation';
import { evaluateFormulaInput } from './formula';
import { computeOverallWorkbookData, groupSheetsByCalendarMonth } from './monthGrouping';
import { DEFAULT_MERGE_COLUMN_ORDER, getEffectiveRowMergeRanges } from './cellMerge';
import { getActiveCurrencyConfig } from './currency';

function getExcelCurrencyFormat(): string {
  const currency = getActiveCurrencyConfig();
  const sym = currency.symbol.replace(/"/g, '');
  if (currency.decimals === 0) {
    return `"${sym}"#,##0;[Red]-"${sym}"#,##0`;
  }
  return `"${sym}"#,##0.00;[Red]-"${sym}"#,##0.00`;
}

// Normalizes row labels from imported Excel sheets
const LABEL_TO_ROW_ID: Record<string, RowId> = {
  house: 'rent',
  rent: 'rent',
  loan: 'loan',
  'sss loan': 'loan',
  'pag-ibig loan': 'loan',
  'water bill': 'water_bill',
  water: 'water_bill',
  'electricity bill': 'electric_bill',
  electric: 'electric_bill',
  electricity: 'electric_bill',
  meralco: 'electric_bill',
  gas: 'gas',
  lpg: 'gas',
  meal: 'meal',
  meals: 'meal',
  food: 'meal',
  'mobile load': 'mobile_load',
  load: 'mobile_load',
  others: 'others',
  lazada: 'lazada',
  shopee: 'lazada',
  'qr ph': 'qr_ph',
  qrph: 'qr_ph',
  metrobank: 'metrobank',
  total: 'total',
  salary: 'salary',
  balance: 'balance',
  mp2: 'mp2',
  'pag-ibig mp2': 'mp2',
  gotyme: 'gotyme',
  'go tyme': 'gotyme',
};

function normalizeRowId(text: string): RowId | null {
  const clean = text.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
  if (LABEL_TO_ROW_ID[clean]) return LABEL_TO_ROW_ID[clean];
  for (const [key, id] of Object.entries(LABEL_TO_ROW_ID)) {
    if (clean.includes(key)) return id;
  }
  return null;
}

/**
 * Builds an XLSX Worksheet from a MonthData object
 */
function buildWorksheetForMonth(month: MonthData): XLSX.WorkSheet {
  const rows = month.rows;
  const wsData: any[][] = [];

  // Row 1: Merged title
  wsData.push([month.sheetTitle || 'PesoBudget - Smart Philippine Expense & Payroll Tracker', '', '', '']);

  // Row 2: Column Headers
  wsData.push(['PAYMENTS', 'MONTHLY', 'KINSENAS', 'REMARKS']);

  // Export all rows without limit (standard + custom rows)
  const rowOrder = month.rowOrder && month.rowOrder.length > 0
    ? Array.from(new Set([...month.rowOrder, ...Object.keys(rows)]))
    : Object.keys(rows);

  // Track comments: map of cell address to comment text
  const commentsMap: Record<string, string> = {};

  rowOrder.forEach((rowId, index) => {
    const row = rows[rowId];
    if (!row) return;

    // Excel row index: 1-based. wsData has 2 header rows, so row 3 is index 0
    const excelRow = wsData.length + 1;

    const label = row.label;
    const monthlyVal = row.monthly?.value || (row.monthly?.rawInput ? Number(row.monthly.rawInput) : '');
    const kinsenasVal = row.cutoff15th?.value || (row.cutoff15th?.rawInput ? Number(row.cutoff15th.rawInput) : '');
    const remarks = row.remarks || '';

    wsData.push([label, monthlyVal, kinsenasVal, remarks]);

    // Attach comments if present
    if (row.labelNote) {
      commentsMap[`A${excelRow}`] = row.labelNote;
    }
    if (row.monthly?.note) {
      commentsMap[`B${excelRow}`] = row.monthly.note;
    }
    if (row.cutoff15th?.note) {
      commentsMap[`C${excelRow}`] = row.cutoff15th.note;
    }
    if (row.remarksNote) {
      commentsMap[`D${excelRow}`] = row.remarksNote;
    }
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [{ wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 20 }];

  // Merge title across A1:D1 plus any active Monthly+Kinsenas / standard-column row merges
  const merges: XLSX.Range[] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
  const baseCols = DEFAULT_MERGE_COLUMN_ORDER;
  rowOrder.forEach((rowId, idx) => {
    const row = rows[rowId];
    if (!row) return;
    const ranges = getEffectiveRowMergeRanges(rowId, row, baseCols);
    for (const range of ranges) {
      const c1 = baseCols.indexOf(range.startCol);
      const c2 = baseCols.indexOf(range.endCol);
      if (c1 !== -1 && c2 !== -1 && c1 !== c2) {
        merges.push({
          s: { r: idx + 2, c: Math.min(c1, c2) },
          e: { r: idx + 2, c: Math.max(c1, c2) },
        });
      }
    }
  });
  ws['!merges'] = merges;

  // Inject real Excel comments into cells
  for (const [cellRef, noteText] of Object.entries(commentsMap)) {
    if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };
    ws[cellRef].c = [{ a: 'PesoBudget', t: noteText }];
  }

  // Format currency on numeric cells
  const excelFmt = getExcelCurrencyFormat();
  for (let r = 2; r < wsData.length; r++) {
    const cellB = ws[XLSX.utils.encode_cell({ r, c: 1 })];
    if (cellB && typeof cellB.v === 'number') {
      cellB.z = excelFmt;
    }
    const cellC = ws[XLSX.utils.encode_cell({ r, c: 2 })];
    if (cellC && typeof cellC.v === 'number') {
      cellC.z = excelFmt;
    }
  }

  return ws;
}

/**
 * Exports single month as a native Excel (.xlsx) file
 */
export function exportMonthToExcel(month: MonthData): void {
  const wb = XLSX.utils.book_new();
  const ws = buildWorksheetForMonth(month);
  const sheetName = month.name.slice(0, 31).replace(/[\\/?*[\]]/g, '_');
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const filename = `Salary_Monitoring_${month.name.toLowerCase().replace(/\s+/g, '_')}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Builds an XLSX Worksheet containing the complete 7-section financial summary report
 */
export function buildWorksheetForSummary(months: Record<string, MonthData>): XLSX.WorkSheet {
  const combined = computeOverallWorkbookData(months);
  const grouped = groupSheetsByCalendarMonth(months);
  const historical = Object.values(grouped);

  const wsData: any[][] = [];

  const currencyCode = getActiveCurrencyConfig().code;

  // Title
  wsData.push(['PESOBUDGET - OVERALL FINANCIAL SUMMARY & ANALYTICS REPORT', '', '', '', '']);
  wsData.push([`Aggregated across ${combined.sheetCount} sheets in workbook`, '', '', '', '']);
  wsData.push([]);

  // Section 1: Financial Snapshot KPI Metrics
  wsData.push(['PAGE 1: OVERALL FINANCIAL SNAPSHOT & KEY METRICS', '', '', '', '']);
  wsData.push(['Metric', `Amount (${currencyCode})`, 'Notes / Description', '', '']);
  wsData.push(['Total Monthly Bills', Math.abs(combined.totalExpenses), 'House, utilities, loans & Lazada']);
  wsData.push(['Metrobank ATM Cash', combined.plannedMetrobank, 'Physical cash withdrawn for bills']);
  wsData.push(['QR PH Digital Payments', combined.plannedQrPh, 'Digital transfers for Lazada/Shopee']);
  wsData.push(['Total Gross Salary', combined.salaryVal, 'Total earnings across cutoffs']);
  wsData.push(['Net Surplus / Ending Balance', combined.balanceVal, 'Salary - Total Outflow']);
  wsData.push(['Pag-IBIG MP2 Government Savings', Math.abs(combined.governmentSavings), 'Locked government sovereign savings']);
  wsData.push(['GoTyme Personal Stash', combined.gotymeVal, 'Liquid emergency & personal savings']);
  wsData.push(['Personal Savings (GoTyme + Balance)', combined.personalSavings, 'Total liquid personal reserve']);
  wsData.push(['Total Combined Stash', combined.totalCombinedSavings, 'Government (MP2) + Personal Savings']);
  wsData.push([]);

  // Section 2: Payroll Settlement & Cutoff Breakdown
  wsData.push(['PAGE 2: PAYROLL SETTLEMENT & CUTOFF ANALYSIS', '', '', '', '']);
  wsData.push(['Settlement Status', `Amount (${currencyCode})`, 'Count of Bills', '% of Total Bills', '']);
  wsData.push(['Settled Bills (OK)', combined.settledAmount, combined.settledCount, `${combined.settlementPercent.toFixed(1)}%`]);
  wsData.push(['Scheduled Next Payroll', combined.nextPayrollAmount, combined.nextPayrollCount, `${(100 - combined.settlementPercent).toFixed(1)}%`]);
  wsData.push([]);
  wsData.push(['Cutoff Sheet', 'Expenses', 'Salary', 'MP2 Savings', 'Personal Savings', 'Ending Balance']);
  combined.cutoffSummaries.forEach((cs) => {
    wsData.push([cs.name, cs.expenses, cs.salary, cs.govSavings, cs.personalSavings, cs.endingBalance]);
  });
  wsData.push([]);

  // Section 3: Expense Categories Breakdown
  wsData.push(['PAGE 3: EXPENSE CATEGORY BREAKDOWN', '', '', '', '']);
  wsData.push(['Category', `Amount (${currencyCode})`, 'Share of Total Bills (%)', '', '']);
  combined.expenseCategories.forEach((cat) => {
    const pct = combined.totalExpenses > 0 ? (cat.amount / combined.totalExpenses) * 100 : 0;
    wsData.push([cat.label, cat.amount, `${pct.toFixed(1)}%`]);
  });
  wsData.push([]);

  // Section 4: Cash Flow - Physical ATM Cash vs Digital QR PH
  wsData.push(['PAGE 4: CASH FLOW (ATM CASH VS DIGITAL)', '', '', '', '']);
  wsData.push(['Channel', `Amount (${currencyCode})`, 'Description', '', '']);
  wsData.push(['Metrobank ATM Cash', combined.plannedMetrobank, 'Physical cash withdrawal']);
  wsData.push(['QR PH Digital Transfer', combined.plannedQrPh, 'InstaPay / QR digital payments']);
  wsData.push(['Total Disbursed', combined.plannedMetrobank + combined.plannedQrPh, 'Sum of all disbursements']);
  wsData.push([]);

  // Section 5: Executive Savings & Stash Breakdown
  wsData.push(['PAGE 5: EXECUTIVE SAVINGS & STASH BREAKDOWN', '', '', '', '']);
  wsData.push(['Savings Vehicle', `Amount (${currencyCode})`, 'Category', 'Liquidity', '']);
  wsData.push(['Pag-IBIG MP2 Government', Math.abs(combined.governmentSavings), 'Government Sovereign Fund', '5-Year Maturity']);
  wsData.push(['GoTyme Stash', combined.gotymeVal, 'Personal Bank', 'Immediate Liquid']);
  wsData.push(['Payroll Ending Balance', combined.balanceVal, 'Operating Surplus', 'Immediate Liquid']);
  wsData.push(['Total Personal Savings', combined.personalSavings, 'GoTyme + Ending Balance', 'Combined Liquid']);
  wsData.push(['Grand Total Savings', combined.totalCombinedSavings, 'MP2 + Personal Savings', 'All Reserves']);
  wsData.push([]);

  // Section 6: Annual Cash Flow Waterfall & Net Position
  wsData.push(['PAGE 6: CASH FLOW WATERFALL & NET POSITION', '', '', '', '']);
  wsData.push(['Flow Item', `Amount (${currencyCode})`, 'Net Effect', '', '']);
  wsData.push(['(+) Total Annual Salary', combined.salaryVal, 'Inflow']);
  wsData.push(['(-) Metrobank & QR PH Bills', -Math.abs(combined.totalExpenses), 'Outflow']);
  wsData.push(['(-) Pag-IBIG MP2 Government Savings', -Math.abs(combined.governmentSavings), 'Savings Allocation']);
  wsData.push(['(=) Net Personal Savings (GoTyme + Balance)', combined.personalSavings, 'Final Net Position']);
  wsData.push([]);

  // Section 7: Historical Multi-Month Progression
  wsData.push(['PAGE 7: MULTI-MONTH HISTORICAL PROGRESSION', '', '', '', '']);
  wsData.push(['Calendar Month', 'Total Bills', 'Salary', 'Pag-IBIG MP2', 'Personal Savings', 'Ending Balance']);
  historical.forEach((hm) => {
    wsData.push([hm.displayName, hm.totalExpenses, hm.salaryVal, hm.governmentSavings, hm.personalSavings, hm.balanceVal]);
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [{ wch: 38 }, { wch: 22 }, { wch: 30 }, { wch: 22 }, { wch: 22 }];

  const summaryExcelFmt = getExcelCurrencyFormat();
  for (let r = 3; r < wsData.length; r++) {
    const cellB = ws[XLSX.utils.encode_cell({ r, c: 1 })];
    if (cellB && typeof cellB.v === 'number') {
      cellB.z = summaryExcelFmt;
    }
  }

  return ws;
}

/**
 * Exports complete 7-section Overall Summary as an Excel (.xlsx) file
 */
export function exportSummaryToExcel(months: Record<string, MonthData>): void {
  const wb = XLSX.utils.book_new();
  const ws = buildWorksheetForSummary(months);
  XLSX.utils.book_append_sheet(wb, ws, 'Overall Summary');

  const filename = `Salary_Monitoring_Complete_Summary.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Exports ALL months (January to Present) as a multi-sheet native Excel (.xlsx) workbook,
 * with Overall Summary included as the premier first worksheet!
 */
export function exportAllMonthsToExcel(months: Record<string, MonthData>): void {
  const wb = XLSX.utils.book_new();

  // Prepend Overall Summary as the first sheet
  const summaryWs = buildWorksheetForSummary(months);
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Overall Summary');

  for (const month of Object.values(months)) {
    const ws = buildWorksheetForMonth(month);
    const sheetName = month.name.slice(0, 31).replace(/[\\/?*[\]]/g, '_');
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const filename = `Salary_Monitoring_All_Months_With_Summary.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * Imports from an Excel (.xlsx / .xls) file buffer or ArrayBuffer
 */
export async function importFromExcelFile(
  file: File,
  existingMonths: Record<string, MonthData>
): Promise<{
  success: boolean;
  importedMonthsCount: number;
  monthNames: string[];
  data: Record<string, MonthData>;
  errors: string[];
}> {
  try {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, {
      type: 'array',
      cellFormula: true,
    } as any);

    const resultMonths: Record<string, MonthData> = { ...existingMonths };
    const importedNames: string[] = [];

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;

      const rawAoa = XLSX.utils.sheet_to_json<any[]>(ws, {
        header: 1,
        defval: '',
        raw: false,
      });

      if (!rawAoa || rawAoa.length < 2) continue;

      const monthId = sheetName.toLowerCase().replace(/[^a-z0-9]/g, '_') || `imported_${Date.now()}`;
      const monthData = resultMonths[monthId] || createEmptyDefaultMonth(monthId, sheetName);

      // Find header row containing PAYMENTS or MONTHLY or KINSENAS
      let headerRowIdx = -1;
      for (let r = 0; r < Math.min(5, rawAoa.length); r++) {
        const rowStr = (rawAoa[r] || []).join(' ').toLowerCase();
        if (rowStr.includes('payment') || rowStr.includes('monthly') || rowStr.includes('kinsenas')) {
          headerRowIdx = r;
          break;
        }
      }

      if (headerRowIdx === -1) headerRowIdx = 1;

      // Iterate through data rows
      for (let r = headerRowIdx + 1; r < rawAoa.length; r++) {
        const rowData = rawAoa[r];
        if (!rowData || rowData.length === 0) continue;

        const paymentLabel = String(rowData[0] || '').trim();
        if (!paymentLabel) continue;

        const monthlyRaw = String(rowData[1] || '').trim();
        const kinsenasRaw = String(rowData[2] || '').trim();
        const remarksRaw = String(rowData[3] || '').trim();

        let targetRowId = normalizeRowId(paymentLabel);
        if (!targetRowId || !monthData.rows[targetRowId]) {
          // Do not limit rows: create custom row so all user items are preserved
          const customId = `import_${paymentLabel.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${r}`;
          const isBankOrTotal = paymentLabel.toLowerCase().includes('metrobank') || paymentLabel.toLowerCase().includes('total');
          monthData.rows[customId] = {
            id: customId as RowId,
            label: paymentLabel,
            monthly: { rawInput: '', value: 0 },
            cutoff15th: { rawInput: '', value: 0 },
            remarks: remarksRaw || 'OK',
            rowType: isBankOrTotal ? 'bank_subtotal' : 'expense',
            isCustomRow: true,
            isAutoMetrobank: !isBankOrTotal,
          };
          if (!monthData.rowOrder) {
            monthData.rowOrder = [...INITIAL_ROW_ORDER];
          }
          if (!monthData.rowOrder.includes(customId as RowId)) {
            monthData.rowOrder.push(customId as RowId);
          }
          targetRowId = customId as RowId;
        }

        // Check for cell comments from worksheet object
        const cellRefA = XLSX.utils.encode_cell({ r, c: 0 });
        const cellRefB = XLSX.utils.encode_cell({ r, c: 1 });
        const cellRefC = XLSX.utils.encode_cell({ r, c: 2 });
        const cellRefD = XLSX.utils.encode_cell({ r, c: 3 });

        const noteA = ws[cellRefA]?.c?.[0]?.t;
        const noteB = ws[cellRefB]?.c?.[0]?.t;
        const noteC = ws[cellRefC]?.c?.[0]?.t;
        const noteD = ws[cellRefD]?.c?.[0]?.t;

        const targetRow = monthData.rows[targetRowId];
        if (!targetRow) continue;

        // Process monthly
        if (monthlyRaw) {
          const evalM = evaluateFormulaInput(monthlyRaw);
          targetRow.monthly = {
            rawInput: monthlyRaw,
            value: evalM.value,
            formula: evalM.isFormula ? monthlyRaw : undefined,
            note: noteB || targetRow.monthly.note,
          };
        } else if (noteB) {
          targetRow.monthly.note = noteB;
        }

        // Process kinsenas
        if (kinsenasRaw) {
          const evalK = evaluateFormulaInput(kinsenasRaw);
          targetRow.cutoff15th = {
            rawInput: kinsenasRaw,
            value: evalK.value,
            formula: evalK.isFormula ? kinsenasRaw : undefined,
            note: noteC || targetRow.cutoff15th.note,
          };
        } else if (noteC) {
          targetRow.cutoff15th.note = noteC;
        }

        // Process label note
        if (noteA) {
          targetRow.labelNote = noteA;
        }

        // Process remarks
        if (remarksRaw) {
          const norm = remarksRaw.toLowerCase();
          if (norm === 'ok' || norm === 'paid') targetRow.remarks = 'OK';
          else if (norm.includes('next') || norm.includes('payroll')) targetRow.remarks = 'Next Payroll';
          else targetRow.remarks = remarksRaw;
        }
        if (noteD) {
          targetRow.remarksNote = noteD;
        }

        monthData.rows[targetRowId] = targetRow;

        // If salary row
        if (targetRowId === 'salary') {
          if (targetRow.cutoff15th.value > 0) {
            monthData.salaryBreakdown.cutoff15th.baseSalary = targetRow.cutoff15th.value;
          }
        }
      }

      resultMonths[monthId] = recalculateMonthData(monthData);
      importedNames.push(sheetName);
    }

    return {
      success: importedNames.length > 0,
      importedMonthsCount: importedNames.length,
      monthNames: importedNames,
      data: resultMonths,
      errors: importedNames.length === 0 ? ['No valid sheets or rows found in Excel file.'] : [],
    };
  } catch (err) {
    return {
      success: false,
      importedMonthsCount: 0,
      monthNames: [],
      data: existingMonths,
      errors: [err instanceof Error ? err.message : 'Failed to parse Excel file.'],
    };
  }
}
