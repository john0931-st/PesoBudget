import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from 'lucide-react';
import { TopToastItem } from '../types/budget';

interface TopToastContainerProps {
  toasts: TopToastItem[];
  onDismiss: (id: string) => void;
}

export const TopToastContainer: React.FC<TopToastContainerProps> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-3 sm:top-4 left-1/2 -translate-x-1/2 z-[140] w-[calc(100%-1.5rem)] max-w-md pointer-events-none flex flex-col gap-2 print:hidden"
      style={{ top: 'max(0.75rem, env(safe-area-inset-top, 0.75rem))' }}
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const tone =
          toast.type === 'success'
            ? {
                border: 'border-emerald-500/40 dark:border-emerald-400/35',
                iconBg: 'bg-emerald-500/15 text-emerald-500 dark:text-emerald-300',
                Icon: CheckCircle2,
              }
            : toast.type === 'warning'
              ? {
                  border: 'border-amber-500/40 dark:border-amber-400/35',
                  iconBg: 'bg-amber-500/15 text-amber-500 dark:text-amber-300',
                  Icon: AlertTriangle,
                }
              : toast.type === 'error'
                ? {
                    border: 'border-rose-500/45 dark:border-rose-400/40',
                    iconBg: 'bg-rose-500/15 text-rose-500 dark:text-rose-300',
                    Icon: XCircle,
                  }
                : {
                    border: 'border-sky-500/40 dark:border-sky-400/35',
                    iconBg: 'bg-sky-500/15 text-sky-500 dark:text-sky-300',
                    Icon: Info,
                  };

        const { Icon } = tone;

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 px-3.5 py-2.5 rounded-2xl bg-slate-900/95 dark:bg-slate-900/95 text-white border ${tone.border} shadow-2xl backdrop-blur-md animate-in slide-in-from-top-3 fade-in duration-200`}
          >
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${tone.iconBg}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-xs font-extrabold tracking-tight text-white leading-snug">
                {toast.title}
              </p>
              {toast.message && (
                <p className="text-[11px] font-medium text-slate-300 leading-snug mt-0.5 break-words">
                  {toast.message}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
