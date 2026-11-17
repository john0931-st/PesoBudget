import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Check, Trash2 } from 'lucide-react';

interface CellNotePopoverProps {
  isOpen: boolean;
  cellTitle: string;
  initialNote: string;
  onSave: (note: string) => void;
  onClose: () => void;
}

export const CellNotePopover: React.FC<CellNotePopoverProps> = ({
  isOpen,
  cellTitle,
  initialNote,
  onSave,
  onClose,
}) => {
  const [text, setText] = useState(initialNote);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText(initialNote);
  }, [initialNote, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="pb-modal-backdrop z-50 flex items-center justify-center bg-slate-900/40 dark:bg-slate-950/65"
    >
      <div
        className="pb-modal-card w-full max-w-sm lg:max-w-md bg-amber-50 dark:bg-amber-950/95 border border-amber-300 dark:border-amber-700 rounded-lg shadow-xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3.5 py-2.5 bg-amber-100 dark:bg-amber-900/60 border-b border-amber-200 dark:border-amber-800 shrink-0">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-medium text-xs lg:text-sm">
            <MessageSquare className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-amber-700 dark:text-amber-400" />
            <span>Excel Note: {cellTitle}</span>
          </div>
          <button
            onClick={onClose}
            className="text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200 p-0.5 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 lg:p-4 overflow-y-auto overscroll-contain flex-1 min-h-0">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add memo, submeter readings, account details, or payment notes..."
            rows={4}
            className="w-full text-xs lg:text-sm text-slate-800 dark:text-amber-100 bg-amber-50/80 dark:bg-slate-950/70 border border-amber-200 dark:border-amber-800/70 placeholder:text-slate-400 dark:placeholder:text-amber-300/40 rounded p-2 lg:p-2.5 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono resize-none leading-relaxed"
          />

          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-amber-200 dark:border-amber-800/70 text-xs lg:text-sm">
            <div>
              {initialNote && (
                <button
                  type="button"
                  onClick={() => {
                    onSave('');
                    onClose();
                  }}
                  className="inline-flex items-center gap-1 text-[11px] lg:text-xs text-rose-700 dark:text-rose-400 hover:text-rose-900 dark:hover:text-rose-300 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete Note
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1 text-slate-600 dark:text-amber-200/80 hover:text-slate-800 dark:hover:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/60 rounded cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onSave(text.trim());
                  onClose();
                }}
                className="inline-flex items-center gap-1 px-3 py-1 bg-amber-700 hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500 text-white font-medium rounded cursor-pointer transition-colors"
              >
                <Check className="w-3 h-3" />
                Save Note
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
