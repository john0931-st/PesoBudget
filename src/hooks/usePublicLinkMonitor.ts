import { useCallback, useEffect, useRef, useState } from 'react';
import { TopToastItem } from '../types/budget';

export const PUBLIC_LINK_URL =
  'https://pesobudget-ph.web.app/';

export interface PublicLinkStatus {
  state: 'checking' | 'healthy' | 'degraded' | 'offline';
  statusCode?: number;
  latencyMs?: number;
  checkedAt?: string;
  detail?: string;
}

interface UsePublicLinkMonitorOptions {
  isOnline: boolean;
  enabled?: boolean;
  onEmitToast: (toast: Omit<TopToastItem, 'id'>) => void;
}

export function usePublicLinkMonitor({
  isOnline,
  enabled = false,
  onEmitToast,
}: UsePublicLinkMonitorOptions) {
  const [linkStatus, setLinkStatus] = useState<PublicLinkStatus>({
    state: isOnline ? 'checking' : 'offline',
  });
  const onEmitToastRef = useRef(onEmitToast);
  onEmitToastRef.current = onEmitToast;
  const lastAnnouncedStateRef = useRef<string | null>(null);

  const checkPublicLink = useCallback(async (forceToast = false) => {
    if (
      typeof window !== 'undefined' &&
      (window.location.protocol === 'file:' || (typeof navigator !== 'undefined' && !navigator.onLine))
    ) {
      setLinkStatus({
        state: 'offline',
        checkedAt: new Date().toISOString(),
        detail: 'Device is offline; app runs from local offline storage.',
      });
      if (forceToast) {
        lastAnnouncedStateRef.current = 'offline';
        onEmitToastRef.current({
          type: 'warning',
          title: 'Offline Mode Active',
          message: 'Public link unreachable while offline. Edits are saved locally until you reconnect.',
          durationMs: 4200,
        });
      }
      return;
    }

    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);

    try {
      const targetUrl = new URL(PUBLIC_LINK_URL);
      const isSameOrigin =
        typeof window !== 'undefined' && window.location.origin === targetUrl.origin;

      if (isSameOrigin) {
        let res = await fetch(PUBLIC_LINK_URL, {
          method: 'HEAD',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (res.status === 405 || res.status === 501) {
          res = await fetch(PUBLIC_LINK_URL, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
          });
        }
        clearTimeout(timer);
        const latencyMs = Date.now() - startedAt;

        if (res.ok) {
          setLinkStatus({
            state: 'healthy',
            statusCode: res.status || 200,
            latencyMs,
            checkedAt: new Date().toISOString(),
            detail: `Public link online (${res.status || 200} · ${latencyMs}ms)`,
          });
          if (forceToast || lastAnnouncedStateRef.current !== 'healthy') {
            lastAnnouncedStateRef.current = 'healthy';
            onEmitToastRef.current({
              type: 'success',
              title: 'Public Link Online & Healthy',
              message: `Verified ${targetUrl.host} (${res.status || 200} OK · ${latencyMs}ms)`,
              durationMs: 3600,
            });
          }
        } else {
          setLinkStatus({
            state: 'degraded',
            statusCode: res.status,
            latencyMs,
            checkedAt: new Date().toISOString(),
            detail: res.statusText || `HTTP ${res.status}`,
          });
          if (forceToast || lastAnnouncedStateRef.current !== 'degraded') {
            lastAnnouncedStateRef.current = 'degraded';
            onEmitToastRef.current({
              type: 'warning',
              title: 'Public Link Status Alert',
              message: `${targetUrl.host} responded with HTTP ${res.status}.`,
              durationMs: 4800,
            });
          }
        }
        return;
      }

      // Cross-origin static reachability probe (no backend server required)
      await fetch(PUBLIC_LINK_URL, {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - startedAt;

      setLinkStatus({
        state: 'healthy',
        statusCode: 200,
        latencyMs,
        checkedAt: new Date().toISOString(),
        detail: `Public link reachable (${latencyMs}ms)`,
      });
      if (forceToast || lastAnnouncedStateRef.current !== 'healthy') {
        lastAnnouncedStateRef.current = 'healthy';
        onEmitToastRef.current({
          type: 'success',
          title: 'Public Link Online & Healthy',
          message: `Verified ${targetUrl.host} reachable (${latencyMs}ms)`,
          durationMs: 3600,
        });
      }
    } catch (err) {
      clearTimeout(timer);
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? 'Public link check timed out.'
          : err instanceof Error
            ? err.message
            : 'Unable to reach public link';
      setLinkStatus({
        state: 'degraded',
        checkedAt: new Date().toISOString(),
        detail: msg,
      });
      if (forceToast || lastAnnouncedStateRef.current !== 'degraded') {
        lastAnnouncedStateRef.current = 'degraded';
        onEmitToastRef.current({
          type: 'warning',
          title: 'Public Link Check Warning',
          message: msg,
          durationMs: 4500,
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const initialTimer = setTimeout(() => {
      void checkPublicLink(false);
    }, 1800);

    const intervalId = setInterval(() => {
      void checkPublicLink(false);
    }, 90_000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalId);
    };
  }, [enabled, isOnline, checkPublicLink]);

  return {
    linkStatus,
    checkPublicLink,
  };
}
