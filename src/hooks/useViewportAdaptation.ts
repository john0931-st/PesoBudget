import { useState, useEffect, RefObject } from 'react';

export type ViewportDeviceTier =
  | 'mobile-sm'
  | 'mobile'
  | 'tablet'
  | 'desktop'
  | 'wide';

export interface ViewportAdaptationState {
  viewportWidth: number;
  viewportHeight: number;
  containerWidth: number;
  isMobileDevice: boolean;
  isTouchDevice: boolean;
  isShortViewport: boolean;
  deviceTier: ViewportDeviceTier;
}

function detectTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const touchPoints = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
  return coarsePointer || touchPoints;
}

function detectMobileUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

function resolveDeviceTier(width: number): ViewportDeviceTier {
  if (width < 400) return 'mobile-sm';
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  if (width < 1536) return 'desktop';
  return 'wide';
}

export function useViewportAdaptation(
  containerRef?: RefObject<HTMLElement | null>
): ViewportAdaptationState {
  const [state, setState] = useState<ViewportAdaptationState>(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const isTouch = detectTouchDevice();
    const isMobileUA = detectMobileUserAgent();
    const isMobile = vw < 640 || (isTouch && vw < 768) || (isMobileUA && vw < 900);
    return {
      viewportWidth: vw,
      viewportHeight: vh,
      containerWidth: vw,
      isMobileDevice: isMobile,
      isTouchDevice: isTouch,
      isShortViewport: vh < 680,
      deviceTier: resolveDeviceTier(vw),
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateMetrics = (measuredContainerWidth?: number) => {
      const vw = window.visualViewport?.width
        ? Math.round(window.visualViewport.width)
        : window.innerWidth;
      const vh = window.visualViewport?.height
        ? Math.round(window.visualViewport.height)
        : window.innerHeight;
      const cw =
        measuredContainerWidth && measuredContainerWidth > 0
          ? Math.round(measuredContainerWidth)
          : containerRef?.current?.clientWidth || vw;

      const effectiveWidth = Math.min(vw, cw || vw);
      const isTouch = detectTouchDevice();
      const isMobileUA = detectMobileUserAgent();
      const isMobile =
        vw < 640 ||
        effectiveWidth < 600 ||
        (isTouch && vw < 768) ||
        (isMobileUA && vw < 900);

      setState({
        viewportWidth: vw,
        viewportHeight: vh,
        containerWidth: cw,
        isMobileDevice: isMobile,
        isTouchDevice: isTouch,
        isShortViewport: vh < 680,
        deviceTier: resolveDeviceTier(effectiveWidth),
      });
    };

    updateMetrics();

    const handleResize = () => updateMetrics();
    window.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef?.current) {
      observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          updateMetrics(entry.contentRect.width);
        }
      });
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, [containerRef]);

  return state;
}
