/**
 * @file BudgetTable.tsx
 * @description Pixel-accurate interactive spreadsheet table matching the user's WPS Office/Excel layout.
 * Features:
 * - One-Tap modern cell action popover (Edit Value, Delete Value, Add Note, Remove Note) - zero long-press.
 * - Explicit, permanently visible indication and buttons to add new Loans or custom Payment items.
 * - Metrobank auto-sum, QR PH manual input, Total auto-sum, Salary carry-over, Balance formula.
 * - Editable spreadsheet title and payment row labels.
 * 
 * Zero personal information. Every function and section is thoroughly documented.
 */

import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import {
  MonthData,
  RowId,
  BudgetRowState,
  CellColumn,
  CustomColumnDef,
  CustomColumnType,
} from '../types/budget';
import { INITIAL_ROW_ORDER } from '../utils/storage';
import { clampMenuPosition } from '../utils/viewport';
import {
  canColumnMerge,
  findMergeRangeCoveringColumn,
  getEffectiveRowMergeRanges,
  resolveMergePrimaryColumn,
} from '../utils/cellMerge';
import { formatCurrency, stripCurrencySymbols } from '../utils/currency';
import { useCurrency } from '../hooks/useCurrency';
import { useViewportAdaptation } from '../hooks/useViewportAdaptation';
import { EditFormulaModal } from './EditFormulaModal';
import {
  Plus,
  Trash2,
  Edit2,
  Check,
  Sparkles,
  Clock,
  X,
  MoreVertical,
  Calculator,
  Columns,
  RotateCcw,
  Combine,
  Split,
  ArrowUp,
  ArrowDown,
  Filter,
  CheckCheck,
  Undo2,
  Redo2,
} from 'lucide-react';

interface BudgetTableProps {
  monthData: MonthData;
  activeCell: {
    rowId: string;
    rowLabel: string;
    column: CellColumn;
    currentInput: string;
    note?: string;
    isMerged?: boolean;
  } | null;
  onSelectCell: (
    rowId: RowId,
    column: CellColumn,
    currentInput: string,
    note?: string
  ) => void;
  onUpdateCellInput: (
    rowId: RowId,
    column: 'monthly' | 'cutoff15th',
    rawInput: string
  ) => void;
  onUpdateRowLabel?: (rowId: RowId, newLabel: string) => void;
  onUpdateRemarks: (rowId: RowId, remarksValue: string) => void;
  onOpenNotePopover: (
    rowId: RowId,
    column: CellColumn,
    currentNote: string,
    cellTitle: string
  ) => void;
  onRemoveCellNote: (
    rowId: RowId,
    column: CellColumn
  ) => void;
  onOpenSalaryModal: () => void;
  onUpdateSheetTitle: (newTitle: string) => void;
  onAddLoanRow: () => void;
  onAddPaymentRow?: () => void;
  onAddNewPaymentItem?: (
    label: string,
    monthlyVal?: number,
    kinsenasVal?: number,
    insertIndex?: number
  ) => void;
  onDeleteCustomRow?: (rowId: RowId) => void;
  onDeleteRow?: (rowId: RowId) => void;
  onUpdateColumnHeader?: (col: 'payments' | 'monthly' | 'cutoff15th' | 'remarks', newTitle: string) => void;
  onUpdateCustomCellInput?: (
    rowId: RowId,
    colId: string,
    rawInput: string,
    colType: CustomColumnType
  ) => void;
  onAddColumn?: (label: string, colType: CustomColumnType, insertIndex: number) => void;
  onRemoveColumn?: (colId: string) => void;
  onRestoreStandardColumns?: () => void;
  onUpdateCustomColumnLabel?: (colId: string, newTitle: string) => void;
  onMergeRowCells?: (rowId: RowId, startCol: CellColumn, endCol: CellColumn) => void;
  onUnmergeRowCells?: (rowId: RowId, targetCol: CellColumn) => void;
  onReorderRows?: (fromIndex: number, toIndex: number) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onBatchUpdateRemarks?: (rowIds: RowId[], remarksValue: string) => void;
}

const DEFAULT_COLUMN_ORDER = ['payments', 'monthly', 'cutoff15th', 'remarks'];

export const BudgetTable: React.FC<BudgetTableProps> = ({
  monthData,
  activeCell,
  onSelectCell,
  onUpdateCellInput,
  onUpdateRowLabel,
  onUpdateRemarks,
  onOpenNotePopover,
  onRemoveCellNote,
  onOpenSalaryModal,
  onUpdateSheetTitle,
  onAddLoanRow,
  onAddPaymentRow,
  onAddNewPaymentItem,
  onDeleteCustomRow,
  onDeleteRow,
  onUpdateColumnHeader,
  onUpdateCustomCellInput,
  onAddColumn,
  onRemoveColumn,
  onRestoreStandardColumns,
  onUpdateCustomColumnLabel,
  onMergeRowCells,
  onUnmergeRowCells,
  onReorderRows,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onBatchUpdateRemarks,
}) => {
  const { currency } = useCurrency();
  const currencySymbolClean = currency.symbol.trim();
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const viewport = useViewportAdaptation(tableScrollRef);

  // Drag-and-drop & FLIP row animation state
  const [draggedRowId, setDraggedRowId] = useState<RowId | null>(null);
  const [dragOverState, setDragOverState] = useState<{
    rowId: RowId;
    position: 'above' | 'below';
  } | null>(null);
  const [recentlyMovedRowId, setRecentlyMovedRowId] = useState<RowId | null>(null);
  const [newlyAddedRowIds, setNewlyAddedRowIds] = useState<Set<RowId>>(() => new Set());
  const rowElsRef = useRef<Record<string, HTMLTableRowElement | null>>({});
  const prevTopsRef = useRef<Record<string, number>>({});
  const prevRowSetRef = useRef<Set<string> | null>(null);
  const prevSheetIdRef = useRef<string>(monthData.id);
  const moveHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cell currently in active inline text editing mode
  const [editingCell, setEditingCell] = useState<{
    rowId: RowId;
    column: CellColumn;
  } | null>(null);
  const skipNextBlurRef = useRef(false);

  useEffect(() => {
    skipNextBlurRef.current = false;
  }, [editingCell]);

  // Remarks status filter chip ('all' | 'settled' | 'deferred' | 'unset')
  const [remarksFilter, setRemarksFilter] = useState<'all' | 'settled' | 'deferred' | 'unset'>('all');

  useEffect(() => {
    setRemarksFilter('all');
  }, [monthData.id]);

  // Editable column headers state (supports standard & custom columns)
  const [editingHeader, setEditingHeader] = useState<string | null>(null);
  const [headerInputText, setHeaderInputText] = useState('');

  // Editable payment row label state (everything under payments is editable)
  const [editingLabelRowId, setEditingLabelRowId] = useState<RowId | null>(null);
  const [editingLabelText, setEditingLabelText] = useState('');

  // Payment header 3-dots popup menu state
  const [paymentMenuOpen, setPaymentMenuOpen] = useState(false);
  const [paymentMenuPos, setPaymentMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [isAddNewModalOpen, setIsAddNewModalOpen] = useState(false);
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [removedNotice, setRemovedNotice] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemMonthly, setNewItemMonthly] = useState('');
  const [newItemKinsenas, setNewItemKinsenas] = useState('');
  const [newItemInsertIndex, setNewItemInsertIndex] = useState<number>(0);

  // Table Title 3-dots popup menu & dynamic column modals
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const [titleMenuPos, setTitleMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [isAddColModalOpen, setIsAddColModalOpen] = useState(false);
  const [isRemoveColModalOpen, setIsRemoveColModalOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<CustomColumnType>('currency');
  const [newColInsertIndex, setNewColInsertIndex] = useState<number>(DEFAULT_COLUMN_ORDER.length);
  const [removedColNotice, setRemovedColNotice] = useState<string | null>(null);

  // Merge / Unmerge Cells Modal ("Where to merge")
  const [mergeModalState, setMergeModalState] = useState<{
    rowId: RowId;
    startCol: CellColumn;
    endCol: CellColumn;
  } | null>(null);
  const [mergeModalNotice, setMergeModalNotice] = useState<string | null>(null);

  const customColumns: CustomColumnDef[] = monthData.columnHeaders?.customColumns || [];
  const customColMap = useMemo(() => {
    const map: Record<string, CustomColumnDef> = {};
    for (const col of customColumns) {
      map[col.id] = col;
    }
    return map;
  }, [customColumns]);

  const effectiveColumnOrder: string[] = useMemo(() => {
    const rawOrder = monthData.columnHeaders?.columnOrder;
    if (!rawOrder || rawOrder.length === 0) return DEFAULT_COLUMN_ORDER;
    const valid = rawOrder.filter(
      (id) =>
        id === 'payments' ||
        id === 'monthly' ||
        id === 'cutoff15th' ||
        id === 'remarks' ||
        Boolean(customColMap[id])
    );
    if (!valid.includes('payments')) {
      valid.unshift('payments');
    }
    return valid;
  }, [monthData.columnHeaders?.columnOrder, customColMap]);

  const hasMissingStandardColumns = ['monthly', 'cutoff15th', 'remarks'].some(
    (id) => !effectiveColumnOrder.includes(id)
  );

  const getColumnDisplayLabel = (colId: string): string => {
    if (colId === 'payments') return monthData.columnHeaders?.payments || 'PAYMENTS';
    if (colId === 'monthly') return monthData.columnHeaders?.monthly || 'MONTHLY';
    if (colId === 'cutoff15th') return monthData.columnHeaders?.cutoff15th || 'KINSENAS';
    if (colId === 'remarks') return monthData.columnHeaders?.remarks || 'REMARKS';
    return customColMap[colId]?.label || colId;
  };

  // Device- & resolution-adaptive typography, spacing, and wrapping tokens
  const adaptive = useMemo(() => {
    const colCount = effectiveColumnOrder.length;
    const hasManyCols = colCount >= 5;
    const hasExtraCols = colCount >= 6;
    const shortVp = viewport.isShortViewport;

    switch (viewport.deviceTier) {
      case 'mobile-sm':
        return {
          titleFont: 'text-[15px] leading-tight tracking-tight',
          headerFont: hasManyCols
            ? 'text-[9px] leading-tight tracking-wide'
            : 'text-[10px] leading-tight tracking-wider',
          labelFont: hasManyCols ? 'text-[10.5px] leading-snug' : 'text-[11px] leading-snug',
          numFont: hasExtraCols
            ? 'text-[9.5px] leading-tight'
            : hasManyCols
            ? 'text-[10px] leading-tight'
            : 'text-[10.5px] leading-tight',
          symbolFont: hasManyCols ? 'text-[9px] leading-tight' : 'text-[10px] leading-tight',
          remarksFont: hasManyCols ? 'text-[9.5px] leading-tight' : 'text-[10.5px] leading-tight',
          remarksPad: 'px-1.5 py-0.5',
          cellPad: 'py-1.5 px-1',
          thPad: 'py-2 px-1',
          paymentWrap: 'break-words line-clamp-2',
          editPad: 'px-1 py-0.5',
        };
      case 'mobile':
        return {
          titleFont: 'text-base leading-tight tracking-tight',
          headerFont: hasManyCols
            ? 'text-[10px] leading-tight tracking-wide'
            : 'text-[11px] leading-tight tracking-wider',
          labelFont: hasManyCols ? 'text-[11px] leading-snug' : 'text-xs leading-snug',
          numFont: hasExtraCols
            ? 'text-[10px] leading-tight'
            : hasManyCols
            ? 'text-[10.5px] leading-tight'
            : 'text-[11.5px] leading-tight',
          symbolFont: hasManyCols ? 'text-[10px] leading-tight' : 'text-[11px] leading-tight',
          remarksFont: hasManyCols ? 'text-[10.5px] leading-tight' : 'text-[11px] leading-tight',
          remarksPad: 'px-2 py-0.5',
          cellPad: 'py-1.5 px-1.5',
          thPad: 'py-2 px-1.5',
          paymentWrap: 'break-words line-clamp-2',
          editPad: 'px-1.5 py-0.5',
        };
      case 'tablet':
        return {
          titleFont: 'text-lg leading-tight tracking-tight',
          headerFont: hasManyCols
            ? 'text-[11px] leading-tight tracking-wider'
            : 'text-xs leading-tight tracking-wider',
          labelFont: hasManyCols ? 'text-[12.5px] leading-snug' : 'text-[13.5px] leading-snug',
          numFont: hasManyCols ? 'text-xs leading-snug' : 'text-[13px] leading-snug',
          symbolFont: hasManyCols ? 'text-[11.5px] leading-snug' : 'text-xs leading-snug',
          remarksFont: hasManyCols ? 'text-[11.5px] leading-snug' : 'text-xs leading-snug',
          remarksPad: 'px-2.5 py-0.5',
          cellPad: shortVp ? 'py-1.5 px-2.5' : 'py-2 px-2.5',
          thPad: 'py-2.5 px-2.5',
          paymentWrap: 'truncate',
          editPad: 'px-2 py-0.5',
        };
      case 'wide':
        return {
          titleFont: 'text-[22px] leading-tight tracking-tight',
          headerFont: 'text-sm leading-tight tracking-wider',
          labelFont: hasManyCols ? 'text-[14.5px] leading-snug' : 'text-[15.5px] leading-snug',
          numFont: hasManyCols ? 'text-[14px] leading-snug' : 'text-[15px] leading-snug',
          symbolFont: hasManyCols ? 'text-[13px] leading-snug' : 'text-sm leading-snug',
          remarksFont: 'text-[13.5px] leading-snug',
          remarksPad: 'px-3 py-0.5',
          cellPad: shortVp ? 'py-2 px-4' : 'py-2.5 px-4',
          thPad: 'py-3 px-4',
          paymentWrap: 'truncate',
          editPad: 'px-2.5 py-0.5',
        };
      case 'desktop':
      default:
        return {
          titleFont: 'text-xl leading-tight tracking-tight',
          headerFont: 'text-[13px] leading-tight tracking-wider',
          labelFont: hasManyCols ? 'text-[13.5px] leading-snug' : 'text-[14.5px] leading-snug',
          numFont: hasManyCols ? 'text-[13px] leading-snug' : 'text-[14px] leading-snug',
          symbolFont: hasManyCols ? 'text-xs leading-snug' : 'text-[13px] leading-snug',
          remarksFont: 'text-[13px] leading-snug',
          remarksPad: 'px-2.5 py-0.5',
          cellPad: shortVp ? 'py-1.5 px-3' : 'py-2 px-3',
          thPad: 'py-2.5 px-3',
          paymentWrap: 'truncate',
          editPad: 'px-2 py-0.5',
        };
    }
  }, [viewport.deviceTier, viewport.isShortViewport, effectiveColumnOrder.length]);

  // Dedicated Remarks Popup state for non-summary rows (OK, Next Payroll, None)
  const [remarksPopupTarget, setRemarksPopupTarget] = useState<{
    rowId: RowId;
    rowLabel: string;
    currentRemarks: string;
  } | null>(null);

  // Dedicated Formula Editor Modal for rows from QR PH to Balance
  const [formulaModalTarget, setFormulaModalTarget] = useState<{
    rowId: RowId;
    rowLabel: string;
    column: CellColumn;
  } | null>(null);

  // Hover preview tooltip state for desktop note inspection
  const [hoveredNote, setHoveredNote] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  // Table title is the month (e.g. OCTOBER 2026), distinct from the app title
  const currentSheetTitle =
    monthData.sheetTitle && monthData.sheetTitle !== 'PesoBudget - Smart Philippine Expense & Payroll Tracker'
      ? monthData.sheetTitle
      : monthData.name.toUpperCase();

  // Editable Sheet Title state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState(currentSheetTitle);

  // Sync title input with monthData changes
  useEffect(() => {
    setTitleInput(currentSheetTitle);
  }, [currentSheetTitle]);

  const rows = monthData.rows;

  // Floating Action Popup ref for outside click detection
  const activeCellPopupRef = useRef<HTMLDivElement>(null);

  // When selection or inline edit is active, clicking/tapping outside dismisses selection cleanly
  useEffect(() => {
    if (!activeCell && !editingCell && !editingLabelRowId) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (activeCellPopupRef.current && activeCellPopupRef.current.contains(e.target as Node)) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const isCell = target.closest('td');
      if (!isCell) {
        onSelectCell(null as any, null as any, '', '');
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick, { passive: true });

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [activeCell, editingCell, editingLabelRowId, onSelectCell]);

  const getCellMeta = (rowId: RowId, column: CellColumn, row: BudgetRowState) => {
    let rawInput = '';
    let noteText = '';
    if (column === 'monthly') {
      rawInput = row.monthly?.rawInput || '';
      noteText = row.monthly?.note || '';
    } else if (column === 'cutoff15th') {
      rawInput = row.cutoff15th?.rawInput || '';
      noteText = row.cutoff15th?.note || '';
    } else if (column === 'payments') {
      rawInput = row.label;
      noteText = row.labelNote || '';
    } else if (column === 'remarks') {
      rawInput = row.remarks || '';
      noteText = row.remarksNote || '';
    } else if (customColMap[column]) {
      rawInput = row.customCells?.[column]?.rawInput || '';
      noteText = row.customCells?.[column]?.note || '';
    }

    const isReadOnly =
      column === 'monthly'
        ? Boolean(row.readOnlyMonthly)
        : column === 'cutoff15th'
        ? Boolean(row.readOnly15th)
        : false;

    return { rawInput, noteText, isReadOnly };
  };

  /**
   * Opens the "Merge & Unmerge Cells (Where to Merge)" modal with smart initial column range
   */
  const openMergeModalForRow = (targetRowId?: RowId, preferredCol?: CellColumn) => {
    const rowOrder = monthData.rowOrder || INITIAL_ROW_ORDER;
    const resolvedRowId =
      targetRowId && rows[targetRowId]
        ? targetRowId
        : activeCell?.rowId && rows[activeCell.rowId]
        ? (activeCell.rowId as RowId)
        : rowOrder[0];
    if (!resolvedRowId) return;

    const mergeableCols = effectiveColumnOrder.filter(canColumnMerge);
    let startCol: CellColumn = mergeableCols[0] || 'monthly';
    let endCol: CellColumn = mergeableCols[1] || mergeableCols[0] || 'cutoff15th';

    if (preferredCol && canColumnMerge(preferredCol)) {
      const idx = mergeableCols.indexOf(preferredCol);
      if (idx !== -1) {
        if (idx < mergeableCols.length - 1) {
          startCol = mergeableCols[idx];
          endCol = mergeableCols[idx + 1];
        } else if (idx > 0) {
          startCol = mergeableCols[idx - 1];
          endCol = mergeableCols[idx];
        }
      }
    } else {
      const mIdx = mergeableCols.indexOf('monthly');
      const kIdx = mergeableCols.indexOf('cutoff15th');
      if (mIdx !== -1 && kIdx !== -1 && Math.abs(mIdx - kIdx) === 1) {
        startCol = mIdx < kIdx ? 'monthly' : 'cutoff15th';
        endCol = mIdx < kIdx ? 'cutoff15th' : 'monthly';
      }
    }

    setMergeModalNotice(null);
    setMergeModalState({ rowId: resolvedRowId, startCol, endCol });
  };

  /**
   * Cell Click:
   * Selects cell cleanly without blocking modal popups.
   * If clicking an already selected editable cell, immediately enters inline edit mode!
   */
  const handleCellClick = (
    rowId: RowId,
    column: CellColumn,
    row: BudgetRowState
  ) => {
    // If clicking Remarks on any unmerged non-summary row, open sleek modern 3-option popover
    const isSummaryRemarks = ['metrobank', 'total', 'salary', 'balance'].includes(rowId);
    if (column === 'remarks' && !isSummaryRemarks) {
      onSelectCell(null as any, null as any, '', '');
      setRemarksPopupTarget({
        rowId,
        rowLabel: row.label,
        currentRemarks: row.remarks || '',
      });
      return;
    }

    const { rawInput, noteText, isReadOnly } = getCellMeta(rowId, column, row);

    // Direct Inline Edit: If clicking the cell that is already active, enter inline editing
    if (activeCell && activeCell.rowId === rowId && activeCell.column === column && !isReadOnly) {
      if (column === 'payments') {
        setEditingLabelRowId(rowId);
        setEditingLabelText(row.label);
      } else {
        setEditingCell({ rowId, column });
      }
      return;
    }

    // Select in parent (syncs formula bar and shows floating action popup including Merge/Unmerge)
    onSelectCell(rowId, column, rawInput, noteText);
  };

  /**
   * Double-click direct inline editing shortcut
   */
  const handleCellDoubleClick = (
    rowId: RowId,
    column: CellColumn,
    row: BudgetRowState
  ) => {
    if (column === 'payments') {
      setEditingLabelRowId(rowId);
      setEditingLabelText(row.label);
      return;
    }

    if (rowId === 'salary' && (column === 'monthly' || column === 'cutoff15th')) {
      onOpenSalaryModal();
      return;
    }

    const { isReadOnly } = getCellMeta(rowId, column, row);

    if (!isReadOnly) {
      setEditingCell({ rowId, column });
    }
  };

  /**
   * Handles click on any horizontally merged cell range
   */
  const handleMergedCellClick = (
    rowId: RowId,
    row: BudgetRowState,
    primaryCol: CellColumn,
    mergedCols: CellColumn[]
  ) => {
    const meta = getCellMeta(rowId, primaryCol, row);
    const fallbackInput =
      meta.rawInput ||
      mergedCols.map((c) => getCellMeta(rowId, c, row).rawInput).find(Boolean) ||
      '';
    const fallbackNote =
      meta.noteText ||
      mergedCols.map((c) => getCellMeta(rowId, c, row).noteText).find(Boolean) ||
      '';

    // Second click on active merged cell enters inline edit directly (unless Salary, which shows Breakdown button or double-click)
    if (
      activeCell &&
      activeCell.rowId === rowId &&
      mergedCols.includes(activeCell.column) &&
      !meta.isReadOnly
    ) {
      setEditingCell({ rowId, column: primaryCol });
      return;
    }

    // Select in parent (syncs formula bar)
    onSelectCell(rowId, primaryCol, fallbackInput, fallbackNote);
  };

  /**
   * Double-click on merged cell for quick direct editing
   */
  const handleMergedCellDoubleClick = (
    rowId: RowId,
    row: BudgetRowState,
    primaryCol: CellColumn
  ) => {
    if (rowId === 'salary' && (primaryCol === 'monthly' || primaryCol === 'cutoff15th')) {
      onOpenSalaryModal();
      return;
    }
    const { isReadOnly } = getCellMeta(rowId, primaryCol, row);
    if (!isReadOnly) {
      setEditingCell({ rowId, column: primaryCol });
    }
  };

  const coreNonExpenseSet = useMemo(
    () => new Set<string>(['qr_ph', 'metrobank', 'total', 'salary', 'balance', 'mp2', 'gotyme']),
    []
  );

  const effectiveRowOrder: RowId[] = monthData.rowOrder || INITIAL_ROW_ORDER;

  const expenseRemarksStats = useMemo(() => {
    let settledCount = 0;
    let deferredCount = 0;
    let unsetCount = 0;
    const unsetCashRowIds: RowId[] = [];

    for (const id of effectiveRowOrder) {
      if (coreNonExpenseSet.has(id)) continue;
      const row = rows[id];
      if (!row) continue;
      const rem = row.remarks || '';
      if (rem === 'OK' || rem === 'Settled') {
        settledCount += 1;
      } else if (rem === 'Next Payroll' || rem === 'Deferred') {
        deferredCount += 1;
      } else {
        unsetCount += 1;
        const hasAmount =
          (row.monthly?.value || 0) > 0 ||
          (row.cutoff15th?.value || 0) > 0 ||
          Boolean(row.monthly?.rawInput?.trim()) ||
          Boolean(row.cutoff15th?.rawInput?.trim());
        if (hasAmount) {
          unsetCashRowIds.push(id);
        }
      }
    }
    return { settledCount, deferredCount, unsetCount, unsetCashRowIds };
  }, [effectiveRowOrder, rows, coreNonExpenseSet]);

  const displayedRowOrder: RowId[] = useMemo(() => {
    if (remarksFilter === 'all') return effectiveRowOrder;
    return effectiveRowOrder.filter((id) => {
      if (coreNonExpenseSet.has(id)) return true;
      const row = rows[id];
      if (!row) return false;
      const rem = row.remarks || '';
      if (remarksFilter === 'settled') return rem === 'OK' || rem === 'Settled';
      if (remarksFilter === 'deferred') return rem === 'Next Payroll' || rem === 'Deferred';
      return !rem || rem === 'None';
    });
  }, [effectiveRowOrder, remarksFilter, rows, coreNonExpenseSet]);

  /**
   * Selects a specific grid coordinate safely without triggering Remarks popup interruptions
   */
  const selectCellAt = (targetRowId: RowId, targetCol: CellColumn) => {
    const targetRow = rows[targetRowId];
    if (!targetRow) return;

    const targetRanges = getEffectiveRowMergeRanges(targetRowId, targetRow, effectiveColumnOrder);
    const mergeMatch = findMergeRangeCoveringColumn(targetRanges, targetCol, effectiveColumnOrder);

    if (mergeMatch && mergeMatch.colSpan > 1) {
      const primaryCol = resolveMergePrimaryColumn(mergeMatch.range, effectiveColumnOrder);
      const primaryMeta = getCellMeta(targetRowId, primaryCol, targetRow);
      const fallbackInput =
        primaryMeta.rawInput ||
        mergeMatch.columns.map((c) => getCellMeta(targetRowId, c, targetRow).rawInput).find(Boolean) ||
        '';
      const fallbackNote =
        primaryMeta.noteText ||
        mergeMatch.columns.map((c) => getCellMeta(targetRowId, c, targetRow).noteText).find(Boolean) ||
        '';
      onSelectCell(targetRowId, primaryCol, fallbackInput, fallbackNote);
    } else {
      const meta = getCellMeta(targetRowId, targetCol, targetRow);
      onSelectCell(targetRowId, targetCol, meta.rawInput, meta.noteText);
    }

    requestAnimationFrame(() => {
      const cellEl = tableScrollRef.current?.querySelector(
        `[data-cell-key="${CSS.escape(`${targetRowId}::${targetCol}`)}"]`
      ) as HTMLElement | null;
      cellEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };

  /**
   * Moves active selection by delta rows (dy) and delta columns (dx), skipping hidden merged columns
   */
  const moveSelection = (dy: number, dx: number, fromRowId: RowId, fromCol: CellColumn) => {
    const rowIdx = displayedRowOrder.indexOf(fromRowId);
    if (rowIdx === -1) return;

    let nextRowIdx = rowIdx;
    let nextColIdx = effectiveColumnOrder.indexOf(fromCol);
    if (nextColIdx === -1) nextColIdx = 0;

    if (dy !== 0) {
      nextRowIdx = Math.max(0, Math.min(displayedRowOrder.length - 1, rowIdx + dy));
      const targetRowId = displayedRowOrder[nextRowIdx];
      if (targetRowId) {
        selectCellAt(targetRowId, effectiveColumnOrder[nextColIdx] || fromCol);
      }
      return;
    }

    if (dx !== 0) {
      const fromRow = rows[fromRowId];
      if (fromRow) {
        const currentRanges = getEffectiveRowMergeRanges(fromRowId, fromRow, effectiveColumnOrder);
        const currentMerge = findMergeRangeCoveringColumn(currentRanges, fromCol, effectiveColumnOrder);
        if (currentMerge && currentMerge.colSpan > 1) {
          nextColIdx = dx > 0 ? currentMerge.endIdx + 1 : currentMerge.startIdx - 1;
        } else {
          nextColIdx += dx;
        }
      } else {
        nextColIdx += dx;
      }

      // Wrap across rows when Tab/Shift+Tab reaches row boundary
      if (nextColIdx >= effectiveColumnOrder.length) {
        if (rowIdx < displayedRowOrder.length - 1) {
          nextRowIdx = rowIdx + 1;
          nextColIdx = 0;
        } else {
          nextColIdx = effectiveColumnOrder.length - 1;
        }
      } else if (nextColIdx < 0) {
        if (rowIdx > 0) {
          nextRowIdx = rowIdx - 1;
          nextColIdx = effectiveColumnOrder.length - 1;
        } else {
          nextColIdx = 0;
        }
      }

      const targetRowId = displayedRowOrder[nextRowIdx];
      const targetCol = effectiveColumnOrder[nextColIdx];
      if (targetRowId && targetCol) {
        selectCellAt(targetRowId, targetCol);
      }
    }
  };

  /**
   * 4-way Arrow, Tab, Enter/F2, and Escape keyboard navigation when a grid cell is selected (not inline-editing)
   */
  useEffect(() => {
    if (
      !activeCell ||
      editingCell ||
      editingLabelRowId ||
      isEditingTitle ||
      editingHeader ||
      remarksPopupTarget ||
      formulaModalTarget ||
      mergeModalState ||
      isAddNewModalOpen ||
      isRemoveModalOpen ||
      isAddColModalOpen ||
      isRemoveColModalOpen
    ) {
      return;
    }

    const handleGridKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveSelection(-1, 0, activeCell.rowId, activeCell.column);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveSelection(1, 0, activeCell.rowId, activeCell.column);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        moveSelection(0, -1, activeCell.rowId, activeCell.column);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        moveSelection(0, 1, activeCell.rowId, activeCell.column);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        moveSelection(0, e.shiftKey ? -1 : 1, activeCell.rowId, activeCell.column);
      } else if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault();
        const currentRow = rows[activeCell.rowId];
        if (!currentRow) return;
        if (activeCell.column === 'payments') {
          setEditingLabelRowId(activeCell.rowId);
          setEditingLabelText(currentRow.label);
        } else if (
          activeCell.column === 'remarks' &&
          !['metrobank', 'total', 'salary', 'balance'].includes(activeCell.rowId)
        ) {
          onSelectCell(null as any, null as any, '', '');
          setRemarksPopupTarget({
            rowId: activeCell.rowId,
            rowLabel: currentRow.label,
            currentRemarks: currentRow.remarks || '',
          });
        } else if (
          activeCell.rowId === 'salary' &&
          (activeCell.column === 'monthly' || activeCell.column === 'cutoff15th')
        ) {
          onOpenSalaryModal();
        } else {
          const meta = getCellMeta(activeCell.rowId, activeCell.column, currentRow);
          if (!meta.isReadOnly) {
            setEditingCell({ rowId: activeCell.rowId, column: activeCell.column });
          } else if (
            ['qr_ph', 'metrobank', 'total', 'salary', 'balance'].includes(activeCell.rowId) &&
            (activeCell.column === 'monthly' || activeCell.column === 'cutoff15th')
          ) {
            setFormulaModalTarget({
              rowId: activeCell.rowId,
              rowLabel: currentRow.label,
              column: activeCell.column,
            });
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onSelectCell(null as any, null as any, '', '');
      }
    };

    window.addEventListener('keydown', handleGridKeyDown);
    return () => window.removeEventListener('keydown', handleGridKeyDown);
  });

  /**
   * Keyboard navigation and directional commit while inline-editing a cell
   */
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowId: RowId,
    column: CellColumn,
    commitFn?: (val: string) => void
  ) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      skipNextBlurRef.current = true;
      commitFn?.(e.currentTarget.value);
      setEditingCell(null);
      if (e.key === 'Enter') {
        moveSelection(e.shiftKey ? -1 : 1, 0, rowId, column);
      } else {
        moveSelection(0, e.shiftKey ? -1 : 1, rowId, column);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      skipNextBlurRef.current = true;
      setEditingCell(null);
    }
  };

  /**
   * Formats numeric currency values into the user's selected international currency
   * With currency symbol strictly on the left while the numeric value is on the right.
   */
  const renderCurrencyCell = (value: number, rawInput: string, rowId: RowId) => {
    if ((value === 0 || isNaN(value)) && !rawInput) {
      return null;
    }
    if (value === 0 && rawInput === '0' && !['total', 'salary', 'balance'].includes(rowId)) {
      return null;
    }

    const isNegative = value < 0;
    const absVal = Math.abs(value || 0);
    const formatted = absVal.toLocaleString(currency.locale, {
      minimumFractionDigits: currency.decimals,
      maximumFractionDigits: currency.decimals,
    });

    return (
      <div className="flex items-center justify-between gap-0.5 w-full px-0.5 sm:px-1 min-w-0">
        <span className={`font-sans ${adaptive.symbolFont} select-none shrink-0 font-medium opacity-90`}>
          {currency.symbol}
        </span>
        <span className={`font-mono tabular-nums tracking-tight font-medium text-right flex-1 truncate ${adaptive.numFont}`}>
          {isNegative ? `-${formatted}` : formatted}
        </span>
      </div>
    );
  };

  /**
   * Helper to render currency remarks without duplicate symbols
   * Ensures exactly ONE currency symbol on the left, and the numeric value on the right
   */
  const renderRemarksCurrency = (remarksVal: string | undefined) => {
    const zeroStr = currency.decimals > 0 ? `0.${'0'.repeat(currency.decimals)}` : '0';
    if (!remarksVal || remarksVal === '—' || remarksVal === '') {
      return (
        <div className="flex items-center justify-between gap-0.5 w-full px-0.5 sm:px-1 opacity-60 min-w-0">
          <span className={`font-sans ${adaptive.symbolFont} select-none shrink-0 font-medium`}>
            {currency.symbol}
          </span>
          <span className={`font-mono tabular-nums tracking-tight font-semibold text-right flex-1 truncate ${adaptive.numFont}`}>
            {zeroStr}
          </span>
        </div>
      );
    }

    const cleaned = stripCurrencySymbols(remarksVal);
    const isNegative = cleaned.startsWith('-') || cleaned.startsWith('(');
    const absCleaned = cleaned.replace(/[-()]/g, '').trim();
    const numVal = parseFloat(absCleaned.replace(/,/g, ''));

    const formatted = isNaN(numVal)
      ? absCleaned || zeroStr
      : numVal.toLocaleString(currency.locale, {
          minimumFractionDigits: currency.decimals,
          maximumFractionDigits: currency.decimals,
        });

    return (
      <div className="flex items-center justify-between gap-0.5 w-full px-0.5 sm:px-1 min-w-0">
        <span className={`font-sans ${adaptive.symbolFont} select-none shrink-0 font-medium opacity-90`}>
          {currency.symbol}
        </span>
        <span className={`font-mono tabular-nums tracking-tight font-semibold text-right flex-1 truncate ${adaptive.numFont}`}>
          {isNegative ? `-${formatted}` : formatted}
        </span>
      </div>
    );
  };

  /**
   * Modern Glowing Amber Cell Note Indicator
   */
  const renderModernNoteIndicator = (
    noteText: string | undefined,
    rowId: RowId,
    col: CellColumn,
    cellTitle: string
  ) => {
    if (!noteText) return null;
    return (
      <div
        className="absolute top-0 right-0 w-2.5 h-2.5 bg-gradient-to-br from-amber-400 to-amber-600 rounded-bl-xs shadow-[0_0_6px_rgba(245,158,11,0.7)] z-20 cursor-pointer border-b border-l border-amber-300"
        title="Tap cell to edit note, or hover to preview"
        onClick={(e) => {
          e.stopPropagation();
          onOpenNotePopover(rowId, col, noteText, cellTitle);
        }}
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pos = clampMenuPosition(rect, 260, 120);
          setHoveredNote({
            text: noteText,
            x: pos.left,
            y: pos.top,
          });
        }}
        onMouseLeave={() => setHoveredNote(null)}
      />
    );
  };

  const mergeableColumnIds = useMemo(
    () => effectiveColumnOrder.filter(canColumnMerge),
    [effectiveColumnOrder]
  );

  // Capture current row Y positions prior to reorder for crisp FLIP motion
  const captureRowRects = () => {
    const tops: Record<string, number> = {};
    for (const id of effectiveRowOrder) {
      const el = rowElsRef.current[id];
      if (el) {
        tops[id] = el.getBoundingClientRect().top;
      }
    }
    prevTopsRef.current = tops;
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (moveHighlightTimerRef.current) {
        clearTimeout(moveHighlightTimerRef.current);
      }
    };
  }, []);

  // FLIP vertical animation when rows are reordered + entrance animation for newly added rows
  useLayoutEffect(() => {
    const isSheetSwitch = prevSheetIdRef.current !== monthData.id;
    prevSheetIdRef.current = monthData.id;

    const currentSet = new Set(effectiveRowOrder);
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (isSheetSwitch) {
      prevTopsRef.current = {};
      prevRowSetRef.current = currentSet;
      return;
    }

    if (prevRowSetRef.current) {
      const added = new Set<RowId>();
      for (const id of effectiveRowOrder) {
        if (!prevRowSetRef.current.has(id) && rows[id]) {
          added.add(id);
        }
      }
      if (added.size > 0) {
        setNewlyAddedRowIds(added);
        setTimeout(() => {
          setNewlyAddedRowIds(new Set());
        }, 350);
      }
    }
    prevRowSetRef.current = currentSet;

    const nextTops: Record<string, number> = {};
    const movedEls: Array<{ el: HTMLTableRowElement; deltaY: number }> = [];

    for (const id of effectiveRowOrder) {
      const el = rowElsRef.current[id];
      if (!el) continue;
      const top = el.getBoundingClientRect().top;
      nextTops[id] = top;
      const prevTop = prevTopsRef.current[id];
      if (!prefersReducedMotion && prevTop !== undefined) {
        const deltaY = prevTop - top;
        if (Math.abs(deltaY) > 1) {
          movedEls.push({ el, deltaY });
        }
      }
    }

    if (movedEls.length > 0) {
      movedEls.forEach(({ el, deltaY }) => {
        el.style.transition = 'none';
        el.style.transform = `translateY(${deltaY}px)`;
      });
      // Force layout reflow so browser commits starting transforms
      void movedEls[0].el.getBoundingClientRect();
      requestAnimationFrame(() => {
        movedEls.forEach(({ el }) => {
          el.style.transition = 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)';
          el.style.transform = 'translateY(0)';
        });
      });
    }

    prevTopsRef.current = nextTops;
  }, [effectiveRowOrder, monthData.id, rows]);

  const handleMoveRow = (fromIdx: number, toIdx: number) => {
    if (!onReorderRows) return;
    if (
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= effectiveRowOrder.length ||
      toIdx >= effectiveRowOrder.length ||
      fromIdx === toIdx
    ) {
      return;
    }
    const movedId = effectiveRowOrder[fromIdx];
    captureRowRects();
    setRecentlyMovedRowId(movedId);
    if (moveHighlightTimerRef.current) {
      clearTimeout(moveHighlightTimerRef.current);
    }
    moveHighlightTimerRef.current = setTimeout(() => {
      setRecentlyMovedRowId(null);
      moveHighlightTimerRef.current = null;
    }, 600);
    onReorderRows(fromIdx, toIdx);
  };

  const getColumnWidthClass = (colId: string): string => {
    const colCount = effectiveColumnOrder.length;
    if (colCount === 1) return 'w-full';
    if (colCount === 2) return 'w-[50%]';
    if (colCount === 3) return colId === 'payments' ? 'w-[40%]' : 'w-[30%]';
    if (colCount === 4) {
      if (viewport.isMobileDevice) {
        if (colId === 'payments') return 'w-[27%]';
        if (colId === 'monthly' || colId === 'cutoff15th') return 'w-[25%]';
        return 'w-[23%]';
      }
      return colId === 'payments' ? 'w-[31%]' : 'w-[23%]';
    }
    if (colCount === 5) return colId === 'payments' ? 'w-[24%]' : 'w-[19%]';
    if (colCount === 6) return colId === 'payments' ? 'w-[20%]' : 'w-[16%]';
    if (colCount === 7) return colId === 'payments' ? 'w-[16%]' : 'w-[14%]';
    return colId === 'payments' ? 'w-[16%]' : 'w-auto';
  };

  return (
    <div className="w-full h-full min-h-0 flex flex-col p-1 sm:p-1.5 select-text">
      <div className="w-full h-full min-h-0 flex flex-col bg-white dark:bg-slate-900 border border-slate-300/90 dark:border-slate-700/90 ring-1 ring-slate-900/[0.04] dark:ring-white/[0.06] shadow-[0_0_16px_rgba(15,23,42,0.08),0_1px_4px_rgba(15,23,42,0.05)] dark:shadow-[0_0_20px_rgba(0,0,0,0.45),0_1px_4px_rgba(0,0,0,0.3)] rounded-2xl overflow-hidden transition-colors">
        {/* Editable Master Sheet Header: Icon-only Undo/Redo Arrows + Always Centered Title + 3-Dots Column Menu */}
        <div className="bg-gradient-to-b from-slate-50/90 to-white dark:from-slate-900 dark:to-slate-900 border-b border-slate-200/90 dark:border-slate-800 py-2 sm:py-2.5 px-2.5 sm:px-4 relative group select-none shrink-0">
          {isEditingTitle ? (
            <div className="flex items-center gap-2 w-full max-w-lg mx-auto justify-center">
              <input
                type="text"
                autoFocus
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onBlur={() => {
                  setIsEditingTitle(false);
                  if (titleInput.trim()) onUpdateSheetTitle(titleInput.trim());
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setIsEditingTitle(false);
                    if (titleInput.trim()) onUpdateSheetTitle(titleInput.trim());
                  } else if (e.key === 'Escape') {
                    setIsEditingTitle(false);
                    setTitleInput(currentSheetTitle);
                  }
                }}
                className={`w-full ${adaptive.titleFont} font-extrabold text-center border border-emerald-500 dark:border-emerald-400 rounded-lg bg-amber-50/40 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 px-2.5 py-1 font-sans uppercase shadow-xs`}
                placeholder="Enter Table Month Title (e.g. OCTOBER 2026)"
              />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setIsEditingTitle(false);
                  if (titleInput.trim()) onUpdateSheetTitle(titleInput.trim());
                }}
                className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md cursor-pointer shadow-2xs transition-colors shrink-0"
                title="Save Title"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setIsEditingTitle(false);
                  setTitleInput(currentSheetTitle);
                }}
                className="p-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-md cursor-pointer transition-colors shrink-0"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(60px,1fr)_minmax(0,auto)_minmax(60px,1fr)] items-center gap-2 w-full">
              {/* Left slot: Icon-only Undo & Redo arrows (no text) */}
              <div className="flex items-center gap-1 justify-self-start">
                <button
                  type="button"
                  disabled={!canUndo || !onUndo}
                  onClick={() => onUndo?.()}
                  title="Undo (Ctrl+Z)"
                  aria-label="Undo"
                  className="w-7 h-7 rounded-md flex items-center justify-center border border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-800/80 text-emerald-600 dark:text-emerald-400 hover:bg-slate-200/80 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-white/80 dark:disabled:hover:bg-slate-800/80 transition-colors cursor-pointer shrink-0"
                >
                  <Undo2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={!canRedo || !onRedo}
                  onClick={() => onRedo?.()}
                  title="Redo (Ctrl+Y)"
                  aria-label="Redo"
                  className="w-7 h-7 rounded-md flex items-center justify-center border border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-slate-800/80 text-emerald-600 dark:text-emerald-400 hover:bg-slate-200/80 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-white/80 dark:disabled:hover:bg-slate-800/80 transition-colors cursor-pointer shrink-0"
                >
                  <Redo2 className="w-4 h-4" />
                </button>
              </div>

              {/* Center slot: Symmetrically centered sheet title + 3-dot options button */}
              <div className="flex items-center justify-center gap-1 min-w-0 max-w-full">
                <div className="w-7 h-7 shrink-0" aria-hidden="true" />
                <h1 className={`${adaptive.titleFont} font-extrabold text-slate-900 dark:text-slate-100 font-sans uppercase text-center px-1.5 truncate`}>
                  {currentSheetTitle}
                </h1>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (titleMenuOpen) {
                      setTitleMenuOpen(false);
                    } else {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTitleMenuPos(clampMenuPosition(rect, 224, 180));
                      setTitleMenuOpen(true);
                    }
                  }}
                  title="Sheet Options: Edit Title, Add/Remove Column, Merge/Unmerge Cells"
                  className="w-7 h-7 rounded-md flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/80 dark:hover:bg-slate-800 border border-transparent hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer shrink-0"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>

              {/* Right slot: Balancing spacer matching left controls width so title stays dead-center */}
              <div className="w-[60px] justify-self-end shrink-0" aria-hidden="true" />
            </div>
          )}
        </div>

        {/* Sleek Centered Remarks Filter Strip + Quick Settle All Cash Bills */}
        <div className="bg-slate-50/80 dark:bg-slate-900/95 border-b border-slate-200/80 dark:border-slate-800 px-2.5 sm:px-4 py-1.5 flex flex-wrap items-center justify-center gap-2 text-[11px] sm:text-xs select-none shrink-0">
          <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-0.5">
              <Filter className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">Filter:</span>
            </span>
            {(
              [
                { id: 'all', label: 'All', count: null },
                { id: 'settled', label: 'Settled', count: expenseRemarksStats.settledCount },
                { id: 'deferred', label: 'Deferred', count: expenseRemarksStats.deferredCount },
                { id: 'unset', label: 'Unset', count: expenseRemarksStats.unsetCount },
              ] as const
            ).map((chip) => {
              const isActive = remarksFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setRemarksFilter(chip.id)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer border ${
                    isActive
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  <span>{chip.label}</span>
                  {chip.count !== null && (
                    <span
                      className={`font-mono text-[10px] px-1 rounded ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {chip.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {expenseRemarksStats.unsetCashRowIds.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (onBatchUpdateRemarks) {
                  onBatchUpdateRemarks(expenseRemarksStats.unsetCashRowIds, 'OK');
                } else {
                  expenseRemarksStats.unsetCashRowIds.forEach((id) => onUpdateRemarks(id, 'OK'));
                }
              }}
              title="Mark all unset bills with amounts as Settled"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-800 transition-colors cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Settle {expenseRemarksStats.unsetCashRowIds.length} Unset</span>
            </button>
          )}
        </div>

        {/* Dynamic Header & Body Columns (Vertical Scroll Only - Zero Horizontal Scroll) */}
        <div
          ref={tableScrollRef}
          className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
        >
          <table className="w-full max-w-full min-h-full border-collapse font-sans table-fixed">
            <thead className="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-800/90 backdrop-blur-xs border-b border-slate-300/90 dark:border-slate-700 shadow-[0_1px_0_0_rgba(15,23,42,0.06)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)]">
              <tr className={`text-slate-600 dark:text-slate-300 font-bold uppercase ${adaptive.headerFont}`}>
                {effectiveColumnOrder.map((colId, colIdx) => {
                  const isLastCol = colIdx === effectiveColumnOrder.length - 1;
                  const borderRightClass = isLastCol
                    ? ''
                    : colId === 'payments'
                    ? 'border-r border-slate-300/90 dark:border-slate-700/90'
                    : 'border-r border-slate-200/80 dark:border-slate-800/85';
                  const widthClass = getColumnWidthClass(colId);

                  if (colId === 'payments') {
                    return (
                      <th
                        key={colId}
                        className={`${adaptive.thPad} ${borderRightClass} text-center ${widthClass} relative align-middle overflow-hidden`}
                      >
                        <div className="flex items-center justify-between gap-0.5 px-0.5 min-w-0">
                          <span className={viewport.isMobileDevice ? 'hidden' : 'w-5 shrink-0'} />
                          {editingHeader === 'payments' ? (
                            <input
                              type="text"
                              autoFocus
                              value={headerInputText}
                              onChange={(e) => setHeaderInputText(e.target.value)}
                              onBlur={() => {
                                if (headerInputText.trim() && onUpdateColumnHeader) {
                                  onUpdateColumnHeader('payments', headerInputText.trim());
                                }
                                setEditingHeader(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  if (headerInputText.trim() && onUpdateColumnHeader) {
                                    onUpdateColumnHeader('payments', headerInputText.trim());
                                  }
                                  setEditingHeader(null);
                                } else if (e.key === 'Escape') {
                                  setEditingHeader(null);
                                }
                              }}
                              className={`${adaptive.headerFont} font-bold text-center border border-emerald-500 dark:border-emerald-400 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-1 py-0.5 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/25 uppercase w-full max-w-[128px]`}
                            />
                          ) : (
                            <span className="font-bold truncate min-w-0">
                              {monthData.columnHeaders?.payments || 'PAYMENTS'}
                            </span>
                          )}

                          <div className="relative shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (paymentMenuOpen) {
                                  setPaymentMenuOpen(false);
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setPaymentMenuPos(clampMenuPosition(rect, 192, 130));
                                  setPaymentMenuOpen(true);
                                }
                              }}
                              title="Payment Options: Add New or Remove Items"
                              className="w-5 h-5 sm:w-6 sm:h-6 rounded-md flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200/80 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </th>
                    );
                  }

                  const isStandardEditable =
                    colId === 'monthly' || colId === 'cutoff15th' || colId === 'remarks';
                  const headerLabel = getColumnDisplayLabel(colId);

                  return (
                    <th
                      key={colId}
                      className={`${adaptive.thPad} ${borderRightClass} text-center ${widthClass} align-middle overflow-hidden`}
                    >
                      {editingHeader === colId ? (
                        <input
                          type="text"
                          autoFocus
                          value={headerInputText}
                          onChange={(e) => setHeaderInputText(e.target.value)}
                          onBlur={() => {
                            if (headerInputText.trim()) {
                              if (isStandardEditable && onUpdateColumnHeader) {
                                onUpdateColumnHeader(colId as 'monthly' | 'cutoff15th' | 'remarks', headerInputText.trim());
                              } else if (onUpdateCustomColumnLabel) {
                                onUpdateCustomColumnLabel(colId, headerInputText.trim());
                              }
                            }
                            setEditingHeader(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (headerInputText.trim()) {
                                if (isStandardEditable && onUpdateColumnHeader) {
                                  onUpdateColumnHeader(colId as 'monthly' | 'cutoff15th' | 'remarks', headerInputText.trim());
                                } else if (onUpdateCustomColumnLabel) {
                                  onUpdateCustomColumnLabel(colId, headerInputText.trim());
                                }
                              }
                              setEditingHeader(null);
                            } else if (e.key === 'Escape') {
                              setEditingHeader(null);
                            }
                          }}
                          className={`${adaptive.headerFont} font-bold text-center border border-emerald-500 dark:border-emerald-400 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 px-1 py-0.5 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/25 uppercase w-full max-w-[128px]`}
                        />
                      ) : (
                        <span
                          onClick={() => {
                            setHeaderInputText(headerLabel);
                            setEditingHeader(colId);
                          }}
                          className="cursor-pointer hover:underline underline-offset-2 inline-flex items-center justify-center gap-1 max-w-full truncate"
                          title={`Click to rename ${headerLabel} header`}
                        >
                          <span className="truncate">{headerLabel}</span>
                          <Edit2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 opacity-45 hover:opacity-100 shrink-0" />
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayedRowOrder.map((rowId, rowIdx) => {
                const row = rows[rowId];
                if (!row) return null;

                const isQrPh = rowId === 'qr_ph';
                const isTotal = rowId === 'total';
                const isSalary = rowId === 'salary';
                const isBalance = rowId === 'balance';
                const isMp2 = rowId === 'mp2';
                const isGotyme = rowId === 'gotyme';
                const isMetrobank = rowId === 'metrobank';
                const isSpecialFillRow =
                  isQrPh || isMetrobank || isTotal || isSalary || isBalance || isMp2 || isGotyme;
                const isLoanRow = rowId === 'loan' || rowId.startsWith('loan_');

                const isNegativeBalance =
                  isBalance &&
                  ((row.monthly?.value || 0) < 0 || (row.cutoff15th?.value || 0) < 0);

                // Modern tonal fintech cell fills with balanced light/dark contrast
                let rowBgClass =
                  'bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/70';
                let labelTextClass = 'text-slate-900 dark:text-slate-100';

                if (isQrPh) {
                  rowBgClass =
                    'bg-indigo-50/90 hover:bg-indigo-100/80 dark:bg-indigo-950/55 dark:hover:bg-indigo-900/60 text-indigo-950 dark:text-indigo-100 font-semibold';
                  labelTextClass = 'text-indigo-950 dark:text-indigo-100 font-semibold';
                } else if (isMetrobank) {
                  rowBgClass =
                    'bg-slate-100/95 hover:bg-slate-200/75 dark:bg-slate-800/90 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold';
                  labelTextClass = 'text-slate-900 dark:text-slate-100 font-semibold';
                } else if (isTotal) {
                  rowBgClass =
                    'bg-sky-100/95 hover:bg-sky-200/75 dark:bg-sky-900/60 dark:hover:bg-sky-900/75 text-sky-950 dark:text-sky-100 font-bold';
                  labelTextClass = 'text-sky-950 dark:text-sky-100 font-bold';
                } else if (isSalary) {
                  rowBgClass =
                    'bg-violet-100/90 hover:bg-violet-200/70 dark:bg-violet-950/60 dark:hover:bg-violet-900/70 text-violet-950 dark:text-violet-100 font-bold';
                  labelTextClass = 'text-violet-950 dark:text-violet-100 font-bold';
                } else if (isBalance) {
                  if (isNegativeBalance) {
                    rowBgClass =
                      'bg-rose-100/95 dark:bg-rose-950/70 text-rose-950 dark:text-rose-100 font-bold pb-balance-negative-pulse';
                    labelTextClass = 'text-rose-950 dark:text-rose-100 font-bold';
                  } else {
                    rowBgClass =
                      'bg-emerald-100/95 hover:bg-emerald-200/75 dark:bg-emerald-950/65 dark:hover:bg-emerald-900/75 text-emerald-950 dark:text-emerald-100 font-bold';
                    labelTextClass = 'text-emerald-950 dark:text-emerald-100 font-bold';
                  }
                } else if (isMp2) {
                  rowBgClass =
                    'bg-amber-100/90 hover:bg-amber-200/70 dark:bg-amber-950/55 dark:hover:bg-amber-900/65 text-amber-950 dark:text-amber-100 font-bold';
                  labelTextClass = 'text-amber-950 dark:text-amber-100 font-bold';
                } else if (isGotyme) {
                  rowBgClass =
                    'bg-teal-100/85 hover:bg-teal-200/65 dark:bg-teal-950/55 dark:hover:bg-teal-900/65 text-teal-950 dark:text-teal-100 font-bold';
                  labelTextClass = 'text-teal-950 dark:text-teal-100 font-bold';
                }

                const getSelectedCellClass = (selected: boolean) => {
                  if (!selected) return '';
                  if (isSpecialFillRow) {
                    return 'ring-2 ring-slate-800 dark:ring-white ring-inset bg-black/[0.04] dark:bg-white/[0.08]';
                  }
                  return 'ring-2 ring-emerald-600 dark:ring-emerald-400 ring-inset bg-emerald-50/45 dark:bg-emerald-950/35';
                };

                const rowMergeRanges = getEffectiveRowMergeRanges(rowId, row, effectiveColumnOrder);
                const skipColIndices = new Set<number>();

                const isEditingMonthly =
                  editingCell?.rowId === rowId && editingCell?.column === 'monthly';
                const isEditingKinsenas =
                  editingCell?.rowId === rowId && editingCell?.column === 'cutoff15th';
                const isEditingRemarks =
                  editingCell?.rowId === rowId && editingCell?.column === 'remarks';

                const isSelectedPayments =
                  activeCell?.rowId === rowId && activeCell?.column === 'payments';
                const isSelectedMonthly =
                  activeCell?.rowId === rowId && activeCell?.column === 'monthly';
                const isSelectedKinsenas =
                  activeCell?.rowId === rowId && activeCell?.column === 'cutoff15th';
                const isSelectedRemarks =
                  activeCell?.rowId === rowId && activeCell?.column === 'remarks';

                const isLoanEmpty = isLoanRow && !row.label;

                const isDraggingThisRow = draggedRowId === rowId;
                const isDragOverAbove =
                  dragOverState?.rowId === rowId && dragOverState.position === 'above';
                const isDragOverBelow =
                  dragOverState?.rowId === rowId && dragOverState.position === 'below';
                const isRecentlyMoved = recentlyMovedRowId === rowId;
                const isNewlyAdded = newlyAddedRowIds.has(rowId);
                const canDragRow = Boolean(onReorderRows) && !editingCell && !editingLabelRowId;

                return (
                  <React.Fragment key={rowId}>
                    <tr
                      ref={(el) => {
                        rowElsRef.current[rowId] = el;
                      }}
                      draggable={canDragRow}
                      onDragStart={(e) => {
                        if (!canDragRow) {
                          e.preventDefault();
                          return;
                        }
                        setDraggedRowId(rowId);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', rowId);
                      }}
                      onDragOver={(e) => {
                        if (!draggedRowId || draggedRowId === rowId) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        const rect = e.currentTarget.getBoundingClientRect();
                        const position: 'above' | 'below' =
                          e.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
                        setDragOverState((prev) =>
                          prev?.rowId === rowId && prev.position === position
                            ? prev
                            : { rowId, position }
                        );
                      }}
                      onDragLeave={(e) => {
                        const related = e.relatedTarget as Node | null;
                        if (related && e.currentTarget.contains(related)) return;
                        setDragOverState((prev) => (prev?.rowId === rowId ? null : prev));
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const sourceId = draggedRowId || e.dataTransfer.getData('text/plain');
                        if (!sourceId || sourceId === rowId) {
                          setDraggedRowId(null);
                          setDragOverState(null);
                          return;
                        }
                        const fromIdx = effectiveRowOrder.indexOf(sourceId);
                        const targetIdx = effectiveRowOrder.indexOf(rowId);
                        const position = dragOverState?.rowId === rowId ? dragOverState.position : 'above';
                        if (fromIdx !== -1 && targetIdx !== -1) {
                          let toIdx =
                            fromIdx < targetIdx
                              ? position === 'above'
                                ? targetIdx - 1
                                : targetIdx
                              : position === 'above'
                              ? targetIdx
                              : targetIdx + 1;
                          toIdx = Math.max(0, Math.min(effectiveRowOrder.length - 1, toIdx));
                          handleMoveRow(fromIdx, toIdx);
                        }
                        setDraggedRowId(null);
                        setDragOverState(null);
                      }}
                      onDragEnd={() => {
                        setDraggedRowId(null);
                        setDragOverState(null);
                      }}
                      className={`border-b border-slate-200/85 dark:border-slate-800/85 last:border-b-0 ${
                        isTotal || isMetrobank ? 'border-t border-t-slate-300/85 dark:border-t-slate-600/85' : ''
                      } transition-colors duration-150 ${rowBgClass} ${
                        isDraggingThisRow ? 'opacity-45 bg-emerald-50/40 dark:bg-emerald-950/30' : ''
                      } ${isDragOverAbove ? 'shadow-[inset_0_3px_0_0_#10b981]' : ''} ${
                        isDragOverBelow ? 'shadow-[inset_0_-3px_0_0_#10b981]' : ''
                      } ${isRecentlyMoved ? 'pb-row-settled' : ''} ${
                        isNewlyAdded ? 'pb-row-enter' : ''
                      }`}
                    >
                      {effectiveColumnOrder.map((colId, colIdx) => {
                        if (skipColIndices.has(colIdx)) {
                          return null;
                        }

                        const activeMerge = findMergeRangeCoveringColumn(
                          rowMergeRanges,
                          colId,
                          effectiveColumnOrder
                        );

                        const isLastCol = colIdx === effectiveColumnOrder.length - 1;
                        const borderRightClass = isLastCol
                          ? ''
                          : colId === 'payments'
                          ? 'border-r border-slate-300/90 dark:border-slate-700/90'
                          : 'border-r border-slate-200/80 dark:border-slate-800/85';

                        // 1. PAYMENTS COLUMN
                        if (colId === 'payments') {
                          return (
                            <td
                              key={colId}
                              data-cell-key={`${rowId}::${colId}`}
                              onClick={() => handleCellClick(rowId, 'payments', row)}
                              onDoubleClick={() => handleCellDoubleClick(rowId, 'payments', row)}
                              className={`${adaptive.cellPad} ${borderRightClass} align-middle relative group cursor-pointer select-none overflow-hidden ${getSelectedCellClass(
                                isSelectedPayments
                              )}`}
                            >
                              {renderModernNoteIndicator(row.labelNote, rowId, 'payments', `${row.label} (Payment)`)}

                              <div className="flex items-center justify-between gap-1 min-w-0">
                                <div className="flex items-center flex-1 min-w-0 w-full">
                                  {editingLabelRowId === rowId ? (
                                    <input
                                      type="text"
                                      autoFocus
                                      value={editingLabelText}
                                      onChange={(e) => setEditingLabelText(e.target.value)}
                                      onBlur={() => {
                                        if (editingLabelText.trim() && onUpdateRowLabel) {
                                          onUpdateRowLabel(rowId, editingLabelText.trim());
                                        }
                                        setEditingLabelRowId(null);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          if (editingLabelText.trim() && onUpdateRowLabel) {
                                            onUpdateRowLabel(rowId, editingLabelText.trim());
                                          }
                                          setEditingLabelRowId(null);
                                        } else if (e.key === 'Escape') {
                                          setEditingLabelRowId(null);
                                        }
                                      }}
                                      className={`w-full ${adaptive.labelFont} font-semibold px-1.5 py-0.5 border border-emerald-600 dark:border-emerald-400 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500/25`}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  ) : (
                                    <div
                                      className="flex items-center gap-1.5 flex-1 min-w-0"
                                      title={
                                        rowId === 'salary'
                                          ? 'Click to select Salary & open Breakdown, or double-click to edit'
                                          : 'Click to select payment item, drag row to reorder, or double-click to rename'
                                      }
                                    >
                                      <span
                                        className={`${adaptive.paymentWrap} font-semibold ${adaptive.labelFont} ${labelTextClass} ${
                                          isLoanEmpty ? 'italic text-slate-400 dark:text-slate-500 font-normal' : ''
                                        }`}
                                      >
                                        {isLoanEmpty
                                          ? `${row.label} (Click Edit in popup to rename)`
                                          : rowId === 'salary' || rowId === 'balance'
                                          ? row.label.toUpperCase()
                                          : row.label}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          );
                        }

                        // 2. DYNAMIC HORIZONTALLY MERGED CELL SPAN
                        if (activeMerge && activeMerge.startIdx === colIdx && activeMerge.colSpan > 1) {
                          for (let k = activeMerge.startIdx + 1; k <= activeMerge.endIdx; k++) {
                            skipColIndices.add(k);
                          }
                          const primaryCol = resolveMergePrimaryColumn(
                            activeMerge.range,
                            effectiveColumnOrder
                          );
                          const mergedEndIsLast = activeMerge.endIdx === effectiveColumnOrder.length - 1;
                          const isSelectedThisMerge =
                            activeCell?.rowId === rowId && activeMerge.columns.includes(activeCell.column);
                          const isEditingThisMerge =
                            editingCell?.rowId === rowId && activeMerge.columns.includes(editingCell.column);
                          const primaryMeta = getCellMeta(rowId, primaryCol, row);
                          const mergedNote =
                            primaryMeta.noteText ||
                            activeMerge.columns
                              .map((c) => getCellMeta(rowId, c, row).noteText)
                              .find(Boolean);
                          const mergedTitle = `${row.label} (${activeMerge.columns
                            .map(getColumnDisplayLabel)
                            .join(' + ')})`;
                          const customPrimaryCol = customColMap[primaryCol];
                          const isPrimaryCurrency =
                            primaryCol === 'monthly' ||
                            primaryCol === 'cutoff15th' ||
                            (customPrimaryCol ? customPrimaryCol.type === 'currency' : false);

                          return (
                            <td
                              key={`merged_${activeMerge.columns.join('_')}`}
                              data-cell-key={`${rowId}::${primaryCol}`}
                              colSpan={activeMerge.colSpan}
                              data-merged="true"
                              title={`Merged cell: ${activeMerge.columns
                                .map(getColumnDisplayLabel)
                                .join(' + ')}`}
                              onClick={() =>
                                handleMergedCellClick(rowId, row, primaryCol, activeMerge.columns)
                              }
                              onDoubleClick={() =>
                                handleMergedCellDoubleClick(rowId, row, primaryCol)
                              }
                              className={`${adaptive.cellPad} ${
                                mergedEndIsLast ? '' : 'border-r border-slate-200/80 dark:border-slate-800/85'
                              } align-middle relative cursor-pointer select-none overflow-hidden ${
                                isPrimaryCurrency ? 'text-right font-medium' : 'text-center font-medium'
                              } ${getSelectedCellClass(isSelectedThisMerge)}`}
                            >
                              {renderModernNoteIndicator(mergedNote, rowId, primaryCol, mergedTitle)}

                              {isEditingThisMerge && !primaryMeta.isReadOnly ? (
                                <div className={`flex items-center justify-between gap-0.5 w-full bg-white dark:bg-slate-950 border border-emerald-600 dark:border-emerald-400 rounded-md ${adaptive.editPad} shadow-2xs`}>
                                  {isPrimaryCurrency && (
                                    <span className={`font-sans ${adaptive.symbolFont} text-slate-500 dark:text-slate-400 select-none shrink-0 font-medium`}>
                                      {currencySymbolClean}
                                    </span>
                                  )}
                                  <input
                                    type="text"
                                    autoFocus
                                    defaultValue={
                                      primaryCol === 'remarks' && rowId === 'metrobank'
                                        ? stripCurrencySymbols(row.remarks || '')
                                        : primaryMeta.rawInput
                                    }
                                    placeholder={isPrimaryCurrency ? '0.00' : 'Enter value'}
                                    onBlur={(e) => {
                                      if (skipNextBlurRef.current) {
                                        skipNextBlurRef.current = false;
                                        return;
                                      }
                                      if (primaryCol === 'monthly' || primaryCol === 'cutoff15th') {
                                        onUpdateCellInput(rowId, primaryCol, e.target.value);
                                      } else if (primaryCol === 'remarks') {
                                        onUpdateRemarks(
                                          rowId,
                                          rowId === 'metrobank'
                                            ? stripCurrencySymbols(e.target.value)
                                            : e.target.value
                                        );
                                      } else if (customPrimaryCol) {
                                        onUpdateCustomCellInput?.(
                                          rowId,
                                          primaryCol,
                                          e.target.value,
                                          customPrimaryCol.type
                                        );
                                      }
                                      setEditingCell(null);
                                    }}
                                    onKeyDown={(e) =>
                                      handleKeyDown(e, rowId, primaryCol, (val) => {
                                        if (primaryCol === 'monthly' || primaryCol === 'cutoff15th') {
                                          onUpdateCellInput(rowId, primaryCol, val);
                                        } else if (primaryCol === 'remarks') {
                                          onUpdateRemarks(
                                            rowId,
                                            rowId === 'metrobank' ? stripCurrencySymbols(val) : val
                                          );
                                        } else if (customPrimaryCol) {
                                          onUpdateCustomCellInput?.(
                                            rowId,
                                            primaryCol,
                                            val,
                                            customPrimaryCol.type
                                          );
                                        }
                                      })
                                    }
                                    className={`w-full bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none ${
                                      isPrimaryCurrency
                                        ? `text-right font-mono tabular-nums ${adaptive.numFont}`
                                        : `text-center font-sans ${adaptive.labelFont}`
                                    }`}
                                  />
                                </div>
                              ) : primaryCol === 'cutoff15th' || primaryCol === 'monthly' ? (
                                renderCurrencyCell(
                                  primaryCol === 'cutoff15th'
                                    ? row.cutoff15th?.value || row.monthly?.value || 0
                                    : row.monthly?.value || row.cutoff15th?.value || 0,
                                  primaryCol === 'cutoff15th'
                                    ? row.cutoff15th?.rawInput || row.monthly?.rawInput || ''
                                    : row.monthly?.rawInput || row.cutoff15th?.rawInput || '',
                                  rowId
                                )
                              ) : primaryCol === 'remarks' ? (
                                ['metrobank', 'total', 'salary', 'balance'].includes(rowId) ? (
                                  renderRemarksCurrency(row.remarks)
                                ) : row.remarks === 'OK' || row.remarks === 'Settled' ? (
                                  <span className={`inline-flex items-center justify-center gap-1 ${adaptive.remarksFont} font-semibold text-emerald-700 dark:text-emerald-300 tracking-tight max-w-full truncate`}>
                                    <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 stroke-[2.5]" />
                                    <span className="truncate">Settled</span>
                                  </span>
                                ) : row.remarks === 'Next Payroll' || row.remarks === 'Deferred' ? (
                                  <span className={`inline-flex items-center justify-center gap-1 ${adaptive.remarksFont} font-semibold text-amber-800 dark:text-amber-300 tracking-tight max-w-full truncate`}>
                                    <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 stroke-[2.25]" />
                                    <span className="truncate">Deferred</span>
                                  </span>
                                ) : (
                                  <span className={`inline-flex items-center justify-center px-1 ${adaptive.remarksFont} font-medium text-slate-400 dark:text-slate-500 max-w-full truncate`}>
                                    {row.remarks || '—'}
                                  </span>
                                )
                              ) : customPrimaryCol?.type === 'currency' ? (
                                renderCurrencyCell(
                                  row.customCells?.[primaryCol]?.value || 0,
                                  row.customCells?.[primaryCol]?.rawInput || '',
                                  rowId
                                )
                              ) : (
                                <span className={`block truncate px-0.5 ${adaptive.labelFont}`}>
                                  {row.customCells?.[primaryCol]?.rawInput || ''}
                                </span>
                              )}
                            </td>
                          );
                        }

                        // 2B. MONTHLY COLUMN (INDIVIDUAL)
                        if (colId === 'monthly') {
                          return (
                            <td
                              key={colId}
                              data-cell-key={`${rowId}::${colId}`}
                              onClick={() => handleCellClick(rowId, 'monthly', row)}
                              onDoubleClick={() => handleCellDoubleClick(rowId, 'monthly', row)}
                              className={`${adaptive.cellPad} ${borderRightClass} align-middle relative cursor-pointer select-none text-right font-medium overflow-hidden ${getSelectedCellClass(
                                isSelectedMonthly
                              )}`}
                            >
                              {renderModernNoteIndicator(row.monthly?.note, rowId, 'monthly', `${row.label} (Monthly)`)}

                              {isEditingMonthly && !row.readOnlyMonthly ? (
                                <div className={`flex items-center justify-between gap-0.5 w-full bg-white dark:bg-slate-950 border border-emerald-600 dark:border-emerald-400 rounded-md ${adaptive.editPad} shadow-2xs`}>
                                  <span className={`font-sans ${adaptive.symbolFont} text-slate-500 dark:text-slate-400 select-none shrink-0 font-medium`}>{currencySymbolClean}</span>
                                  <input
                                    type="text"
                                    autoFocus
                                    defaultValue={row.monthly?.rawInput || ''}
                                    placeholder="0.00"
                                    onBlur={(e) => {
                                      if (skipNextBlurRef.current) {
                                        skipNextBlurRef.current = false;
                                        return;
                                      }
                                      onUpdateCellInput(rowId, 'monthly', e.target.value);
                                      setEditingCell(null);
                                    }}
                                    onKeyDown={(e) =>
                                      handleKeyDown(e, rowId, 'monthly', (val) =>
                                        onUpdateCellInput(rowId, 'monthly', val)
                                      )
                                    }
                                    className={`w-full text-right bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums ${adaptive.numFont} focus:outline-none`}
                                  />
                                </div>
                              ) : (
                                renderCurrencyCell(row.monthly?.value || 0, row.monthly?.rawInput || '', rowId)
                              )}
                            </td>
                          );
                        }

                        // 3B. KINSENAS (15TH) COLUMN (INDIVIDUAL)
                        if (colId === 'cutoff15th') {
                          return (
                            <td
                              key={colId}
                              data-cell-key={`${rowId}::${colId}`}
                              onClick={() => handleCellClick(rowId, 'cutoff15th', row)}
                              onDoubleClick={() => handleCellDoubleClick(rowId, 'cutoff15th', row)}
                              className={`${adaptive.cellPad} ${borderRightClass} align-middle relative cursor-pointer select-none text-right font-medium overflow-hidden ${getSelectedCellClass(
                                isSelectedKinsenas
                              )}`}
                            >
                              {renderModernNoteIndicator(row.cutoff15th?.note, rowId, 'cutoff15th', `${row.label} (Kinsenas)`)}

                              {isEditingKinsenas && !row.readOnly15th ? (
                                <div className={`flex items-center justify-between gap-0.5 w-full bg-white dark:bg-slate-950 border border-emerald-600 dark:border-emerald-400 rounded-md ${adaptive.editPad} shadow-2xs`}>
                                  <span className={`font-sans ${adaptive.symbolFont} text-slate-500 dark:text-slate-400 select-none shrink-0 font-medium`}>{currencySymbolClean}</span>
                                  <input
                                    type="text"
                                    autoFocus
                                    defaultValue={row.cutoff15th?.rawInput || ''}
                                    placeholder="0.00"
                                    onBlur={(e) => {
                                      if (skipNextBlurRef.current) {
                                        skipNextBlurRef.current = false;
                                        return;
                                      }
                                      onUpdateCellInput(rowId, 'cutoff15th', e.target.value);
                                      setEditingCell(null);
                                    }}
                                    onKeyDown={(e) =>
                                      handleKeyDown(e, rowId, 'cutoff15th', (val) =>
                                        onUpdateCellInput(rowId, 'cutoff15th', val)
                                      )
                                    }
                                    className={`w-full text-right bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums ${adaptive.numFont} focus:outline-none`}
                                  />
                                </div>
                              ) : (
                                renderCurrencyCell(row.cutoff15th?.value || 0, row.cutoff15th?.rawInput || '', rowId)
                              )}
                            </td>
                          );
                        }

                        // 4. REMARKS COLUMN
                        if (colId === 'remarks') {
                          return (
                            <td
                              key={colId}
                              data-cell-key={`${rowId}::${colId}`}
                              onClick={() => handleCellClick(rowId, 'remarks', row)}
                              className={`${adaptive.cellPad} ${borderRightClass} align-middle text-center relative overflow-hidden ${getSelectedCellClass(
                                isSelectedRemarks
                              )}`}
                            >
                              {renderModernNoteIndicator(row.remarksNote, rowId, 'remarks', `${row.label} (Remarks)`)}

                              {!['metrobank', 'total', 'salary', 'balance'].includes(rowId) && (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectCell(null as any, null as any, '', '');
                                    setRemarksPopupTarget({
                                      rowId,
                                      rowLabel: row.label,
                                      currentRemarks: row.remarks || '',
                                    });
                                  }}
                                  className="flex items-center justify-center cursor-pointer py-0.5 group/rem min-w-0"
                                  title="Click to choose: Settled, Deferred, or Clear"
                                >
                                  {row.remarks === 'OK' || row.remarks === 'Settled' ? (
                                    <span className={`inline-flex items-center justify-center gap-1 ${adaptive.remarksFont} font-semibold text-emerald-700 dark:text-emerald-300 tracking-tight group-hover/rem:text-emerald-800 dark:group-hover/rem:text-emerald-200 transition-colors max-w-full truncate`}>
                                      <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 stroke-[2.5]" />
                                      <span className="truncate">Settled</span>
                                    </span>
                                  ) : row.remarks === 'Next Payroll' || row.remarks === 'Deferred' ? (
                                    <span className={`inline-flex items-center justify-center gap-1 ${adaptive.remarksFont} font-semibold text-amber-800 dark:text-amber-300 tracking-tight group-hover/rem:text-amber-900 dark:group-hover/rem:text-amber-200 transition-colors max-w-full truncate`}>
                                      <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0 stroke-[2.25]" />
                                      <span className="truncate">Deferred</span>
                                    </span>
                                  ) : (
                                    <span
                                      className={`${adaptive.remarksFont} font-medium transition-colors px-1 py-0.5 truncate max-w-full ${
                                        isSpecialFillRow
                                          ? 'text-slate-600/80 dark:text-slate-300/75 hover:text-slate-900 dark:hover:text-white'
                                          : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                                      }`}
                                    >
                                      —
                                    </span>
                                  )}
                                </div>
                              )}

                              {rowId === 'metrobank' && (
                                <div className="w-full min-w-0">
                                  {isEditingRemarks ? (
                                    <div className={`flex items-center justify-between gap-0.5 w-full bg-white dark:bg-slate-950 border border-emerald-600 dark:border-emerald-400 rounded-md ${adaptive.editPad} shadow-2xs`}>
                                      <span className={`font-sans ${adaptive.symbolFont} text-slate-500 dark:text-slate-400 select-none shrink-0 font-medium`}>{currencySymbolClean}</span>
                                      <input
                                        type="text"
                                        autoFocus
                                        defaultValue={stripCurrencySymbols(row.remarks || '')}
                                        placeholder="0.00"
                                        onBlur={(e) => {
                                          if (skipNextBlurRef.current) {
                                            skipNextBlurRef.current = false;
                                            return;
                                          }
                                          onUpdateRemarks(rowId, stripCurrencySymbols(e.target.value));
                                          setEditingCell(null);
                                        }}
                                        onKeyDown={(e) =>
                                          handleKeyDown(e, rowId, 'remarks', (val) =>
                                            onUpdateRemarks(rowId, stripCurrencySymbols(val))
                                          )
                                        }
                                        className={`w-full text-right bg-transparent text-slate-900 dark:text-slate-100 font-mono tabular-nums ${adaptive.numFont} focus:outline-none`}
                                      />
                                    </div>
                                  ) : (
                                    <div
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectCell(null as any, null as any, '', '');
                                        setEditingCell({ rowId, column: 'remarks' });
                                      }}
                                      className="w-full cursor-text py-0.5 min-w-0"
                                      title="Click to input actual withdrawn money"
                                    >
                                      {renderRemarksCurrency(row.remarks)}
                                    </div>
                                  )}
                                </div>
                              )}

                              {['total', 'salary', 'balance'].includes(rowId) && (
                                <div className="w-full min-w-0">
                                  {renderRemarksCurrency(row.remarks)}
                                </div>
                              )}
                            </td>
                          );
                        }

                        // 5. CUSTOM USER-ADDED COLUMN
                        const customCol = customColMap[colId];
                        if (!customCol) return null;
                        const customCell = row.customCells?.[colId];
                        const isEditingCustom =
                          editingCell?.rowId === rowId && editingCell?.column === colId;
                        const isSelectedCustom =
                          activeCell?.rowId === rowId && activeCell?.column === colId;

                        return (
                          <td
                            key={colId}
                            data-cell-key={`${rowId}::${colId}`}
                            onClick={() => handleCellClick(rowId, colId, row)}
                            onDoubleClick={() => handleCellDoubleClick(rowId, colId, row)}
                            className={`${adaptive.cellPad} ${borderRightClass} align-middle relative cursor-pointer select-none overflow-hidden ${
                              customCol.type === 'currency' ? 'text-right font-medium' : 'text-center font-normal'
                            } ${getSelectedCellClass(isSelectedCustom)}`}
                          >
                            {renderModernNoteIndicator(
                              customCell?.note,
                              rowId,
                              colId,
                              `${row.label} (${customCol.label})`
                            )}

                            {isEditingCustom ? (
                              <div className={`flex items-center justify-between gap-0.5 w-full bg-white dark:bg-slate-950 border border-emerald-600 dark:border-emerald-400 rounded-md ${adaptive.editPad} shadow-2xs`}>
                                {customCol.type === 'currency' && (
                                  <span className={`font-sans ${adaptive.symbolFont} text-slate-500 dark:text-slate-400 select-none shrink-0 font-medium`}>
                                    {currencySymbolClean}
                                  </span>
                                )}
                                <input
                                  type="text"
                                  autoFocus
                                  defaultValue={customCell?.rawInput || ''}
                                  placeholder={customCol.type === 'currency' ? '0.00' : 'Enter text'}
                                  onBlur={(e) => {
                                    if (skipNextBlurRef.current) {
                                      skipNextBlurRef.current = false;
                                      return;
                                    }
                                    onUpdateCustomCellInput?.(rowId, colId, e.target.value, customCol.type);
                                    setEditingCell(null);
                                  }}
                                  onKeyDown={(e) =>
                                    handleKeyDown(e, rowId, colId, (val) =>
                                      onUpdateCustomCellInput?.(rowId, colId, val, customCol.type)
                                    )
                                  }
                                  className={`w-full bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none ${
                                    customCol.type === 'currency'
                                      ? `text-right font-mono tabular-nums ${adaptive.numFont}`
                                      : `text-center font-sans ${adaptive.labelFont}`
                                  }`}
                                />
                              </div>
                            ) : customCol.type === 'currency' ? (
                              renderCurrencyCell(customCell?.value || 0, customCell?.rawInput || '', rowId)
                            ) : (
                              <span className={`block truncate px-0.5 ${adaptive.labelFont}`}>
                                {customCell?.rawInput || ''}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sleek Floating Micro-Action Bar for Active Cell (Non-Blocking, Replaces Redundant Popups) */}
      {activeCell && !editingCell && !editingLabelRowId && (
        <div
          ref={activeCellPopupRef}
          className="fixed pb-floating-bottom left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-md text-white px-3.5 sm:px-4 py-2 rounded-full shadow-2xl border border-slate-700 dark:border-slate-600 flex items-center gap-2 lg:gap-2.5 text-xs sm:text-[13px] lg:text-sm select-none animate-in slide-in-from-bottom-3 duration-150 max-w-[94vw] overflow-x-auto"
        >
          {(() => {
            const activeRowObj = rows[activeCell.rowId];
            const activeRowRanges = getEffectiveRowMergeRanges(
              activeCell.rowId as RowId,
              activeRowObj,
              effectiveColumnOrder
            );
            const activeMergeMatch = findMergeRangeCoveringColumn(
              activeRowRanges,
              activeCell.column,
              effectiveColumnOrder
            );
            const canMergeActiveCol =
              canColumnMerge(activeCell.column) && mergeableColumnIds.length >= 2;

            return (
              <>
                {/* Title box: Hidden for formula rows (qr_ph, metrobank, total, salary, balance) on monthly/cutoff15th */}
                {(!['qr_ph', 'metrobank', 'total', 'salary', 'balance'].includes(activeCell.rowId) ||
                  Boolean(customColMap[activeCell.column]) ||
                  Boolean(activeMergeMatch)) && (
                  <div className="flex items-center gap-1.5 max-w-[170px] sm:max-w-[230px] lg:max-w-[300px] truncate pr-2 border-r border-slate-700 dark:border-slate-600">
                    {activeMergeMatch ? (
                      <span className="text-[11px] sm:text-xs text-sky-400 font-mono uppercase font-bold shrink-0">
                        Merged:
                      </span>
                    ) : activeCell.column === 'payments' ? (
                      <span className="text-[11px] sm:text-xs text-emerald-400 font-mono uppercase font-bold shrink-0">
                        Item:
                      </span>
                    ) : activeCell.column === 'remarks' ? (
                      <span className="text-[11px] sm:text-xs text-emerald-400 font-mono uppercase font-bold shrink-0">
                        Remarks:
                      </span>
                    ) : customColMap[activeCell.column] ? (
                      <span className="text-[11px] sm:text-xs text-sky-400 font-mono uppercase font-bold truncate max-w-[90px]">
                        {customColMap[activeCell.column].label}:
                      </span>
                    ) : null}
                    <span className="font-semibold text-slate-100 truncate text-xs sm:text-[13px] lg:text-sm">
                      {activeCell.rowLabel}
                    </span>
                  </div>
                )}

                {/* Edit Formula button for rows from QR PH to Balance */}
                {['qr_ph', 'metrobank', 'total', 'salary', 'balance'].includes(activeCell.rowId) &&
                  (activeCell.column === 'monthly' || activeCell.column === 'cutoff15th') && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormulaModalTarget({
                          rowId: activeCell.rowId as RowId,
                          rowLabel: activeCell.rowLabel,
                          column: activeCell.column,
                        });
                      }}
                      className="flex items-center gap-1.5 px-3 py-1 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white rounded-full font-bold transition-all cursor-pointer text-[11px] sm:text-xs lg:text-sm shadow-md border border-purple-400/40 shrink-0"
                      title="Edit Formula"
                    >
                      <span className="italic font-serif font-bold text-xs lg:text-sm bg-purple-900/60 px-1 rounded">fx</span>
                      <span>Edit Formula</span>
                    </button>
                  )}

                {/* Quick Salary Breakdown button if salary cell is active */}
                {activeCell.rowId === 'salary' &&
                  (activeCell.column === 'monthly' || activeCell.column === 'cutoff15th' || activeCell.column === 'payments') &&
                  onOpenSalaryModal && (
                    <button
                      type="button"
                      onClick={onOpenSalaryModal}
                      className="flex items-center gap-1 px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-full font-semibold transition-colors cursor-pointer text-[11px] lg:text-xs shadow-xs shrink-0"
                      title="Open Base Salary & Previous Balance Breakdown"
                    >
                      <Calculator className="w-3 h-3" />
                      <span>Breakdown</span>
                    </button>
                  )}

                <button
                  type="button"
                  onClick={() => {
                    if (activeCell.column === 'payments') {
                      setEditingLabelRowId(activeCell.rowId as RowId);
                      setEditingLabelText(activeCell.currentInput || activeCell.rowLabel);
                    } else {
                      setEditingCell({
                        rowId: activeCell.rowId as RowId,
                        column: activeCell.column,
                      });
                    }
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white/15 hover:bg-white/25 active:bg-white/35 rounded-full font-semibold transition-colors cursor-pointer text-white text-[11px] sm:text-xs lg:text-sm shrink-0"
                  title="Edit Cell"
                >
                  <Edit2 className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-emerald-400" />
                  <span>Edit</span>
                </button>

                {/* Merge / Unmerge Controls */}
                {activeMergeMatch && onUnmergeRowCells && (
                  <button
                    type="button"
                    onClick={() => {
                      onUnmergeRowCells(activeCell.rowId as RowId, activeCell.column);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-400/40 rounded-full font-semibold transition-colors cursor-pointer text-[11px] sm:text-xs lg:text-sm shrink-0"
                    title={`Unmerge ${activeMergeMatch.columns.map(getColumnDisplayLabel).join(' + ')}`}
                  >
                    <Split className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-amber-300" />
                    <span>Unmerge</span>
                  </button>
                )}

                {canMergeActiveCol && onMergeRowCells && (
                  <button
                    type="button"
                    onClick={() => {
                      openMergeModalForRow(activeCell.rowId as RowId, activeCell.column);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-sky-500/20 hover:bg-sky-500/35 text-sky-200 border border-sky-400/40 rounded-full font-semibold transition-colors cursor-pointer text-[11px] sm:text-xs lg:text-sm shrink-0"
                    title="Choose where to merge cells on this row"
                  >
                    <Combine className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-sky-300" />
                    <span>{activeMergeMatch ? 'Where' : 'Merge'}</span>
                  </button>
                )}

                {onReorderRows && (() => {
                  const activeRowIndex = effectiveRowOrder.indexOf(activeCell.rowId);
                  if (activeRowIndex === -1) return null;
                  return (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={activeRowIndex === 0}
                        onClick={() => handleMoveRow(activeRowIndex, activeRowIndex - 1)}
                        className="p-1.5 bg-white/10 hover:bg-white/25 disabled:opacity-30 disabled:pointer-events-none rounded-full text-slate-200 transition-colors cursor-pointer"
                        title="Move Row Up"
                        aria-label="Move Row Up"
                      >
                        <ArrowUp className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={activeRowIndex === effectiveRowOrder.length - 1}
                        onClick={() => handleMoveRow(activeRowIndex, activeRowIndex + 1)}
                        className="p-1.5 bg-white/10 hover:bg-white/25 disabled:opacity-30 disabled:pointer-events-none rounded-full text-slate-200 transition-colors cursor-pointer"
                        title="Move Row Down"
                        aria-label="Move Row Down"
                      >
                        <ArrowDown className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                      </button>
                    </div>
                  );
                })()}

                {activeCell.column !== 'payments' && activeCell.currentInput && (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeCell.column === 'monthly' || activeCell.column === 'cutoff15th') {
                        onUpdateCellInput(activeCell.rowId as RowId, activeCell.column, '');
                      } else if (activeCell.column === 'remarks') {
                        onUpdateRemarks(activeCell.rowId as RowId, '');
                      } else if (customColMap[activeCell.column]) {
                        onUpdateCustomCellInput?.(
                          activeCell.rowId as RowId,
                          activeCell.column,
                          '',
                          customColMap[activeCell.column].type
                        );
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-rose-300 hover:bg-rose-950/50 active:bg-rose-900/60 rounded-full font-medium transition-colors cursor-pointer text-[11px] sm:text-xs lg:text-sm shrink-0"
                    title="Clear Value"
                  >
                    <Trash2 className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-rose-400" />
                    <span className="hidden sm:inline">Clear</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onOpenNotePopover(
                      activeCell.rowId as RowId,
                      activeCell.column,
                      activeCell.note || '',
                      `${activeCell.rowLabel} (${getColumnDisplayLabel(activeCell.column)})`
                    );
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-amber-300 hover:bg-amber-950/50 active:bg-amber-900/60 rounded-full font-medium transition-colors cursor-pointer text-[11px] sm:text-xs lg:text-sm shrink-0"
                  title="Add or Edit Cell Note"
                >
                  <Sparkles className="w-3 h-3 lg:w-3.5 lg:h-3.5 text-amber-400" />
                  <span>{activeCell.note ? 'Note ✓' : 'Note'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onSelectCell(null as any, null as any, '', '')}
                  className="p-1 text-slate-400 hover:text-white rounded-full transition-colors ml-0.5 cursor-pointer shrink-0"
                  title="Deselect"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* DEDICATED REMARKS POPUP (SLEEK, MODERN 3-BUTTON SELECTOR) */}
      {remarksPopupTarget && (
        <div
          className="pb-modal-backdrop z-50 flex items-center justify-center animate-in fade-in duration-100"
          onClick={() => setRemarksPopupTarget(null)}
        >
          {/* Subtle click-away, non-obscuring */}
          <div className="fixed inset-0 bg-slate-900/25 dark:bg-slate-950/60 backdrop-blur-[1px]" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="pb-modal-card relative z-10 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border-2 border-slate-900 dark:border-slate-700 w-full max-w-xs lg:max-w-sm p-3.5 lg:p-4 text-xs lg:text-sm font-sans animate-in zoom-in-95 duration-100 overflow-y-auto overscroll-contain"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] lg:text-xs uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                  Remarks:
                </span>
                <span className="font-bold text-slate-900 dark:text-slate-100 text-xs lg:text-sm truncate max-w-[150px] lg:max-w-[200px]">
                  {remarksPopupTarget.rowLabel}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setRemarksPopupTarget(null)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white p-0.5 rounded cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* The 3 Options: Settled, Deferred, Clear in high-speed 3-column tactile grid */}
            <div className="grid grid-cols-3 gap-2">
              {/* Option 1: Settled */}
              <button
                type="button"
                onClick={() => {
                  onUpdateRemarks(remarksPopupTarget.rowId, 'OK');
                  setRemarksPopupTarget(null);
                }}
                className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-lg border text-xs lg:text-sm font-bold transition-all cursor-pointer ${
                  remarksPopupTarget.currentRemarks === 'OK' ||
                  remarksPopupTarget.currentRemarks === 'Settled'
                    ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                    : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                }`}
              >
                <Check className="w-4 h-4 mb-0.5" />
                <span>Settled</span>
              </button>

              {/* Option 2: Deferred */}
              <button
                type="button"
                onClick={() => {
                  onUpdateRemarks(remarksPopupTarget.rowId, 'Next Payroll');
                  setRemarksPopupTarget(null);
                }}
                className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-lg border text-xs lg:text-sm font-bold transition-all cursor-pointer ${
                  remarksPopupTarget.currentRemarks === 'Next Payroll' ||
                  remarksPopupTarget.currentRemarks === 'Deferred'
                    ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                    : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60'
                }`}
              >
                <Clock className="w-4 h-4 mb-0.5" />
                <span>Deferred</span>
              </button>

              {/* Option 3: Clear (—) */}
              <button
                type="button"
                onClick={() => {
                  onUpdateRemarks(remarksPopupTarget.rowId, '');
                  setRemarksPopupTarget(null);
                }}
                className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-lg border text-xs lg:text-sm font-medium transition-all cursor-pointer ${
                  !remarksPopupTarget.currentRemarks || remarksPopupTarget.currentRemarks === 'None'
                    ? 'bg-slate-700 dark:bg-slate-600 text-white border-slate-800 dark:border-slate-500 shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <X className="w-4 h-4 mb-0.5" />
                <span>Clear</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transparent click-away backdrop & Fixed Portal-like Dropdown for payment 3-dots menu */}
      {paymentMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setPaymentMenuOpen(false)}
          />
          {paymentMenuPos && (
            <div
              style={{ top: paymentMenuPos.top, left: paymentMenuPos.left }}
              className="pb-modal-card fixed w-44 lg:w-48 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl py-1 z-50 font-sans normal-case text-left animate-in fade-in zoom-in-95 duration-100 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  setPaymentMenuOpen(false);
                  setHeaderInputText(monthData.columnHeaders?.payments || 'PAYMENTS');
                  setEditingHeader('payments');
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs lg:text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                <span>Edit Title</span>
              </button>
              <div className="border-t border-slate-100 dark:border-slate-800 my-0.5" />
              <button
                type="button"
                onClick={() => {
                  setPaymentMenuOpen(false);
                  const defaultIdx =
                    effectiveRowOrder.indexOf('qr_ph') !== -1
                      ? effectiveRowOrder.indexOf('qr_ph')
                      : effectiveRowOrder.indexOf('total') !== -1
                      ? effectiveRowOrder.indexOf('total')
                      : effectiveRowOrder.length;
                  setNewItemInsertIndex(defaultIdx);
                  setNewItemName('');
                  setNewItemMonthly('');
                  setNewItemKinsenas('');
                  setIsAddNewModalOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs lg:text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 hover:text-emerald-900 dark:hover:text-emerald-300 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Add New</span>
              </button>
              <div className="border-t border-slate-100 dark:border-slate-800 my-0.5" />
              <button
                type="button"
                onClick={() => {
                  setPaymentMenuOpen(false);
                  setIsRemoveModalOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs lg:text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>Remove</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* MODAL 1: ADD NEW PAYMENT LINE ITEM WITH INSERTION POSITION PICKER */}
      {isAddNewModalOpen && (
        <div
          onClick={() => setIsAddNewModalOpen(false)}
          className="pb-modal-backdrop z-50 flex items-center justify-center bg-black/60 dark:bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            className="pb-modal-card bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-slate-300 dark:border-slate-700 w-full max-w-md lg:max-w-lg flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-900 dark:bg-slate-950 text-white shrink-0">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm lg:text-base font-bold">Add New Line Item</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddNewModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newItemName.trim()) return;
                const mVal = parseFloat(newItemMonthly.replace(/,/g, '')) || 0;
                const kVal = parseFloat(newItemKinsenas.replace(/,/g, '')) || 0;
                if (onAddNewPaymentItem) {
                  onAddNewPaymentItem(newItemName.trim(), mVal, kVal, newItemInsertIndex);
                } else if (onAddPaymentRow) {
                  onAddPaymentRow();
                }
                setNewItemName('');
                setNewItemMonthly('');
                setNewItemKinsenas('');
                setIsAddNewModalOpen(false);
              }}
              className="p-4 lg:p-5 space-y-4 text-slate-900 dark:text-slate-100 overflow-y-auto overscroll-contain flex-1 min-h-0"
            >
              <div>
                <label className="block text-xs lg:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Line Item Name *
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="e.g. WiFi / Fiber Internet, Car Loan, Insurance"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full text-xs lg:text-sm px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs lg:text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Monthly Amount ({currencySymbolClean})
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={newItemMonthly}
                    onChange={(e) => setNewItemMonthly(e.target.value)}
                    className="w-full text-xs lg:text-sm px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs lg:text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    15th / Kinsenas ({currencySymbolClean})
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0.00"
                    value={newItemKinsenas}
                    onChange={(e) => setNewItemKinsenas(e.target.value)}
                    className="w-full text-xs lg:text-sm px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs lg:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Where should this item be inserted?
                </label>
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-44 overflow-y-auto">
                  {Array.from({ length: effectiveRowOrder.length + 1 }, (_, slotIdx) => {
                    const getRowLabel = (id: string) => rows[id]?.label || id;
                    let slotLabel = '';
                    if (slotIdx === 0) {
                      slotLabel = `At the top (before ${getRowLabel(effectiveRowOrder[0])})`;
                    } else if (slotIdx === effectiveRowOrder.length) {
                      slotLabel = `At the bottom (after ${getRowLabel(effectiveRowOrder[slotIdx - 1])})`;
                    } else {
                      slotLabel = `Between ${getRowLabel(effectiveRowOrder[slotIdx - 1])} & ${getRowLabel(effectiveRowOrder[slotIdx])}`;
                    }
                    const isSelectedSlot = newItemInsertIndex === slotIdx;

                    return (
                      <button
                        key={slotIdx}
                        type="button"
                        onClick={() => setNewItemInsertIndex(slotIdx)}
                        className={`w-full px-3 py-2 text-left text-xs lg:text-sm flex items-center justify-between transition-colors cursor-pointer ${
                          isSelectedSlot
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-200 font-bold'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium'
                        }`}
                      >
                        <span className="truncate pr-2">{slotLabel}</span>
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelectedSlot
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {isSelectedSlot && <Check className="w-2.5 h-2.5" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Compact Neighbor Preview */}
              <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5">
                <div className="text-[10px] lg:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Row Position Preview
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(() => {
                    const clampedIdx = Math.max(0, Math.min(effectiveRowOrder.length, newItemInsertIndex));
                    const prevId = clampedIdx > 0 ? effectiveRowOrder[clampedIdx - 1] : null;
                    const nextId = clampedIdx < effectiveRowOrder.length ? effectiveRowOrder[clampedIdx] : null;
                    const previewLabel = newItemName.trim() || 'New Line Item';

                    return (
                      <>
                        {prevId && (
                          <>
                            <span className="px-2 py-0.5 rounded text-[10px] lg:text-xs font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                              {rows[prevId]?.label || prevId}
                            </span>
                            <span className="text-slate-400 text-xs">↓</span>
                          </>
                        )}
                        <span className="px-2 py-0.5 rounded text-[10px] lg:text-xs font-bold bg-emerald-600 text-white border border-emerald-700 shadow-xs">
                          + {previewLabel}
                        </span>
                        {nextId && (
                          <>
                            <span className="text-slate-400 text-xs">↓</span>
                            <span className="px-2 py-0.5 rounded text-[10px] lg:text-xs font-semibold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                              {rows[nextId]?.label || nextId}
                            </span>
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              <p className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/70 p-2.5 rounded border border-slate-200 dark:border-slate-700 leading-relaxed">
                Items added under Payments are automatically computed into Metrobank and Total expense summaries.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddNewModalOpen(false)}
                  className="px-3 py-1.5 text-xs lg:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newItemName.trim()}
                  className="px-4 py-1.5 text-xs lg:text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-40 rounded shadow-xs cursor-pointer"
                >
                  Add Line Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: REMOVE ITEMS UNDER PAYMENT (EXCLUDING qr_ph, metrobank, total, salary, balance) */}
      {isRemoveModalOpen && (
        <div
          onClick={() => {
            setIsRemoveModalOpen(false);
            setRemovedNotice(null);
          }}
          className="pb-modal-backdrop z-50 flex items-center justify-center bg-black/60 dark:bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            className="pb-modal-card bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-slate-300 dark:border-slate-700 w-full max-w-lg lg:max-w-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-rose-900 dark:bg-rose-950 text-white shrink-0">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-300" />
                <div>
                  <h3 className="text-sm lg:text-base font-bold">Remove Payment Line Items</h3>
                  <p className="text-[10px] lg:text-xs text-rose-200">
                    Excludes QR PH, Metrobank, Total, Salary, Balance, MP2, and GoTyme
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsRemoveModalOpen(false);
                  setRemovedNotice(null);
                }}
                className="text-rose-200 hover:text-white p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3 text-slate-900 dark:text-slate-100">
              {removedNotice && (
                <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 px-3 py-2 rounded text-xs lg:text-sm font-semibold flex items-center justify-between animate-in fade-in">
                  <span>{removedNotice}</span>
                  <button onClick={() => setRemovedNotice(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">×</button>
                </div>
              )}

              <div className="text-xs lg:text-sm text-slate-600 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 p-2.5 rounded flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <span>
                  Tap <strong>Remove</strong> beside any line item below to delete it from this sheet. Core balance, summary, and savings rows are protected.
                </span>
              </div>

              {(() => {
                // Exclude QR PH, Metrobank, Total, Salary, Balance, MP2, and GoTyme
                const EXCLUDED_IDS = ['qr_ph', 'metrobank', 'total', 'salary', 'balance', 'mp2', 'gotyme'];
                const removableRows = effectiveRowOrder
                  .filter((id) => !EXCLUDED_IDS.includes(id))
                  .map((id) => ({
                    id,
                    row: rows[id],
                    label: rows[id]?.label || id,
                    monthlyVal: rows[id]?.monthly?.value || 0,
                    cutoffVal: rows[id]?.cutoff15th?.value || 0,
                  }))
                  .filter((item) => Boolean(item.row));

                if (removableRows.length === 0) {
                  return (
                    <div className="p-6 text-center text-xs lg:text-sm text-slate-500 dark:text-slate-400">
                      No removable payment items found.
                    </div>
                  );
                }

                return (
                  <div className="border border-slate-200 dark:border-slate-700 rounded divide-y divide-slate-100 dark:divide-slate-800">
                    {removableRows.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 flex items-center justify-between gap-3 text-xs lg:text-sm hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                            {item.label}
                          </div>
                          <div className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3 font-mono mt-0.5">
                            <span>M: {formatCurrency(item.monthlyVal || 0)}</span>
                            <span>·</span>
                            <span>15th: {formatCurrency(item.cutoffVal || 0)}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (onDeleteRow) {
                              onDeleteRow(item.id);
                            } else if (onDeleteCustomRow) {
                              onDeleteCustomRow(item.id);
                            }
                            setRemovedNotice(`✓ Removed "${item.label}" from Payments`);
                            setTimeout(() => setRemovedNotice(null), 3000);
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs lg:text-sm font-semibold text-rose-700 dark:text-rose-300 hover:text-rose-900 dark:hover:text-rose-200 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 rounded transition-colors cursor-pointer shrink-0 active:scale-95"
                          title={`Remove ${item.label}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                          <span>Remove</span>
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsRemoveModalOpen(false)}
                className="px-4 py-1.5 text-xs lg:text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transparent click-away backdrop & Fixed Portal-like Dropdown for Table Title 3-dots menu */}
      {titleMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setTitleMenuOpen(false)}
          />
          {titleMenuPos && (
            <div
              style={{ top: titleMenuPos.top, left: titleMenuPos.left }}
              className="pb-modal-card fixed w-48 lg:w-52 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg shadow-xl py-1 z-50 font-sans normal-case text-left animate-in fade-in zoom-in-95 duration-100 overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => {
                  setTitleMenuOpen(false);
                  setIsEditingTitle(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs lg:text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                <span>Edit Title</span>
              </button>
              <div className="border-t border-slate-100 dark:border-slate-800 my-0.5" />
              <button
                type="button"
                onClick={() => {
                  setTitleMenuOpen(false);
                  setNewColName('');
                  setNewColType('currency');
                  setNewColInsertIndex(effectiveColumnOrder.length);
                  setIsAddColModalOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs lg:text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 hover:text-emerald-900 dark:hover:text-emerald-300 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Add New Column</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTitleMenuOpen(false);
                  openMergeModalForRow(
                    activeCell?.rowId as RowId | undefined,
                    activeCell?.column
                  );
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs lg:text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-sky-950/60 hover:text-sky-900 dark:hover:text-sky-300 transition-colors cursor-pointer"
              >
                <Combine className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                <span>Merge / Unmerge Cells...</span>
              </button>
              <div className="border-t border-slate-100 dark:border-slate-800 my-0.5" />
              <button
                type="button"
                onClick={() => {
                  setTitleMenuOpen(false);
                  setRemovedColNotice(null);
                  setIsRemoveColModalOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs lg:text-sm font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                <span>Remove Column</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* MODAL 3: ADD NEW COLUMN WITH INSERTION POSITION PICKER */}
      {isAddColModalOpen && (
        <div
          onClick={() => setIsAddColModalOpen(false)}
          className="pb-modal-backdrop z-50 flex items-center justify-center bg-black/60 dark:bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            className="pb-modal-card bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-slate-300 dark:border-slate-700 w-full max-w-md lg:max-w-lg flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-900 dark:bg-slate-950 text-white shrink-0">
              <div className="flex items-center gap-2">
                <Columns className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm lg:text-base font-bold">Add New Column</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddColModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newColName.trim()) return;
                onAddColumn?.(newColName.trim(), newColType, newColInsertIndex);
                setNewColName('');
                setIsAddColModalOpen(false);
              }}
              className="p-4 lg:p-5 space-y-4 text-slate-900 dark:text-slate-100 overflow-y-auto overscroll-contain flex-1 min-h-0"
            >
              <div>
                <label className="block text-xs lg:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Column Name *
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  placeholder="e.g. Due Date, Bank, Bonus, Extra"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  className="w-full text-xs lg:text-sm px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded focus:ring-2 focus:ring-slate-900 dark:focus:ring-emerald-500 focus:outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs lg:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Column Format
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setNewColType('currency')}
                    className={`py-2 px-3 rounded-lg border text-xs lg:text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      newColType === 'currency'
                        ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-500 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="font-mono">{currencySymbolClean}</span>
                    <span>Currency ({currencySymbolClean})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewColType('text')}
                    className={`py-2 px-3 rounded-lg border text-xs lg:text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      newColType === 'text'
                        ? 'bg-slate-900 dark:bg-emerald-600 text-white border-slate-900 dark:border-emerald-500 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>Aa</span>
                    <span>Text</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs lg:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Where should this column be inserted?
                </label>
                <div className="border border-slate-200 dark:border-slate-700 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                  {Array.from({ length: effectiveColumnOrder.length + 1 }, (_, slotIdx) => {
                    let slotLabel = '';
                    if (slotIdx === 0) {
                      slotLabel = `At the start (before ${getColumnDisplayLabel(effectiveColumnOrder[0])})`;
                    } else if (slotIdx === effectiveColumnOrder.length) {
                      slotLabel = `At the end (after ${getColumnDisplayLabel(effectiveColumnOrder[slotIdx - 1])})`;
                    } else {
                      slotLabel = `Between ${getColumnDisplayLabel(effectiveColumnOrder[slotIdx - 1])} & ${getColumnDisplayLabel(effectiveColumnOrder[slotIdx])}`;
                    }
                    const isSelectedSlot = newColInsertIndex === slotIdx;

                    return (
                      <button
                        key={slotIdx}
                        type="button"
                        onClick={() => setNewColInsertIndex(slotIdx)}
                        className={`w-full px-3 py-2 text-left text-xs lg:text-sm flex items-center justify-between transition-colors cursor-pointer ${
                          isSelectedSlot
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-200 font-bold'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium'
                        }`}
                      >
                        <span className="truncate pr-2">{slotLabel}</span>
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                            isSelectedSlot
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {isSelectedSlot && <Check className="w-2.5 h-2.5" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Live Preview of resulting column sequence */}
              <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5">
                <div className="text-[10px] lg:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Column Order Preview
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(() => {
                    const previewList = [...effectiveColumnOrder.map((id) => getColumnDisplayLabel(id))];
                    const clampedIdx = Math.max(0, Math.min(previewList.length, newColInsertIndex));
                    const previewLabel = newColName.trim() || 'NEW COLUMN';
                    previewList.splice(clampedIdx, 0, `__NEW__:${previewLabel}`);
                    return previewList.map((item, idx) => {
                      const isNew = item.startsWith('__NEW__:');
                      const label = isNew ? item.slice(8) : item;
                      return (
                        <React.Fragment key={idx}>
                          {idx > 0 && <span className="text-slate-400 text-xs">→</span>}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] lg:text-xs font-bold uppercase border ${
                              isNew
                                ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {isNew ? `+ ${label}` : label}
                          </span>
                        </React.Fragment>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddColModalOpen(false)}
                  className="px-3 py-1.5 text-xs lg:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newColName.trim()}
                  className="px-4 py-1.5 text-xs lg:text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-40 rounded shadow-xs cursor-pointer"
                >
                  Insert Column
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: REMOVE COLUMN PICKER */}
      {isRemoveColModalOpen && (
        <div
          onClick={() => {
            setIsRemoveColModalOpen(false);
            setRemovedColNotice(null);
          }}
          className="pb-modal-backdrop z-50 flex items-center justify-center bg-black/60 dark:bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            className="pb-modal-card bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-slate-300 dark:border-slate-700 w-full max-w-md lg:max-w-lg flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-rose-900 dark:bg-rose-950 text-white shrink-0">
              <div className="flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-300" />
                <div>
                  <h3 className="text-sm lg:text-base font-bold">Remove Column</h3>
                  <p className="text-[10px] lg:text-xs text-rose-200">
                    Choose which column to remove from {currentSheetTitle}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsRemoveColModalOpen(false);
                  setRemovedColNotice(null);
                }}
                className="text-rose-200 hover:text-white p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3 text-slate-900 dark:text-slate-100">
              {removedColNotice && (
                <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 px-3 py-2 rounded text-xs lg:text-sm font-semibold flex items-center justify-between animate-in fade-in">
                  <span>{removedColNotice}</span>
                  <button
                    type="button"
                    onClick={() => setRemovedColNotice(null)}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              )}

              <div className="text-xs lg:text-sm text-slate-600 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 p-2.5 rounded flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <span>
                  Tap <strong>Remove</strong> beside any column to remove it from this sheet. The primary <strong>PAYMENTS</strong> column is protected.
                </span>
              </div>

              <div className="border border-slate-200 dark:border-slate-700 rounded divide-y divide-slate-100 dark:divide-slate-800">
                {effectiveColumnOrder.map((colId) => {
                  const colLabel = getColumnDisplayLabel(colId);
                  const isPayments = colId === 'payments';
                  const customCol = customColMap[colId];
                  const typeLabel = isPayments
                    ? 'Primary Row Labels'
                    : customCol
                    ? `Custom · ${customCol.type === 'currency' ? `Currency (${currencySymbolClean})` : 'Text'}`
                    : 'Standard Column';

                  return (
                    <div
                      key={colId}
                      className="p-3 flex items-center justify-between gap-3 text-xs lg:text-sm hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-slate-100 uppercase truncate">
                          {colLabel}
                        </div>
                        <div className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {typeLabel}
                        </div>
                      </div>

                      {isPayments ? (
                        <span className="px-2.5 py-1 text-[10px] lg:text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded shrink-0">
                          Protected
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onRemoveColumn?.(colId);
                            setRemovedColNotice(`✓ Removed "${colLabel}" column`);
                            setTimeout(() => setRemovedColNotice(null), 3000);
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs lg:text-sm font-semibold text-rose-700 dark:text-rose-300 hover:text-rose-900 dark:hover:text-rose-200 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 rounded transition-colors cursor-pointer shrink-0 active:scale-95"
                          title={`Remove ${colLabel} column`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {hasMissingStandardColumns && onRestoreStandardColumns && (
                <div className="bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-center justify-between gap-3">
                  <div className="text-xs lg:text-sm text-blue-900 dark:text-blue-200">
                    One or more default columns are currently hidden/removed.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onRestoreStandardColumns();
                      setRemovedColNotice('✓ Restored default standard columns');
                      setTimeout(() => setRemovedColNotice(null), 3000);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs lg:text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors cursor-pointer shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restore Defaults</span>
                  </button>
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsRemoveColModalOpen(false);
                  setRemovedColNotice(null);
                }}
                className="px-4 py-1.5 text-xs lg:text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: MERGE & UNMERGE CELLS ("WHERE TO MERGE") */}
      {mergeModalState && (
        <div
          onClick={() => {
            setMergeModalState(null);
            setMergeModalNotice(null);
          }}
          className="pb-modal-backdrop z-50 flex items-center justify-center bg-black/60 dark:bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            className="pb-modal-card bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-300 dark:border-slate-700 w-full max-w-lg lg:max-w-xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-900 dark:bg-slate-950 text-white shrink-0">
              <div className="flex items-center gap-2">
                <Combine className="w-4 h-4 text-sky-400" />
                <div>
                  <h3 className="text-sm lg:text-base font-bold">Merge &amp; Unmerge Cells</h3>
                  <p className="text-[10px] lg:text-xs text-slate-300">
                    Choose a row and select where to merge columns together
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMergeModalState(null);
                  setMergeModalNotice(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const selectedRow = rows[mergeModalState.rowId];
              const currentRowRanges = getEffectiveRowMergeRanges(
                mergeModalState.rowId,
                selectedRow,
                effectiveColumnOrder
              );
              const idx1 = effectiveColumnOrder.indexOf(mergeModalState.startCol);
              const idx2 = effectiveColumnOrder.indexOf(mergeModalState.endCol);
              const spanStart = idx1 !== -1 && idx2 !== -1 ? Math.min(idx1, idx2) : -1;
              const spanEnd = idx1 !== -1 && idx2 !== -1 ? Math.max(idx1, idx2) : -1;
              const selectedSpanCols =
                spanStart !== -1 && spanEnd !== -1
                  ? effectiveColumnOrder.slice(spanStart, spanEnd + 1)
                  : [];
              const spanIsValid =
                selectedSpanCols.length >= 2 &&
                selectedSpanCols.every((c) => canColumnMerge(c));
              const canQuickMergeMonthlyKinsenas =
                effectiveColumnOrder.includes('monthly') &&
                effectiveColumnOrder.includes('cutoff15th') &&
                Math.abs(
                  effectiveColumnOrder.indexOf('monthly') -
                    effectiveColumnOrder.indexOf('cutoff15th')
                ) === 1;

              return (
                <>
                  <div className="p-4 lg:p-5 space-y-4 text-slate-900 dark:text-slate-100 overflow-y-auto overscroll-contain flex-1 min-h-0">
                    {mergeModalNotice && (
                      <div className="bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 px-3 py-2 rounded text-xs lg:text-sm font-semibold flex items-center justify-between">
                        <span>{mergeModalNotice}</span>
                        <button
                          type="button"
                          onClick={() => setMergeModalNotice(null)}
                          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        >
                          ×
                        </button>
                      </div>
                    )}

                    {/* Step 1: Select Row */}
                    <div>
                      <label className="block text-xs lg:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                        1. Select Row
                      </label>
                      <select
                        value={mergeModalState.rowId}
                        onChange={(e) => {
                          setMergeModalNotice(null);
                          setMergeModalState({
                            ...mergeModalState,
                            rowId: e.target.value as RowId,
                          });
                        }}
                        className="w-full text-xs lg:text-sm px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-lg focus:ring-2 focus:ring-sky-500 focus:outline-none font-semibold"
                      >
                        {effectiveRowOrder.map((rId) => {
                          const rObj = rows[rId];
                          if (!rObj) return null;
                          const rRanges = getEffectiveRowMergeRanges(rId, rObj, effectiveColumnOrder);
                          return (
                            <option key={rId} value={rId}>
                              {rObj.label}
                              {rRanges.length > 0 ? ` (${rRanges.length} merged)` : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Step 2: Active Merges on Selected Row */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs lg:text-sm font-bold text-slate-700 dark:text-slate-300">
                          Active Merged Cells on &ldquo;{selectedRow?.label}&rdquo;
                        </span>
                        <span className="text-[10px] lg:text-xs font-mono text-slate-500 dark:text-slate-400">
                          {currentRowRanges.length} active
                        </span>
                      </div>

                      {currentRowRanges.length === 0 ? (
                        <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2.5">
                          No merged cells on this row yet. All data columns display separately.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {currentRowRanges.map((rng, i) => {
                            const sI = effectiveColumnOrder.indexOf(rng.startCol);
                            const eI = effectiveColumnOrder.indexOf(rng.endCol);
                            const colsInRange = effectiveColumnOrder.slice(
                              Math.min(sI, eI),
                              Math.max(sI, eI) + 1
                            );
                            return (
                              <div
                                key={`${rng.startCol}_${rng.endCol}_${i}`}
                                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800"
                              >
                                <div className="min-w-0">
                                  <div className="text-xs lg:text-sm font-bold text-sky-950 dark:text-sky-100 truncate">
                                    {colsInRange.map(getColumnDisplayLabel).join(' + ')}
                                  </div>
                                  <div className="text-[10px] lg:text-xs text-sky-700 dark:text-sky-300">
                                    Span: {colsInRange.length} contiguous columns
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onUnmergeRowCells?.(mergeModalState.rowId, rng.startCol);
                                    setMergeModalNotice(
                                      `✓ Unmerged ${colsInRange.map(getColumnDisplayLabel).join(' + ')}`
                                    );
                                  }}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200 dark:hover:bg-amber-800 border border-amber-300 dark:border-amber-700 rounded-md cursor-pointer shrink-0 transition-colors"
                                >
                                  <Split className="w-3.5 h-3.5" />
                                  <span>Unmerge</span>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Step 3: Visual "Where to Merge" Column Selector */}
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <label className="text-xs lg:text-sm font-bold text-slate-700 dark:text-slate-300">
                          2. Where to Merge (Click Start &amp; End Columns)
                        </label>
                        {canQuickMergeMonthlyKinsenas && (
                          <button
                            type="button"
                            onClick={() =>
                              setMergeModalState({
                                ...mergeModalState,
                                startCol: 'monthly',
                                endCol: 'cutoff15th',
                              })
                            }
                            className="text-[10px] lg:text-xs font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-slate-700 dark:text-sky-300 border border-slate-300 dark:border-slate-700 cursor-pointer transition-colors"
                          >
                            Preset: Monthly + Kinsenas
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {effectiveColumnOrder.map((colId, idx) => {
                          const locked = !canColumnMerge(colId);
                          const inSelectedSpan =
                            !locked && spanStart !== -1 && idx >= spanStart && idx <= spanEnd;
                          const isEndpoint =
                            colId === mergeModalState.startCol || colId === mergeModalState.endCol;

                          return (
                            <button
                              key={colId}
                              type="button"
                              disabled={locked}
                              onClick={() => {
                                if (locked) return;
                                // If clicking an already multi-col span endpoint or restarting selection cleanly:
                                if (
                                  mergeModalState.startCol === mergeModalState.endCol &&
                                  mergeModalState.startCol !== colId
                                ) {
                                  setMergeModalState({
                                    ...mergeModalState,
                                    endCol: colId,
                                  });
                                } else {
                                  setMergeModalState({
                                    ...mergeModalState,
                                    startCol: colId,
                                    endCol: colId,
                                  });
                                }
                              }}
                              className={`p-2 rounded-lg border text-left transition-all ${
                                locked
                                  ? 'bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                                  : inSelectedSpan
                                  ? 'bg-sky-600 dark:bg-sky-600 border-sky-700 dark:border-sky-400 text-white shadow-xs cursor-pointer'
                                  : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 hover:border-sky-400 cursor-pointer'
                              }`}
                            >
                              <div className="text-[11px] lg:text-xs font-bold uppercase truncate">
                                {getColumnDisplayLabel(colId)}
                              </div>
                              <div
                                className={`text-[9px] lg:text-[10px] mt-0.5 ${
                                  locked
                                    ? 'text-slate-400 dark:text-slate-600'
                                    : inSelectedSpan
                                    ? 'text-sky-100'
                                    : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {locked
                                  ? 'Label (Fixed)'
                                  : isEndpoint
                                  ? 'Selected'
                                  : inSelectedSpan
                                  ? 'Included'
                                  : 'Tap to pick'}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Explicit Dropdown Fallback for Start -> End Column */}
                      {mergeableColumnIds.length >= 2 && (
                        <div className="grid grid-cols-2 gap-2.5 mt-3">
                          <div>
                            <label className="block text-[10px] lg:text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                              From Column
                            </label>
                            <select
                              value={mergeModalState.startCol}
                              onChange={(e) =>
                                setMergeModalState({
                                  ...mergeModalState,
                                  startCol: e.target.value,
                                })
                              }
                              className="w-full text-xs lg:text-sm px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-md focus:ring-2 focus:ring-sky-500 focus:outline-none"
                            >
                              {mergeableColumnIds.map((cId) => (
                                <option key={cId} value={cId}>
                                  {getColumnDisplayLabel(cId)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] lg:text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                              To Column
                            </label>
                            <select
                              value={mergeModalState.endCol}
                              onChange={(e) =>
                                setMergeModalState({
                                  ...mergeModalState,
                                  endCol: e.target.value,
                                })
                              }
                              className="w-full text-xs lg:text-sm px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-md focus:ring-2 focus:ring-sky-500 focus:outline-none"
                            >
                              {mergeableColumnIds.map((cId) => (
                                <option key={cId} value={cId}>
                                  {getColumnDisplayLabel(cId)}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Preview Bar */}
                    <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                      <div className="text-[10px] lg:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                        Merge Span Preview
                      </div>
                      {spanIsValid ? (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs lg:text-sm font-bold text-sky-700 dark:text-sky-300">
                          <span className="px-2 py-0.5 rounded bg-sky-600 text-white text-[10px] lg:text-xs font-mono">
                            Span {selectedSpanCols.length}
                          </span>
                          <span>
                            {selectedSpanCols.map(getColumnDisplayLabel).join(' + ')}
                          </span>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Select at least 2 different mergeable columns (e.g., Monthly to Kinsenas).
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setMergeModalState(null);
                        setMergeModalNotice(null);
                      }}
                      className="px-3.5 py-1.5 text-xs lg:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded cursor-pointer"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      disabled={!spanIsValid}
                      onClick={() => {
                        if (!spanIsValid) return;
                        onMergeRowCells?.(
                          mergeModalState.rowId,
                          mergeModalState.startCol,
                          mergeModalState.endCol
                        );
                        setMergeModalNotice(
                          `✓ Merged ${selectedSpanCols.map(getColumnDisplayLabel).join(' + ')} on "${selectedRow?.label}"`
                        );
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs lg:text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-40 rounded shadow-xs cursor-pointer transition-colors"
                    >
                      <Combine className="w-3.5 h-3.5" />
                      <span>Merge Cells</span>
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Hover preview tooltip for notes */}
      {hoveredNote && (
        <div
          className="fixed z-50 bg-slate-900 dark:bg-slate-800 text-amber-300 text-xs lg:text-sm px-3 py-2 rounded-lg shadow-xl border border-slate-700 dark:border-slate-600 pointer-events-none max-w-xs lg:max-w-sm animate-in fade-in duration-100"
          style={{ top: hoveredNote.y, left: hoveredNote.x }}
        >
          <div className="font-bold text-[10px] lg:text-xs text-amber-500 uppercase tracking-wider mb-0.5">
            Excel Note:
          </div>
          <div className="text-slate-100 leading-relaxed break-words font-sans">
            {hoveredNote.text}
          </div>
        </div>
      )}

      {/* Dedicated Formula Editor Modal for rows from QR PH to Balance */}
      {formulaModalTarget && (
        <EditFormulaModal
          isOpen={Boolean(formulaModalTarget)}
          onClose={() => setFormulaModalTarget(null)}
          rowId={formulaModalTarget.rowId}
          rowLabel={formulaModalTarget.rowLabel}
          column={formulaModalTarget.column}
          monthData={monthData}
          onApplyFormula={(rId, col, newRaw) => {
            onUpdateCellInput(rId, col, newRaw);
          }}
          onOpenSalaryModal={onOpenSalaryModal}
        />
      )}
    </div>
  );
};
