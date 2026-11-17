/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  MonthData,
  RowId,
  CellColumn,
  CustomColumnDef,
  CustomColumnType,
  ActiveTab,
  SalaryBreakdown,
  BudgetRowState,
  UserSecurityProfile,
} from './types/budget';
import {
  loadSavedMonths,
  saveAllMonths,
  getActiveMonthId,
  setActiveMonthId,
  createDefaultMonth,
  createPairedDefaultMonths,
  createPairedBlankMonths,
  createEmptyDefaultMonth,
  isSharedPublicDeployment,
  getDefaultTableTitle,
  ROW_CONFIG,
  INITIAL_ROW_ORDER,
} from './utils/storage';
import { recalculateMonthData } from './utils/computation';
import { evaluateFormulaInput } from './utils/formula';
import { exportMonthToExcel } from './utils/excelService';
import { formatPHP } from './utils/currency';
import { extractMonthKey } from './utils/monthGrouping';
import {
  getSecurityProfile,
  saveSecurityProfile,
  getCloudBackups,
  createGoogleCloudBackup,
} from './services/securityService';
import { auth } from './firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';

import { TopNav } from './components/TopNav';
import { BudgetTable } from './components/BudgetTable';
import { MonthSheetTabs } from './components/MonthSheetTabs';
import { DataVisualization } from './components/DataVisualization';
import { MonthlySummary } from './components/MonthlySummary';
import { CellNotePopover } from './components/CellNotePopover';
import { SalaryConfigModal } from './components/SalaryConfigModal';
import { NewMonthModal } from './components/NewMonthModal';
import { ImportExportModal } from './components/ImportExportModal';
import { SettingsModal } from './components/SettingsModal';
import { SyncOfflineModal } from './components/SyncOfflineModal';
import { ChangeLogSheet } from './components/ChangeLogSheet';
import { addChangeLog, replaceChangeLogs } from './utils/changeLogService';
import { useAutoBackup } from './hooks/useAutoBackup';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { addOfflineChange, replaceOfflineChanges } from './utils/offlineQueue';
import {
  isFolderAutoSyncArmed,
  writeSnapshotToConnectedFolder,
  type LoadedFolderDatabase,
} from './utils/localFolderDb';
import { downloadBudgetPdf, printBudgetDirectly } from './utils/printService';
import {
  getEffectiveColumnOrderForMonth,
  getEffectiveRowMergeRanges,
  findMergeRangeCoveringColumn,
  isMonthlyKinsenasMerged,
  mergeRowColumns,
  unmergeRowCells,
} from './utils/cellMerge';
import { getStoredTheme, toggleStoredTheme, ThemeMode } from './utils/theme';
import { UpdateChangesModal, ReleaseNoteEntry } from './components/UpdateChangesModal';
import releaseNotesData from './data/releaseNotes.json';

import {
  Calendar,
  RotateCcw,
  HelpCircle,
  TrendingUp,
  CreditCard,
  ArrowUpDown,
  FileSpreadsheet,
  ShieldCheck,
  Cloud,
  Settings,
  ChevronDown,
  Plus,
  Layers,
  Check,
  AlertCircle,
  Trash2,
} from 'lucide-react';

const SEEN_RELEASE_BUILD_KEY = 'pesobudget_seen_build_id_v1';
const CURRENT_BUILD_ID =
  typeof __PESOBUDGET_BUILD_ID__ !== 'undefined' ? __PESOBUDGET_BUILD_ID__ : 'dev-local';
const RELEASE_NOTES: ReleaseNoteEntry[] =
  typeof __PESOBUDGET_RELEASE_HISTORY__ !== 'undefined' &&
  Array.isArray(__PESOBUDGET_RELEASE_HISTORY__) &&
  __PESOBUDGET_RELEASE_HISTORY__.length > 0
    ? (__PESOBUDGET_RELEASE_HISTORY__ as ReleaseNoteEntry[])
    : Array.isArray(releaseNotesData)
    ? (releaseNotesData as ReleaseNoteEntry[])
    : [];
const LATEST_RELEASE: ReleaseNoteEntry = RELEASE_NOTES[0] || {
  version: '1.0.0',
  date: new Date().toISOString().slice(0, 10),
  title: 'Application Update',
  changes: ['Updated features and improvements.'],
};

export default function App() {
  const [months, setMonths] = useState<Record<string, MonthData>>(() => loadSavedMonths());
  const [activeMonthId, setActiveMonthIdState] = useState<string>(() => getActiveMonthId());
  const [activeTab, setActiveTab] = useState<ActiveTab>('sheet');
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());

  const [updateNoticeState, setUpdateNoticeState] = useState<{
    buildId: string;
    release: ReleaseNoteEntry;
    history?: ReleaseNoteEntry[];
    requiresReload: boolean;
  } | null>(() => {
    if (typeof window === 'undefined' || !isSharedPublicDeployment()) return null;
    try {
      const seenBuildId = localStorage.getItem(SEEN_RELEASE_BUILD_KEY);
      if (seenBuildId !== CURRENT_BUILD_ID) {
        return {
          buildId: CURRENT_BUILD_ID,
          release: LATEST_RELEASE,
          history: RELEASE_NOTES,
          requiresReload: false,
        };
      }
    } catch {
      // ignore storage read errors
    }
    return null;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !isSharedPublicDeployment()) return;

    let cancelled = false;
    const checkPublishedVersion = async () => {
      if (!navigator.onLine) return;
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          buildId?: string;
          buildTime?: string;
          version?: string;
          date?: string;
          timeLabel?: string;
          title?: string;
          changes?: string[];
          history?: ReleaseNoteEntry[];
        };
        if (cancelled || !data?.buildId) return;

        let seenBuildId: string | null = null;
        try {
          seenBuildId = localStorage.getItem(SEEN_RELEASE_BUILD_KEY);
        } catch {
          // ignore
        }

        if (Array.isArray(data.history) && data.history.length > 0) {
          window.__PESOBUDGET_LIVE_RELEASES__ = data.history;
        }

        if (data.buildId !== CURRENT_BUILD_ID && seenBuildId !== data.buildId) {
          const liveHistory =
            Array.isArray(data.history) && data.history.length > 0 ? data.history : RELEASE_NOTES;
          setUpdateNoticeState({
            buildId: data.buildId,
            release: {
              buildId: data.buildId,
              buildTime: data.buildTime,
              version: data.version || LATEST_RELEASE.version,
              date: data.date || LATEST_RELEASE.date,
              timeLabel: data.timeLabel,
              title: data.title || LATEST_RELEASE.title,
              changes:
                Array.isArray(data.changes) && data.changes.length > 0
                  ? data.changes
                  : LATEST_RELEASE.changes,
            },
            history: liveHistory,
            requiresReload: true,
          });
        }
      } catch {
        // ignore transient offline/network failures
      }
    };

    const initialTimer = setTimeout(() => {
      void checkPublishedVersion();
    }, 1500);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkPublishedVersion();
      }
    };
    const onFocus = () => {
      void checkPublishedVersion();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = setInterval(() => {
      void checkPublishedVersion();
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, []);

  const handleConfirmUpdateOk = useCallback(async () => {
    if (!updateNoticeState) return;
    const { buildId, requiresReload } = updateNoticeState;
    try {
      localStorage.setItem(SEEN_RELEASE_BUILD_KEY, buildId);
    } catch {
      // ignore storage quota errors
    }
    setUpdateNoticeState(null);

    if (requiresReload) {
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(
            keys
              .filter((k) => k.startsWith('pesobudget-app-runtime-'))
              .map((k) => caches.delete(k))
          );
        }
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.update().catch(() => undefined)));
        }
      } catch {
        // ignore cache cleanup errors
      }
      window.location.reload();
    }
  }, [updateNoticeState]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => toggleStoredTheme(prev));
  }, []);

  // Currently active cell for Formula Bar
  const [activeCell, setActiveCell] = useState<{
    rowId: RowId;
    rowLabel: string;
    column: CellColumn;
    currentInput: string;
    note?: string;
    isMerged?: boolean;
  } | null>(null);

  // Note popover state
  const [noteTarget, setNoteTarget] = useState<{
    rowId: RowId;
    column: CellColumn;
    title: string;
    initialNote: string;
  } | null>(null);

  // Modals & Security
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [isNewMonthModalOpen, setIsNewMonthModalOpen] = useState(false);
  const [isImportExportModalOpen, setIsImportExportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [securityProfile, setSecurityProfile] = useState<UserSecurityProfile>(() => getSecurityProfile());
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const [connectedDataFolder, setConnectedDataFolder] = useState<string | null>(null);

  // Listen to Firebase Auth state (Google Sign-In across sessions; skipped when opened directly via file://)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
      setIsAuthReady(true);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setIsAuthReady(true);

      if (user) {
        setSecurityProfile((prev) => {
          const updated: UserSecurityProfile = {
            ...prev,
            isAuthenticated: true,
            email: user.email || '',
            name: user.displayName || (user.email ? user.email.split('@')[0] : 'Google User'),
            picture: user.photoURL || prev.picture || '',
            isSessionUnlocked: true,
            isEmailVerified: user.emailVerified,
            backupSyncStatus: 'synced',
          };
          saveSecurityProfile(updated);
          return updated;
        });
      } else {
        setSecurityProfile((prev) => {
          const updated: UserSecurityProfile = {
            ...prev,
            isAuthenticated: false,
            email: '',
            name: '',
            picture: '',
            isSessionUnlocked: true,
            isEmailVerified: false,
            backupSyncStatus: 'idle',
          };
          saveSecurityProfile(updated);
          return updated;
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // Real-time network status & offline queue tracking
  const {
    isOnline,
    simulateOffline,
    toggleSimulateOffline,
    offlineChanges,
    hasOfflineChanges,
    offlineCount,
    justReconnected,
    clearReconnectedFlag,
  } = useNetworkStatus();

  // Automatic modern popup when transitioning back online with pending offline changes
  const hasAutoOpenedForBatchRef = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      // While offline, reset flag so that the moment internet returns, popup triggers automatically
      hasAutoOpenedForBatchRef.current = false;
    } else if (isOnline && hasOfflineChanges) {
      if (!hasAutoOpenedForBatchRef.current || justReconnected) {
        setIsSyncModalOpen(true);
        hasAutoOpenedForBatchRef.current = true;
        clearReconnectedFlag();
      }
    }
  }, [isOnline, hasOfflineChanges, justReconnected, clearReconnectedFlag]);

  const handleRestoreMonthsFromSync = useCallback((restored: Record<string, MonthData>) => {
    setMonths(restored);
    saveAllMonths(restored);
    const firstId = Object.keys(restored)[0];
    if (firstId) {
      setActiveMonthIdState(firstId);
      setActiveMonthId(firstId);
    }
  }, []);

  // Automated continuous Firebase Cloud sync and auto-restore hook
  const { autoSyncNotice, clearNotice } = useAutoBackup({
    months,
    securityProfile,
    firebaseUid: firebaseUser?.uid || null,
    isAuthReady,
    isOnline,
    onUpdateSecurityProfile: (updated) => {
      setSecurityProfile(updated);
      saveSecurityProfile(updated);
    },
    onRestoreMonths: handleRestoreMonthsFromSync,
  });

  // Ensure current month exists or fallback
  const currentMonth: MonthData =
    months[activeMonthId] ||
    Object.values(months)[0] ||
    (isSharedPublicDeployment()
      ? Object.values(createPairedBlankMonths())[0]
      : createDefaultMonth());

  // Current active calendar year filter (e.g. 2024, 2025, 2026, 2027)
  const currentSheetYear = currentMonth.year || extractMonthKey(currentMonth).year || 2026;
  const [selectedYear, setSelectedYear] = useState<number>(() => currentSheetYear);
  const [noDataPopupYear, setNoDataPopupYear] = useState<number | null>(null);

  const MANAGED_YEARS_STORAGE_KEY = 'pesobudget_managed_years_v1';
  const [managedYears, setManagedYears] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem(MANAGED_YEARS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid = parsed
            .map((y) => Number(y))
            .filter((y) => Number.isInteger(y) && y >= 2000 && y <= 2100);
          if (valid.length > 0) {
            return Array.from(new Set(valid)).sort((a, b) => a - b);
          }
        }
      }
    } catch {
      // ignore invalid storage
    }
    return Array.from(new Set([2024, 2025, 2026, 2027, new Date().getFullYear()])).sort((a, b) => a - b);
  });

  const saveManagedYears = useCallback((years: number[]) => {
    const uniqueSorted = Array.from(
      new Set(years.filter((y) => Number.isInteger(y) && y >= 2000 && y <= 2100))
    ).sort((a, b) => a - b);
    setManagedYears(uniqueSorted);
    try {
      localStorage.setItem(MANAGED_YEARS_STORAGE_KEY, JSON.stringify(uniqueSorted));
    } catch {
      // ignore storage quota errors
    }
    return uniqueSorted;
  }, []);

  // Collect all unique calendar years available in the app
  const availableYears = useMemo(() => {
    const yearSet = new Set<number>(managedYears);
    Object.values(months).forEach((m) => {
      const yr = m.year || extractMonthKey(m).year;
      if (yr && yr >= 2000 && yr <= 2100) yearSet.add(yr);
    });
    return Array.from(yearSet).sort((a, b) => a - b);
  }, [managedYears, months]);

  // Auto-save organized JSON files to connected PesoBudget/data/ folder on edits
  useEffect(() => {
    if (!connectedDataFolder || !isFolderAutoSyncArmed()) return;
    const timer = setTimeout(() => {
      void writeSnapshotToConnectedFolder({
        months,
        years: availableYears,
        securityProfile,
        activeMonthId,
      }).catch((err) => {
        console.warn('Could not sync to connected data/ folder:', err);
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [connectedDataFolder, months, availableYears, securityProfile, activeMonthId]);

  // Loading screen state for modern year switching (5 seconds as requested)
  const [isLoadingYear, setIsLoadingYear] = useState(false);
  const [loadingYearTarget, setLoadingYearTarget] = useState<number>(() => currentSheetYear);
  const [loadingProgress, setLoadingProgress] = useState(15);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isYearDropdownOpen, setIsYearDropdownOpen] = useState(false);
  const [newYearInput, setNewYearInput] = useState('');
  const [yearActionError, setYearActionError] = useState<string | null>(null);
  const [confirmDeleteYear, setConfirmDeleteYear] = useState<number | null>(null);
  const yearDropdownRef = useRef<HTMLDivElement>(null);

  // Close Year dropdown menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(e.target as Node)) {
        setIsYearDropdownOpen(false);
        setYearActionError(null);
        setConfirmDeleteYear(null);
      }
    };
    if (isYearDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isYearDropdownOpen]);

  // When user selects a year from dropdown beside Add Sheet:
  // Shows a 5-second modern loading screen and loads the sheets under the selected year
  const handleSelectYear = (newYear: number) => {
    setIsYearDropdownOpen(false);
    setIsLoadingYear(true);
    setLoadingYearTarget(newYear);
    setLoadingProgress(15);
    setLoadingMessage(`Initializing ${newYear} fiscal sheets and cutoffs...`);

    // Progress stage 1: 1.2s
    setTimeout(() => {
      setLoadingProgress(40);
      setLoadingMessage('Refreshing data table & recalculating monthly cutoffs...');
    }, 1200);

    // Progress stage 2: 2.5s
    setTimeout(() => {
      setLoadingProgress(70);
      setLoadingMessage('Syncing formula balances, Metrobank ATM cash & QR PH...');
    }, 2500);

    // Progress stage 3: 3.8s
    setTimeout(() => {
      setLoadingProgress(92);
      setLoadingMessage('Reconciling Pag-IBIG MP2 and Personal Savings stash...');
    }, 3800);

    // Final completion at 5000ms (5 seconds)
    setTimeout(() => {
      setLoadingProgress(100);
      setLoadingMessage('Data table refreshed successfully!');

      setSelectedYear(newYear);
      // Find sheets that belong to this selected year
      const sheetsInYear = Object.values(months).filter(
        (m) => (m.year || extractMonthKey(m).year) === newYear
      );
      if (sheetsInYear.length > 0) {
        handleSelectMonth(sheetsInYear[0].id);
        setNoDataPopupYear(null);
      } else {
        // No data found for this year: trigger error popup "No Data Found."
        setNoDataPopupYear(newYear);
      }
      setIsLoadingYear(false);
    }, 5000);
  };

  // Filter sheets shown in the bottom tabs dock strictly by selectedYear
  // If a year is empty, returns empty object {} so no sheets or summary from other years are shown
  const displayedMonthsForTabs = useMemo(() => {
    const matched = Object.entries(months).filter(
      ([_, m]) => (m.year || extractMonthKey(m).year) === selectedYear
    );
    return Object.fromEntries(matched);
  }, [months, selectedYear]);

  const hasDataForSelectedYear = useMemo(() => {
    return Object.keys(displayedMonthsForTabs).length > 0;
  }, [displayedMonthsForTabs]);

  // Save changes to localStorage and sync to Google Account when online & logged in
  const persistMonths = useCallback((updated: Record<string, MonthData>) => {
    setMonths(updated);
    saveAllMonths(updated);
    if (isOnline && securityProfile.isAuthenticated && securityProfile.email) {
      try {
        const { updatedProfile } = createGoogleCloudBackup(updated, securityProfile);
        setSecurityProfile(updatedProfile);
        saveSecurityProfile(updatedProfile);
      } catch (e) {
        console.error('Immediate Google sync error:', e);
      }
    }
  }, [isOnline, securityProfile]);

  const handleSelectMonth = (monthId: string) => {
    const target = months[monthId];
    if (target) {
      const yr = target.year || extractMonthKey(target).year;
      if (yr && yr !== selectedYear) {
        setSelectedYear(yr);
      }
    }
    setActiveMonthIdState(monthId);
    setActiveMonthId(monthId);
    setActiveCell(null);
    setActiveTab('sheet');
  };

  useEffect(() => {
    if (activeTab !== 'sheet') {
      setActiveCell(null);
    }
  }, [activeTab]);

  // Update a single cell value or formula
  const handleUpdateCellInput = useCallback(
    (rowId: RowId, column: 'monthly' | 'cutoff15th', rawInput: string) => {
      const evalResult = evaluateFormulaInput(rawInput);
      const targetMonth = months[activeMonthId] || currentMonth;
      const targetRow = targetMonth.rows[rowId];
      if (!targetRow) return;

      const colOrder = getEffectiveColumnOrderForMonth(targetMonth);
      const isRowPairMerged = isMonthlyKinsenasMerged(rowId, targetRow, colOrder);

      let updatedMonth: MonthData;

      if (rowId === 'salary') {
        // When user inputs salary inline: sync both cutoffs if merged, or update clicked cutoff only when unmerged
        const updatedBreakdown = isRowPairMerged
          ? {
              monthly: {
                ...targetMonth.salaryBreakdown.monthly,
                baseSalary: evalResult.value,
              },
              cutoff15th: {
                ...targetMonth.salaryBreakdown.cutoff15th,
                baseSalary: evalResult.value,
              },
            }
          : {
              ...targetMonth.salaryBreakdown,
              [column]: {
                ...targetMonth.salaryBreakdown[column],
                baseSalary: evalResult.value,
              },
            };

        updatedMonth = {
          ...targetMonth,
          salaryBreakdown: updatedBreakdown,
        };
      } else if (isRowPairMerged) {
        // Merged row across Monthly and Kinsenas: update both cells together
        const updatedCell = {
          rawInput,
          value: evalResult.value,
          formula: evalResult.isFormula ? rawInput : undefined,
        };

        const updatedRow = {
          ...targetRow,
          monthly: updatedCell,
          cutoff15th: updatedCell,
        };

        updatedMonth = {
          ...targetMonth,
          rows: {
            ...targetMonth.rows,
            [rowId]: updatedRow,
          },
        };
      } else {
        const updatedCell = {
          ...(column === 'monthly' ? targetRow.monthly : targetRow.cutoff15th),
          rawInput,
          value: evalResult.value,
          formula: evalResult.isFormula ? rawInput : undefined,
        };

        const updatedRow = {
          ...targetRow,
          [column]: updatedCell,
        };

        updatedMonth = {
          ...targetMonth,
          rows: {
            ...targetMonth.rows,
            [rowId]: updatedRow,
          },
        };
      }

      // Recalculate auto-computations (Metrobank, Total, Salary, Balance, Remarks)
      const recalculated = recalculateMonthData(updatedMonth);

      const updatedMonths = {
        ...months,
        [activeMonthId]: recalculated,
      };

      persistMonths(updatedMonths);

      // Log cell edit or formula update to change log
      const prevVal = (column === 'monthly' ? targetRow.monthly.rawInput : targetRow.cutoff15th.rawInput) || '';
      if (prevVal !== rawInput) {
        addChangeLog({
          sheetName: targetMonth.name,
          year: targetMonth.year || selectedYear,
          action: evalResult.isFormula ? 'formula_update' : 'cell_edit',
          actionLabel: evalResult.isFormula ? 'Formula Update' : 'Cell Edit',
          rowLabel: targetRow.label,
          column: column === 'monthly' ? 'Monthly' : '15th Kinsenas',
          oldValue: prevVal,
          newValue: rawInput,
          description: `Updated ${targetRow.label} (${column === 'monthly' ? 'Monthly' : '15th Kinsenas'}) from "${prevVal || '0'}" to "${rawInput}"`,
        });

        // If currently offline, record to offline queue for later sync/upload popup
        if (!isOnline) {
          addOfflineChange({
            action: evalResult.isFormula ? 'formula_update' : 'cell_edit',
            sheetName: targetMonth.name,
            year: targetMonth.year || selectedYear,
            rowLabel: targetRow.label,
            column: column === 'monthly' ? 'Monthly' : '15th Kinsenas',
            oldValue: prevVal || '0',
            newValue: rawInput,
            description: `Updated ${targetRow.label} (${column === 'monthly' ? 'Monthly' : '15th Kinsenas'}) to "${rawInput}"`,
          });
        }
      }

      // Keep active cell in sync
      setActiveCell((prev) => {
        if (prev && prev.rowId === rowId && prev.column === column) {
          return {
            ...prev,
            currentInput: rawInput,
          };
        }
        return prev;
      });
    },
    [months, activeMonthId, currentMonth, persistMonths, selectedYear, isOnline]
  );

  // Update row label (e.g. rename Loan or custom bill)
  const handleUpdateRowLabel = useCallback(
    (rowId: RowId, newLabel: string) => {
      const targetMonth = months[activeMonthId] || currentMonth;
      const targetRow = targetMonth.rows[rowId];
      if (!targetRow) return;

      const updatedMonth: MonthData = {
        ...targetMonth,
        rows: {
          ...targetMonth.rows,
          [rowId]: {
            ...targetRow,
            label: newLabel,
          },
        },
      };

      const updatedMonths = {
        ...months,
        [activeMonthId]: updatedMonth,
      };

      persistMonths(updatedMonths);

      if (targetRow.label !== newLabel) {
        addChangeLog({
          sheetName: targetMonth.name,
          year: targetMonth.year || selectedYear,
          action: 'label_rename',
          actionLabel: 'Label Rename',
          rowLabel: newLabel,
          oldValue: targetRow.label,
          newValue: newLabel,
          description: `Renamed item "${targetRow.label}" to "${newLabel}"`,
        });

        if (!isOnline) {
          addOfflineChange({
            action: 'label_rename',
            sheetName: targetMonth.name,
            year: targetMonth.year || selectedYear,
            rowLabel: newLabel,
            oldValue: targetRow.label,
            newValue: newLabel,
            description: `Renamed item "${targetRow.label}" to "${newLabel}"`,
          });
        }
      }
    },
    [months, activeMonthId, currentMonth, persistMonths, selectedYear, isOnline]
  );

  // Update Sheet Title (e.g. SALARY MONITORING 2026)
  const handleUpdateSheetTitle = useCallback(
    (newTitle: string) => {
      const targetMonth = months[activeMonthId] || currentMonth;
      const updatedMonth: MonthData = {
        ...targetMonth,
        sheetTitle: newTitle,
      };
      const updatedMonths = {
        ...months,
        [activeMonthId]: updatedMonth,
      };
      persistMonths(updatedMonths);
    },
    [months, activeMonthId, currentMonth, persistMonths]
  );

  // Dynamically add another loan line item between House (rent) and Water Bill
  const handleAddLoanRow = useCallback(() => {
    const targetMonth = months[activeMonthId] || currentMonth;
    const newLoanId = `loan_${Date.now()}`;
    const newLoanRow: BudgetRowState = {
      id: newLoanId,
      label: 'Loan',
      monthly: { rawInput: '', value: 0 },
      cutoff15th: { rawInput: '', value: 0 },
      remarks: 'OK',
      rowType: 'expense',
      isCustomRow: true,
      isAutoMetrobank: true,
    };

    const currentOrder = targetMonth.rowOrder || INITIAL_ROW_ORDER;
    // Find last loan index or house index to insert right after
    let insertIndex = -1;
    for (let i = 0; i < currentOrder.length; i++) {
      if (currentOrder[i] === 'loan' || currentOrder[i].startsWith('loan_')) {
        insertIndex = i;
      }
    }
    if (insertIndex === -1) {
      insertIndex = currentOrder.indexOf('rent');
    }
    if (insertIndex === -1) {
      insertIndex = 0;
    }

    const newOrder = [...currentOrder];
    newOrder.splice(insertIndex + 1, 0, newLoanId);

    const updatedMonth: MonthData = {
      ...targetMonth,
      rows: {
        ...targetMonth.rows,
        [newLoanId]: newLoanRow,
      },
      rowOrder: newOrder,
    };

    const recalculated = recalculateMonthData(updatedMonth);
    const updatedMonths = {
      ...months,
      [activeMonthId]: recalculated,
    };
    persistMonths(updatedMonths);
  }, [months, activeMonthId, currentMonth, persistMonths]);

  // Dynamically add a custom payment line item (e.g. WiFi, Insurance, etc.)
  const handleAddPaymentRow = useCallback(() => {
    const targetMonth = months[activeMonthId] || currentMonth;
    const newPaymentId = `payment_${Date.now()}`;
    const newPaymentRow: BudgetRowState = {
      id: newPaymentId,
      label: 'New Payment',
      monthly: { rawInput: '', value: 0 },
      cutoff15th: { rawInput: '', value: 0 },
      remarks: 'OK',
      rowType: 'expense',
      isCustomRow: true,
      isAutoMetrobank: true,
    };

    const currentOrder = targetMonth.rowOrder || INITIAL_ROW_ORDER;
    let insertIndex = -1;
    for (let i = 0; i < currentOrder.length; i++) {
      if (currentOrder[i] === 'loan' || currentOrder[i].startsWith('loan_')) {
        insertIndex = i;
      }
    }
    if (insertIndex === -1) insertIndex = currentOrder.indexOf('rent');
    if (insertIndex === -1) insertIndex = 0;

    const newOrder = [...currentOrder];
    newOrder.splice(insertIndex + 1, 0, newPaymentId);

    const updatedMonth: MonthData = {
      ...targetMonth,
      rows: {
        ...targetMonth.rows,
        [newPaymentId]: newPaymentRow,
      },
      rowOrder: newOrder,
    };

    const recalculated = recalculateMonthData(updatedMonth);
    const updatedMonths = {
      ...months,
      [activeMonthId]: recalculated,
    };
    persistMonths(updatedMonths);
  }, [months, activeMonthId, currentMonth, persistMonths]);

  // Dynamically add a custom payment line item with name, optional initial amounts, and optional insert position
  const handleAddNewPaymentItem = useCallback(
    (label: string, monthlyVal: number = 0, kinsenasVal: number = 0, insertIndex?: number) => {
      const targetMonth = months[activeMonthId] || currentMonth;
      const newPaymentId = `payment_${Date.now()}`;
      const newPaymentRow: BudgetRowState = {
        id: newPaymentId,
        label: label.trim() || 'New Payment',
        monthly: { rawInput: monthlyVal > 0 ? String(monthlyVal) : '', value: monthlyVal },
        cutoff15th: { rawInput: kinsenasVal > 0 ? String(kinsenasVal) : '', value: kinsenasVal },
        remarks: 'OK',
        rowType: 'expense',
        isCustomRow: true,
        isAutoMetrobank: true,
      };

      const currentOrder = targetMonth.rowOrder || INITIAL_ROW_ORDER;
      let resolvedIndex: number;
      if (typeof insertIndex === 'number' && !Number.isNaN(insertIndex)) {
        resolvedIndex = Math.max(0, Math.min(currentOrder.length, insertIndex));
      } else {
        // Default: Insert before qr_ph if present, otherwise before total
        resolvedIndex = currentOrder.indexOf('qr_ph');
        if (resolvedIndex === -1) resolvedIndex = currentOrder.indexOf('total');
        if (resolvedIndex === -1) resolvedIndex = currentOrder.length;
      }

      const newOrder = [...currentOrder];
      newOrder.splice(resolvedIndex, 0, newPaymentId);

      const updatedMonth: MonthData = {
        ...targetMonth,
        rows: {
          ...targetMonth.rows,
          [newPaymentId]: newPaymentRow,
        },
        rowOrder: newOrder,
      };

      const recalculated = recalculateMonthData(updatedMonth);
      const updatedMonths = {
        ...months,
        [activeMonthId]: recalculated,
      };
      persistMonths(updatedMonths);

      addChangeLog({
        sheetName: targetMonth.name,
        year: targetMonth.year || selectedYear,
        action: 'item_add',
        actionLabel: 'Item Added',
        rowLabel: label.trim() || 'New Payment',
        newValue: `Monthly: ₱${monthlyVal.toFixed(2)}, 15th: ₱${kinsenasVal.toFixed(2)}`,
        description: `Added new payment line item "${label.trim() || 'New Payment'}"`,
      });

      if (!isOnline) {
        addOfflineChange({
          action: 'item_add',
          sheetName: targetMonth.name,
          year: targetMonth.year || selectedYear,
          rowLabel: label.trim() || 'New Payment',
          newValue: `Monthly: ₱${monthlyVal.toFixed(2)}, 15th: ₱${kinsenasVal.toFixed(2)}`,
          description: `Added new payment line item "${label.trim() || 'New Payment'}"`,
        });
      }
    },
    [months, activeMonthId, currentMonth, persistMonths, selectedYear, isOnline]
  );

  // Delete any removable line item under payment (excluding core rows: qr_ph, metrobank, total, salary, balance, mp2, gotyme)
  const handleDeleteRow = useCallback(
    (rowId: RowId) => {
      const EXCLUDED_IDS = ['qr_ph', 'metrobank', 'total', 'salary', 'balance', 'mp2', 'gotyme'];
      if (EXCLUDED_IDS.includes(rowId)) return;

      const targetMonth = months[activeMonthId] || currentMonth;
      const targetRow = targetMonth.rows[rowId];
      const itemLabel = targetRow?.label || rowId;

      const newRows = { ...targetMonth.rows };
      delete newRows[rowId];

      const currentOrder = targetMonth.rowOrder || INITIAL_ROW_ORDER;
      const newOrder = currentOrder.filter((id) => id !== rowId);

      const updatedMonth: MonthData = {
        ...targetMonth,
        rows: newRows,
        rowOrder: newOrder,
      };

      const recalculated = recalculateMonthData(updatedMonth);
      const updatedMonths = {
        ...months,
        [activeMonthId]: recalculated,
      };
      persistMonths(updatedMonths);

      addChangeLog({
        sheetName: targetMonth.name,
        year: targetMonth.year || selectedYear,
        action: 'item_remove',
        actionLabel: 'Item Removed',
        rowLabel: itemLabel,
        description: `Removed payment line item "${itemLabel}"`,
      });

      if (!isOnline) {
        addOfflineChange({
          action: 'item_remove',
          sheetName: targetMonth.name,
          year: targetMonth.year || selectedYear,
          rowLabel: itemLabel,
          description: `Removed payment line item "${itemLabel}"`,
        });
      }
    },
    [months, activeMonthId, currentMonth, persistMonths, selectedYear, isOnline]
  );

  // Update Column Header Title (PAYMENTS, MONTHLY, KINSENAS, REMARKS)
  const handleUpdateColumnHeader = useCallback(
    (col: 'payments' | 'monthly' | 'cutoff15th' | 'remarks', newTitle: string) => {
      const targetMonth = months[activeMonthId] || currentMonth;
      const updatedMonth: MonthData = {
        ...targetMonth,
        columnHeaders: {
          ...(targetMonth.columnHeaders || {}),
          [col]: newTitle.trim(),
        },
      };
      const updatedMonths = {
        ...months,
        [activeMonthId]: updatedMonth,
      };
      persistMonths(updatedMonths);
    },
    [months, activeMonthId, currentMonth, persistMonths]
  );

  // Update a cell inside a user-added custom column
  const handleUpdateCustomCellInput = useCallback(
    (rowId: RowId, colId: string, rawInput: string, colType: CustomColumnType) => {
      const targetMonth = months[activeMonthId] || currentMonth;
      const targetRow = targetMonth.rows[rowId];
      if (!targetRow) return;

      const evalResult = colType === 'currency'
        ? evaluateFormulaInput(rawInput)
        : { value: 0, isValid: true, isFormula: false };

      const prevCell = targetRow.customCells?.[colId] || { value: 0, rawInput: '' };
      const prevVal = prevCell.rawInput || '';

      const updatedRow: BudgetRowState = {
        ...targetRow,
        customCells: {
          ...(targetRow.customCells || {}),
          [colId]: {
            ...prevCell,
            rawInput,
            value: colType === 'currency' ? evalResult.value : 0,
            formula: colType === 'currency' && evalResult.isFormula ? rawInput : undefined,
          },
        },
      };

      const updatedMonth: MonthData = {
        ...targetMonth,
        rows: {
          ...targetMonth.rows,
          [rowId]: updatedRow,
        },
        updatedAt: new Date().toISOString(),
      };

      const updatedMonths = {
        ...months,
        [activeMonthId]: updatedMonth,
      };

      persistMonths(updatedMonths);

      if (prevVal !== rawInput) {
        const colLabel =
          targetMonth.columnHeaders?.customColumns?.find((c) => c.id === colId)?.label || colId;
        addChangeLog({
          sheetName: targetMonth.name,
          year: targetMonth.year || selectedYear,
          action: colType === 'currency' && evalResult.isFormula ? 'formula_update' : 'cell_edit',
          actionLabel: colType === 'currency' && evalResult.isFormula ? 'Formula Update' : 'Cell Edit',
          rowLabel: targetRow.label,
          column: colLabel,
          oldValue: prevVal,
          newValue: rawInput,
          description: `Updated ${targetRow.label} (${colLabel}) from "${prevVal || 'empty'}" to "${rawInput}"`,
        });

        if (!isOnline) {
          addOfflineChange({
            action: colType === 'currency' && evalResult.isFormula ? 'formula_update' : 'cell_edit',
            sheetName: targetMonth.name,
            year: targetMonth.year || selectedYear,
            rowLabel: targetRow.label,
            column: colLabel,
            oldValue: prevVal || '0',
            newValue: rawInput,
            description: `Updated ${targetRow.label} (${colLabel}) to "${rawInput}"`,
          });
        }
      }

      setActiveCell((prev) => {
        if (prev && prev.rowId === rowId && prev.column === colId) {
          return {
            ...prev,
            currentInput: rawInput,
          };
        }
        return prev;
      });
    },
    [months, activeMonthId, currentMonth, persistMonths, selectedYear, isOnline]
  );

  // Add a new custom column at a user-selected position
  const handleAddColumn = useCallback(
    (label: string, colType: CustomColumnType, insertIndex: number) => {
      const cleanLabel = label.trim();
      if (!cleanLabel) return;

      const targetMonth = months[activeMonthId] || currentMonth;
      const existingCustom = targetMonth.columnHeaders?.customColumns || [];
      const currentOrder =
        targetMonth.columnHeaders?.columnOrder && targetMonth.columnHeaders.columnOrder.length > 0
          ? [...targetMonth.columnHeaders.columnOrder]
          : ['payments', 'monthly', 'cutoff15th', 'remarks'];

      const newColId = `col_${Date.now()}`;
      const newColDef: CustomColumnDef = {
        id: newColId,
        label: cleanLabel,
        type: colType,
      };

      const clampedIndex = Math.max(0, Math.min(currentOrder.length, insertIndex));
      const nextOrder = [...currentOrder];
      nextOrder.splice(clampedIndex, 0, newColId);

      const updatedMonth: MonthData = {
        ...targetMonth,
        columnHeaders: {
          ...(targetMonth.columnHeaders || {}),
          customColumns: [...existingCustom, newColDef],
          columnOrder: nextOrder,
        },
        updatedAt: new Date().toISOString(),
      };

      const updatedMonths = {
        ...months,
        [activeMonthId]: updatedMonth,
      };
      persistMonths(updatedMonths);

      addChangeLog({
        sheetName: targetMonth.name,
        year: targetMonth.year || selectedYear,
        action: 'item_add',
        actionLabel: 'Column Added',
        column: cleanLabel,
        newValue: cleanLabel,
        description: `Added new column "${cleanLabel}" (${colType})`,
      });

      if (!isOnline) {
        addOfflineChange({
          action: 'item_add',
          sheetName: targetMonth.name,
          year: targetMonth.year || selectedYear,
          column: cleanLabel,
          newValue: cleanLabel,
          description: `Added new column "${cleanLabel}"`,
        });
      }
    },
    [months, activeMonthId, currentMonth, persistMonths, selectedYear, isOnline]
  );

  // Remove a column from the sheet (PAYMENTS column is protected)
  const handleRemoveColumn = useCallback(
    (colId: string) => {
      if (colId === 'payments') return;

      const targetMonth = months[activeMonthId] || currentMonth;
      const existingCustom = targetMonth.columnHeaders?.customColumns || [];
      const currentOrder =
        targetMonth.columnHeaders?.columnOrder && targetMonth.columnHeaders.columnOrder.length > 0
          ? [...targetMonth.columnHeaders.columnOrder]
          : ['payments', 'monthly', 'cutoff15th', 'remarks'];

      const removedCustom = existingCustom.find((c) => c.id === colId);
      const removedLabel =
        removedCustom?.label ||
        (colId === 'monthly'
          ? targetMonth.columnHeaders?.monthly || 'MONTHLY'
          : colId === 'cutoff15th'
          ? targetMonth.columnHeaders?.cutoff15th || 'KINSENAS'
          : colId === 'remarks'
          ? targetMonth.columnHeaders?.remarks || 'REMARKS'
          : colId);

      const nextOrder = currentOrder.filter((id) => id !== colId);
      const nextCustom = existingCustom.filter((c) => c.id !== colId);

      let nextRows = targetMonth.rows;
      if (removedCustom) {
        nextRows = { ...targetMonth.rows };
        for (const rId of Object.keys(nextRows)) {
          const row = nextRows[rId];
          if (row?.customCells && colId in row.customCells) {
            const updatedCustomCells = { ...row.customCells };
            delete updatedCustomCells[colId];
            nextRows[rId] = {
              ...row,
              customCells: Object.keys(updatedCustomCells).length > 0 ? updatedCustomCells : undefined,
            };
          }
        }
      }

      const updatedMonth: MonthData = {
        ...targetMonth,
        rows: nextRows,
        columnHeaders: {
          ...(targetMonth.columnHeaders || {}),
          customColumns: nextCustom,
          columnOrder: nextOrder,
        },
        updatedAt: new Date().toISOString(),
      };

      const updatedMonths = {
        ...months,
        [activeMonthId]: updatedMonth,
      };
      persistMonths(updatedMonths);

      setActiveCell((prev) => (prev && prev.column === colId ? null : prev));

      addChangeLog({
        sheetName: targetMonth.name,
        year: targetMonth.year || selectedYear,
        action: 'item_remove',
        actionLabel: 'Column Removed',
        column: removedLabel,
        oldValue: removedLabel,
        description: `Removed column "${removedLabel}"`,
      });

      if (!isOnline) {
        addOfflineChange({
          action: 'item_remove',
          sheetName: targetMonth.name,
          year: targetMonth.year || selectedYear,
          column: removedLabel,
          oldValue: removedLabel,
          description: `Removed column "${removedLabel}"`,
        });
      }
    },
    [months, activeMonthId, currentMonth, persistMonths, selectedYear, isOnline]
  );

  // Restore any hidden standard columns while preserving existing custom columns
  const handleRestoreStandardColumns = useCallback(() => {
    const targetMonth = months[activeMonthId] || currentMonth;
    const currentOrder =
      targetMonth.columnHeaders?.columnOrder && targetMonth.columnHeaders.columnOrder.length > 0
        ? [...targetMonth.columnHeaders.columnOrder]
        : ['payments', 'monthly', 'cutoff15th', 'remarks'];

    const defaults = ['payments', 'monthly', 'cutoff15th', 'remarks'];
    const restoredOrder = [...currentOrder];
    for (const defCol of defaults) {
      if (!restoredOrder.includes(defCol)) {
        if (defCol === 'payments') {
          restoredOrder.unshift('payments');
        } else {
          const idx = defaults.indexOf(defCol);
          const prevDefault = defaults[idx - 1];
          const prevPos = restoredOrder.indexOf(prevDefault);
          restoredOrder.splice(prevPos !== -1 ? prevPos + 1 : restoredOrder.length, 0, defCol);
        }
      }
    }

    const updatedMonth: MonthData = {
      ...targetMonth,
      columnHeaders: {
        ...(targetMonth.columnHeaders || {}),
        columnOrder: restoredOrder,
      },
      updatedAt: new Date().toISOString(),
    };

    const updatedMonths = {
      ...months,
      [activeMonthId]: updatedMonth,
    };
    persistMonths(updatedMonths);
  }, [months, activeMonthId, currentMonth, persistMonths]);

  // Rename a custom column header
  const handleUpdateCustomColumnLabel = useCallback(
    (colId: string, newTitle: string) => {
      const clean = newTitle.trim();
      if (!clean) return;
      const targetMonth = months[activeMonthId] || currentMonth;
      const existingCustom = targetMonth.columnHeaders?.customColumns || [];
      const nextCustom = existingCustom.map((c) =>
        c.id === colId ? { ...c, label: clean } : c
      );

      const updatedMonth: MonthData = {
        ...targetMonth,
        columnHeaders: {
          ...(targetMonth.columnHeaders || {}),
          customColumns: nextCustom,
        },
        updatedAt: new Date().toISOString(),
      };

      const updatedMonths = {
        ...months,
        [activeMonthId]: updatedMonth,
      };
      persistMonths(updatedMonths);
    },
    [months, activeMonthId, currentMonth, persistMonths]
  );

  // Delete a custom added line item
  const handleDeleteCustomRow = useCallback(
    (rowId: RowId) => {
      handleDeleteRow(rowId);
    },
    [handleDeleteRow]
  );

  // Update Remarks column
  const handleUpdateRemarks = useCallback(
    (rowId: RowId, remarksValue: string) => {
      const targetMonth = months[activeMonthId] || currentMonth;
      const targetRow = targetMonth.rows[rowId];
      if (!targetRow) return;

      const oldRemarks = targetRow.remarks || '';

      const updatedRow = {
        ...targetRow,
        remarks: remarksValue,
      };

      const updatedMonth: MonthData = {
        ...targetMonth,
        rows: {
          ...targetMonth.rows,
          [rowId]: updatedRow,
        },
      };

      const recalculated = recalculateMonthData(updatedMonth);

      const updatedMonths = {
        ...months,
        [activeMonthId]: recalculated,
      };

      persistMonths(updatedMonths);

      if (oldRemarks !== remarksValue) {
        addChangeLog({
          sheetName: targetMonth.name,
          year: targetMonth.year || selectedYear,
          action: 'remarks_change',
          actionLabel: 'Remarks Change',
          rowLabel: targetRow.label,
          column: 'Remarks',
          oldValue: oldRemarks,
          newValue: remarksValue,
          description: `Updated remarks for "${targetRow.label}" from "${oldRemarks}" to "${remarksValue}"`,
        });

        if (!isOnline) {
          addOfflineChange({
            action: 'remarks_change',
            sheetName: targetMonth.name,
            year: targetMonth.year || selectedYear,
            rowLabel: targetRow.label,
            column: 'Remarks',
            oldValue: oldRemarks,
            newValue: remarksValue,
            description: `Updated remarks for "${targetRow.label}" to "${remarksValue}"`,
          });
        }
      }

      setActiveCell((prev) => {
        if (prev && prev.rowId === rowId && prev.column === 'remarks') {
          return {
            ...prev,
            currentInput: remarksValue,
          };
        }
        return prev;
      });
    },
    [months, activeMonthId, currentMonth, persistMonths, selectedYear, isOnline]
  );

  // Merge contiguous cells across columns within a row
  const handleMergeRowCells = useCallback(
    (rowId: RowId, startCol: CellColumn, endCol: CellColumn) => {
      const targetMonth = months[activeMonthId] || currentMonth;
      const targetRow = targetMonth.rows[rowId];
      if (!targetRow) return;

      const colOrder = getEffectiveColumnOrderForMonth(targetMonth);
      const mergedRow = mergeRowColumns(rowId, targetRow, startCol, endCol, colOrder);

      const updatedMonth: MonthData = {
        ...targetMonth,
        rows: {
          ...targetMonth.rows,
          [rowId]: mergedRow,
        },
        updatedAt: new Date().toISOString(),
      };

      const recalculated = recalculateMonthData(updatedMonth);
      persistMonths({
        ...months,
        [activeMonthId]: recalculated,
      });
      setActiveCell(null);

      const getColTitle = (c: string) =>
        c === 'monthly'
          ? targetMonth.columnHeaders?.monthly || 'Monthly'
          : c === 'cutoff15th'
          ? targetMonth.columnHeaders?.cutoff15th || 'Kinsenas'
          : c === 'remarks'
          ? targetMonth.columnHeaders?.remarks || 'Remarks'
          : targetMonth.columnHeaders?.customColumns?.find((x) => x.id === c)?.label || c;

      addChangeLog({
        sheetName: targetMonth.name,
        year: targetMonth.year || selectedYear,
        action: 'cell_edit',
        actionLabel: 'Cells Merged',
        rowLabel: targetRow.label,
        column: `${getColTitle(startCol)} + ${getColTitle(endCol)}`,
        description: `Merged cells in "${targetRow.label}" from ${getColTitle(startCol)} to ${getColTitle(endCol)}`,
      });

      if (!isOnline) {
        addOfflineChange({
          action: 'cell_edit',
          sheetName: targetMonth.name,
          year: targetMonth.year || selectedYear,
          rowLabel: targetRow.label,
          column: `${getColTitle(startCol)} + ${getColTitle(endCol)}`,
          description: `Merged cells in "${targetRow.label}"`,
        });
      }
    },
    [months, activeMonthId, currentMonth, persistMonths, selectedYear, isOnline]
  );

  // Unmerge previously merged cells within a row
  const handleUnmergeRowCells = useCallback(
    (rowId: RowId, targetCol: CellColumn) => {
      const targetMonth = months[activeMonthId] || currentMonth;
      const targetRow = targetMonth.rows[rowId];
      if (!targetRow) return;

      const colOrder = getEffectiveColumnOrderForMonth(targetMonth);
      const unmergedRow = unmergeRowCells(rowId, targetRow, targetCol, colOrder);

      const updatedMonth: MonthData = {
        ...targetMonth,
        rows: {
          ...targetMonth.rows,
          [rowId]: unmergedRow,
        },
        updatedAt: new Date().toISOString(),
      };

      const recalculated = recalculateMonthData(updatedMonth);
      persistMonths({
        ...months,
        [activeMonthId]: recalculated,
      });
      setActiveCell(null);

      addChangeLog({
        sheetName: targetMonth.name,
        year: targetMonth.year || selectedYear,
        action: 'cell_edit',
        actionLabel: 'Cells Unmerged',
        rowLabel: targetRow.label,
        description: `Unmerged cells in "${targetRow.label}"`,
      });

      if (!isOnline) {
        addOfflineChange({
          action: 'cell_edit',
          sheetName: targetMonth.name,
          year: targetMonth.year || selectedYear,
          rowLabel: targetRow.label,
          description: `Unmerged cells in "${targetRow.label}"`,
        });
      }
    },
    [months, activeMonthId, currentMonth, persistMonths, selectedYear, isOnline]
  );

  // Save note to cell across any column (payments label, monthly, kinsenas, remarks)
  const handleSaveCellNote = useCallback(
    (noteText: string) => {
      if (!noteTarget) return;
      const { rowId, column } = noteTarget;
      const targetMonth = months[activeMonthId] || currentMonth;
      const targetRow = targetMonth.rows[rowId];
      if (!targetRow) return;

      let updatedRow = { ...targetRow };

      if (column === 'payments') {
        updatedRow.labelNote = noteText || undefined;
      } else if (column === 'remarks') {
        updatedRow.remarksNote = noteText || undefined;
      } else if (column !== 'monthly' && column !== 'cutoff15th') {
        const existingCustomCell = targetRow.customCells?.[column] || { value: 0, rawInput: '' };
        updatedRow.customCells = {
          ...(targetRow.customCells || {}),
          [column]: {
            ...existingCustomCell,
            note: noteText || undefined,
          },
        };
      } else if (
        isMonthlyKinsenasMerged(rowId, targetRow, getEffectiveColumnOrderForMonth(targetMonth))
      ) {
        updatedRow.monthly = {
          ...targetRow.monthly,
          note: noteText || undefined,
        };
        updatedRow.cutoff15th = {
          ...targetRow.cutoff15th,
          note: noteText || undefined,
        };
      } else if (column === 'monthly') {
        updatedRow.monthly = {
          ...targetRow.monthly,
          note: noteText || undefined,
        };
      } else if (column === 'cutoff15th') {
        updatedRow.cutoff15th = {
          ...targetRow.cutoff15th,
          note: noteText || undefined,
        };
      }

      const updatedMonth: MonthData = {
        ...targetMonth,
        rows: {
          ...targetMonth.rows,
          [rowId]: updatedRow,
        },
      };

      const updatedMonths = {
        ...months,
        [activeMonthId]: updatedMonth,
      };

      persistMonths(updatedMonths);

      if (activeCell && activeCell.rowId === rowId && activeCell.column === column) {
        setActiveCell({
          ...activeCell,
          note: noteText || undefined,
        });
      }
    },
    [noteTarget, months, activeMonthId, currentMonth, activeCell, persistMonths]
  );

  // Remove note attached to a specific cell
  const handleRemoveCellNote = useCallback(
    (rowId: RowId, column: CellColumn) => {
      const targetMonth = months[activeMonthId] || currentMonth;
      const targetRow = targetMonth.rows[rowId];
      if (!targetRow) return;

      let updatedRow = { ...targetRow };
      if (column === 'payments') updatedRow.labelNote = undefined;
      else if (column === 'remarks') updatedRow.remarksNote = undefined;
      else if (column !== 'monthly' && column !== 'cutoff15th') {
        const existingCustomCell = targetRow.customCells?.[column];
        if (existingCustomCell) {
          updatedRow.customCells = {
            ...(targetRow.customCells || {}),
            [column]: {
              ...existingCustomCell,
              note: undefined,
            },
          };
        }
      } else if (
        isMonthlyKinsenasMerged(rowId, targetRow, getEffectiveColumnOrderForMonth(targetMonth))
      ) {
        updatedRow.monthly = { ...targetRow.monthly, note: undefined };
        updatedRow.cutoff15th = { ...targetRow.cutoff15th, note: undefined };
      }
      else if (column === 'monthly') updatedRow.monthly = { ...targetRow.monthly, note: undefined };
      else if (column === 'cutoff15th') updatedRow.cutoff15th = { ...targetRow.cutoff15th, note: undefined };

      const updatedMonth: MonthData = {
        ...targetMonth,
        rows: {
          ...targetMonth.rows,
          [rowId]: updatedRow,
        },
      };

      const updatedMonths = {
        ...months,
        [activeMonthId]: updatedMonth,
      };
      persistMonths(updatedMonths);

      if (activeCell && activeCell.rowId === rowId && activeCell.column === column) {
        setActiveCell({
          ...activeCell,
          note: undefined,
        });
      }
    },
    [months, activeMonthId, currentMonth, activeCell, persistMonths]
  );

  // Save Salary configuration
  const handleSaveSalaryBreakdown = useCallback(
    (monthly: SalaryBreakdown, cutoff15th: SalaryBreakdown) => {
      const targetMonth = months[activeMonthId] || currentMonth;

      const updatedMonth: MonthData = {
        ...targetMonth,
        salaryBreakdown: {
          monthly,
          cutoff15th,
        },
      };

      const recalculated = recalculateMonthData(updatedMonth);
      const updatedMonths = {
        ...months,
        [activeMonthId]: recalculated,
      };

      persistMonths(updatedMonths);
    },
    [months, activeMonthId, currentMonth, persistMonths]
  );

  // Create new month: default template has empty expense cells, preserved formulas, and optional previous balance carryover
  const handleCreateMonth = (
    monthName: string,
    shouldCopyCurrent: boolean,
    manualSalaryMonthly?: number,
    manualSalaryKinsenas?: number,
    targetYear?: number,
    includePreviousBalance = true
  ) => {
    const yr = targetYear || selectedYear || 2026;
    const newId = `month_${Date.now()}`;
    let newMonth: MonthData;

    // Carried over ending balance from previous month (or 0 when No Previous Balance is selected on Clean Default Template)
    const carriedBalanceMonthly = currentMonth.rows['balance']?.monthly.value || 0;
    const carriedBalanceKinsenas = currentMonth.rows['balance']?.cutoff15th.value || 0;
    const effectiveCarriedMonthly = shouldCopyCurrent || includePreviousBalance ? carriedBalanceMonthly : 0;
    const effectiveCarriedKinsenas = shouldCopyCurrent || includePreviousBalance ? carriedBalanceKinsenas : 0;

    if (shouldCopyCurrent) {
      newMonth = {
        ...JSON.parse(JSON.stringify(currentMonth)),
        id: newId,
        name: monthName,
        sheetTitle: getDefaultTableTitle(monthName),
        year: yr,
        salaryBreakdown: {
          monthly: {
            baseSalary: manualSalaryMonthly ?? currentMonth.salaryBreakdown.monthly.baseSalary,
            previousBalance: effectiveCarriedMonthly,
          },
          cutoff15th: {
            baseSalary: manualSalaryKinsenas ?? currentMonth.salaryBreakdown.cutoff15th.baseSalary,
            previousBalance: effectiveCarriedKinsenas,
          },
        },
        updatedAt: new Date().toISOString(),
      };
    } else {
      // Clean default template: All expenses are EMPTY except formula rows,
      // and salary equals (carried previous balance if enabled + manual input current salary)!
      newMonth = createEmptyDefaultMonth(
        newId,
        monthName,
        effectiveCarriedMonthly,
        effectiveCarriedKinsenas,
        manualSalaryMonthly ?? (currentMonth.salaryBreakdown.monthly.baseSalary || 0),
        manualSalaryKinsenas ?? (currentMonth.salaryBreakdown.cutoff15th.baseSalary || 0)
      );
      newMonth.year = yr;
    }

    const recalculated = recalculateMonthData(newMonth);
    const updatedMonths = {
      ...months,
      [newId]: recalculated,
    };

    if (!managedYears.includes(yr)) {
      saveManagedYears([...managedYears, yr]);
    }
    setSelectedYear(yr);
    persistMonths(updatedMonths);
    handleSelectMonth(newId);

    addChangeLog({
      sheetName: monthName,
      year: yr,
      action: 'sheet_create',
      actionLabel: 'Sheet Created',
      description: `Created new monthly sheet "${monthName}" for Year ${yr}`,
    });

    if (!isOnline) {
      addOfflineChange({
        action: 'sheet_create',
        sheetName: monthName,
        year: yr,
        description: `Created new monthly sheet "${monthName}" (${yr})`,
      });
    }
  };

  // Rename sheet / month
  const handleRenameMonth = useCallback((monthId: string, newName: string) => {
    if (!newName.trim() || !months[monthId]) return;
    const targetMonth = months[monthId];
    const updated = {
      ...months,
      [monthId]: {
        ...targetMonth,
        name: newName.trim(),
      },
    };
    persistMonths(updated);

    addChangeLog({
      sheetName: newName.trim(),
      year: targetMonth.year || selectedYear,
      action: 'sheet_rename',
      actionLabel: 'Sheet Renamed',
      oldValue: targetMonth.name,
      newValue: newName.trim(),
      description: `Renamed sheet "${targetMonth.name}" to "${newName.trim()}"`,
    });

    if (!isOnline) {
      addOfflineChange({
        action: 'sheet_rename',
        sheetName: newName.trim(),
        year: targetMonth.year || selectedYear,
        oldValue: targetMonth.name,
        newValue: newName.trim(),
        description: `Renamed sheet "${targetMonth.name}" to "${newName.trim()}"`,
      });
    }
  }, [months, persistMonths, selectedYear, isOnline]);

  // Duplicate sheet / month
  const handleDuplicateMonth = useCallback((monthId: string) => {
    const sourceMonth = months[monthId];
    if (!sourceMonth) return;
    const newId = `month_${Date.now()}`;
    const duplicated: MonthData = {
      ...JSON.parse(JSON.stringify(sourceMonth)),
      id: newId,
      name: `${sourceMonth.name} (Copy)`,
      updatedAt: new Date().toISOString(),
    };
    const updatedMonths = {
      ...months,
      [newId]: duplicated,
    };
    persistMonths(updatedMonths);
    handleSelectMonth(newId);

    addChangeLog({
      sheetName: duplicated.name,
      year: duplicated.year || selectedYear,
      action: 'sheet_duplicate',
      actionLabel: 'Sheet Duplicated',
      description: `Duplicated sheet from "${sourceMonth.name}" to "${duplicated.name}"`,
    });
  }, [months, persistMonths, selectedYear]);

  // Delete sheet / month
  const handleDeleteMonth = useCallback((monthId: string) => {
    const monthKeys = Object.keys(months);
    if (monthKeys.length <= 1) {
      alert('Cannot delete the only sheet in the workbook.');
      return;
    }
    const monthToDelete = months[monthId];
    const newMonths = { ...months };
    delete newMonths[monthId];
    persistMonths(newMonths);

    addChangeLog({
      sheetName: monthToDelete?.name || monthId,
      year: monthToDelete?.year || selectedYear,
      action: 'sheet_delete',
      actionLabel: 'Sheet Deleted',
      description: `Deleted monthly sheet "${monthToDelete?.name || monthId}"`,
    });

    if (!isOnline) {
      addOfflineChange({
        action: 'sheet_delete',
        sheetName: monthToDelete?.name || monthId,
        year: monthToDelete?.year || selectedYear,
        description: `Deleted monthly sheet "${monthToDelete?.name || monthId}"`,
      });
    }

    if (activeMonthId === monthId) {
      const remainingKeys = Object.keys(newMonths);
      const nextKey = remainingKeys[0];
      if (nextKey) {
        handleSelectMonth(nextKey);
      }
    }
  }, [months, activeMonthId, persistMonths, selectedYear, isOnline]);

  // Handle triggered print or PDF generation
  const handleTriggerPrint = useCallback(
    (targetSheet: 'active' | 'summary' | 'year' | 'changelog', isPdf: boolean) => {
      const yearMonths: Record<string, MonthData> = {};
      Object.entries(months).forEach(([k, m]) => {
        if ((m.year && m.year === selectedYear) || (m.name && m.name.includes(String(selectedYear)))) {
          yearMonths[k] = m;
        }
      });
      const ctx = {
        months,
        yearMonths: Object.keys(yearMonths).length > 0 ? yearMonths : months,
        currentMonth,
        currentYear: selectedYear,
      };
      if (isPdf) {
        downloadBudgetPdf(targetSheet, ctx);
      } else {
        printBudgetDirectly(targetSheet, ctx);
      }
    },
    [months, selectedYear, currentMonth]
  );

  // Import handler for Excel / CSV
  const handleImportSuccess = (
    updatedMonths: Record<string, MonthData>,
    newActiveMonthId?: string
  ) => {
    persistMonths(updatedMonths);
    if (newActiveMonthId && updatedMonths[newActiveMonthId]) {
      handleSelectMonth(newActiveMonthId);
    } else {
      const firstKey = Object.keys(updatedMonths)[0];
      if (firstKey) handleSelectMonth(firstKey);
    }
  };

  // Reset to default template (blank on shared deployment, sample template in dev preview)
  const handleResetSampleData = () => {
    const confirmText = isSharedPublicDeployment()
      ? 'Reset all budget data to a blank starter template?'
      : 'Reset all budget data to default template from your spreadsheet?';
    if (window.confirm(confirmText)) {
      const pairedMonths = isSharedPublicDeployment()
        ? createPairedBlankMonths()
        : createPairedDefaultMonths();
      persistMonths(pairedMonths);
      const firstId = Object.keys(pairedMonths)[0];
      if (firstId) handleSelectMonth(firstId);
    }
  };

  /**
   * Restores spreadsheet data from Google Cloud backup snapshot.
   * Invoked when user completes 2FA & biometrics and selects "Restore from Cloud" in SecurityGate.
   */
  const handleRestoreFromCloud = useCallback(() => {
    const backups = getCloudBackups();
    if (backups.length > 0 && backups[0].data && Object.keys(backups[0].data).length > 0) {
      const restored = backups[0].data;
      persistMonths(restored);
      const firstId = Object.keys(restored)[0];
      if (firstId) {
        setActiveMonthIdState(firstId);
        setActiveMonthId(firstId);
      }
    } else {
      // If no cloud backup snapshot exists yet, initialize a cloud snapshot of the current months
      const currentSnapshot = loadSavedMonths();
      persistMonths(currentSnapshot);
      createGoogleCloudBackup(currentSnapshot, securityProfile);
      const firstId = Object.keys(currentSnapshot)[0];
      if (firstId) {
        setActiveMonthIdState(firstId);
        setActiveMonthId(firstId);
      }
    }
    // Mark session as unlocked with 2FA and biometrics bound
    setSecurityProfile((prev) => {
      const updated = {
        ...prev,
        isSessionUnlocked: true,
        hasBiometrics: true,
        biometricBound: true,
      };
      saveSecurityProfile(updated);
      return updated;
    });
  }, [persistMonths, securityProfile]);

  /**
   * Initializes a fresh, clean default spreadsheet template.
   * Invoked when user completes 2FA & biometrics and selects "Create New" in SecurityGate.
   */
  const handleCreateNewSheet = useCallback(() => {
    // Generate fresh clean month (blank on shared deployment)
    const defaultMonth = isSharedPublicDeployment()
      ? Object.values(createPairedBlankMonths())[0]
      : createDefaultMonth();
    const freshMonths = { [defaultMonth.id]: defaultMonth };
    persistMonths(freshMonths);
    setActiveMonthIdState(defaultMonth.id);
    setActiveMonthId(defaultMonth.id);

    // Save cloud backup of the clean sheet
    createGoogleCloudBackup(freshMonths, securityProfile);

    // Mark session as unlocked with 2FA and biometrics bound
    setSecurityProfile((prev) => {
      const updated = {
        ...prev,
        isSessionUnlocked: true,
        hasBiometrics: true,
        biometricBound: true,
      };
      saveSecurityProfile(updated);
      return updated;
    });
  }, [persistMonths, securityProfile]);

  // Quick calculations for the top summary strip
  const metroKinsenas = currentMonth.rows['metrobank']?.cutoff15th.value || 0;
  const salaryKinsenas = currentMonth.rows['salary']?.cutoff15th.value || 0;
  const balanceKinsenas = currentMonth.rows['balance']?.cutoff15th.value || 0;
  const totalMonthsCount = Object.keys(months).length;

  return (
    <div className="h-dvh max-h-dvh print:h-auto print:max-h-none print:overflow-visible w-full max-w-full min-w-0 flex flex-col font-sans overflow-hidden bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-150">
      {/* 1. Header with strict Top Bar Contract */}
      <div className="w-full min-w-0 shrink-0 no-print">
        <TopNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onNewMonth={() => setIsNewMonthModalOpen(true)}
          onOpenImportExport={() => setIsImportExportModalOpen(true)}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          securityProfile={securityProfile}
          currentMonthName={currentMonth.name}
          isOnline={isOnline}
          offlineCount={offlineCount}
          onOpenSyncModal={() => setIsSyncModalOpen(true)}
          theme={theme}
          onToggleTheme={handleToggleTheme}
        />
      </div>

      {/* 2. Modern Sheet Selector & Quick KPI Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-2.5 sm:px-5 py-1.5 shrink-0 no-print transition-colors">
        <div className="w-full mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          {/* Year Switcher & Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Modern Year Selection Button & Dropdown Menu */}
            <div className="relative" ref={yearDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setIsYearDropdownOpen((prev) => !prev);
                  setYearActionError(null);
                  setConfirmDeleteYear(null);
                }}
                className="inline-flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300/80 dark:border-slate-700 rounded-lg px-2.5 py-1 shadow-2xs transition-all cursor-pointer group hover:border-slate-400 dark:hover:border-slate-600"
                title="Click to select, add, or delete calendar year"
              >
                <Calendar className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-[10px] lg:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Year:</span>
                <span className="text-xs lg:text-sm font-black text-slate-900 dark:text-slate-100 font-mono tracking-tight">
                  {selectedYear}
                </span>
                <ChevronDown
                  className={`w-3 h-3 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${
                    isYearDropdownOpen ? 'rotate-180 text-emerald-600 dark:text-emerald-400' : 'group-hover:text-slate-700 dark:group-hover:text-slate-300'
                  }`}
                />
              </button>

              {/* Year Selection Dropdown Menu */}
              {isYearDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-64 lg:w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 py-1.5 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-1.5 text-[10px] lg:text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span>Calendar Years</span>
                    <span className="font-mono text-slate-400 dark:text-slate-500">{availableYears.length}</span>
                  </div>

                  <div className="py-1 max-h-56 overflow-y-auto">
                    {availableYears.map((yr) => {
                      const sheetsInYr = Object.values(months).filter(
                        (m) => (m.year || extractMonthKey(m).year) === yr
                      );
                      const count = sheetsInYr.length;
                      const isCurrentYear = yr === selectedYear;

                      return (
                        <div
                          key={yr}
                          className={`px-2 py-1 flex items-center justify-between gap-1 transition-colors ${
                            isCurrentYear
                              ? 'bg-emerald-50/80 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-200 font-bold'
                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectYear(yr)}
                            className="flex-1 text-left px-1.5 py-1 text-xs lg:text-sm flex items-center justify-between cursor-pointer min-w-0"
                          >
                            <div className="flex items-center gap-2">
                              <Calendar
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  isCurrentYear ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                                }`}
                              />
                              <span className="font-mono font-bold text-sm lg:text-base">{yr}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] lg:text-xs font-normal text-slate-400 dark:text-slate-500 font-mono">
                                {count} {count === 1 ? 'sheet' : 'sheets'}
                              </span>
                              {isCurrentYear && (
                                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              )}
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setYearActionError(null);
                              if (availableYears.length <= 1) {
                                setYearActionError('At least one year must remain.');
                                return;
                              }
                              const remainingEntries = Object.entries(months).filter(
                                ([_, m]) => (m.year || extractMonthKey(m).year) !== yr
                              );
                              if (count > 0 && remainingEntries.length === 0) {
                                setYearActionError('Cannot delete the only year with sheets.');
                                return;
                              }
                              if (count > 0 && confirmDeleteYear !== yr) {
                                setConfirmDeleteYear(yr);
                                return;
                              }

                              // Perform deletion
                              const nextYears = saveManagedYears(
                                availableYears.filter((y) => y !== yr)
                              );
                              if (count > 0) {
                                const remainingMonths = Object.fromEntries(remainingEntries);
                                persistMonths(remainingMonths);
                                addChangeLog({
                                  sheetName: `Year ${yr}`,
                                  year: yr,
                                  action: 'sheet_delete',
                                  actionLabel: 'Year Deleted',
                                  description: `Deleted Year ${yr} and ${count} monthly sheet(s)`,
                                });
                                if (!isOnline) {
                                  addOfflineChange({
                                    action: 'sheet_delete',
                                    sheetName: `Year ${yr}`,
                                    year: yr,
                                    description: `Deleted Year ${yr} and ${count} monthly sheet(s)`,
                                  });
                                }
                              }
                              if (noDataPopupYear === yr) {
                                setNoDataPopupYear(null);
                              }
                              if (yr === selectedYear && nextYears.length > 0) {
                                const fallbackMonth = remainingEntries[0]?.[1];
                                const nextYear =
                                  (fallbackMonth
                                    ? fallbackMonth.year || extractMonthKey(fallbackMonth).year
                                    : nextYears[0]) || nextYears[0];
                                setSelectedYear(nextYear);
                                if (fallbackMonth) {
                                  setActiveMonthIdState(fallbackMonth.id);
                                  setActiveMonthId(fallbackMonth.id);
                                }
                              }
                              setConfirmDeleteYear(null);
                            }}
                            disabled={availableYears.length <= 1}
                            title={
                              availableYears.length <= 1
                                ? 'Cannot delete the only remaining year'
                                : `Delete Year ${yr}`
                            }
                            className={`p-1.5 rounded-md transition-colors shrink-0 ${
                              availableYears.length <= 1
                                ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                                : confirmDeleteYear === yr
                                ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 cursor-pointer'
                                : 'text-slate-400 dark:text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Inline Confirmation Prompt for Deleting a Year That Has Sheets */}
                  {confirmDeleteYear !== null && (
                    <div className="mx-2 mt-1 mb-1.5 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-[11px] text-rose-900 dark:text-rose-200 space-y-1.5">
                      <p className="font-semibold leading-snug">
                        Delete <span className="font-mono font-bold">{confirmDeleteYear}</span> and all its sheets?
                      </p>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteYear(null);
                          }}
                          className="px-2 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const yr = confirmDeleteYear;
                            const remainingEntries = Object.entries(months).filter(
                              ([_, m]) => (m.year || extractMonthKey(m).year) !== yr
                            );
                            const deletedCount = Object.keys(months).length - remainingEntries.length;
                            const nextYears = saveManagedYears(
                              availableYears.filter((y) => y !== yr)
                            );
                            if (deletedCount > 0) {
                              const remainingMonths = Object.fromEntries(remainingEntries);
                              persistMonths(remainingMonths);
                              addChangeLog({
                                sheetName: `Year ${yr}`,
                                year: yr,
                                action: 'sheet_delete',
                                actionLabel: 'Year Deleted',
                                description: `Deleted Year ${yr} and ${deletedCount} monthly sheet(s)`,
                              });
                              if (!isOnline) {
                                addOfflineChange({
                                  action: 'sheet_delete',
                                  sheetName: `Year ${yr}`,
                                  year: yr,
                                  description: `Deleted Year ${yr} and ${deletedCount} monthly sheet(s)`,
                                });
                              }
                            }
                            if (noDataPopupYear === yr) {
                              setNoDataPopupYear(null);
                            }
                            if (yr === selectedYear && nextYears.length > 0) {
                              const fallbackMonth = remainingEntries[0]?.[1];
                              const nextYear =
                                (fallbackMonth
                                  ? fallbackMonth.year || extractMonthKey(fallbackMonth).year
                                  : nextYears[0]) || nextYears[0];
                              setSelectedYear(nextYear);
                              if (fallbackMonth) {
                                setActiveMonthIdState(fallbackMonth.id);
                                setActiveMonthId(fallbackMonth.id);
                              }
                            }
                            setConfirmDeleteYear(null);
                            setYearActionError(null);
                          }}
                          className="px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Inline Error Message */}
                  {yearActionError && (
                    <div className="mx-2 mt-1 mb-1 px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                      {yearActionError}
                    </div>
                  )}

                  {/* Add Custom Calendar Year Footer */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const parsed = parseInt(newYearInput.trim(), 10);
                      if (!Number.isInteger(parsed) || parsed < 2000 || parsed > 2100) {
                        setYearActionError('Enter a valid year (2000–2100).');
                        return;
                      }
                      if (availableYears.includes(parsed)) {
                        setYearActionError(`Year ${parsed} already exists.`);
                        return;
                      }
                      saveManagedYears([...availableYears, parsed]);
                      setNewYearInput('');
                      setYearActionError(null);
                      setConfirmDeleteYear(null);
                    }}
                    className="px-2.5 pt-2 mt-1 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5"
                  >
                    <input
                      type="number"
                      min={2000}
                      max={2100}
                      value={newYearInput}
                      onChange={(e) => {
                        setNewYearInput(e.target.value);
                        if (yearActionError) setYearActionError(null);
                      }}
                      placeholder="Add year (e.g. 2028)"
                      className="flex-1 min-w-0 px-2 py-1 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </form>
                </div>
              )}
            </div>

            <button
              onClick={() => setIsNewMonthModalOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs lg:text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-300/80 dark:border-slate-700 transition-colors cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
              <span>Add Sheet</span>
            </button>

            <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">·</span>

            {/* Direct trigger for importing, exporting, and printing */}
            <button
              type="button"
              onClick={() => setIsImportExportModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs lg:text-sm text-emerald-800 dark:text-emerald-300 hover:text-emerald-950 dark:hover:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-800 px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer shadow-2xs"
              title="Import, export, or print / save as PDF"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
              <span>Import / Export / Print</span>
            </button>
          </div>

          {/* Quick Real-Time Metrics Strip (Tabular figures) */}
          <div className="flex items-center gap-3 lg:gap-4 text-xs lg:text-sm xl:text-[15px] font-mono overflow-x-auto pb-0.5 sm:pb-0">
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 shrink-0">
              <CreditCard className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-[11px] lg:text-xs xl:text-sm">METROBANK:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {hasDataForSelectedYear ? formatPHP(metroKinsenas) : '₱0.00'}
              </span>
            </div>

            <span className="text-slate-300 dark:text-slate-700">|</span>

            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 shrink-0">
              <TrendingUp className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-rose-600 dark:text-rose-400" />
              <span className="text-[11px] lg:text-xs xl:text-sm">Salary:</span>
              <span className="font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                {hasDataForSelectedYear ? formatPHP(salaryKinsenas) : '₱0.00'}
              </span>
            </div>

            <span className="text-slate-300 dark:text-slate-700">|</span>

            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 shrink-0">
              <span className="text-[11px] lg:text-xs xl:text-sm">Balance:</span>
              <span
                className={`font-bold tabular-nums ${
                  hasDataForSelectedYear && balanceKinsenas >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
                title="Formula: (Salary - Total) - (MP2 + Gotyme)"
              >
                {hasDataForSelectedYear ? formatPHP(balanceKinsenas) : '₱0.00'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Body Content Viewport (Maximizes available screen space, shows internal scrollbars when needed) */}
      <main className="flex-1 min-h-0 overflow-hidden w-full mx-auto px-1.5 sm:px-3 md:px-4 py-1.5 sm:py-2 flex flex-col">
        {/* Tab 1: Interactive Spreadsheet Table */}
        {activeTab === 'sheet' && (
          <div className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden space-y-1.5">
            {hasDataForSelectedYear && currentMonth ? (
              <div className="flex-1 min-h-0 rounded-xl sm:rounded-2xl border border-slate-300/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/80 p-1 sm:p-1.5 flex flex-col overflow-hidden shadow-2xs">
                <BudgetTable
                  monthData={currentMonth}
                  activeCell={activeCell}
                  onSelectCell={(rowId, column, currentInput, note) => {
                    if (!rowId || !column) {
                      setActiveCell(null);
                      return;
                    }
                    const colOrder = getEffectiveColumnOrderForMonth(currentMonth);
                    const rowRanges = getEffectiveRowMergeRanges(
                      rowId,
                      currentMonth.rows[rowId],
                      colOrder
                    );
                    const isCellMerged = Boolean(
                      findMergeRangeCoveringColumn(rowRanges, column, colOrder)
                    );
                    setActiveCell({
                      rowId,
                      rowLabel: currentMonth.rows[rowId]?.label || rowId,
                      column,
                      currentInput,
                      note,
                      isMerged: isCellMerged,
                    });
                  }}
                  onUpdateCellInput={handleUpdateCellInput}
                  onUpdateRowLabel={handleUpdateRowLabel}
                  onUpdateRemarks={handleUpdateRemarks}
                  onOpenNotePopover={(rowId, column, currentNote, cellTitle) => {
                    setNoteTarget({
                      rowId,
                      column,
                      title: cellTitle,
                      initialNote: currentNote || '',
                    });
                  }}
                  onRemoveCellNote={handleRemoveCellNote}
                  onOpenSalaryModal={() => setIsSalaryModalOpen(true)}
                  onUpdateSheetTitle={handleUpdateSheetTitle}
                  onAddLoanRow={handleAddLoanRow}
                  onAddPaymentRow={handleAddPaymentRow}
                  onAddNewPaymentItem={handleAddNewPaymentItem}
                  onDeleteCustomRow={handleDeleteCustomRow}
                  onDeleteRow={handleDeleteRow}
                  onUpdateColumnHeader={handleUpdateColumnHeader}
                  onUpdateCustomCellInput={handleUpdateCustomCellInput}
                  onAddColumn={handleAddColumn}
                  onRemoveColumn={handleRemoveColumn}
                  onRestoreStandardColumns={handleRestoreStandardColumns}
                  onUpdateCustomColumnLabel={handleUpdateCustomColumnLabel}
                  onMergeRowCells={handleMergeRowCells}
                  onUnmergeRowCells={handleUnmergeRowCells}
                />
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center p-6 sm:p-8 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-center shadow-2xs space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 dark:text-rose-400 shadow-inner">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <div className="max-w-md lg:max-w-lg space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 text-[11px] lg:text-xs font-mono font-bold">
                    <span>YEAR {selectedYear}</span>
                  </div>
                  <h2 className="text-xl lg:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">No Data Found</h2>
                  <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                    There are no budget sheets or financial records found for Year {selectedYear}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNewMonthModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs lg:text-sm font-bold rounded-lg shadow-xs cursor-pointer transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create First Sheet for {selectedYear}</span>
                </button>
              </div>
            )}

            {/* Excel-style Bottom Sheet Tabs dock */}
            <div className="shrink-0 no-print">
              <MonthSheetTabs
                months={displayedMonthsForTabs}
                activeMonthId={hasDataForSelectedYear ? activeMonthId : ''}
                onSelectMonth={handleSelectMonth}
                onAddNewMonth={() => setIsNewMonthModalOpen(true)}
                onRenameMonth={handleRenameMonth}
                onDuplicateMonth={handleDuplicateMonth}
                onDeleteMonth={handleDeleteMonth}
                onOpenSummarySheet={() => setActiveTab('charts')}
                isSummaryActive={false}
                onOpenChangeLog={() => setActiveTab('changelog')}
                isChangeLogActive={false}
              />
            </div>
          </div>
        )}

        {/* Tab 2: Summary Sheet with Visual Graphs & Multi-Month Analytics */}
        {activeTab === 'charts' && (
          <div className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden space-y-1.5">
            <div className="flex-1 min-h-0 flex flex-col">
              {hasDataForSelectedYear && currentMonth ? (
                <DataVisualization
                  monthData={currentMonth}
                  allMonths={displayedMonthsForTabs}
                  onSelectMonth={handleSelectMonth}
                />
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center p-6 sm:p-8 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-center shadow-2xs space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 dark:text-rose-400 shadow-inner">
                    <AlertCircle className="w-8 h-8" />
                  </div>
                  <div className="max-w-md lg:max-w-lg space-y-1.5">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 text-[11px] lg:text-xs font-mono font-bold">
                      <span>YEAR {selectedYear}</span>
                    </div>
                    <h2 className="text-xl lg:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">No Data Found</h2>
                    <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                      There are no summary charts or analytics to display because no sheets exist for Year {selectedYear}.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsNewMonthModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs lg:text-sm font-bold rounded-lg shadow-xs cursor-pointer transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create First Sheet for {selectedYear}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Excel-style Bottom Sheet Tabs on Summary Sheet */}
            <div className="shrink-0 no-print">
              <MonthSheetTabs
                months={displayedMonthsForTabs}
                activeMonthId={hasDataForSelectedYear ? activeMonthId : ''}
                onSelectMonth={handleSelectMonth}
                onAddNewMonth={() => setIsNewMonthModalOpen(true)}
                onRenameMonth={handleRenameMonth}
                onDuplicateMonth={handleDuplicateMonth}
                onDeleteMonth={handleDeleteMonth}
                onOpenSummarySheet={() => setActiveTab('charts')}
                isSummaryActive={true}
                onOpenChangeLog={() => setActiveTab('changelog')}
                isChangeLogActive={false}
              />
            </div>
          </div>
        )}

        {/* Tab 3: Monthly Budget Summary */}
        {activeTab === 'summary' && (
          <div className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden space-y-1.5">
            <div className="flex-1 min-h-0 flex flex-col">
              {hasDataForSelectedYear && currentMonth ? (
                <MonthlySummary
                  monthData={currentMonth}
                  allMonths={displayedMonthsForTabs}
                  onOpenSalaryModal={() => setIsSalaryModalOpen(true)}
                  onSelectMonth={handleSelectMonth}
                />
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center p-6 sm:p-8 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-center shadow-2xs space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 dark:text-rose-400 shadow-inner">
                    <AlertCircle className="w-8 h-8" />
                  </div>
                  <div className="max-w-md lg:max-w-lg space-y-1.5">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 text-[11px] lg:text-xs font-mono font-bold">
                      <span>YEAR {selectedYear}</span>
                    </div>
                    <h2 className="text-xl lg:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">No Data Found</h2>
                    <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                      No budget summary data available for Year {selectedYear}.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsNewMonthModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs lg:text-sm font-bold rounded-lg shadow-xs cursor-pointer transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create First Sheet for {selectedYear}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Excel-style Bottom Sheet Tabs */}
            <div className="shrink-0 no-print">
              <MonthSheetTabs
                months={displayedMonthsForTabs}
                activeMonthId={hasDataForSelectedYear ? activeMonthId : ''}
                onSelectMonth={handleSelectMonth}
                onAddNewMonth={() => setIsNewMonthModalOpen(true)}
                onRenameMonth={handleRenameMonth}
                onDuplicateMonth={handleDuplicateMonth}
                onDeleteMonth={handleDeleteMonth}
                onOpenSummarySheet={() => setActiveTab('charts')}
                isSummaryActive={false}
                onOpenChangeLog={() => setActiveTab('changelog')}
                isChangeLogActive={false}
              />
            </div>
          </div>
        )}

        {/* Tab 4: Audit Change Log Sheet */}
        {activeTab === 'changelog' && (
          <div className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden space-y-1.5">
            <div className="flex-1 min-h-0 flex flex-col">
              <ChangeLogSheet
                currentYear={selectedYear}
                hasData={hasDataForSelectedYear}
                onAddNewMonth={() => setIsNewMonthModalOpen(true)}
              />
            </div>

            {/* Excel-style Bottom Sheet Tabs */}
            <div className="shrink-0 no-print">
              <MonthSheetTabs
                months={displayedMonthsForTabs}
                activeMonthId={hasDataForSelectedYear ? activeMonthId : ''}
                onSelectMonth={handleSelectMonth}
                onAddNewMonth={() => setIsNewMonthModalOpen(true)}
                onRenameMonth={handleRenameMonth}
                onDuplicateMonth={handleDuplicateMonth}
                onDeleteMonth={handleDeleteMonth}
                onOpenSummarySheet={() => setActiveTab('charts')}
                isSummaryActive={false}
                onOpenChangeLog={() => setActiveTab('changelog')}
                isChangeLogActive={true}
              />
            </div>
          </div>
        )}
      </main>

      {/* 5. Minimalist Clean Footer (Permanently visible at bottom) */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-3 sm:px-4 py-1.5 sm:py-2 shrink-0 select-none transition-colors">
        <div className="w-full mx-auto flex items-center justify-center text-[11px] lg:text-xs xl:text-sm text-slate-500 dark:text-slate-400 font-medium text-center">
          Developed by John Archie Padrigo with Google AI Studio © 2026
        </div>
      </footer>

      {/* Modals & Popovers */}
      <CellNotePopover
        isOpen={Boolean(noteTarget)}
        cellTitle={noteTarget?.title || ''}
        initialNote={noteTarget?.initialNote || ''}
        onSave={handleSaveCellNote}
        onClose={() => setNoteTarget(null)}
      />

      <SalaryConfigModal
        isOpen={isSalaryModalOpen}
        onClose={() => setIsSalaryModalOpen(false)}
        monthlySalary={currentMonth.salaryBreakdown.monthly}
        cutoff15thSalary={currentMonth.salaryBreakdown.cutoff15th}
        onSave={handleSaveSalaryBreakdown}
      />

      <NewMonthModal
        isOpen={isNewMonthModalOpen}
        onClose={() => setIsNewMonthModalOpen(false)}
        currentMonthName={currentMonth.name}
        carriedBalanceMonthly={currentMonth.rows['balance']?.monthly.value || 0}
        carriedBalanceKinsenas={currentMonth.rows['balance']?.cutoff15th.value || 0}
        defaultBaseSalaryMonthly={currentMonth.salaryBreakdown.monthly.baseSalary}
        defaultBaseSalaryKinsenas={currentMonth.salaryBreakdown.cutoff15th.baseSalary}
        initialYear={selectedYear}
        availableYears={availableYears}
        onConfirm={handleCreateMonth}
      />

      <ImportExportModal
        isOpen={isImportExportModalOpen}
        onClose={() => setIsImportExportModalOpen(false)}
        months={months}
        currentMonth={currentMonth}
        currentYear={selectedYear}
        onImportSuccess={handleImportSuccess}
        onTriggerPrint={handleTriggerPrint}
      />

      {/* Settings Modal (Firebase Cloud Backup, Portable HTML Folder & Local data/ Sync) */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        months={months}
        years={availableYears}
        activeMonthId={activeMonthId}
        onRestoreBackup={(restored) => {
          persistMonths(restored);
          const firstId = Object.keys(restored)[0];
          if (firstId) handleSelectMonth(firstId);
        }}
        securityProfile={securityProfile}
        firebaseUid={firebaseUser?.uid || null}
        isOnline={isOnline}
        onUpdateSecurityProfile={(updated) => {
          setSecurityProfile(updated);
          saveSecurityProfile(updated);
        }}
        connectedFolderName={connectedDataFolder}
        onConnectedFolderChange={setConnectedDataFolder}
        onRestoreFolderData={(loaded: LoadedFolderDatabase) => {
          if (loaded.years && loaded.years.length > 0) {
            saveManagedYears(loaded.years);
          }
          if (loaded.changeLogs) {
            replaceChangeLogs(loaded.changeLogs);
          }
          if (loaded.offlineQueue) {
            replaceOfflineChanges(loaded.offlineQueue);
          }
          if (loaded.months && Object.keys(loaded.months).length > 0) {
            persistMonths(loaded.months);
            const targetId =
              loaded.activeMonthId && loaded.months[loaded.activeMonthId]
                ? loaded.activeMonthId
                : Object.keys(loaded.months)[0];
            if (targetId) handleSelectMonth(targetId);
          }
        }}
      />

      {/* Modern Offline & Online Sync Modal */}
      <SyncOfflineModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        isOnline={isOnline}
        offlineChanges={offlineChanges}
        months={months}
        securityProfile={securityProfile}
        firebaseUid={firebaseUser?.uid || null}
        onUpdateSecurityProfile={(updated) => {
          setSecurityProfile(updated);
          saveSecurityProfile(updated);
        }}
        simulateOffline={simulateOffline}
        onToggleSimulateOffline={toggleSimulateOffline}
      />

      {/* Modern 5-Second Loading Screen when Year is Selected */}
      {isLoadingYear && (
        <div className="pb-modal-backdrop z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 backdrop-blur-sm transition-opacity duration-200">
          <div className="pb-modal-card overflow-y-auto bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-6 sm:p-7 flex flex-col items-center gap-4 max-w-sm lg:max-w-md w-full text-center animate-in zoom-in-95 duration-200 select-none">
            {/* Animated Modern Spinner & Calendar Icon */}
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center shadow-inner">
                <Calendar className="w-8 h-8 text-emerald-600 dark:text-emerald-400 animate-pulse" />
              </div>
              <div className="absolute -inset-1 rounded-3xl border-2 border-emerald-500 border-t-transparent animate-spin" />
            </div>

            {/* Title & Status */}
            <div className="space-y-1.5 w-full">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[11px] lg:text-xs font-mono font-bold mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>FISCAL YEAR {loadingYearTarget}</span>
              </div>
              <h3 className="font-black text-slate-900 dark:text-slate-100 text-base sm:text-lg lg:text-xl tracking-tight">
                Refreshing {loadingYearTarget} Data Table...
              </h3>
              <p className="text-xs lg:text-sm text-slate-600 dark:text-slate-400 min-h-[36px] flex items-center justify-center font-medium px-2 leading-relaxed">
                {loadingMessage || `Loading ${loadingYearTarget} fiscal sheets & balances...`}
              </p>
            </div>

            {/* Modern Animated Progress Bar over 5 seconds */}
            <div className="w-full space-y-1.5">
              <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-200 dark:border-slate-700 shadow-inner">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] lg:text-xs text-slate-500 dark:text-slate-400 font-mono">
                <span>Refreshing Fiscal Data</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">{loadingProgress}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Popup Modal: "No Data Found." when an empty year is selected */}
      {noDataPopupYear !== null && (
        <div className="pb-modal-backdrop z-50 flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="pb-modal-card overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-sm lg:max-w-md w-full p-6 text-center space-y-4 animate-in zoom-in-95 duration-150 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto shadow-inner">
              <AlertCircle className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 text-[10px] lg:text-xs font-mono font-bold">
                <span>YEAR {noDataPopupYear}</span>
              </div>
              <h3 className="text-lg lg:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                No Data Found.
              </h3>
              <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                There are no budget sheets or financial records available for Year {noDataPopupYear}.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setNoDataPopupYear(null);
                  setIsNewMonthModalOpen(true);
                }}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs lg:text-sm font-bold rounded-xl shadow-xs cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Create Sheet for {noDataPopupYear}</span>
              </button>
              <button
                type="button"
                onClick={() => setNoDataPopupYear(null)}
                className="w-full py-2 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs lg:text-sm font-semibold rounded-xl cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Google Cloud Auto-Sync Notice Toast */}
      {autoSyncNotice && (
        <div className="fixed pb-floating-bottom right-4 sm:right-6 z-40 bg-slate-900 dark:bg-slate-800 text-white px-3.5 py-2 rounded-lg shadow-xl border border-slate-700 dark:border-slate-600 text-xs lg:text-sm font-semibold flex items-center gap-2 max-w-[calc(100vw-2rem)]">
          <Cloud className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{autoSyncNotice}</span>
          <button
            onClick={clearNotice}
            className="text-slate-400 hover:text-white ml-1 font-bold cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* Public Web Link Update & Republish Changes Popup */}
      <UpdateChangesModal
        isOpen={Boolean(updateNoticeState)}
        release={updateNoticeState?.release || LATEST_RELEASE}
        previousReleases={(updateNoticeState?.history || RELEASE_NOTES).slice(1)}
        requiresReload={Boolean(updateNoticeState?.requiresReload)}
        onConfirmOk={handleConfirmUpdateOk}
      />
    </div>
  );
}
