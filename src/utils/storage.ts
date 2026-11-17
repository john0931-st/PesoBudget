import { MonthData, RowId } from '../types/budget';
import { recalculateMonthData } from './computation';

const STORAGE_KEY = 'pesobudget_months_v3';
const ACTIVE_MONTH_KEY = 'pesobudget_active_month_v3';

/**
 * Returns true when running on a public shared link (*.ai.studio, ais-pre-*, Firebase Hosting *.web.app / *.firebaseapp.com,
 * Netlify *.netlify.app, Vercel *.vercel.app, Cloudflare Pages *.pages.dev, GitHub Pages *.github.io,
 * or Cloud Run *.run.app other than ais-dev-*) unless an explicit offline portable seed was embedded.
 */
export function isSharedPublicDeployment(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.__PESOBUDGET_PORTABLE_SEED__ || window.__PESOBUDGET_ENCRYPTED_SEED__) {
    return false;
  }
  if (window.location.protocol === 'file:') {
    return false;
  }
  const host = window.location.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('ais-dev-')) {
    return false;
  }
  return (
    host.endsWith('.ai.studio') ||
    host.startsWith('ais-pre-') ||
    host.endsWith('.web.app') ||
    host.endsWith('.firebaseapp.com') ||
    host.endsWith('.netlify.app') ||
    host.endsWith('.vercel.app') ||
    host.endsWith('.pages.dev') ||
    host.endsWith('.github.io') ||
    host.endsWith('.workers.dev') ||
    host.endsWith('.surge.sh') ||
    host.endsWith('.onrender.com') ||
    host.endsWith('.run.app')
  );
}

export const INITIAL_ROW_ORDER: RowId[] = [
  'rent',
  'loan',
  'water_bill',
  'electric_bill',
  'gas',
  'meal',
  'mobile_load',
  'others',
  'lazada',
  'qr_ph',
  'metrobank',
  'total',
  'salary',
  'balance',
  'mp2',
  'gotyme',
];

export const ROW_CONFIG: Record<
  RowId,
  {
    label: string;
    description: string;
    rowType: 'expense' | 'savings' | 'bank_subtotal' | 'digital_payment' | 'grand_total' | 'income' | 'balance';
    isAutoMetrobank?: boolean;
    remarksType: 'dropdown' | 'manual_numeric' | 'auto';
  }
> = {
  rent: {
    label: 'House',
    description: 'House rent / monthly housing payment',
    rowType: 'expense',
    isAutoMetrobank: true,
    remarksType: 'dropdown',
  },
  loan: {
    label: 'Loan',
    description: 'Personal, SSS, Pag-IBIG or bank loan payment',
    rowType: 'expense',
    isAutoMetrobank: true,
    remarksType: 'dropdown',
  },
  water_bill: {
    label: 'Water Bill',
    description: 'Water utility bill',
    rowType: 'expense',
    isAutoMetrobank: true,
    remarksType: 'dropdown',
  },
  electric_bill: {
    label: 'Electricity Bill',
    description: 'Electric utility bill',
    rowType: 'expense',
    isAutoMetrobank: true,
    remarksType: 'dropdown',
  },
  gas: {
    label: 'Gas',
    description: 'LPG cylinder tank refill',
    rowType: 'expense',
    isAutoMetrobank: true,
    remarksType: 'dropdown',
  },
  meal: {
    label: 'Meal',
    description: 'Groceries, market, daily meals & dining',
    rowType: 'expense',
    isAutoMetrobank: true,
    remarksType: 'dropdown',
  },
  mobile_load: {
    label: 'Mobile Load',
    description: 'Prepaid load / mobile data promo',
    rowType: 'expense',
    isAutoMetrobank: true,
    remarksType: 'dropdown',
  },
  others: {
    label: 'Others',
    description: 'Variable expenses. Supports formulas like =100+100',
    rowType: 'expense',
    isAutoMetrobank: true,
    remarksType: 'dropdown',
  },
  lazada: {
    label: 'Lazada',
    description: 'Online shopping bill (paid via QR PH digital payment)',
    rowType: 'expense',
    isAutoMetrobank: false,
    remarksType: 'dropdown',
  },
  qr_ph: {
    label: 'QR PH',
    description: 'Digital payment method for Lazada (not an expense)',
    rowType: 'digital_payment',
    isAutoMetrobank: false,
    remarksType: 'dropdown',
  },
  metrobank: {
    label: 'METROBANK',
    description: 'Withdrawn money (ATM cash for House, Loan, Water, Electricity, Gas, Meal, Load, Others)',
    rowType: 'bank_subtotal',
    remarksType: 'manual_numeric',
  },
  total: {
    label: 'TOTAL',
    description: 'Auto-computed sum of QR PH (digital payment) + METROBANK (withdrawn cash)',
    rowType: 'grand_total',
    remarksType: 'auto',
  },
  salary: {
    label: 'Salary',
    description: 'Base salary plus carried previous balance',
    rowType: 'income',
    remarksType: 'auto',
  },
  balance: {
    label: 'Balance',
    description: 'Formula: (Salary - Total) - (MP2 + Gotyme)',
    rowType: 'balance',
    remarksType: 'auto',
  },
  mp2: {
    label: 'MP2',
    description: 'Pag-IBIG MP2 Government Savings',
    rowType: 'savings',
    remarksType: 'dropdown',
  },
  gotyme: {
    label: 'GOTYME',
    description: 'Personal Savings Stash / Digital Bank',
    rowType: 'savings',
    remarksType: 'dropdown',
  },
};

/**
 * Creates default month populated with the exact figures from user's Excel spreadsheet screenshot
 */
export function createDefaultMonth(id = '2026-10', name = 'October 2026'): MonthData {
  const baseMonth: MonthData = {
    id,
    name,
    salaryBreakdown: {
      monthly: {
        baseSalary: 13406.16,
        previousBalance: 0,
      },
      cutoff15th: {
        baseSalary: 6703.08,
        previousBalance: 0,
      },
    },
    rows: {
      rent: {
        id: 'rent',
        label: 'House',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 2500, rawInput: '2500' },
        remarks: 'OK',
        rowType: 'expense',
      },
      loan: {
        id: 'loan',
        label: 'Loan',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: '',
        rowType: 'expense',
      },
      water_bill: {
        id: 'water_bill',
        label: 'Water Bill',
        monthly: { value: 310, rawInput: '310' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: 'OK',
        rowType: 'expense',
      },
      electric_bill: {
        id: 'electric_bill',
        label: 'Electricity Bill',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: 'Next Payroll',
        rowType: 'expense',
      },
      gas: {
        id: 'gas',
        label: 'Gas',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 510, rawInput: '510' },
        remarks: 'OK',
        rowType: 'expense',
      },
      meal: {
        id: 'meal',
        label: 'Meal',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 510, rawInput: '510' },
        remarks: 'OK',
        rowType: 'expense',
      },
      mobile_load: {
        id: 'mobile_load',
        label: 'Mobile Load',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: '',
        rowType: 'expense',
      },
      others: {
        id: 'others',
        label: 'Others',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 2452, rawInput: '=1200+852+400', formula: '=1200+852+400' },
        remarks: 'OK',
        rowType: 'expense',
      },
      lazada: {
        id: 'lazada',
        label: 'Lazada',
        monthly: { value: 1015.08, rawInput: '1015.08' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: 'OK',
        rowType: 'expense',
      },
      qr_ph: {
        id: 'qr_ph',
        label: 'QR PH',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 1015.08, rawInput: '1015.08' },
        remarks: 'OK',
        rowType: 'digital_payment',
      },
      metrobank: {
        id: 'metrobank',
        label: 'METROBANK',
        monthly: { value: 0, rawInput: '0' },
        cutoff15th: { value: 6282, rawInput: '6282' },
        remarks: '6282.00',
        rowType: 'bank_subtotal',
        readOnlyMonthly: true,
        readOnly15th: true,
      },
      total: {
        id: 'total',
        label: 'TOTAL',
        monthly: { value: 0, rawInput: '0' },
        cutoff15th: { value: 7297.08, rawInput: '7297.08' },
        remarks: '₱ 7,297.08',
        rowType: 'grand_total',
        readOnlyMonthly: true,
        readOnly15th: true,
      },
      salary: {
        id: 'salary',
        label: 'Salary',
        monthly: { value: 13406.16, rawInput: '13406.16' },
        cutoff15th: { value: 6703.08, rawInput: '6703.08' },
        remarks: '₱ 6,703.08',
        rowType: 'income',
      },
      balance: {
        id: 'balance',
        label: 'Balance',
        monthly: { value: 0, rawInput: '0' },
        cutoff15th: { value: -1609.0, rawInput: '-1609.00' },
        remarks: '-₱ 1,609.00',
        rowType: 'balance',
        readOnlyMonthly: true,
        readOnly15th: true,
      },
      mp2: {
        id: 'mp2',
        label: 'MP2',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 505, rawInput: '505' },
        remarks: 'OK',
        rowType: 'savings',
      },
      gotyme: {
        id: 'gotyme',
        label: 'GOTYME',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 510, rawInput: '510' },
        remarks: 'OK',
        rowType: 'savings',
      },
    },
    updatedAt: new Date().toISOString(),
    sheetTitle: 'OCTOBER 2026',
  };

  return recalculateMonthData(baseMonth);
}

/**
 * Creates an empty default budget month where:
 * - All expense rows are EMPTY (rawInput: '', value: 0, remarks: '')
 * - Auto-computed formula rows (Metrobank, Total, Salary, Balance) are preserved
 * - Salary automatically equals Previous Balance + Current Salary
 */
export function createEmptyDefaultMonth(
  id: string,
  name: string,
  previousBalanceMonthly = 0,
  previousBalanceKinsenas = 0,
  baseSalaryMonthly = 0,
  baseSalaryKinsenas = 0
): MonthData {
  const baseMonth: MonthData = {
    id,
    name,
    salaryBreakdown: {
      monthly: {
        baseSalary: baseSalaryMonthly,
        previousBalance: previousBalanceMonthly,
        note: previousBalanceMonthly > 0 ? `Carried over previous balance: ₱${previousBalanceMonthly.toFixed(2)}` : undefined,
      },
      cutoff15th: {
        baseSalary: baseSalaryKinsenas,
        previousBalance: previousBalanceKinsenas,
        note: previousBalanceKinsenas > 0 ? `Carried over previous balance: ₱${previousBalanceKinsenas.toFixed(2)}` : undefined,
      },
    },
    rows: {
      rent: {
        id: 'rent',
        label: 'House',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: '',
        rowType: 'expense',
      },
      loan: {
        id: 'loan',
        label: 'Loan',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: '',
        rowType: 'expense',
      },
      water_bill: {
        id: 'water_bill',
        label: 'Water Bill',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: '',
        rowType: 'expense',
      },
      electric_bill: {
        id: 'electric_bill',
        label: 'Electricity Bill',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: '',
        rowType: 'expense',
      },
      gas: {
        id: 'gas',
        label: 'Gas',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: '',
        rowType: 'expense',
      },
      meal: {
        id: 'meal',
        label: 'Meal',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: '',
        rowType: 'expense',
      },
      mobile_load: {
        id: 'mobile_load',
        label: 'Mobile Load',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: '',
        rowType: 'expense',
      },
      others: {
        id: 'others',
        label: 'Others',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: '',
        rowType: 'expense',
      },
      lazada: {
        id: 'lazada',
        label: 'Lazada',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: '',
        rowType: 'expense',
      },
      qr_ph: {
        id: 'qr_ph',
        label: 'QR PH',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: '',
        rowType: 'digital_payment',
      },
      metrobank: {
        id: 'metrobank',
        label: 'METROBANK',
        monthly: { value: 0, rawInput: '0' },
        cutoff15th: { value: 0, rawInput: '0' },
        remarks: '₱0.00',
        rowType: 'bank_subtotal',
        readOnlyMonthly: true,
        readOnly15th: true,
      },
      total: {
        id: 'total',
        label: 'TOTAL',
        monthly: { value: 0, rawInput: '0' },
        cutoff15th: { value: 0, rawInput: '0' },
        remarks: '₱0.00',
        rowType: 'grand_total',
        readOnlyMonthly: true,
        readOnly15th: true,
      },
      salary: {
        id: 'salary',
        label: 'SALARY',
        monthly: { value: baseSalaryMonthly + previousBalanceMonthly, rawInput: (baseSalaryMonthly + previousBalanceMonthly).toString() },
        cutoff15th: { value: baseSalaryKinsenas + previousBalanceKinsenas, rawInput: (baseSalaryKinsenas + previousBalanceKinsenas).toString() },
        remarks: '',
        rowType: 'income',
      },
      balance: {
        id: 'balance',
        label: 'BALANCE',
        monthly: { value: 0, rawInput: '0' },
        cutoff15th: { value: 0, rawInput: '0' },
        remarks: '₱0.00',
        rowType: 'balance',
        readOnlyMonthly: true,
        readOnly15th: true,
      },
      mp2: {
        id: 'mp2',
        label: 'MP2',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: '',
        rowType: 'savings',
      },
      gotyme: {
        id: 'gotyme',
        label: 'GOTYME',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: '',
        rowType: 'savings',
      },
    },
    updatedAt: new Date().toISOString(),
    sheetTitle: getDefaultTableTitle(name),
  };

  return recalculateMonthData(baseMonth);
}

/**
 * Resolves the default table title (e.g. "OCTOBER 2026" or "JANUARY") from a sheet name.
 * If sheet name is "January 1 to 15" or "January 16-31", table title is "JANUARY",
 * fulfilling the user's rule that both 15-day sheets have the month as the table title.
 */
export function getDefaultTableTitle(name: string): string {
  const match = name.match(/^(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
  if (match) {
    const month = match[1].toUpperCase();
    const yearMatch = name.match(/\b(202[0-9]|203[0-5])\b/);
    return yearMatch ? `${month} ${yearMatch[1]}` : month;
  }
  const stripped = name.replace(/\s*(1\s*[-–toTO]+\s*15|16\s*[-–toTO]+\s*\d{2})\b/i, '').trim();
  return stripped ? stripped.toUpperCase() : name.toUpperCase();
}

/**
 * Creates paired default 15-day sheets for a full month:
 * - Cutoff 1: October 1-15 (Table Title: "OCTOBER 2026")
 * - Cutoff 2: October 16-31 (Table Title: "OCTOBER 2026")
 * Together, these two sheets comprise 1 full month.
 */
export function createPairedDefaultMonths(): Record<string, MonthData> {
  const sheet1 = createDefaultMonth('2026-10-1', 'October 1-15');
  sheet1.sheetTitle = 'OCTOBER 2026';

  const sheet2: MonthData = {
    id: '2026-10-2',
    name: 'October 16-31',
    sheetTitle: 'OCTOBER 2026',
    salaryBreakdown: {
      monthly: {
        baseSalary: 13406.16,
        previousBalance: -1609.00,
      },
      cutoff15th: {
        baseSalary: 6703.08,
        previousBalance: -1609.00,
      },
    },
    rows: {
      rent: {
        id: 'rent',
        label: 'House',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: 'OK',
        rowType: 'expense',
      },
      loan: {
        id: 'loan',
        label: 'Loan',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: '',
        rowType: 'expense',
      },
      water_bill: {
        id: 'water_bill',
        label: 'Water Bill',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: 'OK',
        rowType: 'expense',
      },
      electric_bill: {
        id: 'electric_bill',
        label: 'Electricity Bill',
        monthly: { value: 1850, rawInput: '1850' },
        cutoff15th: { value: 1850, rawInput: '1850' },
        remarks: 'OK',
        rowType: 'expense',
      },
      gas: {
        id: 'gas',
        label: 'Gas',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: 'OK',
        rowType: 'expense',
      },
      meal: {
        id: 'meal',
        label: 'Meal',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 650, rawInput: '650' },
        remarks: 'OK',
        rowType: 'expense',
      },
      mobile_load: {
        id: 'mobile_load',
        label: 'Mobile Load',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 300, rawInput: '300' },
        remarks: 'OK',
        rowType: 'expense',
      },
      others: {
        id: 'others',
        label: 'Others',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 550, rawInput: '550' },
        remarks: 'OK',
        rowType: 'expense',
      },
      lazada: {
        id: 'lazada',
        label: 'Lazada',
        monthly: { value: 450, rawInput: '450' },
        cutoff15th: { value: 0, rawInput: '' },
        remarks: 'OK',
        rowType: 'expense',
      },
      qr_ph: {
        id: 'qr_ph',
        label: 'QR PH',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 450, rawInput: '450' },
        remarks: 'OK',
        rowType: 'digital_payment',
      },
      metrobank: {
        id: 'metrobank',
        label: 'METROBANK',
        monthly: { value: 0, rawInput: '0' },
        cutoff15th: { value: 3350, rawInput: '3350' },
        remarks: '3350.00',
        rowType: 'bank_subtotal',
        readOnlyMonthly: true,
        readOnly15th: true,
      },
      total: {
        id: 'total',
        label: 'TOTAL',
        monthly: { value: 0, rawInput: '0' },
        cutoff15th: { value: 3800, rawInput: '3800' },
        remarks: '₱ 3,800.00',
        rowType: 'grand_total',
        readOnlyMonthly: true,
        readOnly15th: true,
      },
      salary: {
        id: 'salary',
        label: 'Salary',
        monthly: { value: 13406.16, rawInput: '13406.16' },
        cutoff15th: { value: 5094.08, rawInput: '5094.08' },
        remarks: '₱ 5,094.08',
        rowType: 'income',
      },
      balance: {
        id: 'balance',
        label: 'Balance',
        monthly: { value: 0, rawInput: '0' },
        cutoff15th: { value: 279.08, rawInput: '279.08' },
        remarks: '₱ 279.08',
        rowType: 'balance',
        readOnlyMonthly: true,
        readOnly15th: true,
      },
      mp2: {
        id: 'mp2',
        label: 'MP2',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 505, rawInput: '505' },
        remarks: 'OK',
        rowType: 'savings',
      },
      gotyme: {
        id: 'gotyme',
        label: 'GOTYME',
        monthly: { value: 0, rawInput: '' },
        cutoff15th: { value: 510, rawInput: '510' },
        remarks: 'OK',
        rowType: 'savings',
      },
    },
    updatedAt: new Date().toISOString(),
  };

  const recSheet1 = recalculateMonthData(sheet1);
  const recSheet2 = recalculateMonthData(sheet2);

  return {
    [recSheet1.id]: recSheet1,
    [recSheet2.id]: recSheet2,
  };
}

/**
 * Creates paired blank 15-day sheets for the current month/year with zero personal or live numbers.
 * Used when first opening the shared public app link so new users start with a clean slate.
 */
export function createPairedBlankMonths(): Record<string, MonthData> {
  const now = new Date();
  const year = now.getFullYear();
  const monthNum = now.getMonth() + 1;
  const monthName = now.toLocaleString('en-US', { month: 'long' });
  const paddedMonth = String(monthNum).padStart(2, '0');
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const id1 = `${year}-${paddedMonth}-1`;
  const id2 = `${year}-${paddedMonth}-2`;

  const sheet1 = createEmptyDefaultMonth(id1, `${monthName} 1-15`);
  sheet1.year = year;
  sheet1.sheetTitle = `${monthName.toUpperCase()} ${year}`;

  const sheet2 = createEmptyDefaultMonth(id2, `${monthName} 16-${daysInMonth}`);
  sheet2.year = year;
  sheet2.sheetTitle = `${monthName.toUpperCase()} ${year}`;

  return {
    [sheet1.id]: sheet1,
    [sheet2.id]: sheet2,
  };
}

export function loadSavedMonths(): Record<string, MonthData> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = isSharedPublicDeployment()
        ? createPairedBlankMonths()
        : createPairedDefaultMonths();
      saveAllMonths(initial);
      const firstId = Object.keys(initial)[0];
      if (firstId) setActiveMonthId(firstId);
      return initial;
    }
    const SAMPLE_DATA_NOTES = new Set([
      'Submeter water bill reading',
      'Maynilad / submeter reading',
      'Meralco reading deferred to next cutoff',
      'Electricity bill deferred',
      'Meralco paid in 2nd cutoff',
      'Multiple items: =1200+852+400',
      'Online shopping bill (paid via QR PH)',
      'Digital payment method for Lazada (not an expense)',
      'Withdrawn money (ATM cash for bills)',
      'Actual Metrobank ATM cash withdrawn: ₱6,282.00',
      'Actual Metrobank ATM cash withdrawn: ₱3,350.00',
      'Pag-IBIG Modified MP2 Voluntary Savings',
      'Pag-IBIG MP2 payment',
      'GoTyme Bank Go Save Stash',
      'GoTyme Stash deposit',
      'Full month gross/net',
      'Kinsenas payroll allocation',
      'Carried over balance from Cutoff 1: -₱1,609.00',
    ]);

    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && Object.keys(parsed).length > 0) {
      const result: Record<string, MonthData> = {};
      let strippedAnySampleNote = false;
      for (const [key, data] of Object.entries(parsed)) {
        // Ensure loan row exists in loaded data if older version
        const monthObj = data as MonthData;
        if (!monthObj.rows.loan) {
          monthObj.rows.loan = {
            id: 'loan',
            label: 'Loan',
            monthly: { value: 0, rawInput: '' },
            cutoff15th: { value: 0, rawInput: '' },
            remarks: '',
            rowType: 'expense',
          };
        }
        // Ensure qr_ph is digital_payment method (not an expense bill, preventing double-counting with Lazada)
        if (monthObj.rows.qr_ph) {
          monthObj.rows.qr_ph.rowType = 'digital_payment';
        }

        // Remove any legacy pre-populated sample-data notes while preserving all user-written notes
        if (monthObj.salaryBreakdown?.monthly?.note && SAMPLE_DATA_NOTES.has(monthObj.salaryBreakdown.monthly.note)) {
          delete monthObj.salaryBreakdown.monthly.note;
          strippedAnySampleNote = true;
        }
        if (monthObj.salaryBreakdown?.cutoff15th?.note && SAMPLE_DATA_NOTES.has(monthObj.salaryBreakdown.cutoff15th.note)) {
          delete monthObj.salaryBreakdown.cutoff15th.note;
          strippedAnySampleNote = true;
        }
        for (const row of Object.values(monthObj.rows)) {
          if (!row) continue;
          if (row.labelNote && SAMPLE_DATA_NOTES.has(row.labelNote)) {
            delete row.labelNote;
            strippedAnySampleNote = true;
          }
          if (row.remarksNote && SAMPLE_DATA_NOTES.has(row.remarksNote)) {
            delete row.remarksNote;
            strippedAnySampleNote = true;
          }
          if (row.monthly?.note && SAMPLE_DATA_NOTES.has(row.monthly.note)) {
            delete row.monthly.note;
            strippedAnySampleNote = true;
          }
          if (row.cutoff15th?.note && SAMPLE_DATA_NOTES.has(row.cutoff15th.note)) {
            delete row.cutoff15th.note;
            strippedAnySampleNote = true;
          }
        }

        // Table title is the month (e.g. OCTOBER 2026 or JANUARY), not the system app title
        if (
          !monthObj.sheetTitle ||
          monthObj.sheetTitle === 'SALARY MONITORING 2026' ||
          monthObj.sheetTitle === 'PesoBudget - Smart Philippine Expense & Payroll Tracker'
        ) {
          monthObj.sheetTitle = getDefaultTableTitle(monthObj.name);
        }
        result[key] = recalculateMonthData(monthObj);
      }
      if (strippedAnySampleNote) {
        saveAllMonths(result);
      }
      return result;
    }
  } catch (err) {
    console.error('Failed to load saved months:', err);
  }
  return isSharedPublicDeployment()
    ? createPairedBlankMonths()
    : createPairedDefaultMonths();
}

export function saveAllMonths(months: Record<string, MonthData>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(months));
  } catch (err) {
    console.error('Failed to save months:', err);
  }
}

export function getActiveMonthId(): string {
  try {
    const saved = localStorage.getItem(ACTIVE_MONTH_KEY);
    if (saved) return saved;
  } catch {
    // ignore
  }
  if (isSharedPublicDeployment()) {
    const now = new Date();
    const paddedMonth = String(now.getMonth() + 1).padStart(2, '0');
    return `${now.getFullYear()}-${paddedMonth}-1`;
  }
  return '2026-10-1';
}

export function setActiveMonthId(monthId: string): void {
  try {
    localStorage.setItem(ACTIVE_MONTH_KEY, monthId);
  } catch {
    // ignore
  }
}

