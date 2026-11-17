import { ChangeLogEntry, ChangeLogAction } from '../types/changelog';

const STORAGE_KEY = 'pesobudget_changelog_v1';
const LISTENERS: Array<() => void> = [];

export function getChangeLogs(): ChangeLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse change logs from storage:', err);
    return [];
  }
}

export function subscribeChangeLogs(listener: () => void): () => void {
  LISTENERS.push(listener);
  return () => {
    const idx = LISTENERS.indexOf(listener);
    if (idx !== -1) {
      LISTENERS.splice(idx, 1);
    }
  };
}

function notifyListeners() {
  LISTENERS.forEach((cb) => {
    try {
      cb();
    } catch (e) {
      console.error(e);
    }
  });
}

export function addChangeLog(
  entry: Omit<ChangeLogEntry, 'id' | 'timestamp' | 'formattedDate'>
): ChangeLogEntry {
  const now = new Date();
  const formattedDate = now.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const newEntry: ChangeLogEntry = {
    ...entry,
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: now.toISOString(),
    formattedDate,
  };

  try {
    const existing = getChangeLogs();
    // Keep up to 500 entries to prevent localstorage overflow
    const updated = [newEntry, ...existing].slice(0, 500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    notifyListeners();
  } catch (err) {
    console.error('Failed to save change log:', err);
  }

  return newEntry;
}

export function clearChangeLogs(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    notifyListeners();
  } catch (err) {
    console.error('Failed to clear change logs:', err);
  }
}

export function replaceChangeLogs(entries: ChangeLogEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 500)));
    notifyListeners();
  } catch (err) {
    console.error('Failed to replace change logs:', err);
  }
}

export function clearChangeLogsForYear(year: number): void {
  try {
    const existing = getChangeLogs();
    const filtered = existing.filter((log) => {
      if (log.year !== undefined && log.year !== null) {
        return log.year !== year;
      }
      if (log.timestamp) {
        return new Date(log.timestamp).getFullYear() !== year;
      }
      return false;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    notifyListeners();
  } catch (err) {
    console.error('Failed to clear change logs for year:', err);
  }
}


export function exportChangeLogsToCSV(entries: ChangeLogEntry[]): void {
  if (!entries || entries.length === 0) {
    alert('No change logs to export.');
    return;
  }

  const headers = ['Timestamp', 'Sheet Name', 'Year', 'Action', 'Row / Item', 'Column', 'Old Value', 'New Value', 'Description'];
  const rows = entries.map((e) => [
    `"${e.formattedDate.replace(/"/g, '""')}"`,
    `"${(e.sheetName || '').replace(/"/g, '""')}"`,
    `"${e.year ?? ''}"`,
    `"${(e.actionLabel || e.action).replace(/"/g, '""')}"`,
    `"${(e.rowLabel || '').replace(/"/g, '""')}"`,
    `"${(e.column || '').replace(/"/g, '""')}"`,
    `"${(e.oldValue ?? '').replace(/"/g, '""')}"`,
    `"${(e.newValue ?? '').replace(/"/g, '""')}"`,
    `"${(e.description || '').replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Budget_Change_Log_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
