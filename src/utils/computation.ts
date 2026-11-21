import { MonthData, RowId, BudgetRowState } from '../types/budget';
import { parseNumericString, formatPHP } from './currency';
import { evaluateFormulaInput } from './formula';

export const METROBANK_SOURCE_ROW_IDS: string[] = [
  'rent',
  'loan',
  'water_bill',
  'electric_bill',
  'gas',
  'meal',
  'mobile_load',
  'others',
];

export const EXPENSE_DROPDOWN_ROW_IDS: string[] = [
  'rent',
  'loan',
  'water_bill',
  'electric_bill',
  'gas',
  'meal',
  'mobile_load',
  'others',
  'lazada',
  'mp2',
  'gotyme',
];

/**
 * Recalculates all dependent rows and remarks for a given MonthData.
 */
export function recalculateMonthData(month: MonthData): MonthData {
  const updatedRows = { ...month.rows };

  // 1. Calculate Metrobank (Sum of House, Loans, Water bill, Electric bill, Gas, Meal, Mobile load, Others)
  let metroMonthly = 0;
  let metroKinsenas = 0;

  for (const [rowId, row] of Object.entries(updatedRows)) {
    if (!row) continue;
    const isMbSource =
      row.isAutoMetrobank ||
      METROBANK_SOURCE_ROW_IDS.includes(rowId) ||
      rowId.startsWith('loan');

    if (isMbSource) {
      const mVal = row.monthly?.value || 0;
      const kVal = row.cutoff15th?.value || 0;

      metroMonthly += mVal > 0 ? mVal : (kVal > 0 ? kVal : 0);

      // Kinsenas sum: use Kinsenas if entered, or if 0 check Monthly when settled (not deferred)
      if (kVal > 0) {
        metroKinsenas += kVal;
      } else if (mVal > 0 && row.remarks !== 'Next Payroll' && row.remarks !== 'Deferred') {
        metroKinsenas += mVal;
      }
    }
  }

  // 1. Calculate Metrobank
  let metroFinalMonthly = metroMonthly;
  let metroFinalKinsenas = metroKinsenas;
  const customMetroKinsenas = updatedRows['metrobank']?.cutoff15th?.rawInput;
  if (customMetroKinsenas && customMetroKinsenas.startsWith('=')) {
    const evalK = evaluateFormulaInput(customMetroKinsenas);
    if (evalK.isValid && evalK.isFormula) {
      metroFinalKinsenas = evalK.value;
    }
  }

  if (updatedRows['metrobank']) {
    updatedRows['metrobank'] = {
      ...updatedRows['metrobank'],
      monthly: {
        ...updatedRows['metrobank'].monthly,
        value: metroFinalMonthly,
        rawInput: updatedRows['metrobank']?.monthly?.rawInput?.startsWith('=')
          ? updatedRows['metrobank'].monthly.rawInput
          : metroFinalMonthly.toString(),
      },
      cutoff15th: {
        ...updatedRows['metrobank'].cutoff15th,
        value: metroFinalKinsenas,
        rawInput: customMetroKinsenas?.startsWith('=')
          ? customMetroKinsenas
          : metroFinalKinsenas.toString(),
      },
      readOnlyMonthly: true,
      readOnly15th: true,
    };
  }

  // 2. Calculate Total (QR PH + Metrobank)
  const qrMonthly = updatedRows['qr_ph']?.monthly?.value || 0;
  const qrKinsenas = updatedRows['qr_ph']?.cutoff15th?.value || 0;

  let totalMonthly = qrMonthly + metroFinalMonthly;
  let totalKinsenas = qrKinsenas + metroFinalKinsenas;
  const customTotalKinsenas = updatedRows['total']?.cutoff15th?.rawInput;
  if (customTotalKinsenas && customTotalKinsenas.startsWith('=')) {
    const evalK = evaluateFormulaInput(customTotalKinsenas);
    if (evalK.isValid && evalK.isFormula) {
      totalKinsenas = evalK.value;
    }
  }

  if (updatedRows['total']) {
    updatedRows['total'] = {
      ...updatedRows['total'],
      monthly: {
        ...updatedRows['total'].monthly,
        value: totalMonthly,
        rawInput: updatedRows['total']?.monthly?.rawInput?.startsWith('=')
          ? updatedRows['total'].monthly.rawInput
          : totalMonthly.toString(),
      },
      cutoff15th: {
        ...updatedRows['total'].cutoff15th,
        value: totalKinsenas,
        rawInput: customTotalKinsenas?.startsWith('=')
          ? customTotalKinsenas
          : totalKinsenas.toString(),
      },
      readOnlyMonthly: true,
      readOnly15th: true,
    };
  }

  // 3. Calculate Salary (Manually input salary plus previous balance)
  let salaryMonthly =
    (month.salaryBreakdown.monthly.baseSalary || 0) +
    (month.salaryBreakdown.monthly.previousBalance || 0);

  let salaryKinsenas =
    (month.salaryBreakdown.cutoff15th.baseSalary || 0) +
    (month.salaryBreakdown.cutoff15th.previousBalance || 0);

  const customSalaryKinsenas = updatedRows['salary']?.cutoff15th?.rawInput;
  if (customSalaryKinsenas && customSalaryKinsenas.startsWith('=')) {
    const evalK = evaluateFormulaInput(customSalaryKinsenas);
    if (evalK.isValid && evalK.isFormula) {
      salaryKinsenas = evalK.value;
    }
  }

  if (updatedRows['salary']) {
    updatedRows['salary'] = {
      ...updatedRows['salary'],
      monthly: {
        ...updatedRows['salary'].monthly,
        value: salaryMonthly,
        rawInput: updatedRows['salary']?.monthly?.rawInput?.startsWith('=')
          ? updatedRows['salary'].monthly.rawInput
          : salaryMonthly.toString(),
      },
      cutoff15th: {
        ...updatedRows['salary'].cutoff15th,
        value: salaryKinsenas,
        rawInput: customSalaryKinsenas?.startsWith('=')
          ? customSalaryKinsenas
          : salaryKinsenas.toString(),
      },
      readOnlyMonthly: false,
      readOnly15th: false,
    };
  }

  // 4. Calculate Balance:
  // Original formula from user's Excel spreadsheet:
  // Balance = (Salary - Total) - (MP2 + Gotyme)
  const mp2Monthly = updatedRows['mp2']?.monthly?.value || 0;
  const mp2Kinsenas = updatedRows['mp2']?.cutoff15th?.value || 0;

  const gotymeMonthly = updatedRows['gotyme']?.monthly?.value || 0;
  const gotymeKinsenas = updatedRows['gotyme']?.cutoff15th?.value || 0;

  let balanceMonthly = (salaryMonthly - totalMonthly) - (mp2Monthly + gotymeMonthly);
  let balanceKinsenas = (salaryKinsenas - totalKinsenas) - (mp2Kinsenas + gotymeKinsenas);

  const customBalKinsenas = updatedRows['balance']?.cutoff15th?.rawInput;
  if (customBalKinsenas && customBalKinsenas.startsWith('=')) {
    const evalK = evaluateFormulaInput(customBalKinsenas);
    if (evalK.isValid && evalK.isFormula) {
      balanceKinsenas = evalK.value;
    }
  }

  if (updatedRows['balance']) {
    updatedRows['balance'] = {
      ...updatedRows['balance'],
      monthly: {
        ...updatedRows['balance'].monthly,
        value: balanceMonthly,
        rawInput: updatedRows['balance']?.monthly?.rawInput?.startsWith('=')
          ? updatedRows['balance'].monthly.rawInput
          : balanceMonthly.toString(),
      },
      cutoff15th: {
        ...updatedRows['balance'].cutoff15th,
        value: balanceKinsenas,
        rawInput: customBalKinsenas?.startsWith('=')
          ? customBalKinsenas
          : balanceKinsenas.toString(),
      },
      readOnlyMonthly: true,
      readOnly15th: true,
    };
  }

  // 5. Remarks Auto-computations:
  const qrWithdrawn = parseNumericString(updatedRows['qr_ph']?.remarks || '0') || (updatedRows['qr_ph']?.cutoff15th?.value || 0);
  const metroWithdrawn = parseNumericString(updatedRows['metrobank']?.remarks || '0');
  const totalWithdrawn = qrWithdrawn + metroWithdrawn;

  // Auto compute Remarks for Total: Total actual withdrawn (without symbol to prevent duplicate ₱)
  if (updatedRows['total']) {
    updatedRows['total'] = {
      ...updatedRows['total'],
      remarks: totalWithdrawn > 0 ? formatPHP(totalWithdrawn, { showDecimals: true, includeSymbol: false }) : '0.00',
    };
  }

  // Auto compute Remarks for Salary (without symbol to prevent duplicate ₱)
  const effectiveSalary = salaryKinsenas > 0 ? salaryKinsenas : salaryMonthly;
  if (updatedRows['salary']) {
    updatedRows['salary'] = {
      ...updatedRows['salary'],
      remarks: formatPHP(effectiveSalary, { showDecimals: true, includeSymbol: false }),
    };
  }

  // Auto compute Remarks for Balance: (Effective Salary - Total Withdrawn) - (Actual MP2 + Actual GoTyme)
  const actualGotyme = parseNumericString(updatedRows['gotyme']?.remarks || '0') || gotymeKinsenas;
  const actualMp2 = parseNumericString(updatedRows['mp2']?.remarks || '0') || mp2Kinsenas;
  const actualBalanceRemarks = (effectiveSalary - totalWithdrawn) - (actualMp2 + actualGotyme);
  if (updatedRows['balance']) {
    updatedRows['balance'] = {
      ...updatedRows['balance'],
      remarks: formatPHP(actualBalanceRemarks, { showDecimals: true, includeSymbol: false }),
    };
  }

  return {
    ...month,
    rows: updatedRows,
    updatedAt: new Date().toISOString(),
  };
}
