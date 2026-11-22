import { useCallback, useEffect, useRef, useState } from 'react';
import { TopToastItem } from '../types/budget';

export const PUBLIC_LINK_URL =
  'https://ais-pre-juv42jdfqkfmr4uvlolrey-190160227104.asia-east1.run.app';

export interface PublicLinkStatus {
  state: 'checking' | 'healthy' | 'degraded' | 'offline';
  statusCode?: number;
  latencyMs?: number;
  checkedAt?: string;
  detail?: string;
}

interface UsePublicLinkMonitorOptions {
  isOnline: boolean;
  onEmitToast: (toast: Omit<TopToastItem, 'id'>) => void;
}

export function usePublicLinkMonitor({
  isOnline,
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
      if (forceToast || lastAnnouncedStateRef.current !== 'offline') {
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

    try {
      const res = await fetch(
        `/api/health-check?url=${encodeURIComponent(PUBLIC_LINK_URL)}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        throw new Error(`Health endpoint returned ${res.status}`);
      }
      const data = (await res.json()) as {
        ok: boolean;
        status?: number;
        statusText?: string;
        latencyMs?: number;
        checkedAt?: string;
      };

      if (data.ok) {
        const nextStatus: PublicLinkStatus = {
          state: 'healthy',
          statusCode: data.status || 200,
          latencyMs: data.latencyMs,
          checkedAt: data.checkedAt || new Date().toISOString(),
          detail: `Public link online (${data.status || 200} · ${data.latencyMs ?? 0}ms)`,
        };
        setLinkStatus(nextStatus);
        if (forceToast || lastAnnouncedStateRef.current !== 'healthy') {
          lastAnnouncedStateRef.current = 'healthy';
          onEmitToastRef.current({
            type: 'success',
            title: 'Public Link Online & Healthy',
            message: `Verified ${new URL(PUBLIC_LINK_URL).host} (${data.status || 200} OK · ${data.latencyMs ?? 0}ms)`,
            durationMs: 3600,
          });
        }
      } else {
        const nextStatus: PublicLinkStatus = {
          state: 'degraded',
          statusCode: data.status || 0,
          latencyMs: data.latencyMs,
          checkedAt: data.checkedAt || new Date().toISOString(),
          detail: data.statusText || 'Public link returned an error.',
        };
        setLinkStatus(nextStatus);
        if (forceToast || lastAnnouncedStateRef.current !== 'degraded') {
          lastAnnouncedStateRef.current = 'degraded';
          onEmitToastRef.current({
            type: 'warning',
            title: 'Public Link Status Alert',
            message: `${new URL(PUBLIC_LINK_URL).host} responded with ${data.status ? `HTTP ${data.status}` : data.statusText || 'an error'}.`,
            durationMs: 4800,
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach public link';
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
  }, [isOnline, checkPublicLink]);

  return {
    linkStatus,
    checkPublicLink,
  };
}
