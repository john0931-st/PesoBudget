/**
 * @file viewport.ts
 * @description Detects whether the app is opened inside a browser with top address bar
 * and/or bottom navigation bar (vs installed standalone PWA / WebView) and synchronizes
 * CSS custom properties so popups and modals never extend past visible browser chrome.
 */

export interface BrowserChromeState {
  isStandalone: boolean;
  isMobileBrowser: boolean;
  hasTopAddressBar: boolean;
  hasBottomNavBar: boolean;
  visualTop: number;
  visualHeight: number;
  bottomInset: number;
  safePadTop: number;
  safePadBottom: number;
  modalMaxHeight: number;
}

export function detectBrowserChromeBounds(): BrowserChromeState {
  if (typeof window === 'undefined') {
    return {
      isStandalone: false,
      isMobileBrowser: false,
      hasTopAddressBar: false,
      hasBottomNavBar: false,
      visualTop: 0,
      visualHeight: 800,
      bottomInset: 0,
      safePadTop: 16,
      safePadBottom: 16,
      modalMaxHeight: 768,
    };
  }

  const nav = window.navigator as Navigator & { standalone?: boolean };
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    nav.standalone === true ||
    window.location.protocol === 'file:' ||
    window.location.hostname.endsWith('androidplatform.net');

  const isCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const ua = nav.userAgent || '';
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
  const isMobileBrowser = !isStandalone && (isCoarsePointer || isMobileUa || (nav.maxTouchPoints > 0 && window.innerWidth < 1024));

  const layoutHeight = document.documentElement.clientHeight || window.innerHeight || 800;
  const vv = window.visualViewport;
  const visualHeight = vv ? vv.height : window.innerHeight || layoutHeight;
  const visualTop = vv ? Math.max(0, vv.offsetTop) : 0;
  const bottomInset = vv ? Math.max(0, (window.innerHeight || layoutHeight) - (visualTop + visualHeight)) : 0;

  const screenH = Math.max(window.screen?.height || 0, window.screen?.availHeight || 0);
  const chromeOverhead = screenH > 0 ? Math.max(0, screenH - visualHeight) : 0;

  const hasTopAddressBar = !isStandalone && (isMobileBrowser || visualTop > 0 || chromeOverhead > 36);
  const hasBottomNavBar =
    !isStandalone &&
    isMobileBrowser &&
    (chromeOverhead > 64 || bottomInset > 0 || isMobileUa);

  const safePadTop = hasTopAddressBar && isMobileBrowser ? 16 : 12;
  const safePadBottom = hasBottomNavBar ? 20 : 14;
  const modalMaxHeight = Math.max(220, Math.round(visualHeight - safePadTop - safePadBottom));

  return {
    isStandalone,
    isMobileBrowser,
    hasTopAddressBar,
    hasBottomNavBar,
    visualTop: Math.round(visualTop),
    visualHeight: Math.round(visualHeight),
    bottomInset: Math.round(bottomInset),
    safePadTop,
    safePadBottom,
    modalMaxHeight,
  };
}

export function syncViewportChromeVars(): BrowserChromeState {
  const state = detectBrowserChromeBounds();
  if (typeof document === 'undefined') return state;

  const root = document.documentElement;
  const style = root.style;
  style.setProperty('--pb-vp-top', `${state.visualTop}px`);
  style.setProperty('--pb-vp-height', `${Math.max(240, state.visualHeight)}px`);
  style.setProperty('--pb-safe-pad-top', `${state.safePadTop}px`);
  style.setProperty('--pb-safe-pad-bottom', `${state.safePadBottom}px`);
  style.setProperty('--pb-modal-max-h', `${state.modalMaxHeight}px`);
  style.setProperty(
    '--pb-float-bottom',
    `${Math.max(12, state.bottomInset + (state.hasBottomNavBar ? 20 : 16))}px`
  );

  root.dataset.browserTopBar = state.hasTopAddressBar ? 'true' : 'false';
  root.dataset.browserBottomBar = state.hasBottomNavBar ? 'true' : 'false';
  root.dataset.standalone = state.isStandalone ? 'true' : 'false';

  return state;
}

export function installViewportChromeSync(): () => void {
  if (typeof window === 'undefined') return () => {};

  let rafId = 0;
  const scheduleSync = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      syncViewportChromeVars();
    });
  };

  syncViewportChromeVars();

  window.addEventListener('resize', scheduleSync, { passive: true });
  window.addEventListener('orientationchange', scheduleSync, { passive: true });
  window.addEventListener('scroll', scheduleSync, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleSync, { passive: true });
  window.visualViewport?.addEventListener('scroll', scheduleSync, { passive: true });

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener('resize', scheduleSync);
    window.removeEventListener('orientationchange', scheduleSync);
    window.removeEventListener('scroll', scheduleSync);
    window.visualViewport?.removeEventListener('resize', scheduleSync);
    window.visualViewport?.removeEventListener('scroll', scheduleSync);
  };
}

export function clampMenuPosition(
  anchorRect: DOMRect,
  menuWidth: number,
  menuHeight: number
): { top: number; left: number } {
  const bounds = detectBrowserChromeBounds();
  const minTop = bounds.visualTop + bounds.safePadTop;
  const maxTop = Math.max(
    minTop,
    bounds.visualTop + bounds.visualHeight - menuHeight - bounds.safePadBottom
  );
  const desiredTop = anchorRect.bottom + 4;
  const top = Math.max(minTop, Math.min(maxTop, desiredTop));

  const maxLeft = Math.max(8, (window.innerWidth || 360) - menuWidth - 8);
  const left = Math.max(8, Math.min(maxLeft, anchorRect.right - menuWidth));

  return { top, left };
}
