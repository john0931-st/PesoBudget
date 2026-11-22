/**
 * @file offlineQueue.ts
 * @description Storage and state manager for offline changes.
 * Tracks all cell edits, formula updates, sheet modifications, and salary adjustments
 * made while offline, so they can be reviewed and uploaded to cloud backup once online.
 */

export type OfflineActionType =
  | 'cell_edit'
  | 'formula_update'
  | 'sheet_created'
  | 'sheet_create'
  | 'sheet_renamed'
  | 'sheet_rename'
  | 'sheet_deleted'
  | 'sheet_delete'
  | 'sheet_duplicate'
  | 'salary_update'
  | 'label_rename'
  | 'remarks_change'
  | 'item_add'
  | 'item_remove'
  | 'row_reorder';

export interface OfflineChangeItem {
  id: string;
  timestamp: string; // ISO string
  sheetName: string;
  year?: number;
  action: OfflineActionType;
  actionLabel?: string;
  description: string;
  rowLabel?: string;
  column?: string;
  oldValue?: string;
  newValue?: string;
}

const OFFLINE_QUEUE_KEY = 'pesobudget_offline_changes_queue_v1';

/**
 * Retrieve all pending offline changes from localStorage.
 */
export function getOfflineChanges(): OfflineChangeItem[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load offline changes queue:', err);
    return [];
  }
}

const ACTION_LABEL_MAP: Record<OfflineActionType, string> = {
  cell_edit: 'Cell Edit',
  formula_update: 'Formula Update',
  sheet_created: 'Sheet Created',
  sheet_create: 'Sheet Created',
  sheet_renamed: 'Sheet Renamed',
  sheet_rename: 'Sheet Renamed',
  sheet_deleted: 'Sheet Deleted',
  sheet_delete: 'Sheet Deleted',
  sheet_duplicate: 'Sheet Duplicated',
  salary_update: 'Salary Update',
  label_rename: 'Label Rename',
  remarks_change: 'Remarks Change',
  item_add: 'Item Added',
  item_remove: 'Item Removed',
  row_reorder: 'Row Reordered',
};

/**
 * Add a new change to the offline queue.
 */
export function addOfflineChange(
  change: Omit<OfflineChangeItem, 'id' | 'timestamp'>
): OfflineChangeItem {
  const current = getOfflineChanges();
  const actionLabel = change.actionLabel || ACTION_LABEL_MAP[change.action] || 'Modification';
  const newItem: OfflineChangeItem = {
    ...change,
    actionLabel,
    id: `off_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
  };

  const updated = [newItem, ...current];
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to persist offline change:', err);
  }

  // Dispatch custom event so UI components immediately re-render
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pesobudget:offline_queue_changed', { detail: updated }));
  }

  return newItem;
}

/**
 * Clear all changes from the offline queue (after successful upload).
 */
export function clearOfflineChanges(): void {
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch (err) {
    console.error('Failed to clear offline queue:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pesobudget:offline_queue_changed', { detail: [] }));
  }
}

export function replaceOfflineChanges(items: OfflineChangeItem[]): void {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error('Failed to replace offline queue:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pesobudget:offline_queue_changed', { detail: items }));
  }
}

/**
 * Get count of pending offline changes.
 */
export function getOfflineChangesCount(): number {
  return getOfflineChanges().length;
}
