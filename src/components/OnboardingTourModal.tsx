/**
 * @file OnboardingTourModal.tsx
 * @description Interactive step-by-step walkthrough tour for new users (and replayable anytime from Settings).
 */

import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CloudUpload,
  Filter,
  Keyboard,
  Layers,
  Sparkles,
  WifiOff,
  X,
} from 'lucide-react';

export const TOUR_COMPLETED_KEY = 'pesobudget_tour_completed_v1';

export function hasCompletedOnboardingTour(): boolean {
  try {
    return localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markOnboardingTourCompleted(): void {
  try {
    localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
  } catch {
    // ignore storage errors
  }
}

interface TourStep {
  id: string;
  badge: string;
  title: string;
  description: string;
  highlights: string[];
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    badge: 'Welcome to PesoBudget',
    title: 'Dual-Cutoff Payroll & Budget Workspace',
    description:
      'Built for Monthly and 15th Kinsenas pay cycles. Track physical cash obligations (Metrobank), digital transfers (QR PH), long-term locked savings (MP2), withdrawable savings (GoTyme / custom), and your live ending balance.',
    highlights: [
      'Automatic formula flow: (SALARY - Total) - (MP2 + Withdrawable) = BALANCE',
      'Keeps locked MP2 savings and withdrawable savings separated accurately',
      'Dark mode enabled by default with instant Light/Dark toggle in the top bar',
    ],
    icon: Sparkles,
    accentClass: 'bg-emerald-600 text-white',
  },
  {
    id: 'shortcuts',
    badge: 'Speed & Precision',
    title: 'Inline Editing & Instant Ctrl+Z / Ctrl+Y Undo',
    description:
      'Tap any cell once to reveal quick actions, or navigate rapidly using Arrow keys and Tab. Start any numeric cell with "=" (e.g., =1250+450) for live spreadsheet math.',
    highlights: [
      'Press Enter or F2 (or double-click) to edit amounts, labels, and column titles',
      'Press Ctrl+Z anytime to Undo edits and Ctrl+Y (or Cmd+Shift+Z) to Redo',
      'Add custom rows, reorder bills, merge/unmerge cutoffs, and attach cell sticky notes',
    ],
    icon: Keyboard,
    accentClass: 'bg-sky-600 text-white',
  },
  {
    id: 'remarks',
    badge: 'Bill Settlement',
    title: 'Remarks Filter Strip & Quick Settle',
    description:
      'Filter bills cleanly using the centered All, Settled, Deferred, and Unset chips above the table while summary totals stay visible below.',
    highlights: [
      'Use Settled when paid, Deferred to carry bills to next payroll, or Clear (—)',
      'Tap "Settle Unset" to mark all unpaid cash bills with amounts as Settled in one click',
      'Deferred bills automatically offer carryover when creating a Clean Default sheet',
    ],
    icon: Filter,
    accentClass: 'bg-teal-600 text-white',
  },
  {
    id: 'dynamic-labels',
    badge: 'Dynamic Personalization',
    title: 'Rename Any Category — Updates Everywhere',
    description:
      'Every user manages money differently. Click any label under PAYMENTS (for example, renaming GoTyme to MariBank or Lazada to Shopee) to customize it.',
    highlights: [
      'Monthly Summary cards update automatically to show your custom category name',
      'Charts, Historical Progression curves, Printable PDFs, and Excel exports all follow',
      'Even the top live KPI strip reflects your customized bank and balance names',
    ],
    icon: Layers,
    accentClass: 'bg-violet-600 text-white',
  },
  {
    id: 'offline-security',
    badge: 'Offline & Cloud Sync',
    title: 'Works Fully Offline with Strict Gmail Verification',
    description:
      'Access the app anytime — even with zero internet connection. Every offline change is logged locally and never overwritten silently when connectivity returns.',
    highlights: [
      'When back online, you decide whether to upload your offline edits or discard them',
      'Signing in with Google in Settings sends a strict 6-digit verification code to Gmail',
      'Background monitor checks the public web link status and notifies you at the top',
    ],
    icon: WifiOff,
    accentClass: 'bg-amber-600 text-white',
  },
];

interface OnboardingTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}

export const OnboardingTourModal: React.FC<OnboardingTourModalProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
}) => {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setStepIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        markOnboardingTourCompleted();
        onClose();
      } else if (e.key === 'ArrowRight') {
        setStepIndex((prev) => Math.min(TOUR_STEPS.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        setStepIndex((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const step = TOUR_STEPS[stepIndex] || TOUR_STEPS[0];
  const StepIcon = step.icon;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const progressPercent = Math.round(((stepIndex + 1) / TOUR_STEPS.length) * 100);

  const handleFinish = () => {
    markOnboardingTourCompleted();
    onClose();
  };

  return (
    <div
      className="pb-modal-backdrop z-[110] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200 p-3 sm:p-4"
      onClick={handleFinish}
    >
      <div
        className="pb-modal-card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-w-lg lg:max-w-xl w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="PesoBudget Quick Tour"
      >
        {/* Top Progress Strip */}
        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 shrink-0">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0 ${step.accentClass}`}>
              <StepIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Step {stepIndex + 1} of {TOUR_STEPS.length} · {step.badge}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight truncate">
                {step.title}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={handleFinish}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            title="Skip Tour"
            aria-label="Skip Tour"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-slate-700 dark:text-slate-300 flex-1 min-h-0">
          <p className="text-xs sm:text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {step.description}
          </p>

          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3.5 space-y-2.5">
            {step.highlights.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-[13px] leading-snug">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-slate-800 dark:text-slate-200 font-medium">{item}</span>
              </div>
            ))}
          </div>

          {/* Step Dots Indicator */}
          <div className="flex items-center justify-center gap-1.5 pt-1">
            {TOUR_STEPS.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStepIndex(idx)}
                aria-label={`Go to step ${idx + 1}: ${s.title}`}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  idx === stepIndex
                    ? 'w-7 bg-emerald-500'
                    : idx < stepIndex
                      ? 'w-2 bg-emerald-500/40'
                      : 'w-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/70 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleFinish}
            className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors"
          >
            Skip Tour
          </button>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}

            {isLast ? (
              <div className="flex items-center gap-2">
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      handleFinish();
                      onOpenSettings();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/70 text-xs font-bold text-emerald-700 dark:text-emerald-300 cursor-pointer transition-colors"
                  >
                    <CloudUpload className="w-3.5 h-3.5" />
                    <span>Connect Google</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleFinish}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-sm cursor-pointer transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Start Budgeting</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setStepIndex((prev) => Math.min(TOUR_STEPS.length - 1, prev + 1))}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-xs font-extrabold shadow-sm cursor-pointer transition-colors"
              >
                <span>Next</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
