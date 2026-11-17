import React, { useState, useRef, useMemo } from 'react';
import { MonthData } from '../types/budget';
import { parseCSVData, parseJSONBackup, ImportResult } from '../utils/importer';
import {
  exportMonthToExcel,
  exportAllMonthsToExcel,
  exportSummaryToExcel,
  importFromExcelFile,
} from '../utils/excelService';
import {
  exportMonthToCSV,
  exportAllMonthsToCSV,
  exportSummaryToCSV,
  exportAllMonthsToJSON,
} from '../utils/exporter';
import { generateJanuaryToPresentHistory } from '../utils/historyGenerator';
import { getChangeLogs, exportChangeLogsToCSV } from '../utils/changeLogService';
import { getStoredPortableLock, type PortableLockMetadata } from '../utils/portableCrypto';
import { downloadBudgetPdf, printBudgetDirectly } from '../utils/printService';
import { PasswordConfirmModal } from './PasswordConfirmModal';
import { ActionMessageModal, type ActionMessageVariant } from './ActionMessageModal';
import {
  X,
  Upload,
  Download,
  FileSpreadsheet,
  FileCode,
  FileText,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Printer,
  FileDown,
  Layers,
  History,
  BarChart3,
  Calendar,
  Check,
} from 'lucide-react';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  months?: Record<string, MonthData>;
  currentMonth?: MonthData;
  currentYear?: number;
  onImportSuccess: (updatedMonths: Record<string, MonthData>, activeMonthId?: string) => void;
  onTriggerPrint: (targetSheet: 'active' | 'summary' | 'year' | 'changelog', isPdf: boolean) => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
  months = {},
  currentMonth,
  currentYear = 2026,
  onImportSuccess,
  onTriggerPrint,
}) => {
  // All hooks must be defined unconditionally at the top of the component
  const [activeTab, setActiveTab] = useState<'export' | 'print' | 'import' | 'template'>('export');
  const [pastedText, setPastedText] = useState('');
  const [importStatus, setImportStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
    detail?: string;
  }>({ type: 'idle', message: '' });

  // Export selection options
  const [exportSheetTarget, setExportSheetTarget] = useState<'active' | 'summary' | 'year' | 'all' | 'changelog'>('summary');
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv' | 'json'>('xlsx');

  // Print selection options
  const [printSheetTarget, setPrintSheetTarget] = useState<'active' | 'summary' | 'year' | 'changelog'>('active');
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);
  const [passwordConfirmRequest, setPasswordConfirmRequest] = useState<{
    title: string;
    description: string;
    run: () => void;
  } | null>(null);
  const [actionPopup, setActionPopup] = useState<{
    variant: ActionMessageVariant;
    title: string;
    message: string;
    detail?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Safe month collection and filtering
  const safeMonths = useMemo(() => months || {}, [months]);
  const totalMonthsCount = useMemo(() => Object.keys(safeMonths).length, [safeMonths]);

  // Safe current month name
  const currentMonthName = useMemo(() => currentMonth?.name || 'Active Month', [currentMonth]);

  // Filter months for selected year
  const yearMonths = useMemo(() => {
    const filtered: Record<string, MonthData> = {};
    Object.entries(safeMonths).forEach(([k, m]) => {
      if (!m) return;
      if ((m.year && m.year === currentYear) || (m.name && m.name.includes(String(currentYear)))) {
        filtered[k] = m;
      }
    });
    return Object.keys(filtered).length > 0 ? filtered : safeMonths;
  }, [safeMonths, currentYear]);

  const yearMonthsCount = useMemo(() => Object.keys(yearMonths).length, [yearMonths]);

  // Conditional return only AFTER all hooks are defined
  if (!isOpen) return null;

  const getActiveLockMeta = (): PortableLockMetadata | null => {
    const embeddedLock =
      typeof window !== 'undefined' ? window.__PESOBUDGET_PORTABLE_LOCK__ : undefined;
    return embeddedLock || getStoredPortableLock();
  };

  const requireLockPassword = (title: string, description: string, action: () => void) => {
    const activeLock = getActiveLockMeta();
    if (!activeLock) {
      setActionPopup({
        variant: 'blocked',
        title: 'Not Permitted',
        message: `${title} is not permitted without a Portable Password Lock.`,
        detail: 'Open Settings → Portable Password Lock → Set Password first.',
      });
      return;
    }
    setPasswordConfirmRequest({ title, description, run: action });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const lowerName = file.name.toLowerCase();

    // Native Excel (.xlsx, .xls)
    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      try {
        const result = await importFromExcelFile(file, safeMonths);
        if (result.success) {
          const msg = `Successfully imported Excel file (${result.importedMonthsCount} sheet/month)!`;
          const detail = `Months loaded: ${result.monthNames.join(', ')}`;
          setImportStatus({
            type: 'success',
            message: msg,
            detail,
          });
          onImportSuccess(result.data, Object.keys(result.data)[Object.keys(result.data).length - 1]);
          setActionPopup({
            variant: 'success',
            title: 'Import Successful',
            message: msg,
            detail,
          });
        } else {
          setImportStatus({
            type: 'error',
            message: 'Could not parse Excel spreadsheet.',
            detail: result.errors.join(' | ') || 'Check sheet layout and column headers.',
          });
        }
      } catch (err) {
        setImportStatus({
          type: 'error',
          message: 'Error reading Excel file.',
          detail: err instanceof Error ? err.message : 'Unknown error',
        });
      }
      return;
    }

    // CSV or JSON text
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      processTextContent(text, file.name);
    };
    reader.readAsText(file);
  };

  const processTextContent = (content: string, name: string) => {
    const trimmed = content.trim();

    let result: ImportResult;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      result = parseJSONBackup(trimmed, safeMonths);
    } else {
      result = parseCSVData(trimmed, safeMonths, currentMonthName);
    }

    if (result.success) {
      const msg = `Successfully imported ${result.importedMonthsCount} month(s) from ${name}!`;
      const detail = `Months: ${result.monthNames.join(', ')}`;
      setImportStatus({
        type: 'success',
        message: msg,
        detail,
      });
      onImportSuccess(result.data, Object.keys(result.data)[Object.keys(result.data).length - 1]);
      setActionPopup({
        variant: 'success',
        title: 'Import Successful',
        message: msg,
        detail,
      });
    } else {
      setImportStatus({
        type: 'error',
        message: 'Could not parse import data.',
        detail: result.errors.join(' | ') || 'Please verify the columns and structure.',
      });
    }
  };

  const handlePasteSubmit = () => {
    if (!pastedText.trim()) return;
    requireLockPassword(
      'Import Pasted Data',
      'Enter your lock password to parse and import pasted spreadsheet data.',
      () => {
        processTextContent(pastedText, 'pasted_data.csv');
      }
    );
  };

  const executeExport = () => {
    let exportedMessage = 'Export completed successfully.';

    if (exportSheetTarget === 'changelog') {
      const logs = getChangeLogs();
      exportChangeLogsToCSV(logs);
      exportedMessage = `Exported Change Log ledger (${logs.length} entries) as CSV (.csv).`;
    } else if (exportSheetTarget === 'summary') {
      if (exportFormat === 'xlsx') {
        exportSummaryToExcel(safeMonths);
        exportedMessage = 'Exported Whole Overall Summary (7 pages) as Excel (.xlsx).';
      } else if (exportFormat === 'csv') {
        exportSummaryToCSV(safeMonths);
        exportedMessage = 'Exported Whole Overall Summary as CSV (.csv).';
      } else {
        exportAllMonthsToJSON(safeMonths);
        exportedMessage = `Exported JSON Backup (${totalMonthsCount} month(s)) as .json.`;
      }
    } else if (exportFormat === 'xlsx') {
      if (exportSheetTarget === 'active' && currentMonth) {
        exportMonthToExcel(currentMonth);
        exportedMessage = `Exported ${currentMonthName} as Excel (.xlsx).`;
      } else if (exportSheetTarget === 'year') {
        exportAllMonthsToExcel(yearMonths);
        exportedMessage = `Exported ${currentYear} Sheets (${yearMonthsCount} month(s)) as Excel (.xlsx).`;
      } else {
        exportAllMonthsToExcel(safeMonths);
        exportedMessage = `Exported Entire Workbook (${totalMonthsCount} month(s)) as Excel (.xlsx).`;
      }
    } else if (exportFormat === 'csv') {
      if (exportSheetTarget === 'active' && currentMonth) {
        exportMonthToCSV(currentMonth);
        exportedMessage = `Exported ${currentMonthName} as CSV (.csv).`;
      } else if (exportSheetTarget === 'year') {
        exportAllMonthsToCSV(yearMonths);
        exportedMessage = `Exported ${currentYear} Sheets (${yearMonthsCount} month(s)) as CSV (.csv).`;
      } else {
        exportAllMonthsToCSV(safeMonths);
        exportedMessage = `Exported Entire Workbook (${totalMonthsCount} month(s)) as CSV (.csv).`;
      }
    } else if (exportFormat === 'json') {
      if (exportSheetTarget === 'active' && currentMonth) {
        const singleMonth: Record<string, MonthData> = { [currentMonth.id]: currentMonth };
        exportAllMonthsToJSON(singleMonth);
        exportedMessage = `Exported ${currentMonthName} JSON Backup (.json).`;
      } else if (exportSheetTarget === 'year') {
        exportAllMonthsToJSON(yearMonths);
        exportedMessage = `Exported ${currentYear} Sheets (${yearMonthsCount} month(s)) JSON Backup (.json).`;
      } else {
        exportAllMonthsToJSON(safeMonths);
        exportedMessage = `Exported Entire Workbook (${totalMonthsCount} month(s)) JSON Backup (.json).`;
      }
    }

    setActionPopup({
      variant: 'success',
      title: 'Export Successful',
      message: exportedMessage,
    });
  };

  const handleExecuteExport = () => {
    const formatLabel =
      exportSheetTarget === 'changelog'
        ? 'CSV (.csv)'
        : exportFormat === 'xlsx'
          ? 'Excel (.xlsx)'
          : exportFormat === 'csv'
            ? 'CSV (.csv)'
            : 'JSON Backup (.json)';
    requireLockPassword(
      `Export ${formatLabel}`,
      `Enter your lock password to export your budget data as ${formatLabel}.`,
      executeExport
    );
  };

  const handleExecutePrint = (isPdf: boolean) => {
    const actionLabel = isPdf ? 'Save as PDF Document' : 'Print to Printer';
    const actionDesc = isPdf
      ? 'Enter your lock password to generate and download a formatted PDF report.'
      : 'Enter your lock password to open the printer dialog for your budget report.';

    requireLockPassword(actionLabel, actionDesc, () => {
      if (isPdf) {
        try {
          const { filename, detail } = downloadBudgetPdf(printSheetTarget, {
            months: safeMonths,
            yearMonths,
            currentMonth,
            currentYear,
          });
          setActionPopup({
            variant: 'success',
            title: 'PDF Saved Successful',
            message: `Downloaded ${filename}`,
            detail,
          });
        } catch (err) {
          setActionPopup({
            variant: 'error',
            title: 'PDF Export Failed',
            message: err instanceof Error ? err.message : 'Could not generate PDF document.',
          });
        }
        return;
      }

      try {
        const { title, isEmbeddedFrame } = printBudgetDirectly(printSheetTarget, {
          months: safeMonths,
          yearMonths,
          currentMonth,
          currentYear,
        });
        setActionPopup({
          variant: isEmbeddedFrame ? 'info' : 'success',
          title: 'Print Sent to Printer',
          message: `Prepared "${title}" for printing.`,
          detail: isEmbeddedFrame
            ? 'If your browser preview blocks the native print dialog inside an iframe, use "Save as PDF Document" next to Print to download and print immediately.'
            : 'Print dialog opened with landscape layout.',
        });
      } catch (err) {
        onTriggerPrint(printSheetTarget, false);
        setActionPopup({
          variant: 'info',
          title: 'Print Triggered',
          message: err instanceof Error ? err.message : 'Sent document to browser print.',
        });
      }
    });
  };

  const handleSeedHistory = () => {
    requireLockPassword(
      'Load Jan–Oct 2026 Starter Data',
      'Enter your lock password to load the 10-month starter template.',
      () => {
        const history = generateJanuaryToPresentHistory();
        onImportSuccess(history, '2026-10');
        setShowSeedConfirm(false);
        const msg = 'Loaded January to Present (10 months)!';
        const detail = 'Months: January through October 2026 populated with historical cutoffs.';
        setImportStatus({
          type: 'success',
          message: msg,
          detail,
        });
        setActionPopup({
          variant: 'success',
          title: 'Load Successful',
          message: msg,
          detail,
        });
      }
    );
  };

  const handleTriggerFileImport = () => {
    requireLockPassword(
      'Import Excel / CSV / JSON File',
      'Enter your lock password before selecting a .xlsx, .xls, .csv, or .json file to import.',
      () => {
        fileInputRef.current?.click();
      }
    );
  };

  const handleDownloadXlsxTemplate = () => {
    requireLockPassword(
      'Download Excel (.xlsx) Template',
      'Enter your lock password to download the starter Excel workbook template.',
      () => {
        const history = generateJanuaryToPresentHistory();
        exportAllMonthsToExcel(history);
        setActionPopup({
          variant: 'success',
          title: 'Export Successful',
          message: 'Downloaded the Jan–Oct 2026 Excel (.xlsx) starter template.',
        });
      }
    );
  };

  return (
    <div
      className="pb-modal-backdrop z-50 flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/75 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="pb-modal-card w-full max-w-2xl lg:max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center font-bold text-sm lg:text-base shadow-xs border border-transparent dark:border-slate-700">
              ₱
            </div>
            <div>
              <h2 className="text-sm lg:text-base font-bold text-slate-900 dark:text-slate-100">
                Import / Export / Print Hub
              </h2>
              <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400">
                Spreadsheet data exchange, multi-format export, and print to physical printer or PDF
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 gap-2 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              setActiveTab('export');
              setImportStatus({ type: 'idle', message: '' });
            }}
            className={`py-3 px-4 text-xs lg:text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'export'
                ? 'border-emerald-600 dark:border-emerald-400 text-emerald-700 dark:text-emerald-400 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Export</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('print');
              setImportStatus({ type: 'idle', message: '' });
            }}
            className={`py-3 px-4 text-xs lg:text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'print'
                ? 'border-blue-600 dark:border-blue-400 text-blue-700 dark:text-blue-400 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Printer className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Print / PDF</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('import');
              setImportStatus({ type: 'idle', message: '' });
            }}
            className={`py-3 px-4 text-xs lg:text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'import'
                ? 'border-slate-900 dark:border-emerald-400 text-slate-900 dark:text-emerald-400 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Import</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('template');
              setImportStatus({ type: 'idle', message: '' });
            }}
            className={`py-3 px-4 text-xs lg:text-sm font-semibold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'template'
                ? 'border-slate-900 dark:border-emerald-400 text-slate-900 dark:text-emerald-400 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            <span>Starter Tools</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto overscroll-contain space-y-5 text-xs lg:text-sm flex-1 min-h-0">
          {/* Status Message */}
          {importStatus.type !== 'idle' && (
            <div
              className={`p-3 rounded-xl border text-xs lg:text-sm flex items-start gap-2.5 ${
                importStatus.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-800 text-rose-950 dark:text-rose-200'
              }`}
            >
              {importStatus.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-0.5">
                <div className="font-bold">{importStatus.message}</div>
                {importStatus.detail && (
                  <div className="text-[11px] lg:text-xs opacity-90 font-mono leading-relaxed">
                    {importStatus.detail}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 1: EXPORT (With Sheet Selection Options) */}
          {activeTab === 'export' && (
            <div className="space-y-5">
              {/* Step 1: Select What Sheet to Export */}
              <div>
                <label className="block text-slate-800 dark:text-slate-200 font-bold mb-2">
                  1. Select Which Sheet(s) to Export:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Option: Whole Overall Summary (All 7 Pages) */}
                  <div
                    onClick={() => setExportSheetTarget('summary')}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      exportSheetTarget === 'summary'
                        ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      exportSheetTarget === 'summary' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {exportSheetTarget === 'summary' && <Check className="w-3 h-3" />}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-100 text-xs lg:text-sm flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Whole Overall Summary (All 7 Pages)</span>
                      </div>
                      <p className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Exports the full executive report: Snapshot, Cutoffs, Categories, Cash Flow, Savings, Waterfall & History.
                      </p>
                    </div>
                  </div>

                  {/* Option: Current Active Sheet */}
                  <div
                    onClick={() => setExportSheetTarget('active')}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      exportSheetTarget === 'active'
                        ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      exportSheetTarget === 'active' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {exportSheetTarget === 'active' && <Check className="w-3 h-3" />}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-100 text-xs lg:text-sm flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Active Sheet ({currentMonthName})</span>
                      </div>
                      <p className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Only exports the currently viewed monthly budget table.
                      </p>
                    </div>
                  </div>

                  {/* Option: All Sheets in Year */}
                  <div
                    onClick={() => setExportSheetTarget('year')}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      exportSheetTarget === 'year'
                        ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      exportSheetTarget === 'year' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {exportSheetTarget === 'year' && <Check className="w-3 h-3" />}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-100 text-xs lg:text-sm flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>All {currentYear} Sheets ({yearMonthsCount} Months)</span>
                      </div>
                      <p className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Exports all monthly tabs for calendar year {currentYear}.
                      </p>
                    </div>
                  </div>

                  {/* Option: Entire Master Workbook */}
                  <div
                    onClick={() => setExportSheetTarget('all')}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      exportSheetTarget === 'all'
                        ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      exportSheetTarget === 'all' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {exportSheetTarget === 'all' && <Check className="w-3 h-3" />}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-100 text-xs lg:text-sm flex items-center gap-1.5">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                        <span>Entire Workbook ({totalMonthsCount} Total Months)</span>
                      </div>
                      <p className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Exports complete multi-year archive with each month as a tab.
                      </p>
                    </div>
                  </div>

                  {/* Option: Audit Change Log Sheet */}
                  <div
                    onClick={() => setExportSheetTarget('changelog')}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      exportSheetTarget === 'changelog'
                        ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      exportSheetTarget === 'changelog' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {exportSheetTarget === 'changelog' && <Check className="w-3 h-3" />}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-100 text-xs lg:text-sm flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span>Change Log Sheet (Audit Trail)</span>
                      </div>
                      <p className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Exports the detailed ledger of all cell edits, formulas & actions.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Select Format (if not changelog) */}
              {exportSheetTarget !== 'changelog' && (
                <div>
                  <label className="block text-slate-800 dark:text-slate-200 font-bold mb-2">
                    2. Select File Format:
                  </label>
                  <div className="grid grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setExportFormat('xlsx')}
                      className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                        exportFormat === 'xlsx'
                          ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 font-bold ring-2 ring-emerald-500/20'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <FileSpreadsheet className="w-5 h-5 mx-auto mb-1 text-emerald-600 dark:text-emerald-400" />
                      <span className="block text-xs lg:text-sm">Excel (.xlsx)</span>
                      <span className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400">Recommended</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setExportFormat('csv')}
                      className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                        exportFormat === 'csv'
                          ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 font-bold ring-2 ring-emerald-500/20'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <FileText className="w-5 h-5 mx-auto mb-1 text-blue-600 dark:text-blue-400" />
                      <span className="block text-xs lg:text-sm">CSV Text (.csv)</span>
                      <span className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400">Universal table</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setExportFormat('json')}
                      className={`p-3 rounded-xl border text-center transition-all cursor-pointer ${
                        exportFormat === 'json'
                          ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 font-bold ring-2 ring-emerald-500/20'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <FileCode className="w-5 h-5 mx-auto mb-1 text-purple-600 dark:text-purple-400" />
                      <span className="block text-xs lg:text-sm">JSON Backup (.json)</span>
                      <span className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400">Full backup</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleExecuteExport}
                  className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs lg:text-sm shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    {exportSheetTarget === 'changelog'
                      ? 'Export Change Log Ledger (.csv)'
                      : exportSheetTarget === 'summary'
                      ? `Download Whole Overall Summary (.${exportFormat.toUpperCase()})`
                      : `Download ${exportSheetTarget === 'active' ? currentMonthName : exportSheetTarget === 'year' ? `${currentYear} Sheets` : 'Entire Workbook'} (.${exportFormat.toUpperCase()})`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: PRINT / PDF (With Sheet Selection and Print / PDF Options) */}
          {activeTab === 'print' && (
            <div className="space-y-5">
              {/* Step 1: Select What Sheet to Print or PDF */}
              <div>
                <label className="block text-slate-800 dark:text-slate-200 font-bold mb-2">
                  1. Select Which Sheet(s) to Print or Save as PDF:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Option: Whole Overall Summary (All 7 Pages) */}
                  <div
                    onClick={() => setPrintSheetTarget('summary')}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      printSheetTarget === 'summary'
                        ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      printSheetTarget === 'summary' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {printSheetTarget === 'summary' && <Check className="w-3 h-3" />}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-100 text-xs lg:text-sm flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Whole Overall Summary (All 7 Pages)</span>
                      </div>
                      <p className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Prints complete 7-page report: Snapshot, Cutoffs, Categories, Cash Flow, Savings, Waterfall & History.
                      </p>
                    </div>
                  </div>

                  {/* Option: Active Month Sheet */}
                  <div
                    onClick={() => setPrintSheetTarget('active')}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      printSheetTarget === 'active'
                        ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      printSheetTarget === 'active' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {printSheetTarget === 'active' && <Check className="w-3 h-3" />}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-100 text-xs lg:text-sm flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>Active Sheet ({currentMonthName})</span>
                      </div>
                      <p className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Prints the active monthly table with payments, cutoffs, and balances.
                      </p>
                    </div>
                  </div>

                  {/* Option: All Sheets in Current Year */}
                  <div
                    onClick={() => setPrintSheetTarget('year')}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      printSheetTarget === 'year'
                        ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      printSheetTarget === 'year' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {printSheetTarget === 'year' && <Check className="w-3 h-3" />}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-100 text-xs lg:text-sm flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>All {currentYear} Sheets ({yearMonthsCount} Months)</span>
                      </div>
                      <p className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Comprehensive year printout covering all months in {currentYear}.
                      </p>
                    </div>
                  </div>

                  {/* Option: Audit Change Log Sheet */}
                  <div
                    onClick={() => setPrintSheetTarget('changelog')}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                      printSheetTarget === 'changelog'
                        ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 ring-2 ring-blue-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/60'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                      printSheetTarget === 'changelog' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {printSheetTarget === 'changelog' && <Check className="w-3 h-3" />}
                    </div>
                    <div>
                      <div className="font-bold text-slate-800 dark:text-slate-100 text-xs lg:text-sm flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                        <span>Change Log Ledger Sheet</span>
                      </div>
                      <p className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Full audit report of all cell revisions and structural changes.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Output Options (Print vs PDF) */}
              <div>
                <label className="block text-slate-800 dark:text-slate-200 font-bold mb-2">
                  2. Choose Print Output Mode:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option A: Direct Physical Print */}
                  <button
                    type="button"
                    onClick={() => handleExecutePrint(false)}
                    className="p-3.5 rounded-xl border border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/40 hover:bg-blue-100/70 dark:hover:bg-blue-950/70 text-blue-900 dark:text-blue-200 transition-all flex items-center gap-3 text-left cursor-pointer group shadow-xs"
                  >
                    <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                      <Printer className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-xs lg:text-sm flex items-center gap-1">
                        <span>Print to Printer</span>
                        <ArrowRight className="w-3 h-3 opacity-60 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                      <p className="text-[11px] lg:text-xs text-blue-700/80 dark:text-blue-300/80 mt-0.5">
                        Sends clean document directly to connected printer.
                      </p>
                    </div>
                  </button>

                  {/* Option B: Save as PDF */}
                  <button
                    type="button"
                    onClick={() => handleExecutePrint(true)}
                    className="p-3.5 rounded-xl border border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-950/40 hover:bg-rose-100/70 dark:hover:bg-rose-950/70 text-rose-950 dark:text-rose-200 transition-all flex items-center gap-3 text-left cursor-pointer group shadow-xs"
                  >
                    <div className="w-9 h-9 rounded-lg bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                      <FileDown className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-xs lg:text-sm flex items-center gap-1">
                        <span>Save as PDF Document</span>
                        <ArrowRight className="w-3 h-3 opacity-60 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                      <p className="text-[11px] lg:text-xs text-rose-800/80 dark:text-rose-300/80 mt-0.5">
                        Downloads a formatted landscape .pdf file directly to your device.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Formatting & Printing Tips Box */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl space-y-1.5 text-slate-600 dark:text-slate-300">
                <div className="font-semibold text-slate-800 dark:text-slate-100 text-[11px] lg:text-xs flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                  <span>Pro Tip for Clean PDF / Print Layout:</span>
                </div>
                <p className="text-[11px] lg:text-xs leading-relaxed">
                  In your browser's print dialog, select <strong>Landscape orientation</strong> and ensure <strong>"Background graphics"</strong> is checked to preserve currency badges and alternating row colors.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: IMPORT */}
          {activeTab === 'import' && (
            <div className="space-y-5">
              {/* File upload dropzone */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-2">
                  Upload Excel File (.xlsx, .xls) or CSV
                </label>
                <div
                  onClick={handleTriggerFileImport}
                  className="border-2 border-dashed border-emerald-400 dark:border-emerald-600 hover:border-emerald-600 dark:hover:border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/30 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/50 rounded-xl p-6 text-center cursor-pointer transition-colors"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <FileSpreadsheet className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                  <div className="font-bold text-slate-900 dark:text-slate-100 text-sm lg:text-base">
                    Click to select Excel (.xlsx) file from WPS Office or Microsoft Excel
                  </div>
                  <div className="text-[11px] lg:text-xs text-slate-600 dark:text-slate-300 mt-1">
                    Extracts values, formulas, comments, and remarks automatically. No limits on rows, sheets, or date ranges!
                  </div>
                </div>
              </div>

              {/* Paste Text Area */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-slate-700 dark:text-slate-300 font-semibold">
                    Or Copy & Paste Spreadsheet Table Directly
                  </label>
                  <span className="text-[11px] lg:text-xs text-slate-400 dark:text-slate-500">
                    Works directly with cells copied from Excel/WPS
                  </span>
                </div>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`PAYMENTS\tMONTHLY\tKINSENAS\tREMARKS\nHouse\t\t2500\tOK\nWater Bill\t310\t\tOK`}
                  rows={4}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 font-mono text-[11px] lg:text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:focus:ring-emerald-500 resize-none leading-relaxed"
                />
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={handlePasteSubmit}
                    disabled={!pastedText.trim()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs lg:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 rounded-lg shadow-xs cursor-pointer"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    Parse & Import Pasted Table
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: STARTER TEMPLATES */}
          {activeTab === 'template' && (
            <div className="space-y-4">
              <div className="bg-emerald-50/70 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span className="font-bold text-emerald-950 dark:text-emerald-200 text-xs lg:text-sm">
                      1-Click Historical Seed: January to Present
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSeedConfirm((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs lg:text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg shadow-xs cursor-pointer shrink-0"
                  >
                    Load Jan–Oct 2026
                  </button>
                </div>
                <p className="text-[11px] lg:text-xs text-emerald-900 dark:text-emerald-300 leading-relaxed">
                  Automatically generates 10 complete months (January to October 2026) populated with your exact layout: House, Loan, Water Bill, Electricity, Gas, Meal, Mobile Load, Others, Lazada, QR PH, Metrobank, Total, Salary, Balance, MP2, and Gotyme with salary carryover.
                </p>
                {showSeedConfirm && (
                  <div className="mt-2 p-2.5 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-[11px] lg:text-xs font-medium text-slate-700 dark:text-slate-200">
                      Generate 10-month Jan–Oct 2026 starter workbook with balance rollover?
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowSeedConfirm(false)}
                        className="px-2.5 py-1 text-[11px] lg:text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSeedHistory}
                        className="px-3 py-1 text-[11px] lg:text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded cursor-pointer"
                      >
                        Confirm Load
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                    <span className="font-bold text-slate-900 dark:text-slate-100 text-xs lg:text-sm">
                      Download Excel (.xlsx) Template for January to Present
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadXlsxTemplate}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs lg:text-sm font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg shadow-xs cursor-pointer shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download .XLSX Template
                  </button>
                </div>
                <p className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Downloads an Excel workbook with sheets for all months. Fill in your figures directly in WPS Office or Excel and import back in one click!
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 shrink-0">
          <span className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400">
            {totalMonthsCount} month{totalMonthsCount > 1 ? 's' : ''} currently saved in local storage
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs lg:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      <PasswordConfirmModal
        isOpen={Boolean(passwordConfirmRequest)}
        lockMeta={getActiveLockMeta()}
        actionTitle={passwordConfirmRequest?.title || ''}
        actionDescription={passwordConfirmRequest?.description}
        onCancel={() => setPasswordConfirmRequest(null)}
        onConfirm={() => {
          const pending = passwordConfirmRequest;
          setPasswordConfirmRequest(null);
          pending?.run();
        }}
      />

      <ActionMessageModal
        isOpen={Boolean(actionPopup)}
        variant={actionPopup?.variant || 'success'}
        title={actionPopup?.title || ''}
        message={actionPopup?.message || ''}
        detail={actionPopup?.detail}
        onClose={() => setActionPopup(null)}
      />
    </div>
  );
};
