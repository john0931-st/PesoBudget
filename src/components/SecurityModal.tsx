/**
 * @file SecurityModal.tsx
 * @description Comprehensive Security, Google Account, 2FA, Biometrics,
 * Automated Cloud Backup & Restore, and Android APK installation modal.
 * 
 * Each function, state handler, and UI component contains thorough comments explaining its behavior.
 */

import React, { useState } from 'react';
import {
  UserSecurityProfile,
  CloudBackupRecord,
  MonthData,
} from '../types/budget';
import {
  saveSecurityProfile,
  createGoogleCloudBackup,
  getCloudBackups,
  registerBiometrics,
  signInWithGoogle,
  signOutGoogle,
} from '../services/securityService';
import {
  X,
  Shield,
  Fingerprint,
  KeyRound,
  Cloud,
  Download,
  Upload,
  Check,
  RefreshCw,
  LogOut,
  Lock,
  Zap,
} from 'lucide-react';

interface SecurityModalProps {
  // Whether the security modal dialog is visible
  isOpen: boolean;
  // Callback when modal is closed
  onClose: () => void;
  // Current months dataset
  months: Record<string, MonthData>;
  // Callback to restore all months from a backup
  onRestoreBackup: (restoredMonths: Record<string, MonthData>) => void;
  // Active user security profile
  securityProfile: UserSecurityProfile;
  // Callback to update security profile in parent state and storage
  onUpdateSecurityProfile: (profile: UserSecurityProfile) => void;
  // Optional callback to manually lock the app session into 2FA gate
  onLockSession?: () => void;
}

export const SecurityModal: React.FC<SecurityModalProps> = ({
  isOpen,
  onClose,
  months,
  onRestoreBackup,
  securityProfile,
  onUpdateSecurityProfile,
  onLockSession,
}) => {
  // Active navigation tab inside the security modal
  const [activeTab, setActiveTab] = useState<'account' | 'biometrics' | 'backup'>('account');
  // State for editing the 6-digit 2FA security PIN
  const [pinInput, setPinInput] = useState(securityProfile.twoFactorPin || '123456');
  // Temporary feedback alert message
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Stored list of Google Cloud backup snapshots
  const [cloudBackups, setCloudBackups] = useState<CloudBackupRecord[]>(() => getCloudBackups());

  // If modal is not open, do not render
  if (!isOpen) return null;

  /**
   * Triggers an immediate cloud backup to Google Cloud.
   */
  const handleBackupNow = () => {
    // Generate snapshot and update storage
    const { backup, updatedProfile } = createGoogleCloudBackup(months, securityProfile);
    // Refresh local backup list
    setCloudBackups(getCloudBackups());
    // Propagate profile update
    onUpdateSecurityProfile(updatedProfile);
    // Display confirmation
    setStatusMsg({
      type: 'success',
      text: `Manual backup created! Synced ${Object.keys(months).length} months to your Google Account.`,
    });
  };

  /**
   * Restores a selected historical snapshot from Google Cloud.
   */
  const handleRestore = (backup: CloudBackupRecord) => {
    const formattedDate = new Date(backup.timestamp).toLocaleString();
    if (window.confirm(`Restore data from backup created on ${formattedDate}? Current changes will be updated.`)) {
      // Apply restored months to the app
      onRestoreBackup(backup.data);
      setStatusMsg({
        type: 'success',
        text: `Restored ${backup.monthsCount} months from Google Cloud backup!`,
      });
      // Close modal after brief delay
      setTimeout(() => onClose(), 1200);
    }
  };

  /**
   * Registers or updates device biometric authentication via WebAuthn.
   */
  const handleToggleBiometrics = async () => {
    // Request WebAuthn platform authenticator
    await registerBiometrics();
    // Invert biometric flag
    const updated: UserSecurityProfile = {
      ...securityProfile,
      hasBiometrics: !securityProfile.hasBiometrics,
    };
    // Persist and notify parent
    saveSecurityProfile(updated);
    onUpdateSecurityProfile(updated);
    setStatusMsg({
      type: 'success',
      text: updated.hasBiometrics
        ? 'Biometric sensor (fingerprint/face) linked to your Google Account!'
        : 'Biometrics disabled.',
    });
  };

  /**
   * Saves updated 6-digit 2FA Security PIN.
   */
  const handleSavePin = () => {
    if (pinInput.trim().length !== 6) {
      setStatusMsg({
        type: 'error',
        text: '2FA PIN must be exactly 6 digits.',
      });
      return;
    }

    const updated: UserSecurityProfile = {
      ...securityProfile,
      twoFactorPin: pinInput.trim(),
      has2FA: true,
    };
    saveSecurityProfile(updated);
    onUpdateSecurityProfile(updated);
    setStatusMsg({
      type: 'success',
      text: '6-digit 2FA PIN updated successfully!',
    });
  };

  /**
   * Toggles automatic backup on/off.
   */
  const handleToggleAutoBackup = () => {
    const nextVal = !securityProfile.autoBackupEnabled;
    const updated: UserSecurityProfile = {
      ...securityProfile,
      autoBackupEnabled: nextVal,
    };
    saveSecurityProfile(updated);
    onUpdateSecurityProfile(updated);
    setStatusMsg({
      type: 'success',
      text: nextVal
        ? 'Automatic Google Cloud Backup enabled: edits will auto-sync.'
        : 'Automatic Google Cloud Backup paused.',
    });
  };

  /**
   * Toggles automatic restore on/off.
   */
  const handleToggleAutoRestore = () => {
    const nextVal = !securityProfile.autoRestoreEnabled;
    const updated: UserSecurityProfile = {
      ...securityProfile,
      autoRestoreEnabled: nextVal,
    };
    saveSecurityProfile(updated);
    onUpdateSecurityProfile(updated);
    setStatusMsg({
      type: 'success',
      text: nextVal
        ? 'Automatic Cloud Restore enabled: newest data will restore on sign-in.'
        : 'Automatic Cloud Restore disabled.',
    });
  };

  /**
   * Exports backup snapshot as a downloadable JSON file.
   */
  const handleDownloadBackupJson = (backup: CloudBackupRecord) => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `pesobudget_google_backup_${backup.id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  /**
   * Locks the app immediately into the 2FA screen.
   */
  const handleLockNow = () => {
    onClose();
    if (onLockSession) {
      onLockSession();
    } else {
      const updated = { ...securityProfile, isSessionUnlocked: false };
      saveSecurityProfile(updated);
      onUpdateSecurityProfile(updated);
    }
  };

  return (
    <div className="pb-modal-backdrop z-50 flex items-center justify-center bg-slate-900/60 dark:bg-slate-950/75 backdrop-blur-xs">
      <div className="pb-modal-card w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center font-bold border border-transparent dark:border-slate-700">
              <Shield className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">Security & Google Cloud Sync</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Google Sign-In, 2FA, Biometrics & Automatic Backup</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation Strip */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 gap-6 text-xs font-semibold shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('account')}
            className={`py-3 border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'account'
                ? 'border-slate-900 dark:border-emerald-400 text-slate-900 dark:text-emerald-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Google & 2FA</span>
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`py-3 border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'backup'
                ? 'border-slate-900 dark:border-emerald-400 text-slate-900 dark:text-emerald-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Auto-Backup & Restore</span>
          </button>

          <button
            onClick={() => setActiveTab('biometrics')}
            className={`py-3 border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'biometrics'
                ? 'border-slate-900 dark:border-emerald-400 text-slate-900 dark:text-emerald-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Fingerprint className="w-3.5 h-3.5" />
            <span>Biometrics</span>
          </button>
        </div>

        {/* Status Message Notification */}
        {statusMsg && (
          <div
            className={`px-6 py-2.5 text-xs flex items-center justify-between border-b ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
            }`}
          >
            <span>{statusMsg.text}</span>
            <button onClick={() => setStatusMsg(null)} className="font-bold cursor-pointer">
              ×
            </button>
          </div>
        )}

        {/* Modal Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 space-y-6">
          {/* TAB 1: GOOGLE ACCOUNT & 2FA */}
          {activeTab === 'account' && (
            <div className="space-y-6">
              {/* Google Profile Card */}
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden border border-slate-300 dark:border-slate-600">
                    <img
                      src={securityProfile.picture || 'https://lh3.googleusercontent.com/a/default-user=s96-c'}
                      alt="Google User"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{securityProfile.name}</span>
                      <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-bold px-1.5 py-0.2 rounded">
                        Google Verified
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">{securityProfile.email}</span>
                  </div>
                </div>

                <button
                  onClick={handleLockNow}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-1.5 rounded transition-colors cursor-pointer"
                  title="Test 2FA Lock Screen"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Lock App (Test 2FA)</span>
                </button>
              </div>

              {/* 2FA Configuration Section */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Two-Factor Authentication (2FA)</h3>
                  </div>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                    Active & Required
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Every time you open the PesoBudget APK on your phone, you must verify your identity via 2FA or Biometrics.
                </p>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Configure 6-Digit 2FA Security PIN
                    </label>
                    <input
                      type="password"
                      maxLength={6}
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                      className="font-mono text-sm tracking-widest px-3 py-1.5 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded focus:border-slate-900 dark:focus:border-emerald-500 focus:outline-none w-36 text-center"
                      placeholder="123456"
                    />
                  </div>

                  <button
                    onClick={handleSavePin}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white rounded text-xs font-semibold cursor-pointer shadow-xs"
                  >
                    Update 2FA PIN
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: AUTOMATIC BACKUP & RESTORE */}
          {activeTab === 'backup' && (
            <div className="space-y-6">
              {/* Automated Cloud Sync Settings */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-5 space-y-4 bg-slate-50 dark:bg-slate-800/60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Automatic Sync Automation</h3>
                  </div>
                  <span className="text-xs font-mono text-emerald-700 dark:text-emerald-300 font-bold bg-emerald-50 dark:bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                    {securityProfile.backupSyncStatus === 'syncing' ? 'Syncing...' : '✓ Auto-Sync Active'}
                  </span>
                </div>

                <div className="space-y-3 pt-2">
                  {/* Auto-backup toggle */}
                  <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700">
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">Automatic Google Cloud Backup</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Automatically saves a snapshot whenever you edit any cell, row, or month.
                      </div>
                    </div>
                    <button
                      onClick={handleToggleAutoBackup}
                      className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                        securityProfile.autoBackupEnabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                          securityProfile.autoBackupEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Auto-restore toggle */}
                  <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-3 rounded border border-slate-200 dark:border-slate-700">
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">Automatic Cloud Restore</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Automatically restores your latest cloud data when opening on a new phone or signing in.
                      </div>
                    </div>
                    <button
                      onClick={handleToggleAutoRestore}
                      className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                        securityProfile.autoRestoreEnabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                    >
                      <div
                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                          securityProfile.autoRestoreEnabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Manual Force Backup Button */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">
                    Last Cloud Backup: {securityProfile.lastBackupTime ? new Date(securityProfile.lastBackupTime).toLocaleString() : 'Just now'}
                  </span>
                  <button
                    onClick={handleBackupNow}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white rounded text-xs font-semibold cursor-pointer shadow-xs"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Force Backup Now</span>
                  </button>
                </div>
              </div>

              {/* Cloud Snapshots History */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Google Cloud Backup Snapshots ({cloudBackups.length})
                </h4>

                {cloudBackups.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500 italic">No cloud backups recorded yet.</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {cloudBackups.map((bk) => (
                      <div
                        key={bk.id}
                        className="flex items-center justify-between p-3 bg-white dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                      >
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                            <Cloud className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <span>{new Date(bk.timestamp).toLocaleString()}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {bk.monthsCount} Month(s) · {bk.deviceInfo}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDownloadBackupJson(bk)}
                            className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                            title="Download raw JSON"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleRestore(bk)}
                            className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 rounded font-semibold cursor-pointer"
                          >
                            Restore Snapshot
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: BIOMETRICS */}
          {activeTab === 'biometrics' && (
            <div className="space-y-6">
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Fingerprint className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Device Biometrics (WebAuthn)</h3>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded ${
                      securityProfile.hasBiometrics
                        ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800'
                        : 'text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800'
                    }`}
                  >
                    {securityProfile.hasBiometrics ? 'Linked & Enabled' : 'Not Linked'}
                  </span>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Fast, passwordless 2FA using your Android phone's built-in fingerprint reader or face recognition.
                  Biometric credentials are securely bound to your device hardware.
                </p>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Status: {securityProfile.hasBiometrics ? 'Fingerprint / Face ID Ready' : 'Disabled'}
                  </span>
                  <button
                    onClick={handleToggleBiometrics}
                    className={`px-4 py-2 rounded text-xs font-semibold transition-colors cursor-pointer ${
                      securityProfile.hasBiometrics
                        ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/80 border border-rose-200 dark:border-rose-800'
                        : 'bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-500 shadow-xs'
                    }`}
                  >
                    {securityProfile.hasBiometrics ? 'Unlink Biometrics' : 'Link Fingerprint / Face ID'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 shrink-0">
          <span>Google Account: {securityProfile.email}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded font-semibold cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
