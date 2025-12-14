-- Migration: Add lock cleanup database function
-- Date: 2025-12-15
-- Author: Claude
-- Description: Adds a PostgreSQL function to clean up expired locks.
--              This provides a database-level safety net for lock cleanup
--              that is independent of application code.

-- Create or replace the cleanup function
CREATE OR REPLACE FUNCTION cleanup_expired_locks()
RETURNS INTEGER AS $$
DECLARE
  cleaned_count INTEGER;
BEGIN
  -- Mark all expired, unreleased locks as released
  WITH updated AS (
    UPDATE "JobLock"
    SET released = true
    WHERE released = false
      AND "expiresAt" < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO cleaned_count FROM updated;

  -- Log cleanup action if any locks were cleaned
  IF cleaned_count > 0 THEN
    RAISE NOTICE 'cleanup_expired_locks: Cleaned up % expired locks', cleaned_count;
  END IF;

  RETURN cleaned_count;
END;
$$ LANGUAGE plpgsql;

-- Add documentation comment
COMMENT ON FUNCTION cleanup_expired_locks() IS
  'Marks expired locks as released. Can be called directly or by the application-level proactive cleanup endpoint. Returns the number of locks that were cleaned up.';

-- Create a view for monitoring lock health
CREATE OR REPLACE VIEW lock_health_summary AS
SELECT
  COUNT(*) FILTER (WHERE released = false AND "expiresAt" > NOW()) AS active_locks,
  COUNT(*) FILTER (WHERE released = false AND "expiresAt" < NOW()) AS expired_unreleased_locks,
  COUNT(*) FILTER (WHERE released = true) AS released_locks,
  COUNT(*) AS total_locks,
  MAX("acquiredAt") FILTER (WHERE released = false AND "expiresAt" > NOW()) AS most_recent_active_lock,
  MIN("expiresAt") FILTER (WHERE released = false AND "expiresAt" > NOW()) AS next_expiration,
  CASE
    WHEN COUNT(*) FILTER (WHERE released = false AND "expiresAt" < NOW()) > 5 THEN 'CRITICAL'
    WHEN COUNT(*) FILTER (WHERE released = false AND "expiresAt" < NOW()) > 2 THEN 'WARNING'
    ELSE 'HEALTHY'
  END AS health_status
FROM "JobLock";

-- Add documentation comment for the view
COMMENT ON VIEW lock_health_summary IS
  'Provides a summary view of lock health for monitoring dashboards. Includes counts of active, expired, and released locks, plus an overall health status.';
