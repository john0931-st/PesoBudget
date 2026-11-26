/**
 * @file FeatureCoachTutorial.tsx
 * @description Modern interactive spotlight coach-mark tutorial with a directional arrow
 * pointing directly at live spreadsheet cells, summary cards, charts, and change log controls.
 * Covers Budget Sheet, Summary & Graphs, Monthly Summary, and Change Log views step by step.
 */

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Sparkles,
  X,
} from 'lucide-react';
import { ActiveTab } from '../types/budget';

export const COACH_STORAGE_PREFIX = 'pesobudget_coach_tutorial_v1_';

export type CoachPlacement = 'auto' | 'top' | 'bottom' | 'left' | 'right';

export type CoachScopeKey =
  | 'sheet'
  | 'changelog'
  | 'charts:0'
  | 'charts:1'
  | 'charts:2'
  | 'charts:3'
  | 'charts:4'
  | 'charts:5'
  | 'charts:6'
  | 'summary:0'
  | 'summary:1'
  | 'summary:2'
  | 'summary:3'
  | 'summary:4';

export interface CoachStep {
  id: string;
  targetId: string;
  viewLabel: string;
  title: string;
  whatItDoes: string;
  whatYouCanDo: string;
  preferredPlacement?: CoachPlacement;
}

export const COACH_STEPS_BY_SCOPE: Record<CoachScopeKey, CoachStep[]> = {
  sheet: [
    {
      id: 'sheet-title-options',
      targetId: 'coach-sheet-title-menu',
      viewLabel: 'Budget Sheet',
      title: 'Sheet Title & Column Options',
      whatItDoes:
        'Displays the active sheet heading and opens worksheet layout controls.',
      whatYouCanDo:
        'Tap the three-dot menu to rename the title, add or remove custom currency/text columns, or open Merge & Unmerge options.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'sheet-filter-strip',
      targetId: 'coach-sheet-remarks-filter',
      viewLabel: 'Budget Sheet',
      title: 'Filter Bills & Quick Settle',
      whatItDoes:
        'Filters rows by All, Settled, Deferred, or Unset status while keeping totals calculated.',
      whatYouCanDo:
        'Tap any status filter to focus on unpaid bills, or click Settle Unset to mark active bills as Settled in one tap.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'sheet-payment-label',
      targetId: 'coach-cell-payment-label',
      viewLabel: 'Budget Sheet',
      title: 'Editable Payment Category Cell',
      whatItDoes:
        'Names each expense, savings account, or payment channel in your spreadsheet.',
      whatYouCanDo:
        'Double-tap any item under PAYMENTS to rename it (for example GoTyme to MariBank) or drag rows to reorder. Renaming updates Summary, Charts, and Exports everywhere.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'sheet-amount-formula',
      targetId: 'coach-cell-amount-formula',
      viewLabel: 'Budget Sheet',
      title: 'Amount & Formula (=) Cell',
      whatItDoes:
        'Stores monthly or 15th Kinsenas bill amounts and feeds live bank and balance calculations.',
      whatYouCanDo:
        'Tap once to select and reveal the floating action bar (Edit, Sticky Note, Merge/Unmerge, Move Row, Clear), or start typing with "=" (like =1250+450) for instant math.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'sheet-remarks-cell',
      targetId: 'coach-cell-remarks-status',
      viewLabel: 'Budget Sheet',
      title: 'Bill Settlement Cell (Remarks)',
      whatItDoes:
        'Tracks whether each expense is already paid or carried forward to the next cutoff.',
      whatYouCanDo:
        'Tap any Remarks cell to mark a bill as Settled, Deferred (carries into your next clean sheet automatically), or Clear.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'sheet-salary-cell',
      targetId: 'coach-cell-salary',
      viewLabel: 'Budget Sheet',
      title: 'Payroll & Ending Balance Engine',
      whatItDoes:
        'Combines your base salary and carried previous balance, then deducts Total Bills, locked MP2, and withdrawable savings.',
      whatYouCanDo:
        'Tap SALARY (or choose Breakdown in the bottom action bar) to set pay per cutoff and carryover balance. TOTAL, METROBANK, and BALANCE recalculate live.',
      preferredPlacement: 'top',
    },
    {
      id: 'sheet-bottom-dock',
      targetId: 'coach-sheet-bottom-tabs',
      viewLabel: 'Budget Sheet',
      title: 'Cutoff Tabs, Summary & Change Log',
      whatItDoes:
        'Switches between monthly sheets, opens visual reports, and tracks your edit history.',
      whatYouCanDo:
        'Tap a cutoff tab to switch sheets, tap its three dots to Rename/Duplicate/Delete, or open Summary & Graphs and Change Log to view their interactive guides.',
      preferredPlacement: 'top',
    },
  ],
  'charts:0': [
    {
      id: 'charts-view-mode',
      targetId: 'coach-charts-view-toggle',
      viewLabel: 'Summary & Graphs · Page 1',
      title: 'Carousel Cards vs Full Report',
      whatItDoes:
        'Switches between interactive swipeable analytics cards and a printable multi-page report.',
      whatYouCanDo:
        'Stay on Card Carousel to explore charts one page at a time, or switch to Full 7-Page Report to inspect or print everything at once.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'charts-pager-dots',
      targetId: 'coach-charts-carousel-dots',
      viewLabel: 'Summary & Graphs · Page 1',
      title: '7 Visual Analytics Pages',
      whatItDoes:
        'Navigates across Snapshot, 15-Day Cutoffs, Category Donut Chart, Cash Outflows, Savings Reserves, Cash Flow Waterfall, and Multi-Month Progression.',
      whatYouCanDo:
        'Swipe left or right across the card—or tap any indicator dot—to explore each page and unlock its own interactive guide.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'charts-kpi-grid',
      targetId: 'coach-charts-kpi-grid',
      viewLabel: 'Summary & Graphs · Page 1',
      title: 'Live Multi-Sheet KPI Cards',
      whatItDoes:
        'Aggregates your active month into Total Bills, ATM Cash, Digital Payment, Locked Savings, and Liquid Reserve.',
      whatYouCanDo:
        'Any row labels you rename on the Budget Sheet automatically update across these summary cards.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'charts-allocation-bar',
      targetId: 'coach-charts-allocation-bar',
      viewLabel: 'Summary & Graphs · Page 1',
      title: 'Salary Allocation & Ratio Bar',
      whatItDoes:
        'Breaks down your gross payroll share across bills, locked MP2 savings, withdrawable savings, and ending surplus.',
      whatYouCanDo:
        'Review each segment percentage to spot spending spikes and track your net savings rate.',
      preferredPlacement: 'top',
    },
  ],
  'charts:1': [
    {
      id: 'charts-p1-cutoffs',
      targetId: 'coach-charts-p1-cutoffs',
      viewLabel: 'Summary & Graphs · Page 2',
      title: '15th Kinsenas vs 30th Katapusan Cards',
      whatItDoes:
        'Compares mid-month and end-of-month payroll, bills, locked savings, and ending balance side by side.',
      whatYouCanDo:
        'Tap either cutoff card directly to jump straight into that worksheet and edit its amounts.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'charts-p1-total',
      targetId: 'coach-charts-p1-total',
      viewLabel: 'Summary & Graphs · Page 2',
      title: 'Combined Full-Month Ledger',
      whatItDoes:
        'Combines both 15-day sheets cleanly without double-counting carryover funds.',
      whatYouCanDo:
        'Verify your true monthly take-home surplus after all mid-month and end-of-month obligations.',
      preferredPlacement: 'top',
    },
  ],
  'charts:2': [
    {
      id: 'charts-p2-donut',
      targetId: 'coach-charts-p2-donut',
      viewLabel: 'Summary & Graphs · Page 3',
      title: 'Interactive Expense Donut Chart',
      whatItDoes:
        'Visualizes what percentage of your total monthly bills goes into each spending category.',
      whatYouCanDo:
        'Tap or hover any colored slice to lock focus on that bill and display its exact peso amount in the center ring.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'charts-p2-legend',
      targetId: 'coach-charts-p2-legend',
      viewLabel: 'Summary & Graphs · Page 3',
      title: 'Clickable Category Legend',
      whatItDoes:
        'Lists every expense category sorted by peso value alongside its share percentage.',
      whatYouCanDo:
        'Tap any row here to highlight its slice on the chart, or tap empty space to clear selection.',
      preferredPlacement: 'top',
    },
  ],
  'charts:3': [
    {
      id: 'charts-p3-outflows',
      targetId: 'coach-charts-p3-outflows',
      viewLabel: 'Summary & Graphs · Page 4',
      title: 'Planned Channels & Execution Bar',
      whatItDoes:
        'Compares planned cash withdrawals and QR PH digital payments against what you have actually withdrawn so far.',
      whatYouCanDo:
        'Watch the execution variance bar turn emerald once your ATM cash and digital transfers match planned bills.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'charts-p3-settlement',
      targetId: 'coach-charts-p3-settlement',
      viewLabel: 'Summary & Graphs · Page 4',
      title: 'Settled vs Deferred Progress',
      whatItDoes:
        'Tracks how much of your monthly billing is already marked Settled versus carried over as Deferred.',
      whatYouCanDo:
        'Return to your Budget Sheet Remarks column anytime to settle remaining bills and raise this meter to 100%.',
      preferredPlacement: 'top',
    },
  ],
  'charts:4': [
    {
      id: 'charts-p4-splitbar',
      targetId: 'coach-charts-p4-splitbar',
      viewLabel: 'Summary & Graphs · Page 5',
      title: 'Locked vs Liquid Savings Ratio',
      whatItDoes:
        'Measures how your monthly savings split between long-term locked funds and withdrawable emergency cash.',
      whatYouCanDo:
        'Use this split bar to keep your short-term liquid cushion healthy alongside long-term MP2 contributions.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'charts-p4-cards',
      targetId: 'coach-charts-p4-cards',
      viewLabel: 'Summary & Graphs · Page 5',
      title: 'Separated Savings Buckets',
      whatItDoes:
        'Keeps locked MP2 out of your spendable balance while adding withdrawable savings to ending carryover cash.',
      whatYouCanDo:
        'Edit your MP2 or GoTyme rows on the Budget Sheet—your safe-to-spend liquid total recalculates automatically.',
      preferredPlacement: 'top',
    },
  ],
  'charts:5': [
    {
      id: 'charts-p5-steps',
      targetId: 'coach-charts-p5-steps',
      viewLabel: 'Summary & Graphs · Page 6',
      title: '4-Step Salary Waterfall',
      whatItDoes:
        'Traces your payroll step by step from gross funds through bills, locked savings, and remaining surplus.',
      whatYouCanDo:
        'Follow Steps 1 to 4 left-to-right to audit exactly where every peso of payroll goes.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'charts-p5-surplus',
      targetId: 'coach-charts-p5-surplus',
      viewLabel: 'Summary & Graphs · Page 6',
      title: 'Surplus & Carryover Split',
      whatItDoes:
        'Shows how much remaining surplus goes into withdrawable savings versus ending balance for the next cutoff.',
      whatYouCanDo:
        'When creating a new cutoff sheet, this ending balance can carry straight into your next SALARY breakdown.',
      preferredPlacement: 'top',
    },
  ],
  'charts:6': [
    {
      id: 'charts-history-cashflow',
      targetId: 'coach-history-cashflow',
      viewLabel: 'Summary & Graphs · Page 7',
      title: 'Jan–Dec Salary vs Expenses Chart',
      whatItDoes:
        'Plots your monthly payroll alongside total bills across all 12 months of the selected fiscal year.',
      whatYouCanDo:
        'Hover any month bar for exact figures, or tap a recorded month column to open that month’s Budget Sheet.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'charts-history-savings',
      targetId: 'coach-history-savings',
      viewLabel: 'Summary & Graphs · Page 7',
      title: 'Annual MP2 vs GoTyme Accumulation',
      whatItDoes:
        'Tracks monthly deposits into locked MP2 and withdrawable savings side by side across the year.',
      whatYouCanDo:
        'Tap any bar to switch directly to that month and compare savings consistency month over month.',
      preferredPlacement: 'top',
    },
  ],
  'summary:0': [
    {
      id: 'summary-adjust-salary',
      targetId: 'coach-summary-adjust-salary',
      viewLabel: 'Monthly Summary · Page 1',
      title: 'Adjust Payroll Without Leaving Summary',
      whatItDoes:
        'Opens the Salary Breakdown dialog directly from the reconciled summary screen.',
      whatYouCanDo:
        'Tap Adjust Salary anytime to update base pay or previous balance and watch your net surplus update live.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'summary-carousel-dots',
      targetId: 'coach-summary-carousel-dots',
      viewLabel: 'Monthly Summary · Page 1',
      title: '5 Reconciled Summary Views',
      whatItDoes:
        'Steps through Obligations & Surplus, 15-Day Cutoff Comparison, Cash Outflows, Deferred Bills, and Monthly Progression.',
      whatYouCanDo:
        'Swipe left or right across the card—or tap any dot—to explore each page and get step-by-step guidance there too.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'summary-ledger-card',
      targetId: 'coach-summary-ledger-card',
      viewLabel: 'Monthly Summary · Page 1',
      title: 'Zero-Variance Reconciled Ledger',
      whatItDoes:
        'Reconciles gross payroll against ATM cash withdrawals, QR PH payments, locked MP2, and withdrawable savings.',
      whatYouCanDo:
        'Review your exact Ending Liquid Balance and verify every cutoff sheet reconciles cleanly with zero double-counting.',
      preferredPlacement: 'top',
    },
  ],
  'summary:1': [
    {
      id: 'summary-p1-cutoffs',
      targetId: 'coach-summary-p1-cutoffs',
      viewLabel: 'Monthly Summary · Page 2',
      title: '15th Kinsenas vs 30th Katapusan Ledger',
      whatItDoes:
        'Shows how each half-month sheet contributes separately to your payroll, obligations, locked MP2, and ending balance.',
      whatYouCanDo:
        'Tap either cutoff card to jump directly into that sheet if you need to adjust a bill or remark.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'summary-p1-total',
      targetId: 'coach-summary-p1-total',
      viewLabel: 'Monthly Summary · Page 2',
      title: 'Consolidated Full-Month Total',
      whatItDoes:
        'Deduplicates carryover cash so your full-month salary, bills, and ending liquidity stay accurate.',
      whatYouCanDo:
        'Compare individual cutoffs on the left with your true combined month surplus on the right.',
      preferredPlacement: 'top',
    },
  ],
  'summary:2': [
    {
      id: 'summary-p2-cards',
      targetId: 'coach-summary-p2-cards',
      viewLabel: 'Monthly Summary · Page 3',
      title: 'ATM Cash vs Digital Transfer Channels',
      whatItDoes:
        'Breaks obligations down into physical cash to withdraw (Metrobank), digital transfers (QR PH), and combined total outflow.',
      whatYouCanDo:
        'Use these exact figures on payday so you withdraw the right cash amount and keep digital bills funded.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'summary-p2-clarity',
      targetId: 'coach-summary-p2-clarity',
      viewLabel: 'Monthly Summary · Page 3',
      title: 'Channel Clarity Guarantee',
      whatItDoes:
        'Explains how items like Lazada/credit bills map to QR PH without being counted twice in your totals.',
      whatYouCanDo:
        'Rename any bank or payment label in your Budget Sheet and this reconciliation note adapts automatically.',
      preferredPlacement: 'top',
    },
  ],
  'summary:3': [
    {
      id: 'summary-p3-deferred',
      targetId: 'coach-summary-p3-deferred',
      viewLabel: 'Monthly Summary · Page 4',
      title: 'Deferred Bills Rollover Queue',
      whatItDoes:
        'Lists every bill marked "Move to Next Payroll" in your Budget Sheet, or confirms when all obligations are settled.',
      whatYouCanDo:
        'Any deferred items shown here automatically pre-populate when you create your next clean monthly or Kinsenas sheet.',
      preferredPlacement: 'bottom',
    },
  ],
  'summary:4': [
    {
      id: 'summary-history-cashflow',
      targetId: 'coach-history-cashflow',
      viewLabel: 'Monthly Summary · Page 5',
      title: 'Yearly Salary vs Expenses Trend',
      whatItDoes:
        'Displays all recorded months for the active year so you can compare income versus spending at a glance.',
      whatYouCanDo:
        'Hover bars for exact monthly amounts or tap any recorded month bar to open that sheet.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'summary-history-savings',
      targetId: 'coach-history-savings',
      viewLabel: 'Monthly Summary · Page 5',
      title: 'Yearly Locked vs Liquid Savings Growth',
      whatItDoes:
        'Visualizes monthly MP2 lock-ins next to withdrawable GoTyme additions across January to December.',
      whatYouCanDo:
        'Tap any month bar to review or update that cutoff’s savings allocation.',
      preferredPlacement: 'top',
    },
  ],
  changelog: [
    {
      id: 'changelog-stats',
      targetId: 'coach-changelog-stats',
      viewLabel: 'Change Log',
      title: 'Year Audit Counters',
      whatItDoes:
        'Summarizes total edits, formula updates, renamed categories, and sheet lifecycle events recorded for the selected year.',
      whatYouCanDo:
        'Check these live counters whenever you want an instant count of workbook activity.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'changelog-search-filter',
      targetId: 'coach-changelog-search-filter',
      viewLabel: 'Change Log',
      title: 'Search & Action Type Filters',
      whatItDoes:
        'Narrows audit entries by keyword, sheet name, item label, value, or exact edit category.',
      whatYouCanDo:
        'Type any bill name or amount, or switch the Action dropdown to review only Formula Updates or Remarks Changes.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'changelog-export-clear',
      targetId: 'coach-changelog-export',
      viewLabel: 'Change Log',
      title: 'Export CSV Trail or Clear Year Log',
      whatItDoes:
        'Downloads filtered change records as a spreadsheet CSV or clears the current year’s audit history.',
      whatYouCanDo:
        'Tap Export Log (CSV) to save an offline audit backup—clearing logs never deletes your budget sheets.',
      preferredPlacement: 'bottom',
    },
    {
      id: 'changelog-table',
      targetId: 'coach-changelog-table',
      viewLabel: 'Change Log',
      title: 'Before & After Edit Ledger',
      whatItDoes:
        'Logs every modification automatically with timestamp, target sheet, row, column, old value, and new value.',
      whatYouCanDo:
        'Edit any cell or label on your Budget Sheet and return here anytime to trace exactly what changed and when.',
      preferredPlacement: 'top',
    },
  ],
};

export function hasCompletedCoachScope(scope: CoachScopeKey): boolean {
  try {
    return localStorage.getItem(`${COACH_STORAGE_PREFIX}${scope}`) === 'true';
  } catch {
    return false;
  }
}

export function markCoachScopeCompleted(scope: CoachScopeKey): void {
  try {
    localStorage.setItem(`${COACH_STORAGE_PREFIX}${scope}`, 'true');
  } catch {
    // ignore storage errors
  }
}

export function hasCompletedTabCoachTutorial(tab: ActiveTab): boolean {
  const scope: CoachScopeKey =
    tab === 'charts' ? 'charts:0' : tab === 'summary' ? 'summary:0' : tab;
  return hasCompletedCoachScope(scope);
}

export function markTabCoachTutorialCompleted(tab: ActiveTab): void {
  const scope: CoachScopeKey =
    tab === 'charts' ? 'charts:0' : tab === 'summary' ? 'summary:0' : tab;
  markCoachScopeCompleted(scope);
}

export function resetAllTabCoachTutorials(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(COACH_STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // ignore storage errors
  }
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

type ResolvedPlacement = 'top' | 'bottom' | 'left' | 'right';

interface PopoverGeometry {
  cardTop: number;
  cardLeft: number;
  cardWidth: number;
  placement: ResolvedPlacement;
  arrowOffset: number;
}

interface FeatureCoachTutorialProps {
  isOpen: boolean;
  scopeKey: CoachScopeKey | null;
  onComplete: (scope: CoachScopeKey) => void;
  onSkip: (scope: CoachScopeKey) => void;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export const FeatureCoachTutorial: React.FC<FeatureCoachTutorialProps> = ({
  isOpen,
  scopeKey,
  onComplete,
  onSkip,
}) => {
  const maskId = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const steps = useMemo(
    () => (scopeKey ? COACH_STEPS_BY_SCOPE[scopeKey] || [] : []),
    [scopeKey]
  );

  const [trackedScope, setTrackedScope] = useState<CoachScopeKey | null>(scopeKey);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [cardHeight, setCardHeight] = useState(235);

  if (scopeKey !== trackedScope) {
    setTrackedScope(scopeKey);
    setStepIndex(0);
    setTargetRect(null);
  }

  // Reset step index whenever opened or scopeKey switches
  useEffect(() => {
    if (isOpen) {
      setStepIndex(0);
      setTargetRect(null);
    }
  }, [isOpen, scopeKey]);

  const currentStep = steps[stepIndex] || null;

  // Find current step element, scroll it safely into view, and track its rect continuously
  useEffect(() => {
    if (!isOpen || !currentStep || !scopeKey) return;

    let cancelled = false;
    let missingCheckTimer: ReturnType<typeof setTimeout> | null = null;
    let rafId = 0;

    const findElement = (): HTMLElement | null => {
      try {
        return document.querySelector(
          `[data-coach-target="${CSS.escape(currentStep.targetId)}"]`
        ) as HTMLElement | null;
      } catch {
        return document.querySelector(
          `[data-coach-target="${currentStep.targetId}"]`
        ) as HTMLElement | null;
      }
    };

    const updateRect = () => {
      if (cancelled) return;
      const el = findElement();
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      setTargetRect((prev) => {
        if (
          prev &&
          Math.abs(prev.top - r.top) < 0.5 &&
          Math.abs(prev.left - r.left) < 0.5 &&
          Math.abs(prev.width - r.width) < 0.5 &&
          Math.abs(prev.height - r.height) < 0.5
        ) {
          return prev;
        }
        return {
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
          right: r.right,
          bottom: r.bottom,
        };
      });
    };

    const el = findElement();
    if (!el) {
      // Wait briefly in case swiped card content is still mounting; if still missing, advance/skip cleanly
      missingCheckTimer = setTimeout(() => {
        if (cancelled) return;
        const retryEl = findElement();
        if (!retryEl) {
          if (stepIndex < steps.length - 1) {
            setStepIndex((prev) => prev + 1);
          } else {
            markCoachScopeCompleted(scopeKey);
            onComplete(scopeKey);
          }
          return;
        }
        retryEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        updateRect();
      }, 220);
    } else {
      const vpHeight = window.visualViewport?.height || window.innerHeight;
      const vpTop = window.visualViewport?.offsetTop || 0;
      const initialRect = el.getBoundingClientRect();
      const needsScroll =
        initialRect.top < vpTop + 64 || initialRect.bottom > vpTop + vpHeight - 84;
      if (needsScroll) {
        const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
          block: 'center',
          inline: 'nearest',
        });
      }
      updateRect();

      // Track smooth scrolling frames for ~450ms so spotlight & arrow track smoothly
      const startedAt = performance.now();
      const tick = () => {
        if (cancelled) return;
        updateRect();
        if (performance.now() - startedAt < 480) {
          rafId = requestAnimationFrame(tick);
        }
      };
      rafId = requestAnimationFrame(tick);
    }

    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    window.visualViewport?.addEventListener('resize', updateRect);
    window.visualViewport?.addEventListener('scroll', updateRect);

    return () => {
      cancelled = true;
      if (missingCheckTimer) clearTimeout(missingCheckTimer);
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
      window.visualViewport?.removeEventListener('resize', updateRect);
      window.visualViewport?.removeEventListener('scroll', updateRect);
    };
  }, [isOpen, currentStep, stepIndex, steps.length, scopeKey, onComplete]);

  // Measure actual rendered card height so placement never clips viewport edges
  useLayoutEffect(() => {
    if (!isOpen || !cardRef.current) return;
    const measure = () => {
      if (cardRef.current) {
        const h = cardRef.current.offsetHeight;
        if (h > 0 && Math.abs(h - cardHeight) > 2) {
          setCardHeight(h);
        }
      }
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && cardRef.current) ro.observe(cardRef.current);
    return () => ro?.disconnect();
  }, [isOpen, stepIndex, scopeKey, cardHeight, targetRect]);

  // Keyboard shortcuts while coach tips are active
  useEffect(() => {
    if (!isOpen || !currentStep || !scopeKey) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        markCoachScopeCompleted(scopeKey);
        onSkip(scopeKey);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (stepIndex >= steps.length - 1) {
          markCoachScopeCompleted(scopeKey);
          onComplete(scopeKey);
        } else {
          setStepIndex((prev) => prev + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (stepIndex > 0) {
          setStepIndex((prev) => prev - 1);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, currentStep, stepIndex, steps.length, scopeKey, onComplete, onSkip]);

  // Compute optimal card coordinates & arrow offset pointing straight to target cell
  const geometry: PopoverGeometry | null = useMemo(() => {
    if (!targetRect || typeof window === 'undefined') return null;

    const vpW = window.visualViewport?.width || window.innerWidth;
    const vpH = window.visualViewport?.height || window.innerHeight;
    const vpTop = window.visualViewport?.offsetTop || 0;
    const vpLeft = window.visualViewport?.offsetLeft || 0;

    const edgePad = 12;
    const arrowGap = 14;
    const cardWidth = Math.min(368, Math.max(260, vpW - edgePad * 2));
    const estH = Math.min(cardHeight, vpH - edgePad * 2);

    const spaceBelow = vpTop + vpH - targetRect.bottom - edgePad;
    const spaceAbove = targetRect.top - vpTop - edgePad;
    const spaceRight = vpLeft + vpW - targetRect.right - edgePad;
    const spaceLeft = targetRect.left - vpLeft - edgePad;

    const pref = currentStep?.preferredPlacement || 'auto';
    let placement: ResolvedPlacement = 'bottom';

    if (vpW >= 768 && pref === 'right' && spaceRight >= cardWidth + arrowGap) {
      placement = 'right';
    } else if (vpW >= 768 && pref === 'left' && spaceLeft >= cardWidth + arrowGap) {
      placement = 'left';
    } else if (pref === 'top') {
      placement = spaceAbove >= estH + arrowGap || spaceAbove >= spaceBelow ? 'top' : 'bottom';
    } else {
      placement = spaceBelow >= estH + arrowGap || spaceBelow >= spaceAbove ? 'bottom' : 'top';
    }

    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    if (placement === 'bottom' || placement === 'top') {
      const cardLeft = clamp(
        targetCenterX - cardWidth / 2,
        vpLeft + edgePad,
        vpLeft + vpW - cardWidth - edgePad
      );
      const rawTop =
        placement === 'bottom'
          ? targetRect.bottom + arrowGap
          : targetRect.top - estH - arrowGap;
      const cardTop = clamp(rawTop, vpTop + edgePad, vpTop + vpH - estH - edgePad);
      const arrowOffset = clamp(targetCenterX - cardLeft, 24, cardWidth - 24);
      return { cardTop, cardLeft, cardWidth, placement, arrowOffset };
    }

    // Left / right placement
    const cardTop = clamp(
      targetCenterY - estH / 2,
      vpTop + edgePad,
      vpTop + vpH - estH - edgePad
    );
    const cardLeft =
      placement === 'right'
        ? clamp(targetRect.right + arrowGap, vpLeft + edgePad, vpLeft + vpW - cardWidth - edgePad)
        : clamp(targetRect.left - cardWidth - arrowGap, vpLeft + edgePad, vpLeft + vpW - cardWidth - edgePad);
    const arrowOffset = clamp(targetCenterY - cardTop, 24, estH - 24);
    return { cardTop, cardLeft, cardWidth, placement, arrowOffset };
  }, [targetRect, cardHeight, currentStep?.preferredPlacement]);

  if (!isOpen || !scopeKey || !currentStep || !targetRect || !geometry) {
    return null;
  }

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;
  const progressPct = Math.round(((stepIndex + 1) / steps.length) * 100);

  const cutPad = 4;
  const cutX = Math.max(0, targetRect.left - cutPad);
  const cutY = Math.max(0, targetRect.top - cutPad);
  const cutW = targetRect.width + cutPad * 2;
  const cutH = targetRect.height + cutPad * 2;

  const handleDismiss = () => {
    markCoachScopeCompleted(scopeKey);
    onSkip(scopeKey);
  };

  const handleNext = () => {
    if (isLast) {
      markCoachScopeCompleted(scopeKey);
      onComplete(scopeKey);
    } else {
      setStepIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirst) {
      setStepIndex((prev) => prev - 1);
    }
  };

  // Directional arrow anchored cleanly along the border facing the target cell
  const renderArrow = () => {
    if (geometry.placement === 'bottom') {
      return (
        <div
          aria-hidden="true"
          className="absolute -top-2 w-3.5 h-3.5 rotate-45 bg-white dark:bg-slate-900 border-t border-l border-slate-200 dark:border-slate-700"
          style={{ left: `${geometry.arrowOffset - 7}px` }}
        />
      );
    }
    if (geometry.placement === 'top') {
      return (
        <div
          aria-hidden="true"
          className="absolute -bottom-2 w-3.5 h-3.5 rotate-45 bg-slate-50 dark:bg-slate-950 border-b border-r border-slate-200 dark:border-slate-700"
          style={{ left: `${geometry.arrowOffset - 7}px` }}
        />
      );
    }
    if (geometry.placement === 'right') {
      return (
        <div
          aria-hidden="true"
          className="absolute -left-2 w-3.5 h-3.5 rotate-45 bg-white dark:bg-slate-900 border-b border-l border-slate-200 dark:border-slate-700"
          style={{ top: `${geometry.arrowOffset - 7}px` }}
        />
      );
    }
    return (
      <div
        aria-hidden="true"
        className="absolute -right-2 w-3.5 h-3.5 rotate-45 bg-white dark:bg-slate-900 border-t border-r border-slate-200 dark:border-slate-700"
        style={{ top: `${geometry.arrowOffset - 7}px` }}
      />
    );
  };

  return (
    <div
      className="fixed inset-0 z-[100] pointer-events-none select-none"
      role="dialog"
      aria-modal="true"
      aria-label={`${currentStep.viewLabel} interactive tip ${stepIndex + 1} of ${steps.length}`}
    >
      {/* Dimmed Backdrop with crisp Spotlight Cutout over Target Cell */}
      <svg
        className="fixed inset-0 w-full h-full pointer-events-auto transition-opacity duration-200"
        aria-hidden="true"
      >
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={cutX}
              y={cutY}
              width={cutW}
              height={cutH}
              rx="10"
              ry="10"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(2, 6, 23, 0.56)"
          mask={`url(#${maskId})`}
        />
      </svg>

      {/* Luminous Focus Ring around Target Cell/Control */}
      <div
        aria-hidden="true"
        className="fixed rounded-[10px] border-2 border-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.22),0_0_24px_rgba(16,185,129,0.32)] transition-all duration-200 ease-out pointer-events-none"
        style={{
          top: `${cutY}px`,
          left: `${cutX}px`,
          width: `${cutW}px`,
          height: `${cutH}px`,
        }}
      />

      {/* Modern Floating Tip Card with Directional Pointer Arrow */}
      <div
        ref={cardRef}
        className="fixed pointer-events-auto z-[102] transition-[top,left] duration-200 ease-out"
        style={{
          top: `${geometry.cardTop}px`,
          left: `${geometry.cardLeft}px`,
          width: `${geometry.cardWidth}px`,
        }}
      >
        <div className="relative bg-white dark:bg-slate-900 border border-slate-200/95 dark:border-slate-700/90 rounded-2xl shadow-[0_20px_50px_-12px_rgba(15,23,42,0.35)] dark:shadow-[0_22px_55px_-12px_rgba(0,0,0,0.75)] overflow-visible">
          {renderArrow()}

          {/* Thin Top Progress Strip */}
          <div className="h-1 w-full bg-slate-100 dark:bg-slate-800 rounded-t-2xl overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-200"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Header */}
          <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2.5">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-mono tabular-nums">
                <Sparkles className="w-3 h-3 shrink-0" />
                <span>
                  {currentStep.viewLabel} · Tip {stepIndex + 1} / {steps.length}
                </span>
              </div>
              <h3 className="text-sm sm:text-[15px] font-extrabold text-slate-900 dark:text-slate-100 leading-snug tracking-tight">
                {currentStep.title}
              </h3>
            </div>

            <button
              type="button"
              onClick={handleDismiss}
              className="w-8 h-8 -mr-1 -mt-0.5 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              title="Close tips"
              aria-label="Close tips"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body: Clear Explanation of What It Does & What You Can Do */}
          <div className="px-4 pb-3 space-y-2.5 text-xs sm:text-[13px] leading-relaxed">
            <p className="text-slate-600 dark:text-slate-300">
              {currentStep.whatItDoes}
            </p>
            <div className="bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200">
              <span className="font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide text-[10.5px] block mb-0.5">
                What you can do
              </span>
              <span>{currentStep.whatYouCanDo}</span>
            </div>
          </div>

          {/* Footer: Dots + Skip / Back / Next Controls */}
          <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950/75 border-t border-slate-100 dark:border-slate-800 rounded-b-2xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={handleDismiss}
                className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white py-1 px-1.5 rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                Skip
              </button>
              <div className="hidden xs:flex sm:flex items-center gap-1" aria-hidden="true">
                {steps.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStepIndex(idx)}
                    aria-label={`Jump to tip ${idx + 1}`}
                    className={`h-1.5 rounded-full transition-all cursor-pointer ${
                      idx === stepIndex
                        ? 'w-4 bg-emerald-600 dark:bg-emerald-400'
                        : idx < stepIndex
                        ? 'w-1.5 bg-emerald-500/45'
                        : 'w-1.5 bg-slate-300 dark:bg-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!isFirst && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                  <span>Back</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1 px-3.5 py-1.5 min-h-[34px] rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-extrabold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>{isLast ? 'Got it' : 'Next'}</span>
                {isLast ? (
                  <Check className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
