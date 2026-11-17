/**
 * @file useAutoBackup.ts
 * @description React hook that automates real-time Firestore cloud sync and restore
 * for the authenticated Firebase user when online.
 */

import { useEffect, useRef, useState } from 'react';
import { MonthData, UserSecurityProfile } from '../types/budget';
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
  onUpdateSecurityProfile: (profile: UserSecurityProfile) => void;
  onRestoreMonths: (restoredMonths: Record<string, MonthData>) => void;
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
  onUpdateSecurityProfile,
  onRestoreMonths,
}: UseAutoBackupProps) {
  const syncedUidRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevMonthsJsonRef = useRef<string>('');
  const suppressNextUploadRef = useRef(false);
  const monthsRef = useRef(months);
  monthsRef.current = months;
  const profileRef = useRef(securityProfile);
  profileRef.current = securityProfile;
  const onUpdateSecurityProfileRef = useRef(onUpdateSecurityProfile);
  onUpdateSecurityProfileRef.current = onUpdateSecurityProfile;
  const onRestoreMonthsRef = useRef(onRestoreMonths);
  onRestoreMonthsRef.current = onRestoreMonths;

  const [autoSyncNotice, setAutoSyncNotice] = useState<string | null>(null);
  const [isSyncingFirebase, setIsSyncingFirebase] = useState(false);

  const showNotice = (msg: string, ms = 3800) => {
    setAutoSyncNotice(msg);
    setTimeout(() => {
      setAutoSyncNotice((curr) => (curr === msg ? null : curr));
    }, ms);
  };

  // 1. Initial Cloud Sync & Real-time cross-device Firestore listener when signed in & online
  useEffect(() => {
    if (!isAuthReady || !firebaseUid || !isOnline) {
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
            if (isCancelled) return;

            const cloudKeys = Object.keys(cloudMonths);
            const localMonths = monthsRef.current;
            const cloudLatest = getLatestUpdatedMs(cloudMonths);
            const localLatest = getLatestUpdatedMs(localMonths);

            if (cloudKeys.length > 0 && (cloudLatest >= localLatest || Object.keys(localMonths).length === 0)) {
              if (JSON.stringify(cloudMonths) !== JSON.stringify(localMonths)) {
                suppressNextUploadRef.current = true;
                onRestoreMonthsRef.current(cloudMonths);
                showNotice(
                  `Synced ${cloudKeys.length} sheet(s) from Firebase (${profileRef.current.email || 'Cloud'})`
                );
              }
            } else if (Object.keys(localMonths).length > 0 && profileRef.current.autoBackupEnabled !== false) {
              await syncAllMonthsToFirestore(firebaseUid, localMonths);
            }
          } finally {
            if (!isCancelled) {
              setIsSyncingFirebase(false);
            }
          }
        }

        if (isCancelled) return;

        // Subscribe to real-time updates from other devices (e.g. Studio <-> Android APK)
        unsubscribe = subscribeToUserSheets(firebaseUid, (remoteMonths) => {
          if (isCancelled) return;
          const currentLocalJson = JSON.stringify(monthsRef.current);
          const remoteJson = JSON.stringify(remoteMonths);
          if (remoteJson !== currentLocalJson) {
            const remoteLatest = getLatestUpdatedMs(remoteMonths);
            const localLatest = getLatestUpdatedMs(monthsRef.current);
            if (remoteLatest >= localLatest) {
              suppressNextUploadRef.current = true;
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
  }, [isAuthReady, firebaseUid, isOnline]);

  // Reset sync marker when signed out
  useEffect(() => {
    if (!firebaseUid) {
      syncedUidRef.current = null;
      setIsSyncingFirebase(false);
    }
  }, [firebaseUid]);

  // 2. Continuous Automatic Sync to Firestore on local edits when online & signed in
  useEffect(() => {
    if (!isAuthReady || !firebaseUid || !isOnline || !securityProfile.autoBackupEnabled) {
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
      if (isCancelled) return;
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
  }, [months, isOnline, isAuthReady, firebaseUid, securityProfile.autoBackupEnabled]);

  return {
    autoSyncNotice,
    isSyncingFirebase,
    clearNotice: () => setAutoSyncNotice(null),
  };
}
