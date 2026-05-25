-- Supabase advisor remediation (P0, part 1).
--
-- The `page_analytics` table previously allowed unrestricted browser inserts
-- via the anon key. Step one of locking that down is adding an `ip_address`
-- column so the server-side ingestion route can record the real client IP
-- (taken from x-forwarded-for / x-real-ip) for abuse forensics.

ALTER TABLE public.page_analytics
  ADD COLUMN IF NOT EXISTS ip_address inet;
