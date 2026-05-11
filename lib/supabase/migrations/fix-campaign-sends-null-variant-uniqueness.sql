-- Fix: campaign_sends UNIQUE constraint must treat NULL variant as a single value.
--
-- The original constraint (added by add-campaign-funnel-tracking-columns.sql)
-- is `UNIQUE (campaign_id, cohort_id, email_id, variant)`. Postgres treats
-- NULL = NULL as false in equality, so two rows with `variant = NULL` were
-- both allowed. The dryrun-campaign-send.ts harness caught this — duplicate
-- broadcasts on the variant-less path (cohort 2 + 3 default to no A/B) would
-- have shipped silently.
--
-- Fix uses `NULLS NOT DISTINCT` (Postgres 15+, available on Supabase). Two
-- rows with all-equal columns including NULL variant are now treated as
-- duplicates.
--
-- Idempotent: drop the prior constraint by name, recreate with the new
-- semantics. If the prior constraint isn't present (fresh DB after
-- schema.sql) we still create the new one without error.

ALTER TABLE campaign_sends
  DROP CONSTRAINT IF EXISTS campaign_sends_idempotency_key;

ALTER TABLE campaign_sends
  ADD CONSTRAINT campaign_sends_idempotency_key
  UNIQUE NULLS NOT DISTINCT (campaign_id, cohort_id, email_id, variant);
