import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface FunctionDocRow {
  feature: string;
  location: string;
  explanation: string;
}

interface ManualReleaseEntry {
  buildId?: string;
  buildTime?: string;
  version: string;
  date: string;
  timeLabel?: string;
  title: string;
  changes: string[];
}

function toPdfSafeText(input: string): string {
  return String(input || '')
    .replace(/₱/g, 'PHP ')
    .replace(/→/g, '->')
    .replace(/↓/g, '->')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/·/g, '|')
    .replace(/✓/g, 'Settled')
    .replace(/[^\x20-\x7E\n\r\t]/g, '');
}

function getReleaseHistoryForManual(): ManualReleaseEntry[] {
  try {
    if (
      typeof window !== 'undefined' &&
      Array.isArray(window.__PESOBUDGET_LIVE_RELEASES__) &&
      window.__PESOBUDGET_LIVE_RELEASES__.length > 0
    ) {
      return window.__PESOBUDGET_LIVE_RELEASES__;
    }
  } catch {
    // ignore window lookup errors
  }
  try {
    if (
      typeof __PESOBUDGET_RELEASE_HISTORY__ !== 'undefined' &&
      Array.isArray(__PESOBUDGET_RELEASE_HISTORY__) &&
      __PESOBUDGET_RELEASE_HISTORY__.length > 0
    ) {
      return __PESOBUDGET_RELEASE_HISTORY__;
    }
  } catch {
    // ignore build global lookup failure
  }
  return [];
}

export function getCurrentManualVersion(): string {
  const history = getReleaseHistoryForManual();
  if (history.length > 0 && history[0]?.version) {
    return `v${history[0].version}`;
  }
  return 'v2.5+';
}

/**
 * Generates and downloads a 100% vector-text, natively searchable PDF User Manual
 * containing an introduction, workspace description, one-sentence function guide,
 * step-by-step new user guidelines, and auto-synced app release changes.
 */
export function downloadUserManualPdf(): {
  filename: string;
  pageCount: number;
  version: string;
} {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });

  const releaseHistory = getReleaseHistoryForManual();
  const latestRelease = releaseHistory[0];
  const version = getCurrentManualVersion();
  const generatedDate =
    latestRelease?.date ||
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  const publishedStamp = latestRelease?.timeLabel
    ? `${generatedDate} (${toPdfSafeText(latestRelease.timeLabel)})`
    : `${generatedDate} (PHT)`;

  doc.setProperties({
    title: `PesoBudget User Manual (${version})`,
    subject: 'Searchable User Manual, Feature Guide, and New User Guidelines for PesoBudget',
    author: 'PesoBudget',
    keywords:
      'PesoBudget, User Manual, Budget, Payroll, Monthly, Kinsenas, Merge, Unmerge, Formulas, QR PH, Metrobank, MP2, GoTyme, Balance, Cloud Backup, Portable, PDF, Offline',
    creator: 'PesoBudget Application',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const contentWidth = pageWidth - marginX * 2;
  let y = 0;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 54) {
      doc.addPage('a4', 'portrait');
      y = 48;
    }
  };

  const drawSectionHeading = (numLabel: string, title: string) => {
    ensureSpace(44);
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(marginX, y, contentWidth, 24, 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(`${numLabel}. ${title}`, marginX + 10, y + 16);
    y += 34;
  };

  const drawParagraph = (text: string, fontSize = 9.5, bottomGap = 10) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(51, 65, 85);
    const wrapped = doc.splitTextToSize(text, contentWidth);
    ensureSpace(wrapped.length * (fontSize + 4) + bottomGap);
    doc.text(wrapped, marginX, y);
    y += wrapped.length * (fontSize + 4) + bottomGap;
  };

  const drawCalloutBadge = (cx: number, cy: number, num: string, fill: [number, number, number] = [5, 150, 105]) => {
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.circle(cx, cy, 6.5, 'F');
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(1);
    doc.circle(cx, cy, 6.5, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(num, cx, cy + 2.5, { align: 'center' });
  };

  const drawVisualFigureFrame = (figureTitle: string, bodyHeight: number, drawBody: (topY: number) => void) => {
    const headerH = 20;
    const totalH = headerH + bodyHeight + 10;
    ensureSpace(totalH + 8);

    // Outer Figure Card
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.75);
    doc.roundedRect(marginX, y, contentWidth, totalH, 5, 5, 'FD');

    // Figure Caption Header
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(marginX, y, contentWidth, headerH, 5, 5, 'F');
    doc.rect(marginX, y + 10, contentWidth, headerH - 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(figureTitle, marginX + 10, y + 13);

    drawBody(y + headerH + 6);
    y += totalH + 12;
  };

  const drawWorkspaceScreenDiagram = () => {
    drawVisualFigureFrame(
      'Figure 1: Visual Screen Map - Where Every Tool Lives in PesoBudget',
      212,
      (topY) => {
        const winX = marginX + 10;
        const winW = contentWidth - 20;

        // Browser/App Outer Window Frame
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(51, 65, 85);
        doc.setLineWidth(0.9);
        doc.roundedRect(winX, topY, winW, 174, 4, 4, 'FD');

        // 1. Top Bar
        doc.setFillColor(15, 23, 42);
        doc.rect(winX, topY, winW, 22, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text('PesoBudget', winX + 8, topY + 13.5);

        const navTabs = [
          { label: 'Sheet', x: winX + 66, w: 34, active: true },
          { label: 'Charts', x: winX + 104, w: 38, active: false },
          { label: 'Summary', x: winX + 146, w: 46, active: false },
          { label: 'Change Log', x: winX + 196, w: 54, active: false },
        ];
        for (const t of navTabs) {
          doc.setFillColor(t.active ? 5 : 30, t.active ? 150 : 41, t.active ? 105 : 59);
          doc.roundedRect(t.x, topY + 4, t.w, 14, 2.5, 2.5, 'F');
          doc.setFontSize(6.5);
          doc.setTextColor(255, 255, 255);
          doc.text(t.label, t.x + t.w / 2, topY + 13, { align: 'center' });
        }

        const rightControls = [
          { label: '2026', x: winX + 282, w: 28, bg: [30, 41, 59] as [number, number, number] },
          { label: 'PHP', x: winX + 313, w: 24, bg: [30, 41, 59] as [number, number, number] },
          { label: '+ Sheet', x: winX + 340, w: 42, bg: [5, 150, 105] as [number, number, number] },
          { label: 'Theme', x: winX + 385, w: 30, bg: [51, 65, 85] as [number, number, number] },
          { label: 'Synced', x: winX + 418, w: 34, bg: [6, 95, 70] as [number, number, number] },
          { label: 'Settings', x: winX + 455, w: 35, bg: [51, 65, 85] as [number, number, number] },
        ];
        for (const rc of rightControls) {
          doc.setFillColor(rc.bg[0], rc.bg[1], rc.bg[2]);
          doc.roundedRect(rc.x, topY + 4, rc.w, 14, 2.5, 2.5, 'F');
          doc.setFontSize(5.8);
          doc.setTextColor(255, 255, 255);
          doc.text(rc.label, rc.x + rc.w / 2, topY + 12.8, { align: 'center' });
        }
        drawCalloutBadge(winX + 266, topY + 11, '1', [220, 38, 38]);

        // 2. Formula Bar
        const fbY = topY + 22;
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.rect(winX, fbY, winW, 18, 'FD');
        doc.setFillColor(226, 232, 240);
        doc.roundedRect(winX + 6, fbY + 3, 98, 12, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(30, 41, 59);
        doc.text('Water Bill | Monthly', winX + 10, fbY + 11);

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(148, 163, 184);
        doc.roundedRect(winX + 110, fbY + 3, 305, 12, 2, 2, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.text('fx   =850+120', winX + 116, fbY + 11);

        doc.setFillColor(254, 243, 199);
        doc.setDrawColor(245, 158, 11);
        doc.roundedRect(winX + 421, fbY + 3, 46, 12, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(146, 64, 14);
        doc.text('Note', winX + 444, fbY + 11, { align: 'center' });
        drawCalloutBadge(winX + 480, fbY + 9, '2', [2, 132, 199]);

        // 3. Budget Table Canvas
        const tblX = winX + 8;
        const tblY = fbY + 23;
        const tblW = winW - 16;
        const colW = [148, 110, 110, tblW - 368];

        // Sheet Title Row
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.7);
        doc.rect(tblX, tblY, tblW, 13, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(15, 23, 42);
        doc.text('OCTOBER 2026', tblX + tblW / 2, tblY + 9, { align: 'center' });

        // Header Row
        const hdrY = tblY + 13;
        doc.setFillColor(241, 245, 249);
        doc.rect(tblX, hdrY, tblW, 12, 'FD');
        const hdrNames = ['PAYMENTS [:]', 'MONTHLY', 'KINSENAS', 'REMARKS'];
        let curX = tblX;
        for (let i = 0; i < 4; i++) {
          doc.line(curX, hdrY, curX, hdrY + 12);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(15, 23, 42);
          doc.text(hdrNames[i], curX + colW[i] / 2, hdrY + 8.5, { align: 'center' });
          curX += colW[i];
        }

        // Sample Color-Coded Rows
        const sampleRows: Array<{
          label: string;
          m: string;
          k: string;
          r: string;
          merged: boolean;
          bg: [number, number, number];
          fg: [number, number, number];
        }> = [
          {
            label: 'House / Rent',
            m: 'PHP 8,500.00',
            k: 'PHP 0.00',
            r: 'Settled',
            merged: false,
            bg: [255, 255, 255],
            fg: [15, 23, 42],
          },
          {
            label: 'QR PH',
            m: 'PHP 1,250.00 (Merged)',
            k: '',
            r: 'Settled',
            merged: true,
            bg: [238, 242, 255],
            fg: [49, 46, 129],
          },
          {
            label: 'Metrobank (Cash Sum)',
            m: 'PHP 12,400.00',
            k: '',
            r: 'PHP 12,400.00',
            merged: true,
            bg: [241, 245, 249],
            fg: [15, 23, 42],
          },
          {
            label: 'Total (Metrobank + QR)',
            m: 'PHP 13,650.00',
            k: '',
            r: 'PHP 12,400.00',
            merged: true,
            bg: [224, 242, 254],
            fg: [12, 74, 110],
          },
          {
            label: 'SALARY',
            m: 'PHP 38,000.00',
            k: '',
            r: 'PHP 38,000.00',
            merged: true,
            bg: [237, 233, 254],
            fg: [76, 29, 149],
          },
          {
            label: 'Pag-IBIG MP2 / GoTyme',
            m: 'PHP 10,000.00',
            k: '',
            r: 'Settled',
            merged: true,
            bg: [254, 243, 199],
            fg: [120, 53, 15],
          },
          {
            label: 'BALANCE (Net Surplus)',
            m: 'PHP 14,350.00',
            k: '',
            r: 'PHP 15,600.00',
            merged: true,
            bg: [209, 250, 229],
            fg: [6, 78, 59],
          },
        ];

        let rowY = hdrY + 12;
        const rowH = 12;
        for (const sr of sampleRows) {
          doc.setFillColor(sr.bg[0], sr.bg[1], sr.bg[2]);
          doc.setDrawColor(148, 163, 184);
          doc.rect(tblX, rowY, tblW, rowH, 'FD');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.2);
          doc.setTextColor(sr.fg[0], sr.fg[1], sr.fg[2]);
          doc.text(sr.label, tblX + 5, rowY + 8.3);

          const col1End = tblX + colW[0];
          const col2End = col1End + colW[1];
          const col3End = col2End + colW[2];
          doc.line(col1End, rowY, col1End, rowY + rowH);
          doc.line(col3End, rowY, col3End, rowY + rowH);

          doc.setFont('helvetica', 'normal');
          if (sr.merged) {
            doc.text(sr.m, col1End + (colW[1] + colW[2]) / 2, rowY + 8.3, { align: 'center' });
          } else {
            doc.line(col2End, rowY, col2End, rowY + rowH);
            doc.text(sr.m, col2End - 5, rowY + 8.3, { align: 'right' });
            doc.text(sr.k, col3End - 5, rowY + 8.3, { align: 'right' });
          }
          doc.text(sr.r, col3End + colW[3] / 2, rowY + 8.3, { align: 'center' });
          rowY += rowH;
        }
        drawCalloutBadge(tblX + tblW - 4, hdrY + 34, '3', [15, 23, 42]);

        // 4. Floating Micro-Action Bar
        const barW = 270;
        const barX = winX + (winW - barW) / 2;
        const barY = topY + 137;
        doc.setFillColor(15, 23, 42);
        doc.roundedRect(barX, barY, barW, 15, 7.5, 7.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.2);
        doc.setTextColor(255, 255, 255);
        doc.text('fx Formula  |  Edit  |  Breakdown  |  Merge  |  Clear  |  Note', barX + barW / 2, barY + 9.5, {
          align: 'center',
        });
        drawCalloutBadge(barX + barW + 10, barY + 7.5, '4', [124, 58, 237]);

        // 5. Bottom Sheet Tabs Dock
        const tabY = topY + 156;
        doc.setFillColor(241, 245, 249);
        doc.rect(winX, tabY, winW, 18, 'F');
        const sheetTabs = [
          { label: 'OCT 2026', x: winX + 10, w: 60, active: true },
          { label: 'NOV 2026', x: winX + 74, w: 60, active: false },
          { label: 'DEC 2026', x: winX + 138, w: 60, active: false },
          { label: '+ Add Sheet', x: winX + 204, w: 58, active: false },
        ];
        for (const st of sheetTabs) {
          doc.setFillColor(st.active ? 255 : 226, st.active ? 255 : 232, st.active ? 255 : 240);
          doc.setDrawColor(148, 163, 184);
          doc.roundedRect(st.x, tabY + 3, st.w, 12, 2, 2, 'FD');
          doc.setFont('helvetica', st.active ? 'bold' : 'normal');
          doc.setFontSize(6.2);
          doc.setTextColor(15, 23, 42);
          doc.text(st.label, st.x + st.w / 2, tabY + 11, { align: 'center' });
        }
        drawCalloutBadge(winX + 274, tabY + 9, '5', [217, 119, 6]);

        // Callout Legend Row
        const legY = topY + 188;
        const legendItems: Array<{ num: string; text: string; color: [number, number, number]; x: number; yOff: number }> = [
          { num: '1', text: 'Top Bar (Tabs, Year, Currency, Add, Theme, Sync, Settings)', color: [220, 38, 38], x: winX + 8, yOff: 0 },
          { num: '2', text: 'Formula Bar (fx & Notes)', color: [2, 132, 199], x: winX + 216, yOff: 0 },
          { num: '3', text: 'Color-Coded Table Rows', color: [15, 23, 42], x: winX + 344, yOff: 0 },
          { num: '4', text: 'Floating Cell Action Pill (appears on cell tap)', color: [124, 58, 237], x: winX + 8, yOff: 16 },
          { num: '5', text: 'Bottom Month Sheet Tabs', color: [217, 119, 6], x: winX + 230, yOff: 16 },
        ];
        for (const item of legendItems) {
          drawCalloutBadge(item.x, legY + item.yOff, item.num, item.color);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(30, 41, 59);
          doc.text(item.text, item.x + 11, legY + item.yOff + 2.5);
        }
      }
    );
  };

  const drawEditingAndRemarksVisual = () => {
    drawVisualFigureFrame(
      'Figure 2: Visual Guide - Formula Cell Editing, Sticky Notes & Remarks Selector',
      118,
      (topY) => {
        const gap = 12;
        const panelW = (contentWidth - 20 - gap) / 2;
        const leftX = marginX + 10;
        const rightX = leftX + panelW + gap;

        // Left Panel: Formula Cell + Note Triangle + Floating Bar
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(leftX, topY, panelW, 110, 4, 4, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text('A. Formula Cell & Sticky Note Indicator', leftX + 8, topY + 13);

        // Selected Cell Box
        const cX = leftX + 18;
        const cY = topY + 24;
        const cW = panelW - 36;
        doc.setFillColor(239, 246, 255);
        doc.setDrawColor(37, 99, 235);
        doc.setLineWidth(1.3);
        doc.rect(cX, cY, cW, 24, 'FD');
        // Amber Sticky Note Corner Triangle
        doc.setFillColor(245, 158, 11);
        doc.triangle(cX + cW, cY, cX + cW - 10, cY, cX + cW, cY + 10, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text('=850+420   ->   PHP 1,270.00', cX + 10, cY + 15);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(180, 83, 9);
        doc.text('Amber top-right corner = Saved Cell Note (tap to view)', leftX + 12, topY + 60);

        // Floating Action Pill Preview
        doc.setFillColor(15, 23, 42);
        doc.roundedRect(leftX + 10, topY + 70, panelW - 20, 20, 10, 10, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(255, 255, 255);
        doc.text('fx Formula  |  Edit  |  Merge  |  Clear  |  Note', leftX + panelW / 2, topY + 82.5, {
          align: 'center',
        });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text('Tap any cell once to reveal this floating quick-action bar', leftX + panelW / 2, topY + 102, {
          align: 'center',
        });

        // Right Panel: Remarks 3-Option Selector
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.75);
        doc.roundedRect(rightX, topY, panelW, 110, 4, 4, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(15, 23, 42);
        doc.text('B. Remarks Quick Picker & Withdrawn Cash', rightX + 8, topY + 13);

        // 3 Option Cards
        const optW = (panelW - 28) / 3;
        const optY = topY + 24;
        const opts: Array<{ title: string; sub: string; bg: [number, number, number]; border: [number, number, number]; fg: [number, number, number] }> = [
          { title: 'Settled', sub: 'Paid', bg: [5, 150, 105], border: [4, 120, 87], fg: [255, 255, 255] },
          { title: 'Deferred', sub: 'Next Pay', bg: [254, 243, 199], border: [217, 119, 6], fg: [146, 64, 14] },
          { title: 'Clear', sub: 'Unset (-)', bg: [241, 245, 249], border: [148, 163, 184], fg: [51, 65, 85] },
        ];
        opts.forEach((opt, i) => {
          const ox = rightX + 8 + i * (optW + 6);
          doc.setFillColor(opt.bg[0], opt.bg[1], opt.bg[2]);
          doc.setDrawColor(opt.border[0], opt.border[1], opt.border[2]);
          doc.roundedRect(ox, optY, optW, 34, 4, 4, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(opt.fg[0], opt.fg[1], opt.fg[2]);
          doc.text(opt.title, ox + optW / 2, optY + 15, { align: 'center' });
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.text(opt.sub, ox + optW / 2, optY + 26, { align: 'center' });
        });

        // Metrobank Actual Cash Withdrawn Box
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(148, 163, 184);
        doc.roundedRect(rightX + 8, topY + 68, panelW - 16, 24, 3, 3, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(15, 23, 42);
        doc.text('Metrobank Remarks (Actual Cash Withdrawn):', rightX + 14, topY + 78);
        doc.setFont('helvetica', 'normal');
        doc.text('PHP 12,400.00   (Tracks real cash vs planned budget)', rightX + 14, topY + 87);

        doc.setFontSize(7);
        doc.setTextColor(71, 85, 105);
        doc.text('Tap any bill Remarks cell to set status in one click', rightX + panelW / 2, topY + 102, {
          align: 'center',
        });
      }
    );
  };

  const drawMergeAndWhereVisual = () => {
    drawVisualFigureFrame(
      'Figure 3: How to Merge, Unmerge & Choose Where to Merge Columns',
      132,
      (topY) => {
        const innerX = marginX + 10;
        const innerW = contentWidth - 20;

        // Top Comparison: Unmerged vs Merged
        const halfW = (innerW - 36) / 2;

        // Left: Unmerged
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text('UNMERGED (Independent Cutoffs)', innerX, topY + 8);
        doc.setFillColor(255, 228, 230);
        doc.setDrawColor(190, 18, 60);
        doc.rect(innerX, topY + 12, halfW, 20, 'FD');
        const uCol1 = innerX + halfW * 0.34;
        const uCol2 = innerX + halfW * 0.67;
        doc.line(uCol1, topY + 12, uCol1, topY + 32);
        doc.line(uCol2, topY + 12, uCol2, topY + 32);
        doc.setFontSize(6.8);
        doc.setTextColor(136, 19, 55);
        doc.text('Salary', innerX + 6, topY + 24.5);
        doc.text('M: 15,000', uCol1 + 5, topY + 24.5);
        doc.text('15th: 15,000', uCol2 + 5, topY + 24.5);

        // Middle Arrows
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(2, 132, 199);
        doc.text('Merge ->', innerX + halfW + 4, topY + 20);
        doc.setTextColor(217, 119, 6);
        doc.text('<- Split', innerX + halfW + 4, topY + 30);

        // Right: Merged
        const rightBoxX = innerX + halfW + 36;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(2, 132, 199);
        doc.text('MERGED (Combined Single Span)', rightBoxX, topY + 8);
        doc.setFillColor(224, 242, 254);
        doc.setDrawColor(2, 132, 199);
        doc.rect(rightBoxX, topY + 12, halfW, 20, 'FD');
        const mCol1 = rightBoxX + halfW * 0.34;
        doc.line(mCol1, topY + 12, mCol1, topY + 32);
        doc.setFontSize(6.8);
        doc.setTextColor(12, 74, 110);
        doc.text('Salary', rightBoxX + 6, topY + 24.5);
        doc.text('MONTHLY + KINSENAS: PHP 30,000.00', mCol1 + (halfW * 0.66) / 2, topY + 24.5, {
          align: 'center',
        });

        // Bottom: Where to Merge Column Picker UI
        const pickerY = topY + 44;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(148, 163, 184);
        doc.roundedRect(innerX, pickerY, innerW, 80, 4, 4, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.8);
        doc.setTextColor(15, 23, 42);
        doc.text('Where to Merge Picker  (Title Menu [:] -> Merge / Unmerge Cells...  or  Cell Bar -> Merge / Where)', innerX + 8, pickerY + 13);

        const tileGap = 8;
        const tileW = (innerW - 16 - tileGap * 3) / 4;
        const tiles: Array<{ name: string; status: string; bg: [number, number, number]; border: [number, number, number]; fg: [number, number, number] }> = [
          { name: 'PAYMENTS', status: 'Label (Locked)', bg: [241, 245, 249], border: [203, 213, 225], fg: [148, 163, 184] },
          { name: 'MONTHLY', status: 'Start Selected', bg: [2, 132, 199], border: [3, 105, 161], fg: [255, 255, 255] },
          { name: 'KINSENAS', status: 'End Selected', bg: [2, 132, 199], border: [3, 105, 161], fg: [255, 255, 255] },
          { name: 'REMARKS', status: 'Tap to pick', bg: [255, 255, 255], border: [203, 213, 225], fg: [51, 65, 85] },
        ];
        tiles.forEach((tile, i) => {
          const tx = innerX + 8 + i * (tileW + tileGap);
          doc.setFillColor(tile.bg[0], tile.bg[1], tile.bg[2]);
          doc.setDrawColor(tile.border[0], tile.border[1], tile.border[2]);
          doc.roundedRect(tx, pickerY + 21, tileW, 28, 3, 3, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.2);
          doc.setTextColor(tile.fg[0], tile.fg[1], tile.fg[2]);
          doc.text(tile.name, tx + 6, pickerY + 32);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.2);
          doc.text(tile.status, tx + 6, pickerY + 42);
        });

        // Preview Footer inside Picker
        doc.setFillColor(240, 249, 255);
        doc.setDrawColor(186, 230, 253);
        doc.roundedRect(innerX + 8, pickerY + 55, innerW - 120, 18, 3, 3, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(3, 105, 161);
        doc.text('Span 2: MONTHLY + KINSENAS   (or expand to Remarks / custom columns)', innerX + 14, pickerY + 66.5);

        doc.setFillColor(2, 132, 199);
        doc.roundedRect(innerX + innerW - 104, pickerY + 55, 96, 18, 3, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.text('Apply Merge Cells', innerX + innerW - 56, pickerY + 66.5, { align: 'center' });
      }
    );
  };

  const drawAutoCalculationFlowVisual = () => {
    drawVisualFigureFrame(
      'Figure 4: Color-Coded Automatic Budget & Balance Flow',
      92,
      (topY) => {
        const innerX = marginX + 10;
        const boxH = 34;

        // Top Row Flow: Cash Bills -> Metrobank + QR PH -> Total
        const b1W = 132;
        const b2W = 104;
        const b3W = 92;
        const b4W = 112;

        // Box 1: Cash Bills
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(148, 163, 184);
        doc.roundedRect(innerX, topY, b1W, boxH, 3, 3, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(15, 23, 42);
        doc.text('Cash Obligations', innerX + 6, topY + 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.text('House, Loan, Water, Meal...', innerX + 6, topY + 23);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('->', innerX + b1W + 4, topY + 19);

        // Box 2: Metrobank
        const x2 = innerX + b1W + 16;
        doc.setFillColor(241, 245, 249);
        doc.setDrawColor(100, 116, 139);
        doc.roundedRect(x2, topY, b2W, boxH, 3, 3, 'FD');
        doc.setFontSize(7.2);
        doc.setTextColor(15, 23, 42);
        doc.text('Metrobank', x2 + 6, topY + 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.text('Auto Cash Sum', x2 + 6, topY + 23);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('+', x2 + b2W + 4, topY + 19);

        // Box 3: QR PH
        const x3 = x2 + b2W + 14;
        doc.setFillColor(238, 242, 255);
        doc.setDrawColor(99, 102, 241);
        doc.roundedRect(x3, topY, b3W, boxH, 3, 3, 'FD');
        doc.setFontSize(7.2);
        doc.setTextColor(49, 46, 129);
        doc.text('QR PH', x3 + 6, topY + 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.text('Digital / Online Pay', x3 + 6, topY + 23);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.text('=', x3 + b3W + 4, topY + 19);

        // Box 4: Total
        const x4 = x3 + b3W + 14;
        doc.setFillColor(224, 242, 254);
        doc.setDrawColor(2, 132, 199);
        doc.roundedRect(x4, topY, b4W, boxH, 3, 3, 'FD');
        doc.setFontSize(7.5);
        doc.setTextColor(12, 74, 110);
        doc.text('Total Expenses', x4 + 6, topY + 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.text('Metrobank + QR PH', x4 + 6, topY + 23);

        // Bottom Row Flow: (Salary - Total) - (MP2 + GoTyme) = Balance
        const botY = topY + 46;
        const sW = 114;
        const mW = 86;
        const gW = 86;
        const balW = 148;

        // Salary
        doc.setFillColor(237, 233, 254);
        doc.setDrawColor(124, 58, 237);
        doc.roundedRect(innerX, botY, sW, boxH, 3, 3, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(76, 29, 149);
        doc.text('Salary (Violet)', innerX + 6, botY + 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.text('Base + Prev Balance', innerX + 6, botY + 23);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text('- Total -', innerX + sW + 4, botY + 19);

        // MP2
        const mx = innerX + sW + 38;
        doc.setFillColor(254, 243, 199);
        doc.setDrawColor(217, 119, 6);
        doc.roundedRect(mx, botY, mW, boxH, 3, 3, 'FD');
        doc.setFontSize(7.2);
        doc.setTextColor(120, 53, 15);
        doc.text('MP2 (Amber)', mx + 6, botY + 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.text('Long-Term Save', mx + 6, botY + 23);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text('+', mx + mW + 3, botY + 19);

        // GoTyme
        const gx = mx + mW + 12;
        doc.setFillColor(204, 251, 241);
        doc.setDrawColor(13, 148, 136);
        doc.roundedRect(gx, botY, gW, boxH, 3, 3, 'FD');
        doc.setFontSize(7.2);
        doc.setTextColor(19, 78, 74);
        doc.text('GoTyme (Teal)', gx + 6, botY + 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.text('Liquid Savings', gx + 6, botY + 23);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text('=', gx + gW + 3, botY + 19);

        // Balance
        const balX = gx + gW + 12;
        doc.setFillColor(209, 250, 229);
        doc.setDrawColor(5, 150, 105);
        doc.roundedRect(balX, botY, balW, boxH, 3, 3, 'FD');
        doc.setFontSize(7.2);
        doc.setTextColor(6, 78, 59);
        doc.text('Balance (Emerald / Rose Pulse)', balX + 6, botY + 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.text('(Salary - Total) - (MP2 + GoTyme)', balX + 6, botY + 23);
      }
    );
  };

  const drawOnboardingStepsVisual = () => {
    drawVisualFigureFrame(
      'Figure 5: Visual Quick-Start Workflow for First-Time Users',
      78,
      (topY) => {
        const innerX = marginX + 10;
        const innerW = contentWidth - 20;
        const gap = 10;
        const cardW = (innerW - gap * 3) / 4;
        const cards = [
          {
            num: '1',
            title: 'Create Sheet',
            uiTop: '+ Add Sheet',
            uiBody: '[Clean Default]\n[x] No Prev Balance',
            accent: [5, 150, 105] as [number, number, number],
          },
          {
            num: '2',
            title: 'Set Salary',
            uiTop: 'SALARY -> Breakdown',
            uiBody: 'Base Salary\n+ Prev Balance',
            accent: [124, 58, 237] as [number, number, number],
          },
          {
            num: '3',
            title: 'Log Bills',
            uiTop: '=1500+320',
            uiBody: 'Remarks:\nSettled / Deferred',
            accent: [2, 132, 199] as [number, number, number],
          },
          {
            num: '4',
            title: 'Backup & Sync',
            uiTop: 'Settings',
            uiBody: 'Google Cloud Sync\nPesoBudget/ ZIP',
            accent: [124, 58, 237] as [number, number, number],
          },
        ];

        cards.forEach((card, idx) => {
          const cx = innerX + idx * (cardW + gap);
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(203, 213, 225);
          doc.roundedRect(cx, topY, cardW, 70, 4, 4, 'FD');

          // Top colored ribbon
          doc.setFillColor(card.accent[0], card.accent[1], card.accent[2]);
          doc.roundedRect(cx, topY, cardW, 18, 4, 4, 'F');
          doc.rect(cx, topY + 10, cardW, 8, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(255, 255, 255);
          doc.text(`${card.num}. ${card.title}`, cx + cardW / 2, topY + 12, { align: 'center' });

          // Mini UI button preview inside card
          doc.setFillColor(241, 245, 249);
          doc.setDrawColor(203, 213, 225);
          doc.roundedRect(cx + 8, topY + 24, cardW - 16, 14, 2, 2, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.setTextColor(15, 23, 42);
          doc.text(card.uiTop, cx + cardW / 2, topY + 33, { align: 'center' });

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.4);
          doc.setTextColor(71, 85, 105);
          const lines = card.uiBody.split('\n');
          doc.text(lines[0], cx + cardW / 2, topY + 49, { align: 'center' });
          if (lines[1]) {
            doc.text(lines[1], cx + cardW / 2, topY + 59, { align: 'center' });
          }

          if (idx < cards.length - 1) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(100, 116, 139);
            doc.text('->', cx + cardW + 1.5, topY + 36);
          }
        });
      }
    );
  };

  // --- Cover / Top Banner ---
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 88, 'F');
  doc.setFillColor(5, 150, 105);
  doc.rect(0, 84, pageWidth, 4, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('PesoBudget - Official User Manual & Quick-Start Guide', marginX, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Release ${version}  |  Published ${publishedStamp}  |  Searchable PDF (Use Ctrl+F / Cmd+F to find any topic)`,
    marginX,
    56
  );
  doc.text(
    'Smart Philippine Payroll (Monthly & 15th Kinsenas), Expense Allocation, Savings & Offline Workbook',
    marginX,
    71
  );

  y = 108;

  // --- Section 1: Introduction ---
  drawSectionHeading('1', 'Introduction');
  drawParagraph(
    'PesoBudget is a financial spreadsheet workspace built specifically for Philippine payroll cycles, separating each month into Monthly and 15th Kinsenas cutoffs while keeping cash obligations, digital QR PH transfers, and savings aligned in real time.'
  );
  drawParagraph(
    'Every sheet works offline on browsers, desktop, and mobile, with optional Google Firebase cloud synchronization, encrypted portable HTML exports, and native Excel and PDF reporting.'
  );

  // --- Section 2: Application Overview & Layout Description ---
  drawSectionHeading('2', 'Workspace Layout Description');
  const workspaceAreas: FunctionDocRow[] = [
    {
      feature: 'Top Navigation & Toolbar',
      location: 'Top of screen',
      explanation:
        'Centers view tabs, Light/Dark mode (Dark default), Sync badge, and Settings, paired with a compact toolbar holding the Year selector, Add Sheet, Import/Export/Print, and Currency toggle.',
    },
    {
      feature: 'Formula Bar',
      location: 'Above the table',
      explanation:
        'Displays the selected cell label (including custom column names), live formula evaluation box, and quick cell note button.',
    },
    {
      feature: 'Budget Table & Filter Strip',
      location: 'Main center canvas',
      explanation:
        'Features an always-centered sheet title with icon-only Undo/Redo arrows, centered Remarks Filter strip (All, Settled, Deferred, Unset) with one-tap Settle Unset, keyboard Ctrl+Z / Ctrl+Y Undo/Redo, 4-way navigation, negative signs beside numbers, all-caps SALARY/BALANCE rows, and Emerald or pulsing Rose balances.',
    },
    {
      feature: 'Active Cell Action Bar',
      location: 'Floating bottom bar',
      explanation:
        'Appears when any cell is tapped so you can edit values, launch formulas, open Salary Breakdown, move rows, merge or unmerge cells, clear values, or attach notes.',
    },
    {
      feature: 'Bottom Sheet Tabs',
      location: 'Below the table',
      explanation:
        'Lets you switch between cutoff sheets in the selected fiscal year or jump straight to Summary Charts and the Audit Change Log.',
    },
  ];

  autoTable(doc, {
    startY: y,
    head: [['Workspace Area', 'Location', 'One-Sentence Description']],
    body: workspaceAreas.map((r) => [r.feature, r.location, r.explanation]),
    margin: { left: marginX, right: marginX },
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 5,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 118, fontStyle: 'bold' },
      1: { cellWidth: 96, textColor: [71, 85, 105] },
      2: { cellWidth: 'auto' },
    },
  });

  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) + 14;

  drawWorkspaceScreenDiagram();

  // --- Section 3: Complete Function Reference (Strictly 1 sentence per function) ---
  drawSectionHeading('3', 'Function Reference (One Sentence per Function)');

  const spreadsheetFunctions: FunctionDocRow[] = [
    {
      feature: 'Cell Selection & Keyboard Nav',
      location: 'Any table cell',
      explanation:
        'Tap once or move with Arrow keys and Tab to select cells, and press Enter, F2, or double-click to edit inline (or Escape to cancel).',
    },
    {
      feature: 'Undo & Redo Controls',
      location: 'Table Title Arrows & Ctrl+Z / Ctrl+Y',
      explanation:
        'Reverses or reapplies recent worksheet edits, row moves, merges, clears, and batch remark updates via the icon-only arrow buttons in the table title or Ctrl+Z / Ctrl+Y.',
    },
    {
      feature: 'Remarks Filter & Batch Settle',
      location: 'Centered strip above headers',
      explanation:
        'Centers a live status filter (All, Settled, Deferred, Unset) alongside a quick Settle Unset shortcut while keeping totals visible.',
    },
    {
      feature: 'Formula Input (=)',
      location: 'Any numeric cell / Formula Bar',
      explanation:
        'Start any amount with an equals sign such as =1200+450 to compute arithmetic expressions automatically.',
    },
    {
      feature: 'Edit Formula (fx)',
      location: 'Active Cell Bar (QR PH to Balance)',
      explanation:
        'Opens a dedicated formula editor to review or customize calculations on summary rows safely.',
    },
    {
      feature: 'Merge & Unmerge Cells',
      location: 'Active Cell Bar / Title 3-Dots Menu',
      explanation:
        'Combines contiguous columns in a row into one span or splits merged summary cells back into separate Monthly and Kinsenas columns.',
    },
    {
      feature: 'Where to Merge Picker',
      location: 'Merge Cells Dialog',
      explanation:
        'Lets you select the exact target row, starting column, and ending column before applying or undoing a cell merge.',
    },
    {
      feature: 'Excel Cell Notes',
      location: 'Active Cell Bar -> Note',
      explanation:
        'Attaches searchable sticky notes to any payment label, amount, or remark cell for billing reminders.',
    },
    {
      feature: 'Remarks Selector',
      location: 'Remarks column (expense rows)',
      explanation:
        'Sets a bill to Settled when paid, Deferred when moved to the next payroll, or Clear (-) to leave status unset.',
    },
    {
      feature: 'Withdrawn Cash Input',
      location: 'Metrobank Remarks cell',
      explanation:
        'Records your actual ATM cash withdrawn so the Total and Balance remarks compare planned versus real spending.',
    },
    {
      feature: 'Reorder Expense Rows',
      location: 'Table Row Drag / Cell Bar Up & Down',
      explanation:
        'Moves expense rows smoothly via drag-and-drop or the floating action bar Up/Down arrows to arrange bill priority.',
    },
    {
      feature: 'Add / Remove Line Items',
      location: 'PAYMENTS 3-Dots Menu',
      explanation:
        'Inserts custom payment rows at any chosen position or deletes optional expense lines from the active sheet.',
    },
    {
      feature: 'Add / Remove Columns',
      location: 'Table Title 3-Dots Menu',
      explanation:
        'Adds custom currency or text columns anywhere in the sheet and lets you remove or restore default columns.',
    },
    {
      feature: 'Dynamic Category Renaming',
      location: 'Sheet Title / Headers / Row Labels',
      explanation:
        'Renames the sheet heading, column headers, or any category under PAYMENTS (such as GoTyme) inline and propagates the updated name automatically across Summary, Charts, Reports, and Exports.',
    },
  ];

  const autoCalcFunctions: FunctionDocRow[] = [
    {
      feature: 'QR PH Row',
      location: 'Table -> QR PH',
      explanation:
        'Tracks digital and QR PH online expenses included automatically in your combined Total expenses.',
    },
    {
      feature: 'Metrobank Row',
      location: 'Table -> Metrobank',
      explanation:
        'Automatically sums physical cash expenses across House, Loans, Utilities, Meals, Load, and Others for ATM withdrawal.',
    },
    {
      feature: 'Total Row',
      location: 'Table -> Total',
      explanation:
        'Automatically adds Metrobank cash obligations and QR PH digital spending for each payroll cutoff.',
    },
    {
      feature: 'SALARY & Breakdown',
      location: 'Select SALARY Row -> Breakdown',
      explanation:
        'Tap the SALARY row and pick Breakdown in the floating bar (or double-click SALARY Monthly/Kinsenas) to set Base Pay and Previous Balance.',
    },
    {
      feature: 'Pag-IBIG MP2 Row',
      location: 'Table -> Pag-IBIG MP2',
      explanation:
        'Records long-term locked government savings allocations subtracted before calculating your ending balance.',
    },
    {
      feature: 'GoTyme Row',
      location: 'Table -> GoTyme',
      explanation:
        'Tracks withdrawable personal bank savings set aside separately from daily bills before computing ending balance.',
    },
    {
      feature: 'BALANCE Row',
      location: 'Table -> BALANCE',
      explanation:
        'Automatically computes net remaining balance via (SALARY - Total) - (MP2 + GoTyme) and pulses softly in rose whenever negative.',
    },
  ];

  const navigationAndSyncFunctions: FunctionDocRow[] = [
    {
      feature: 'Fiscal Year & Currency Toggle',
      location: 'Top Bar -> Year / Currency',
      explanation:
        'Filters sheets by calendar year and switches display amounts across PHP, USD, EUR, JPY, and other international currencies.',
    },
    {
      feature: 'Adaptive Screen Layout',
      location: 'Automatic Across Devices',
      explanation:
        'Scales table width, padding, and font sizes smoothly from mobile screens to desktop monitors using vertical-only scrolling.',
    },
    {
      feature: 'Add Sheet & Deferred Carryover',
      location: 'Top Bar -> Add Sheet',
      explanation:
        'Creates a new month sheet by copying your active sheet or starting from Clean Default Template with optional Previous Balance and Deferred bill carryover.',
    },
    {
      feature: 'Summary & Charts',
      location: 'Top Bar -> Summary / Charts Tabs',
      explanation:
        'Visualizes cash versus digital distribution, monthly Salary vs Expenses bars, and strictly separated Pag-IBIG MP2 (Locked), GoTyme (Withdrawable), and Ending Balance metrics.',
    },
    {
      feature: 'Audit Change Log & Dialogs',
      location: 'Top Bar -> Change Log',
      explanation:
        'Logs every cell edit, batch remark change, formula update, merge, rename, and deletion while using styled in-app confirmation dialogs.',
    },
    {
      feature: 'Light / Dark Mode Toggle',
      location: 'Top Bar (beside Sync indicator)',
      explanation:
        'Defaults to Dark mode and switches the entire workspace smoothly between high-contrast Dark mode and crisp Light mode.',
    },
    {
      feature: 'Import / Export & Print',
      location: 'Top Bar -> Import / Export',
      explanation:
        'Exports single sheets or full workbooks to Excel (.xlsx), JSON, PDF reports, or browser printouts, and imports Excel data.',
    },
    {
      feature: 'Strict Gmail OTP Cloud Sync',
      location: 'Settings -> Sign in with Google',
      explanation:
        'Automatically emails a 6-digit verification code to your Gmail via Google permission (with OAuth fallback if declined) before unlocking Firebase Cloud backup and snapshot restore.',
    },
    {
      feature: 'True Offline Mode & Upload Prompt',
      location: 'Public Link / Top Bar Sync Badge',
      explanation:
        'Runs completely offline on the public link via precached PWA assets, tracks changes locally, and asks on reconnection whether to Upload & Sync or Discard Offline edits without losing offline updates.',
    },
    {
      feature: 'Top Toasts & Public Link Monitor',
      location: 'Top Notification Banner / Settings',
      explanation:
        'Checks pesobudget-smart-philippine-expense-payroll-track.ai.studio availability automatically in the background and renders all alerts in modern top-anchored toast notifications.',
    },
    {
      feature: 'Welcome Tour & Admin Console',
      location: 'First Launch / Settings',
      explanation:
        'Guides new users with an interactive 5-step onboarding tour and equips authorized developer administrators with user approval and block controls.',
    },
    {
      feature: 'Portable HTML ZIP & Optional Fingerprint',
      location: 'Settings -> Portable Password Lock',
      explanation:
        'Requires Google Sign-In plus a 6-digit Gmail verification code to set a Portable Password Lock (enabling protected exports, imports, prints, and restores), with optional hardware Fingerprint unlock.',
    },
    {
      feature: 'Local data/ Folder Sync',
      location: 'Settings -> Connect data/ Folder',
      explanation:
        'Links a local folder on desktop browsers so every edit auto-saves directly into local JSON database files.',
    },
    {
      feature: 'Android Studio Project Export',
      location: 'Settings -> Export Project',
      explanation:
        'Downloads a ready-to-build Gradle ZIP bundle you can open in Android Studio to compile an offline APK.',
    },
    {
      feature: 'Download Manual (PDF)',
      location: 'Settings -> User Manual',
      explanation:
        'Downloads this searchable PDF reference guide that automatically updates with every published change in the app.',
    },
  ];

  const renderDocTable = (subtitle: string, rows: FunctionDocRow[]) => {
    ensureSpace(64);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(5, 150, 105);
    doc.text(subtitle, marginX, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [['Function', 'Where to Access', 'Direct Explanation (1 Sentence)']],
      body: rows.map((r) => [r.feature, r.location, r.explanation]),
      margin: { left: marginX, right: marginX },
      styles: {
        font: 'helvetica',
        fontSize: 8.2,
        cellPadding: 4.5,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.5,
      },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 112, fontStyle: 'bold' },
        1: { cellWidth: 114, textColor: [71, 85, 105] },
        2: { cellWidth: 'auto' },
      },
    });

    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) + 14;
  };

  renderDocTable('A. Spreadsheet Editing, Merging & Customization', spreadsheetFunctions);
  drawEditingAndRemarksVisual();
  drawMergeAndWhereVisual();

  renderDocTable('B. Payroll Cutoffs & Auto-Computed Budget Rows', autoCalcFunctions);
  drawAutoCalculationFlowVisual();

  renderDocTable('C. Sheets, Analytics, Cloud Sync & Exports', navigationAndSyncFunctions);

  // --- Section 4: Guidelines for New Users ---
  drawSectionHeading('4', 'Step-by-Step Guidelines for New Users');
  drawParagraph(
    'Follow this recommended visual workflow when setting up your first budget sheet so every automatic Metrobank, QR PH, and balance calculation stays accurate from day one.'
  );
  drawOnboardingStepsVisual();

  const onboardingSteps = [
    [
      'Step 1',
      'Create Your First Sheet',
      'Click Add Sheet in the top bar, choose Clean Default Template, select your target year, and toggle Previous Balance or Deferred Bills carryover as needed.',
    ],
    [
      'Step 2',
      'Set Your Payroll Salary',
      'Tap the SALARY row and pick Breakdown in the floating bar (or double-click SALARY Monthly/Kinsenas) to enter your Base Salary and Previous Balance.',
    ],
    [
      'Step 3',
      'Log Bills & Filter Remarks',
      'Navigate with Arrows or Tab, enter amounts or formulas like =1500+320, set Remarks (Settled / Deferred), and use the Filter strip or Settle Unset button.',
    ],
    [
      'Step 4',
      'Track QR PH, MP2 & GoTyme',
      'Record digital spending in QR PH, locked savings in Pag-IBIG MP2, and withdrawable savings in GoTyme while tracking Ending Balance separately.',
    ],
    [
      'Step 5',
      'Customize, Undo & Merge',
      'Reorder bills smoothly, press Ctrl+Z / Ctrl+Y anytime to undo or redo, rename any category under PAYMENTS to update charts and summaries, and merge or split cells cleanly.',
    ],
    [
      'Step 6',
      'Verify Gmail, Offline Sync & Export',
      'Open Settings to sign in with Google using your 6-digit Gmail OTP code, review and upload offline edits on reconnection, or export PDF, Excel, and Portable ZIP backups anytime.',
    ],
  ];

  autoTable(doc, {
    startY: y,
    head: [['Stage', 'Action', 'Guideline']],
    body: onboardingSteps,
    margin: { left: marginX, right: marginX },
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 5,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    headStyles: { fillColor: [5, 150, 105], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [240, 253, 250] },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold', textColor: [5, 150, 105] },
      1: { cellWidth: 118, fontStyle: 'bold' },
      2: { cellWidth: 'auto' },
    },
  });

  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y) + 16;

  ensureSpace(120);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Essential Best Practices & Quick Tips', marginX, y);
  y += 14;

  const tips: string[] = [
    '- Keep Metrobank-linked bills updated and use the centered Remarks Filter bar or Settle Unset shortcut to verify every obligation before cutoff.',
    '- Use the Undo/Redo arrows in the table title bar or press Ctrl+Z / Ctrl+Y to revert or reapply changes, alongside Arrow keys, Tab, and Enter/F2 for fast keyboard entry.',
    '- Rename any payment or savings row inline under PAYMENTS and PesoBudget updates that label across Summary, Charts, and Reports automatically.',
    '- When working offline on the public link, edits stay safely queued locally; upon reconnection, choose Upload & Sync Now so your offline edits replace older cloud data.',
    '- Signing in with Google automatically emails a 6-digit verification code to your Gmail (with send permission, or via OAuth fallback); public link health and sync alerts appear cleanly at the top of the screen.',
    '- Sign in with Google and verify the 6-digit Gmail code to set a Portable Password Lock before using Import, Export, Print, Folder Sync, Restore, or optional Biometrics Fingerprint.',
    '- When new updates are published on the public web link, read the automatic changelog popup and click OK to confirm or refresh cleanly.',
  ];

  for (const tip of tips) {
    drawParagraph(tip, 8.8, 5);
  }

  y += 6;

  // --- Section 5: Latest App Changes & Release History (Auto-Updated with App) ---
  drawSectionHeading('5', 'Latest App Updates & Release History');
  if (releaseHistory.length === 0) {
    drawParagraph(
      `Current release ${version} (${publishedStamp}) includes the complete spreadsheet, payroll cutoff, cell merge, theme, and backup features documented in this manual.`
    );
  } else {
    drawParagraph(
      `This manual automatically synchronizes with every published update. Below is the active release (${version}) followed by recent app changes:`
    );

    if (latestRelease) {
      const latestBullets = (latestRelease.changes || []).map((c) => `- ${toPdfSafeText(c)}`);
      ensureSpace(48 + latestBullets.length * 14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(5, 150, 105);
      doc.text(
        `Current Release ${version} | ${generatedDate}${
          latestRelease.timeLabel ? ` (${toPdfSafeText(latestRelease.timeLabel)})` : ''
        } - ${toPdfSafeText(latestRelease.title)}`,
        marginX,
        y
      );
      y += 14;
      for (const bullet of latestBullets) {
        drawParagraph(bullet, 8.5, 4);
      }
      y += 4;
    }

    const recentReleases = releaseHistory.slice(0, 6);
    autoTable(doc, {
      startY: y,
      head: [['Version', 'Date (PHT)', 'Release Title', 'Summary of Changes']],
      body: recentReleases.map((rel) => [
        `v${toPdfSafeText(rel.version)}`,
        `${toPdfSafeText(rel.date)}${rel.timeLabel ? `\n${toPdfSafeText(rel.timeLabel)}` : ''}`,
        toPdfSafeText(rel.title),
        (rel.changes || []).map((c) => `- ${toPdfSafeText(c)}`).join('\n'),
      ]),
      margin: { left: marginX, right: marginX },
      styles: {
        font: 'helvetica',
        fontSize: 7.8,
        cellPadding: 4.5,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.5,
      },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 48, fontStyle: 'bold' },
        1: { cellWidth: 68, textColor: [71, 85, 105] },
        2: { cellWidth: 112, fontStyle: 'bold' },
        3: { cellWidth: 'auto' },
      },
    });
  }

  // Footer with page numbers across every page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, pageHeight - 36, pageWidth - marginX, pageHeight - 36);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `PesoBudget User Manual (${version})  -  Searchable Offline PDF Guide`,
      marginX,
      pageHeight - 22
    );
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - marginX, pageHeight - 22, {
      align: 'right',
    });
  }

  const filename = `PesoBudget-User-Manual-${version}.pdf`;
  doc.save(filename);
  return { filename, pageCount, version };
}
