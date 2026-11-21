import { MonthData, RowId, BudgetRowState } from '../types/budget';
import { INITIAL_ROW_ORDER, ROW_CONFIG, createEmptyDefaultMonth } from './storage';
import { recalculateMonthData } from './computation';
import { evaluateFormulaInput } from './formula';
import { parseNumericString } from './currency';

export interface ImportResult {
  success: boolean;
  importedMonthsCount: number;
  monthNames: string[];
  data: Record<string, MonthData>;
  errors: string[];
}

// Maps common header and row label variants to canonical keys
const ROW_LABEL_MAP: Record<string, RowId> = {
  rent: 'rent',
  'water bill': 'water_bill',
  water: 'water_bill',
  waterbill: 'water_bill',
  'electric bill': 'electric_bill',
  electric: 'electric_bill',
  electricity: 'electric_bill',
  meralco: 'electric_bill',
  gas: 'gas',
  lpg: 'gas',
  meal: 'meal',
  meals: 'meal',
  food: 'meal',
  groceries: 'meal',
  'mobile load': 'mobile_load',
  load: 'mobile_load',
  mobile: 'mobile_load',
  others: 'others',
  other: 'others',
  miscellaneous: 'others',
  lazada: 'lazada',
  shopee: 'lazada',
  'qr ph': 'qr_ph',
  qrph: 'qr_ph',
  qr: 'qr_ph',
  metrobank: 'metrobank',
  total: 'total',
  salary: 'salary',
  income: 'salary',
  balance: 'balance',
  mp2: 'mp2',
  'pag-ibig mp2': 'mp2',
  gotyme: 'gotyme',
  'go tyme': 'gotyme',
};

function normalizeRowKey(name: string): RowId | null {
  const clean = name.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
  if (ROW_LABEL_MAP[clean]) return ROW_LABEL_MAP[clean];
  for (const [key, id] of Object.entries(ROW_LABEL_MAP)) {
    if (clean.includes(key)) return id;
  }
  return null;
}

/**
 * Standard CSV line splitter respecting quoted fields
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

/**
 * Parses CSV content (supports both single-month and multi-month January-to-Present formats)
 */
export function parseCSVData(
  csvText: string,
  existingMonths: Record<string, MonthData> = {},
  fallbackMonthName = 'Imported Month'
): ImportResult {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const errors: string[] = [];
  const resultMonths: Record<string, MonthData> = { ...existingMonths };

  if (lines.length < 2) {
    return {
      success: false,
      importedMonthsCount: 0,
      monthNames: [],
      data: existingMonths,
      errors: ['CSV content is empty or contains no data rows.'],
    };
  }

  // Find header row
  let headerIndex = -1;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const cols = parseCSVLine(lines[i]).map((c) => c.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (
      cols.some((c) => c.includes('payment') || c.includes('category') || c.includes('item')) &&
      cols.some((c) => c.includes('month') || c.includes('15th') || c.includes('remark'))
    ) {
      headerIndex = i;
      headers = parseCSVLine(lines[i]).map((c) => c.trim().toLowerCase());
      break;
    }
  }

  if (headerIndex === -1) {
    // If no header found, assume standard format: [Month, Payment, Monthly, 15th, Remarks, Notes] or [Payment, Monthly, 15th, Remarks, Notes]
    headerIndex = 0;
    const firstCols = parseCSVLine(lines[0]);
    if (firstCols.length >= 5) {
      headers = ['payment', 'monthly', '15th', 'remarks', 'notes'];
    } else {
      headers = ['payment', 'monthly', '15th', 'remarks'];
    }
  }

  // Identify column indices
  let colMonth = headers.findIndex((h) => h.includes('month') && !h.includes('monthly'));
  let colPayment = headers.findIndex((h) => h.includes('payment') || h.includes('item') || h.includes('category'));
  let colMonthly = headers.findIndex((h) => h.includes('monthly') || (h.includes('month') && colMonth !== -1));
  let col15th = headers.findIndex((h) => h.includes('15') || h.includes('cutoff'));
  let colRemarks = headers.findIndex((h) => h.includes('remark'));
  let colNotes = headers.findIndex((h) => h.includes('note'));

  // Default adjustments if column assignments collided
  if (colPayment === -1) colPayment = colMonth === 0 ? 1 : 0;
  if (colMonthly === -1) colMonthly = colPayment + 1;
  if (col15th === -1) col15th = colMonthly + 1;
  if (colRemarks === -1) colRemarks = col15th + 1;

  const modifiedMonthIds = new Set<string>();

  // Process rows
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine.startsWith('#') || rawLine.startsWith('---') || rawLine.toLowerCase().includes('summary & formula')) {
      continue;
    }

    const cols = parseCSVLine(rawLine);
    if (cols.length < 2) continue;

    const monthColVal = colMonth !== -1 && cols[colMonth] ? cols[colMonth].trim() : fallbackMonthName;
    const paymentColVal = cols[colPayment] ? cols[colPayment].trim() : '';

    if (!paymentColVal) continue;

    let targetRowId = normalizeRowKey(paymentColVal);

    // Identify month ID
    const monthId = monthColVal.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'imported_month';

    if (!resultMonths[monthId]) {
      resultMonths[monthId] = createEmptyDefaultMonth(monthId, monthColVal);
    }

    modifiedMonthIds.add(monthId);
    const targetMonth = resultMonths[monthId];

    if (!targetRowId || !targetMonth.rows[targetRowId]) {
      const customId = `import_${paymentColVal.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${i}`;
      targetMonth.rows[customId] = {
        id: customId as RowId,
        label: paymentColVal,
        monthly: { rawInput: '', value: 0 },
        cutoff15th: { rawInput: '', value: 0 },
        remarks: 'OK',
        rowType: 'expense',
        isCustomRow: true,
        isAutoMetrobank: true,
      };
      if (!targetMonth.rowOrder) targetMonth.rowOrder = [...INITIAL_ROW_ORDER];
      targetMonth.rowOrder.push(customId as RowId);
      targetRowId = customId as RowId;
    }

    const currentRow = targetMonth.rows[targetRowId];
    if (!currentRow) continue;

    const rawMonthly = cols[colMonthly] !== undefined ? cols[colMonthly].trim() : '';
    const raw15th = cols[col15th] !== undefined ? cols[col15th].trim() : '';
    const rawRemarks = cols[colRemarks] !== undefined ? cols[colRemarks].trim() : '';
    const rawNotes = colNotes !== -1 && cols[colNotes] !== undefined ? cols[colNotes].trim() : '';

    // Evaluate monthly input
    let monthlyCell = currentRow.monthly;
    if (rawMonthly) {
      const evalMonthly = evaluateFormulaInput(rawMonthly);
      monthlyCell = {
        ...monthlyCell,
        rawInput: rawMonthly,
        value: evalMonthly.value,
        formula: evalMonthly.isFormula ? rawMonthly : undefined,
      };
    }

    // Evaluate 15th input
    let cutoffCell = currentRow.cutoff15th;
    if (raw15th) {
      const eval15th = evaluateFormulaInput(raw15th);
      cutoffCell = {
        ...cutoffCell,
        rawInput: raw15th,
        value: eval15th.value,
        formula: eval15th.isFormula ? raw15th : undefined,
      };
    }

    // Parse notes if formatted e.g. "Monthly: Note A | 15th: Note B" or generic
    if (rawNotes) {
      if (rawNotes.includes('|')) {
        const parts = rawNotes.split('|').map((p) => p.trim());
        parts.forEach((part) => {
          if (part.toLowerCase().startsWith('monthly:')) {
            monthlyCell.note = part.slice(8).trim();
          } else if (part.toLowerCase().startsWith('15th:')) {
            cutoffCell.note = part.slice(5).trim();
          } else if (!monthlyCell.note) {
            monthlyCell.note = part;
          }
        });
      } else {
        if (!monthlyCell.note) monthlyCell.note = rawNotes;
        if (!cutoffCell.note) cutoffCell.note = rawNotes;
      }
    }

    // Remarks
    let finalRemarks = currentRow.remarks;
    if (rawRemarks) {
      const normRemarks = rawRemarks.toLowerCase();
      if (normRemarks === 'ok' || normRemarks === 'paid' || normRemarks === 'settled') {
        finalRemarks = 'OK';
      } else if (
        normRemarks.includes('next') ||
        normRemarks.includes('payroll') ||
        normRemarks === 'deferred'
      ) {
        finalRemarks = 'Next Payroll';
      } else {
        finalRemarks = rawRemarks;
      }
    }

    // Update row
    targetMonth.rows[targetRowId] = {
      ...currentRow,
      monthly: monthlyCell,
      cutoff15th: cutoffCell,
      remarks: finalRemarks,
    };

    // If row was salary, update breakdown as well
    if (targetRowId === 'salary') {
      if (rawMonthly) {
        targetMonth.salaryBreakdown.monthly.baseSalary = monthlyCell.value;
      }
      if (raw15th) {
        targetMonth.salaryBreakdown.cutoff15th.baseSalary = cutoffCell.value;
      }
    }
  }

  // Recalculate all touched months
  const touchedNames: string[] = [];
  for (const mId of modifiedMonthIds) {
    resultMonths[mId] = recalculateMonthData(resultMonths[mId]);
    touchedNames.push(resultMonths[mId].name);
  }

  return {
    success: modifiedMonthIds.size > 0,
    importedMonthsCount: modifiedMonthIds.size,
    monthNames: touchedNames,
    data: resultMonths,
    errors,
  };
}

/**
 * Parses JSON backup data containing all months
 */
export function parseJSONBackup(
  jsonText: string,
  existingMonths: Record<string, MonthData> = {}
): ImportResult {
  try {
    const parsed = JSON.parse(jsonText);
    let monthsToProcess: Record<string, MonthData> = {};

    if (parsed.months && typeof parsed.months === 'object') {
      monthsToProcess = parsed.months;
    } else if (typeof parsed === 'object' && !Array.isArray(parsed)) {
      monthsToProcess = parsed;
    } else if (Array.isArray(parsed)) {
      parsed.forEach((m: MonthData) => {
        if (m.id && m.name) {
          monthsToProcess[m.id] = m;
        }
      });
    }

    const merged = { ...existingMonths };
    const importedNames: string[] = [];

    for (const [id, m] of Object.entries(monthsToProcess)) {
      if (m && m.rows && m.name) {
        merged[id] = recalculateMonthData(m as MonthData);
        importedNames.push(m.name);
      }
    }

    return {
      success: importedNames.length > 0,
      importedMonthsCount: importedNames.length,
      monthNames: importedNames,
      data: merged,
      errors: importedNames.length === 0 ? ['No valid month records found in JSON.'] : [],
    };
  } catch (err) {
    return {
      success: false,
      importedMonthsCount: 0,
      monthNames: [],
      data: existingMonths,
      errors: [err instanceof Error ? err.message : 'Invalid JSON file format'],
    };
  }
}
