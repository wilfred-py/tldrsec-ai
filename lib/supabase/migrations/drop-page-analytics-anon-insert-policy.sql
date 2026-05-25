-- Supabase advisor remediation (P0, part 2).
--
-- Run this ONLY after /api/analytics/track is deployed and verified — once
-- the policy is gone, the anon key can no longer insert into page_analytics
-- and any client still calling supabase.from('page_analytics').insert(...)
-- will start failing.
--
-- After this, all analytics writes go through the server-side route which
-- uses the service-role key. RLS stays enabled with no policies, which is
-- the same posture as the rest of the app-internal tables.

DROP POLICY IF EXISTS "Allow anonymous inserts" ON public.page_analytics;
