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
import type {
  AdminUserRecord,
  CloudBackupRecord,
  MonthData,
  UserAccessStatus,
  UserRole,
  UserSecurityProfile,
} from '../types/budget';
import { getCloudBackups, saveCloudBackups } from './securityService';

export const ADMIN_EMAIL = 'archiejp21@gmail.com';

export function isDeveloperAdminEmail(email?: string | null): boolean {
  return String(email || '').trim().toLowerCase() === ADMIN_EMAIL;
}

const inFlightProfileEnsure = new Map<
  string,
  Promise<{ role: UserRole; status: UserAccessStatus; otpVerifiedAt?: string }>
>();
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

const OTP_VERIFIED_EMAIL_KEY = 'pesobudget_otp_verified_email_v1';
let pendingOtpChallengeActive = false;

export function setOtpChallengeActive(active: boolean): void {
  pendingOtpChallengeActive = active;
}

export function isOtpChallengeActive(): boolean {
  return pendingOtpChallengeActive;
}

export function markEmailOtpVerifiedLocally(email: string, verifiedAt: string): void {
  try {
    localStorage.setItem(
      OTP_VERIFIED_EMAIL_KEY,
      JSON.stringify({ email: email.trim().toLowerCase(), verifiedAt })
    );
  } catch {
    // ignore storage errors
  }
}

export function clearLocalEmailOtpVerification(): void {
  try {
    localStorage.removeItem(OTP_VERIFIED_EMAIL_KEY);
  } catch {
    // ignore storage errors
  }
}

export function isEmailOtpVerifiedLocally(email?: string | null): boolean {
  if (!email) return false;
  try {
    const raw = localStorage.getItem(OTP_VERIFIED_EMAIL_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { email?: string; verifiedAt?: string };
    return (
      Boolean(parsed.verifiedAt) &&
      String(parsed.email || '').toLowerCase() === email.trim().toLowerCase()
    );
  } catch {
    return false;
  }
}

/**
 * Step 1 of strict Google Sign-In: opens the Google chooser popup and retrieves
 * the Firebase User without completing app session activation until the Gmail OTP succeeds.
 */
export async function beginGoogleSignInPopup(): Promise<User> {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    throw new Error(
      'Google Sign-In requires http:// or https://. Open the web link when online to enable cloud sync.'
    );
  }
  setOtpChallengeActive(true);
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    return credential.user;
  } catch (err) {
    setOtpChallengeActive(false);
    throw err;
  }
}

/**
 * Step 2 of strict Google Sign-In: asks the backend server to dispatch a 6-digit
 * verification code to the user's Gmail inbox.
 */
export async function requestGmailVerificationOtp(
  email: string,
  name?: string
): Promise<{ maskedEmail: string; expiresInSeconds: number }> {
  const res = await fetch('/api/auth/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    maskedEmail?: string;
    expiresInSeconds?: number;
    error?: string;
  };
  if (!res.ok || !payload.ok) {
    throw new Error(payload.error || 'Failed to send verification code to your Gmail.');
  }
  return {
    maskedEmail: payload.maskedEmail || email,
    expiresInSeconds: payload.expiresInSeconds || 600,
  };
}

/**
 * Step 3 of strict Google Sign-In: submits the 6-digit Gmail OTP entered by the user.
 */
export async function verifyGmailOtpCode(
  email: string,
  code: string
): Promise<{ verifiedAt: string; verificationToken: string }> {
  const res = await fetch('/api/auth/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    verifiedAt?: string;
    verificationToken?: string;
    error?: string;
  };
  if (!res.ok || !payload.ok || !payload.verifiedAt) {
    throw new Error(payload.error || 'Invalid verification code.');
  }
  return {
    verifiedAt: payload.verifiedAt,
    verificationToken: payload.verificationToken || '',
  };
}

export async function completeGoogleSignInWithOtp(
  user: User,
  otpVerifiedAt: string
): Promise<{ role: UserRole; status: UserAccessStatus; otpVerifiedAt?: string }> {
  markEmailOtpVerifiedLocally(user.email || '', otpVerifiedAt);
  setOtpChallengeActive(false);
  return ensureUserProfileDoc(user, {
    autoBackupEnabled: true,
    autoRestoreEnabled: true,
    otpVerifiedAt,
    markLogin: true,
  });
}

export async function signOutFirebase(): Promise<void> {
  setOtpChallengeActive(false);
  clearLocalEmailOtpVerification();
  await signOut(auth);
}

export async function ensureUserProfileDoc(
  user: User,
  prefs?: {
    autoBackupEnabled?: boolean;
    autoRestoreEnabled?: boolean;
    otpVerifiedAt?: string;
    markLogin?: boolean;
  }
): Promise<{ role: UserRole; status: UserAccessStatus; otpVerifiedAt?: string }> {
  const existingPromise = inFlightProfileEnsure.get(user.uid);
  if (existingPromise && !prefs) {
    return existingPromise;
  }

  const run = (async (): Promise<{
    role: UserRole;
    status: UserAccessStatus;
    otpVerifiedAt?: string;
  }> => {
    const userPath = `users/${user.uid}`;
    const userRef = doc(db, 'users', user.uid);
    const safeEmail = (user.email || '').slice(0, 254);
    const safeName = (user.displayName || safeEmail.split('@')[0] || 'User').slice(0, 120);
    const safePhoto = (user.photoURL || '').slice(0, 500);
    const adminUser = isDeveloperAdminEmail(safeEmail);
    const nowIso = new Date().toISOString().slice(0, 40);

    let existingSnap;
    try {
      existingSnap = await getDocFromServer(userRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, userPath);
    }

    if (!existingSnap.exists()) {
      const initialRole: UserRole = adminUser ? 'admin' : 'user';
      const initialStatus: UserAccessStatus = adminUser ? 'approved' : 'pending';
      const createData: Record<string, unknown> = {
        uid: user.uid,
        email: safeEmail,
        displayName: safeName,
        role: initialRole,
        status: initialStatus,
        autoBackupEnabled: prefs?.autoBackupEnabled ?? true,
        autoRestoreEnabled: prefs?.autoRestoreEnabled ?? true,
        lastLoginAt: nowIso,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (safePhoto) createData.photoUrl = safePhoto;
      if (prefs?.otpVerifiedAt) {
        createData.otpVerifiedAt = prefs.otpVerifiedAt.slice(0, 40);
      }

      try {
        await setDoc(userRef, createData);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, userPath);
      }
      return {
        role: initialRole,
        status: initialStatus,
        otpVerifiedAt: prefs?.otpVerifiedAt,
      };
    }

    const existingData = existingSnap.data();
    const resolvedRole: UserRole =
      existingData.role === 'admin' || adminUser ? 'admin' : 'user';
    const resolvedStatus: UserAccessStatus =
      existingData.status === 'blocked'
        ? 'blocked'
        : existingData.status === 'approved' || adminUser
          ? 'approved'
          : 'pending';

    const nextAutoBackup =
      prefs?.autoBackupEnabled ?? (existingData.autoBackupEnabled as boolean) ?? true;
    const nextAutoRestore =
      prefs?.autoRestoreEnabled ?? (existingData.autoRestoreEnabled as boolean) ?? true;
    const nextOtpVerifiedAt = prefs?.otpVerifiedAt
      ? prefs.otpVerifiedAt.slice(0, 40)
      : (existingData.otpVerifiedAt as string | undefined);

    const needsUpdate =
      existingData.email !== safeEmail ||
      existingData.displayName !== safeName ||
      (safePhoto && existingData.photoUrl !== safePhoto) ||
      existingData.autoBackupEnabled !== nextAutoBackup ||
      existingData.autoRestoreEnabled !== nextAutoRestore ||
      Boolean(prefs?.otpVerifiedAt && existingData.otpVerifiedAt !== prefs.otpVerifiedAt) ||
      Boolean(prefs?.markLogin);

    if (needsUpdate) {
      const updateData: Record<string, unknown> = {
        email: safeEmail,
        displayName: safeName,
        autoBackupEnabled: nextAutoBackup,
        autoRestoreEnabled: nextAutoRestore,
        updatedAt: serverTimestamp(),
      };
      if (safePhoto) updateData.photoUrl = safePhoto;
      if (nextOtpVerifiedAt) updateData.otpVerifiedAt = nextOtpVerifiedAt;
      if (prefs?.markLogin) updateData.lastLoginAt = nowIso;

      try {
        await updateDoc(userRef, updateData);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, userPath);
      }
    }

    return {
      role: resolvedRole,
      status: resolvedStatus,
      otpVerifiedAt: nextOtpVerifiedAt,
    };
  })();

  inFlightProfileEnsure.set(user.uid, run);
  try {
    return await run;
  } finally {
    if (inFlightProfileEnsure.get(user.uid) === run) {
      inFlightProfileEnsure.delete(user.uid);
    }
  }
}

function toIsoString(val: unknown): string | undefined {
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof val === 'string' && val.trim()) return val;
  return undefined;
}

export async function fetchUserAccessProfile(uid: string): Promise<AdminUserRecord | null> {
  const userPath = `users/${uid}`;
  try {
    const snap = await getDocFromServer(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const d = snap.data();
    const email = String(d.email || '');
    return {
      uid: String(d.uid || snap.id),
      email,
      displayName: String(d.displayName || 'User'),
      photoUrl: d.photoUrl ? String(d.photoUrl) : undefined,
      role: d.role === 'admin' || isDeveloperAdminEmail(email) ? 'admin' : 'user',
      status:
        d.status === 'blocked'
          ? 'blocked'
          : d.status === 'approved' || isDeveloperAdminEmail(email)
            ? 'approved'
            : 'pending',
      otpVerifiedAt: d.otpVerifiedAt ? String(d.otpVerifiedAt) : undefined,
      lastLoginAt: toIsoString(d.lastLoginAt),
      createdAt: toIsoString(d.createdAt),
      updatedAt: toIsoString(d.updatedAt),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, userPath);
  }
}

export async function fetchAllUsersForAdmin(): Promise<AdminUserRecord[]> {
  const user = auth.currentUser;
  if (!user || !isDeveloperAdminEmail(user.email)) {
    throw new Error('Admin access requires verified developer Gmail authentication.');
  }

  const usersPath = 'users';
  try {
    const snap = await getDocs(collection(db, 'users'));
    const list: AdminUserRecord[] = snap.docs.map((docSnap) => {
      const d = docSnap.data();
      const email = String(d.email || '');
      return {
        uid: String(d.uid || docSnap.id),
        email,
        displayName: String(d.displayName || 'User'),
        photoUrl: d.photoUrl ? String(d.photoUrl) : undefined,
        role: d.role === 'admin' || isDeveloperAdminEmail(email) ? 'admin' : 'user',
        status:
          d.status === 'blocked'
            ? 'blocked'
            : d.status === 'approved' || isDeveloperAdminEmail(email)
              ? 'approved'
              : 'pending',
        otpVerifiedAt: d.otpVerifiedAt ? String(d.otpVerifiedAt) : undefined,
        lastLoginAt: toIsoString(d.lastLoginAt),
        createdAt: toIsoString(d.createdAt),
        updatedAt: toIsoString(d.updatedAt),
      };
    });

    list.sort((a, b) => {
      const aTime = new Date(a.lastLoginAt || a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.lastLoginAt || b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
    return list;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, usersPath);
  }
}

export async function updateUserAccessStatus(
  targetUid: string,
  status: UserAccessStatus,
  role?: UserRole
): Promise<void> {
  const user = auth.currentUser;
  if (!user || !isDeveloperAdminEmail(user.email)) {
    throw new Error('Only the developer admin can update user access.');
  }
  const userPath = `users/${targetUid}`;
  const updatePayload: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
  };
  if (role) {
    updatePayload.role = role;
  }
  try {
    await updateDoc(doc(db, 'users', targetUid), updatePayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, userPath);
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

    const access = await ensureUserProfileDoc(user);
    if (access.status === 'blocked') {
      throw new Error('This account has been blocked from cloud sync by the administrator.');
    }

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

  const access = await ensureUserProfileDoc(user, {
    autoBackupEnabled: profile.autoBackupEnabled ?? true,
    autoRestoreEnabled: profile.autoRestoreEnabled ?? true,
  });
  if (access.status === 'blocked') {
    throw new Error('This account has been blocked from cloud sync by the administrator.');
  }

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
