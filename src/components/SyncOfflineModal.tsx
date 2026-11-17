/**
 * @file SyncOfflineModal.tsx
 * @description Modern popup to review and upload changes made while offline.
 * Automatically appears when returning online with pending changes, or when clicked
 * from the Online/Offline status indicator beside the gear icon.
 */

import React, { useState } from 'react';
import {
  CloudUpload,
  Wifi,
  WifiOff,
  CheckCircle2,
  Clock,
  Database,
  ArrowRight,
  X,
  FileSpreadsheet,
  Smartphone,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { OfflineChangeItem, clearOfflineChanges } from '../utils/offlineQueue';
import { MonthData, UserSecurityProfile } from '../types/budget';
import { saveSecurityProfile } from '../services/securityService';
import {
  createFirebaseBackupSnapshot,
  signInWithFirebaseGoogle,
  syncAllMonthsToFirestore,
} from '../services/firebaseSyncService';

interface SyncOfflineModalProps {
  isOpen: boolean;
  onClose: () => void;
  isOnline: boolean;
  offlineChanges: OfflineChangeItem[];
  months: Record<string, MonthData>;
  securityProfile: UserSecurityProfile;
  firebaseUid?: string | null;
  onUpdateSecurityProfile: (profile: UserSecurityProfile) => void;
  onSyncComplete?: (uploadedCount: number) => void;
  simulateOffline: boolean;
  onToggleSimulateOffline: () => void;
}

export const SyncOfflineModal: React.FC<SyncOfflineModalProps> = ({
  isOpen,
  onClose,
  isOnline,
  offlineChanges,
  months,
  securityProfile,
  firebaseUid = null,
  onUpdateSecurityProfile,
  onSyncComplete,
  simulateOffline,
  onToggleSimulateOffline,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isLoggedIn = Boolean(firebaseUid && securityProfile.isAuthenticated && securityProfile.email?.trim());
  const loggedInEmail = isLoggedIn ? securityProfile.email.trim() : '';
  const totalSheets = Object.keys(months).length;

  const handleGoogleSignIn = async () => {
    if (!isOnline) {
      setAccountError('Connect to internet first to sign in with Google.');
      return;
    }
    setIsAuthenticating(true);
    setAccountError(null);
    try {
      const user = await signInWithFirebaseGoogle();
      const updated: UserSecurityProfile = {
        ...securityProfile,
        isAuthenticated: true,
        email: user.email || '',
        name: user.displayName || (user.email ? user.email.split('@')[0] : 'Google User'),
        picture: user.photoURL || '',
        isSessionUnlocked: true,
        isEmailVerified: user.emailVerified,
        backupSyncStatus: 'synced',
      };
      saveSecurityProfile(updated);
      onUpdateSecurityProfile(updated);
    } catch (err) {
      setAccountError(
        err instanceof Error ? err.message : 'Google sign-in was cancelled or blocked.'
      );
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleUploadNow = async () => {
    if (!isOnline) return;
    if (!isLoggedIn || !firebaseUid) {
      setAccountError('Please sign in with Google before uploading to Firebase.');
      return;
    }

    setIsUploading(true);
    setUploadSuccess(false);
    setAccountError(null);

    try {
      const count = offlineChanges.length;
      setSyncedCount(count);

      // Push all updated sheets & create a point-in-time snapshot in Firebase Firestore
      await syncAllMonthsToFirestore(firebaseUid, months);
      const { updatedProfile } = await createFirebaseBackupSnapshot(firebaseUid, months, {
        ...securityProfile,
        email: loggedInEmail,
      });

      saveSecurityProfile(updatedProfile);
      onUpdateSecurityProfile(updatedProfile);

      // Clear the offline queue
      clearOfflineChanges();

      setUploadSuccess(true);
      if (onSyncComplete) {
        onSyncComplete(count);
      }

      // Automatically close after confirmation
      setTimeout(() => {
        setIsUploading(false);
        setUploadSuccess(false);
        onClose();
      }, 1600);
    } catch (err) {
      console.error('Failed to upload offline changes:', err);
      setAccountError(
        err instanceof Error ? err.message : 'Failed to upload changes to Firebase.'
      );
      setIsUploading(false);
    }
  };

  return (
    <div className="pb-modal-backdrop z-50 flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="pb-modal-card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-w-lg lg:max-w-xl w-full flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 bg-gradient-to-r from-slate-50 via-white to-emerald-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/30 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-xs shrink-0 ${
                isOnline
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-500 text-white'
              }`}
            >
              {isOnline ? (
                <CloudUpload className="w-6 h-6 animate-pulse" />
              ) : (
                <WifiOff className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg lg:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
                  {offlineChanges.length > 0
                    ? 'Upload Offline Changes'
                    : 'Network & Cloud Sync'}
                </h3>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] lg:text-xs font-bold ${
                    isOnline
                      ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300'
                      : 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isOnline ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <p className="text-xs lg:text-sm text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                {isOnline
                  ? offlineChanges.length > 0
                    ? `${offlineChanges.length} modification${
                        offlineChanges.length > 1 ? 's' : ''
                      } recorded while offline. Ready to sync with your logged-in account.`
                    : 'All workbook changes are synchronized with your device and logged-in account.'
                  : 'You are working offline. All edits and auto-computations are safely saved on your device.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto overscroll-contain space-y-3.5 flex-1 min-h-0">
          {/* Target Cloud Account Banner */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-700 rounded-xl p-3 space-y-2 text-xs lg:text-sm">
            {isLoggedIn ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Smartphone className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[10px] lg:text-xs uppercase font-bold text-slate-400 dark:text-slate-500 block tracking-wider">
                      Firebase Target Account (Signed In)
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 truncate block">
                      {loggedInEmail}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isAuthenticating}
                    onClick={handleGoogleSignIn}
                    className="text-[10px] lg:text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white underline cursor-pointer disabled:opacity-50"
                  >
                    {isAuthenticating ? 'Switching...' : 'Switch'}
                  </button>
                  <span className="text-[10px] lg:text-xs font-bold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800 px-2 py-0.5 rounded-full">
                    {totalSheets} Sheets
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <span className="text-[10px] lg:text-xs uppercase font-bold text-amber-700 dark:text-amber-400 tracking-wider block">
                    Sign In Target Google Account to Upload
                  </span>
                  <span className="text-[11px] lg:text-xs text-slate-600 dark:text-slate-300">
                    Connect with Google to upload offline changes to Firebase Cloud.
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isAuthenticating || !isOnline}
                  onClick={handleGoogleSignIn}
                  className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:bg-slate-400 dark:disabled:bg-slate-700 text-white text-xs lg:text-sm font-bold rounded-lg cursor-pointer shrink-0"
                >
                  {isAuthenticating ? 'Signing in...' : 'Sign in with Google'}
                </button>
              </div>
            )}
            {accountError && (
              <p className="text-[11px] lg:text-xs text-rose-600 dark:text-rose-400 font-semibold">{accountError}</p>
            )}
          </div>

          {/* Success Banner when upload completes */}
          {uploadSuccess && (
            <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700 rounded-xl p-4 text-center space-y-1 animate-in zoom-in-95 duration-200">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
              <div className="font-extrabold text-sm lg:text-base text-emerald-950 dark:text-emerald-200">
                All Changes Successfully Uploaded!
              </div>
              <p className="text-xs lg:text-sm text-emerald-800 dark:text-emerald-300">
                Uploaded {syncedCount} offline change{syncedCount > 1 ? 's' : ''} to Cloud Backup for {loggedInEmail}.
              </p>
            </div>
          )}

          {/* Offline Changes List */}
          {!uploadSuccess && (
            <div>
              <div className="flex items-center justify-between text-xs lg:text-sm mb-2">
                <span className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide text-[11px] lg:text-xs">
                  Pending Offline Queue ({offlineChanges.length})
                </span>
                {offlineChanges.length > 0 && (
                  <span className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400 font-mono">
                    Will upload in order
                  </span>
                )}
              </div>

              {offlineChanges.length === 0 ? (
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-5 text-center space-y-1.5">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400 mx-auto" />
                  <div className="text-xs lg:text-sm font-bold text-slate-800 dark:text-slate-100">
                    No Pending Offline Changes
                  </div>
                  <p className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 max-w-xs lg:max-w-sm mx-auto">
                    Your local workbook is 100% up to date. Any edits you make while offline will automatically queue here for upload.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {offlineChanges.map((change, idx) => (
                    <div
                      key={change.id}
                      className="bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 rounded-xl p-2.5 space-y-1 shadow-2xs transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs lg:text-sm">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-[9px] lg:text-[11px] font-bold bg-slate-900 dark:bg-slate-700 text-white px-1.5 py-0.2 rounded uppercase">
                            #{offlineChanges.length - idx}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-slate-100 truncate text-[11px] lg:text-xs">
                            {change.sheetName}
                          </span>
                          {change.rowLabel && (
                            <span className="text-slate-500 dark:text-slate-400 text-[11px] lg:text-xs truncate">
                              · {change.rowLabel}
                            </span>
                          )}
                        </div>
                        <span className="text-[9.5px] lg:text-xs font-mono text-slate-400 dark:text-slate-500 shrink-0">
                          {new Date(change.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] lg:text-xs font-mono pt-1 border-t border-slate-100 dark:border-slate-700">
                        <span className="text-slate-600 dark:text-slate-300 truncate max-w-[200px]">
                          {change.description}
                        </span>
                        {change.newValue !== undefined && (
                          <div className="flex items-center gap-1 font-bold shrink-0">
                            <span className="text-slate-400 dark:text-slate-500 line-through">
                              {change.oldValue || '0'}
                            </span>
                            <ArrowRight className="w-2.5 h-2.5 text-slate-400 dark:text-slate-500" />
                            <span className="text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 px-1 py-0.2 rounded">
                              {change.newValue}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Offline Testing Simulation Helper */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 rounded-xl p-2.5 lg:p-3 flex items-center justify-between gap-3 text-xs lg:text-sm">
            <div className="flex items-center gap-2">
              {simulateOffline ? (
                <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              ) : (
                <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              )}
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-100 text-[11px] lg:text-xs block">
                  Simulate Offline Mode (Testing)
                </span>
                <span className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400">
                  {simulateOffline
                    ? 'Currently simulating offline: edits are queued locally.'
                    : 'Toggle to test offline edits and auto-sync popup.'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleSimulateOffline}
              className={`px-2.5 py-1 text-xs lg:text-sm font-bold rounded-lg border transition-all cursor-pointer shrink-0 ${
                simulateOffline
                  ? 'bg-amber-100 dark:bg-amber-950/70 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-300'
                  : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {simulateOffline ? 'Go Online' : 'Go Offline'}
            </button>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-3 sm:p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0">
          <div className="text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 font-mono text-center sm:text-left">
            {isOnline ? (
              <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1 justify-center sm:justify-start">
                <ShieldCheck className="w-3.5 h-3.5" />
                Network connected & ready
              </span>
            ) : (
              <span className="text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-1 justify-center sm:justify-start">
                <AlertCircle className="w-3.5 h-3.5" />
                Connect to internet to upload
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-3.5 py-2 text-xs lg:text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer w-full sm:w-auto"
            >
              {uploadSuccess ? 'Close' : 'Dismiss'}
            </button>

            {offlineChanges.length > 0 && isOnline && (
              <button
                type="button"
                onClick={handleUploadNow}
                disabled={isUploading || uploadSuccess}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-bold text-xs lg:text-sm rounded-xl shadow-xs transition-colors cursor-pointer w-full sm:w-auto"
              >
                {isUploading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <CloudUpload className="w-4 h-4" />
                    <span>Upload & Sync Now ({offlineChanges.length})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
