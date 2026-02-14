/**
 * Trial Configuration Constants
 *
 * Single source of truth for all trial-related configuration.
 * Referenced by: Clerk webhook, TrialService, IP abuse prevention, cron jobs.
 */
export const TRIAL_CONFIG = {
  /** Duration of trial period in days */
  TRIAL_DURATION_DAYS: 7,

  /** Maximum trial signups allowed per IP address within the window */
  MAX_TRIALS_PER_IP: 3,

  /** IP abuse prevention window in days */
  IP_WINDOW_DAYS: 30,
} as const;
