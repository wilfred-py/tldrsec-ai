'use client';

import { useState, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Confetti } from '@/components/ui/confetti';
import { toast } from 'sonner';
import { updateTutorialProgress } from '@/components/onboarding/actions';
import {
  List,
  Settings,
  Trash2,
  Mail,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';

interface TutorialGuideProps {
  active: boolean;
  onComplete: () => void;
  initialStep?: number;
  initialProgress?: number;
  tickerLimit?: number;
}

interface StepDef {
  title: string;
  description: string;
  selector: string;
  icon: React.ReactNode;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  circular?: boolean;
}

export function TutorialGuide({
  active,
  onComplete,
  initialStep = 0,
  tickerLimit = 3,
}: TutorialGuideProps) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [progress, setProgress] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  // Track window dimensions for SVG viewport
  const [windowSize, setWindowSize] = useState({ w: 0, h: 0 });

  // Initialize and track window size
  useEffect(() => {
    const update = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const tickerLimitText = tickerLimit === -1
    ? "unlimited companies"
    : `up to ${tickerLimit} companies on your current plan`;

  const tutorialSteps: StepDef[] = useMemo(() => [
    {
      title: "Add Tickers",
      description: `Click the 'Add Ticker' button to start tracking a company's SEC filings. You can track ${tickerLimitText}.`,
      selector: '[data-tutorial="add-ticker"]',
      icon: <List className="h-5 w-5" />,
      position: 'bottom',
    },
    {
      title: "Manage Preferences",
      description: "Click the settings icon to customize which filing types you receive notifications for — 10-K, 10-Q, 8-K, and more.",
      selector: '[data-tutorial="ticker-preferences"]',
      icon: <Settings className="h-5 w-5" />,
      position: 'left',
      circular: true,
    },
    {
      title: "Remove Companies",
      description: "Use the trash icon to remove companies you no longer want to track. You can always add them back later.",
      selector: '[data-tutorial="delete-ticker"]',
      icon: <Trash2 className="h-5 w-5" />,
      position: 'left',
      circular: true,
    },
    {
      title: "Email Summaries",
      description: "You'll receive AI-powered summaries of SEC filings for your tracked companies directly to your email. We'll send you the most relevant summaries shortly!",
      selector: '.tutorial-highlight-placeholder',
      icon: <Mail className="h-5 w-5" />,
      position: 'center',
    }
  ], [tickerLimitText]);

  const totalSteps = tutorialSteps.length;
  const step = tutorialSteps[currentStep];
  const isCenter = step?.position === 'center';
  const isCircular = step?.circular ?? false;

  // Find and track the target element's rect (runs before browser paint)
  useLayoutEffect(() => {
    if (!isActive || !step) {
      setTargetRect(null);
      return;
    }

    if (step.selector === '.tutorial-highlight-placeholder') {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [isActive, currentStep, step]);

  // Update rect on resize/scroll
  useEffect(() => {
    if (!isActive || !step || step.selector === '.tutorial-highlight-placeholder') return;

    const update = () => {
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (el) setTargetRect(el.getBoundingClientRect());
    };

    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [isActive, currentStep, step]);

  // Calculate tooltip position close to the highlighted element
  const tooltipPosition = useMemo((): { top: string; left: string; transform?: string } => {
    if (typeof window === 'undefined') return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tw = vw < 640 ? Math.min(vw * 0.9, 350) : 350;
    const th = 200;
    const pad = 16;

    if (!targetRect) {
      // Use CSS transform centering for the center step (no estimate needed)
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }

    const pos = step?.position || 'bottom';
    let top: number, left: number;

    switch (pos) {
      case 'bottom':
        top = Math.min(vh - th - pad, targetRect.bottom + 12);
        left = Math.max(pad, Math.min(vw - tw - pad, targetRect.left + targetRect.width / 2 - tw / 2));
        if (top + th > vh - pad * 2) {
          top = Math.max(pad, targetRect.top - th - 12);
        }
        break;
      case 'left':
        top = Math.max(pad, Math.min(vh - th - pad, targetRect.top + targetRect.height / 2 - th / 2));
        left = Math.max(pad, targetRect.left - tw - 12);
        if (left < pad) {
          left = Math.min(vw - tw - pad, targetRect.right + 12);
        }
        break;
      case 'right':
        top = Math.max(pad, Math.min(vh - th - pad, targetRect.top + targetRect.height / 2 - th / 2));
        left = Math.min(vw - tw - pad, targetRect.right + 12);
        if (left + tw > vw - pad) {
          left = Math.max(pad, targetRect.left - tw - 12);
        }
        break;
      case 'top':
        top = Math.max(pad, targetRect.top - th - 12);
        left = Math.max(pad, Math.min(vw - tw - pad, targetRect.left + targetRect.width / 2 - tw / 2));
        if (top < pad * 2) {
          top = Math.min(vh - th - pad, targetRect.bottom + 12);
        }
        break;
      default:
        top = (vh - th) / 2;
        left = (vw - tw) / 2;
    }

    return { top: `${top}px`, left: `${left}px` };
  }, [targetRect, step]);

  const handleNextStep = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, totalSteps]);

  const handlePrevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const completeTutorial = useCallback(async () => {
    try {
      // Immediately show confetti and hide overlay + tooltip
      setTargetRect(null);
      setShowConfetti(true);

      const result = await updateTutorialProgress(100, {
        currentStep: currentStep,
        currentSubstep: 0,
        completed: true
      });

      if (!result.success) {
        console.error('Failed to update tutorial progress:', result.error);
        toast.error('Failed to save your progress');
      }

      // Fire-and-forget: deliver cached summaries
      fetch('/api/onboarding?action=deliver-summaries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(err => {
        console.error('Failed to deliver cached summaries:', err);
      });

      // Send welcome email in the background
      fetch('/api/onboarding?action=welcome-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: {} })
      }).catch(err => {
        console.error('Failed to send welcome email:', err);
      });

      // Hide tutorial after confetti (5s)
      setTimeout(() => {
        setIsActive(false);
        onComplete();
      }, 5000);
    } catch (error) {
      console.error('Error completing tutorial:', error);
      toast.error('Something went wrong. Please try again.');
    }
  }, [currentStep, onComplete]);

  // Sync active prop
  useEffect(() => {
    setIsActive(active);
  }, [active]);

  // Persist progress
  useEffect(() => {
    const newProgress = Math.round(((currentStep + 1) / totalSteps) * 100);
    setProgress(newProgress);

    localStorage.setItem('tutorialProgress', JSON.stringify({
      currentStep,
      progress: newProgress,
    }));

    updateTutorialProgress(newProgress, {
      currentStep,
      currentSubstep: 0,
      completed: false,
    }).catch((error) => {
      console.error('Failed to update tutorial progress:', error);
    });
  }, [currentStep, totalSteps]);

  if (!isActive) return null;

  const isLastStep = currentStep === totalSteps - 1;
  const showOverlay = !showConfetti;
  const showTooltip = !showConfetti && (isCenter || targetRect);

  // SVG cutout dimensions
  const cutoutPad = 8;
  const cutout = targetRect ? {
    x: targetRect.left - cutoutPad,
    y: targetRect.top - cutoutPad,
    w: targetRect.width + cutoutPad * 2,
    h: targetRect.height + cutoutPad * 2,
    cx: targetRect.left + targetRect.width / 2,
    cy: targetRect.top + targetRect.height / 2,
    r: Math.max(targetRect.width, targetRect.height) / 2 + cutoutPad,
  } : null;

  const vw = windowSize.w;
  const vh = windowSize.h;

  return (
    <>
      {/* SVG overlay with spotlight cutout - disappears immediately on confetti */}
      {showOverlay && vw > 0 && (
        <svg
          width={vw}
          height={vh}
          viewBox={`0 0 ${vw} ${vh}`}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            zIndex: 9998,
            pointerEvents: 'auto',
            margin: 0,
            padding: 0,
          }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <defs>
            <mask id="tutorial-spotlight">
              {/* White = overlay visible, Black = cutout (transparent) */}
              <rect x={0} y={0} width={vw} height={vh} fill="white" />
              {cutout && (isCircular ? (
                <circle cx={cutout.cx} cy={cutout.cy} r={cutout.r} fill="black" />
              ) : (
                <rect x={cutout.x} y={cutout.y} width={cutout.w} height={cutout.h} rx={10} fill="black" />
              ))}
            </mask>
            <linearGradient id="brand-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0079F2" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </linearGradient>
          </defs>

          {/* Dark overlay with cutout hole */}
          <rect x={0} y={0} width={vw} height={vh} fill="rgba(0,0,0,0.5)" mask="url(#tutorial-spotlight)" />

          {/* Brand-colored ring around the cutout */}
          {cutout && (isCircular ? (
            <circle
              cx={cutout.cx} cy={cutout.cy} r={cutout.r}
              fill="none" stroke="url(#brand-ring-gradient)" strokeWidth="3"
            >
              <animate attributeName="stroke-width" values="3;5;3" dur="2s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.8;0.4;0.8" dur="2s" repeatCount="indefinite" />
            </circle>
          ) : (
            <rect
              x={cutout.x} y={cutout.y} width={cutout.w} height={cutout.h} rx={10}
              fill="none" stroke="url(#brand-ring-gradient)" strokeWidth="3"
            >
              <animate attributeName="stroke-width" values="3;5;3" dur="2s" repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.8;0.4;0.8" dur="2s" repeatCount="indefinite" />
            </rect>
          ))}
        </svg>
      )}

      {/* Tutorial tooltip */}
      {showTooltip && (
        <div
          className="fixed z-[10000] bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl shadow-2xl w-[90vw] sm:w-[350px] max-w-[350px] p-4"
          style={tooltipPosition}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-full" style={{ background: 'linear-gradient(135deg, #0079F2, #8B5CF6)' }}>
              <span className="text-white">{step?.icon || <List className="h-5 w-5" />}</span>
            </div>
            <h3 className="font-semibold text-sm">{step?.title || 'Tutorial'}</h3>
          </div>

          {/* Progress bar */}
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1 text-muted-foreground">
              <span>Step {currentStep + 1} of {totalSteps}</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} variant="brand" className="h-1" />
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground mb-4">
            {step?.description || 'Learn how to use tldrSEC effectively.'}
          </p>

          {/* Navigation */}
          <div className="flex justify-between">
            {isLastStep ? (
              <>
                <Button variant="outline" size="sm" onClick={handlePrevStep} className="gap-1">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  size="sm"
                  onClick={completeTutorial}
                  className="gap-1 text-white"
                  style={{ background: 'linear-gradient(135deg, #0079F2, #8B5CF6)' }}
                >
                  Complete Tutorial
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={handlePrevStep} disabled={currentStep === 0} className="gap-1">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button
                  size="sm"
                  onClick={handleNextStep}
                  className="gap-1 text-white"
                  style={{ background: 'linear-gradient(135deg, #0079F2, #8B5CF6)' }}
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confetti */}
      <Confetti active={showConfetti} duration={3000} />
    </>
  );
}
