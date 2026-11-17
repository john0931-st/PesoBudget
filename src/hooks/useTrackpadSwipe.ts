import { useEffect, useRef, RefObject } from 'react';

interface UseTrackpadSwipeOptions {
  ref: RefObject<HTMLElement | null>;
  onNext: () => void;
  onPrev: () => void;
  enabled?: boolean;
}

/**
 * Enables two-finger horizontal trackpad/touchpad swipe navigation on desktop,
 * laptop, MacBook, and larger non-mobile screens via non-passive wheel events.
 *
 * Prevents browser back/forward history swipe on horizontal trackpad gestures
 * while preserving normal vertical scrolling and suppressing momentum inertia
 * from skipping multiple pages per swipe.
 */
export function useTrackpadSwipe({
  ref,
  onNext,
  onPrev,
  enabled = true,
}: UseTrackpadSwipeOptions) {
  const onNextRef = useRef(onNext);
  const onPrevRef = useRef(onPrev);

  useEffect(() => {
    onNextRef.current = onNext;
    onPrevRef.current = onPrev;
  }, [onNext, onPrev]);

  const accumXRef = useRef(0);
  const accumYRef = useRef(0);
  const lastEventTimeRef = useRef(0);
  const lastTriggerTimeRef = useRef(0);
  const lastAbsDeltaXRef = useRef(0);
  const gestureHandledRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const handleWheel = (e: WheelEvent) => {
      // Ignore pinch-to-zoom gestures
      if (e.ctrlKey || e.metaKey) return;

      // Active when viewport exceeds smartphone width (>= 640px) or on fine-pointer/desktop devices
      const isDesktopOrTrackpad =
        window.innerWidth >= 640 ||
        window.matchMedia('(pointer: fine)').matches ||
        window.matchMedia('(hover: hover)').matches;

      if (!isDesktopOrTrackpad) return;

      const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      const dx = e.deltaX * scale;
      const dy = e.deltaY * scale;

      // Skip zero-delta noise events
      if (dx === 0 && dy === 0) return;

      const now = Date.now();
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Reset gesture accumulation when user pauses between swipes (> 160ms)
      if (now - lastEventTimeRef.current > 160) {
        accumXRef.current = 0;
        accumYRef.current = 0;
        gestureHandledRef.current = false;
      }
      lastEventTimeRef.current = now;

      // Block browser back/forward swipe when user is swiping horizontally
      if (absDx > absDy && absDx > 0.5) {
        e.preventDefault();
      }

      // If this continuous swipe already turned a page, suppress trailing trackpad inertia
      // unless a clear new deliberate velocity spike happens after cooldown
      if (gestureHandledRef.current) {
        const isNewDeliberateSwipe =
          now - lastTriggerTimeRef.current > 450 &&
          absDx > 24 &&
          absDx > lastAbsDeltaXRef.current * 2.2 &&
          absDx > absDy * 1.3;

        lastAbsDeltaXRef.current = absDx;

        if (!isNewDeliberateSwipe) {
          return;
        }
        // Reset for the new deliberate swipe
        gestureHandledRef.current = false;
        accumXRef.current = 0;
        accumYRef.current = 0;
      }

      lastAbsDeltaXRef.current = absDx;
      accumXRef.current += dx;
      accumYRef.current += dy;

      const totalAbsX = Math.abs(accumXRef.current);
      const totalAbsY = Math.abs(accumYRef.current);

      // Trigger page turn when horizontal delta exceeds threshold and clearly dominates vertical scroll
      if (totalAbsX >= 40 && totalAbsX > totalAbsY * 1.25) {
        if (accumXRef.current > 0) {
          onNextRef.current();
        } else {
          onPrevRef.current();
        }
        gestureHandledRef.current = true;
        lastTriggerTimeRef.current = now;
        accumXRef.current = 0;
        accumYRef.current = 0;
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
    };
  }, [ref, enabled]);
}
