import React, { useEffect, useState } from 'react';
import { Lock, Eye, EyeOff, AlertCircle, KeyRound, X, ShieldCheck } from 'lucide-react';
import {
  markSessionUnlocked,
  verifyPortableLockPassword,
  type PortableLockMetadata,
} from '../utils/portableCrypto';

interface PasswordConfirmModalProps {
  isOpen: boolean;
  lockMeta: PortableLockMetadata | null;
  actionTitle: string;
  actionDescription?: string;
  onConfirm: (verifiedPassword: string) => void;
  onCancel: () => void;
}

export const PasswordConfirmModal: React.FC<PasswordConfirmModalProps> = ({
  isOpen,
  lockMeta,
  actionTitle,
  actionDescription,
  onConfirm,
  onCancel,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setShowPassword(false);
      setError(null);
    }
  }, [isOpen, actionTitle]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen || !lockMeta) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter your lock password.');
      return;
    }

    const valid = verifyPortableLockPassword(lockMeta, password);
    if (!valid) {
      setError('Incorrect password. Please enter the password used to unlock PesoBudget.');
      return;
    }

    markSessionUnlocked(lockMeta.lockId, password);
    // Execute synchronously inside form submit handler so browser user-activation
    // stays active for file pickers (<input type="file">.click) and showDirectoryPicker().
    onConfirm(password);
  };

  return (
    <div
      className="pb-modal-backdrop z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs"
      onClick={onCancel}
    >
      <div
        className="pb-modal-card w-full max-w-sm lg:max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-300 dark:border-slate-700 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 dark:bg-slate-950 px-4 py-3.5 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm lg:text-base font-bold tracking-tight truncate">
                Password Required
              </h3>
              <p className="text-[11px] lg:text-xs text-slate-300 truncate">{actionTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors cursor-pointer shrink-0"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 lg:p-5 space-y-3.5 overflow-y-auto overscroll-contain flex-1 min-h-0">
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-[11px] lg:text-xs text-slate-700 dark:text-slate-200 leading-snug">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>
              {actionDescription ||
                'Enter your Portable Lock password to continue with this data operation.'}
            </span>
          </div>

          {lockMeta.hint && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-[11px] lg:text-xs text-amber-900 dark:text-amber-200">
              <KeyRound className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="truncate">
                <strong>Hint:</strong> {lockMeta.hint}
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-[11px] lg:text-xs text-rose-800 dark:text-rose-300 font-medium">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="block text-[11px] lg:text-xs font-bold text-slate-700 dark:text-slate-300">
              Lock Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                autoFocus
                placeholder="Enter lock password..."
                className="w-full pl-3 pr-9 py-2 text-xs lg:text-sm border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs lg:text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 text-xs lg:text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-lg shadow-xs cursor-pointer transition-colors"
            >
              Verify &amp; Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
