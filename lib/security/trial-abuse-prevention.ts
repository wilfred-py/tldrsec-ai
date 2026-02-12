/**
 * IP-based Trial Abuse Prevention
 *
 * Limits trial signups per IP address to prevent abuse.
 * Fails open (allows on error) to avoid blocking legitimate users.
 */

import { getPrismaClient } from '@/lib/db/prisma';
import { TRIAL_CONFIG } from '@/lib/auth/trial-config';

export interface IPAbuseCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if an IP address has exceeded trial signup limits.
 * Default: 3 signups per IP per 30 days (configurable via TRIAL_CONFIG).
 */
export async function checkIPTrialAbuse(
  ipAddress: string
): Promise<IPAbuseCheckResult> {
  try {
    const prisma = getPrismaClient();
    const windowStart = new Date(
      Date.now() - TRIAL_CONFIG.IP_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );

    const userCount = await prisma.user.count({
      where: {
        signupIpAddress: ipAddress,
        createdAt: {
          gte: windowStart,
        },
      },
    });

    if (userCount >= TRIAL_CONFIG.MAX_TRIALS_PER_IP) {
      return {
        allowed: false,
        reason: 'Maximum trial signups reached for this IP address',
      };
    }

    return { allowed: true };
  } catch (error) {
    // Fail open - allow signup on error to avoid blocking legitimate users
    console.error('[trial-abuse-prevention] Error checking IP abuse', {
      ipAddress,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { allowed: true };
  }
}
