import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, KeyRound, Fingerprint } from 'lucide-react';
import {
  decryptTextWithPassword,
  markSessionUnlocked,
  saveStoredPortableLock,
  verifyPortableLockPassword,
  type EncryptedEnvelope,
  type PortableLockMetadata,
} from '../utils/portableCrypto';
import {
  hasBiometricEnrollmentForLock,
  isWebAuthnSupported,
  unlockPortableLockWithBiometric,
} from '../utils/portableBiometrics';
import { hydrateSeedObject } from '../utils/portableSeed';

interface PortableLockScreenProps {
  lockMeta: PortableLockMetadata;
  encryptedSeed?: EncryptedEnvelope;
  onUnlocked: () => void;
}

export const PortableLockScreen: React.FC<PortableLockScreenProps> = ({
  lockMeta,
  encryptedSeed,
  onUnlocked,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isBiometricUnlocking, setIsBiometricUnlocking] = useState(false);

  const canUseBiometric = hasBiometricEnrollmentForLock(lockMeta) && isWebAuthnSupported();

  const finishUnlockWithPassword = (verifiedPassword: string) => {
    if (encryptedSeed) {
      const decryptedJson = decryptTextWithPassword(encryptedSeed, verifiedPassword);
      const parsedSeed = JSON.parse(decryptedJson);
      hydrateSeedObject(parsedSeed);
    }

    saveStoredPortableLock(lockMeta);
    markSessionUnlocked(lockMeta.lockId, verifiedPassword);
    onUnlocked();
  };

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter your password to unlock.');
      return;
    }

    setIsUnlocking(true);
    setError(null);

    try {
      const valid = verifyPortableLockPassword(lockMeta, password);
      if (!valid) {
        setError('Incorrect password. Please try again.');
        setIsUnlocking(false);
        return;
      }

      finishUnlockWithPassword(password);
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes('Incorrect password')
          ? 'Incorrect password. Please try again.'
          : 'Could not unlock workbook. Please check your password.'
      );
      setIsUnlocking(false);
    }
  };

  const handleBiometricUnlock = async () => {
    setIsBiometricUnlocking(true);
    setError(null);
    try {
      const recoveredPassword = await unlockPortableLockWithBiometric(lockMeta);
      finishUnlockWithPassword(recoveredPassword);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Fingerprint verification failed. Please enter your password.'
      );
      setIsBiometricUnlocking(false);
    }
  };

  return (
    <div className="min-h-dvh w-full bg-slate-950 flex items-center justify-center p-4 font-sans overflow-y-auto">
      <div className="w-full max-w-sm lg:max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden my-auto">
        <div className="bg-slate-900 dark:bg-slate-950 px-6 py-5 text-white flex items-center gap-3 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-base lg:text-lg font-extrabold tracking-tight">PesoBudget Locked</h1>
            <p className="text-[11px] lg:text-xs text-slate-300">
              Password-protected expense &amp; payroll workbook
            </p>
          </div>
        </div>

        <form onSubmit={handleUnlock} className="p-6 space-y-4">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs lg:text-sm text-slate-600 dark:text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <span>
              Enter your password to decrypt and open your financial sheets.
            </span>
          </div>

          {lockMeta.hint && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] lg:text-xs text-amber-900 dark:text-amber-200">
              <KeyRound className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                <strong>Hint:</strong> {lockMeta.hint}
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs lg:text-sm text-rose-800 dark:text-rose-300 font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs lg:text-sm font-bold text-slate-700 dark:text-slate-300">
              Workbook Password
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
                placeholder="Enter password..."
                className="w-full pl-3 pr-10 py-2.5 text-sm lg:text-base bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isUnlocking || isBiometricUnlocking}
            className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-bold text-sm lg:text-base rounded-xl shadow-sm transition-colors cursor-pointer disabled:opacity-60"
          >
            {isUnlocking ? 'Decrypting...' : 'Unlock'}
          </button>

          {canUseBiometric && (
            <button
              type="button"
              onClick={() => void handleBiometricUnlock()}
              disabled={isUnlocking || isBiometricUnlocking}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 font-bold text-sm lg:text-base rounded-xl transition-colors cursor-pointer disabled:opacity-60"
            >
              <Fingerprint className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>
                {isBiometricUnlocking ? 'Scanning Fingerprint...' : 'Unlock with Fingerprint'}
              </span>
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
