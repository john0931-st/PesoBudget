import { MonthData, RowId } from '../types/budget';
import { createDefaultMonth } from './storage';
import { recalculateMonthData } from './computation';

export function generateJanuaryToPresentHistory(): Record<string, MonthData> {
  const monthConfigs = [
    { id: '2026-01', name: 'January 2026', electric: 2800, meal: 8000, lazada: 2100, others: 650, baseSalary: 45000, prev: 0 },
    { id: '2026-02', name: 'February 2026', electric: 2950, meal: 8200, lazada: 950, others: 700, baseSalary: 45000, prev: 3500 },
    { id: '2026-03', name: 'March 2026', electric: 3200, meal: 8400, lazada: 1400, others: 800, baseSalary: 45000, prev: 4100 },
    { id: '2026-04', name: 'April 2026', electric: 3900, meal: 8500, lazada: 1100, others: 950, baseSalary: 45000, prev: 3800 },
    { id: '2026-05', name: 'May 2026', electric: 4200, meal: 8600, lazada: 850, others: 600, baseSalary: 45000, prev: 3200 },
    { id: '2026-06', name: 'June 2026', electric: 3600, meal: 8300, lazada: 1300, others: 750, baseSalary: 45000, prev: 4000 },
    { id: '2026-07', name: 'July 2026', electric: 3300, meal: 8400, lazada: 900, others: 700, baseSalary: 45000, prev: 4500 },
    { id: '2026-08', name: 'August 2026', electric: 3100, meal: 8500, lazada: 1600, others: 850, baseSalary: 45000, prev: 4800 },
    { id: '2026-09', name: 'September 2026', electric: 3250, meal: 8600, lazada: 1200, others: 800, baseSalary: 45000, prev: 5000 },
    { id: '2026-10', name: 'October 2026', electric: 3450, meal: 8500, lazada: 1250, others: 850, baseSalary: 45000, prev: 5200 },
  ];

  const result: Record<string, MonthData> = {};

  for (const cfg of monthConfigs) {
    const base = createDefaultMonth(cfg.id, cfg.name);

    // Update with month-specific historical variations
    base.salaryBreakdown.monthly.baseSalary = cfg.baseSalary;
    base.salaryBreakdown.monthly.previousBalance = cfg.prev;
    base.salaryBreakdown.cutoff15th.baseSalary = cfg.baseSalary / 2;
    base.salaryBreakdown.cutoff15th.previousBalance = Math.round(cfg.prev / 2);

    base.rows.electric_bill.monthly = { value: cfg.electric, rawInput: cfg.electric.toString() };
    base.rows.electric_bill.cutoff15th = { value: cfg.electric, rawInput: cfg.electric.toString() };

    base.rows.meal.monthly = { value: cfg.meal, rawInput: cfg.meal.toString() };
    base.rows.meal.cutoff15th = { value: Math.round(cfg.meal / 2), rawInput: Math.round(cfg.meal / 2).toString() };

    base.rows.lazada.monthly = { value: cfg.lazada, rawInput: cfg.lazada.toString() };
    base.rows.lazada.cutoff15th = { value: cfg.lazada, rawInput: cfg.lazada.toString() };

    base.rows.others.monthly = { value: cfg.others, rawInput: `=${cfg.others - 250}+250`, formula: `=${cfg.others - 250}+250` };
    base.rows.others.cutoff15th = { value: Math.round(cfg.others * 0.7), rawInput: Math.round(cfg.others * 0.7).toString() };

    // Set QR PH and ATM remarks
    base.rows.qr_ph.remarks = (base.rows.qr_ph.cutoff15th.value || 1500).toString();
    const calculatedMetro = 12000 + 480 + cfg.electric + 1050 + Math.round(cfg.meal / 2) + 299 + Math.round(cfg.others * 0.7);
    base.rows.metrobank.remarks = calculatedMetro.toString();

    result[cfg.id] = recalculateMonthData(base);
  }

  return result;
}
