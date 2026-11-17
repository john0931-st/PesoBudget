/**
 * @file CellActionPopover.tsx
 * @description Modern One-Tap Cell Action Modal & Sheet.
 * Replaces old long-press behavior with a fast, modern single-tap menu.
 * Offers one-tap actions: Edit Value, Delete/Clear Value, Add Note, and Remove Note.
 * 
 * Every function and button handler is documented with clear comments.
 */

import React from 'react';
import { RowId, CellColumn } from '../types/budget';
import { formatPHP } from '../utils/currency';
import {
  Edit3,
  Trash2,
  StickyNote,
  FileMinus,
  X,
  Calculator,
  CornerDownLeft,
} from 'lucide-react';

export interface ActiveCellActionInfo {
  rowId: RowId;
  rowLabel: string;
  column: CellColumn;
  value: number;
  rawInput: string;
  note?: string;
  isReadOnly?: boolean;
}

interface CellActionPopoverProps {
  isOpen: boolean;
  cellInfo: ActiveCellActionInfo | null;
  onEditValue: () => void;
  onDeleteValue: () => void;
  onOpenNoteEditor: () => void;
  onRemoveNote: () => void;
  onClose: () => void;
}

export const CellActionPopover: React.FC<CellActionPopoverProps> = ({
  isOpen,
  cellInfo,
  onEditValue,
  onDeleteValue,
  onOpenNoteEditor,
  onRemoveNote,
  onClose,
}) => {
  if (!isOpen || !cellInfo) return null;

  const colTitle =
    cellInfo.column === 'monthly'
      ? 'Monthly'
      : cellInfo.column === 'cutoff15th'
      ? 'Kinsenas (15th)'
      : cellInfo.column === 'remarks'
      ? 'Remarks'
      : 'Payment Label';

  const hasNote = Boolean(cellInfo.note && cellInfo.note.trim().length > 0);
  const hasValue = Boolean(cellInfo.rawInput && cellInfo.rawInput.trim() !== '' && cellInfo.value !== 0);

  return (
    <div
      className="pb-modal-backdrop z-50 flex items-center justify-center bg-slate-950/40 dark:bg-slate-950/65 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* Popover Card */}
      <div
        className="pb-modal-card w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col scale-100 transition-all select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Strip */}
        <div className="bg-slate-900 dark:bg-slate-950 text-white p-4 flex items-center justify-between shrink-0 border-b border-transparent dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-bold text-emerald-400">
              ₱
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                {colTitle}
              </div>
              <h3 className="text-sm font-bold text-white leading-tight">
                {cellInfo.rowLabel}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Cell Preview */}
        <div className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium block">Current Value:</span>
            <div className="text-base font-bold font-mono text-slate-900 dark:text-slate-100">
              {cellInfo.column === 'remarks' || cellInfo.column === 'payments'
                ? cellInfo.rawInput || '—'
                : formatPHP(cellInfo.value)}
            </div>
            {cellInfo.rawInput && cellInfo.rawInput.startsWith('=') && (
              <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 block">
                Formula: {cellInfo.rawInput}
              </span>
            )}
          </div>

          {/* Note Status Badge */}
          {hasNote ? (
            <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 text-[11px] font-semibold px-2.5 py-1 rounded-full max-w-[150px] truncate">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
              <span className="truncate" title={cellInfo.note}>
                Note: {cellInfo.note}
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">No note attached</span>
          )}
        </div>

        {/* Action Options List */}
        <div className="p-3 space-y-2 overflow-y-auto overscroll-contain flex-1 min-h-0">
          {/* 1. Edit Value */}
          <button
            onClick={() => {
              onClose();
              onEditValue();
            }}
            disabled={cellInfo.isReadOnly}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 text-slate-800 dark:text-slate-100 hover:text-blue-900 dark:hover:text-blue-200 transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Edit3 className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold">Edit Value</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {cellInfo.isReadOnly ? 'Auto-calculated' : 'Input number or multiple values (=100+100)'}
                </div>
              </div>
            </div>
            <CornerDownLeft className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
          </button>

          {/* 2. Delete / Clear Value */}
          <button
            onClick={() => {
              onClose();
              onDeleteValue();
            }}
            disabled={cellInfo.isReadOnly || (!hasValue && cellInfo.rawInput === '')}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-700 text-slate-800 dark:text-slate-100 hover:text-rose-900 dark:hover:text-rose-200 transition-all cursor-pointer group disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Trash2 className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold">Delete Value</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Clear field and reset to ₱0.00
                </div>
              </div>
            </div>
            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-300 bg-rose-100/60 dark:bg-rose-950/70 px-1.5 py-0.5 rounded">
              Clear
            </span>
          </button>

          {/* 3. Add or Edit Note */}
          <button
            onClick={() => {
              onClose();
              onOpenNoteEditor();
            }}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-slate-200 dark:border-slate-700 hover:border-amber-300 dark:hover:border-amber-700 text-slate-800 dark:text-slate-100 hover:text-amber-900 dark:hover:text-amber-200 transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <StickyNote className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold">
                  {hasNote ? 'Edit Excel Note' : 'Add Note'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Attach Excel-style comment / remark
                </div>
              </div>
            </div>
            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-950/70 px-1.5 py-0.5 rounded">
              {hasNote ? 'Edit' : 'Add'}
            </span>
          </button>

          {/* 4. Remove Note (if note is present) */}
          {hasNote && (
            <button
              onClick={() => {
                onClose();
                onRemoveNote();
              }}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <FileMinus className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">Remove Note</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Delete the attached note from this cell
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                Remove
              </span>
            </button>
          )}
        </div>

        {/* Footer Quick Action */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/70 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
          <span className="flex items-center gap-1">
            <Calculator className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Supports formulas like <code className="font-mono font-bold text-slate-700 dark:text-slate-200">=100+100</code>
          </span>
          <button
            onClick={onClose}
            className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
