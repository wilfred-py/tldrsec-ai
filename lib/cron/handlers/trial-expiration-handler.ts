import { logger } from '../../logging';
import { getPrismaClient } from '../../db/prisma';

const handlerLogger = logger.child('trial-expiration-handler');

export interface TrialExpirationPayload {
  userId: string;
  userEmail: string;
  trialExpiresAt: string;
  executionId: string;
}

export interface TrialExpirationResult {
  success: boolean;
  userId: string;
  markedExpired: boolean;
  emailSent: boolean;
  duration: number;
  error?: string;
}

/**
 * Handle expired trial processing
 * - Mark user as not trialing
 * - Send expiration notification email
 */
export async function handleTrialExpiration(
  payload: TrialExpirationPayload
): Promise<TrialExpirationResult> {
  const startTime = Date.now();

  handlerLogger.info(`[${payload.executionId}] Processing trial expiration`, {
    userId: payload.userId,
    trialExpiresAt: payload.trialExpiresAt,
  });

  const prisma = getPrismaClient();

  try {
    // 1. Mark user as not trialing
    await prisma.user.update({
      where: { id: payload.userId },
      data: {
        isTrialing: false,
      },
    });

    handlerLogger.info(`[${payload.executionId}] User marked as trial expired`, {
      userId: payload.userId,
    });

    // 2. Send expiration notification email
    let emailSent = false;
    try {
      const { sendTrialExpirationEmail } = await import(
        '../../email/trial-emails'
      );
      await sendTrialExpirationEmail({
        email: payload.userEmail,
        userId: payload.userId,
        trialExpiredAt: new Date(payload.trialExpiresAt),
      });
      emailSent = true;

      handlerLogger.info(`[${payload.executionId}] Trial expiration email sent`, {
        userId: payload.userId,
      });
    } catch (emailError) {
      handlerLogger.error(
        `[${payload.executionId}] Failed to send trial expiration email`,
        {
          userId: payload.userId,
          error:
            emailError instanceof Error
              ? emailError.message
              : 'Unknown error',
        }
      );
    }

    return {
      success: true,
      userId: payload.userId,
      markedExpired: true,
      emailSent,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    handlerLogger.error(
      `[${payload.executionId}] Failed to process trial expiration`,
      {
        userId: payload.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    );

    return {
      success: false,
      userId: payload.userId,
      markedExpired: false,
      emailSent: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
