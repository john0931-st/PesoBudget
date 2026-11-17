/**
 * @file localFolderDb.ts
 * @description Manages organized JSON database files inside the PesoBudget/data/ folder
 * using the browser File System Access API when supported (Windows, macOS, Desktop Chrome/Edge).
 */

import type { MonthData, UserSecurityProfile } from '../types/budget';
import type { ChangeLogEntry } from '../types/changelog';
import { getChangeLogs } from './changeLogService';
import { getOfflineChanges, type OfflineChangeItem } from './offlineQueue';
import { getActiveMonthId } from './storage';
import {
  decryptTextWithPassword,
  encryptTextWithPassword,
  getActivePortablePassword,
  isEncryptedEnvelope,
  type EncryptedEnvelope,
} from './portableCrypto';
import { parseJSONBackup } from './importer';

export interface DatabaseFilesSnapshot {
  sheetsJson: string;
  yearsJson: string;
  changelogJson: string;
  settingsJson: string;
  offlineQueueJson: string;
  databaseInfoJson: string;
  allInOneJson: string;
}

export interface LoadedFolderDatabase {
  months?: Record<string, MonthData>;
  years?: number[];
  changeLogs?: ChangeLogEntry[];
  activeMonthId?: string;
  offlineQueue?: OfflineChangeItem[];
}

interface DirectoryHandleLike {
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
}

interface FileHandleLike {
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
  }>;
}

let activeDataDirHandle: DirectoryHandleLike | null = null;
let activeFolderLabel: string | null = null;

export function isLocalFolderPickerSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
  );
}

export function getConnectedFolderLabel(): string | null {
  return activeFolderLabel;
}

export function disconnectLocalDataFolder(): void {
  activeDataDirHandle = null;
  activeFolderLabel = null;
}

export function buildOrganizedDatabaseFiles(params: {
  months: Record<string, MonthData>;
  years: number[];
  securityProfile: UserSecurityProfile;
  activeMonthId?: string;
  password?: string | null;
}): DatabaseFilesSnapshot {
  const { months, years, securityProfile, activeMonthId } = params;
  const effectivePassword =
    params.password !== undefined ? params.password : getActivePortablePassword();
  const now = new Date().toISOString();
  const changeLogs = getChangeLogs();
  const offlineQueue = getOfflineChanges();
  const currentActiveId = activeMonthId || getActiveMonthId();

  const sanitizedProfile = {
    email: securityProfile.email || '',
    name: securityProfile.name || '',
    autoBackupEnabled: securityProfile.autoBackupEnabled ?? true,
    autoRestoreEnabled: securityProfile.autoRestoreEnabled ?? true,
    lastBackupTime: securityProfile.lastBackupTime || null,
  };

  const sheetsPayload = {
    schemaVersion: 1,
    updatedAt: now,
    activeMonthId: currentActiveId,
    monthsCount: Object.keys(months).length,
    months,
  };

  const yearsPayload = {
    schemaVersion: 1,
    updatedAt: now,
    years,
  };

  const changelogPayload = {
    schemaVersion: 1,
    updatedAt: now,
    count: changeLogs.length,
    entries: changeLogs,
  };

  const settingsPayload = {
    schemaVersion: 1,
    updatedAt: now,
    profile: sanitizedProfile,
  };

  const offlineQueuePayload = {
    schemaVersion: 1,
    updatedAt: now,
    count: offlineQueue.length,
    pendingChanges: offlineQueue,
  };

  const allInOnePayload = {
    appName: 'PesoBudget',
    schemaVersion: 2,
    updatedAt: now,
    activeMonthId: currentActiveId,
    months,
    years,
    changeLogs,
    offlineQueue,
    profile: sanitizedProfile,
  };

  const serializeMaybeEncrypted = (obj: unknown): string => {
    const raw = JSON.stringify(obj, null, 2);
    if (effectivePassword) {
      return JSON.stringify(encryptTextWithPassword(raw, effectivePassword), null, 2);
    }
    return raw;
  };

  const databaseInfoPayload = {
    appName: 'PesoBudget',
    appTitle: 'PesoBudget - Smart Expense & Payroll Tracker',
    passwordProtected: Boolean(effectivePassword),
    folderStructure: {
      root: 'PesoBudget/',
      htmlEntry: 'PesoBudget/index.html',
      assetsFolder: 'PesoBudget/app/',
      databaseFolder: 'PesoBudget/data/',
    },
    files: [
      'data/pesobudget-database.json',
      'data/sheets.json',
      'data/years.json',
      'data/changelog.json',
      'data/settings.json',
      'data/offline-queue.json',
      'data/database-info.json',
    ],
    totalSheets: Object.keys(months).length,
    totalYears: years.length,
    totalChangeLogs: changeLogs.length,
    lastUpdatedAt: now,
  };

  return {
    sheetsJson: serializeMaybeEncrypted(sheetsPayload),
    yearsJson: serializeMaybeEncrypted(yearsPayload),
    changelogJson: serializeMaybeEncrypted(changelogPayload),
    settingsJson: JSON.stringify(settingsPayload, null, 2),
    offlineQueueJson: serializeMaybeEncrypted(offlineQueuePayload),
    databaseInfoJson: JSON.stringify(databaseInfoPayload, null, 2),
    allInOneJson: serializeMaybeEncrypted(allInOnePayload),
  };
}

async function writeTextFile(dir: DirectoryHandleLike, fileName: string, content: string): Promise<void> {
  const fileHandle = await dir.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function readJsonFileIfExists<T>(
  dir: DirectoryHandleLike,
  fileName: string,
  passwordOverride?: string | null
): Promise<T | null> {
  try {
    const fileHandle = await dir.getFileHandle(fileName, { create: false });
    const file = await fileHandle.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (isEncryptedEnvelope(parsed)) {
      const pw = passwordOverride ?? getActivePortablePassword();
      if (!pw) {
        throw new Error('ENCRYPTED_FOLDER_NEEDS_PASSWORD');
      }
      const decrypted = decryptTextWithPassword(parsed, pw);
      return JSON.parse(decrypted) as T;
    }
    return parsed as T;
  } catch (err) {
    if (err instanceof Error && err.message === 'ENCRYPTED_FOLDER_NEEDS_PASSWORD') {
      throw err;
    }
    if (err instanceof Error && err.message.includes('Incorrect password')) {
      throw new Error('ENCRYPTED_FOLDER_NEEDS_PASSWORD');
    }
    return null;
  }
}

export interface FolderConnectOutcome {
  label: string;
  status: 'saved_new' | 'loaded_newer' | 'identical' | 'conflict' | 'encrypted_locked';
  existingUpdatedAt?: string;
  existingSheetsCount?: number;
  loaded?: LoadedFolderDatabase;
}

let isAutoSyncArmed = false;

export function isFolderAutoSyncArmed(): boolean {
  return Boolean(activeDataDirHandle && isAutoSyncArmed);
}

export function setFolderAutoSyncArmed(armed: boolean): void {
  isAutoSyncArmed = armed;
}

function getLatestMonthsTimestampMs(monthsMap?: Record<string, MonthData>): number {
  if (!monthsMap) return 0;
  let maxMs = 0;
  for (const m of Object.values(monthsMap)) {
    const t = new Date(m?.updatedAt || 0).getTime();
    if (!Number.isNaN(t) && t > maxMs) maxMs = t;
  }
  return maxMs;
}

export async function connectLocalDataFolder(): Promise<string> {
  if (!isLocalFolderPickerSupported()) {
    throw new Error(
      'Direct folder access is supported in desktop Chrome, Edge, or Brave. On mobile/Safari, your edits save offline automatically and you can export or import data/sheets.json anytime.'
    );
  }

  const picker = (
    window as unknown as {
      showDirectoryPicker: (opts?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<DirectoryHandleLike>;
    }
  ).showDirectoryPicker;

  let chosen: DirectoryHandleLike;
  try {
    chosen = await picker({ mode: 'readwrite', id: 'pesobudget-folder' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.toLowerCase().includes('cross origin') ||
      msg.toLowerCase().includes('sub frame') ||
      msg.toLowerCase().includes('security')
    ) {
      throw new Error(
        'Folder access is blocked inside the preview frame. Open the app in a standalone Chrome/Edge tab or open your downloaded PesoBudget/index.html directly on laptop/desktop to connect data/.'
      );
    }
    throw err;
  }

  const lower = chosen.name.toLowerCase();

  let dataDir = chosen;
  let label = chosen.name;

  // If user chose the root "PesoBudget" folder (or parent), automatically use/create "data" subfolder
  if (lower !== 'data') {
    dataDir = await chosen.getDirectoryHandle('data', { create: true });
    label = `${chosen.name}/data`;
  }

  activeDataDirHandle = dataDir;
  activeFolderLabel = label;
  return label;
}

export async function connectAndInspectLocalDataFolder(params: {
  months: Record<string, MonthData>;
  years: number[];
  securityProfile: UserSecurityProfile;
  activeMonthId?: string;
  folderPassword?: string | null;
}): Promise<FolderConnectOutcome> {
  const label = await connectLocalDataFolder();
  let existing: LoadedFolderDatabase;
  try {
    existing = await readDatabaseFromConnectedFolder(params.folderPassword);
  } catch (err) {
    if (err instanceof Error && err.message === 'ENCRYPTED_FOLDER_NEEDS_PASSWORD') {
      isAutoSyncArmed = false;
      return { label, status: 'encrypted_locked' };
    }
    throw err;
  }

  const existingMonths = existing.months;
  const existingCount = existingMonths ? Object.keys(existingMonths).length : 0;

  if (!existingMonths || existingCount === 0) {
    isAutoSyncArmed = true;
    await writeSnapshotToConnectedFolder(params);
    return { label, status: 'saved_new' };
  }

  if (JSON.stringify(existingMonths) === JSON.stringify(params.months)) {
    isAutoSyncArmed = true;
    return { label, status: 'identical', existingSheetsCount: existingCount };
  }

  const folderLatestMs = getLatestMonthsTimestampMs(existingMonths);
  const localLatestMs = getLatestMonthsTimestampMs(params.months);

  if (folderLatestMs > localLatestMs) {
    isAutoSyncArmed = true;
    return {
      label,
      status: 'loaded_newer',
      existingSheetsCount: existingCount,
      existingUpdatedAt: folderLatestMs ? new Date(folderLatestMs).toLocaleString() : undefined,
      loaded: existing,
    };
  }

  // Folder has different data that isn't strictly newer — pause auto-write until user chooses Load or Save
  isAutoSyncArmed = false;
  return {
    label,
    status: 'conflict',
    existingSheetsCount: existingCount,
    existingUpdatedAt: folderLatestMs ? new Date(folderLatestMs).toLocaleString() : undefined,
    loaded: existing,
  };
}

export async function writeSnapshotToConnectedFolder(params: {
  months: Record<string, MonthData>;
  years: number[];
  securityProfile: UserSecurityProfile;
  activeMonthId?: string;
  password?: string | null;
}): Promise<boolean> {
  if (!activeDataDirHandle) return false;

  isAutoSyncArmed = true;
  const snapshot = buildOrganizedDatabaseFiles(params);
  await Promise.all([
    writeTextFile(activeDataDirHandle, 'pesobudget-database.json', snapshot.allInOneJson),
    writeTextFile(activeDataDirHandle, 'sheets.json', snapshot.sheetsJson),
    writeTextFile(activeDataDirHandle, 'years.json', snapshot.yearsJson),
    writeTextFile(activeDataDirHandle, 'changelog.json', snapshot.changelogJson),
    writeTextFile(activeDataDirHandle, 'settings.json', snapshot.settingsJson),
    writeTextFile(activeDataDirHandle, 'offline-queue.json', snapshot.offlineQueueJson),
    writeTextFile(activeDataDirHandle, 'database-info.json', snapshot.databaseInfoJson),
  ]);
  return true;
}

export async function readDatabaseFromConnectedFolder(
  passwordOverride?: string | null
): Promise<LoadedFolderDatabase> {
  if (!activeDataDirHandle) {
    throw new Error('No local data folder is currently connected.');
  }

  const [allInOneDoc, sheetsDoc, yearsDoc, changelogDoc, offlineDoc] = await Promise.all([
    readJsonFileIfExists<{
      months?: Record<string, MonthData>;
      activeMonthId?: string;
      years?: number[];
      changeLogs?: ChangeLogEntry[];
      offlineQueue?: OfflineChangeItem[];
    }>(activeDataDirHandle, 'pesobudget-database.json', passwordOverride),
    readJsonFileIfExists<{ months?: Record<string, MonthData>; activeMonthId?: string }>(
      activeDataDirHandle,
      'sheets.json',
      passwordOverride
    ),
    readJsonFileIfExists<{ years?: number[] }>(
      activeDataDirHandle,
      'years.json',
      passwordOverride
    ),
    readJsonFileIfExists<{ entries?: ChangeLogEntry[] }>(
      activeDataDirHandle,
      'changelog.json',
      passwordOverride
    ),
    readJsonFileIfExists<{ pendingChanges?: OfflineChangeItem[] }>(
      activeDataDirHandle,
      'offline-queue.json',
      passwordOverride
    ),
  ]);

  return {
    months: sheetsDoc?.months ?? allInOneDoc?.months,
    activeMonthId: sheetsDoc?.activeMonthId ?? allInOneDoc?.activeMonthId,
    years: Array.isArray(yearsDoc?.years)
      ? yearsDoc.years
      : Array.isArray(allInOneDoc?.years)
        ? allInOneDoc.years
        : undefined,
    changeLogs: Array.isArray(changelogDoc?.entries)
      ? changelogDoc.entries
      : Array.isArray(allInOneDoc?.changeLogs)
        ? allInOneDoc.changeLogs
        : undefined,
    offlineQueue: Array.isArray(offlineDoc?.pendingChanges)
      ? offlineDoc.pendingChanges
      : Array.isArray(allInOneDoc?.offlineQueue)
        ? allInOneDoc.offlineQueue
        : undefined,
  };
}

export function downloadAllInOneDatabaseJson(params: {
  months: Record<string, MonthData>;
  years: number[];
  securityProfile: UserSecurityProfile;
  activeMonthId?: string;
  password?: string | null;
}): { filename: string; isEncrypted: boolean } {
  const effectivePassword =
    params.password !== undefined ? params.password : getActivePortablePassword();
  const snapshot = buildOrganizedDatabaseFiles({
    ...params,
    password: effectivePassword,
  });

  const blob = new Blob([snapshot.allInOneJson], {
    type: 'application/json;charset=utf-8',
  });
  const filename = 'PesoBudget-Database.json';
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  return {
    filename,
    isEncrypted: Boolean(effectivePassword),
  };
}

export type ParseDatabaseFilesResult =
  | {
      status: 'needs_password';
      encryptedFileNames: string[];
    }
  | {
      status: 'error';
      message: string;
    }
  | {
      status: 'ok';
      database: LoadedFolderDatabase;
      loadedParts: string[];
      importedMonthsCount: number;
    };

export function parseSelectedDatabaseFiles(
  files: Array<{ name: string; text: string }>,
  existingMonths: Record<string, MonthData>,
  passwordOverride?: string | null
): ParseDatabaseFilesResult {
  if (!files || files.length === 0) {
    return { status: 'error', message: 'No JSON files selected.' };
  }

  const effectivePw = passwordOverride ?? getActivePortablePassword();
  const encryptedFileNames: string[] = [];
  const decodedDocs: Array<{ name: string; doc: unknown }> = [];

  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.text);
    } catch {
      return {
        status: 'error',
        message: `"${file.name}" is not a valid JSON file.`,
      };
    }

    if (isEncryptedEnvelope(parsed)) {
      if (!effectivePw) {
        encryptedFileNames.push(file.name);
        continue;
      }
      try {
        const plainText = decryptTextWithPassword(parsed as EncryptedEnvelope, effectivePw);
        parsed = JSON.parse(plainText);
      } catch {
        encryptedFileNames.push(file.name);
        continue;
      }
    }

    decodedDocs.push({ name: file.name, doc: parsed });
  }

  if (encryptedFileNames.length > 0) {
    return {
      status: 'needs_password',
      encryptedFileNames,
    };
  }

  const loadedDatabase: LoadedFolderDatabase = {};
  const loadedParts = new Set<string>();
  let importedMonthsCount = 0;
  let mergedMonths: Record<string, MonthData> = { ...existingMonths };

  for (const { doc } of decodedDocs) {
    if (!doc || typeof doc !== 'object') continue;

    // Plain array of years e.g. [2024, 2025, 2026]
    if (Array.isArray(doc)) {
      const numericYears = doc
        .map((y) => Number(y))
        .filter((y) => Number.isInteger(y) && y >= 2000 && y <= 2100);
      if (numericYears.length > 0 && numericYears.length === doc.length) {
        loadedDatabase.years = Array.from(
          new Set([...(loadedDatabase.years || []), ...numericYears])
        ).sort((a, b) => a - b);
        loadedParts.add('years');
        continue;
      }
    }

    const obj = doc as Record<string, unknown>;

    // Metadata / settings helper files if user clicked Select All in data/
    if ('folderStructure' in obj && 'files' in obj && !('months' in obj)) {
      continue;
    }
    if ('profile' in obj && !('months' in obj) && !('years' in obj)) {
      continue;
    }

    // Years field (years.json or all-in-one pesobudget-database.json)
    if (Array.isArray(obj.years)) {
      const validYears = obj.years
        .map((y) => Number(y))
        .filter((y) => Number.isInteger(y) && y >= 2000 && y <= 2100);
      if (validYears.length > 0) {
        loadedDatabase.years = Array.from(
          new Set([...(loadedDatabase.years || []), ...validYears])
        ).sort((a, b) => a - b);
        loadedParts.add('years');
      }
    }

    // Change logs (changelog.json or all-in-one pesobudget-database.json)
    const rawLogs = Array.isArray(obj.changeLogs)
      ? obj.changeLogs
      : Array.isArray(obj.entries)
        ? obj.entries
        : null;
    if (rawLogs) {
      loadedDatabase.changeLogs = rawLogs as ChangeLogEntry[];
      loadedParts.add('changelog');
    }

    // Offline queue (offline-queue.json or all-in-one pesobudget-database.json)
    const rawQueue = Array.isArray(obj.offlineQueue)
      ? obj.offlineQueue
      : Array.isArray(obj.pendingChanges)
        ? obj.pendingChanges
        : null;
    if (rawQueue) {
      loadedDatabase.offlineQueue = rawQueue as OfflineChangeItem[];
      loadedParts.add('offline-queue');
    }

    // Active month id
    if (typeof obj.activeMonthId === 'string' && obj.activeMonthId.trim()) {
      loadedDatabase.activeMonthId = obj.activeMonthId;
    }

    // Sheets / months (sheets.json, all-in-one pesobudget-database.json, or raw MonthData map/array)
    const looksLikeMonthsContainer =
      Boolean(obj.months && typeof obj.months === 'object') ||
      Array.isArray(doc) ||
      Object.values(obj).some(
        (v) =>
          Boolean(v) &&
          typeof v === 'object' &&
          'rows' in (v as Record<string, unknown>) &&
          'name' in (v as Record<string, unknown>)
      );

    if (looksLikeMonthsContainer) {
      const sheetImport = parseJSONBackup(JSON.stringify(doc), mergedMonths);
      if (sheetImport.success) {
        mergedMonths = sheetImport.data;
        loadedDatabase.months = mergedMonths;
        importedMonthsCount += sheetImport.importedMonthsCount;
        loadedParts.add('sheets');
      }
    }
  }

  const partsList = Array.from(loadedParts);
  if (partsList.length === 0) {
    return {
      status: 'error',
      message: 'Selected JSON file(s) did not contain PesoBudget sheets, years, or logs.',
    };
  }

  return {
    status: 'ok',
    database: loadedDatabase,
    loadedParts: partsList,
    importedMonthsCount,
  };
}
