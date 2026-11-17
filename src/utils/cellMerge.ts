import {
  BudgetRowState,
  CellColumn,
  CellMergeRange,
  MERGED_ROW_IDS,
  MonthData,
  RowId,
  StandardRowId,
} from '../types/budget';

export const DEFAULT_MERGE_COLUMN_ORDER: string[] = [
  'payments',
  'monthly',
  'cutoff15th',
  'remarks',
];

export function getEffectiveColumnOrderForMonth(month?: MonthData): string[] {
  const customIds = new Set((month?.columnHeaders?.customColumns || []).map((c) => c.id));
  const rawOrder = month?.columnHeaders?.columnOrder;
  if (!rawOrder || rawOrder.length === 0) return DEFAULT_MERGE_COLUMN_ORDER;
  const valid = rawOrder.filter(
    (id) =>
      id === 'payments' ||
      id === 'monthly' ||
      id === 'cutoff15th' ||
      id === 'remarks' ||
      customIds.has(id)
  );
  if (!valid.includes('payments')) valid.unshift('payments');
  return valid;
}

export function canColumnMerge(colId: CellColumn): boolean {
  return colId !== 'payments';
}

export function getEffectiveRowMergeRanges(
  rowId: RowId,
  row: BudgetRowState | undefined,
  columnOrder: string[] = DEFAULT_MERGE_COLUMN_ORDER
): CellMergeRange[] {
  if (!row) return [];

  // Default behavior for rows in MERGED_ROW_IDS when no custom merge override exists
  if (row.mergedRanges === undefined) {
    if (!MERGED_ROW_IDS.includes(rowId as StandardRowId)) return [];
    const mIdx = columnOrder.indexOf('monthly');
    const kIdx = columnOrder.indexOf('cutoff15th');
    if (mIdx !== -1 && kIdx !== -1 && Math.abs(mIdx - kIdx) === 1) {
      const startCol = mIdx < kIdx ? 'monthly' : 'cutoff15th';
      const endCol = mIdx < kIdx ? 'cutoff15th' : 'monthly';
      return [{ startCol, endCol }];
    }
    return [];
  }

  // Filter explicit ranges to valid, non-overlapping spans (>= 2 columns, excluding 'payments')
  const indexedRanges: Array<{ range: CellMergeRange; startIdx: number; endIdx: number }> = [];
  for (const r of row.mergedRanges) {
    if (!canColumnMerge(r.startCol) || !canColumnMerge(r.endCol)) continue;
    const i1 = columnOrder.indexOf(r.startCol);
    const i2 = columnOrder.indexOf(r.endCol);
    if (i1 === -1 || i2 === -1 || i1 === i2) continue;
    const startIdx = Math.min(i1, i2);
    const endIdx = Math.max(i1, i2);
    // Do not span across 'payments' if 'payments' sits between them
    const crossesPayments = columnOrder
      .slice(startIdx, endIdx + 1)
      .some((c) => !canColumnMerge(c));
    if (crossesPayments) continue;
    indexedRanges.push({
      range: {
        startCol: columnOrder[startIdx],
        endCol: columnOrder[endIdx],
      },
      startIdx,
      endIdx,
    });
  }

  indexedRanges.sort((a, b) => a.startIdx - b.startIdx);
  const nonOverlapping: CellMergeRange[] = [];
  let lastEnd = -1;
  for (const item of indexedRanges) {
    if (item.startIdx > lastEnd) {
      nonOverlapping.push(item.range);
      lastEnd = item.endIdx;
    }
  }
  return nonOverlapping;
}

export interface ResolvedMergeMatch {
  range: CellMergeRange;
  startIdx: number;
  endIdx: number;
  colSpan: number;
  columns: CellColumn[];
}

export function findMergeRangeCoveringColumn(
  ranges: CellMergeRange[],
  colId: CellColumn,
  columnOrder: string[]
): ResolvedMergeMatch | null {
  const colIdx = columnOrder.indexOf(colId);
  if (colIdx === -1) return null;

  for (const range of ranges) {
    const sIdx = columnOrder.indexOf(range.startCol);
    const eIdx = columnOrder.indexOf(range.endCol);
    if (sIdx === -1 || eIdx === -1) continue;
    const startIdx = Math.min(sIdx, eIdx);
    const endIdx = Math.max(sIdx, eIdx);
    if (colIdx >= startIdx && colIdx <= endIdx) {
      return {
        range,
        startIdx,
        endIdx,
        colSpan: endIdx - startIdx + 1,
        columns: columnOrder.slice(startIdx, endIdx + 1),
      };
    }
  }
  return null;
}

export function isMonthlyKinsenasMerged(
  rowId: RowId,
  row: BudgetRowState | undefined,
  columnOrder: string[] = DEFAULT_MERGE_COLUMN_ORDER
): boolean {
  const ranges = getEffectiveRowMergeRanges(rowId, row, columnOrder);
  const mMatch = findMergeRangeCoveringColumn(ranges, 'monthly', columnOrder);
  if (!mMatch) return false;
  return mMatch.columns.includes('cutoff15th');
}

export function resolveMergePrimaryColumn(
  range: CellMergeRange,
  columnOrder: string[]
): CellColumn {
  const sIdx = columnOrder.indexOf(range.startCol);
  const eIdx = columnOrder.indexOf(range.endCol);
  if (sIdx === -1 || eIdx === -1) return range.startCol;
  const slice = columnOrder.slice(Math.min(sIdx, eIdx), Math.max(sIdx, eIdx) + 1);
  // Preserve compatibility with existing single-amount rows where Kinsenas holds the merged figure
  if (slice.includes('monthly') && slice.includes('cutoff15th')) {
    return 'cutoff15th';
  }
  return slice[0];
}

export function mergeRowColumns(
  rowId: RowId,
  row: BudgetRowState,
  startCol: CellColumn,
  endCol: CellColumn,
  columnOrder: string[]
): BudgetRowState {
  const i1 = columnOrder.indexOf(startCol);
  const i2 = columnOrder.indexOf(endCol);
  if (i1 === -1 || i2 === -1 || i1 === i2) return row;

  const newStartIdx = Math.min(i1, i2);
  const newEndIdx = Math.max(i1, i2);
  const spanSlice = columnOrder.slice(newStartIdx, newEndIdx + 1);
  if (spanSlice.some((c) => !canColumnMerge(c))) return row;

  const currentRanges = getEffectiveRowMergeRanges(rowId, row, columnOrder);
  // Keep any existing non-overlapping ranges outside [newStartIdx .. newEndIdx]
  const surviving: CellMergeRange[] = [];
  for (const r of currentRanges) {
    const rStart = columnOrder.indexOf(r.startCol);
    const rEnd = columnOrder.indexOf(r.endCol);
    if (rEnd < newStartIdx || rStart > newEndIdx) {
      surviving.push(r);
    }
  }

  const nextRange: CellMergeRange = {
    startCol: columnOrder[newStartIdx],
    endCol: columnOrder[newEndIdx],
  };
  surviving.push(nextRange);

  // Sort cleanly by column index
  surviving.sort(
    (a, b) => columnOrder.indexOf(a.startCol) - columnOrder.indexOf(b.startCol)
  );

  // Sync primary cell value if empty and another merged column holds a value
  const primaryCol = resolveMergePrimaryColumn(nextRange, columnOrder);
  let updatedRow: BudgetRowState = {
    ...row,
    mergedRanges: surviving,
  };

  if (spanSlice.includes('monthly') && spanSlice.includes('cutoff15th')) {
    const kVal = row.cutoff15th?.value || 0;
    const mVal = row.monthly?.value || 0;
    const kRaw = row.cutoff15th?.rawInput || '';
    const mRaw = row.monthly?.rawInput || '';
    const chosenCell =
      primaryCol === 'cutoff15th'
        ? kRaw || kVal !== 0
          ? row.cutoff15th
          : row.monthly
        : mRaw || mVal !== 0
        ? row.monthly
        : row.cutoff15th;

    updatedRow = {
      ...updatedRow,
      monthly: { ...chosenCell },
      cutoff15th: { ...chosenCell },
    };
  }

  return updatedRow;
}

export function unmergeRowCells(
  rowId: RowId,
  row: BudgetRowState,
  targetCol: CellColumn,
  columnOrder: string[]
): BudgetRowState {
  const currentRanges = getEffectiveRowMergeRanges(rowId, row, columnOrder);
  const targetIdx = columnOrder.indexOf(targetCol);
  if (targetIdx === -1) return row;

  const remaining = currentRanges.filter((r) => {
    const sIdx = columnOrder.indexOf(r.startCol);
    const eIdx = columnOrder.indexOf(r.endCol);
    return targetIdx < Math.min(sIdx, eIdx) || targetIdx > Math.max(sIdx, eIdx);
  });

  return {
    ...row,
    mergedRanges: remaining,
  };
}
