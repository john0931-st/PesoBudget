/**
 * @file portableBundleExporter.ts
 * @description Packages a complete, organized portable "PesoBudget/" folder as a ZIP archive.
 * Contains a self-contained offline/online index.html, organized app/ assets,
 * and an organized data/ database folder (sheets.json, years.json, changelog.json, etc.).
 */

import JSZip from 'jszip';
import type { MonthData, UserSecurityProfile } from '../types/budget';
import { getChangeLogs } from './changeLogService';
import { getOfflineChanges } from './offlineQueue';
import { buildOrganizedDatabaseFiles } from './localFolderDb';
import { getActiveMonthId } from './storage';
import {
  createPortableLockMetadata,
  encryptTextWithPassword,
  type EncryptedEnvelope,
  type PortableLockMetadata,
} from './portableCrypto';

interface PortableAssetEntry {
  path: string;
  encoding: 'utf8' | 'base64';
  content: string;
}

interface PortableHtmlBundlePayload {
  generatedAt: string;
  css: string;
  js: string;
  manifestJson: string;
  icons: PortableAssetEntry[];
}

const PORTABLE_README = `PesoBudget - Portable Offline & Online HTML App Folder
=====================================================

Organized Folder Structure:
---------------------------
PesoBudget/
  index.html                         <-- Open this file on any device (works 100% offline!)
  README-OFFLINE.txt                 <-- This setup guide
  Start-PesoBudget-Windows.bat       <-- Windows 1-click local server (enables Google/Firebase sync when online)
  Start-PesoBudget-Mac-Linux.command <-- MacBook/Linux 1-click local server (enables Google/Firebase sync)
  app/
    manifest.webmanifest
    pesobudget.css
    pesobudget.js
    icons/
  data/                              <-- Organized local database files
    pesobudget-database.json         <-- All-in-one database (sheets, years, changelog, settings, queue)
    sheets.json                      <-- Monthly budget sheets, cutoffs, formulas & notes
    years.json                       <-- Calendar years
    changelog.json                   <-- Audit trail history
    settings.json                    <-- Profile & sync settings
    offline-queue.json               <-- Pending offline changes queue
    database-info.json               <-- Database index & metadata


Password Security:
------------------
If you set a Portable Password before downloading this folder:
- index.html and data/*.json are encrypted with PBKDF2-SHA256.
- Opening index.html will prompt for your password before revealing any expenses or sheets.
- Closing the browser tab locks the app again automatically.


How to Open on Each Device:
---------------------------
1. WINDOWS / LAPTOP / DESKTOP:
   - Extract (Unzip) the PesoBudget folder anywhere (Desktop, Documents, or USB drive).
   - Double-click "index.html" to run 100% OFFLINE in Chrome, Edge, or Firefox.
   - Inside Settings -> "Portable HTML App Folder", click "Connect data/ Folder" so edits save directly into PesoBudget/data/*.json!
   - Optional (for online Google Sign-In & Firebase Cloud Sync): double-click "Start-PesoBudget-Windows.bat".

2. MACBOOK / macOS:
   - Double-click the ZIP file in Finder to extract the "PesoBudget" folder.
   - Double-click "index.html" to open offline in Safari or Chrome.
   - Optional (for online Google Sign-In & Firebase Cloud Sync): double-click "Start-PesoBudget-Mac-Linux.command".

3. ANDROID PHONE / TABLET:
   - Extract the ZIP folder in your Files app.
   - Tap "index.html" -> Open with Chrome / HTML Viewer for offline viewing.

4. iPHONE / iPAD (iOS):
   - Extract the ZIP in the Apple Files app -> open the "PesoBudget" folder -> tap "index.html".
   - For full offline storage + online Firebase sync on iPhone, open your deployed HTTPS link in Safari -> Share -> "Add to Home Screen".
`;

const START_WINDOWS_BAT = `@echo off
title PesoBudget Portable Local Server
echo Starting PesoBudget on http://localhost:8080 ...
echo Press CTRL+C to stop the server when finished.
echo.
where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:8080"
  python -m http.server 8080
  exit /b
)
where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:8080"
  py -3 -m http.server 8080
  exit /b
)
echo Python not found. Opening index.html directly in offline mode...
start "" "index.html"
`;

const START_MAC_COMMAND = `#!/bin/bash
cd "$(dirname "$0")"
echo "Starting PesoBudget on http://localhost:8080 ..."
if command -v python3 >/dev/null 2>&1; then
  (sleep 1 && open "http://localhost:8080" 2>/dev/null || xdg-open "http://localhost:8080" 2>/dev/null) &
  python3 -m http.server 8080
else
  echo "Python 3 not found. Opening index.html directly in offline mode..."
  open "index.html" 2>/dev/null || xdg-open "index.html" 2>/dev/null
fi
`;

function buildPortableIndexHtml(params: {
  css: string;
  js: string;
  seedJson?: string;
  lockMeta?: PortableLockMetadata | null;
  encryptedSeed?: EncryptedEnvelope | null;
}): string {
  const safeJs = params.js.replace(/<\/script/gi, '<\\/script');

  let seedScriptContent = '';
  if (params.lockMeta && params.encryptedSeed) {
    const lockJson = JSON.stringify(params.lockMeta).replace(/</g, '\\u003c');
    const encJson = JSON.stringify(params.encryptedSeed).replace(/</g, '\\u003c');
    seedScriptContent = `window.__PESOBUDGET_PORTABLE_LOCK__ = ${lockJson}; window.__PESOBUDGET_ENCRYPTED_SEED__ = ${encJson};`;
  } else if (params.seedJson) {
    const safeSeed = params.seedJson.replace(/</g, '\\u003c');
    seedScriptContent = `window.__PESOBUDGET_PORTABLE_SEED__ = ${safeSeed};`;
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes" />
    <title>PesoBudget - Smart Expense &amp; Payroll Tracker</title>
    <meta name="description" content="PesoBudget: Offline & Online Philippine Expense & Payroll Tracker" />
    <meta name="theme-color" content="#0f172a" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="PesoBudget" />
    <link rel="manifest" href="./app/manifest.webmanifest" />
    <link rel="icon" type="image/svg+xml" href="./app/icons/icon.svg" />
    <link rel="apple-touch-icon" href="./app/icons/apple-touch-icon.png" />
    <style>${params.css}</style>
  </head>
  <body class="bg-slate-100 text-slate-900 antialiased font-sans selection:bg-emerald-100 selection:text-emerald-900 overscroll-none">
    <div id="root"></div>
    <script>${seedScriptContent}</script>
    <script>${safeJs}</script>
  </body>
</html>
`;
}

export async function exportPortableAppFolderZip(params: {
  months: Record<string, MonthData>;
  years: number[];
  securityProfile: UserSecurityProfile;
  activeMonthId?: string;
  lockPassword?: string;
  lockHint?: string;
}): Promise<{ filename: string; fileCount: number; isEncrypted: boolean }> {
  const response = await fetch('/portable-html-bundle.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not build portable HTML app (HTTP ${response.status}).`);
  }

  const bundle = (await response.json()) as PortableHtmlBundlePayload;
  if (!bundle.js || !bundle.css) {
    throw new Error('Portable HTML bundle returned empty JS or CSS.');
  }

  const activeId = params.activeMonthId || getActiveMonthId();
  const changeLogs = getChangeLogs();
  const offlineQueue = getOfflineChanges();
  const trimmedPassword = params.lockPassword?.trim() ? params.lockPassword : '';
  const isEncrypted = trimmedPassword.length > 0;

  const dbFiles = buildOrganizedDatabaseFiles({
    months: params.months,
    years: params.years,
    securityProfile: params.securityProfile,
    activeMonthId: activeId,
    password: isEncrypted ? trimmedPassword : null,
  });

  const seedPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    activeMonthId: activeId,
    months: params.months,
    years: params.years,
    changeLogs,
    offlineQueue,
  };
  const seedJson = JSON.stringify(seedPayload);

  let indexHtml: string;
  if (isEncrypted) {
    const lockMeta = createPortableLockMetadata(trimmedPassword, params.lockHint);
    const encryptedSeed = encryptTextWithPassword(seedJson, trimmedPassword);
    indexHtml = buildPortableIndexHtml({
      css: bundle.css,
      js: bundle.js,
      lockMeta,
      encryptedSeed,
    });
  } else {
    indexHtml = buildPortableIndexHtml({
      css: bundle.css,
      js: bundle.js,
      seedJson,
    });
  }

  const zip = new JSZip();
  const root = zip.folder('PesoBudget');
  if (!root) {
    throw new Error('Failed to create PesoBudget folder in ZIP archive.');
  }

  // 1. Root HTML entry point & cross-platform launchers/README
  root.file('index.html', indexHtml);
  root.file('README-OFFLINE.txt', PORTABLE_README);
  root.file('Start-PesoBudget-Windows.bat', START_WINDOWS_BAT);
  root.file('Start-PesoBudget-Mac-Linux.command', START_MAC_COMMAND, { unixPermissions: '755' });

  // 2. Organized app/ folder (manifest, CSS, JS, icons)
  root.file('app/manifest.webmanifest', bundle.manifestJson);
  root.file('app/pesobudget.css', bundle.css);
  root.file('app/pesobudget.js', bundle.js);
  for (const icon of bundle.icons) {
    if (icon.encoding === 'base64') {
      root.file(`app/icons/${icon.path}`, icon.content, { base64: true });
    } else {
      root.file(`app/icons/${icon.path}`, icon.content);
    }
  }

  // 3. Organized data/ database folder
  root.file('data/pesobudget-database.json', dbFiles.allInOneJson);
  root.file('data/sheets.json', dbFiles.sheetsJson);
  root.file('data/years.json', dbFiles.yearsJson);
  root.file('data/changelog.json', dbFiles.changelogJson);
  root.file('data/settings.json', dbFiles.settingsJson);
  root.file('data/offline-queue.json', dbFiles.offlineQueueJson);
  root.file('data/database-info.json', dbFiles.databaseInfoJson);

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'UNIX',
  });

  const filename = 'PesoBudget-Portable-App.zip';
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
    fileCount: 12 + bundle.icons.length,
    isEncrypted,
  };
}
