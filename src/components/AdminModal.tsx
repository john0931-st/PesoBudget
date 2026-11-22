/**
 * @file AdminModal.tsx
 * @description Developer-only Admin Console (accessible only when archiejp21@gmail.com is authenticated).
 * Displays live Firebase users directory, approval/permission workflows, user blocking, and public link health tools.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Ban,
  CheckCircle2,
  Clock,
  Copy,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  ADMIN_EMAIL,
  fetchAllUsersForAdmin,
  isDeveloperAdminEmail,
  updateUserAccessStatus,
} from '../services/firebaseSyncService';
import { AdminUserRecord, TopToastItem, UserAccessStatus } from '../types/budget';
import { PUBLIC_LINK_URL, PublicLinkStatus } from '../hooks/usePublicLinkMonitor';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEmail?: string;
  isOnline: boolean;
  linkStatus: PublicLinkStatus;
  onCheckPublicLink: (forceToast?: boolean) => Promise<void>;
  onEmitToast: (toast: Omit<TopToastItem, 'id'>) => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  currentEmail,
  isOnline,
  linkStatus,
  onCheckPublicLink,
  onEmitToast,
}) => {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | UserAccessStatus>('all');
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  const isAuthorizedAdmin = isDeveloperAdminEmail(currentEmail);

  const loadUsers = useCallback(async () => {
    if (!isAuthorizedAdmin || !isOnline) return;
    setIsLoading(true);
    setError(null);
    try {
      const list = await fetchAllUsersForAdmin();
      setUsers(list);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to fetch user directory.';
      setError(msg);
      onEmitToast({
        type: 'error',
        title: 'Admin Fetch Failed',
        message: msg,
      });
    } finally {
      setIsLoading(false);
    }
  }, [isAuthorizedAdmin, isOnline, onEmitToast]);

  useEffect(() => {
    if (isOpen && isAuthorizedAdmin && isOnline) {
      void loadUsers();
    }
  }, [isOpen, isAuthorizedAdmin, isOnline, loadUsers]);

  const counts = useMemo(() => {
    let approved = 0;
    let pending = 0;
    let blocked = 0;
    for (const u of users) {
      if (u.status === 'blocked') blocked++;
      else if (u.status === 'approved') approved++;
      else pending++;
    }
    return { total: users.length, approved, pending, blocked };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q)
      );
    });
  }, [users, statusFilter, searchQuery]);

  if (!isOpen || !isAuthorizedAdmin) return null;

  const handleSetUserStatus = async (userRecord: AdminUserRecord, nextStatus: UserAccessStatus) => {
    if (isDeveloperAdminEmail(userRecord.email)) {
      onEmitToast({
        type: 'warning',
        title: 'Action Protected',
        message: 'Developer Admin account status cannot be modified.',
      });
      return;
    }

    setUpdatingUid(userRecord.uid);
    try {
      await updateUserAccessStatus(userRecord.uid, nextStatus);
      setUsers((prev) =>
        prev.map((item) =>
          item.uid === userRecord.uid ? { ...item, status: nextStatus } : item
        )
      );
      const label =
        nextStatus === 'approved'
          ? 'Approved'
          : nextStatus === 'blocked'
            ? 'Blocked'
            : 'Pending Approval';
      onEmitToast({
        type: nextStatus === 'blocked' ? 'warning' : 'success',
        title: `User ${label}`,
        message: `${userRecord.displayName} (${userRecord.email}) is now ${label}.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update user permission.';
      onEmitToast({
        type: 'error',
        title: 'Permission Update Error',
        message: msg,
      });
    } finally {
      setUpdatingUid(null);
    }
  };

  const handleCopyPublicUrl = async () => {
    try {
      await navigator.clipboard.writeText(PUBLIC_LINK_URL);
      onEmitToast({
        type: 'success',
        title: 'Public Link Copied',
        message: PUBLIC_LINK_URL,
      });
    } catch {
      onEmitToast({
        type: 'info',
        title: 'Public Link',
        message: PUBLIC_LINK_URL,
      });
    }
  };

  return (
    <div
      className="pb-modal-backdrop z-[105] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="pb-modal-card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl lg:max-w-4xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Developer Admin Console"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-900 dark:bg-slate-950 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-300 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base lg:text-lg font-black tracking-tight">Developer Admin Console</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/25 text-indigo-200 border border-indigo-400/40">
                  ADMIN
                </span>
              </div>
              <p className="text-[11px] lg:text-xs text-slate-400 truncate">
                Verified Gmail: {ADMIN_EMAIL} · Manage user permissions, blocks &amp; link health
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            title="Close Admin Console"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto overscroll-contain space-y-4 flex-1 min-h-0">
          {/* Quick Admin Metric Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span>Total Users</span>
              </div>
              <div className="text-xl font-black font-mono text-slate-900 dark:text-white mt-1 tabular-nums">
                {counts.total}
              </div>
            </div>

            <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 rounded-xl p-3">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Approved</span>
              </div>
              <div className="text-xl font-black font-mono text-emerald-800 dark:text-emerald-300 mt-1 tabular-nums">
                {counts.approved}
              </div>
            </div>

            <div className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70 rounded-xl p-3">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Pending Permission</span>
              </div>
              <div className="text-xl font-black font-mono text-amber-800 dark:text-amber-300 mt-1 tabular-nums">
                {counts.pending}
              </div>
            </div>

            <div className="bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/70 rounded-xl p-3">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
                <Ban className="w-3.5 h-3.5" />
                <span>Blocked</span>
              </div>
              <div className="text-xl font-black font-mono text-rose-800 dark:text-rose-300 mt-1 tabular-nums">
                {counts.blocked}
              </div>
            </div>
          </div>

          {/* Public Link Diagnostic Tool */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-slate-100">
                <Activity
                  className={`w-4 h-4 shrink-0 ${
                    linkStatus.state === 'healthy'
                      ? 'text-emerald-500'
                      : linkStatus.state === 'offline' || linkStatus.state === 'degraded'
                        ? 'text-amber-500'
                        : 'text-sky-500'
                  }`}
                />
                <span>Public Deployment Monitor</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    linkStatus.state === 'healthy'
                      ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                      : linkStatus.state === 'offline' || linkStatus.state === 'degraded'
                        ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                        : 'bg-sky-100 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300'
                  }`}
                >
                  {linkStatus.state}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                {linkStatus.detail || PUBLIC_LINK_URL}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleCopyPublicUrl}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy URL</span>
              </button>
              <button
                type="button"
                onClick={() => void onCheckPublicLink(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Ping Link</span>
              </button>
            </div>
          </div>

          {/* Search & Filter Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users by name or Gmail..."
                className="w-full pl-8 pr-3 py-1.5 text-xs lg:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {(['all', 'pending', 'approved', 'blocked'] as const).map((tab) => {
                const active = statusFilter === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setStatusFilter(tab)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize border transition-colors cursor-pointer ${
                      active
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {tab}
                  </button>
                );
              })}

              <button
                type="button"
                disabled={isLoading || !isOnline}
                onClick={() => void loadUsers()}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-50"
                title="Refresh user directory"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {!isOnline && (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-xs font-medium text-amber-800 dark:text-amber-300">
              You are currently offline. Connect to the internet to manage users and permissions.
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-300 dark:border-rose-800 text-xs font-medium text-rose-800 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* User Directory List */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
            {isLoading && users.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                Loading registered app users...
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                No matching user accounts found.
              </div>
            ) : (
              filteredUsers.map((u) => {
                const isSelfAdmin = isDeveloperAdminEmail(u.email);
                const busy = updatingUid === u.uid;
                return (
                  <div
                    key={u.uid}
                    className="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center shrink-0 overflow-hidden font-bold text-xs text-slate-700 dark:text-slate-200">
                        {u.photoUrl ? (
                          <img
                            src={u.photoUrl}
                            alt={u.displayName}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          (u.displayName?.[0] || u.email?.[0] || 'U').toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                            {u.displayName}
                          </span>
                          {isSelfAdmin ? (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/70 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700 text-[10px] font-bold">
                              DEVELOPER ADMIN
                            </span>
                          ) : u.status === 'approved' ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 text-[10px] font-bold">
                              APPROVED
                            </span>
                          ) : u.status === 'blocked' ? (
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700 text-[10px] font-bold">
                              BLOCKED
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 text-[10px] font-bold">
                              PENDING PERMISSION
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate">
                          {u.email}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                          <span>
                            OTP Verified:{' '}
                            <strong className={u.otpVerifiedAt ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                              {u.otpVerifiedAt ? new Date(u.otpVerifiedAt).toLocaleString() : 'Unverified'}
                            </strong>
                          </span>
                          {u.lastLoginAt && (
                            <span>Last Active: {new Date(u.lastLoginAt).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Admin Controls per User */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {isSelfAdmin ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Protected Account</span>
                        </span>
                      ) : (
                        <>
                          {u.status !== 'approved' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleSetUserStatus(u, 'approved')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                            >
                              <UserCheck className="w-3 h-3" />
                              <span>Approve</span>
                            </button>
                          )}
                          {u.status !== 'pending' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleSetUserStatus(u, 'pending')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/60 hover:bg-amber-200 dark:hover:bg-amber-900/70 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-[11px] font-bold cursor-pointer disabled:opacity-50"
                            >
                              <Clock className="w-3 h-3" />
                              <span>Ask Permission</span>
                            </button>
                          )}
                          {u.status !== 'blocked' && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleSetUserStatus(u, 'blocked')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/70 border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[11px] font-bold cursor-pointer disabled:opacity-50"
                            >
                              <Ban className="w-3 h-3" />
                              <span>Block User</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-xs lg:text-sm font-semibold cursor-pointer transition-colors"
          >
            Close Admin Console
          </button>
        </div>
      </div>
    </div>
  );
};
