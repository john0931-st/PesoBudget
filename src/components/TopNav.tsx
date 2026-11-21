import React from 'react';
import { ActiveTab, UserSecurityProfile } from '../types/budget';
import { Settings, Wifi, WifiOff, Sun, Moon, HardDrive, RefreshCw } from 'lucide-react';
import { ThemeMode } from '../utils/theme';

export type SaveSyncActivity = 'idle' | 'saving-local' | 'syncing-firebase';

interface TopNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onNewMonth?: () => void;
  onOpenImportExport?: () => void;
  onOpenSettings: () => void;
  securityProfile?: UserSecurityProfile;
  currentMonthName: string;
  isOnline?: boolean;
  offlineCount?: number;
  onOpenSyncModal?: () => void;
  theme?: ThemeMode;
  onToggleTheme?: () => void;
  saveSyncActivity?: SaveSyncActivity;
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  onTabChange,
  onOpenSettings,
  isOnline = true,
  offlineCount = 0,
  onOpenSyncModal,
  theme = 'dark',
  onToggleTheme,
  saveSyncActivity = 'idle',
}) => {
  const isDark = theme === 'dark';

  return (
    <header className="w-full flex items-center justify-between gap-2 sm:gap-3 lg:gap-6 px-2.5 sm:px-5 py-2 lg:py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-2xs min-w-0 transition-colors">
      {/* Zone 1: Complete App Title */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 min-w-0">
        <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-lg bg-slate-900 dark:bg-emerald-600 text-white flex items-center justify-center font-bold text-sm lg:text-base tracking-tight shadow-xs shrink-0">
          ₱
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[15px] sm:text-base lg:text-[17px] font-extrabold tracking-tight text-slate-900 dark:text-slate-100 leading-tight whitespace-nowrap shrink-0">
            PesoBudget
          </span>
          <span className="text-[10.5px] sm:text-[11px] lg:text-xs font-semibold tracking-wider text-emerald-700 dark:text-emerald-400 uppercase whitespace-nowrap">
            Expense & Payroll Tracker
          </span>
        </div>
      </div>

      {/* Zone 2: Navigation tabs (desktop lg+ to avoid pushing Zone 3 off tablet screens) */}
      <nav className="hidden lg:flex items-center gap-5 xl:gap-7 text-sm xl:text-[15px] font-medium text-slate-600 dark:text-slate-300">
        <button
          onClick={() => onTabChange('sheet')}
          className={`pb-1 text-sm xl:text-[15px] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'sheet'
              ? 'text-slate-900 dark:text-slate-100 font-bold border-b-2 border-slate-900 dark:border-emerald-400'
              : 'hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          Budget Sheet
        </button>
        <button
          onClick={() => onTabChange('charts')}
          className={`pb-1 text-sm xl:text-base transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'charts'
              ? 'text-slate-900 dark:text-slate-100 font-bold border-b-2 border-slate-900 dark:border-emerald-400'
              : 'hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          Summary & Graphs
        </button>
        <button
          onClick={() => onTabChange('summary')}
          className={`pb-1 text-sm xl:text-base transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'summary'
              ? 'text-slate-900 dark:text-slate-100 font-bold border-b-2 border-slate-900 dark:border-emerald-400'
              : 'hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          Monthly Summary
        </button>
        <button
          onClick={() => onTabChange('changelog')}
          className={`pb-1 text-sm xl:text-base transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'changelog'
              ? 'text-slate-900 dark:text-slate-100 font-bold border-b-2 border-slate-900 dark:border-emerald-400'
              : 'hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          Change Log
        </button>
      </nav>

      {/* Zone 3: Auto-Save / Firebase Sync Indicator + Theme Toggle + Online/Offline + Settings */}
      <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0">
        {/* Subtle Saving / Firebase Syncing Visual Indicator */}
        {saveSyncActivity !== 'idle' && (
          <div
            role="status"
            aria-live="polite"
            data-testid="save-sync-indicator"
            title={
              saveSyncActivity === 'syncing-firebase'
                ? 'Syncing changes to Firebase...'
                : 'Auto-saving changes to local storage...'
            }
            aria-label={
              saveSyncActivity === 'syncing-firebase'
                ? 'Syncing changes to Firebase'
                : 'Auto-saving changes to local storage'
            }
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium shrink-0 whitespace-nowrap transition-all ${
              saveSyncActivity === 'syncing-firebase'
                ? 'bg-sky-50/90 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800/80 text-sky-700 dark:text-sky-300'
                : 'bg-emerald-50/90 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/80 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  saveSyncActivity === 'syncing-firebase' ? 'bg-sky-400' : 'bg-emerald-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                  saveSyncActivity === 'syncing-firebase' ? 'bg-sky-500' : 'bg-emerald-500'
                }`}
              />
            </span>
            {saveSyncActivity === 'syncing-firebase' ? (
              <RefreshCw className="w-3 h-3 text-sky-600 dark:text-sky-400 animate-spin shrink-0" />
            ) : (
              <HardDrive className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
            )}
            <span className="hidden md:inline">
              {saveSyncActivity === 'syncing-firebase' ? 'Syncing…' : 'Saving…'}
            </span>
          </div>
        )}

        {/* Light / Dark Theme Toggle beside Online/Offline indicator */}
        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            data-testid="theme-toggle"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-pressed={isDark}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-[13px] lg:text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer shadow-2xs shrink-0 whitespace-nowrap"
          >
            {isDark ? (
              <Sun className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-amber-400 shrink-0" />
            ) : (
              <Moon className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-slate-700 shrink-0" />
            )}
            <span className="hidden md:inline text-xs lg:text-[13px] font-semibold">
              {isDark ? 'Light' : 'Dark'}
            </span>
          </button>
        )}

        {/* Online / Offline Status Indicator */}
        <button
          type="button"
          onClick={onOpenSyncModal}
          title={
            isOnline
              ? offlineCount > 0
                ? `Online · ${offlineCount} offline change(s) ready to upload (Click to sync)`
                : 'Online · Connected (Click to check sync status)'
              : `Offline Mode · ${offlineCount} modification(s) saved locally (Click to view)`
          }
          className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-[13px] lg:text-sm font-semibold rounded-lg border transition-all cursor-pointer shadow-2xs shrink-0 whitespace-nowrap ${
            isOnline
              ? offlineCount > 0
                ? 'bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/70 border-amber-300 dark:border-amber-700/80 text-amber-900 dark:text-amber-200 ring-1 ring-amber-300 dark:ring-amber-700/60'
                : 'bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border-emerald-200 dark:border-emerald-700/80 text-emerald-900 dark:text-emerald-200'
              : 'bg-amber-100 dark:bg-amber-950/80 hover:bg-amber-200 dark:hover:bg-amber-900/80 border-amber-400 dark:border-amber-600 text-amber-950 dark:text-amber-200 font-bold'
          }`}
        >
          {isOnline ? (
            <>
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <Wifi className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
              {offlineCount > 0 ? (
                <span className="font-mono text-[11px] sm:text-xs font-bold text-amber-900 dark:text-amber-200 bg-amber-200/80 dark:bg-amber-900/70 px-1.5 py-0.2 rounded-full whitespace-nowrap">
                  {offlineCount} sync
                </span>
              ) : (
                <span className="text-xs sm:text-[13px] lg:text-sm font-bold text-emerald-800 dark:text-emerald-300">Online</span>
              )}
            </>
          ) : (
            <>
              <span className="inline-flex rounded-full h-2 w-2 bg-amber-500 shrink-0"></span>
              <WifiOff className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-amber-700 dark:text-amber-400 shrink-0" />
              <span className="text-xs sm:text-[13px] lg:text-sm font-bold text-amber-900 dark:text-amber-200">Offline</span>
              {offlineCount > 0 && (
                <span className="font-mono text-[11px] lg:text-xs bg-amber-300 dark:bg-amber-800 text-amber-950 dark:text-amber-100 font-black px-1.5 py-0.2 rounded-full">
                  {offlineCount}
                </span>
              )}
            </>
          )}
        </button>

        {/* Settings Gear Button */}
        <button
          onClick={onOpenSettings}
          title="Settings (Account, Cloud Backup & Restore)"
          aria-label="Settings"
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-[13px] lg:text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer shadow-2xs shrink-0 whitespace-nowrap"
        >
          <Settings className="w-4 h-4 text-slate-700 dark:text-slate-300 hover:rotate-45 transition-transform shrink-0" />
          <span className="hidden sm:inline">Settings</span>
        </button>
      </div>
    </header>
  );
};
