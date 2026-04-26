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

  // Onboarding funnel
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  ONBOARDING_VARIANT_ASSIGNED: 'onboarding_variant_assigned',

  // Conversion funnel
  CHECKOUT_INITIATED: 'checkout_initiated',
  CHECKOUT_COMPLETED: 'checkout_completed',
  TRIAL_STARTED: 'trial_started',
  TRIAL_CONVERTED: 'trial_converted',

  // Engagement
  SUMMARY_VIEWED: 'summary_viewed',
  FILING_CHAT_MESSAGE_SENT: 'filing_chat_message_sent',
  EMAIL_CTA_CLICKED: 'email_cta_clicked',

  // Email lifecycle (Resend webhook → PostHog)
  EMAIL_OPENED: 'email_opened',
  EMAIL_CLICKED: 'email_clicked',
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
  [EVENTS.ONBOARDING_STEP_COMPLETED]: {
    step_name: 'profile' | 'sectors' | 'companies' | 'confirm' | 'email' | 'tutorial';
    step_index: number;
    duration_ms: number;
  };
  [EVENTS.ONBOARDING_COMPLETED]: {
    total_duration_ms: number;
    companies_count: number;
    sectors_count: number;
    variant: 'step4' | 'inline';
    step_count: 3 | 4;
    email_frequency: 'IMMEDIATE' | 'DAILY' | 'NONE';
    ticker_count: number;
    duration_ms: number;
  };
  [EVENTS.ONBOARDING_VARIANT_ASSIGNED]: {
    variant: 'step4' | 'inline';
    source: 'posthog' | 'session' | 'cookie' | 'fallback';
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
};

/**
 * Traffic source classification (see classify-traffic-source.ts).
 * Set as a super-property on all PostHog events.
 */
export type TrafficSource = 'organic' | 'social' | 'direct' | 'email' | 'internal';
