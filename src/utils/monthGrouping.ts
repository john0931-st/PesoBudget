/**
 * @file monthGrouping.ts
 * @description Utility to group and compute 15-day cutoff sheets (e.g., 1-15 and 16-31) into unified monthly reports.
 * 
 * In Philippine payroll and expense tracking, a month is commonly split across two 15-day sheets:
 * - Cutoff 1: 1st to 15th (table title: e.g. "JANUARY")
 * - Cutoff 2: 16th to 30/31st (table title: e.g. "JANUARY")
 * 
 * This utility:
 * 1. Automatically recognizes which sheets belong to the same calendar month.
 * 2. Combines expenses, gross salary, government savings (MP2), and personal savings (GoTyme + Ending Balance).
 * 3. Provides clean aggregations for monthly analytics, KPI cards, and multi-month historical trends.
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

export interface CombinedMonthData {
  monthKey: string;             // e.g. "2026-01"
  displayName: string;          // e.g. "January 2026"
  tableTitle: string;           // e.g. "JANUARY"
  sheetCount: number;           // e.g. 2
  sheets: MonthData[];          // Array of sheets belonging to this month
  cutoffSummaries: CutoffSheetSummary[];
  
  // Aggregated totals across all 15-day sheets in this month
  totalExpenses: number;
  plannedMetrobank: number;     // Physical ATM cash for cash bills
  plannedQrPh: number;          // Digital payment for Lazada
  actualTotalWithdrawn: number; // Metrobank ATM + QR PH total outflow
  actualMetroCash: number;      // Metrobank actual withdrawn money
  actualQrPayment: number;      // QR PH digital payment amount
  governmentSavings: number;    // MP2 sum across all sheets
  gotymeVal: number;            // GoTyme sum across all sheets
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
  
  // Detect year (prefer explicit sheet.year, then regex 2020 - 2035, default 2026)
  const yearMatch = combinedText.match(/\b(202[0-9]|203[0-5])\b/);
  const year = sheet.year || (yearMatch ? parseInt(yearMatch[1], 10) : 2026);
  
  // Detect month
  let monthIndex = -1;
  for (let i = 0; i < 12; i++) {
    const full = MONTH_NAMES[i];
    const short = MONTH_SHORT[i];
    // Check word boundaries
    const regex = new RegExp(`\\b(${full}|${short})\\b`, 'i');
    if (regex.test(combinedText)) {
      monthIndex = i;
      break;
    }
  }

  // Fallback to sheet id if format is YYYY-MM
  if (monthIndex === -1) {
    const idMatch = sheet.id.match(/(\d{4})-(\d{2})/);
    if (idMatch) {
      monthIndex = parseInt(idMatch[2], 10) - 1;
    }
  }

  // If still not found, default to October (index 9)
  if (monthIndex < 0 || monthIndex > 11) {
    monthIndex = 9;
  }

  const monthNum = String(monthIndex + 1).padStart(2, '0');
  const monthKey = `${year}-${monthNum}`;
  const monthCap = MONTH_NAMES[monthIndex].charAt(0).toUpperCase() + MONTH_NAMES[monthIndex].slice(1);
  const displayName = `${monthCap} ${year}`;
  const tableTitle = sheet.sheetTitle?.trim() || monthCap.toUpperCase();

  // Detect cutoff
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
 * Standard expense categories to summarize in charts.
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
  sheets: MonthData[]
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

  // Category amounts map
  const categoryAmountMap: Record<string, number> = {};
  STANDARD_EXPENSE_CATEGORIES.forEach((cat) => {
    categoryAmountMap[cat.id] = 0;
  });

  const cutoffSummaries: CutoffSheetSummary[] = [];

  // Sort sheets chronologically (1st cutoff before 2nd cutoff)
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

    // Prefer cutoff15th or monthly depending on sheet setup
    let sheetExp = 0;
    STANDARD_EXPENSE_CATEGORIES.forEach((cat) => {
      const row = rows[cat.id as RowId];
      if (row) {
        const val = (row.cutoff15th?.value || 0) + (row.monthly?.value && !row.cutoff15th?.value ? row.monthly.value : 0);
        categoryAmountMap[cat.id] = (categoryAmountMap[cat.id] || 0) + val;
        sheetExp += val;

        // Check remarks
        if (row.remarks === 'OK') {
          settledAmount += val;
          settledCount++;
        } else if (row.remarks === 'Next Payroll') {
          nextPayrollAmount += val;
          nextPayrollCount++;
        }
      }
    });

    // Also include custom payment rows added by user (excluding bank subtotals, digital payment channels, and totals)
    Object.keys(rows).forEach((rId) => {
      if (
        !STANDARD_EXPENSE_CATEGORIES.some((c) => c.id === rId) &&
        !['metrobank', 'qr_ph', 'total', 'salary', 'balance', 'mp2', 'gotyme'].includes(rId)
      ) {
        const customRow = rows[rId];
        if (customRow && customRow.rowType === 'expense') {
          const val = (customRow.cutoff15th?.value || 0) + (customRow.monthly?.value && !customRow.cutoff15th?.value ? customRow.monthly.value : 0);
          sheetExp += val;
          if (customRow.remarks === 'OK') {
            settledAmount += val;
            settledCount++;
          } else if (customRow.remarks === 'Next Payroll') {
            nextPayrollAmount += val;
            nextPayrollCount++;
          }
        }
      }
    });

    const sheetTotalVal = sheet.rows['total']?.cutoff15th?.value || sheet.rows['total']?.monthly?.value || 0;
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

  // Final ending liquid balance is from the latest sheet in the month
  const latestSheet = sortedSheets[sortedSheets.length - 1];
  const balanceVal =
    latestSheet.rows['balance']?.cutoff15th?.value ??
    latestSheet.rows['balance']?.monthly?.value ??
    0;

  const personalSavings = gotymeVal + balanceVal;
  const totalCombinedSavings = governmentSavings + personalSavings;

  const settlementPercent = totalExpenses > 0 ? Math.round((settledAmount / totalExpenses) * 100) : 0;
  const savingsRate = salaryVal > 0 ? Math.round((totalCombinedSavings / salaryVal) * 100) : 0;
  const govSavingsRate = salaryVal > 0 ? Math.round((governmentSavings / salaryVal) * 100) : 0;
  const personalSavingsRate = salaryVal > 0 ? Math.round((personalSavings / salaryVal) * 100) : 0;

  const expenseCategories = STANDARD_EXPENSE_CATEGORIES.map((cat) => ({
    ...cat,
    amount: categoryAmountMap[cat.id] || 0,
  }));

  return {
    monthKey,
    displayName,
    tableTitle,
    sheetCount: sheets.length,
    sheets: sortedSheets,
    cutoffSummaries,
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
  allMonths: Record<string, MonthData>
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
        g.sheets
      );
    });

  return result;
}

/**
 * Computes unified Overall Summary aggregating ALL months and sheets in the entire workbook.
 */
export function computeOverallWorkbookData(
  allMonths: Record<string, MonthData>
): CombinedMonthData {
  const sheetList = Object.values(allMonths);
  if (sheetList.length === 0) {
    return computeCombinedMonthData('overall', 'All Months', 'OVERALL SUMMARY', []);
  }

  const combined = computeCombinedMonthData(
    'overall',
    'All Months',
    'OVERALL SUMMARY',
    sheetList
  );

  // Total ending liquid surplus across all sheets
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
    combined.personalSavingsRate = Math.round((combined.personalSavings / combined.salaryVal) * 100);
  }

  return combined;
}

