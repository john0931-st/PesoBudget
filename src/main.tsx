import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { hydratePortableSeedIfNeeded } from './utils/portableSeed';
import { PortableLockScreen } from './components/PortableLockScreen';
import {
  getStoredPortableLock,
  isSessionUnlockedForLock,
} from './utils/portableCrypto';
import { installViewportChromeSync } from './utils/viewport';
import { initTheme } from './utils/theme';

hydratePortableSeedIfNeeded();
installViewportChromeSync();
initTheme();

// Pre-warm same-origin runtime cache so the app launches cleanly offline even after closing browser/Studio on first visit
async function warmOfflineRuntimeCache() {
  if (typeof window === 'undefined' || !('caches' in window) || !navigator.onLine) return;
  try {
    await Promise.all([
      caches.delete('pesobudget-app-runtime-v1'),
      caches.delete('pesobudget-app-runtime-v2'),
      caches.delete('pesobudget-app-runtime-v3'),
      caches.delete('pesobudget-app-runtime-v4'),
      caches.delete('pesobudget-app-runtime-v5'),
      caches.delete('pesobudget-app-runtime-v6'),
      caches.delete('pesobudget-app-runtime-v7'),
      caches.delete('pesobudget-app-runtime-v8'),
      caches.delete('pesobudget-app-runtime-v9'),
      caches.delete('pesobudget-app-runtime-v10'),
      caches.delete('pesobudget-app-runtime-v11'),
      caches.delete('pesobudget-app-runtime-v12'),
      caches.delete('pesobudget-app-runtime-v13'),
      caches.delete('pesobudget-app-runtime-v14'),
      caches.delete('pesobudget-app-runtime-v15'),
      caches.delete('pesobudget-app-runtime-v16'),
      caches.delete('pesobudget-app-runtime-v17'),
      caches.delete('pesobudget-app-runtime-v18'),
      caches.delete('pesobudget-app-runtime-v19'),
      caches.delete('pesobudget-app-runtime-v20'),
      caches.delete('pesobudget-app-runtime-v21'),
      caches.delete('pesobudget-app-runtime-v22'),
      caches.delete('pesobudget-app-runtime-v23'),
      caches.delete('pesobudget-app-runtime-v24'),
      caches.delete('pesobudget-app-runtime-v25'),
      caches.delete('pesobudget-app-runtime-v26'),
      caches.delete('pesobudget-app-runtime-v27'),
    ]);
    const cache = await caches.open('pesobudget-app-runtime-v28');
    const origin = window.location.origin;
    const urls = new Set<string>([
      `${origin}/`,
      `${origin}/index.html`,
      `${origin}/manifest.json`,
      `${origin}/manifest.webmanifest`,
      `${origin}/icon.svg`,
      `${origin}/pwa-192x192.png`,
      `${origin}/pwa-512x512.png`,
      `${origin}/apple-touch-icon.png`,
    ]);

    if (typeof performance !== 'undefined' && performance.getEntriesByType) {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      for (const entry of resources) {
        if (
          entry.name &&
          entry.name.startsWith(origin) &&
          !entry.name.includes('/api/') &&
          !entry.name.includes('hot-update')
        ) {
          urls.add(entry.name);
        }
      }
    }

    const urlList = Array.from(urls);
    // Warm and refresh cache in background when online so offline launches stay up-to-date
    await Promise.allSettled(
      urlList.map(async (u) => {
        const res = await fetch(u, { credentials: 'same-origin' });
        if (res.ok) {
          await cache.put(u, res);
        }
      })
    );
  } catch (err) {
    console.warn('Offline runtime cache warming skipped:', err);
  }
}

// Register service worker for web browser offline launch (skip on file:// and Android APK WebViewAssetLoader)
if (
  typeof window !== 'undefined' &&
  window.location.protocol !== 'file:' &&
  !window.location.hostname.endsWith('androidplatform.net')
) {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        setTimeout(() => {
          void warmOfflineRuntimeCache();
        }, 1500);
      }
    },
    onOfflineReady() {
      void warmOfflineRuntimeCache();
    },
  });
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Unhandled application error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-6 text-slate-800 dark:text-slate-100">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto text-xl font-bold">
              !
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Application Recovered</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              An unexpected display issue occurred. Your data in local storage is completely safe.
            </p>
            {this.state.error?.message && (
              <pre className="text-[11px] p-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-rose-700 dark:text-rose-300 font-mono text-left overflow-x-auto max-h-28">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RootApp() {
  const [, setLockRevision] = React.useState(0);

  React.useEffect(() => {
    const refresh = () => setLockRevision((n) => n + 1);
    window.addEventListener('pesobudget:lock_now', refresh);
    window.addEventListener('pesobudget:lock_changed', refresh);
    return () => {
      window.removeEventListener('pesobudget:lock_now', refresh);
      window.removeEventListener('pesobudget:lock_changed', refresh);
    };
  }, []);

  const embeddedLock =
    typeof window !== 'undefined' ? window.__PESOBUDGET_PORTABLE_LOCK__ : undefined;
  const activeLock = embeddedLock || getStoredPortableLock();
  const encryptedSeed =
    typeof window !== 'undefined' ? window.__PESOBUDGET_ENCRYPTED_SEED__ : undefined;

  const isLocked = Boolean(activeLock && !isSessionUnlockedForLock(activeLock));

  if (isLocked && activeLock) {
    return (
      <PortableLockScreen
        lockMeta={activeLock}
        encryptedSeed={encryptedSeed}
        onUnlocked={() => setLockRevision((n) => n + 1)}
      />
    );
  }

  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <RootApp />
  </ErrorBoundary>
);
