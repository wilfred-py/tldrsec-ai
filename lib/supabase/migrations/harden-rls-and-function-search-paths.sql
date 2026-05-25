-- Supabase advisor remediation (P1 + P2).
--
-- P1 — `_prisma_migrations` had RLS disabled, so PostgREST exposed it to
--      anon/authenticated roles. Prisma uses a direct Postgres connection
--      that bypasses RLS, so enabling RLS without policies just blocks
--      PostgREST access (which the app never used anyway).
--
-- P2 — Two trigger functions had a mutable search_path. Pinning to '' and
--      schema-qualifying every reference closes the search-path injection
--      vector flagged by the linter.

ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;

ALTER FUNCTION public.notify_minion_job_change() SET search_path = '';

CREATE OR REPLACE FUNCTION public.update_page_search_vector()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  timeline_text TEXT;
BEGIN
  SELECT coalesce(string_agg(summary || ' ' || detail, ' '), '')
  INTO timeline_text
  FROM public.timeline_entries
  WHERE page_id = NEW.id;

  NEW.search_vector :=
    setweight(pg_catalog.to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(pg_catalog.to_tsvector('english', coalesce(NEW.compiled_truth, '')), 'B') ||
    setweight(pg_catalog.to_tsvector('english', coalesce(NEW.timeline, '')), 'C') ||
    setweight(pg_catalog.to_tsvector('english', coalesce(timeline_text, '')), 'C');

  RETURN NEW;
END;
$function$;
