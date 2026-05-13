-- Email newsletter subscribers
CREATE TABLE newsletter_subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  source TEXT DEFAULT 'landing_page', -- landing_page, newsletter_variant, etc.
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  confirmed BOOLEAN DEFAULT false,
  confirmation_sent_at TIMESTAMP WITH TIME ZONE,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  unsubscribed_at TIMESTAMP WITH TIME ZONE,
  -- Campaign funnel tracking (added by add-campaign-funnel-tracking-columns.sql)
  cohort_id TEXT,                              -- pinned deliverability cohort: c1 | c2 | c3
  bounced_at TIMESTAMP WITH TIME ZONE,         -- Resend email.bounced
  bounce_type TEXT,                            -- hard | soft | undetermined
  complained_at TIMESTAMP WITH TIME ZONE,      -- Resend email.complained
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Sendable-subscribers index used by the cohorted campaign send route.
CREATE INDEX idx_newsletter_subscribers_sendable_cohort
  ON newsletter_subscribers (cohort_id, subscribed_at DESC)
  WHERE unsubscribed_at IS NULL
    AND bounced_at IS NULL
    AND complained_at IS NULL;

-- Idempotency log for campaign email broadcasts.
-- INSERT-on-start with status=pending, UPDATE to sent/failed on completion.
-- Unique constraint on (campaign_id, cohort_id, email_id, variant) blocks
-- accidental double-broadcast.
CREATE TABLE campaign_sends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  cohort_id TEXT NOT NULL,
  email_id TEXT NOT NULL,            -- 'e1' | 'e2' | 'e3'
  variant TEXT,                      -- 'A' | 'B' | NULL
  status TEXT NOT NULL,              -- 'pending' | 'sent' | 'failed'
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  initiated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  initiated_by TEXT,                 -- Clerk userId of the admin who triggered the send
  error_message TEXT,
  -- NULLS NOT DISTINCT (Postgres 15+) so a NULL variant is not treated as
  -- a different value than another NULL variant. Without this, two
  -- variant-less sends with the same (campaign_id, cohort_id, email_id)
  -- would BOTH insert successfully — silent double-broadcast.
  CONSTRAINT campaign_sends_idempotency_key UNIQUE NULLS NOT DISTINCT (campaign_id, cohort_id, email_id, variant)
);

CREATE INDEX idx_campaign_sends_campaign_lookup
  ON campaign_sends (campaign_id, cohort_id);

CREATE INDEX idx_campaign_sends_status_recent
  ON campaign_sends (status, initiated_at DESC);

-- Email delivery tracking
CREATE TABLE newsletter_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscriber_id UUID REFERENCES newsletter_subscribers(id),
  email_type TEXT NOT NULL, -- welcome, digest, upgrade_cta
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  opened_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE,
  resend_message_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Page analytics for A/B testing
CREATE TABLE page_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page_variant TEXT NOT NULL, -- original, newsletter
  visitor_id TEXT, -- anonymous session ID
  action TEXT NOT NULL, -- page_view, signup_attempt, signup_success
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  user_agent TEXT,
  referrer TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for newsletter tables (admin access only — service role bypasses RLS)
CREATE POLICY "Admin access" ON newsletter_subscribers FOR ALL USING (false);
CREATE POLICY "Admin access" ON newsletter_deliveries FOR ALL USING (false);
CREATE POLICY "Admin access" ON campaign_sends FOR ALL USING (false);

-- RLS Policies for page_analytics (allow anonymous inserts)
DROP POLICY IF EXISTS "Admin access" ON page_analytics;
CREATE POLICY "Allow anonymous inserts" ON page_analytics
  FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Service role full access" ON page_analytics
  FOR ALL
  USING (auth.role() = 'service_role');