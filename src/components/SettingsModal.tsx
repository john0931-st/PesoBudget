/**
 * @file SettingsModal.tsx
 * @description Settings dialog with separate Backup and Restore actions
 * tied to the currently logged-in account.
 * 
 * Replaces login/verification gates with direct, on-demand Cloud Backup & Restore.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { MonthData, CloudBackupRecord, UserSecurityProfile, TopToastItem } from '../types/budget';
import {
  getCloudBackups,
  saveSecurityProfile,
} from '../services/securityService';
import {
  beginGoogleSignInPopup,
  completeGoogleSignInWithOtp,
  createFirebaseBackupSnapshot,
  fetchFirebaseBackups,
  isDeveloperAdminEmail,
  requestGmailVerificationOtp,
  setOtpChallengeActive,
  signOutFirebase,
  syncAllMonthsToFirestore,
  verifyGmailOtpCode,
} from '../services/firebaseSyncService';
import type { PublicLinkStatus } from '../hooks/usePublicLinkMonitor';
import { exportAndroidStudioProjectZip } from '../utils/androidStudioExporter';
import { exportPortableAppFolderZip } from '../utils/portableBundleExporter';
import {
  connectAndInspectLocalDataFolder,
  disconnectLocalDataFolder,
  downloadAllInOneDatabaseJson,
  getConnectedFolderLabel,
  isFolderAutoSyncArmed,
  isLocalFolderPickerSupported,
  parseSelectedDatabaseFiles,
  readDatabaseFromConnectedFolder,
  setFolderAutoSyncArmed,
  writeSnapshotToConnectedFolder,
  type LoadedFolderDatabase,
} from '../utils/localFolderDb';
import {
  clearSessionUnlocked,
  createPortableLockMetadata,
  getActivePortablePassword,
  getStoredPortableLock,
  markSessionUnlocked,
  saveStoredPortableLock,
  setActivePortablePassword,
  type PortableLockMetadata,
} from '../utils/portableCrypto';
import { downloadUserManualPdf, getCurrentManualVersion } from '../utils/manualPdfService';
import { PasswordConfirmModal } from './PasswordConfirmModal';
import { ActionMessageModal, type ActionMessageVariant } from './ActionMessageModal';
import {
  X,
  Settings,
  CloudUpload,
  CloudDownload,
  RotateCcw,
  CheckCircle2,
  Smartphone,
  ShieldCheck,
  ShieldAlert,
  LogIn,
  LogOut,
  RefreshCw,
  Database,
  UserCircle2,
  FileArchive,
  Download,
  Folder,
  FolderSync,
  Upload,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  KeyRound,
  BookOpen,
  MailCheck,
  Compass,
  Activity,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  months: Record<string, MonthData>;
  years?: number[];
  activeMonthId?: string;
  onRestoreBackup: (restoredMonths: Record<string, MonthData>) => void;
  securityProfile: UserSecurityProfile;
  firebaseUid?: string | null;
  isOnline?: boolean;
  onUpdateSecurityProfile: (profile: UserSecurityProfile) => void;
  connectedFolderName?: string | null;
  onConnectedFolderChange?: (folderName: string | null) => void;
  onRestoreFolderData?: (loaded: LoadedFolderDatabase) => void;
  onOpenAdmin?: () => void;
  onReplayTour?: () => void;
  linkStatus?: PublicLinkStatus;
  onCheckPublicLink?: (forceToast?: boolean) => Promise<void>;
  onEmitToast?: (toast: Omit<TopToastItem, 'id'>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  months,
  years = [2024, 2025, 2026, 2027],
  activeMonthId,
  onRestoreBackup,
  securityProfile,
  firebaseUid = null,
  isOnline = true,
  onUpdateSecurityProfile,
  connectedFolderName = null,
  onConnectedFolderChange,
  onRestoreFolderData,
  onOpenAdmin,
  onReplayTour,
  linkStatus,
  onCheckPublicLink,
  onEmitToast,
}) => {
  const [backups, setBackups] = useState<CloudBackupRecord[]>(() => getCloudBackups());
  const [feedback, setFeedback] = useState<{ type: 'success' | 'info'; text: string } | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [pendingOtpUser, setPendingOtpUser] = useState<User | null>(null);
  const [otpMaskedEmail, setOtpMaskedEmail] = useState('');
  const [otpInputCode, setOtpInputCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isResendingOtp, setIsResendingOtp] = useState(false);
  const [isLoadingCloudBackups, setIsLoadingCloudBackups] = useState(false);
  const [isExportingAndroid, setIsExportingAndroid] = useState(false);
  const [isExportingPortable, setIsExportingPortable] = useState(false);
  const [isFolderBusy, setIsFolderBusy] = useState(false);
  const [localFolderLabel, setLocalFolderLabel] = useState<string | null>(
    () => connectedFolderName || getConnectedFolderLabel()
  );
  const [storedLockMeta, setStoredLockMeta] = useState<PortableLockMetadata | null>(
    () => getStoredPortableLock()
  );
  const [lockPasswordInput, setLockPasswordInput] = useState('');
  const [lockPasswordConfirm, setLockPasswordConfirm] = useState('');
  const [lockHintInput, setLockHintInput] = useState(
    () => getStoredPortableLock()?.hint || ''
  );
  const [showLockPassword, setShowLockPassword] = useState(false);
  const [showPasswordEditor, setShowPasswordEditor] = useState(false);
  const [pendingDecryptContext, setPendingDecryptContext] = useState<
    | {
        kind: 'json_files';
        files: Array<{ name: string; text: string }>;
        encryptedFileNames: string[];
      }
    | { kind: 'connected_folder' }
    | null
  >(null);
  const [decryptPasswordInput, setDecryptPasswordInput] = useState('');
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [showDecryptPassword, setShowDecryptPassword] = useState(false);
  const [passwordConfirmRequest, setPasswordConfirmRequest] = useState<{
    title: string;
    description: string;
    run: (verifiedPassword: string) => void;
  } | null>(null);
  const [actionPopup, setActionPopup] = useState<{
    variant: ActionMessageVariant;
    title: string;
    message: string;
    detail?: string;
  } | null>(null);
  const sheetsFileInputRef = useRef<HTMLInputElement>(null);

  // Load real Firestore backup snapshots when modal opens while signed in and online
  useEffect(() => {
    if (!isOpen || !firebaseUid || !isOnline || !securityProfile.isAuthenticated) return;
    let active = true;
    setIsLoadingCloudBackups(true);
    fetchFirebaseBackups(firebaseUid)
      .then((cloudList) => {
        if (active && cloudList.length > 0) {
          setBackups(cloudList);
        }
      })
      .catch((err) => {
        console.warn('Could not refresh Firebase backup list:', err);
      })
      .finally(() => {
        if (active) setIsLoadingCloudBackups(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, firebaseUid, isOnline, securityProfile.isAuthenticated]);

  if (!isOpen) return null;

  // Logged-in account on Firebase Auth (only true after Gmail OTP verification succeeds)
  const isLoggedIn = Boolean(
    firebaseUid &&
      securityProfile.isAuthenticated &&
      securityProfile.email?.trim() &&
      !pendingOtpUser
  );
  const loggedInEmail = isLoggedIn ? securityProfile.email.trim() : '';
  const isDeveloperAdmin = isLoggedIn && isDeveloperAdminEmail(loggedInEmail);
  const totalMonthsCount = Object.keys(months).length;

  const getActiveLockMeta = (): PortableLockMetadata | null => {
    const embeddedLock =
      typeof window !== 'undefined' ? window.__PESOBUDGET_PORTABLE_LOCK__ : undefined;
    return embeddedLock || storedLockMeta || getStoredPortableLock();
  };

  const requireLockPassword = (
    title: string,
    description: string,
    action: (verifiedPassword: string) => void
  ) => {
    const activeLock = getActiveLockMeta();
    if (!activeLock) {
      setShowPasswordEditor(true);
      setActionPopup({
        variant: 'blocked',
        title: 'Not Permitted',
        message: `${title} is not permitted without a Portable Password Lock.`,
        detail: 'Please set and save a password in Portable Password Lock first.',
      });
      return;
    }
    setPasswordConfirmRequest({ title, description, run: action });
  };

  const handleGoogleSignIn = async () => {
    if (!isOnline) {
      setFeedback({
        type: 'info',
        text: 'Please go Online first to sign in with Google and verify your Gmail code.',
      });
      return;
    }
    setIsAuthenticating(true);
    setOtpError(null);
    try {
      const user = await beginGoogleSignInPopup();
      const targetEmail = user.email?.trim();
      if (!targetEmail) {
        await signOutFirebase();
        throw new Error('Selected Google account has no email address.');
      }
      const otpDispatch = await requestGmailVerificationOtp(
        targetEmail,
        user.displayName || undefined
      );
      setPendingOtpUser(user);
      setOtpMaskedEmail(otpDispatch.maskedEmail);
      setOtpInputCode('');
      setFeedback({
        type: 'info',
        text: `Verification code sent to ${otpDispatch.maskedEmail}. Enter the 6-digit code below to complete sign-in.`,
      });
      onEmitToast?.({
        type: 'info',
        title: 'Verification Code Sent',
        message: `Check ${otpDispatch.maskedEmail} for your 6-digit sign-in code.`,
      });
    } catch (err) {
      console.error(err);
      setOtpChallengeActive(false);
      setPendingOtpUser(null);
      const msg = err instanceof Error ? err.message : 'Google sign-in was cancelled or blocked.';
      setFeedback({ type: 'info', text: msg });
      onEmitToast?.({
        type: 'error',
        title: 'Sign-In Verification Issue',
        message: msg,
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleVerifyOtpAndCompleteSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingOtpUser?.email) return;
    const cleanedCode = otpInputCode.trim().replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleanedCode)) {
      setOtpError('Please enter the exact 6-digit numeric code sent to your Gmail.');
      return;
    }

    setIsVerifyingOtp(true);
    setOtpError(null);
    try {
      const { verifiedAt } = await verifyGmailOtpCode(pendingOtpUser.email, cleanedCode);
      const accessProfile = await completeGoogleSignInWithOtp(pendingOtpUser, verifiedAt);

      const updatedProfile: UserSecurityProfile = {
        ...securityProfile,
        isAuthenticated: true,
        email: pendingOtpUser.email || '',
        name:
          pendingOtpUser.displayName ||
          (pendingOtpUser.email ? pendingOtpUser.email.split('@')[0] : 'Google User'),
        picture: pendingOtpUser.photoURL || '',
        isSessionUnlocked: true,
        isEmailVerified: true,
        backupSyncStatus: accessProfile.status === 'blocked' ? 'idle' : 'synced',
        role: accessProfile.role,
        accessStatus: accessProfile.status,
        otpVerifiedAt: verifiedAt,
        firebaseUid: pendingOtpUser.uid,
      };
      saveSecurityProfile(updatedProfile);
      onUpdateSecurityProfile(updatedProfile);

      const signedUid = pendingOtpUser.uid;
      const signedEmail = pendingOtpUser.email || '';
      setPendingOtpUser(null);
      setOtpInputCode('');

      if (accessProfile.status !== 'blocked') {
        const cloudList = await fetchFirebaseBackups(signedUid);
        setBackups(cloudList);
      }

      const successMsg =
        accessProfile.status === 'blocked'
          ? `Signed in as ${signedEmail}, but this account is currently blocked from cloud sync.`
          : `Gmail verified! Signed in as ${signedEmail}.`;
      setFeedback({
        type: accessProfile.status === 'blocked' ? 'info' : 'success',
        text: successMsg,
      });
      onEmitToast?.({
        type: accessProfile.status === 'blocked' ? 'warning' : 'success',
        title: 'Gmail Verified',
        message: successMsg,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid verification code.';
      setOtpError(msg);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingOtpUser?.email) return;
    setIsResendingOtp(true);
    setOtpError(null);
    try {
      const otpDispatch = await requestGmailVerificationOtp(
        pendingOtpUser.email,
        pendingOtpUser.displayName || undefined
      );
      setOtpMaskedEmail(otpDispatch.maskedEmail);
      onEmitToast?.({
        type: 'info',
        title: 'New Code Sent',
        message: `A fresh 6-digit code was sent to ${otpDispatch.maskedEmail}.`,
      });
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Failed to resend verification code.');
    } finally {
      setIsResendingOtp(false);
    }
  };

  const handleCancelOtpVerification = async () => {
    setPendingOtpUser(null);
    setOtpInputCode('');
    setOtpError(null);
    try {
      await signOutFirebase();
    } catch {
      // ignore sign-out error on cancel
    }
    setFeedback({
      type: 'info',
      text: 'Google Sign-In cancelled before completing Gmail code verification.',
    });
  };

  const handleSignOut = async () => {
    setIsAuthenticating(true);
    try {
      await signOutFirebase();
      setPendingOtpUser(null);
      const updated: UserSecurityProfile = {
        ...securityProfile,
        isAuthenticated: false,
        email: '',
        name: '',
        picture: '',
        isEmailVerified: false,
        backupSyncStatus: 'idle',
        role: undefined,
        accessStatus: undefined,
        otpVerifiedAt: undefined,
        firebaseUid: undefined,
      };
      saveSecurityProfile(updated);
      onUpdateSecurityProfile(updated);
      setFeedback({
        type: 'info',
        text: 'Signed out of Google / Firebase. Sign in anytime with Gmail code verification.',
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsAuthenticating(false);
    }
  };

  /**
   * Separate Action: Backup Data
   * Creates an immediate Firestore snapshot + syncs sheets for the signed-in Google user
   */
  const handleBackup = async () => {
    if (!isOnline) {
      setFeedback({
        type: 'info',
        text: 'You are currently Offline. Switch to Online to upload a backup to Firebase.',
      });
      return;
    }
    if (!isLoggedIn || !firebaseUid) {
      setFeedback({
        type: 'info',
        text: 'Please sign in with your Google Account first before backing up.',
      });
      return;
    }

    setIsBackingUp(true);
    try {
      await syncAllMonthsToFirestore(firebaseUid, months);
      const { updatedProfile } = await createFirebaseBackupSnapshot(firebaseUid, months, {
        ...securityProfile,
        email: loggedInEmail,
      });

      const updatedBackups = await fetchFirebaseBackups(firebaseUid);
      setBackups(updatedBackups);
      saveSecurityProfile(updatedProfile);
      onUpdateSecurityProfile(updatedProfile);

      setFeedback({
        type: 'success',
        text: `Firebase Backup successful! Saved ${totalMonthsCount} sheet${totalMonthsCount > 1 ? 's' : ''} to ${loggedInEmail} at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}.`,
      });
    } catch (err) {
      console.error(err);
      setFeedback({
        type: 'info',
        text: err instanceof Error ? err.message : 'Backup could not be completed. Please try again.',
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  /**
   * Separate Action: Restore Data
   * Fetches latest snapshot from Firebase Firestore and restores all sheets
   */
  const executeRestoreLatest = async () => {
    setIsRestoring(true);
    try {
      let currentBackups = backups;
      if (isOnline && firebaseUid) {
        currentBackups = await fetchFirebaseBackups(firebaseUid);
        setBackups(currentBackups);
      }

      if (currentBackups.length === 0) {
        setFeedback({
          type: 'info',
          text: 'No Firebase cloud backups found for this account yet. Tap "Backup to Google" first.',
        });
        return;
      }

      const latest = currentBackups[0];
      if (!latest.data || Object.keys(latest.data).length === 0) {
        setFeedback({
          type: 'info',
          text: 'Backup data is empty. Please create a new backup first.',
        });
        return;
      }

      onRestoreBackup(latest.data);
      if (isOnline && firebaseUid) {
        await syncAllMonthsToFirestore(firebaseUid, latest.data);
      }
      const msg = `Workbook restored from Firebase (${new Date(latest.timestamp).toLocaleString()})! Loaded ${latest.monthsCount || Object.keys(latest.data).length} sheet(s).`;
      setFeedback({ type: 'success', text: msg });
      setActionPopup({
        variant: 'success',
        title: 'Restore Successful',
        message: msg,
      });
    } catch (err) {
      console.error(err);
      setFeedback({
        type: 'info',
        text: err instanceof Error ? err.message : 'Failed to restore backup.',
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRestoreLatest = () => {
    requireLockPassword(
      'Restore from Google',
      'Enter your lock password to restore sheets from your latest Firebase cloud backup.',
      () => {
        void executeRestoreLatest();
      }
    );
  };

  /**
   * Restores a specific snapshot from history
   */
  const executeRestoreSpecific = async (backup: CloudBackupRecord) => {
    if (!backup.data) return;
    setIsRestoring(true);
    try {
      onRestoreBackup(backup.data);
      if (isOnline && firebaseUid) {
        await syncAllMonthsToFirestore(firebaseUid, backup.data);
      }
      const msg = `Restored Firebase backup from ${new Date(backup.timestamp).toLocaleString()} (${backup.monthsCount} sheets).`;
      setFeedback({ type: 'success', text: msg });
      setActionPopup({
        variant: 'success',
        title: 'Restore Successful',
        message: msg,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRestoreSpecific = (backup: CloudBackupRecord) => {
    if (!backup.data) return;
    requireLockPassword(
      'Restore Cloud Snapshot',
      'Enter your lock password to restore this Firebase backup snapshot.',
      () => {
        void executeRestoreSpecific(backup);
      }
    );
  };

  /**
   * Exports a ready-to-open Android Studio Gradle project ZIP bundling all offline app files
   */
  const executeExportAndroidStudio = async () => {
    setIsExportingAndroid(true);
    try {
      const { fileCount, filename } = await exportAndroidStudioProjectZip();
      const msg = `Downloaded ${filename} (${fileCount} offline assets bundled). Extract the ZIP and open the folder in Android Studio to build your APK.`;
      setFeedback({ type: 'success', text: msg });
      setActionPopup({
        variant: 'success',
        title: 'Android Studio Export Successful',
        message: msg,
      });
    } catch (err) {
      console.error(err);
      setFeedback({
        type: 'info',
        text: err instanceof Error ? err.message : 'Failed to export Android Studio project ZIP.',
      });
    } finally {
      setIsExportingAndroid(false);
    }
  };

  const handleExportAndroidStudio = () => {
    requireLockPassword(
      'Export Project for Android Studio',
      'Enter your lock password to download the offline Android Studio APK project ZIP.',
      () => {
        void executeExportAndroidStudio();
      }
    );
  };

  const handleSavePortablePassword = async () => {
    if (lockPasswordInput.length < 4) {
      setFeedback({
        type: 'info',
        text: 'Please enter a password with at least 4 characters.',
      });
      return;
    }
    if (lockPasswordInput !== lockPasswordConfirm) {
      setFeedback({
        type: 'info',
        text: 'Passwords do not match. Please confirm the exact same password.',
      });
      return;
    }

    const meta = createPortableLockMetadata(lockPasswordInput, lockHintInput);
    saveStoredPortableLock(meta);
    markSessionUnlocked(meta.lockId, lockPasswordInput);
    setStoredLockMeta(meta);
    window.dispatchEvent(new Event('pesobudget:lock_changed'));

    const savedPassword = lockPasswordInput;
    setLockPasswordInput('');
    setLockPasswordConfirm('');
    setShowPasswordEditor(false);

    if (localFolderLabel && isFolderAutoSyncArmed()) {
      try {
        await writeSnapshotToConnectedFolder({
          months,
          years,
          securityProfile,
          activeMonthId,
          password: savedPassword,
        });
      } catch (err) {
        console.warn('Could not re-encrypt connected folder:', err);
      }
    }

    setFeedback({
      type: 'success',
      text: 'Password lock saved! Click "Download PesoBudget/ ZIP" to export your password-protected index.html and encrypted data/*.json files.',
    });
  };

  const executeRemovePortablePassword = async () => {
    saveStoredPortableLock(null);
    setStoredLockMeta(null);
    setLockPasswordInput('');
    setLockPasswordConfirm('');
    setLockHintInput('');
    setShowPasswordEditor(false);
    window.dispatchEvent(new Event('pesobudget:lock_changed'));

    if (localFolderLabel && isFolderAutoSyncArmed()) {
      try {
        await writeSnapshotToConnectedFolder({
          months,
          years,
          securityProfile,
          activeMonthId,
          password: null,
        });
      } catch (err) {
        console.warn('Could not update connected folder after removing lock:', err);
      }
    }

    const hasEmbeddedLock =
      typeof window !== 'undefined' && Boolean(window.__PESOBUDGET_PORTABLE_LOCK__);
    const msg = hasEmbeddedLock
      ? 'Browser lock removed. To remove the password baked into this HTML file permanently, click "Download PesoBudget/ ZIP" now.'
      : 'Portable password lock removed.';
    setFeedback({
      type: 'info',
      text: msg,
    });
    setActionPopup({
      variant: 'info',
      title: 'Password Lock Removed',
      message: msg,
    });
  };

  const handleRemovePortablePassword = () => {
    requireLockPassword(
      'Remove Portable Password Lock',
      'Enter your current lock password before removing password protection.',
      () => {
        void executeRemovePortablePassword();
      }
    );
  };

  const handleLockNow = () => {
    clearSessionUnlocked();
    onClose();
    window.dispatchEvent(new Event('pesobudget:lock_now'));
  };

  /**
   * Exports a cross-platform PesoBudget/ HTML folder ZIP (Android, iPhone, Windows, macOS, Desktop)
   * with organized app/ and data/ subfolders (encrypted if a portable password is set)
   */
  const executeExportPortableFolder = async (verifiedPassword?: string) => {
    let exportPassword: string | undefined = verifiedPassword || undefined;
    let exportHint: string | undefined = lockHintInput || storedLockMeta?.hint;

    if (lockPasswordInput.length > 0) {
      if (lockPasswordInput.length < 4) {
        setFeedback({
          type: 'info',
          text: 'Password must be at least 4 characters before exporting a locked ZIP.',
        });
        return;
      }
      if (lockPasswordInput !== lockPasswordConfirm) {
        setFeedback({
          type: 'info',
          text: 'Passwords do not match. Please check Confirm Password before exporting.',
        });
        return;
      }
      const meta = createPortableLockMetadata(lockPasswordInput, lockHintInput);
      saveStoredPortableLock(meta);
      markSessionUnlocked(meta.lockId, lockPasswordInput);
      setStoredLockMeta(meta);
      window.dispatchEvent(new Event('pesobudget:lock_changed'));
      exportPassword = lockPasswordInput;
      exportHint = lockHintInput;
      setLockPasswordInput('');
      setLockPasswordConfirm('');
      setShowPasswordEditor(false);
    } else if (!exportPassword) {
      const sessionPw = getActivePortablePassword();
      const activeLock = getActiveLockMeta();
      if (activeLock && !sessionPw) {
        setShowPasswordEditor(true);
        setFeedback({
          type: 'info',
          text: 'Enter your password in the Portable Password Lock box first so the exported ZIP stays encrypted.',
        });
        return;
      }
      if (sessionPw) {
        exportPassword = sessionPw;
      }
    }

    setIsExportingPortable(true);
    try {
      const { fileCount, filename, isEncrypted } = await exportPortableAppFolderZip({
        months,
        years,
        securityProfile,
        activeMonthId,
        lockPassword: exportPassword,
        lockHint: exportHint,
      });
      const msg = isEncrypted
        ? `Downloaded password-protected ${filename} (${fileCount} files). Both index.html and data/*.json are encrypted — opening index.html will prompt for your password.`
        : `Downloaded ${filename} (${fileCount} files). Unzip "PesoBudget" and open index.html on Android, iPhone, MacBook, Windows, or Desktop — works 100% offline with your database in PesoBudget/data/.`;
      setFeedback({ type: 'success', text: msg });
      setActionPopup({
        variant: 'success',
        title: 'Portable Export Successful',
        message: msg,
      });
    } catch (err) {
      console.error(err);
      setFeedback({
        type: 'info',
        text: err instanceof Error ? err.message : 'Failed to export Portable HTML App folder.',
      });
    } finally {
      setIsExportingPortable(false);
    }
  };

  const handleExportPortableFolder = () => {
    requireLockPassword(
      'Download Portable PesoBudget/ ZIP',
      'Enter your lock password to export the portable index.html and encrypted database ZIP.',
      (verifiedPassword) => {
        if (lockPasswordInput.length > 0) {
          if (lockPasswordInput.length < 4) {
            setFeedback({
              type: 'info',
              text: 'Password must be at least 4 characters before exporting a locked ZIP.',
            });
            return;
          }
          if (lockPasswordInput !== lockPasswordConfirm) {
            setFeedback({
              type: 'info',
              text: 'Passwords do not match. Please check Confirm Password before exporting.',
            });
            return;
          }
        }
        void executeExportPortableFolder(verifiedPassword);
      }
    );
  };

  const executeConnectLocalFolder = async () => {
    setIsFolderBusy(true);
    try {
      const outcome = await connectAndInspectLocalDataFolder({
        months,
        years,
        securityProfile,
        activeMonthId,
      });
      setLocalFolderLabel(outcome.label);
      onConnectedFolderChange?.(outcome.label);

      if (outcome.status === 'encrypted_locked') {
        setPendingDecryptContext({ kind: 'connected_folder' });
        setDecryptPasswordInput('');
        setDecryptError(null);
        setFeedback({
          type: 'info',
          text: `Connected to encrypted "${outcome.label}". Enter the folder password below to unlock and load its sheets.`,
        });
      } else if (outcome.status === 'loaded_newer' && outcome.loaded) {
        if (onRestoreFolderData) {
          onRestoreFolderData(outcome.loaded);
        } else if (outcome.loaded.months) {
          onRestoreBackup(outcome.loaded.months);
        }
        const msg = `Connected to "${outcome.label}" and loaded newer saved data (${outcome.existingSheetsCount || 0} sheets${outcome.existingUpdatedAt ? `, updated ${outcome.existingUpdatedAt}` : ''}). Future edits will auto-save to this folder.`;
        setFeedback({ type: 'success', text: msg });
        setActionPopup({
          variant: 'success',
          title: 'Folder Connected & Loaded',
          message: msg,
        });
      } else if (outcome.status === 'conflict') {
        const msg = `Connected to "${outcome.label}", which already contains ${outcome.existingSheetsCount || 0} sheet(s). Click "Load" to open the USB/folder data, or click "Save" to overwrite it with this device's data.`;
        setFeedback({ type: 'info', text: msg });
        setActionPopup({
          variant: 'info',
          title: 'Folder Connected',
          message: msg,
        });
      } else if (outcome.status === 'identical') {
        const msg = `Connected to "${outcome.label}". Data is already in sync and future edits will auto-save to disk.`;
        setFeedback({ type: 'success', text: msg });
        setActionPopup({
          variant: 'success',
          title: 'Folder Connected',
          message: msg,
        });
      } else {
        const msg = `Connected to "${outcome.label}". Organized database files (sheets.json, years.json, changelog.json) were saved to disk.`;
        setFeedback({ type: 'success', text: msg });
        setActionPopup({
          variant: 'success',
          title: 'Folder Connected',
          message: msg,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not connect local data folder.';
      if (!msg.toLowerCase().includes('abort')) {
        setFeedback({ type: 'info', text: msg });
      }
    } finally {
      setIsFolderBusy(false);
    }
  };

  const handleConnectLocalFolder = () => {
    requireLockPassword(
      'Connect data/ Folder',
      'Enter your lock password to link a local PesoBudget/data folder for syncing.',
      () => {
        void executeConnectLocalFolder();
      }
    );
  };

  const executeSaveToConnectedFolder = async (verifiedPassword?: string) => {
    setIsFolderBusy(true);
    try {
      const saved = await writeSnapshotToConnectedFolder({
        months,
        years,
        securityProfile,
        activeMonthId,
        password: verifiedPassword || getActivePortablePassword(),
      });
      if (saved) {
        const msg = `Saved all sheets, years, and logs to "${localFolderLabel}". Auto-save is active.`;
        setFeedback({ type: 'success', text: msg });
        setActionPopup({
          variant: 'success',
          title: 'Folder Save Successful',
          message: msg,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'info',
        text: err instanceof Error ? err.message : 'Failed to write to connected folder.',
      });
    } finally {
      setIsFolderBusy(false);
    }
  };

  const handleSaveToConnectedFolder = () => {
    requireLockPassword(
      'Save to Connected Folder',
      `Enter your lock password to overwrite "${localFolderLabel}" with your current data.`,
      (verifiedPassword) => {
        void executeSaveToConnectedFolder(verifiedPassword);
      }
    );
  };

  const executeLoadFromConnectedFolder = async (verifiedPassword?: string) => {
    setIsFolderBusy(true);
    try {
      const loaded = await readDatabaseFromConnectedFolder(
        verifiedPassword || getActivePortablePassword()
      );
      if (!loaded.months || Object.keys(loaded.months).length === 0) {
        setFeedback({
          type: 'info',
          text: `No sheets.json found inside "${localFolderLabel}" yet.`,
        });
        return;
      }
      if (onRestoreFolderData) {
        onRestoreFolderData(loaded);
      } else {
        onRestoreBackup(loaded.months);
      }
      setFolderAutoSyncArmed(true);
      const msg = `Loaded ${Object.keys(loaded.months).length} sheet(s) from "${localFolderLabel}". Auto-save is active.`;
      setFeedback({ type: 'success', text: msg });
      setActionPopup({
        variant: 'success',
        title: 'Folder Load Successful',
        message: msg,
      });
    } catch (err) {
      if (err instanceof Error && err.message === 'ENCRYPTED_FOLDER_NEEDS_PASSWORD') {
        setPendingDecryptContext({ kind: 'connected_folder' });
        setDecryptPasswordInput('');
        setDecryptError(null);
        setFeedback({
          type: 'info',
          text: `This folder is password-protected. Enter the folder password below to load "${localFolderLabel}".`,
        });
      } else {
        setFeedback({
          type: 'info',
          text: err instanceof Error ? err.message : 'Failed to load from local data folder.',
        });
      }
    } finally {
      setIsFolderBusy(false);
    }
  };

  const handleLoadFromConnectedFolder = () => {
    requireLockPassword(
      'Load from Connected Folder',
      `Enter your lock password to load database files from "${localFolderLabel}".`,
      (verifiedPassword) => {
        void executeLoadFromConnectedFolder(verifiedPassword);
      }
    );
  };

  const handleDisconnectLocalFolder = () => {
    disconnectLocalDataFolder();
    setLocalFolderLabel(null);
    setPendingDecryptContext((prev) => (prev?.kind === 'connected_folder' ? null : prev));
    onConnectedFolderChange?.(null);
    setFeedback({
      type: 'info',
      text: 'Disconnected local data/ folder. Changes continue saving in device storage.',
    });
  };

  const applyLoadedDatabase = (
    database: LoadedFolderDatabase,
    summaryLabel: string
  ) => {
    if (onRestoreFolderData) {
      onRestoreFolderData(database);
    } else if (database.months) {
      onRestoreBackup(database.months);
    }
    setFeedback({
      type: 'success',
      text: summaryLabel,
    });
    setActionPopup({
      variant: 'success',
      title: 'Load Successful',
      message: summaryLabel,
    });
  };

  const executeDownloadAllInOneJson = (verifiedPassword?: string) => {
    const activePw = verifiedPassword || getActivePortablePassword();
    const activeLock = getActiveLockMeta();
    if (activeLock && !activePw) {
      setShowPasswordEditor(true);
      setFeedback({
        type: 'info',
        text: 'Enter your password in Portable Password Lock or unlock first so PesoBudget-Database.json stays encrypted.',
      });
      return;
    }

    try {
      const { filename, isEncrypted } = downloadAllInOneDatabaseJson({
        months,
        years,
        securityProfile,
        activeMonthId,
        password: activePw,
      });
      const msg = isEncrypted
        ? `Downloaded encrypted ${filename} containing everything (sheets, years, changelog, settings, offline queue).`
        : `Downloaded ${filename} containing everything (sheets, years, changelog, settings, offline queue) in one file.`;
      setFeedback({ type: 'success', text: msg });
      setActionPopup({
        variant: 'success',
        title: 'Export Successful',
        message: msg,
      });
    } catch (err) {
      setFeedback({
        type: 'info',
        text: err instanceof Error ? err.message : 'Failed to export PesoBudget-Database.json.',
      });
    }
  };

  const handleDownloadAllInOneJson = () => {
    requireLockPassword(
      'Export All-in-One .json',
      'Enter your lock password to export PesoBudget-Database.json.',
      (verifiedPassword) => {
        executeDownloadAllInOneJson(verifiedPassword);
      }
    );
  };

  const handleTriggerLoadJsonPicker = () => {
    requireLockPassword(
      'Load .json Database',
      'Enter your lock password before selecting .json database files to import.',
      () => {
        sheetsFileInputRef.current?.click();
      }
    );
  };

  const handleSubmitDecrypt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingDecryptContext) return;
    if (!decryptPasswordInput) {
      setDecryptError('Please enter the password.');
      return;
    }

    setDecryptError(null);

    if (pendingDecryptContext.kind === 'json_files') {
      const parsed = parseSelectedDatabaseFiles(
        pendingDecryptContext.files,
        months,
        decryptPasswordInput
      );
      if (parsed.status === 'needs_password') {
        setDecryptError(
          `Incorrect password for ${parsed.encryptedFileNames.join(', ')}.`
        );
        return;
      }
      if (parsed.status === 'error') {
        setDecryptError(parsed.message);
        return;
      }

      setActivePortablePassword(decryptPasswordInput);
      setPendingDecryptContext(null);
      setDecryptPasswordInput('');
      applyLoadedDatabase(
        parsed.database,
        `Decrypted and loaded ${parsed.loadedParts.join(', ')}${parsed.importedMonthsCount > 0 ? ` (${parsed.importedMonthsCount} sheet(s))` : ''}.`
      );
      return;
    }

    setIsFolderBusy(true);
    try {
      const loaded = await readDatabaseFromConnectedFolder(decryptPasswordInput);
      if (!loaded.months || Object.keys(loaded.months).length === 0) {
        setDecryptError(`No sheets found inside "${localFolderLabel}".`);
        return;
      }
      if (onRestoreFolderData) {
        onRestoreFolderData(loaded);
      } else {
        onRestoreBackup(loaded.months);
      }
      setActivePortablePassword(decryptPasswordInput);
      setFolderAutoSyncArmed(true);
      setPendingDecryptContext(null);
      setDecryptPasswordInput('');
      const msg = `Unlocked and loaded ${Object.keys(loaded.months).length} sheet(s) from "${localFolderLabel}". Future edits will auto-save encrypted.`;
      setFeedback({ type: 'success', text: msg });
      setActionPopup({
        variant: 'success',
        title: 'Folder Unlocked & Loaded',
        message: msg,
      });
    } catch {
      setDecryptError('Incorrect password for this encrypted data/ folder.');
    } finally {
      setIsFolderBusy(false);
    }
  };

  const handleImportSheetsJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []);
    e.target.value = '';
    if (fileList.length === 0) return;

    try {
      const payloads = await Promise.all(
        fileList.map(async (f) => ({
          name: f.name,
          text: await f.text(),
        }))
      );

      const parsed = parseSelectedDatabaseFiles(payloads, months);
      if (parsed.status === 'needs_password') {
        setPendingDecryptContext({
          kind: 'json_files',
          files: payloads,
          encryptedFileNames: parsed.encryptedFileNames,
        });
        setDecryptPasswordInput('');
        setDecryptError(null);
        setFeedback({
          type: 'info',
          text: `Encrypted file(s) detected (${parsed.encryptedFileNames.join(', ')}). Enter the password below to unlock and load.`,
        });
        return;
      }

      if (parsed.status === 'error') {
        setFeedback({
          type: 'info',
          text: parsed.message,
        });
        return;
      }

      const fileSummary =
        fileList.length === 1
          ? fileList[0].name
          : `${fileList.length} files (${parsed.loadedParts.join(', ')})`;
      applyLoadedDatabase(
        parsed.database,
        `Loaded ${fileSummary}${parsed.importedMonthsCount > 0 ? ` — ${parsed.importedMonthsCount} sheet(s)` : ''}${parsed.database.years ? `, ${parsed.database.years.length} year(s)` : ''}.`
      );
    } catch (err) {
      setFeedback({
        type: 'info',
        text: err instanceof Error ? err.message : 'Failed to read selected JSON file(s).',
      });
    }
  };

  const handleDownloadUserManualPdf = () => {
    try {
      const { filename, pageCount, version } = downloadUserManualPdf();
      const msg = `Downloaded ${filename} (${pageCount} pages, ${version}). Open it in any PDF reader and press Ctrl+F / Cmd+F to search any feature or guideline.`;
      setFeedback({ type: 'success', text: msg });
      setActionPopup({
        variant: 'success',
        title: 'User Manual Downloaded',
        message: msg,
      });
    } catch (err) {
      setFeedback({
        type: 'info',
        text: err instanceof Error ? err.message : 'Failed to generate User Manual PDF.',
      });
    }
  };

  return (
    <div className="pb-modal-backdrop z-50 flex items-center justify-center bg-black/60 dark:bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="pb-modal-card bg-white dark:bg-slate-900 rounded-lg shadow-2xl border border-slate-300 dark:border-slate-700 w-full max-w-xl lg:max-w-2xl xl:max-w-3xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-900 dark:bg-slate-950 text-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-white">
              <Settings className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base lg:text-lg font-bold tracking-tight">Settings</h2>
              <p className="text-[11px] lg:text-xs text-slate-300 dark:text-slate-400">
                Cloud Backup & Restore · Logged-in Account
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors cursor-pointer"
            title="Close Settings"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto overscroll-contain space-y-5 flex-1 min-h-0 text-slate-900 dark:text-slate-100">
          {/* Notification banner */}
          {feedback && (
            <div
              className={`p-3 rounded-md text-xs lg:text-sm font-medium flex items-center gap-2.5 border ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800'
                  : 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 border-blue-300 dark:border-blue-800'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="flex-1">{feedback.text}</div>
              <button
                onClick={() => setFeedback(null)}
                className="text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200 text-xs lg:text-sm font-bold cursor-pointer"
              >
                ×
              </button>
            </div>
          )}

          {/* 1. Logged-In Firebase Google Account Card (with 2-Step Gmail OTP Verification) */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg p-3.5 space-y-3">
            {pendingOtpUser ? (
              <form onSubmit={handleVerifyOtpAndCompleteSignIn} className="space-y-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-700 flex items-center justify-center text-emerald-700 dark:text-emerald-300 shrink-0">
                    <MailCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs lg:text-sm font-bold text-slate-900 dark:text-slate-100">
                      Enter 6-Digit Gmail Verification Code
                    </div>
                    <p className="text-[11px] lg:text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                      Sent to <strong className="font-mono">{otpMaskedEmail || pendingOtpUser.email}</strong>. Verification is required before enabling Google Cloud Sync.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    autoFocus
                    value={otpInputCode}
                    onChange={(e) => {
                      setOtpInputCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                      if (otpError) setOtpError(null);
                    }}
                    placeholder="000000"
                    className="sm:w-44 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 rounded-md px-3 py-2 text-sm font-mono font-bold tracking-[0.35em] text-center text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="submit"
                      disabled={isVerifyingOtp || otpInputCode.trim().length !== 6}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs lg:text-sm font-bold rounded-md cursor-pointer transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{isVerifyingOtp ? 'Verifying...' : 'Verify Code'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isResendingOtp || isVerifyingOtp}
                      onClick={handleResendOtp}
                      className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 rounded-md cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isResendingOtp ? 'animate-spin' : ''}`} />
                      <span>{isResendingOtp ? 'Sending...' : 'Resend'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isVerifyingOtp}
                      onClick={handleCancelOtpVerification}
                      className="px-2.5 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>

                {otpError && (
                  <p className="text-[11px] lg:text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {otpError}
                  </p>
                )}
              </form>
            ) : isLoggedIn ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 flex items-center justify-center shadow-2xs shrink-0 overflow-hidden">
                    {securityProfile.picture ? (
                      <img
                        src={securityProfile.picture}
                        alt={loggedInEmail}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="font-bold text-base text-blue-600 dark:text-blue-400">
                        {(securityProfile.name?.[0] || loggedInEmail[0] || 'G').toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs lg:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {loggedInEmail}
                      </span>
                      {securityProfile.accessStatus === 'blocked' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] lg:text-xs font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700 shrink-0">
                          <ShieldAlert className="w-3 h-3" />
                          Blocked
                        </span>
                      ) : securityProfile.accessStatus === 'pending' ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] lg:text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shrink-0">
                          <ShieldAlert className="w-3 h-3" />
                          Pending Permission
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] lg:text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shrink-0">
                          <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          Verified &amp; Synced
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] lg:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      <Smartphone className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                      <span>
                        {securityProfile.accessStatus === 'blocked'
                          ? 'Cloud sync disabled by administrator'
                          : 'Gmail OTP verified · cross-device sync active'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {isDeveloperAdmin && onOpenAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenAdmin();
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] lg:text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 rounded cursor-pointer shadow-xs transition-colors"
                      title="Open Developer Admin Console"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Admin</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isAuthenticating}
                    onClick={handleGoogleSignIn}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] lg:text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Switch</span>
                  </button>
                  <button
                    type="button"
                    disabled={isAuthenticating}
                    onClick={handleSignOut}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] lg:text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 rounded cursor-pointer disabled:opacity-50"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <UserCircle2 className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs lg:text-sm font-bold text-slate-900 dark:text-slate-100">
                      Sign in with Google (Gmail Code Verification)
                    </div>
                    <p className="text-[11px] lg:text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-snug">
                      Sends a 6-digit verification code to your Gmail before connecting Firebase Cloud Sync.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isAuthenticating}
                  onClick={handleGoogleSignIn}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs lg:text-sm font-bold rounded-md cursor-pointer transition-colors shrink-0 disabled:opacity-50"
                >
                  <LogIn className="w-3.5 h-3.5 text-emerald-400 dark:text-white" />
                  <span>{isAuthenticating ? 'Sending Code...' : 'Sign in with Google'}</span>
                </button>
              </div>
            )}
          </div>

          {/* 2. Separate Backup & Restore Buttons */}
          <div className="space-y-3">
            <h3 className="text-xs lg:text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Cloud Operations
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Separate Button: Backup */}
              <div className="border-2 border-emerald-600/40 dark:border-emerald-700/60 bg-emerald-50/50 dark:bg-emerald-950/30 rounded-lg p-4 flex flex-col justify-between space-y-3 shadow-2xs hover:border-emerald-600 dark:hover:border-emerald-500 transition-colors">
                <div>
                  <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200 font-bold text-sm lg:text-base">
                    <CloudUpload className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                    <span>Backup Data</span>
                  </div>
                  <p className="text-[11px] lg:text-xs text-slate-600 dark:text-slate-300 mt-1 leading-snug">
                    Save all current sheets, formulas, carried balances, and notes to your Google Account.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleBackup}
                  disabled={isBackingUp}
                  className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold text-xs lg:text-sm rounded transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <CloudUpload className="w-4 h-4" />
                  <span>{isBackingUp ? 'Backing up...' : 'Backup to Google'}</span>
                </button>
              </div>

              {/* Separate Button: Restore */}
              <div className="border-2 border-blue-600/40 dark:border-blue-700/60 bg-blue-50/50 dark:bg-blue-950/30 rounded-lg p-4 flex flex-col justify-between space-y-3 shadow-2xs hover:border-blue-600 dark:hover:border-blue-500 transition-colors">
                <div>
                  <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200 font-bold text-sm lg:text-base">
                    <CloudDownload className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                    <span>Restore Data</span>
                  </div>
                  <p className="text-[11px] lg:text-xs text-slate-600 dark:text-slate-300 mt-1 leading-snug">
                    Restore sheets from the latest cloud backup saved on your Google Account.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleRestoreLatest}
                  disabled={isRestoring || backups.length === 0}
                  className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white font-bold text-xs lg:text-sm rounded transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{isRestoring ? 'Restoring...' : 'Restore from Google'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 2B. Portable Cross-Platform HTML Folder (Android, iPhone, MacBook, Windows, Desktop) */}
          <div className="border-2 border-emerald-600/30 dark:border-emerald-700/50 bg-emerald-50/40 dark:bg-emerald-950/25 rounded-lg p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xs sm:text-sm lg:text-base">
                  <Folder className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                  <span>Portable HTML App Folder (PesoBudget/)</span>
                </div>
                <p className="text-[11px] lg:text-xs text-slate-600 dark:text-slate-300 leading-snug">
                  Self-contained <code className="font-mono bg-white dark:bg-slate-900 px-1 rounded border border-slate-200 dark:border-slate-700">index.html</code> + organized <code className="font-mono bg-white dark:bg-slate-900 px-1 rounded border border-slate-200 dark:border-slate-700">app/</code> &amp; <code className="font-mono bg-white dark:bg-slate-900 px-1 rounded border border-slate-200 dark:border-slate-700">data/</code> database folder (<code className="font-mono">sheets.json</code>, <code className="font-mono">years.json</code>, <code className="font-mono">changelog.json</code>). Opens offline on Android, iPhone, MacBook, Laptop &amp; Desktop.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportPortableFolder}
                disabled={isExportingPortable}
                className="inline-flex items-center justify-center gap-1.5 py-2 px-3.5 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-bold text-xs lg:text-sm rounded transition-colors shadow-xs cursor-pointer disabled:opacity-60 shrink-0 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isExportingPortable ? 'Packaging Folder...' : 'Download PesoBudget/ ZIP'}
                </span>
              </button>
            </div>

            {/* Portable Password Lock (encrypts index.html & data/*.json) */}
            {(() => {
              const embeddedLock =
                typeof window !== 'undefined' ? window.__PESOBUDGET_PORTABLE_LOCK__ : undefined;
              const activeLock = embeddedLock || storedLockMeta;
              const isLockEnabled = Boolean(activeLock);

              return (
                <div className="pt-2.5 border-t border-emerald-200/70 dark:border-emerald-800/60 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <Lock
                        className={`w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0 mt-0.5 ${
                          isLockEnabled ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="text-[11px] lg:text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                          <span>Portable Password Lock</span>
                          {isLockEnabled ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 text-[10px] lg:text-xs font-semibold">
                              Enabled
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] lg:text-xs font-semibold">
                              Off
                            </span>
                          )}
                        </div>
                        <p className="text-[10.5px] lg:text-xs text-slate-600 dark:text-slate-300 leading-snug">
                          {isLockEnabled
                            ? 'Opening index.html requires your password. Downloaded ZIPs encrypt index.html and data/*.json.'
                            : 'Set a password before downloading PesoBudget/ ZIP so index.html and data/*.json require a password when opened.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowPasswordEditor((prev) => !prev)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 font-semibold text-[11px] lg:text-xs rounded cursor-pointer"
                      >
                        <KeyRound className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                        <span>
                          {showPasswordEditor
                            ? 'Cancel'
                            : isLockEnabled
                              ? 'Change Password'
                              : 'Set Password'}
                        </span>
                      </button>

                      {isLockEnabled && (
                        <>
                          <button
                            type="button"
                            onClick={handleLockNow}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold text-[11px] lg:text-xs rounded cursor-pointer"
                            title="Lock screen immediately"
                          >
                            <Lock className="w-3 h-3 text-emerald-400" />
                            <span>Lock Now</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleRemovePortablePassword}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold text-[11px] lg:text-xs rounded cursor-pointer"
                          >
                            <Unlock className="w-3 h-3" />
                            <span>Remove</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {showPasswordEditor && (
                    <div className="bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 rounded-md p-3 space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10.5px] lg:text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Password (min 4 characters)
                          </label>
                          <div className="relative">
                            <input
                              type={showLockPassword ? 'text' : 'password'}
                              value={lockPasswordInput}
                              onChange={(e) => setLockPasswordInput(e.target.value)}
                              placeholder="Enter password..."
                              className="w-full pl-2.5 pr-8 py-1.5 text-xs lg:text-sm border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                            />
                            <button
                              type="button"
                              onClick={() => setShowLockPassword((prev) => !prev)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 cursor-pointer"
                              title={showLockPassword ? 'Hide password' : 'Show password'}
                            >
                              {showLockPassword ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10.5px] lg:text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Confirm Password
                          </label>
                          <input
                            type={showLockPassword ? 'text' : 'password'}
                            value={lockPasswordConfirm}
                            onChange={(e) => setLockPasswordConfirm(e.target.value)}
                            placeholder="Re-enter password..."
                            className="w-full px-2.5 py-1.5 text-xs lg:text-sm border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                        <div className="flex-1">
                          <label className="block text-[10.5px] lg:text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Password Hint (optional)
                          </label>
                          <input
                            type="text"
                            value={lockHintInput}
                            onChange={(e) => setLockHintInput(e.target.value)}
                            placeholder="e.g., My birthday + PIN"
                            maxLength={80}
                            className="w-full px-2.5 py-1.5 text-xs lg:text-sm border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleSavePortablePassword}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs lg:text-sm rounded cursor-pointer shrink-0"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Save Password Lock</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Direct Local data/ Folder Sync & Multi-File / All-in-One JSON Loader */}
            <div className="pt-2.5 border-t border-emerald-200/70 dark:border-emerald-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="text-[11px] lg:text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1.5 min-w-0">
                <FolderSync className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                {localFolderLabel ? (
                  <span className="truncate">
                    Connected to <strong className="font-mono text-emerald-900 dark:text-emerald-300">{localFolderLabel}</strong> (auto-saving JSONs)
                  </span>
                ) : isLocalFolderPickerSupported() ? (
                  <span>
                    Link <strong className="font-mono">PesoBudget/data</strong>, save 1 all-in-one <strong className="font-mono">.json</strong>, or multi-select <strong className="font-mono">.json</strong> files.
                  </span>
                ) : (
                  <span>
                    Save 1 all-in-one <strong className="font-mono">.json</strong> or select multiple <strong className="font-mono">.json</strong> files (<strong className="font-mono">sheets.json</strong> + <strong className="font-mono">years.json</strong>) to load together.
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                <input
                  ref={sheetsFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  multiple
                  onChange={handleImportSheetsJsonFile}
                  className="hidden"
                />

                {!localFolderLabel ? (
                  <>
                    <button
                      type="button"
                      onClick={handleConnectLocalFolder}
                      disabled={isFolderBusy}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 font-semibold text-[11px] lg:text-xs rounded cursor-pointer disabled:opacity-50"
                      title="Link your extracted PesoBudget/data folder (works in standalone Chrome, Edge, or Brave on laptop/desktop)"
                    >
                      <FolderSync className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                      <span>{isFolderBusy ? 'Connecting...' : 'Connect data/ Folder'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadAllInOneJson}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 font-semibold text-[11px] lg:text-xs rounded cursor-pointer"
                      title="Download one PesoBudget-Database.json file containing sheets, years, changelog, settings, and offline queue"
                    >
                      <Download className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                      <span>Export All-in-One .json</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleTriggerLoadJsonPicker}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 font-semibold text-[11px] lg:text-xs rounded cursor-pointer"
                      title="Select 1 all-in-one .json OR select multiple .json files (sheets.json + years.json + changelog.json) at the same time"
                    >
                      <Upload className="w-3 h-3 text-blue-700 dark:text-blue-400" />
                      <span>Load .json</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveToConnectedFolder}
                      disabled={isFolderBusy}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 font-semibold text-[11px] lg:text-xs rounded cursor-pointer disabled:opacity-50"
                    >
                      <Download className="w-3 h-3 text-emerald-700 dark:text-emerald-400" />
                      <span>Save</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleLoadFromConnectedFolder}
                      disabled={isFolderBusy}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 font-semibold text-[11px] lg:text-xs rounded cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="w-3 h-3 text-blue-700 dark:text-blue-400" />
                      <span>Load</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDisconnectLocalFolder}
                      className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-semibold text-[11px] lg:text-xs rounded cursor-pointer"
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            </div>

            {pendingDecryptContext && (
              <form
                onSubmit={handleSubmitDecrypt}
                className="bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-md p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] lg:text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                    <span>
                      {pendingDecryptContext.kind === 'json_files'
                        ? `Decrypt ${pendingDecryptContext.encryptedFileNames.join(', ')}`
                        : `Unlock encrypted folder "${localFolderLabel}"`}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingDecryptContext(null);
                      setDecryptPasswordInput('');
                      setDecryptError(null);
                    }}
                    className="text-[11px] lg:text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                {decryptError && (
                  <p className="text-[11px] lg:text-xs text-rose-700 dark:text-rose-300 font-medium">{decryptError}</p>
                )}

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showDecryptPassword ? 'text' : 'password'}
                      value={decryptPasswordInput}
                      onChange={(e) => {
                        setDecryptPasswordInput(e.target.value);
                        if (decryptError) setDecryptError(null);
                      }}
                      placeholder="Enter password to decrypt..."
                      autoFocus
                      className="w-full pl-2.5 pr-8 py-1.5 text-xs lg:text-sm border border-slate-300 dark:border-slate-700 rounded focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-600 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowDecryptPassword((prev) => !prev)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 cursor-pointer"
                    >
                      {showDecryptPassword ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={isFolderBusy}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs lg:text-sm rounded cursor-pointer disabled:opacity-60 shrink-0"
                  >
                    Unlock &amp; Load
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* 2C. Export Project for Android Studio (APK Builder) */}
          <div className="border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xs sm:text-sm lg:text-base">
                <FileArchive className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                <span>Android Studio APK Project (.zip)</span>
              </div>
              <p className="text-[11px] lg:text-xs text-slate-600 dark:text-slate-300 leading-snug">
                Download a complete Gradle project with compiled offline assets. Unzip and open in Android Studio → <strong>Build APK(s)</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExportAndroidStudio}
              disabled={isExportingAndroid}
              className="inline-flex items-center justify-center gap-1.5 py-2 px-3.5 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-bold text-xs lg:text-sm rounded transition-colors shadow-xs cursor-pointer disabled:opacity-60 shrink-0 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400 dark:text-white shrink-0" />
              <span>
                {isExportingAndroid ? 'Preparing ZIP...' : 'Export Project for Android Studio'}
              </span>
            </button>
          </div>

          {/* 2D. Searchable User Manual & New User Guidelines (PDF) */}
          <div className="border border-sky-200 dark:border-sky-800/70 bg-sky-50/50 dark:bg-sky-950/25 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xs sm:text-sm lg:text-base">
                <BookOpen className="w-4 h-4 text-sky-700 dark:text-sky-400 shrink-0" />
                <span>User Manual &amp; Quick-Start Guide (PDF)</span>
                <span className="px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/60 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-700 text-[10px] font-mono font-semibold">
                  {getCurrentManualVersion()}
                </span>
              </div>
              <p className="text-[11px] lg:text-xs text-slate-600 dark:text-slate-300 leading-snug">
                Searchable PDF guide with an introduction, workspace overview, direct one-sentence function explanations, new-user guidelines, and latest app updates.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadUserManualPdf}
              className="inline-flex items-center justify-center gap-1.5 py-2 px-3.5 bg-sky-700 hover:bg-sky-800 active:bg-sky-900 dark:bg-sky-600 dark:hover:bg-sky-500 text-white font-bold text-xs lg:text-sm rounded transition-colors shadow-xs cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Download Manual (PDF)</span>
            </button>
          </div>

          {/* 2E. Guided Onboarding Tour & Background Public Link Health */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {onReplayTour && (
              <div className="border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-slate-900 dark:text-slate-100 font-bold text-xs lg:text-sm">
                    <Compass className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Interactive Welcome Tour</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    Walk through key shortcuts, offline sync, and dynamic category renaming.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onReplayTour();
                  }}
                  className="px-3 py-1.5 text-xs font-bold bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 rounded-md cursor-pointer shrink-0 transition-colors"
                >
                  Replay Tour
                </button>
              </div>
            )}

            {onCheckPublicLink && (
              <div className="border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-slate-900 dark:text-slate-100 font-bold text-xs lg:text-sm">
                    <Activity className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>Public Link Monitor</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug truncate">
                    {linkStatus?.state === 'healthy'
                      ? `Online (${linkStatus.latencyMs ?? 0} ms)`
                      : linkStatus?.state === 'checking'
                      ? 'Checking public link...'
                      : linkStatus?.detail || 'Monitored automatically in background'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void onCheckPublicLink(true);
                  }}
                  disabled={linkStatus?.state === 'checking'}
                  className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-md cursor-pointer shrink-0 transition-colors"
                >
                  {linkStatus?.state === 'checking' ? 'Pinging...' : 'Ping Link'}
                </button>
              </div>
            )}
          </div>

          {/* 3. Backup History & Snapshots */}
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between">
              <h3 className="text-xs lg:text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Firebase Backup Snapshots ({backups.length})
              </h3>
              <span className="text-[10px] lg:text-xs text-slate-400 dark:text-slate-500">
                {isLoadingCloudBackups
                  ? 'Syncing snapshots...'
                  : `Latest: ${backups.length > 0 ? new Date(backups[0].timestamp).toLocaleDateString() : 'None'}`}
              </span>
            </div>

            {backups.length === 0 ? (
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded text-center text-xs lg:text-sm text-slate-500 dark:text-slate-400">
                No backup snapshots saved yet. Tap <strong>Backup to Google</strong> above to create your first backup.
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-700 rounded divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                {backups.map((b, idx) => (
                  <div
                    key={b.id || idx}
                    className="p-2.5 flex items-center justify-between gap-3 text-xs lg:text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-300">
                        <Database className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                          <span>{new Date(b.timestamp).toLocaleDateString()} {new Date(b.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {idx === 0 && (
                            <span className="text-[9px] lg:text-xs px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold">
                              Latest
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] lg:text-xs text-slate-500 dark:text-slate-400">
                          {b.monthsCount || Object.keys(b.data || {}).length} months tracked · {b.deviceInfo || 'Android / Mobile'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRestoreSpecific(b)}
                      disabled={isRestoring}
                      className="px-2.5 py-1 text-[11px] lg:text-xs font-semibold text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-200 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 rounded transition-colors cursor-pointer shrink-0"
                    >
                      Restore This
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 flex items-center justify-end text-xs lg:text-sm shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-semibold rounded transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      <PasswordConfirmModal
        isOpen={Boolean(passwordConfirmRequest)}
        lockMeta={getActiveLockMeta()}
        actionTitle={passwordConfirmRequest?.title || ''}
        actionDescription={passwordConfirmRequest?.description}
        onCancel={() => setPasswordConfirmRequest(null)}
        onConfirm={(verifiedPassword) => {
          const pending = passwordConfirmRequest;
          setPasswordConfirmRequest(null);
          pending?.run(verifiedPassword);
        }}
      />

      <ActionMessageModal
        isOpen={Boolean(actionPopup)}
        variant={actionPopup?.variant || 'success'}
        title={actionPopup?.title || ''}
        message={actionPopup?.message || ''}
        detail={actionPopup?.detail}
        onClose={() => setActionPopup(null)}
      />
    </div>
  );
};
