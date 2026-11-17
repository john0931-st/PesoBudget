/**
 * @file useNetworkStatus.ts
 * @description Hook to monitor online/offline connectivity and track pending offline changes.
 * Supports both real browser navigator.onLine events and a simulation toggle for testing.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getOfflineChanges, OfflineChangeItem } from '../utils/offlineQueue';

const SIMULATE_OFFLINE_KEY = 'pesobudget_simulate_offline_mode_v2';

export function useNetworkStatus() {
  const [browserOnline, setBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const [simulateOffline, setSimulateOffline] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(SIMULATE_OFFLINE_KEY);
      if (stored !== null) {
        return stored === 'true';
      }
      // Default to real network detection (online when connected, offline when internet drops)
      return false;
    } catch {
      return false;
    }
  });

  const [offlineChanges, setOfflineChanges] = useState<OfflineChangeItem[]>(() =>
    getOfflineChanges()
  );

  // Effective status: online only if browser is online AND simulateOffline is false
  const isOnline = browserOnline && !simulateOffline;

  // Track previous online state to detect reconnection
  const prevOnlineRef = useRef<boolean>(isOnline);
  const [justReconnected, setJustReconnected] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setBrowserOnline(true);
      // If browser was offline and comes back online
      if (!simulateOffline) {
        setJustReconnected(true);
      }
    };
    const handleOffline = () => {
      setBrowserOnline(false);
      setJustReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleQueueChange = (e: Event) => {
      const customEvent = e as CustomEvent<OfflineChangeItem[]>;
      if (customEvent.detail) {
        setOfflineChanges(customEvent.detail);
      } else {
        setOfflineChanges(getOfflineChanges());
      }
    };

    window.addEventListener('pesobudget:offline_queue_changed', handleQueueChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('pesobudget:offline_queue_changed', handleQueueChange);
    };
  }, [simulateOffline]);

  // Detect transition from offline to online
  useEffect(() => {
    if (!prevOnlineRef.current && isOnline) {
      setJustReconnected(true);
    }
    prevOnlineRef.current = isOnline;
  }, [isOnline]);

  const toggleSimulateOffline = useCallback(() => {
    setSimulateOffline((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIMULATE_OFFLINE_KEY, String(next));
      } catch (err) {
        console.error('Failed to save simulate offline state:', err);
      }
      if (!next && browserOnline) {
        setJustReconnected(true);
      }
      return next;
    });
  }, [browserOnline]);

  const setOfflineMode = useCallback((offline: boolean) => {
    setSimulateOffline(offline);
    try {
      localStorage.setItem(SIMULATE_OFFLINE_KEY, String(offline));
    } catch (err) {
      console.error('Failed to save simulate offline state:', err);
    }
    if (!offline && browserOnline) {
      setJustReconnected(true);
    }
  }, [browserOnline]);

  const refreshQueue = useCallback(() => {
    setOfflineChanges(getOfflineChanges());
  }, []);

  const clearReconnectedFlag = useCallback(() => {
    setJustReconnected(false);
  }, []);

  return {
    isOnline,
    browserOnline,
    simulateOffline,
    toggleSimulateOffline,
    setOfflineMode,
    offlineChanges,
    hasOfflineChanges: offlineChanges.length > 0,
    offlineCount: offlineChanges.length,
    justReconnected,
    clearReconnectedFlag,
    refreshQueue,
  };
}
