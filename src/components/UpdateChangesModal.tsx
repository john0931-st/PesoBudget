import React, { useState } from 'react';
import { Check, Sparkles, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

export interface ReleaseNoteEntry {
  buildId?: string;
  buildTime?: string;
  version: string;
  date: string;
  timeLabel?: string;
  title: string;
  changes: string[];
}

interface UpdateChangesModalProps {
  isOpen: boolean;
  release: ReleaseNoteEntry;
  previousReleases?: ReleaseNoteEntry[];
  requiresReload?: boolean;
  onConfirmOk: () => void;
}

export const UpdateChangesModal: React.FC<UpdateChangesModalProps> = ({
  isOpen,
  release,
  previousReleases = [],
  requiresReload = false,
  onConfirmOk,
}) => {
  const [showHistory, setShowHistory] = useState(false);

  if (!isOpen) return null;

  return (
    <div
      className="pb-modal-backdrop z-50 flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-changes-title"
    >
      <div className="pb-modal-card bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md lg:max-w-lg flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 flex items-start gap-3 shrink-0">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
              <span>App Updated</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">v{release.version}</span>
              <span aria-hidden="true">·</span>
              <span>{release.date}</span>
              {release.timeLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{release.timeLabel}</span>
                </>
              )}
            </div>
            <h2
              id="update-changes-title"
              className="text-base lg:text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight mt-0.5 leading-snug"
            >
              {release.title}
            </h2>
          </div>
        </div>

        {/* Changes Body */}
        <div className="p-5 overflow-y-auto overscroll-contain space-y-4 flex-1 min-h-0">
          {requiresReload && (
            <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-200 text-xs lg:text-sm flex items-start gap-2.5">
              <RefreshCw className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
              <span>
                A newly published version is live. Click <strong>OK</strong> to refresh the page and apply these updates.
              </span>
            </div>
          )}

          <div className="space-y-2.5">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              What changed in this release
            </div>
            <ul className="space-y-2.5">
              {release.changes.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 text-xs lg:text-sm text-slate-700 dark:text-slate-200 leading-relaxed"
                >
                  <span className="w-5 h-5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3 h-3" />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {previousReleases.length > 0 && (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowHistory((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors"
              >
                {showHistory ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
                <span>
                  {showHistory ? 'Hide earlier updates' : `View earlier updates (${previousReleases.length})`}
                </span>
              </button>

              {showHistory && (
                <div className="mt-3 space-y-3">
                  {previousReleases.map((prevRel, idx) => (
                    <div
                      key={prevRel.buildId || `${prevRel.version}-${idx}`}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <span className="font-mono">v{prevRel.version}</span>
                        <span aria-hidden="true" className="text-slate-400">·</span>
                        <span className="text-slate-500 dark:text-slate-400 font-normal">
                          {prevRel.date}{prevRel.timeLabel ? ` · ${prevRel.timeLabel}` : ''}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-slate-900 dark:text-slate-100">
                        {prevRel.title}
                      </div>
                      <ul className="space-y-1 text-[11px] lg:text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
                        {prevRel.changes.map((c, cIdx) => (
                          <li key={cIdx}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with OK Button */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onConfirmOk}
            className="px-6 py-2 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs lg:text-sm font-bold rounded-xl shadow-xs cursor-pointer transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
};
