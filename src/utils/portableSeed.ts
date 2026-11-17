/**
 * @file portableSeed.ts
 * @description Hydrates localStorage on first launch when PesoBudget/index.html
 * is opened directly from a portable folder (file:// or offline http://).
 */

import type { EncryptedEnvelope, PortableLockMetadata } from './portableCrypto';

export interface PortableSeedPayload {
  version: number;
  exportedAt: string;
  activeMonthId?: string;
  months?: Record<string, unknown>;
  years?: number[];
  changeLogs?: unknown[];
  offlineQueue?: unknown[];
}

declare global {
  interface Window {
    __PESOBUDGET_PORTABLE_SEED__?: PortableSeedPayload;
    __PESOBUDGET_PORTABLE_LOCK__?: PortableLockMetadata;
    __PESOBUDGET_ENCRYPTED_SEED__?: EncryptedEnvelope;
  }
}

export function hydrateSeedObject(seed: PortableSeedPayload | null | undefined): void {
  if (typeof window === 'undefined' || !seed) return;

  try {
    // Only hydrate empty keys so existing edits on that device are never overwritten
    const existingMonths = localStorage.getItem('pesobudget_months_v3');
    if (!existingMonths && seed.months && Object.keys(seed.months).length > 0) {
      localStorage.setItem('pesobudget_months_v3', JSON.stringify(seed.months));
    }

    if (!localStorage.getItem('pesobudget_active_month_v3') && seed.activeMonthId) {
      localStorage.setItem('pesobudget_active_month_v3', seed.activeMonthId);
    }

    if (
      !localStorage.getItem('pesobudget_managed_years_v1') &&
      Array.isArray(seed.years) &&
      seed.years.length > 0
    ) {
      localStorage.setItem('pesobudget_managed_years_v1', JSON.stringify(seed.years));
    }

    if (
      !localStorage.getItem('pesobudget_changelog_v1') &&
      Array.isArray(seed.changeLogs) &&
      seed.changeLogs.length > 0
    ) {
      localStorage.setItem('pesobudget_changelog_v1', JSON.stringify(seed.changeLogs));
    }

    if (
      !localStorage.getItem('pesobudget_offline_changes_queue_v1') &&
      Array.isArray(seed.offlineQueue) &&
      seed.offlineQueue.length > 0
    ) {
      localStorage.setItem('pesobudget_offline_changes_queue_v1', JSON.stringify(seed.offlineQueue));
    }
  } catch (err) {
    console.warn('Portable seed hydration skipped:', err);
  }
}

export function hydratePortableSeedIfNeeded(): void {
  if (typeof window === 'undefined') return;
  // Encrypted portable seeds are hydrated by PortableLockScreen after password verification
  if (window.__PESOBUDGET_PORTABLE_LOCK__ || window.__PESOBUDGET_ENCRYPTED_SEED__) {
    return;
  }
  hydrateSeedObject(window.__PESOBUDGET_PORTABLE_SEED__);
}
