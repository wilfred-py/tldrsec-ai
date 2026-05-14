'use client';

import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { motion, AnimatePresence, useInView, useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context';
import {
  ArrowRight,
  Star,
  Archive,
  Trash2,
  MoreVertical,
  RefreshCw,
  X,
  Zap,
  BarChart3,
} from 'lucide-react';
import Link from 'next/link';
import {
  staggerContainer,
  staggerItem,
  editorialBgStyle,
} from '@/lib/animations/landing-animations';
import {
  curatedSummaries,
  type EmailSummary,
  type FinancialHighlight,
} from '@/lib/landing/gmail-mock-summaries';
import { getHeroCopy, type HeroVariant } from '@/lib/landing/copy';
import type { GlobalMinutesSaved } from '@/lib/db/landing-stats';
import { MinutesSavedCounter } from '@/components/landing/minutes-saved-counter';

// Constants for animation and layout
const INITIAL_EMAIL_COUNT = 6;
const MAX_EMAIL_COUNT = 12;
const DELIVERY_INTERVAL = 5000; // Fixed 5 second delivery when not interacting
const EMAIL_ROW_HEIGHT = 52; // Fixed height for email rows in pixels

interface GmailInboxHeroProps {
  className?: string;
  heroRef?: React.RefObject<HTMLElement>;
  /**
   * Hero copy experiment arm. Resolved server-side in `app/page.tsx` and
   * passed through `LandingPageV2`. Defaults to 'control' for direct mounts.
   * Unrecognized values fall back to 'control' inside `getHeroCopy`.
   */
  variant?: HeroVariant;
  /** Server-fetched platform-wide minutes-saved totals + projection rate. */
  globalStats?: GlobalMinutesSaved;
}

/**
 * Filing-type chip styling — editorial monochrome.
 * One uniform treatment for all filing types: hairline border, near-black
 * mono caps text, no fill. The filing-type code carries the meaning; the
 * chip stays out of the way.
 */
const FILING_BADGE_CLASS =
  'bg-transparent border border-[var(--editorial-rule)] text-[color:var(--editorial-ink)] font-[var(--font-geist-mono)] uppercase tracking-[0.05em] hover:bg-transparent';

/**
 * Get sentiment color
 */
function getSentimentColor(sentiment: string) {
  switch (sentiment) {
    case 'bullish':
      return 'text-green-600';
    case 'bearish':
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
}

/**
 * Individual email row component
 */
function EmailRow({
  email,
  index,
  isSelected,
  isChecked,
  isRead,
  isNewlyDelivered,
  isInitialLoad,
  shouldReduceMotion,
  onSelect,
  onToggleCheck,
  isInView,
  deliveryTimestamp,
  currentTime,
}: {
  email: EmailSummary;
  index: number;
  isSelected: boolean;
  isChecked: boolean;
  isRead: boolean;
  isNewlyDelivered: boolean;
  isInitialLoad: boolean;
  shouldReduceMotion: boolean | null;
  onSelect: () => void;
  onToggleCheck: (e: React.MouseEvent) => void;
  isInView: boolean;
  deliveryTimestamp: number | undefined;
  currentTime: number;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isInView) {
      // For initial load emails, show immediately (no delay needed for LCP)
      // For newly delivered emails, show immediately with animation
      // For staggered initial reveal (non-reduced-motion initial rows), use delay
      if (isInitialLoad) {
        setIsVisible(true);
      } else if (isNewlyDelivered) {
        setIsVisible(true);
      } else {
        const delay = index * 200;
        const timer = setTimeout(() => {
          setIsVisible(true);
        }, delay);
        return () => clearTimeout(timer);
      }
    }
  }, [isInView, index, isNewlyDelivered, isInitialLoad]);

  const isUnread = !isRead;

  // Determine animation based on context
  let initialAnimation: Record<string, number>;
  let visibleAnimation: Record<string, number>;

  if (isInitialLoad) {
    // Static for initial 6 rows — no animation start offset, just appear
    initialAnimation = { opacity: 1, x: 0, y: 0, scale: 1 };
    visibleAnimation = { opacity: 1, x: 0, y: 0, scale: 1 };
  } else if (isNewlyDelivered && shouldReduceMotion) {
    // Reduced motion: fade only
    initialAnimation = { opacity: 0, x: 0, y: 0, scale: 1 };
    visibleAnimation = { opacity: 1, x: 0, y: 0, scale: 1 };
  } else if (isNewlyDelivered) {
    // Drop from above for new emails
    initialAnimation = { opacity: 0, x: 0, y: -100, scale: 0.95 };
    visibleAnimation = { opacity: 1, x: 0, y: 0, scale: 1 };
  } else {
    // Slide in from distance for initial emails (non-initial-load, e.g. after refresh)
    initialAnimation = { opacity: 0, x: -120, y: 80, scale: 1 };
    visibleAnimation = { opacity: 1, x: 0, y: 0, scale: 1 };
  }

  const transition = isInitialLoad
    ? { duration: 0 }
    : shouldReduceMotion && isNewlyDelivered
    ? { duration: 0.2 }
    : {
        duration: 0.8,
        type: 'spring' as const,
        stiffness: 100,
        damping: 15,
      };

  return (
    <motion.button
      type="button"
      data-email-id={email.id}
      aria-label={`Example email summary: ${email.companyName} ${email.filingType}`}
      initial={initialAnimation}
      animate={isVisible ? visibleAnimation : initialAnimation}
      transition={transition}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onSelect}
      style={{
        height: `${EMAIL_ROW_HEIGHT}px`,
        minHeight: `${EMAIL_ROW_HEIGHT}px`,
        borderBottomColor: 'var(--editorial-rule)',
      }}
      className={`w-full flex items-center gap-2 sm:gap-3 px-2 sm:px-4 border-b cursor-pointer transition-colors duration-150 flex-shrink-0 overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--editorial-ink)] focus-visible:ring-offset-2 ${
        isSelected
          ? 'bg-stone-100 border-l-2 border-l-black'
          : isUnread
          ? 'bg-stone-50'
          : 'bg-white hover:bg-stone-50/60'
      }`}
    >
      {/* Checkbox area - responsive width */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 w-10 sm:w-14">
        <motion.div
          animate={{ scale: isHovered ? 1.1 : 1 }}
          onClick={onToggleCheck}
          className={`w-4 h-4 rounded-sm border flex items-center justify-center cursor-pointer ${
            isChecked
              ? 'bg-[color:var(--editorial-ink)] border-[color:var(--editorial-ink)]'
              : 'border-[color:var(--editorial-rule)] hover:border-[color:var(--editorial-ink-muted)]'
          }`}
        >
          {isChecked && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </motion.div>
        <motion.span
          animate={{ opacity: isHovered || email.isStarred ? 1 : 0.3 }}
          className="p-0.5 inline-flex items-center"
          aria-hidden="true"
        >
          <Star
            className={`w-4 h-4 ${email.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`}
          />
        </motion.span>
      </div>

      {/* Unread indicator — near-black dot, editorial */}
      <div className="hidden sm:flex w-3 flex-shrink-0 items-center justify-center">
        {isUnread && (
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: 'var(--editorial-ink)' }}
          />
        )}
      </div>

      {/* Ticker - responsive width, monospace for tabular feel */}
      <div className="w-12 sm:w-14 flex-shrink-0">
        <span
          className="font-[var(--font-geist-mono)] font-medium text-xs sm:text-sm uppercase"
          style={{
            color: isUnread ? 'var(--editorial-ink)' : 'var(--editorial-ink-muted)',
          }}
        >
          {email.ticker}
        </span>
      </div>

      {/* Filing Type Badge - responsive, hidden on very small screens */}
      <div className="hidden xs:block w-14 sm:w-16 flex-shrink-0">
        <Badge className={`text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0 rounded-sm ${FILING_BADGE_CLASS}`}>
          {email.filingType}
        </Badge>
      </div>

      {/* Subject & Preview - flex grow takes remaining space */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <span
          className={`text-xs sm:text-sm truncate block ${isUnread ? 'font-medium' : ''}`}
          style={{
            color: isUnread ? 'var(--editorial-ink)' : 'var(--editorial-ink-muted)',
          }}
        >
          {email.headline}
        </span>
      </div>

      {/* Time - hidden on mobile, monospace */}
      <div
        className="flex-shrink-0 font-[var(--font-geist-mono)] text-[10px] sm:text-xs w-16 sm:w-20 text-right hidden sm:block"
        style={{ color: 'var(--editorial-ink-muted)' }}
      >
        {deliveryTimestamp
          ? formatSecondsAgo(Math.floor((currentTime - deliveryTimestamp) / 1000))
          : email.timeAgo}
      </div>
    </motion.button>
  );
}

/**
 * Email detail panel component
 */
function EmailDetailPanel({
  email,
  onClose,
  isOnboarded,
}: {
  email: EmailSummary;
  onClose: () => void;
  isOnboarded: boolean;
}) {
  return (
    <div className="bg-white rounded-r-2xl flex flex-col h-full max-h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: '#F5F4F0' }}
          >
            <email.icon className="w-5 h-5 text-[color:var(--editorial-ink)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                className="font-[var(--font-geist-mono)] font-semibold uppercase"
                style={{ color: 'var(--editorial-ink)' }}
              >
                {email.ticker}
              </span>
              <Badge className={`text-[10px] px-2 py-0 rounded-sm ${FILING_BADGE_CLASS}`}>
                {email.filingType}
              </Badge>
              <span className={`text-xs font-medium ${getSentimentColor(email.sentiment)}`}>
                {email.sentiment.charAt(0).toUpperCase() + email.sentiment.slice(1)}
              </span>
            </div>
            <p className="text-sm" style={{ color: 'var(--editorial-ink-muted)' }}>
              {email.companyName}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close detail panel"
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {/* Headline */}
        <h3 className="text-lg font-semibold text-gray-900 mb-3">{email.headline}</h3>

        {/* Key Takeaway — editorial: stone fill, near-black ink */}
        <div
          className="rounded-lg p-4 mb-4"
          style={{ backgroundColor: '#F5F4F0' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4" style={{ color: 'var(--editorial-ink)' }} />
            <span
              className="text-xs font-semibold uppercase tracking-[0.08em]"
              style={{ color: 'var(--editorial-ink)' }}
            >
              Key Takeaway
            </span>
          </div>
          <p className="text-sm" style={{ color: 'var(--editorial-ink)' }}>
            {email.keyTakeaway}
          </p>
        </div>

        {/* Summary */}
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Summary</h4>
          <p className="text-sm text-gray-600 leading-relaxed">{email.summaryText}</p>
        </div>

        {/* Financial Highlights */}
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Financial Highlights</h4>
          <div className="grid grid-cols-3 gap-2">
            {email.financialHighlights.map((highlight: FinancialHighlight, idx: number) => (
              <div
                key={idx}
                className="bg-gray-50 rounded-lg p-3 text-center"
              >
                <p className="text-xs text-gray-500 mb-1">{highlight.metric}</p>
                <p className="text-sm font-bold text-gray-900">{highlight.value}</p>
                <p className="text-xs text-gray-400">{highlight.change}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Investor Impact */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-semibold text-gray-700">Investor Impact</span>
          </div>
          <p className="text-sm text-gray-600">{email.investorImpact}</p>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="flex-shrink-0 px-5 py-4 bg-gray-50 border-t border-gray-100">
        <p className="text-xs text-gray-500 mb-3 text-center">
          {isOnboarded
            ? 'This is a real AI-generated summary from your dashboard.'
            : 'This is a real AI-generated summary. Sign up to receive summaries for your portfolio.'}
        </p>
        <Link href={isOnboarded ? '/dashboard' : '/sign-up'}>
          <Button className="w-full brand-button-ink">
            {isOnboarded ? 'Go to Dashboard' : 'Get Summaries Like This'}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

/**
 * Parse date string like "Oct 28, 2025" or "Nov 4, 2025" to Date object
 */
function parseFiledAt(dateStr: string): Date {
  return new Date(dateStr);
}

/**
 * Sort emails by date descending (newest first)
 */
function sortByDateDescending(emails: EmailSummary[]): EmailSummary[] {
  return [...emails].sort((a, b) => {
    const dateA = parseFiledAt(a.filedAt);
    const dateB = parseFiledAt(b.filedAt);
    return dateB.getTime() - dateA.getTime();
  });
}

/**
 * Get fixed delivery interval (5 seconds)
 */
function getDeliveryInterval(): number {
  return DELIVERY_INTERVAL;
}

/**
 * Format seconds ago into human-readable string
 * Only updates every minute, so shows "just now" for <1 min
 */
function formatSecondsAgo(seconds: number): string {
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
}

/**
 * Gmail Inbox Hero Section
 *
 * Stacked centered layout: headline, subhead, CTAs, trust metrics,
 * widget caption, and a large centered Gmail-style inbox widget.
 * Real curated summaries that users can click to preview.
 */
export const GmailInboxHero = memo<GmailInboxHeroProps>(({ className = '', heroRef, variant, globalStats }) => {
  // Hero copy bundle for the active experiment arm. Falls back to control
  // inside getHeroCopy on any unrecognized variant value.
  const heroCopy = getHeroCopy(variant);
  const trustMetrics = heroCopy.trustMetrics;

  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.2 });
  const shouldReduceMotion = useReducedMotion();
  const [selectedEmail, setSelectedEmail] = useState<EmailSummary | null>(null);
  const [displayedEmails, setDisplayedEmails] = useState<EmailSummary[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // User authentication state from Auth context
  const { isSignedIn, isLoaded, isOnboarded } = useAuth();

  // Track read and checked (selected) emails
  const [readEmails, setReadEmails] = useState<Set<number>>(new Set());
  const [checkedEmails, setCheckedEmails] = useState<Set<number>>(new Set());

  // Track which emails were delivered dynamically (for animation)
  const [deliveredEmailIds, setDeliveredEmailIds] = useState<Set<number>>(new Set());

  // Track delivery timestamps for dynamic "x seconds ago" display
  const [deliveryTimestamps, setDeliveryTimestamps] = useState<Map<number, number>>(new Map());

  // Current time for dynamic time calculations (updates every second)
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Pool of remaining emails to deliver
  const [emailPool, setEmailPool] = useState<EmailSummary[]>([]);

  // Delivery timer ref
  const deliveryTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Focus return ref for drawer close
  const pendingFocusIdRef = useRef<string | null>(null);

  // Calculate unread count for badge
  const unreadCount = displayedEmails.filter(e => !readEmails.has(e.id)).length;

  // Close drawer with focus return
  const closeDrawer = useCallback(() => {
    pendingFocusIdRef.current = selectedEmail?.id?.toString() ?? null;
    setSelectedEmail(null);
  }, [selectedEmail]);

  // Escape key handler for drawer
  useEffect(() => {
    if (!selectedEmail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedEmail, closeDrawer]);

  // Initialize with sorted emails, start with INITIAL_EMAIL_COUNT
  useEffect(() => {
    const sorted = sortByDateDescending(curatedSummaries);
    const initial = sorted.slice(0, INITIAL_EMAIL_COUNT);
    const remaining = sorted.slice(INITIAL_EMAIL_COUNT);

    setDisplayedEmails(initial);
    setEmailPool(remaining);
  }, []);

  // Update current time every minute for dynamic "x minutes ago" display
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // Update every 60 seconds

    return () => clearInterval(timer);
  }, []);

  // Track delivered email IDs to prevent duplicates (ref for synchronous access)
  const deliveredIdsRef = useRef<Set<number>>(new Set());

  // Deliver next email from pool
  const deliverNextEmail = useCallback(() => {
    setEmailPool(prevPool => {
      if (prevPool.length === 0) return prevPool;

      const nextEmail = prevPool[0];

      // Check if already delivered (prevents duplicates from React Strict Mode)
      if (deliveredIdsRef.current.has(nextEmail.id)) {
        return prevPool;
      }

      // Mark as delivered synchronously
      deliveredIdsRef.current.add(nextEmail.id);

      // Update displayed emails - add new email to top, pushing others down
      setDisplayedEmails(prevDisplayed => {
        if (prevDisplayed.length >= MAX_EMAIL_COUNT) {
          return prevDisplayed;
        }
        // Double-check for duplicates in displayed list
        if (prevDisplayed.some(e => e.id === nextEmail.id)) {
          return prevDisplayed;
        }
        // Add to top of list (newest first)
        return [nextEmail, ...prevDisplayed];
      });

      // Mark for animation and record delivery timestamp
      setDeliveredEmailIds(prev => new Set([...prev, nextEmail.id]));
      setDeliveryTimestamps(prev => new Map(prev).set(nextEmail.id, Date.now()));

      return prevPool.slice(1);
    });
  }, []);

  // Schedule next email delivery - only delivers when summary panel is closed
  const scheduleNextDelivery = useCallback(() => {
    if (deliveryTimerRef.current) {
      clearTimeout(deliveryTimerRef.current);
    }

    const interval = getDeliveryInterval();

    deliveryTimerRef.current = setTimeout(() => {
      deliverNextEmail();
      // Schedule next delivery
      scheduleNextDelivery();
    }, interval);
  }, [deliverNextEmail]);

  // Stop delivery timer
  const stopDelivery = useCallback(() => {
    if (deliveryTimerRef.current) {
      clearTimeout(deliveryTimerRef.current);
      deliveryTimerRef.current = null;
    }
  }, []);

  // Control delivery based on view state
  // Continue delivery even when summary pane is open for dynamic feel
  useEffect(() => {
    if (isInView && emailPool.length > 0 && displayedEmails.length < MAX_EMAIL_COUNT) {
      // In view, emails remaining - start/continue delivery
      scheduleNextDelivery();
    }

    return () => {
      stopDelivery();
    };
  }, [isInView, emailPool.length, displayedEmails.length, scheduleNextDelivery, stopDelivery]);

  // Handle email click - mark as read and select
  const handleEmailClick = useCallback((email: EmailSummary) => {
    setSelectedEmail(email);
    setReadEmails(prev => new Set([...prev, email.id]));
  }, []);

  // Handle individual email checkbox toggle
  const handleToggleCheck = useCallback((emailId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent email selection
    setCheckedEmails(prev => {
      const newSet = new Set(prev);
      if (newSet.has(emailId)) {
        newSet.delete(emailId);
      } else {
        newSet.add(emailId);
      }
      return newSet;
    });
  }, []);

  // Handle select all checkbox
  const handleSelectAll = useCallback(() => {
    if (checkedEmails.size === displayedEmails.length) {
      // All selected, deselect all
      setCheckedEmails(new Set());
    } else {
      // Select all
      setCheckedEmails(new Set(displayedEmails.map(e => e.id)));
    }
  }, [checkedEmails.size, displayedEmails]);

  // Check if all emails are selected
  const allChecked = displayedEmails.length > 0 && checkedEmails.size === displayedEmails.length;
  const someChecked = checkedEmails.size > 0 && checkedEmails.size < displayedEmails.length;

  // Simulate refresh with new random emails
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    closeDrawer();
    setReadEmails(new Set());
    setCheckedEmails(new Set());
    setDeliveredEmailIds(new Set());
    setDeliveryTimestamps(new Map());

    // Reset the delivered IDs ref to allow re-delivery
    deliveredIdsRef.current = new Set();

    // Clear delivery timer
    if (deliveryTimerRef.current) {
      clearTimeout(deliveryTimerRef.current);
    }

    setTimeout(() => {
      const sorted = sortByDateDescending(curatedSummaries);
      const initial = sorted.slice(0, INITIAL_EMAIL_COUNT);
      const remaining = sorted.slice(INITIAL_EMAIL_COUNT);

      setDisplayedEmails(initial);
      setEmailPool(remaining);
      setIsRefreshing(false);

      // Restart delivery
      scheduleNextDelivery();
    }, 800);
  }, [closeDrawer, scheduleNextDelivery]);

  // Combine the heroRef with our local sectionRef
  const combinedRef = useCallback((node: HTMLElement | null) => {
    // Set our local ref
    (sectionRef as React.MutableRefObject<HTMLElement | null>).current = node;
    // Also set the parent's heroRef if provided
    if (heroRef && 'current' in heroRef) {
      (heroRef as React.MutableRefObject<HTMLElement | null>).current = node;
    }
  }, [heroRef]);

  // Extract caption logic for clarity. Strings live in lib/landing/copy.ts.
  const getCaptionText = () => {
    if (isSignedIn && !isOnboarded) return heroCopy.caption.incompleteOnboarding;
    if (!isSignedIn) return heroCopy.caption.unauth;
    return heroCopy.caption.onboarded;
  };

  return (
    <section
      ref={combinedRef}
      id="hero"
      className={`relative min-h-[100vh] flex flex-col items-center justify-center overflow-hidden pt-32 pb-12 lg:pt-40 lg:pb-8 ${className}`}
      style={editorialBgStyle}
    >
      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col items-center">
          {/* Centered Content */}
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="text-center max-w-4xl mx-auto"
          >
            {globalStats && globalStats.totalMinutes >= 1 ? (
              // Live stats counter (origin/main #496) takes the eyebrow slot when
              // the DB query returns data — stronger social proof than the static
              // "For investors and analysts" string. Falls back to the static
              // eyebrow below on DB miss / cold start.
              <motion.div
                variants={staggerItem}
                role="status"
                aria-label={`${Math.round(globalStats.totalMinutes).toLocaleString()} minutes of reading saved across all investors using tldrSEC`}
                className="mb-5 text-center text-[13px]"
              >
                <span aria-hidden="true">
                  <span className="font-semibold text-[color:var(--editorial-ink)]">
                    Reading time saved across all investors:
                  </span>{' '}
                  <span className="text-[color:var(--editorial-ink-muted)]">
                    <MinutesSavedCounter
                      anchorMinutes={globalStats.totalMinutes}
                      ratePerSecond={globalStats.ratePerSecond}
                    />{' '}
                    minutes
                  </span>
                </span>
              </motion.div>
            ) : (
              <motion.p
                variants={staggerItem}
                className="mb-5 text-center text-[12px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: 'var(--editorial-ink-muted)' }}
              >
                {heroCopy.eyebrow}
              </motion.p>
            )}

            <motion.h1 variants={staggerItem} className="brand-hero-display-serif mb-6 text-center">
              {heroCopy.h1.parts.map((part, i) =>
                part.gradient ? (
                  <span key={i} className="editorial-accent">{part.text}</span>
                ) : (
                  <span key={i}>{part.text}</span>
                )
              )}
            </motion.h1>

            <motion.p variants={staggerItem} className="brand-body-large mb-7 max-w-2xl mx-auto text-center">
              {heroCopy.subhead}
            </motion.p>

            {!isOnboarded && (
              <motion.div
                variants={staggerItem}
                className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6"
              >
                {!isLoaded ? (
                  <Skeleton className="h-11 w-48 rounded-lg" />
                ) : isSignedIn ? (
                  <Link href="/onboarding">
                    <Button className="brand-button-ink">
                      {heroCopy.ctaButton.incompleteOnboarding}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                ) : (
                  <Link href="/sign-up">
                    <Button className="brand-button-ink">
                      {heroCopy.ctaButton.unauth}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                )}
              </motion.div>
            )}

            <motion.p variants={staggerItem} className="brand-caption mb-8">
              {getCaptionText()}
            </motion.p>

            <motion.div
              variants={staggerItem}
              className="flex flex-row items-stretch justify-center mb-20 mx-auto"
            >
              {trustMetrics.map((metric, idx) => (
                <div
                  key={metric.label}
                  className={`flex flex-col items-center px-6 sm:px-10 ${
                    idx > 0 ? 'border-l' : ''
                  }`}
                  style={idx > 0 ? { borderColor: 'var(--editorial-rule)' } : undefined}
                >
                  <span
                    className="font-[var(--font-geist-mono)] text-base sm:text-lg font-medium tabular-nums"
                    style={{ color: 'var(--editorial-ink)' }}
                  >
                    {metric.value}
                  </span>
                  <span
                    className="text-[10px] sm:text-[11px] uppercase tracking-[0.12em] mt-1"
                    style={{ color: 'var(--editorial-ink-muted)' }}
                  >
                    {metric.label}
                  </span>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* SR-only heading for accessibility */}
          <h2 className="sr-only">Product demo inbox</h2>

          {/* Inbox Widget — editorial chrome, centered, capped width */}
          <div className="w-full px-0 sm:px-4 md:px-0 md:max-w-[min(90vw,1100px)] md:mx-auto">
            <motion.div
              ref={containerRef}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="relative"
            >
              <motion.div
                className="bg-white rounded-lg shadow-sm overflow-hidden relative"
                style={{
                  width: '100%',
                  maxWidth: '1100px',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: 'var(--editorial-rule)',
                }}
              >
                {/* Widget header — editorial: small mono label + indicator dot + mono "new" pill */}
                <div
                  className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3 border-b"
                  style={{ borderColor: 'var(--editorial-rule)', backgroundColor: '#FAFAF7' }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: 'var(--editorial-ink)' }}
                      aria-hidden="true"
                    />
                    <span
                      className="font-[var(--font-geist-mono)] text-[11px] sm:text-xs uppercase tracking-[0.08em]"
                      style={{ color: 'var(--editorial-ink-muted)' }}
                    >
                      tldrsec.com / inbox
                    </span>
                  </div>
                  <div className="flex-grow" />
                  {unreadCount > 0 && (
                    <span
                      className="font-[var(--font-geist-mono)] text-[10px] sm:text-[11px] uppercase tracking-[0.08em] px-2 py-0.5 rounded"
                      style={{
                        color: 'var(--editorial-ink)',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: 'var(--editorial-rule)',
                      }}
                    >
                      {unreadCount} new
                    </span>
                  )}
                </div>

                {/* Toolbar — editorial: muted icons, mono pagination counter */}
                <div
                  className="flex items-center gap-1 sm:gap-2 px-3 sm:px-5 py-2 border-b"
                  style={{ borderColor: 'var(--editorial-rule)', backgroundColor: '#FAFAF7' }}
                >
                  {/* Master checkbox */}
                  <button
                    onClick={handleSelectAll}
                    className="p-1 sm:p-1.5 rounded hover:bg-stone-200/60 transition-colors flex items-center justify-center"
                    title={allChecked ? 'Deselect all' : 'Select all'}
                  >
                    <div
                      className={`w-4 h-4 rounded-sm border flex items-center justify-center cursor-pointer ${
                        allChecked
                          ? 'bg-[color:var(--editorial-ink)] border-[color:var(--editorial-ink)]'
                          : someChecked
                          ? 'bg-stone-300 border-[color:var(--editorial-ink-muted)]'
                          : 'border-[color:var(--editorial-rule)] hover:border-[color:var(--editorial-ink-muted)]'
                      }`}
                    >
                      {allChecked && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {someChecked && !allChecked && (
                        <div className="w-2 h-0.5 bg-[color:var(--editorial-ink)] rounded" />
                      )}
                    </div>
                  </button>

                  <motion.button
                    onClick={handleRefresh}
                    animate={{ rotate: isRefreshing ? 360 : 0 }}
                    transition={{ duration: 0.8 }}
                    className="p-1 sm:p-1.5 rounded hover:bg-stone-200/60 transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className="w-4 h-4" style={{ color: 'var(--editorial-ink-muted)' }} />
                  </motion.button>
                  <button className="hidden sm:block p-1.5 rounded hover:bg-stone-200/60 transition-colors" title="Archive">
                    <Archive className="w-4 h-4" style={{ color: 'var(--editorial-ink-muted)' }} />
                  </button>
                  <button className="hidden sm:block p-1.5 rounded hover:bg-stone-200/60 transition-colors" title="Delete">
                    <Trash2 className="w-4 h-4" style={{ color: 'var(--editorial-ink-muted)' }} />
                  </button>
                  <div
                    className="hidden sm:block h-5 w-px mx-1"
                    style={{ backgroundColor: 'var(--editorial-rule)' }}
                  />
                  <button className="p-1 sm:p-1.5 rounded hover:bg-stone-200/60 transition-colors" title="More options">
                    <MoreVertical className="w-4 h-4" style={{ color: 'var(--editorial-ink-muted)' }} />
                  </button>
                  <div className="flex-grow" />
                  <span
                    className="font-[var(--font-geist-mono)] text-[10px] sm:text-[11px]"
                    style={{ color: 'var(--editorial-ink-muted)' }}
                  >
                    1-{displayedEmails.length} of {curatedSummaries.length}
                  </span>
                </div>

                {/* Email List & Detail Overlay */}
                <div
                  className="relative flex overflow-hidden"
                  style={{
                    height: 'clamp(380px, 60svh, 600px)',
                  }}
                >
                  {/* Email List - Always full width, never shrinks */}
                  <div
                    className="w-full overflow-y-auto"
                    onClick={(e) => {
                      // Close summary pane if clicking on empty area (not on an email row)
                      if (e.target === e.currentTarget) {
                        closeDrawer();
                      }
                    }}
                  >
                    <AnimatePresence mode="wait">
                      {isRefreshing ? (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="w-full"
                        >
                          {/* Skeleton loading rows - responsive */}
                          {Array.from({ length: INITIAL_EMAIL_COUNT }).map((_, index) => (
                            <div
                              key={index}
                              style={{ height: `${EMAIL_ROW_HEIGHT}px` }}
                              className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 border-b border-gray-100 animate-pulse"
                            >
                              {/* Checkbox skeleton */}
                              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 w-10 sm:w-14">
                                <div className="w-4 h-4 rounded bg-gray-200" />
                                <div className="w-4 h-4 rounded bg-gray-200" />
                              </div>
                              {/* Unread dot skeleton - hidden on mobile */}
                              <div className="hidden sm:block w-3 flex-shrink-0" />
                              {/* Ticker skeleton */}
                              <div className="w-12 sm:w-14 flex-shrink-0">
                                <div className="w-10 h-4 rounded bg-gray-200" />
                              </div>
                              {/* Badge skeleton - hidden on very small screens */}
                              <div className="hidden xs:block w-14 sm:w-16 flex-shrink-0">
                                <div className="w-12 h-5 rounded-full bg-gray-200" />
                              </div>
                              {/* Subject skeleton */}
                              <div className="flex-1 min-w-0">
                                <div className="h-4 rounded bg-gray-200" style={{ width: `${60 + index * 10}%` }} />
                              </div>
                              {/* Time skeleton - hidden on mobile */}
                              <div className="flex-shrink-0 w-16 sm:w-20 hidden sm:block">
                                <div className="w-14 sm:w-16 h-3 rounded bg-gray-200 ml-auto" />
                              </div>
                            </div>
                          ))}
                        </motion.div>
                      ) : (
                        displayedEmails.map((email, index) => (
                          <EmailRow
                            key={email.id}
                            email={email}
                            index={index}
                            isSelected={selectedEmail?.id === email.id}
                            isChecked={checkedEmails.has(email.id)}
                            isRead={readEmails.has(email.id)}
                            isNewlyDelivered={deliveredEmailIds.has(email.id)}
                            isInitialLoad={index < INITIAL_EMAIL_COUNT && !deliveredEmailIds.has(email.id)}
                            shouldReduceMotion={shouldReduceMotion}
                            onSelect={() => handleEmailClick(email)}
                            onToggleCheck={(e) => handleToggleCheck(email.id, e)}
                            isInView={isInView}
                            deliveryTimestamp={deliveryTimestamps.get(email.id)}
                            currentTime={currentTime}
                          />
                        ))
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Detail Panel — responsive widths */}
                  <AnimatePresence onExitComplete={() => {
                    const id = pendingFocusIdRef.current;
                    if (id) {
                      document.querySelector<HTMLButtonElement>(`[data-email-id="${id}"]`)?.focus();
                      pendingFocusIdRef.current = null;
                    }
                  }}>
                    {selectedEmail && (
                      <motion.div
                        initial={{ x: '100%', opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '100%', opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="absolute inset-y-0 right-0 w-[88%] sm:w-[85%] md:w-[75%] lg:w-[65%] bg-white z-10 shadow-xl border-l border-gray-200 overflow-hidden"
                      >
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={selectedEmail.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="h-full"
                          >
                            <EmailDetailPanel
                              email={selectedEmail}
                              onClose={closeDrawer}
                              isOnboarded={isOnboarded}
                            />
                          </motion.div>
                        </AnimatePresence>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Footer — editorial: muted caption, hairline top border */}
                <div
                  className="px-3 sm:px-5 py-2.5 sm:py-3 border-t flex items-center gap-2"
                  style={{ borderColor: 'var(--editorial-rule)', backgroundColor: '#FAFAF7' }}
                >
                  <span
                    className="text-[10px] sm:text-xs truncate"
                    style={{ color: 'var(--editorial-ink-muted)' }}
                  >
                    {heroCopy.widgetCaption}
                  </span>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
});

GmailInboxHero.displayName = 'GmailInboxHero';
