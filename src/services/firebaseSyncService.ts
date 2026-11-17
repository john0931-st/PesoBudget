import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import type { CloudBackupRecord, MonthData, UserSecurityProfile } from '../types/budget';
import { getCloudBackups, saveCloudBackups } from './securityService';

const inFlightProfileEnsure = new Map<string, Promise<void>>();
const inFlightSheetSync = new Map<string, Promise<number>>();

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        cleaned[k] = stripUndefined(v);
      }
    }
    return cleaned as T;
  }
  return value;
}

function sanitizeId(raw: string, maxLen = 64): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, maxLen);
  return cleaned || `sheet_${Date.now()}`;
}

function sanitizeMonthPayload(month: MonthData, ownerUid: string) {
  const safeId = sanitizeId(month.id || '2026-10', 64);
  const safeName = (month.name || safeId).slice(0, 80);
  const safeTitle = month.sheetTitle ? String(month.sheetTitle).slice(0, 120) : undefined;
  const safeYear =
    typeof month.year === 'number' && month.year >= 2000 && month.year <= 2100
      ? month.year
      : 2026;
  const safeRowOrder = Array.isArray(month.rowOrder)
    ? month.rowOrder.slice(0, 100).map((id) => String(id).slice(0, 64))
    : undefined;

  const base: Record<string, unknown> = {
    ownerUid,
    id: safeId,
    name: safeName,
    year: safeYear,
    salaryBreakdown: stripUndefined(month.salaryBreakdown),
    rows: stripUndefined(month.rows),
    clientUpdatedAt: String(month.updatedAt || new Date().toISOString()).slice(0, 40),
  };

  if (safeTitle !== undefined) base.sheetTitle = safeTitle;
  if (safeRowOrder !== undefined) base.rowOrder = safeRowOrder;
  if (month.columnHeaders !== undefined) {
    base.columnHeaders = stripUndefined(month.columnHeaders);
  }

  return { safeId, payload: base };
}

export async function signInWithFirebaseGoogle(): Promise<User> {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    throw new Error(
      'Google Sign-In requires http:// or https://. Run Start-PesoBudget in the folder (or open the web link) when online to enable Firebase sync.'
    );
  }
  const credential = await signInWithPopup(auth, googleProvider);
  await ensureUserProfileDoc(credential.user);
  return credential.user;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(auth);
}

export async function ensureUserProfileDoc(
  user: User,
  prefs?: { autoBackupEnabled?: boolean; autoRestoreEnabled?: boolean }
): Promise<void> {
  // Serialize concurrent profile initialization/update calls for the same UID
  const existingPromise = inFlightProfileEnsure.get(user.uid);
  if (existingPromise) {
    await existingPromise;
    if (!prefs) return;
  }

  const run = (async () => {
    const userPath = `users/${user.uid}`;
    const userRef = doc(db, 'users', user.uid);
    const safeEmail = (user.email || '').slice(0, 254);
    const safeName = (user.displayName || safeEmail.split('@')[0] || 'User').slice(0, 120);
    const safePhoto = (user.photoURL || '').slice(0, 500);

    let existingSnap;
    try {
      existingSnap = await getDocFromServer(userRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, userPath);
    }

    if (!existingSnap.exists()) {
      const createData: Record<string, unknown> = {
        uid: user.uid,
        email: safeEmail,
        displayName: safeName,
        autoBackupEnabled: prefs?.autoBackupEnabled ?? true,
        autoRestoreEnabled: prefs?.autoRestoreEnabled ?? true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (safePhoto) createData.photoUrl = safePhoto;

      try {
        await setDoc(userRef, createData);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, userPath);
      }
      return;
    }

    const existingData = existingSnap.data();
    const nextAutoBackup =
      prefs?.autoBackupEnabled ?? (existingData.autoBackupEnabled as boolean) ?? true;
    const nextAutoRestore =
      prefs?.autoRestoreEnabled ?? (existingData.autoRestoreEnabled as boolean) ?? true;

    const needsUpdate =
      existingData.email !== safeEmail ||
      existingData.displayName !== safeName ||
      (safePhoto && existingData.photoUrl !== safePhoto) ||
      existingData.autoBackupEnabled !== nextAutoBackup ||
      existingData.autoRestoreEnabled !== nextAutoRestore;

    if (!needsUpdate) return;

    const updateData: Record<string, unknown> = {
      email: safeEmail,
      displayName: safeName,
      autoBackupEnabled: nextAutoBackup,
      autoRestoreEnabled: nextAutoRestore,
      updatedAt: serverTimestamp(),
    };
    if (safePhoto) updateData.photoUrl = safePhoto;

    try {
      await updateDoc(userRef, updateData);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, userPath);
    }
  })();

  inFlightProfileEnsure.set(user.uid, run);
  try {
    await run;
  } finally {
    if (inFlightProfileEnsure.get(user.uid) === run) {
      inFlightProfileEnsure.delete(user.uid);
    }
  }
}

export async function syncAllMonthsToFirestore(
  uid: string,
  months: Record<string, MonthData>
): Promise<number> {
  const prevSync = inFlightSheetSync.get(uid);
  if (prevSync) {
    try {
      await prevSync;
    } catch {
      // Proceed with latest state even if prior sync errored
    }
  }

  const run = (async () => {
    const user = auth.currentUser;
    if (!user || user.uid !== uid) {
      throw new Error('Please sign in with Google before syncing to Firebase.');
    }

    await ensureUserProfileDoc(user);

    const sheetsPath = `users/${uid}/sheets`;
    const sheetsRef = collection(db, 'users', uid, 'sheets');

    let existingIds = new Set<string>();
    try {
      const q = query(sheetsRef, where('ownerUid', '==', uid));
      const snap = await getDocs(q);
      existingIds = new Set(snap.docs.map((d) => d.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, sheetsPath);
    }

    const targetIds = new Set<string>();
    let syncedCount = 0;

    for (const month of Object.values(months)) {
      const { safeId, payload } = sanitizeMonthPayload(month, uid);
      targetIds.add(safeId);
      const sheetDocPath = `${sheetsPath}/${safeId}`;
      const sheetRef = doc(db, 'users', uid, 'sheets', safeId);

      if (existingIds.has(safeId)) {
        const updateFields: Record<string, unknown> = {
          name: payload.name,
          year: payload.year,
          salaryBreakdown: payload.salaryBreakdown,
          rows: payload.rows,
          clientUpdatedAt: payload.clientUpdatedAt,
          updatedAt: serverTimestamp(),
        };
        if (payload.sheetTitle !== undefined) updateFields.sheetTitle = payload.sheetTitle;
        if (payload.rowOrder !== undefined) updateFields.rowOrder = payload.rowOrder;
        if (payload.columnHeaders !== undefined) {
          updateFields.columnHeaders = payload.columnHeaders;
        }
        try {
          await updateDoc(sheetRef, updateFields);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, sheetDocPath);
        }
      } else {
        try {
          await setDoc(sheetRef, {
            ...payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, sheetDocPath);
        }
      }
      syncedCount++;
    }

    // Delete sheets that were removed locally
    for (const oldId of existingIds) {
      if (!targetIds.has(oldId)) {
        const delPath = `${sheetsPath}/${oldId}`;
        try {
          await deleteDoc(doc(db, 'users', uid, 'sheets', oldId));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, delPath);
        }
      }
    }

    return syncedCount;
  })();

  inFlightSheetSync.set(uid, run);
  try {
    return await run;
  } finally {
    if (inFlightSheetSync.get(uid) === run) {
      inFlightSheetSync.delete(uid);
    }
  }
}

export async function fetchSheetsFromFirestore(uid: string): Promise<Record<string, MonthData>> {
  const sheetsPath = `users/${uid}/sheets`;
  const sheetsRef = collection(db, 'users', uid, 'sheets');

  try {
    const q = query(sheetsRef, where('ownerUid', '==', uid));
    const snap = await getDocs(q);
    const result: Record<string, MonthData> = {};
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const monthId = String(data.id || docSnap.id);
      result[monthId] = {
        id: monthId,
        name: String(data.name || monthId),
        sheetTitle: data.sheetTitle ? String(data.sheetTitle) : undefined,
        year: typeof data.year === 'number' ? data.year : undefined,
        rowOrder: Array.isArray(data.rowOrder) ? (data.rowOrder as string[]) : undefined,
        salaryBreakdown: data.salaryBreakdown as MonthData['salaryBreakdown'],
        rows: data.rows as MonthData['rows'],
        columnHeaders: data.columnHeaders as MonthData['columnHeaders'],
        updatedAt: String(data.clientUpdatedAt || new Date().toISOString()),
      };
    });
    return result;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, sheetsPath);
  }
}

export function subscribeToUserSheets(
  uid: string,
  onSheetsUpdate: (months: Record<string, MonthData>) => void
): Unsubscribe {
  const sheetsPath = `users/${uid}/sheets`;
  const q = query(collection(db, 'users', uid, 'sheets'), where('ownerUid', '==', uid));

  return onSnapshot(
    q,
    (snap) => {
      if (snap.metadata.hasPendingWrites) return;

      const remoteMonths: Record<string, MonthData> = {};
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const monthId = String(data.id || docSnap.id);
        remoteMonths[monthId] = {
          id: monthId,
          name: String(data.name || monthId),
          sheetTitle: data.sheetTitle ? String(data.sheetTitle) : undefined,
          year: typeof data.year === 'number' ? data.year : undefined,
          rowOrder: Array.isArray(data.rowOrder) ? (data.rowOrder as string[]) : undefined,
          salaryBreakdown: data.salaryBreakdown as MonthData['salaryBreakdown'],
          rows: data.rows as MonthData['rows'],
          columnHeaders: data.columnHeaders as MonthData['columnHeaders'],
          updatedAt: String(data.clientUpdatedAt || new Date().toISOString()),
        };
      });

      if (Object.keys(remoteMonths).length > 0) {
        onSheetsUpdate(remoteMonths);
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, sheetsPath);
    }
  );
}

export async function createFirebaseBackupSnapshot(
  uid: string,
  months: Record<string, MonthData>,
  profile: UserSecurityProfile
): Promise<{ backup: CloudBackupRecord; updatedProfile: UserSecurityProfile }> {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) {
    throw new Error('Please sign in with Google before saving a Firebase backup.');
  }

  await ensureUserProfileDoc(user, {
    autoBackupEnabled: profile.autoBackupEnabled ?? true,
    autoRestoreEnabled: profile.autoRestoreEnabled ?? true,
  });

  const backupId = `backup_${Date.now()}`;
  const backupPath = `users/${uid}/backups/${backupId}`;
  const isAndroid = typeof navigator !== 'undefined' && /Android|Mobile/i.test(navigator.userAgent);
  const deviceInfo = isAndroid ? 'Android / Mobile' : 'Chrome Web / Desktop';

  const sanitizedMap: Record<string, unknown> = {};
  for (const month of Object.values(months)) {
    const { safeId, payload } = sanitizeMonthPayload(month, uid);
    sanitizedMap[safeId] = {
      id: payload.id,
      name: payload.name,
      ...(payload.sheetTitle !== undefined ? { sheetTitle: payload.sheetTitle } : {}),
      year: payload.year,
      ...(payload.rowOrder !== undefined ? { rowOrder: payload.rowOrder } : {}),
      salaryBreakdown: payload.salaryBreakdown,
      rows: payload.rows,
      ...(payload.columnHeaders !== undefined ? { columnHeaders: payload.columnHeaders } : {}),
      updatedAt: payload.clientUpdatedAt,
    };
  }

  try {
    await setDoc(doc(db, 'users', uid, 'backups', backupId), {
      ownerUid: uid,
      id: backupId,
      deviceInfo: deviceInfo.slice(0, 120),
      monthsCount: Object.keys(months).length,
      version: '2026.1',
      data: sanitizedMap,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, backupPath);
  }

  const timestamp = new Date().toISOString();
  const newBackup: CloudBackupRecord = {
    id: backupId,
    timestamp,
    deviceInfo,
    monthsCount: Object.keys(months).length,
    data: JSON.parse(JSON.stringify(months)),
    version: '2026.1',
  };

  // Mirror latest snapshot to local cache too
  const existingLocal = getCloudBackups();
  const updatedLocal = [newBackup, ...existingLocal.slice(0, 9)];
  saveCloudBackups(updatedLocal);

  const updatedProfile: UserSecurityProfile = {
    ...profile,
    lastBackupTime: timestamp,
    backupCount: updatedLocal.length,
    backupSyncStatus: 'synced',
  };

  return { backup: newBackup, updatedProfile };
}

export async function fetchFirebaseBackups(uid: string): Promise<CloudBackupRecord[]> {
  const backupsPath = `users/${uid}/backups`;
  try {
    const q = query(collection(db, 'users', uid, 'backups'), where('ownerUid', '==', uid));
    const snap = await getDocs(q);
    const records: CloudBackupRecord[] = snap.docs.map((docSnap) => {
      const d = docSnap.data();
      let ts = new Date().toISOString();
      if (d.createdAt instanceof Timestamp) {
        ts = d.createdAt.toDate().toISOString();
      } else if (typeof d.createdAt === 'string') {
        ts = d.createdAt;
      }
      return {
        id: String(d.id || docSnap.id),
        timestamp: ts,
        deviceInfo: String(d.deviceInfo || 'Cloud Device'),
        monthsCount:
          typeof d.monthsCount === 'number'
            ? d.monthsCount
            : Object.keys((d.data as Record<string, unknown>) || {}).length,
        data: (d.data || {}) as Record<string, MonthData>,
        version: String(d.version || '2026.1'),
      };
    });

    records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    saveCloudBackups(records.slice(0, 10));
    return records;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, backupsPath);
  }
}
