/**
 * Event taxonomy — single source of truth for PostHog events.
 *
 * Shared between client (lib/hooks/use-analytics.ts) and server
 * (lib/analytics/posthog-server.ts). One rename updates both sides.
 *
 * Focus: events autocapture CANNOT handle cleanly.
 * - Structured properties (plan name, billing period)
 * - Server-side conversions (Stripe webhook)
 * - Domain events that don't map to a single DOM action
 */

export const EVENTS = {
  // Landing / acquisition
  LANDING_CTA_CLICK: 'landing_cta_click',
  PRICING_PLAN_SELECTED: 'pricing_plan_selected',

  // Sign-up funnel (between /sign-up $pageview and $identify after Clerk completes)
  // These close the visibility gap: $pageview tells us they arrived, but the
  // Clerk widget runs in our DOM and previously fired no telemetry until success.
  SIGNUP_PAGE_ARRIVED: 'signup_page_arrived',
  SIGNUP_WIDGET_RENDERED: 'signup_widget_rendered',
  SIGNUP_EMAIL_ENTERED: 'signup_email_entered',
  SIGNUP_PASSWORD_ENTERED: 'signup_password_entered',
  SIGNUP_SUBMITTED: 'signup_submitted',
  SIGNUP_FAILED: 'signup_failed',

  // Onboarding funnel
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_COMPLETED: 'onboarding_completed',

  // Conversion funnel
  CHECKOUT_INITIATED: 'checkout_initiated',
  CHECKOUT_COMPLETED: 'checkout_completed',
  TRIAL_STARTED: 'trial_started',
  TRIAL_CONVERTED: 'trial_converted',

  // Founding Lifetime Seat cohort (one-time payment; see ADR-0004)
  LIFETIME_SEAT_CLAIMED: 'lifetime_seat_claimed',
  LIFETIME_SEAT_REVOKED: 'lifetime_seat_revoked',

  // Engagement
  SUMMARY_VIEWED: 'summary_viewed',
  FILING_CHAT_MESSAGE_SENT: 'filing_chat_message_sent',
  EMAIL_CTA_CLICKED: 'email_cta_clicked',

  // Email lifecycle (Resend webhook → PostHog)
  EMAIL_SENT: 'email_sent',
  EMAIL_OPENED: 'email_opened',
  EMAIL_CLICKED: 'email_clicked',
  EMAIL_BOUNCED: 'email_bounced',
  EMAIL_COMPLAINED: 'email_complained',
  UNSUBSCRIBE_COMPLETED: 'unsubscribe_completed',

  // Operational telemetry — single carrier event for monitoring metrics that
  // need PostHog dashboards (see lib/monitoring/index.ts allowlist + bridge).
  // Filter in PostHog by `event = monitoring_metric` and `properties.metric`.
  MONITORING_METRIC: 'monitoring_metric',
} as const;

export type EventName = typeof EVENTS[keyof typeof EVENTS];

export type BillingPeriod = 'monthly' | 'annual';
export type PlanTier = 'free' | 'starter' | 'pro' | 'max';

/**
 * Per-event property shapes. Keys are event names (values of EVENTS).
 * The generic trackEvent<E>(event, props) enforces correct props per event.
 */
export type EventProps = {
  [EVENTS.LANDING_CTA_CLICK]: {
    cta_location: 'hero' | 'pricing' | 'cta_section' | 'nav' | 'footer';
    cta_text?: string;
    variant?: string;
  };
  [EVENTS.PRICING_PLAN_SELECTED]: {
    plan: PlanTier;
    billing_period: BillingPeriod;
  };
  [EVENTS.SIGNUP_PAGE_ARRIVED]: {
    // Subscriber id from campaign email links (?sub=<id>)
    sub?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    plan?: string;
    ref?: string;
    referer?: string;
    user_agent?: string;
    // Optional sub-route segment for the [[...sign-up]] catch-all (e.g. "verify-email",
    // "sso-callback"). Undefined on the initial /sign-up arrival.
    sub_route?: string;
  };
  [EVENTS.SIGNUP_WIDGET_RENDERED]: {
    // Time from page hydration to Clerk form being present in the DOM.
    time_to_render_ms: number;
  };
  [EVENTS.SIGNUP_EMAIL_ENTERED]: Record<string, never>;
  [EVENTS.SIGNUP_PASSWORD_ENTERED]: Record<string, never>;
  [EVENTS.SIGNUP_SUBMITTED]: {
    // True if both email and password fields had been touched before submit.
    // Lets us split bot-style submit-without-typing from real form fills.
    email_entered: boolean;
    password_entered: boolean;
  };
  [EVENTS.SIGNUP_FAILED]: {
    // Trimmed error text shown by Clerk. Truncated to 200 chars to avoid PII overflow.
    error_message?: string;
  };
  [EVENTS.ONBOARDING_STEP_COMPLETED]: {
    step_name: 'profile' | 'sectors' | 'companies' | 'confirm' | 'email' | 'tutorial';
    step_index: number;
    duration_ms: number;
  };
  [EVENTS.ONBOARDING_COMPLETED]: {
    total_duration_ms: number;
    companies_count: number;
    sectors_count: number;
    variant: 'step4-polished';
    step_count: 4;
    email_frequency: 'IMMEDIATE' | 'DAILY' | 'NONE';
    ticker_count: number;
    duration_ms: number;
  };
  [EVENTS.CHECKOUT_INITIATED]: {
    plan: PlanTier;
    billing_period: BillingPeriod;
    source?: string;
  };
  [EVENTS.CHECKOUT_COMPLETED]: {
    plan: PlanTier;
    billing_period: BillingPeriod;
    amount_cents: number;
    currency: string;
  };
  [EVENTS.TRIAL_STARTED]: {
    plan: PlanTier;
  };
  [EVENTS.TRIAL_CONVERTED]: {
    plan: PlanTier;
    billing_period: BillingPeriod;
  };
  [EVENTS.LIFETIME_SEAT_CLAIMED]: {
    amount_cents: number;
    currency: string;
    batch?: string;
  };
  [EVENTS.LIFETIME_SEAT_REVOKED]: {
    reason: string;
    days_since_purchase?: number;
  };
  [EVENTS.SUMMARY_VIEWED]: {
    filing_type: string;
    ticker: string;
    source: 'dashboard' | 'email' | 'direct' | 'seo_preview';
  };
  [EVENTS.FILING_CHAT_MESSAGE_SENT]: {
    filing_id: string;
    message_length: number;
  };
  [EVENTS.EMAIL_CTA_CLICKED]: {
    // utm_content — which whyItMatters variant was rendered in the email
    variant: 'ai' | 'fallback' | 'note' | 'neutral';
    // Final SEC URL the user will land on after the redirect
    destination: string;
    // Optional accession number / filing id, passed from the email link for cohort analysis
    filing_id?: string;
    // Optional form type for per-form-type funnels
    form_type?: string;
    campaign: string;
  };
  [EVENTS.EMAIL_SENT]: {
    email_id: string;
    template?: string;
    form_type?: string;
    ticker?: string;
    filing_id?: string;
    campaign_id?: string;
    email_position?: string;
    cohort_id?: string;
    is_subscriber?: boolean;
  };
  [EVENTS.EMAIL_OPENED]: {
    email_id: string;
    template?: string;
    form_type?: string;
    ticker?: string;
    filing_id?: string;
  };
  [EVENTS.EMAIL_CLICKED]: {
    email_id: string;
    template?: string;
    form_type?: string;
    ticker?: string;
    filing_id?: string;
    link?: string;
  };
  [EVENTS.EMAIL_BOUNCED]: {
    email_id: string;
    recipient: string;
    bounce_type?: string;
  };
  [EVENTS.EMAIL_COMPLAINED]: {
    email_id: string;
    recipient: string;
  };
  [EVENTS.UNSUBSCRIBE_COMPLETED]: {
    /**
     * How the unsubscribe was triggered. Only 'auto' is emitted today — the
     * page auto-fires the action on mount. Kept as a union so a future
     * confirm-step variant (or a separate one-click POST instrumentation) can
     * be added without renaming the event.
     */
    method: 'auto';
    /** 'success' = newly unsubscribed, 'already_unsubscribed' = idempotent re-hit. */
    outcome: 'success' | 'already_unsubscribed';
  };
  [EVENTS.MONITORING_METRIC]: {
    /** The metric name as emitted by lib/monitoring (e.g., "ai.x_sentiment_added"). */
    metric: string;
    /** Numeric value. For counters this is the increment; for gauges/values it's the recorded number. */
    value: number;
    /** "counter" | "gauge" | "value" | "timing" — for downstream HogQL filtering. */
    kind: 'counter' | 'gauge' | 'value' | 'timing';
    /** Flattened tag key/value pairs (PostHog stores them as top-level props for dashboard slicing). */
    [tag: string]: string | number | boolean | undefined;
  };
};

/**
 * Traffic source classification (see classify-traffic-source.ts).
 * Set as a super-property on all PostHog events.
 */
export type TrafficSource = 'organic' | 'social' | 'direct' | 'email' | 'internal';
