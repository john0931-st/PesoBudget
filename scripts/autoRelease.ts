import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export interface AutoReleaseEntry {
  buildId: string;
  buildTime: string;
  version: string;
  date: string;
  timeLabel?: string;
  title: string;
  changes: string[];
}

interface PersistedReleaseState {
  releases: AutoReleaseEntry[];
  baselineHashes: Record<string, string>;
  baselineTextsGzip?: string;
}

interface AreaInfo {
  area: string;
  category: string;
}

const HISTORY_FILENAME = '.pesobudget-release-history.json';
const MAX_STORED_RELEASES = 25;

const TEXT_SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.css',
  '.html',
  '.json',
  '.svg',
]);

const EXACT_FILE_AREAS: Record<string, AreaInfo> = {
  'src/components/BudgetTable.tsx': { area: 'Budget Table', category: 'Spreadsheet & Cells' },
  'src/components/FormulaBar.tsx': { area: 'Formula Bar', category: 'Formulas & Editing' },
  'src/components/EditFormulaModal.tsx': { area: 'Formula Editor', category: 'Formulas & Editing' },
  'src/components/SalaryConfigModal.tsx': { area: 'Salary Breakdown', category: 'Payroll & Salary' },
  'src/components/NewMonthModal.tsx': { area: 'New Sheet Creator', category: 'Sheets & Templates' },
  'src/components/MonthSheetTabs.tsx': { area: 'Sheet Tabs', category: 'Sheets & Templates' },
  'src/components/MonthlySummary.tsx': { area: 'Monthly Summary', category: 'Reports & Totals' },
  'src/components/DataVisualization.tsx': { area: 'Charts & Analytics', category: 'Data Visualization' },
  'src/components/HistoricalProgressionChart.tsx': { area: 'Progression Chart', category: 'Data Visualization' },
  'src/components/PrintableSummaryReport.tsx': { area: 'Printable Report', category: 'Reports & Export' },
  'src/components/ImportExportModal.tsx': { area: 'Import & Export', category: 'Import & Export' },
  'src/components/SettingsModal.tsx': { area: 'Settings & Backups', category: 'Settings & Sync' },
  'src/components/SecurityGate.tsx': { area: 'Account & Security', category: 'Security & Auth' },
  'src/components/SecurityModal.tsx': { area: 'Security Settings', category: 'Security & Auth' },
  'src/components/PasswordConfirmModal.tsx': { area: 'Password Verification', category: 'Security & Auth' },
  'src/components/PortableLockScreen.tsx': { area: 'Portable Lock Screen', category: 'Security & Auth' },
  'src/components/SyncOfflineModal.tsx': { area: 'Offline Sync Modal', category: 'Cloud & Offline Sync' },
  'src/components/ChangeLogSheet.tsx': { area: 'Audit Change Log', category: 'Audit & History' },
  'src/components/CellActionPopover.tsx': { area: 'Cell Action Menu', category: 'Spreadsheet & Cells' },
  'src/components/CellNotePopover.tsx': { area: 'Cell Notes', category: 'Spreadsheet & Cells' },
  'src/components/ActionMessageModal.tsx': { area: 'Notifications', category: 'UI & Navigation' },
  'src/components/TopNav.tsx': { area: 'Top Navigation', category: 'UI & Navigation' },
  'src/components/TopToastContainer.tsx': { area: 'Top Toast Notifications', category: 'UI & Navigation' },
  'src/components/OnboardingTourModal.tsx': { area: 'Interactive Welcome Tour', category: 'User Onboarding' },
  'src/components/AdminModal.tsx': { area: 'Developer Admin Console', category: 'Admin & Access Control' },
  'src/components/UpdateChangesModal.tsx': { area: 'Update Notice Popup', category: 'Release Notices' },
  'src/App.tsx': { area: 'Main Workspace', category: 'Workspace & Navigation' },
  'src/main.tsx': { area: 'App Entry & Offline Cache', category: 'PWA & Assets' },
  'src/index.css': { area: 'Global Theme & Layout', category: 'Theme & Visual Design' },
  'src/utils/theme.ts': { area: 'Light & Dark Mode', category: 'Theme & Visual Design' },
  'src/utils/viewport.ts': { area: 'Mobile Safe-Area Bounds', category: 'UI & Navigation' },
  'src/utils/computation.ts': { area: 'Auto Computations', category: 'Formulas & Editing' },
  'src/utils/formula.ts': { area: 'Formula Evaluator', category: 'Formulas & Editing' },
  'src/utils/currency.ts': { area: 'Peso Formatting', category: 'Formulas & Editing' },
  'src/utils/storage.ts': { area: 'Sheet Storage & Templates', category: 'Sheets & Templates' },
  'src/utils/excelService.ts': { area: 'Excel Export', category: 'Import & Export' },
  'src/utils/exporter.ts': { area: 'Data Export', category: 'Import & Export' },
  'src/utils/importer.ts': { area: 'Data Import', category: 'Import & Export' },
  'src/utils/printService.ts': { area: 'PDF & Print Output', category: 'Reports & Export' },
  'src/utils/manualPdfService.ts': { area: 'User Manual (PDF)', category: 'User Manual & Docs' },
  'src/utils/cellMerge.ts': { area: 'Cell Merge & Unmerge', category: 'Spreadsheet & Cells' },
  'src/utils/portableBundleExporter.ts': { area: 'Portable HTML Bundle', category: 'Import & Export' },
  'src/utils/androidStudioExporter.ts': { area: 'Android Project Export', category: 'Import & Export' },
  'src/utils/localFolderDb.ts': { area: 'Local Folder Sync', category: 'Settings & Sync' },
  'src/utils/offlineQueue.ts': { area: 'Offline Queue', category: 'Cloud & Offline Sync' },
  'src/utils/changeLogService.ts': { area: 'Change Log Service', category: 'Audit & History' },
  'src/utils/monthGrouping.ts': { area: 'Month & Year Grouping', category: 'Sheets & Templates' },
  'src/utils/historyGenerator.ts': { area: 'Trend History Generator', category: 'Data Visualization' },
  'src/services/firebaseSyncService.ts': { area: 'Firebase Cloud Sync', category: 'Cloud & Offline Sync' },
  'src/services/securityService.ts': { area: 'Cloud Backup & Auth', category: 'Security & Auth' },
  'src/hooks/useAutoBackup.ts': { area: 'Auto Cloud Backup', category: 'Cloud & Offline Sync' },
  'src/hooks/useNetworkStatus.ts': { area: 'Online / Offline Monitor', category: 'Cloud & Offline Sync' },
  'src/hooks/usePublicLinkMonitor.ts': { area: 'Public Link Health Monitor', category: 'Cloud & Offline Sync' },
  'src/hooks/useTrackpadSwipe.ts': { area: 'Swipe Gestures', category: 'UI & Navigation' },
  'src/firebase.ts': { area: 'Firebase Configuration', category: 'Cloud & Offline Sync' },
  'src/types/budget.ts': { area: 'Budget Data Model', category: 'Formulas & Editing' },
  'index.html': { area: 'App Shell & Metadata', category: 'PWA & Assets' },
  'package.json': { area: 'App Package & Version', category: 'App Configuration' },
};

function humanizeIdentifier(raw: string): string {
  const base = path.basename(raw, path.extname(raw));
  return base
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function getAreaForPath(relPath: string): AreaInfo {
  if (EXACT_FILE_AREAS[relPath]) return EXACT_FILE_AREAS[relPath];
  if (relPath.startsWith('public/')) {
    return { area: 'PWA & Public Assets', category: 'PWA & Assets' };
  }
  if (relPath.startsWith('src/components/')) {
    return { area: humanizeIdentifier(relPath), category: 'UI & Components' };
  }
  if (relPath.startsWith('src/hooks/')) {
    return { area: humanizeIdentifier(relPath), category: 'App Behavior' };
  }
  if (relPath.startsWith('src/services/')) {
    return { area: humanizeIdentifier(relPath), category: 'Cloud & Services' };
  }
  if (relPath.startsWith('src/utils/')) {
    return { area: humanizeIdentifier(relPath), category: 'Core Logic' };
  }
  return { area: humanizeIdentifier(relPath), category: 'Application Core' };
}

function collectSortedPaths(targetPath: string): string[] {
  if (!fs.existsSync(targetPath)) return [];
  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) return [targetPath];
  const entries = fs.readdirSync(targetPath, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const files: string[] = [];
  for (const entry of entries) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === 'dist-portable' ||
      entry.name === 'dev-dist' ||
      entry.name === '.git'
    ) {
      continue;
    }
    files.push(...collectSortedPaths(path.join(targetPath, entry.name)));
  }
  return files;
}

export function computeSourceBuildId(rootDir: string): string {
  const hash = crypto.createHash('sha256');
  const targets = [
    path.resolve(rootDir, 'src'),
    path.resolve(rootDir, 'index.html'),
    path.resolve(rootDir, 'public'),
  ];
  for (const target of targets) {
    for (const filePath of collectSortedPaths(target)) {
      const rel = path.relative(rootDir, filePath).replace(/\\/g, '/');
      hash.update(rel);
      hash.update('\0');
      hash.update(fs.readFileSync(filePath));
      hash.update('\0');
    }
  }
  return `pb-${hash.digest('hex').slice(0, 12)}`;
}

function captureWorkspaceSnapshot(rootDir: string): {
  hashes: Record<string, string>;
  texts: Record<string, string>;
} {
  const hashes: Record<string, string> = {};
  const texts: Record<string, string> = {};
  const targets = [
    path.resolve(rootDir, 'src'),
    path.resolve(rootDir, 'index.html'),
    path.resolve(rootDir, 'public'),
    path.resolve(rootDir, 'package.json'),
  ];

  for (const target of targets) {
    for (const filePath of collectSortedPaths(target)) {
      const rel = path.relative(rootDir, filePath).replace(/\\/g, '/');
      const buf = fs.readFileSync(filePath);
      hashes[rel] = crypto.createHash('sha256').update(buf).digest('hex');
      const ext = path.extname(filePath).toLowerCase();
      if (TEXT_SOURCE_EXTENSIONS.has(ext) && buf.byteLength <= 250 * 1024) {
        texts[rel] = buf.toString('utf8');
      }
    }
  }

  return { hashes, texts };
}

function compressTexts(texts: Record<string, string>): string {
  return zlib.gzipSync(Buffer.from(JSON.stringify(texts), 'utf8')).toString('base64');
}

function decompressTexts(gzipBase64?: string): Record<string, string> {
  if (!gzipBase64) return {};
  try {
    const raw = zlib.gunzipSync(Buffer.from(gzipBase64, 'base64')).toString('utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function computeLineDiff(oldText: string, newText: string): {
  added: string[];
  removed: string[];
} {
  const oldLines = oldText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const newLines = newText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const oldCounts = new Map<string, number>();
  for (const line of oldLines) {
    oldCounts.set(line, (oldCounts.get(line) || 0) + 1);
  }

  const newCounts = new Map<string, number>();
  for (const line of newLines) {
    newCounts.set(line, (newCounts.get(line) || 0) + 1);
  }

  const added: string[] = [];
  const tempOld = new Map(oldCounts);
  for (const line of newLines) {
    const count = tempOld.get(line) || 0;
    if (count > 0) {
      tempOld.set(line, count - 1);
    } else {
      added.push(line);
    }
  }

  const removed: string[] = [];
  const tempNew = new Map(newCounts);
  for (const line of oldLines) {
    const count = tempNew.get(line) || 0;
    if (count > 0) {
      tempNew.set(line, count - 1);
    } else {
      removed.push(line);
    }
  }

  return { added, removed };
}

function extractReadableUiPhrases(lines: string[]): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const consider = (raw: string) => {
    const cleaned = raw.replace(/\s+/g, ' ').trim();
    if (cleaned.length < 4 || cleaned.length > 46) return;
    if (!/^[A-Za-z0-9₱]/.test(cleaned)) return;
    if (/[{};=<>\\/$`|]/.test(cleaned)) return;
    if (/^(true|false|null|undefined|string|number|boolean|div|span|button|const|return|import|export)$/i.test(cleaned)) return;
    if (/^[a-z0-9_-]+$/.test(cleaned)) return; // skip CSS/kebab tokens
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(cleaned);
  };

  for (const line of lines) {
    // JSX inner text like >Some Label<
    const jsxMatches = line.matchAll(/>([^<>{}]+)</g);
    for (const m of jsxMatches) {
      consider(m[1]);
    }
    // title / placeholder / aria-label strings
    const attrMatches = line.matchAll(/(?:title|aria-label|placeholder)=["']([^"']+)["']/g);
    for (const m of attrMatches) {
      consider(m[1]);
    }
  }

  return candidates.slice(0, 3);
}

function detectBudgetRowNames(joinedDiff: string): string[] {
  const rowLabels: Array<[RegExp, string]> = [
    [/\bqr_ph\b|QR PH/i, 'QR PH'],
    [/\bmetrobank\b/i, 'Metrobank'],
    [/['"`]total['"`]|total_expenses/i, 'Total'],
    [/['"`]salary['"`]|salaryBreakdown/i, 'Salary'],
    [/['"`]balance['"`]/i, 'Balance'],
    [/\bmp2\b/i, 'MP2'],
    [/\bgotyme\b/i, 'GoTyme'],
  ];
  const matched: string[] = [];
  for (const [pattern, label] of rowLabels) {
    if (pattern.test(joinedDiff)) {
      matched.push(label);
    }
  }
  return matched;
}

function summarizeFileChange(
  relPath: string,
  oldText: string,
  newText: string
): { summary: string; weight: number; category: string; area: string } {
  const info = getAreaForPath(relPath);
  const { added, removed } = computeLineDiff(oldText, newText);
  const weight = added.length + removed.length;
  const joinedAdded = added.join('\n');
  const joinedAll = `${joinedAdded}\n${removed.join('\n')}`;

  if (relPath === 'package.json') {
    return {
      summary: 'Updated application configuration and package dependencies.',
      weight: Math.max(weight, 2),
      category: info.category,
      area: info.area,
    };
  }

  if (relPath === 'src/data/releaseNotes.json') {
    return {
      summary: 'Updated release notes history data.',
      weight: 1,
      category: info.category,
      area: info.area,
    };
  }

  if (relPath === 'src/vite-env.d.ts') {
    return {
      summary: 'Updated build environment metadata declarations.',
      weight: 1,
      category: 'Release Notices',
      area: 'Build Metadata',
    };
  }

  if (relPath === 'src/utils/manualPdfService.ts') {
    const addedTopics: string[] = [];
    for (const line of added) {
      const figMatch = line.match(/(?:Figure\s+\d+:\s*)?([^'"`]+)'/i);
      if (line.includes('Figure ') && figMatch) {
        const cleanFig = figMatch[1].replace(/^Visual Guide\s*-\s*/i, '').trim();
        if (cleanFig && !addedTopics.includes(cleanFig)) {
          addedTopics.push(cleanFig);
        }
      }
      const featMatch = line.match(/feature:\s*['"`]([^'"`]+)['"`]/);
      if (featMatch && !addedTopics.includes(featMatch[1])) {
        addedTopics.push(featMatch[1]);
      }
      const secMatch = line.match(/drawSectionHeading\([^,]+,\s*['"`]([^'"`]+)['"`]/);
      if (secMatch && !addedTopics.includes(secMatch[1])) {
        addedTopics.push(secMatch[1]);
      }
    }
    const detail =
      addedTopics.length > 0
        ? ` (${addedTopics.slice(0, 3).join(', ')})`
        : '';
    return {
      summary: `Updated searchable User Manual (PDF) with visual diagrams and documentation${detail}.`,
      weight: Math.max(weight, 4),
      category: info.category,
      area: info.area,
    };
  }

  const parts: string[] = [];
  const hasDarkOrColor = /\bdark:|bg-(?:slate|emerald|sky|rose|indigo|amber|teal)-|@theme|border-|shadow-/.test(
    joinedAdded
  );
  const hasViewportOrModal = /pb-modal|pb-floating|visualViewport|safe-area|max-h-\[/.test(joinedAdded);
  const hasFormulaOrCalc = /recalculate|evaluateFormula|formula|cutoff15th|formatPHP|deductions|salaryBreakdown/.test(
    joinedAdded
  );
  const hasMergeLogic = /mergeModalState|onMergeRowCells|onUnmergeRowCells|findMergeRangeCoveringColumn/.test(
    joinedAdded
  );
  const hasFirebaseOrSync = /firebase|firestore|onAuthStateChanged|autoSync|offlineQueue|isOnline|backup/.test(
    joinedAdded
  );
  const hasReleaseOrPwa = /version\.json|UpdateChangesModal|BUILD_ID|RELEASE_HISTORY|serviceWorker|registerSW/.test(
    joinedAdded
  );

  if (relPath === 'src/components/BudgetTable.tsx') {
    const affectedRows = detectBudgetRowNames(joinedAll);
    if (hasMergeLogic) {
      parts.push('Added Budget Table cell Merge & Unmerge and "Where to Merge" controls');
    } else if (hasDarkOrColor && affectedRows.length > 0) {
      parts.push(
        `Updated styling and cell colors for ${affectedRows.join(', ')} in the Budget Table`
      );
    } else if (hasDarkOrColor) {
      parts.push('Refined Budget Table layout, contrast, and Light/Dark styling');
    } else if (hasFormulaOrCalc) {
      parts.push('Updated Budget Table cell calculations and formula interactions');
    }
  } else if (hasReleaseOrPwa) {
    parts.push(`Enhanced ${info.area} for automatic update detection and changelog notices`);
  } else if (hasViewportOrModal) {
    parts.push(`Adjusted ${info.area} popup bounds and mobile browser safe-area spacing`);
  } else if (hasDarkOrColor) {
    parts.push(`Updated ${info.area} styling and Light/Dark theme appearance`);
  } else if (hasFormulaOrCalc) {
    parts.push(`Updated ${info.area} computations and financial logic`);
  } else if (hasFirebaseOrSync) {
    parts.push(`Updated ${info.area} cloud synchronization and offline handling`);
  }

  const phrases = extractReadableUiPhrases(added);
  if (parts.length === 0) {
    if (phrases.length > 0) {
      parts.push(`Updated ${info.area} (${phrases.map((p) => `"${p}"`).join(', ')})`);
    } else {
      parts.push(`Updated ${info.area} functionality and layout`);
    }
  } else if (phrases.length > 0 && parts[0].length < 68) {
    parts[0] = `${parts[0]} (${phrases.slice(0, 2).map((p) => `"${p}"`).join(', ')})`;
  }

  return {
    summary: parts[0].endsWith('.') ? parts[0] : `${parts[0]}.`,
    weight: Math.max(weight, 1),
    category: info.category,
    area: info.area,
  };
}

function formatManilaDateAndTime(now: Date): { date: string; timeLabel: string } {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  const timeLabel = `${new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(now)} PHT`;

  return { date, timeLabel };
}

function parseSemver(ver: string): [number, number, number] {
  const match = ver.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return [1, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function computeNextVersion(
  previousVersion: string,
  rootDir: string,
  isMinorUpdate: boolean
): string {
  let pkgVersion = '0.0.0';
  const pkgPath = path.resolve(rootDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
      if (parsed.version && /^\d+\.\d+\.\d+/.test(parsed.version)) {
        pkgVersion = parsed.version;
      }
    } catch {
      // ignore
    }
  }

  if (compareSemver(pkgVersion, previousVersion) > 0) {
    return pkgVersion;
  }

  const [major, minor, patch] = parseSemver(previousVersion);
  if (isMinorUpdate) {
    return `${major}.${minor + 1}.0`;
  }
  return `${major}.${minor}.${patch + 1}`;
}

function synthesizeAutoTitle(
  areaWeights: Map<string, number>,
  categoryWeights: Map<string, number>,
  addedCount: number
): string {
  const rankedAreas = Array.from(areaWeights.entries())
    .filter(([area]) => area !== 'Build Metadata')
    .sort((a, b) => b[1] - a[1])
    .map(([area]) => area);

  const rankedCats = Array.from(categoryWeights.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat);

  if (rankedAreas.length === 1) {
    return `${rankedAreas[0]} Update`;
  }
  if (rankedAreas.length === 2) {
    return `${rankedAreas[0]} & ${rankedAreas[1]} Updates`;
  }
  if (rankedCats.length >= 2) {
    return addedCount > 0
      ? `New Features: ${rankedCats[0]} & ${rankedCats[1]}`
      : `${rankedCats[0]} & ${rankedCats[1]} Improvements`;
  }
  if (rankedAreas.length > 0) {
    return `${rankedAreas[0]}, ${rankedAreas[1]} & More`;
  }
  return 'Application Updates & Improvements';
}

function readSeedReleaseNotes(rootDir: string): AutoReleaseEntry[] {
  const releaseNotesPath = path.resolve(rootDir, 'src/data/releaseNotes.json');
  if (!fs.existsSync(releaseNotesPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(releaseNotesPath, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        buildId: typeof item.buildId === 'string' ? item.buildId : 'seed-v2.4.0',
        buildTime: typeof item.buildTime === 'string' ? item.buildTime : new Date().toISOString(),
        version: typeof item.version === 'string' ? item.version : '2.4.0',
        date: typeof item.date === 'string' ? item.date : formatManilaDateAndTime(new Date()).date,
        timeLabel: typeof item.timeLabel === 'string' ? item.timeLabel : undefined,
        title: typeof item.title === 'string' ? item.title : 'Application Update',
        changes: Array.isArray(item.changes) && item.changes.length > 0
          ? item.changes.map((c: unknown) => String(c))
          : ['Updated features and improvements.'],
      }));
  } catch {
    return [];
  }
}

export function resolveAutoReleaseState(
  rootDir: string,
  buildId: string,
  buildTime: string,
  options?: { persist?: boolean }
): { latest: AutoReleaseEntry; history: AutoReleaseEntry[] } {
  const shouldPersist = options?.persist !== false;
  const historyFilePath = path.resolve(rootDir, HISTORY_FILENAME);

  let state: PersistedReleaseState | null = null;
  if (fs.existsSync(historyFilePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(historyFilePath, 'utf8')) as PersistedReleaseState;
      if (parsed && Array.isArray(parsed.releases) && parsed.releases.length > 0) {
        state = parsed;
      }
    } catch {
      state = null;
    }
  }

  // Fast idempotent return when source code hasn't changed since last recorded release
  if (state && state.releases[0]?.buildId === buildId) {
    if (shouldPersist) {
      syncPackageAndReadmeMetadata(rootDir, state.releases[0], state.releases);
    }
    return {
      latest: state.releases[0],
      history: state.releases,
    };
  }

  const currentSnapshot = captureWorkspaceSnapshot(rootDir);

  // First-ever bootstrap (no .pesobudget-release-history.json yet)
  if (!state) {
    const seeds = readSeedReleaseNotes(rootDir);
    const seedLatest = seeds[0];
    const { date, timeLabel } = formatManilaDateAndTime(new Date(buildTime));
    const initialRelease: AutoReleaseEntry = seedLatest
      ? {
          ...seedLatest,
          buildId,
          buildTime,
          timeLabel: seedLatest.timeLabel || timeLabel,
        }
      : {
          buildId,
          buildTime,
          version: '1.0.0',
          date,
          timeLabel,
          title: 'Initial Published Release',
          changes: ['Published PesoBudget web application with automatic update detection.'],
        };

    const releases = [initialRelease, ...seeds.slice(1)].slice(0, MAX_STORED_RELEASES);
    if (shouldPersist) {
      const nextState: PersistedReleaseState = {
        releases,
        baselineHashes: currentSnapshot.hashes,
        baselineTextsGzip: compressTexts(currentSnapshot.texts),
      };
      fs.writeFileSync(historyFilePath, JSON.stringify(nextState, null, 2), 'utf8');
      syncPackageAndReadmeMetadata(rootDir, initialRelease, releases);
    }
    return { latest: initialRelease, history: releases };
  }

  // Subsequent updates: compute real semantic diff against previous baseline!
  const oldHashes = state.baselineHashes || {};
  const oldTexts = decompressTexts(state.baselineTextsGzip);
  const newHashes = currentSnapshot.hashes;
  const newTexts = currentSnapshot.texts;

  const addedFiles: string[] = [];
  const removedFiles: string[] = [];
  const modifiedFiles: string[] = [];

  for (const rel of Object.keys(newHashes)) {
    if (!(rel in oldHashes)) {
      addedFiles.push(rel);
    } else if (oldHashes[rel] !== newHashes[rel]) {
      modifiedFiles.push(rel);
    }
  }
  for (const rel of Object.keys(oldHashes)) {
    if (!(rel in newHashes)) {
      removedFiles.push(rel);
    }
  }

  const areaWeights = new Map<string, number>();
  const categoryWeights = new Map<string, number>();
  const changeBullets: string[] = [];
  const seenBullets = new Set<string>();
  let totalChangedLines = 0;

  const addBullet = (text: string) => {
    const normalized = text.trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seenBullets.has(key)) return;
    seenBullets.add(key);
    changeBullets.push(normalized);
  };

  for (const rel of addedFiles) {
    const info = getAreaForPath(rel);
    areaWeights.set(info.area, (areaWeights.get(info.area) || 0) + 30);
    categoryWeights.set(info.category, (categoryWeights.get(info.category) || 0) + 30);
    totalChangedLines += 30;
    addBullet(`Added ${info.area} (${info.category.toLowerCase()}).`);
  }

  const modSummaries: Array<{ summary: string; weight: number }> = [];
  for (const rel of modifiedFiles) {
    const result = summarizeFileChange(rel, oldTexts[rel] || '', newTexts[rel] || '');
    totalChangedLines += result.weight;
    areaWeights.set(result.area, (areaWeights.get(result.area) || 0) + result.weight);
    categoryWeights.set(result.category, (categoryWeights.get(result.category) || 0) + result.weight);
    modSummaries.push({ summary: result.summary, weight: result.weight });
  }

  modSummaries
    .sort((a, b) => b.weight - a.weight)
    .forEach((item) => addBullet(item.summary));

  for (const rel of removedFiles) {
    const info = getAreaForPath(rel);
    areaWeights.set(info.area, (areaWeights.get(info.area) || 0) + 10);
    categoryWeights.set(info.category, (categoryWeights.get(info.category) || 0) + 10);
    addBullet(`Removed deprecated ${info.area}.`);
  }

  const manualWasDirectlyChanged =
    addedFiles.includes('src/utils/manualPdfService.ts') ||
    modifiedFiles.includes('src/utils/manualPdfService.ts');

  if (!manualWasDirectlyChanged && changeBullets.length > 0) {
    addBullet(
      'Automatically updated downloadable User Manual (PDF) with the latest release notes and version.'
    );
  }

  if (changeBullets.length === 0) {
    addBullet('Updated application assets, configuration, and performance.');
  }

  const prevLatest = state.releases[0];
  const addedCodeFiles = addedFiles.filter(
    (f) => f.startsWith('src/') && (f.endsWith('.ts') || f.endsWith('.tsx'))
  );
  const isMinorUpdate =
    addedCodeFiles.length > 0 || (categoryWeights.size >= 3 && totalChangedLines >= 60);

  const nextVersion = computeNextVersion(prevLatest.version, rootDir, isMinorUpdate);
  const { date, timeLabel } = formatManilaDateAndTime(new Date(buildTime));
  const title = synthesizeAutoTitle(areaWeights, categoryWeights, addedCodeFiles.length);

  const newRelease: AutoReleaseEntry = {
    buildId,
    buildTime,
    version: nextVersion,
    date,
    timeLabel,
    title,
    changes: changeBullets.slice(0, 7),
  };

  const releases = [newRelease, ...state.releases].slice(0, MAX_STORED_RELEASES);

  if (shouldPersist) {
    const nextState: PersistedReleaseState = {
      releases,
      baselineHashes: newHashes,
      baselineTextsGzip: compressTexts(newTexts),
    };
    fs.writeFileSync(historyFilePath, JSON.stringify(nextState, null, 2), 'utf8');
    syncPackageAndReadmeMetadata(rootDir, newRelease, releases);
  }

  return { latest: newRelease, history: releases };
}

function syncPackageAndReadmeMetadata(
  rootDir: string,
  latest: AutoReleaseEntry,
  history: AutoReleaseEntry[]
): void {
  // 1. Keep package.json version synchronized automatically with latest computed version
  const pkgPath = path.resolve(rootDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const rawPkg = fs.readFileSync(pkgPath, 'utf8');
      const parsedPkg = JSON.parse(rawPkg) as { version?: string; [k: string]: unknown };
      if (parsedPkg.version !== latest.version) {
        parsedPkg.version = latest.version;
        fs.writeFileSync(pkgPath, `${JSON.stringify(parsedPkg, null, 2)}\n`, 'utf8');
      }
    } catch {
      // ignore package.json write errors
    }
  }

  // 2. Keep README.md Auto-Release section synchronized automatically whenever changes build
  const readmePath = path.resolve(rootDir, 'README.md');
  if (fs.existsSync(readmePath)) {
    try {
      const startMarker = '<!-- AUTO-RELEASE-START -->';
      const endMarker = '<!-- AUTO-RELEASE-END -->';
      const rawReadme = fs.readFileSync(readmePath, 'utf8');
      const startIdx = rawReadme.indexOf(startMarker);
      const endIdx = rawReadme.indexOf(endMarker);

      const recentLines = history
        .slice(0, 4)
        .map(
          (rel) =>
            `- **v${rel.version}** (${rel.date}${rel.timeLabel ? ` · ${rel.timeLabel}` : ''}) — **${rel.title}**\n` +
            rel.changes.slice(0, 4).map((c) => `  - ${c}`).join('\n')
        )
        .join('\n');

      const generatedBlock = `${startMarker}\n**Current Version:** \`v${latest.version}\` (${latest.date}${latest.timeLabel ? ` · ${latest.timeLabel}` : ''}) — *${latest.title}*\n\n${recentLines}\n${endMarker}`;

      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const currentSlice = rawReadme.slice(startIdx, endIdx + endMarker.length);
        if (currentSlice !== generatedBlock) {
          const updatedReadme =
            rawReadme.slice(0, startIdx) +
            generatedBlock +
            rawReadme.slice(endIdx + endMarker.length);
          fs.writeFileSync(readmePath, updatedReadme, 'utf8');
        }
      }
    } catch {
      // ignore README sync errors
    }
  }
}
