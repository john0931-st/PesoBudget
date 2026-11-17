/**
 * @file MonthSheetTabs.tsx
 * @description Excel / Google Sheets style bottom tabs for switching between budget months in PesoBudget.
 * 
 * Features:
 * - When clicking a sheet tab, an interactive popup menu appears offering:
 *   1. Edit Name (Rename Sheet)
 *   2. Duplicate Sheet
 *   3. Delete Sheet (with safe multi-sheet validation)
 * - Horizontal scrolling controls for extensive monthly histories.
 * - Quick "+ Add Sheet" button.
 */

import React, { useState, useRef, useEffect } from 'react';
import { MonthData } from '../types/budget';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Layers,
  MoreVertical,
  Edit2,
  Copy,
  Trash2,
  X,
  Check,
  AlertTriangle,
  BarChart3,
  History,
} from 'lucide-react';

interface MonthSheetTabsProps {
  months: Record<string, MonthData>;
  activeMonthId: string;
  onSelectMonth: (monthId: string) => void;
  onAddNewMonth: () => void;
  onRenameMonth: (monthId: string, newName: string) => void;
  onDuplicateMonth: (monthId: string) => void;
  onDeleteMonth: (monthId: string) => void;
  onOpenSummarySheet?: () => void;
  isSummaryActive?: boolean;
  onOpenChangeLog?: () => void;
  isChangeLogActive?: boolean;
}

export const MonthSheetTabs: React.FC<MonthSheetTabsProps> = ({
  months,
  activeMonthId,
  onSelectMonth,
  onAddNewMonth,
  onRenameMonth,
  onDuplicateMonth,
  onDeleteMonth,
  onOpenSummarySheet,
  isSummaryActive,
  onOpenChangeLog,
  isChangeLogActive,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Active popup target month ID
  const [menuTargetMonthId, setMenuTargetMonthId] = useState<string | null>(null);

  // Popup sub-state: 'menu' | 'editing_name' | 'confirm_delete'
  const [popupMode, setPopupMode] = useState<'menu' | 'editing_name' | 'confirm_delete'>('menu');
  const [renameInput, setRenameInput] = useState('');

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setMenuTargetMonthId(null);
        setPopupMode('menu');
      }
    };
    if (menuTargetMonthId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuTargetMonthId]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuTargetMonthId(null);
        setPopupMode('menu');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -150 : 150,
        behavior: 'smooth',
      });
    }
  };

  const monthList = Object.values(months);
  const targetMonth = menuTargetMonthId ? months[menuTargetMonthId] : null;

  /**
   * Opens the action popup for a sheet
   */
  const handleOpenSheetMenu = (monthId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    onSelectMonth(monthId);

    if (menuTargetMonthId === monthId) {
      // Toggle off if already open
      setMenuTargetMonthId(null);
      setPopupMode('menu');
    } else {
      setMenuTargetMonthId(monthId);
      setPopupMode('menu');
      setRenameInput(months[monthId]?.name || '');
    }
  };

  /**
   * Handles Renaming
   */
  const handleStartRename = () => {
    if (targetMonth) {
      setRenameInput(targetMonth.name);
      setPopupMode('editing_name');
    }
  };

  const handleSaveRename = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (menuTargetMonthId && renameInput.trim()) {
      onRenameMonth(menuTargetMonthId, renameInput.trim());
      setMenuTargetMonthId(null);
      setPopupMode('menu');
    }
  };

  /**
   * Handles Duplicating
   */
  const handleDuplicate = () => {
    if (menuTargetMonthId) {
      onDuplicateMonth(menuTargetMonthId);
      setMenuTargetMonthId(null);
      setPopupMode('menu');
    }
  };

  /**
   * Handles Deleting
   */
  const handleConfirmDelete = () => {
    if (menuTargetMonthId) {
      onDeleteMonth(menuTargetMonthId);
      setMenuTargetMonthId(null);
      setPopupMode('menu');
    }
  };

  return (
    <div className="relative w-full mx-auto">
      {/* Interactive Sheet Action Popup Anchor */}
      {menuTargetMonthId && targetMonth && (
        <div
          ref={popupRef}
          className="absolute bottom-14 z-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-3.5 w-68 lg:w-76 text-xs lg:text-sm font-sans animate-in fade-in zoom-in-95 duration-150"
          style={{ left: '50%', transform: 'translateX(-50%)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 min-w-0">
              <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="font-bold text-slate-900 dark:text-slate-100 truncate">{targetMonth.name}</span>
            </div>
            <button
              onClick={() => {
                setMenuTargetMonthId(null);
                setPopupMode('menu');
              }}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* MODE 1: DEFAULT MENU OPTIONS */}
          {popupMode === 'menu' && (
            <div className="space-y-1">
              {/* Option 1: Edit Name */}
              <button
                type="button"
                onClick={handleStartRename}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition-colors cursor-pointer text-left"
              >
                <Edit2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Edit Name (Rename Sheet)</span>
              </button>

              {/* Option 2: Duplicate Sheet */}
              <button
                type="button"
                onClick={handleDuplicate}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition-colors cursor-pointer text-left"
              >
                <Copy className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Duplicate Sheet</span>
              </button>

              {/* Option 3: Delete Sheet */}
              <button
                type="button"
                onClick={() => setPopupMode('confirm_delete')}
                disabled={monthList.length <= 1}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl font-medium transition-colors text-left ${
                  monthList.length <= 1
                    ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed'
                    : 'text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer'
                }`}
                title={monthList.length <= 1 ? 'Cannot delete the only sheet' : 'Delete sheet'}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Sheet</span>
                {monthList.length <= 1 && (
                  <span className="text-[10px] lg:text-xs text-slate-400 dark:text-slate-500 ml-auto">(Only 1)</span>
                )}
              </button>
            </div>
          )}

          {/* MODE 2: EDIT NAME / RENAME INLINE */}
          {popupMode === 'editing_name' && (
            <form onSubmit={handleSaveRename} className="space-y-2.5 pt-1">
              <div>
                <label className="block text-[11px] lg:text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  New Sheet Name:
                </label>
                <input
                  type="text"
                  autoFocus
                  value={renameInput}
                  onChange={(e) => setRenameInput(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:border-slate-900 dark:focus:border-emerald-500 rounded-lg text-xs lg:text-sm font-semibold focus:outline-none"
                  placeholder="e.g. November 2026"
                />
              </div>

              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setPopupMode('menu')}
                  className="px-2.5 py-1 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-[11px] lg:text-xs rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!renameInput.trim()}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white rounded-lg text-[11px] lg:text-xs font-semibold cursor-pointer shadow-xs"
                >
                  <Check className="w-3 h-3" />
                  <span>Save</span>
                </button>
              </div>
            </form>
          )}

          {/* MODE 3: CONFIRM DELETE */}
          {popupMode === 'confirm_delete' && (
            <div className="space-y-2.5 pt-1">
              <div className="flex items-start gap-2 text-rose-700 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 p-2 rounded-lg border border-rose-200 dark:border-rose-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="text-[11px] lg:text-xs leading-tight">
                  Are you sure you want to delete <strong>{targetMonth.name}</strong>? This action cannot be undone.
                </span>
              </div>

              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setPopupMode('menu')}
                  className="px-2.5 py-1 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 text-[11px] lg:text-xs rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] lg:text-xs font-semibold cursor-pointer shadow-xs"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Modern Sheet Dock Container */}
      <div className="w-full mt-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs p-1 select-none text-xs lg:text-sm font-sans transition-colors">
        <div className="flex items-center gap-1.5">
          {/* Scroll controls (left) */}
          <button
            onClick={() => scroll('left')}
            className="w-7 h-7 lg:w-8 lg:h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Scroll left"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Sheet Pills List */}
          <div
            ref={scrollRef}
            className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5 px-0.5"
            style={{ scrollbarWidth: 'none' }}
          >
            {monthList.map((m) => {
              const isActive = m.id === activeMonthId;
              const isMenuOpen = menuTargetMonthId === m.id;

              return (
                <div
                  key={m.id}
                  onClick={() => {
                    onSelectMonth(m.id);
                    if (menuTargetMonthId && menuTargetMonthId !== m.id) {
                      setMenuTargetMonthId(null);
                      setPopupMode('menu');
                    }
                  }}
                  className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs lg:text-sm transition-all shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 dark:bg-emerald-600 text-white font-bold shadow-xs'
                      : 'bg-slate-100/90 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium border border-slate-200/70 dark:border-slate-700'
                  } ${isMenuOpen ? 'ring-2 ring-emerald-500' : ''}`}
                  title={`Switch to ${m.name}`}
                >
                  {isActive ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 dark:bg-white inline-block shrink-0 animate-pulse" />
                  ) : (
                    <Layers className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 shrink-0" />
                  )}
                  <span className="whitespace-nowrap font-medium tracking-tight">{m.name}</span>

                  {/* 3-dots action button placed cleanly inside sheet pill */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenSheetMenu(m.id, e);
                    }}
                    className={`p-1 rounded-md transition-colors cursor-pointer -mr-1 ${
                      isActive
                        ? 'text-slate-300 dark:text-emerald-100 hover:text-white hover:bg-slate-800 dark:hover:bg-emerald-700'
                        : 'text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-300/60 dark:hover:bg-slate-600/60'
                    }`}
                    title="Sheet options: Rename, Duplicate, Delete"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            {/* Dedicated Summary Sheet Tab */}
            <div
              onClick={() => {
                if (onOpenSummarySheet) onOpenSummarySheet();
              }}
              className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs lg:text-sm transition-all shrink-0 cursor-pointer ${
                isSummaryActive
                  ? 'bg-emerald-700 dark:bg-emerald-600 text-white font-bold shadow-xs'
                  : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 font-semibold border border-emerald-200/80 dark:border-emerald-800'
              }`}
              title="Open Summary Sheet & Graphs"
            >
              <BarChart3 className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">Summary & Graphs</span>
            </div>

            {/* Dedicated Change Log Sheet Tab */}
            <div
              onClick={() => {
                if (onOpenChangeLog) onOpenChangeLog();
              }}
              className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs lg:text-sm transition-all shrink-0 cursor-pointer ${
                isChangeLogActive
                  ? 'bg-blue-700 dark:bg-blue-600 text-white font-bold shadow-xs'
                  : 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 font-semibold border border-blue-200/80 dark:border-blue-800'
              }`}
              title="Open Audit Change Log Sheet"
            >
              <History className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">Change Log</span>
            </div>

            {/* Plus Button to Add New Sheet */}
            <button
              onClick={onAddNewMonth}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white border border-dashed border-slate-300 dark:border-slate-600 font-medium text-xs lg:text-sm transition-colors cursor-pointer shrink-0"
              title="Add new sheet"
            >
              <Plus className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
              <span className="hidden sm:inline">Add Sheet</span>
            </button>
          </div>

          {/* Scroll controls (right) */}
          <button
            onClick={() => scroll('right')}
            className="w-7 h-7 lg:w-8 lg:h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Scroll right"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
