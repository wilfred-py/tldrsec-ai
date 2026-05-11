-- Migration: Email campaign funnel tracking
--
-- Adds the schema needed by the email-funnel-tracking design doc
-- (~/.gstack/projects/wilfred-py-tldrsec-ai/wilf-wilfred-py-email-funnel-tracking-design-20260508-095614.md).
--
-- Three concerns, one migration so they ship atomically:
--
--   1. Cohort assignment pinned per subscriber (Review Notes 2A) — the prior
--      cohort split was index-based in app/api/admin/campaign/send/route.ts,
--      which causes drift across E1/E2/E3 sends if new subscribers join
--      mid-campaign. Pinning cohort_id on the row makes assignment stable.
--
--   2. Bounce / complaint suppression (Review Notes 5A) — the Resend webhook
--      currently drops bounced/complained events on the floor. With three
--      sends per campaign, even one hard bounce on E1 should suppress E2/E3
--      to that address.
--
--   3. campaign_sends idempotency log (Review Notes 9A) — the campaign send
--      route has no idempotency. Double-running curl would double-send to the
--      same recipients. The (campaign_id, cohort_id, email_id, variant)
--      UNIQUE constraint makes that a 409.
--
-- Idempotent: safe to re-run.

-- ─── newsletter_subscribers: cohort + suppression columns ───────────────────

ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS cohort_id TEXT,
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS bounce_type TEXT,
  ADD COLUMN IF NOT EXISTS complained_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN newsletter_subscribers.cohort_id IS
  'Pinned deliverability cohort assignment (e.g. c1, c2, c3). Stable across E1/E2/E3 sends — never recompute from list order.';
COMMENT ON COLUMN newsletter_subscribers.bounced_at IS
  'Set by Resend webhook on email.bounced. Send route filters these out so we stop hitting dead addresses.';
COMMENT ON COLUMN newsletter_subscribers.bounce_type IS
  'Resend bounce category: hard | soft | undetermined. Hard bounces should never receive another email.';
COMMENT ON COLUMN newsletter_subscribers.complained_at IS
  'Set by Resend webhook on email.complained (recipient marked as spam). Send route filters these out — required for sender reputation.';

-- Partial index — only sendable subscribers. Keeps the cohort SELECT cheap.
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_sendable_cohort
  ON newsletter_subscribers (cohort_id, subscribed_at DESC)
  WHERE unsubscribed_at IS NULL
    AND bounced_at IS NULL
    AND complained_at IS NULL;

-- ─── campaign_sends: idempotency log ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaign_sends (
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
  error_message TEXT,                -- populated when status = 'failed'

  -- Idempotency key. Same (campaign, cohort, email, variant) cannot send twice.
  CONSTRAINT campaign_sends_idempotency_key UNIQUE (campaign_id, cohort_id, email_id, variant)
);

COMMENT ON TABLE campaign_sends IS
  'Idempotency log for campaign email broadcasts. INSERT-on-start with status=pending; UPDATE to sent/failed on completion. Unique constraint blocks accidental double-broadcast.';
COMMENT ON COLUMN campaign_sends.variant IS
  'NULL when no A/B split. The unique constraint treats NULL as distinct values per ANSI SQL — Postgres respects that.';
COMMENT ON COLUMN campaign_sends.status IS
  'pending = INSERTed before Resend call; sent = Resend batch returned success; failed = caught error before/during Resend call.';

CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign_lookup
  ON campaign_sends (campaign_id, cohort_id);

CREATE INDEX IF NOT EXISTS idx_campaign_sends_status_recent
  ON campaign_sends (status, initiated_at DESC);

-- ─── Row-level security ────────────────────────────────────────────────────

-- Match the pattern of newsletter_subscribers: deny by default, service role
-- bypasses RLS via SUPABASE_SERVICE_ROLE_KEY. Admin endpoint uses the service
-- client (lib/supabase/server-client.ts → createSupabaseServiceClient()).
ALTER TABLE campaign_sends ENABLE ROW LEVEL SECURITY;

-- Drop and recreate so re-running the migration is idempotent.
DROP POLICY IF EXISTS "Admin access" ON campaign_sends;
CREATE POLICY "Admin access" ON campaign_sends FOR ALL USING (false);
