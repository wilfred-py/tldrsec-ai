-- Idempotent dedup store for the $499 Lifetime founding-seat campaign.
-- Replaces scripts/founding/sent.jsonl (local file, doesn't survive CI runs
-- or workstation crashes). Same model as campaign_sends.
--
-- Dedup rule: PRIMARY KEY (email) blocks re-send. Failed sends (error IS NOT
-- NULL) stay for forensics but can be replaced on retry — script upserts on
-- conflict.

CREATE TABLE IF NOT EXISTS public.founding_sends (
  email       text         PRIMARY KEY,
  batch       text         NOT NULL CHECK (batch IN ('us','eu')),
  resend_id   text,
  error       text,
  sent_at     timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.founding_sends ENABLE ROW LEVEL SECURITY;

-- Service role only — no anon/authenticated access. Mirrors campaign_sends.
DROP POLICY IF EXISTS "Service role full access" ON public.founding_sends;
CREATE POLICY "Service role full access"
  ON public.founding_sends
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS founding_sends_batch_sent_at_idx
  ON public.founding_sends (batch, sent_at DESC);

COMMENT ON TABLE public.founding_sends IS
  'Per-email dedup log for the $499 Lifetime founding-seat outreach. PRIMARY KEY (email) blocks re-send. Failed rows (error IS NOT NULL) can be replaced via upsert on retry.';
