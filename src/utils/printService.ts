import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MonthData } from '../types/budget';
import { INITIAL_ROW_ORDER } from './storage';
import { getChangeLogs } from './changeLogService';
import { computeOverallWorkbookData, groupSheetsByCalendarMonth } from './monthGrouping';
import { getEffectiveColumnOrderForMonth, isMonthlyKinsenasMerged } from './cellMerge';
import { formatCurrency, getActiveCurrencyConfig } from './currency';

export type PrintTargetSheet = 'active' | 'summary' | 'year' | 'changelog';

export interface PrintContextData {
  months: Record<string, MonthData>;
  yearMonths: Record<string, MonthData>;
  currentMonth?: MonthData;
  currentYear: number;
}

function formatAsciiPHP(val: number): string {
  return formatCurrency(val, { ascii: true });
}

function formatHtmlPHP(val: number): string {
  return formatCurrency(val);
}

function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getOrderedRowIds(month: MonthData): string[] {
  const baseOrder =
    month.rowOrder && month.rowOrder.length > 0 ? month.rowOrder : INITIAL_ROW_ORDER;
  const seen = new Set(baseOrder);
  const extra = Object.keys(month.rows || {}).filter((k) => !seen.has(k));
  return [...baseOrder, ...extra].filter((id) => Boolean(month.rows?.[id]));
}

function getSortedSheets(monthsMap: Record<string, MonthData>): MonthData[] {
  const grouped = groupSheetsByCalendarMonth(monthsMap);
  const sortedFromGroups = Object.values(grouped).flatMap((g) => g.sheets);
  if (sortedFromGroups.length > 0) return sortedFromGroups;
  return Object.values(monthsMap);
}

function buildMonthTableRowsForPdf(month: MonthData): string[][] {
  const rowIds = getOrderedRowIds(month);
  const colOrder = getEffectiveColumnOrderForMonth(month);
  const out: string[][] = [];

  for (const rowId of rowIds) {
    const row = month.rows[rowId];
    if (!row) continue;

    const isMerged = isMonthlyKinsenasMerged(rowId, row, colOrder);
    const monthlyText = isMerged ? '-' : formatAsciiPHP(row.monthly.value || 0);
    const cutoffText = formatAsciiPHP(row.cutoff15th.value || 0);
    const remarksParts: string[] = [];
    if (row.remarks) remarksParts.push(row.remarks);
    const notes: string[] = [];
    if (row.labelNote) notes.push(`Item: ${row.labelNote}`);
    if (row.monthly.note && !isMerged) notes.push(`Monthly: ${row.monthly.note}`);
    if (row.cutoff15th.note) notes.push(`15th: ${row.cutoff15th.note}`);
    if (row.remarksNote) notes.push(`Remark: ${row.remarksNote}`);
    if (notes.length > 0) remarksParts.push(`[${notes.join(' | ')}]`);

    out.push([
      row.label,
      monthlyText,
      cutoffText,
      remarksParts.join(' '),
    ]);
  }

  return out;
}

/**
 * Generates and directly downloads a crisp multi-page landscape PDF file
 * using jsPDF + autoTable. Works reliably in browsers, mobile, file://, APKs, and iframes.
 */
export function downloadBudgetPdf(
  targetSheet: PrintTargetSheet,
  ctx: PrintContextData
): { filename: string; detail: string } {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const generatedDate = new Date().toLocaleString('en-PH');
  const pageWidth = doc.internal.pageSize.getWidth();

  const drawHeader = (title: string, subtitle: string) => {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 56, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 36, 26);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(203, 213, 225);
    doc.text(subtitle, 36, 42);
    doc.setTextColor(15, 23, 42);
  };

  if (targetSheet === 'changelog') {
    const logs = getChangeLogs();
    drawHeader(
      'PesoBudget — Audit Change Log Ledger',
      `Generated: ${generatedDate} · Total Revisions: ${logs.length}`
    );

    autoTable(doc, {
      startY: 72,
      head: [['Timestamp', 'Sheet', 'Action', 'Item / Row', 'Column', 'Description']],
      body:
        logs.length > 0
          ? logs.map((log) => [
              new Date(log.timestamp).toLocaleString('en-PH'),
              log.sheetName || '-',
              log.actionLabel || log.action,
              log.rowLabel || '-',
              log.column || '-',
              log.description || `${log.oldValue || ''} -> ${log.newValue || ''}`,
            ])
          : [['-', '-', 'No change log entries yet', '-', '-', '-']],
      styles: { fontSize: 8.5, cellPadding: 5 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 36, right: 36 },
    });

    const filename = `PesoBudget-ChangeLog-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
    return {
      filename,
      detail: `Saved ${logs.length} audit log entry(ies) as PDF.`,
    };
  }

  if (targetSheet === 'summary') {
    const combined = computeOverallWorkbookData(ctx.months);
    const grouped = Object.values(groupSheetsByCalendarMonth(ctx.months));

    drawHeader(
      'PesoBudget — Overall Financial Summary Report',
      `Generated: ${generatedDate} · Combined Sheets: ${combined.sheetCount}`
    );

    autoTable(doc, {
      startY: 72,
      head: [['Executive Metric', `Amount (${getActiveCurrencyConfig().code})`, 'Notes']],
      body: [
        ['Total Gross Salary', formatAsciiPHP(combined.salaryVal), 'Combined salary across sheets'],
        ['Total Bills / Expenses', formatAsciiPHP(Math.abs(combined.totalExpenses)), 'House, utilities, loans & Lazada'],
        ['Metrobank ATM Cash', formatAsciiPHP(combined.plannedMetrobank), 'Physical cash for bills'],
        ['QR PH Digital Transfer', formatAsciiPHP(combined.plannedQrPh), 'Digital/online payments'],
        ['Pag-IBIG MP2 Savings', formatAsciiPHP(Math.abs(combined.governmentSavings)), 'Government sovereign savings'],
        ['GoTyme Stash', formatAsciiPHP(combined.gotymeVal), 'Personal liquid bank stash'],
        ['Net Ending Balance', formatAsciiPHP(combined.balanceVal), 'Total remaining surplus'],
        ['Personal Savings Total', formatAsciiPHP(combined.personalSavings), 'GoTyme + Ending Balance'],
        ['Grand Combined Savings', formatAsciiPHP(combined.totalCombinedSavings), `Overall savings rate: ${combined.savingsRate}%`],
      ],
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 36, right: 36 },
    });

    if (grouped.length > 0) {
      doc.addPage('a4', 'landscape');
      drawHeader(
        'PesoBudget — Monthly Progression & Category Summary',
        `Generated: ${generatedDate} · Calendar Months: ${grouped.length}`
      );

      autoTable(doc, {
        startY: 72,
        head: [['Calendar Month', 'Total Bills', 'Salary', 'Pag-IBIG MP2', 'GoTyme', 'Ending Balance']],
        body: grouped.map((m) => [
          m.displayName,
          formatAsciiPHP(m.totalExpenses),
          formatAsciiPHP(m.salaryVal),
          formatAsciiPHP(m.governmentSavings),
          formatAsciiPHP(m.gotymeVal),
          formatAsciiPHP(m.balanceVal),
        ]),
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 36, right: 36 },
      });
    }

    const filename = `PesoBudget-Overall-Summary-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
    return {
      filename,
      detail: `Saved overall executive summary (${grouped.length} calendar month(s)) as PDF.`,
    };
  }

  // 'active' or 'year'
  const sheetsToExport =
    targetSheet === 'active' && ctx.currentMonth
      ? [ctx.currentMonth]
      : getSortedSheets(ctx.yearMonths);

  if (sheetsToExport.length === 0) {
    drawHeader('PesoBudget — Empty Selection', `Generated: ${generatedDate}`);
    doc.setFontSize(11);
    doc.text('No sheets found to export.', 36, 90);
    const filename = `PesoBudget-Report-${ctx.currentYear}.pdf`;
    doc.save(filename);
    return { filename, detail: 'Exported empty PDF report.' };
  }

  sheetsToExport.forEach((sheet, idx) => {
    if (idx > 0) doc.addPage('a4', 'landscape');
    const titleHeader = sheet.sheetTitle || `SALARY MONITORING ${sheet.year || ctx.currentYear}`;
    drawHeader(
      `${sheet.name} — ${titleHeader}`,
      `Generated: ${generatedDate} · Metrobank: ${formatAsciiPHP(sheet.rows['metrobank']?.cutoff15th?.value || 0)} · Salary: ${formatAsciiPHP(sheet.rows['salary']?.cutoff15th?.value || 0)} · Balance: ${formatAsciiPHP(sheet.rows['balance']?.cutoff15th?.value || 0)}`
    );

    const paymentsLabel = sheet.columnHeaders?.payments || 'PAYMENTS';
    const monthlyLabel = sheet.columnHeaders?.monthly || 'MONTHLY';
    const kinsenasLabel = sheet.columnHeaders?.cutoff15th || '15TH KINSENAS';
    const remarksLabel = sheet.columnHeaders?.remarks || 'REMARKS';

    autoTable(doc, {
      startY: 72,
      head: [[paymentsLabel, monthlyLabel, kinsenasLabel, remarksLabel]],
      body: buildMonthTableRowsForPdf(sheet),
      styles: { fontSize: 8.5, cellPadding: 4.5 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 180, fontStyle: 'bold' },
        1: { cellWidth: 130, halign: 'right' },
        2: { cellWidth: 130, halign: 'right' },
        3: { cellWidth: 'auto' },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body') {
          const rowIds = getOrderedRowIds(sheet);
          const rId = rowIds[hookData.row.index];
          if (rId && ['total', 'salary', 'balance'].includes(rId)) {
            hookData.cell.styles.fontStyle = 'bold';
            hookData.cell.styles.fillColor =
              rId === 'balance' ? [236, 253, 245] : [241, 245, 249];
          }
        }
      },
      margin: { left: 36, right: 36 },
    });
  });

  const slug =
    targetSheet === 'active' && ctx.currentMonth
      ? ctx.currentMonth.name.replace(/[^a-zA-Z0-9]+/g, '-')
      : `${ctx.currentYear}-Sheets`;
  const filename = `PesoBudget-${slug}.pdf`;
  doc.save(filename);
  return {
    filename,
    detail: `Saved ${sheetsToExport.length} sheet(s) to ${filename}.`,
  };
}

function buildPrintableHtmlDocument(
  targetSheet: PrintTargetSheet,
  ctx: PrintContextData
): { title: string; html: string } {
  const generated = new Date().toLocaleString('en-PH');
  let bodySections = '';
  let docTitle = 'PesoBudget Report';

  if (targetSheet === 'changelog') {
    docTitle = 'PesoBudget - Change Log Ledger';
    const logs = getChangeLogs();
    const rowsHtml =
      logs.length > 0
        ? logs
            .map(
              (log) => `
          <tr>
            <td>${escapeHtml(new Date(log.timestamp).toLocaleString('en-PH'))}</td>
            <td>${escapeHtml(log.sheetName || '-')}</td>
            <td>${escapeHtml(log.actionLabel || log.action)}</td>
            <td>${escapeHtml(log.rowLabel || '-')}</td>
            <td>${escapeHtml(log.column || '-')}</td>
            <td>${escapeHtml(log.description || '')}</td>
          </tr>`
            )
            .join('')
        : `<tr><td colspan="6" style="text-align:center;padding:16px;color:#64748b;">No change log entries recorded yet.</td></tr>`;

    bodySections = `
      <div class="sheet-block">
        <div class="header-bar">
          <div>
            <h1>PesoBudget — Change Log Ledger</h1>
            <p class="sub">Generated: ${escapeHtml(generated)} · ${logs.length} revisions</p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Sheet</th>
              <th>Action</th>
              <th>Item</th>
              <th>Column</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;
  } else if (targetSheet === 'summary') {
    docTitle = 'PesoBudget - Overall Financial Summary';
    const combined = computeOverallWorkbookData(ctx.months);
    const grouped = Object.values(groupSheetsByCalendarMonth(ctx.months));

    bodySections = `
      <div class="sheet-block">
        <div class="header-bar">
          <div>
            <h1>PesoBudget — Overall Financial Summary</h1>
            <p class="sub">Generated: ${escapeHtml(generated)} · Combined Sheets: ${combined.sheetCount}</p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Executive Metric</th>
              <th class="num">Amount (${escapeHtml(getActiveCurrencyConfig().code)})</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><strong>Total Gross Salary</strong></td><td class="num">${escapeHtml(formatHtmlPHP(combined.salaryVal))}</td><td>Combined salary across sheets</td></tr>
            <tr><td><strong>Total Bills / Expenses</strong></td><td class="num">${escapeHtml(formatHtmlPHP(Math.abs(combined.totalExpenses)))}</td><td>House, utilities, loans &amp; Lazada</td></tr>
            <tr><td><strong>Metrobank ATM Cash</strong></td><td class="num">${escapeHtml(formatHtmlPHP(combined.plannedMetrobank))}</td><td>Physical cash for bills</td></tr>
            <tr><td><strong>QR PH Digital Transfer</strong></td><td class="num">${escapeHtml(formatHtmlPHP(combined.plannedQrPh))}</td><td>Digital payments</td></tr>
            <tr><td><strong>Pag-IBIG MP2 Savings</strong></td><td class="num">${escapeHtml(formatHtmlPHP(Math.abs(combined.governmentSavings)))}</td><td>Government sovereign fund</td></tr>
            <tr><td><strong>GoTyme Stash</strong></td><td class="num">${escapeHtml(formatHtmlPHP(combined.gotymeVal))}</td><td>Liquid personal reserve</td></tr>
            <tr class="highlight"><td><strong>Net Ending Balance</strong></td><td class="num">${escapeHtml(formatHtmlPHP(combined.balanceVal))}</td><td>Remaining balance</td></tr>
            <tr><td><strong>Personal Savings Total</strong></td><td class="num">${escapeHtml(formatHtmlPHP(combined.personalSavings))}</td><td>GoTyme + Ending Balance</td></tr>
            <tr class="highlight"><td><strong>Grand Combined Savings</strong></td><td class="num">${escapeHtml(formatHtmlPHP(combined.totalCombinedSavings))}</td><td>Overall savings rate: ${combined.savingsRate}%</td></tr>
          </tbody>
        </table>
      </div>
      ${
        grouped.length > 0
          ? `<div class="sheet-block page-break">
              <div class="header-bar">
                <div>
                  <h1>Monthly Historical Progression</h1>
                  <p class="sub">Generated: ${escapeHtml(generated)} · ${grouped.length} Calendar Month(s)</p>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Calendar Month</th>
                    <th class="num">Total Bills</th>
                    <th class="num">Salary</th>
                    <th class="num">Pag-IBIG MP2</th>
                    <th class="num">GoTyme</th>
                    <th class="num">Ending Balance</th>
                  </tr>
                </thead>
                <tbody>
                  ${grouped
                    .map(
                      (m) => `
                    <tr>
                      <td><strong>${escapeHtml(m.displayName)}</strong></td>
                      <td class="num">${escapeHtml(formatHtmlPHP(m.totalExpenses))}</td>
                      <td class="num">${escapeHtml(formatHtmlPHP(m.salaryVal))}</td>
                      <td class="num">${escapeHtml(formatHtmlPHP(m.governmentSavings))}</td>
                      <td class="num">${escapeHtml(formatHtmlPHP(m.gotymeVal))}</td>
                      <td class="num"><strong>${escapeHtml(formatHtmlPHP(m.balanceVal))}</strong></td>
                    </tr>`
                    )
                    .join('')}
                </tbody>
              </table>
            </div>`
          : ''
      }
    `;
  } else {
    const sheets =
      targetSheet === 'active' && ctx.currentMonth
        ? [ctx.currentMonth]
        : getSortedSheets(ctx.yearMonths);

    docTitle =
      targetSheet === 'active' && ctx.currentMonth
        ? `PesoBudget - ${ctx.currentMonth.name}`
        : `PesoBudget - ${ctx.currentYear} Sheets`;

    bodySections = sheets
      .map((sheet, idx) => {
        const rowIds = getOrderedRowIds(sheet);
        const colOrder = getEffectiveColumnOrderForMonth(sheet);
        const rowsHtml = rowIds
          .map((rowId) => {
            const row = sheet.rows[rowId];
            if (!row) return '';
            const isMerged = isMonthlyKinsenasMerged(rowId, row, colOrder);
            const isKeyRow = ['total', 'salary', 'balance'].includes(rowId);
            const cls = isKeyRow ? (rowId === 'balance' ? 'highlight' : 'subtotal') : '';
            const notes: string[] = [];
            if (row.labelNote) notes.push(`Item: ${row.labelNote}`);
            if (row.monthly.note && !isMerged) notes.push(`Monthly: ${row.monthly.note}`);
            if (row.cutoff15th.note) notes.push(`15th: ${row.cutoff15th.note}`);
            if (row.remarksNote) notes.push(`Remark: ${row.remarksNote}`);
            const remarkDisplay = [row.remarks, notes.length > 0 ? `[${notes.join(' | ')}]` : '']
              .filter(Boolean)
              .join(' ');

            return `
              <tr class="${cls}">
                <td><strong>${escapeHtml(row.label)}</strong></td>
                ${
                  isMerged
                    ? `<td class="num" colspan="2">${escapeHtml(formatHtmlPHP(row.cutoff15th.value || row.monthly.value || 0))}</td>`
                    : `<td class="num">${escapeHtml(formatHtmlPHP(row.monthly.value || 0))}</td>
                <td class="num">${escapeHtml(formatHtmlPHP(row.cutoff15th.value || 0))}</td>`
                }
                <td>${escapeHtml(remarkDisplay)}</td>
              </tr>`;
          })
          .join('');

        return `
          <div class="sheet-block ${idx > 0 ? 'page-break' : ''}">
            <div class="header-bar">
              <div>
                <h1>${escapeHtml(sheet.name)} — ${escapeHtml(sheet.sheetTitle || `SALARY MONITORING ${sheet.year || ctx.currentYear}`)}</h1>
                <p class="sub">
                  Generated: ${escapeHtml(generated)} ·
                  Metrobank: ${escapeHtml(formatHtmlPHP(sheet.rows['metrobank']?.cutoff15th?.value || 0))} ·
                  Salary: ${escapeHtml(formatHtmlPHP(sheet.rows['salary']?.cutoff15th?.value || 0))} ·
                  Balance: ${escapeHtml(formatHtmlPHP(sheet.rows['balance']?.cutoff15th?.value || 0))}
                </p>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>${escapeHtml(sheet.columnHeaders?.payments || 'PAYMENTS')}</th>
                  <th class="num">${escapeHtml(sheet.columnHeaders?.monthly || 'MONTHLY')}</th>
                  <th class="num">${escapeHtml(sheet.columnHeaders?.cutoff15th || '15TH KINSENAS')}</th>
                  <th>${escapeHtml(sheet.columnHeaders?.remarks || 'REMARKS')}</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>`;
      })
      .join('');
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(docTitle)}</title>
  <style>
    @page { size: landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet-block { margin-bottom: 18px; }
    .page-break { page-break-before: always; break-before: page; }
    .header-bar {
      background: #0f172a;
      color: #ffffff;
      padding: 10px 14px;
      border-radius: 6px;
      margin-bottom: 10px;
    }
    .header-bar h1 { margin: 0; font-size: 15px; font-weight: 800; }
    .header-bar .sub { margin: 3px 0 0; font-size: 11px; color: #cbd5e1; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
    thead th { background: #1e293b; color: #ffffff; font-weight: 700; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody tr.subtotal { background: #e2e8f0 !important; font-weight: 700; }
    tbody tr.highlight { background: #ecfdf5 !important; font-weight: 700; color: #065f46; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  </style>
</head>
<body>
  ${bodySections || '<p>No sheet data available to print.</p>'}
</body>
</html>`;

  return { title: docTitle, html };
}

/**
 * Synchronously writes a clean landscape print document into a hidden iframe and calls print()
 * immediately within the active user gesture so browser print dialogs do not get blocked.
 */
export function printBudgetDirectly(
  targetSheet: PrintTargetSheet,
  ctx: PrintContextData
): { title: string; isEmbeddedFrame: boolean } {
  const { title, html } = buildPrintableHtmlDocument(targetSheet, ctx);
  const isEmbeddedFrame =
    typeof window !== 'undefined' && window.self !== window.top;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  const cleanup = () => {
    try {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    } catch {
      // ignore cleanup error
    }
  };

  const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
  const frameWin = iframe.contentWindow;

  if (frameDoc && frameWin) {
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    frameWin.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 90_000);

    try {
      frameWin.focus();
      frameWin.print();
    } catch {
      cleanup();
      window.print();
    }
  } else {
    cleanup();
    window.print();
  }

  return { title, isEmbeddedFrame };
}
