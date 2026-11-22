/**
 * @file monthGrouping.ts
 * @description Utility to group and compute 15-day cutoff sheets (e.g., 1-15 and 16-31) into unified monthly reports.
 * Dynamically resolves user-customized payment category names (e.g., GoTyme -> MariBank, Lazada -> Shopee, etc.)
 * across all summaries, charts, and exports.
 */

import { MonthData, RowId } from '../types/budget';
import { parseNumericString } from './currency';

export interface CutoffSheetSummary {
  id: string;
  name: string;
  sheetTitle: string;
  cutoffLabel: string;
  expenses: number;
  salary: number;
  govSavings: number;
  personalSavings: number;
  endingBalance: number;
  metrobankSum: number;
  withdrawnSum: number;
}

export interface DynamicRowLabels {
  metrobank: string;
  qr_ph: string;
  total: string;
  salary: string;
  balance: string;
  mp2: string;
  gotyme: string;
  lazada: string;
}

export interface CombinedMonthData {
  monthKey: string;             // e.g. "2026-01"
  displayName: string;          // e.g. "January 2026"
  tableTitle: string;           // e.g. "JANUARY"
  sheetCount: number;           // e.g. 2
  sheets: MonthData[];          // Array of sheets belonging to this month
  cutoffSummaries: CutoffSheetSummary[];
  rowLabels: DynamicRowLabels;  // Live user-renamed labels from the sheet rows

  // Aggregated totals across all 15-day sheets in this month
  totalExpenses: number;
  plannedMetrobank: number;     // Physical ATM cash for cash bills
  plannedQrPh: number;          // Digital payment channel
  actualTotalWithdrawn: number; // ATM cash + QR PH total outflow
  actualMetroCash: number;      // Bank actual withdrawn money
  actualQrPayment: number;      // Digital payment amount
  governmentSavings: number;    // MP2 (or renamed) sum across all sheets
  gotymeVal: number;            // Withdrawable bank savings (e.g. GoTyme/MariBank) sum
  balanceVal: number;           // Final ending balance of the latest cutoff sheet
  personalSavings: number;      // gotymeVal + balanceVal
  totalCombinedSavings: number; // governmentSavings + personalSavings
  salaryVal: number;            // Gross salary earned in this month

  // Bill settlement statistics
  settledAmount: number;
  settledCount: number;
  nextPayrollAmount: number;
  nextPayrollCount: number;
  settlementPercent: number;

  // Savings rates
  savingsRate: number;
  govSavingsRate: number;
  personalSavingsRate: number;

  // Combined breakdown per category
  expenseCategories: {
    id: string;
    label: string;
    color: string;
    amount: number;
  }[];
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

const MONTH_SHORT = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
];

const CUSTOM_ROW_COLORS = [
  '#14b8a6',
  '#f43f5e',
  '#a855f7',
  '#0ea5e9',
  '#84cc16',
  '#eab308',
  '#f97316',
  '#ec4899',
];

function cleanRowLabel(raw: string | undefined, fallback: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return fallback;
  return trimmed;
}

export function extractDynamicRowLabels(
  sheets: MonthData[],
  preferredSheet?: MonthData
): DynamicRowLabels {
  const ordered = [...sheets].sort((a, b) =>
    (a.updatedAt || '').localeCompare(b.updatedAt || '')
  );
  const latestUpdated = preferredSheet || ordered[ordered.length - 1];

  const resolve = (rowId: string, fallback: string): string => {
    if (latestUpdated?.rows?.[rowId]?.label?.trim()) {
      return cleanRowLabel(latestUpdated.rows[rowId].label, fallback);
    }
    for (let i = ordered.length - 1; i >= 0; i--) {
      const lbl = ordered[i]?.rows?.[rowId]?.label;
      if (lbl && lbl.trim()) return lbl.trim();
    }
    return fallback;
  };

  return {
    metrobank: resolve('metrobank', 'Metrobank'),
    qr_ph: resolve('qr_ph', 'QR PH'),
    total: resolve('total', 'Total'),
    salary: resolve('salary', 'SALARY'),
    balance: resolve('balance', 'BALANCE'),
    mp2: resolve('mp2', 'MP2'),
    gotyme: resolve('gotyme', 'GoTyme'),
    lazada: resolve('lazada', 'Lazada'),
  };
}

/**
 * Extracts a normalized month key (e.g., "2026-01") and human display title from a MonthData object.
 */
export function extractMonthKey(sheet: MonthData): {
  key: string;
  displayName: string;
  tableTitle: string;
  monthIndex: number;
  year: number;
  cutoffLabel: string;
} {
  const combinedText = `${sheet.name} ${sheet.sheetTitle || ''} ${sheet.id}`.toLowerCase();

  const yearMatch = combinedText.match(/\b(202[0-9]|203[0-5])\b/);
  const year = sheet.year || (yearMatch ? parseInt(yearMatch[1], 10) : 2026);

  let monthIndex = -1;
  for (let i = 0; i < 12; i++) {
    const full = MONTH_NAMES[i];
    const short = MONTH_SHORT[i];
    const regex = new RegExp(`\\b(${full}|${short})\\b`, 'i');
    if (regex.test(combinedText)) {
      monthIndex = i;
      break;
    }
  }

  if (monthIndex === -1) {
    const idMatch = sheet.id.match(/(\d{4})-(\d{2})/);
    if (idMatch) {
      monthIndex = parseInt(idMatch[2], 10) - 1;
    }
  }

  if (monthIndex < 0 || monthIndex > 11) {
    monthIndex = 9;
  }

  const monthNum = String(monthIndex + 1).padStart(2, '0');
  const monthKey = `${year}-${monthNum}`;
  const monthCap = MONTH_NAMES[monthIndex].charAt(0).toUpperCase() + MONTH_NAMES[monthIndex].slice(1);
  const displayName = `${monthCap} ${year}`;
  const tableTitle = sheet.sheetTitle?.trim() || monthCap.toUpperCase();

  let cutoffLabel = 'Full Period';
  if (/1\s*[-–toTO]+\s*15|1st|first/i.test(sheet.name)) {
    cutoffLabel = '1st Cutoff (1st–15th)';
  } else if (/16\s*[-–toTO]+\s*(28|29|30|31)|2nd|second/i.test(sheet.name)) {
    cutoffLabel = '2nd Cutoff (16th–End)';
  }

  return {
    key: monthKey,
    displayName,
    tableTitle,
    monthIndex,
    year,
    cutoffLabel,
  };
}

/**
 * Standard expense categories to summarize in charts (overridden dynamically when renamed in sheet).
 */
export const STANDARD_EXPENSE_CATEGORIES = [
  { id: 'rent', label: 'Rent', color: '#3b82f6' },
  { id: 'loan', label: 'Loan', color: '#6366f1' },
  { id: 'water_bill', label: 'Water', color: '#06b6d4' },
  { id: 'electric_bill', label: 'Electricity', color: '#eab308' },
  { id: 'gas', label: 'Gas', color: '#f97316' },
  { id: 'meal', label: 'Meal & Food', color: '#10b981' },
  { id: 'mobile_load', label: 'Mobile Load', color: '#8b5cf6' },
  { id: 'others', label: 'Others', color: '#64748b' },
  { id: 'lazada', label: 'Lazada', color: '#ec4899' },
];

/**
 * Computes combined statistics across an array of 15-day sheets for a single calendar month.
 */
export function computeCombinedMonthData(
  monthKey: string,
  displayName: string,
  tableTitle: string,
  sheets: MonthData[],
  preferredSheet?: MonthData
): CombinedMonthData {
  let totalExpenses = 0;
  let plannedMetrobank = 0;
  let plannedQrPh = 0;
  let actualTotalWithdrawn = 0;
  let actualMetroCash = 0;
  let actualQrPayment = 0;
  let governmentSavings = 0;
  let gotymeVal = 0;
  let salaryVal = 0;

  let settledAmount = 0;
  let settledCount = 0;
  let nextPayrollAmount = 0;
  let nextPayrollCount = 0;

  const categoryAmountMap: Record<string, number> = {};
  const categoryLabelMap: Record<string, string> = {};
  const customCategoryOrder: string[] = [];

  STANDARD_EXPENSE_CATEGORIES.forEach((cat) => {
    categoryAmountMap[cat.id] = 0;
    categoryLabelMap[cat.id] = cat.label;
  });

  const cutoffSummaries: CutoffSheetSummary[] = [];

  const sortedSheets = [...sheets].sort((a, b) => {
    const aIs1st = /1\s*[-–toTO]+\s*15|1st|first/i.test(a.name);
    const bIs1st = /1\s*[-–toTO]+\s*15|1st|first/i.test(b.name);
    if (aIs1st && !bIs1st) return -1;
    if (!aIs1st && bIs1st) return 1;
    return (a.updatedAt || '').localeCompare(b.updatedAt || '');
  });

  sortedSheets.forEach((sheet, idx) => {
    const rows = sheet.rows;
    const { cutoffLabel } = extractMonthKey(sheet);

    let sheetExp = 0;
    STANDARD_EXPENSE_CATEGORIES.forEach((cat) => {
      const row = rows[cat.id as RowId];
      if (row) {
        if (row.label && row.label.trim()) {
          categoryLabelMap[cat.id] = row.label.trim();
        }
        const val =
          (row.cutoff15th?.value || 0) +
          (row.monthly?.value && !row.cutoff15th?.value ? row.monthly.value : 0);
        categoryAmountMap[cat.id] = (categoryAmountMap[cat.id] || 0) + val;
        sheetExp += val;

        if (row.remarks === 'OK' || row.remarks === 'Settled') {
          settledAmount += val;
          settledCount++;
        } else if (row.remarks === 'Next Payroll' || row.remarks === 'Deferred') {
          nextPayrollAmount += val;
          nextPayrollCount++;
        }
      }
    });

    // Aggregate custom expense rows and track their dynamic labels too
    Object.keys(rows).forEach((rId) => {
      if (
        !STANDARD_EXPENSE_CATEGORIES.some((c) => c.id === rId) &&
        !['metrobank', 'qr_ph', 'total', 'salary', 'balance', 'mp2', 'gotyme'].includes(rId)
      ) {
        const customRow = rows[rId];
        if (customRow && customRow.rowType === 'expense') {
          const val =
            (customRow.cutoff15th?.value || 0) +
            (customRow.monthly?.value && !customRow.cutoff15th?.value ? customRow.monthly.value : 0);
          sheetExp += val;

          const normKey =
            (customRow.label || rId).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') || rId;
          const customCatId = `custom_${normKey}`;
          if (!(customCatId in categoryAmountMap)) {
            categoryAmountMap[customCatId] = 0;
            customCategoryOrder.push(customCatId);
          }
          categoryLabelMap[customCatId] = cleanRowLabel(customRow.label, 'Custom Expense');
          categoryAmountMap[customCatId] += val;

          if (customRow.remarks === 'OK' || customRow.remarks === 'Settled') {
            settledAmount += val;
            settledCount++;
          } else if (customRow.remarks === 'Next Payroll' || customRow.remarks === 'Deferred') {
            nextPayrollAmount += val;
            nextPayrollCount++;
          }
        }
      }
    });

    const sheetTotalVal =
      sheet.rows['total']?.cutoff15th?.value || sheet.rows['total']?.monthly?.value || 0;
    const finalSheetExp = sheetTotalVal > 0 ? sheetTotalVal : sheetExp;
    totalExpenses += finalSheetExp;

    const metroVal = rows['metrobank']?.cutoff15th?.value || rows['metrobank']?.monthly?.value || 0;
    const qrVal = rows['qr_ph']?.cutoff15th?.value || rows['qr_ph']?.monthly?.value || 0;
    plannedMetrobank += metroVal;
    plannedQrPh += qrVal;

    const actualQr = parseNumericString(rows['qr_ph']?.remarks || '0');
    const actualMetro = parseNumericString(rows['metrobank']?.remarks || '0');
    actualMetroCash += actualMetro;
    actualQrPayment += actualQr;
    const sheetWithdrawn = actualQr + actualMetro;
    actualTotalWithdrawn += sheetWithdrawn;

    const sheetMp2 = rows['mp2']?.cutoff15th?.value || rows['mp2']?.monthly?.value || 0;
    const sheetGotyme = rows['gotyme']?.cutoff15th?.value || rows['gotyme']?.monthly?.value || 0;
    governmentSavings += sheetMp2;
    gotymeVal += sheetGotyme;

    const sheetSal = rows['salary']?.cutoff15th?.value || rows['salary']?.monthly?.value || 0;
    salaryVal += sheetSal;

    const sheetBal = rows['balance']?.cutoff15th?.value ?? rows['balance']?.monthly?.value ?? 0;

    cutoffSummaries.push({
      id: sheet.id,
      name: sheet.name,
      sheetTitle: sheet.sheetTitle || tableTitle,
      cutoffLabel: `${cutoffLabel || `Cutoff ${idx + 1}`}`,
      expenses: finalSheetExp,
      salary: sheetSal,
      govSavings: sheetMp2,
      personalSavings: sheetGotyme + sheetBal,
      endingBalance: sheetBal,
      metrobankSum: metroVal,
      withdrawnSum: sheetWithdrawn,
    });
  });

  // Apply preferredSheet / most-recent-sheet overrides for category labels
  if (preferredSheet?.rows) {
    STANDARD_EXPENSE_CATEGORIES.forEach((cat) => {
      const preferredLabel = preferredSheet.rows[cat.id]?.label?.trim();
      if (preferredLabel) {
        categoryLabelMap[cat.id] = preferredLabel;
      }
    });
  }

  const latestSheet = sortedSheets[sortedSheets.length - 1];
  const balanceVal =
    latestSheet?.rows['balance']?.cutoff15th?.value ??
    latestSheet?.rows['balance']?.monthly?.value ??
    0;

  const personalSavings = gotymeVal + balanceVal;
  const totalCombinedSavings = governmentSavings + personalSavings;

  const settlementPercent =
    totalExpenses > 0 ? Math.round((settledAmount / totalExpenses) * 100) : 0;
  const savingsRate =
    salaryVal > 0 ? Math.round((totalCombinedSavings / salaryVal) * 100) : 0;
  const govSavingsRate =
    salaryVal > 0 ? Math.round((governmentSavings / salaryVal) * 100) : 0;
  const personalSavingsRate =
    salaryVal > 0 ? Math.round((personalSavings / salaryVal) * 100) : 0;

  const expenseCategories = [
    ...STANDARD_EXPENSE_CATEGORIES.map((cat) => ({
      id: cat.id,
      label: categoryLabelMap[cat.id] || cat.label,
      color: cat.color,
      amount: categoryAmountMap[cat.id] || 0,
    })),
    ...customCategoryOrder
      .filter((cid) => (categoryAmountMap[cid] || 0) > 0)
      .map((cid, idx) => ({
        id: cid,
        label: categoryLabelMap[cid] || 'Other',
        color: CUSTOM_ROW_COLORS[idx % CUSTOM_ROW_COLORS.length],
        amount: categoryAmountMap[cid] || 0,
      })),
  ];

  const rowLabels = extractDynamicRowLabels(sortedSheets, preferredSheet);

  return {
    monthKey,
    displayName,
    tableTitle,
    sheetCount: sheets.length,
    sheets: sortedSheets,
    cutoffSummaries,
    rowLabels,
    totalExpenses,
    plannedMetrobank,
    plannedQrPh,
    actualTotalWithdrawn,
    actualMetroCash,
    actualQrPayment,
    governmentSavings,
    gotymeVal,
    balanceVal,
    personalSavings,
    totalCombinedSavings,
    salaryVal,
    settledAmount,
    settledCount,
    nextPayrollAmount,
    nextPayrollCount,
    settlementPercent,
    savingsRate,
    govSavingsRate,
    personalSavingsRate,
    expenseCategories,
  };
}

/**
 * Groups all workbook sheets by Calendar Month (combining two 15-day sheets into 1 full month).
 */
export function groupSheetsByCalendarMonth(
  allMonths: Record<string, MonthData>,
  preferredSheet?: MonthData
): Record<string, CombinedMonthData> {
  const groupedSheets: Record<
    string,
    {
      monthKey: string;
      displayName: string;
      tableTitle: string;
      sheets: MonthData[];
    }
  > = {};

  const sheetList = Object.values(allMonths);
  if (sheetList.length === 0) return {};

  sheetList.forEach((sheet) => {
    const { key, displayName, tableTitle } = extractMonthKey(sheet);
    if (!groupedSheets[key]) {
      groupedSheets[key] = {
        monthKey: key,
        displayName,
        tableTitle,
        sheets: [],
      };
    }
    groupedSheets[key].sheets.push(sheet);
  });

  const result: Record<string, CombinedMonthData> = {};
  Object.keys(groupedSheets)
    .sort()
    .forEach((key) => {
      const g = groupedSheets[key];
      result[key] = computeCombinedMonthData(
        g.monthKey,
        g.displayName,
        g.tableTitle,
        g.sheets,
        preferredSheet
      );
    });

  return result;
}

/**
 * Computes unified Overall Summary aggregating ALL months and sheets in the entire workbook.
 */
export function computeOverallWorkbookData(
  allMonths: Record<string, MonthData>,
  preferredSheet?: MonthData
): CombinedMonthData {
  const sheetList = Object.values(allMonths);
  if (sheetList.length === 0) {
    return computeCombinedMonthData('overall', 'All Months', 'OVERALL SUMMARY', [], preferredSheet);
  }

  const combined = computeCombinedMonthData(
    'overall',
    'All Months',
    'OVERALL SUMMARY',
    sheetList,
    preferredSheet
  );

  const sumBalances = sheetList.reduce((acc, s) => {
    const bal = s.rows['balance']?.cutoff15th?.value ?? s.rows['balance']?.monthly?.value ?? 0;
    return acc + bal;
  }, 0);

  combined.balanceVal = sumBalances;
  combined.personalSavings = combined.gotymeVal + sumBalances;
  combined.totalCombinedSavings = combined.governmentSavings + combined.personalSavings;

  if (combined.salaryVal > 0) {
    combined.savingsRate = Math.round((combined.totalCombinedSavings / combined.salaryVal) * 100);
    combined.govSavingsRate = Math.round((combined.governmentSavings / combined.salaryVal) * 100);
    combined.personalSavingsRate = Math.round(
      (combined.personalSavings / combined.salaryVal) * 100
    );
  }

  return combined;
}
