/**
 * @file useAutoBackup.ts
 * @description React hook that automates real-time Firestore cloud sync and restore
 * for the authenticated Firebase user when online, while strictly protecting offline
 * edits from being overwritten on reconnection until the user chooses whether to upload.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MonthData, TopToastItem, UserSecurityProfile } from '../types/budget';
import {
  fetchSheetsFromFirestore,
  subscribeToUserSheets,
  syncAllMonthsToFirestore,
} from '../services/firebaseSyncService';
import { saveSecurityProfile } from '../services/securityService';

interface UseAutoBackupProps {
  months: Record<string, MonthData>;
  securityProfile: UserSecurityProfile;
  firebaseUid: string | null;
  isAuthReady: boolean;
  isOnline?: boolean;
  hasPendingOfflineChanges?: boolean;
  onUpdateSecurityProfile: (profile: UserSecurityProfile) => void;
  onRestoreMonths: (restoredMonths: Record<string, MonthData>) => void;
  onEmitToast?: (toast: Omit<TopToastItem, 'id'>) => void;
}

function getLatestUpdatedMs(monthsMap: Record<string, MonthData>): number {
  let maxMs = 0;
  for (const m of Object.values(monthsMap)) {
    const t = new Date(m.updatedAt || 0).getTime();
    if (!Number.isNaN(t) && t > maxMs) maxMs = t;
  }
  return maxMs;
}

export function useAutoBackup({
  months,
  securityProfile,
  firebaseUid,
  isAuthReady,
  isOnline = true,
  hasPendingOfflineChanges = false,
  onUpdateSecurityProfile,
  onRestoreMonths,
  onEmitToast,
}: UseAutoBackupProps) {
  const syncedUidRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevMonthsJsonRef = useRef<string>('');
  const suppressNextUploadRef = useRef(false);
  const monthsRef = useRef(months);
  monthsRef.current = months;
  const profileRef = useRef(securityProfile);
  profileRef.current = securityProfile;
  const pendingOfflineRef = useRef(hasPendingOfflineChanges);
  pendingOfflineRef.current = hasPendingOfflineChanges;
  const onUpdateSecurityProfileRef = useRef(onUpdateSecurityProfile);
  onUpdateSecurityProfileRef.current = onUpdateSecurityProfile;
  const onRestoreMonthsRef = useRef(onRestoreMonths);
  onRestoreMonthsRef.current = onRestoreMonths;
  const onEmitToastRef = useRef(onEmitToast);
  onEmitToastRef.current = onEmitToast;

  const [autoSyncNotice, setAutoSyncNotice] = useState<string | null>(null);
  const [isSyncingFirebase, setIsSyncingFirebase] = useState(false);

  const showNotice = useCallback((msg: string, ms = 3800) => {
    setAutoSyncNotice(msg);
    if (onEmitToastRef.current) {
      onEmitToastRef.current({
        type: 'success',
        title: 'Cloud Sync',
        message: msg,
        durationMs: ms,
      });
    }
    setTimeout(() => {
      setAutoSyncNotice((curr) => (curr === msg ? null : curr));
    }, ms);
  }, []);

  /**
   * Aligns the internal baseline snapshot after a manual offline upload or restore
   * so the next render does not race or revert user edits.
   */
  const acknowledgeSyncedSnapshot = useCallback((syncedMonths: Record<string, MonthData>) => {
    prevMonthsJsonRef.current = JSON.stringify(syncedMonths);
    suppressNextUploadRef.current = true;
  }, []);

  // 1. Initial Cloud Sync & Real-time cross-device Firestore listener when signed in, online,
  //    and NO pending offline edits await user confirmation.
  useEffect(() => {
    if (!isAuthReady || !firebaseUid || !isOnline || hasPendingOfflineChanges) {
      setIsSyncingFirebase(false);
      return;
    }

    if (profileRef.current.accessStatus === 'blocked') {
      setIsSyncingFirebase(false);
      return;
    }

    let isCancelled = false;
    let unsubscribe: (() => void) | null = null;

    const initCloudSync = async () => {
      try {
        if (syncedUidRef.current !== firebaseUid) {
          syncedUidRef.current = firebaseUid;
          setIsSyncingFirebase(true);
          try {
            const cloudMonths = await fetchSheetsFromFirestore(firebaseUid);
            if (isCancelled || pendingOfflineRef.current) return;

            const cloudKeys = Object.keys(cloudMonths);
            const localMonths = monthsRef.current;
            const cloudLatest = getLatestUpdatedMs(cloudMonths);
            const localLatest = getLatestUpdatedMs(localMonths);

            if (
              cloudKeys.length > 0 &&
              (cloudLatest > localLatest + 500 || Object.keys(localMonths).length === 0)
            ) {
              if (JSON.stringify(cloudMonths) !== JSON.stringify(localMonths)) {
                suppressNextUploadRef.current = true;
                prevMonthsJsonRef.current = JSON.stringify(cloudMonths);
                onRestoreMonthsRef.current(cloudMonths);
                showNotice(
                  `Synced ${cloudKeys.length} sheet(s) from Firebase (${profileRef.current.email || 'Cloud'})`
                );
              }
            } else if (
              Object.keys(localMonths).length > 0 &&
              profileRef.current.autoBackupEnabled !== false
            ) {
              await syncAllMonthsToFirestore(firebaseUid, localMonths);
            }
          } finally {
            if (!isCancelled) {
              setIsSyncingFirebase(false);
            }
          }
        }

        if (isCancelled || pendingOfflineRef.current) return;

        unsubscribe = subscribeToUserSheets(firebaseUid, (remoteMonths) => {
          if (isCancelled || pendingOfflineRef.current) return;
          const currentLocalJson = JSON.stringify(monthsRef.current);
          const remoteJson = JSON.stringify(remoteMonths);
          if (remoteJson !== currentLocalJson) {
            const remoteLatest = getLatestUpdatedMs(remoteMonths);
            const localLatest = getLatestUpdatedMs(monthsRef.current);
            // Only overwrite local data when remote changes are strictly newer than local edits
            if (remoteLatest > localLatest + 500) {
              suppressNextUploadRef.current = true;
              prevMonthsJsonRef.current = remoteJson;
              onRestoreMonthsRef.current(remoteMonths);
              showNotice(`Updated sheets from cloud (${profileRef.current.email || 'Account'})`);
            }
          }
        });
      } catch (err) {
        console.warn('Firebase initial sync skipped:', err);
      }
    };

    void initCloudSync();

    return () => {
      isCancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [isAuthReady, firebaseUid, isOnline, hasPendingOfflineChanges, showNotice]);

  // Reset sync marker when signed out
  useEffect(() => {
    if (!firebaseUid) {
      syncedUidRef.current = null;
      setIsSyncingFirebase(false);
    }
  }, [firebaseUid]);

  // 2. Continuous Automatic Sync to Firestore on local edits when online, signed in,
  //    and user has no pending offline batch awaiting manual confirmation.
  useEffect(() => {
    if (
      !isAuthReady ||
      !firebaseUid ||
      !isOnline ||
      !securityProfile.autoBackupEnabled ||
      hasPendingOfflineChanges ||
      securityProfile.accessStatus === 'blocked'
    ) {
      return;
    }

    const currentJson = JSON.stringify(months);
    if (prevMonthsJsonRef.current === '') {
      prevMonthsJsonRef.current = currentJson;
      return;
    }

    if (prevMonthsJsonRef.current === currentJson) {
      return;
    }

    prevMonthsJsonRef.current = currentJson;

    if (suppressNextUploadRef.current) {
      suppressNextUploadRef.current = false;
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    let isCancelled = false;
    debounceTimerRef.current = setTimeout(async () => {
      if (isCancelled || pendingOfflineRef.current) return;
      setIsSyncingFirebase(true);
      try {
        await syncAllMonthsToFirestore(firebaseUid, monthsRef.current);
        if (isCancelled) return;
        const updated: UserSecurityProfile = {
          ...profileRef.current,
          lastBackupTime: new Date().toISOString(),
          backupSyncStatus: 'synced',
        };
        saveSecurityProfile(updated);
        onUpdateSecurityProfileRef.current(updated);
        showNotice(`Synced to Firebase (${updated.email || 'Google Account'})`, 3000);
      } catch (err) {
        console.error('Firebase auto-sync error:', err);
      } finally {
        if (!isCancelled) {
          setIsSyncingFirebase(false);
        }
      }
    }, 600);

    return () => {
      isCancelled = true;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    months,
    isOnline,
    isAuthReady,
    firebaseUid,
    securityProfile.autoBackupEnabled,
    securityProfile.accessStatus,
    hasPendingOfflineChanges,
    showNotice,
  ]);

  return {
    autoSyncNotice,
    isSyncingFirebase,
    acknowledgeSyncedSnapshot,
    clearNotice: () => setAutoSyncNotice(null),
  };
}
