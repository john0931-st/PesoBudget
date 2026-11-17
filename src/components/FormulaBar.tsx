import React from 'react';
import { FunctionSquare, MessageSquare, AlertCircle } from 'lucide-react';
import { evaluateFormulaInput } from '../utils/formula';
import { formatPHP } from '../utils/currency';

import { CellColumn } from '../types/budget';

interface FormulaBarProps {
  activeCell: {
    rowId: string;
    rowLabel: string;
    column: CellColumn;
    currentInput: string;
    note?: string;
    isMerged?: boolean;
  } | null;
  onInputChange: (newInput: string) => void;
  onOpenNote: () => void;
}

export const FormulaBar: React.FC<FormulaBarProps> = ({
  activeCell,
  onInputChange,
  onOpenNote,
}) => {
  if (!activeCell) {
    return (
      <div className="flex items-center gap-3 px-6 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500 select-none">
        <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
          <span className="w-16 truncate">No Cell</span>
        </div>
        <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500 font-mono text-xs">
          <span className="italic font-serif font-bold text-slate-400 dark:text-slate-500 text-sm">fx</span>
        </div>
        <div className="text-slate-400 dark:text-slate-500 italic">
          Click any cell to edit values, insert notes, or write formulas (e.g. <span className="font-mono text-slate-600 dark:text-slate-300">=100+100</span>)
        </div>
      </div>
    );
  }

  const evalResult = evaluateFormulaInput(activeCell.currentInput);

  let columnLabel = activeCell.isMerged ? 'Merged' : 'Kinsenas';
  if (!activeCell.isMerged) {
    if (activeCell.column === 'monthly') columnLabel = 'Monthly';
    else if (activeCell.column === 'payments') columnLabel = 'Item';
    else if (activeCell.column === 'remarks') columnLabel = 'Remarks';
  }

  return (
    <div className="flex items-center gap-3 px-6 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
      {/* Active Cell Reference Indicator */}
      <div className="flex items-center gap-1 font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded shrink-0">
        <span className="text-slate-500 dark:text-slate-400">{columnLabel}:</span>
        <span>{activeCell.rowLabel}</span>
      </div>

      {/* fx Formula Icon */}
      <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-mono text-xs shrink-0 select-none">
        <span className="italic font-serif font-bold text-slate-700 dark:text-slate-300 text-base">fx</span>
      </div>

      {/* Live Formula / Value Input Field */}
      <div className="flex-1 relative">
        <input
          type="text"
          value={activeCell.currentInput}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="Enter amount or formula (e.g. =100+100 or =1200+852+400)"
          className="w-full bg-slate-50 dark:bg-slate-950 hover:bg-white dark:hover:bg-slate-950 focus:bg-white dark:focus:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded px-3 py-1 font-mono text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-900 dark:focus:ring-emerald-500 transition-colors"
        />

        {/* Live Evaluated Badge if formula */}
        {evalResult.isFormula && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] font-mono text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
            <span>= {formatPHP(evalResult.value)}</span>
          </div>
        )}
      </div>

      {/* Formula syntax error warning if any */}
      {!evalResult.isValid && activeCell.currentInput.startsWith('=') && (
        <div className="flex items-center gap-1 text-rose-600 dark:text-rose-400 text-[11px] shrink-0 font-medium">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>{evalResult.errorMessage || 'Invalid formula'}</span>
        </div>
      )}

      {/* Note button */}
      <button
        onClick={onOpenNote}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors shrink-0 cursor-pointer ${
          activeCell.note
            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60 font-semibold border border-amber-300 dark:border-amber-700'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
        }`}
        title={activeCell.note ? 'View/edit cell note' : 'Insert Excel note in this cell'}
      >
        <MessageSquare className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
        <span>{activeCell.note ? 'Note' : '+ Note'}</span>
      </button>
    </div>
  );
};
