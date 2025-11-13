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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

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
ALTER TABLE page_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for newsletter tables (admin access only)
CREATE POLICY "Admin access" ON newsletter_subscribers FOR ALL USING (false);
CREATE POLICY "Admin access" ON newsletter_deliveries FOR ALL USING (false);

-- RLS Policies for page_analytics (allow anonymous inserts)
DROP POLICY IF EXISTS "Admin access" ON page_analytics;
CREATE POLICY "Allow anonymous inserts" ON page_analytics
  FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Service role full access" ON page_analytics
  FOR ALL
  USING (auth.role() = 'service_role');