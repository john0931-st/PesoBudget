import React, { useEffect } from 'react';
import {
  CheckCircle2,
  ShieldAlert,
  Info,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';

export type ActionMessageVariant = 'success' | 'blocked' | 'info' | 'error';

interface ActionMessageModalProps {
  isOpen: boolean;
  variant: ActionMessageVariant;
  title: string;
  message: string;
  detail?: string;
  onClose: () => void;
}

export const ActionMessageModal: React.FC<ActionMessageModalProps> = ({
  isOpen,
  variant,
  title,
  message,
  detail,
  onClose,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const stylesByVariant: Record<
    ActionMessageVariant,
    {
      headerBg: string;
      iconBg: string;
      icon: React.ReactNode;
      boxBg: string;
      buttonBg: string;
    }
  > = {
    success: {
      headerBg: 'bg-slate-900 dark:bg-slate-950',
      iconBg: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-400',
      icon: <CheckCircle2 className="w-5 h-5" />,
      boxBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200',
      buttonBg: 'bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 dark:bg-emerald-600 dark:hover:bg-emerald-500',
    },
    blocked: {
      headerBg: 'bg-slate-900 dark:bg-slate-950',
      iconBg: 'bg-rose-500/20 border-rose-400/40 text-rose-400',
      icon: <ShieldAlert className="w-5 h-5" />,
      boxBg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-950 dark:text-rose-200',
      buttonBg: 'bg-slate-900 hover:bg-slate-800 active:bg-slate-950 dark:bg-emerald-600 dark:hover:bg-emerald-500',
    },
    info: {
      headerBg: 'bg-slate-900 dark:bg-slate-950',
      iconBg: 'bg-blue-500/20 border-blue-400/40 text-blue-300',
      icon: <Info className="w-5 h-5" />,
      boxBg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-950 dark:text-blue-200',
      buttonBg: 'bg-blue-700 hover:bg-blue-800 active:bg-blue-900 dark:bg-blue-600 dark:hover:bg-blue-500',
    },
    error: {
      headerBg: 'bg-slate-900 dark:bg-slate-950',
      iconBg: 'bg-rose-500/20 border-rose-400/40 text-rose-400',
      icon: <AlertCircle className="w-5 h-5" />,
      boxBg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-950 dark:text-rose-200',
      buttonBg: 'bg-rose-700 hover:bg-rose-800 active:bg-rose-900 dark:bg-rose-600 dark:hover:bg-rose-500',
    },
  };

  const theme = stylesByVariant[variant];

  return (
    <div
      className="pb-modal-backdrop z-[70] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="pb-modal-card w-full max-w-sm lg:max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-300 dark:border-slate-700 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`${theme.headerBg} px-4 py-3 text-white flex items-center gap-2.5 border-b border-slate-800 shrink-0`}>
          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${theme.iconBg}`}>
            {theme.icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs sm:text-sm lg:text-base font-bold tracking-tight truncate">
              {title}
            </h3>
          </div>
        </div>

        <div className="p-4 lg:p-5 space-y-4 overflow-y-auto overscroll-contain flex-1 min-h-0">
          <div className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs lg:text-sm leading-relaxed ${theme.boxBg}`}>
            <MessageSquare className="w-4 h-4 shrink-0 mt-0.5 opacity-80" />
            <div className="space-y-1 min-w-0">
              <p className="font-semibold">{message}</p>
              {detail && (
                <p className="text-[11px] lg:text-xs opacity-85 font-mono break-words">
                  {detail}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className={`px-6 py-2 text-xs lg:text-sm font-bold text-white rounded-lg shadow-xs cursor-pointer transition-colors ${theme.buttonBg}`}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
