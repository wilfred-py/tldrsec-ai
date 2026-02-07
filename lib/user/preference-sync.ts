/**
 * Preference Sync Utility
 *
 * Converts between User.preferences (nested JSON) and Ticker.preferences (flat JSON)
 * to ensure both stay in sync.
 */

import { getPrismaClient } from '@/lib/db/prisma';
import { FilingTypePreferences, UserPreferences, DEFAULT_NOTIFICATION_PREFERENCES } from './preference-types';
import { logger } from '../logging';

/**
 * Flat ticker preferences structure (stored in Ticker.preferences)
 */
export interface TickerFilingPreferences {
  // Annual Reports
  tenK: boolean;
  twentyF: boolean;
  fortyF: boolean;

  // Quarterly Reports
  tenQ: boolean;
  sixK: boolean;

  // Current Events
  eightK: boolean;

  // Insider Trading
  form3: boolean;
  form4: boolean;
  form5: boolean;
  form144: boolean;

  // Beneficial Ownership
  sc13D: boolean;
  sc13G: boolean;
  thirteenF: boolean;

  // Proxy Materials
  def14A: boolean;
  pre14A: boolean;

  // Registration
  sOne: boolean;
  sThree: boolean;

  // Prospectus
  fourTwoFourB2: boolean;
  fourTwoFourB3: boolean;
  fwp: boolean;

  // Other
  schedule: boolean;
  other: boolean;
}

/**
 * Convert nested User.preferences.notifications.filingTypes to flat Ticker.preferences
 */
export function convertUserPrefsToTickerPrefs(
  filingTypes: Partial<FilingTypePreferences> | null | undefined
): TickerFilingPreferences {
  // Start with defaults from the proper default preferences
  const defaults = DEFAULT_NOTIFICATION_PREFERENCES.filingTypes;

  // Use provided filing types or defaults
  const prefs = filingTypes || defaults;

  return {
    // Annual Reports
    tenK: prefs.annualReports?.form10K ?? defaults.annualReports.form10K,
    twentyF: prefs.annualReports?.form20F ?? defaults.annualReports.form20F,
    fortyF: prefs.annualReports?.form40F ?? defaults.annualReports.form40F,

    // Quarterly Reports
    tenQ: prefs.quarterlyReports?.form10Q ?? defaults.quarterlyReports.form10Q,
    sixK: prefs.quarterlyReports?.form6K ?? defaults.quarterlyReports.form6K,

    // Current Events
    eightK: prefs.currentEvents?.form8K ?? defaults.currentEvents.form8K,

    // Insider Trading
    form3: prefs.insiderTrading?.form3 ?? defaults.insiderTrading.form3,
    form4: prefs.insiderTrading?.form4 ?? defaults.insiderTrading.form4,
    form5: prefs.insiderTrading?.form5 ?? defaults.insiderTrading.form5,
    form144: prefs.insiderTrading?.form144 ?? defaults.insiderTrading.form144,

    // Beneficial Ownership
    sc13D: prefs.beneficialOwnership?.formSC13D ?? defaults.beneficialOwnership.formSC13D,
    sc13G: prefs.beneficialOwnership?.formSC13G ?? defaults.beneficialOwnership.formSC13G,
    thirteenF: prefs.beneficialOwnership?.form13F ?? defaults.beneficialOwnership.form13F,

    // Proxy Materials
    def14A: prefs.proxyFilings?.formDEF14A ?? defaults.proxyFilings.formDEF14A,
    pre14A: prefs.proxyFilings?.formPRE14A ?? defaults.proxyFilings.formPRE14A,

    // Registration
    sOne: prefs.registrationFilings?.formS1 ?? defaults.registrationFilings.formS1,
    sThree: prefs.registrationFilings?.formS3 ?? defaults.registrationFilings.formS3,

    // Prospectus
    fourTwoFourB2: prefs.registrationFilings?.form424B2 ?? defaults.registrationFilings.form424B2,
    fourTwoFourB3: prefs.registrationFilings?.form424B3 ?? defaults.registrationFilings.form424B3,
    fwp: prefs.registrationFilings?.formFWP ?? defaults.registrationFilings.formFWP,

    // Other (not directly mapped, defaults to false)
    schedule: false,
    other: false,
  };
}

/**
 * Sync all of a user's ticker preferences from their User.preferences
 *
 * @param userId - The user's database ID
 * @returns Number of tickers updated
 */
export async function syncUserTickerPreferences(userId: string): Promise<number> {
  const prisma = getPrismaClient();
  try {
    // Get user with preferences and tickers
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        preferences: true,
        tickers: {
          select: {
            id: true,
            symbol: true,
          },
        },
      },
    });

    if (!user) {
      logger.warn(`[preference-sync] User not found: ${userId}`);
      return 0;
    }

    // Get user's filing type preferences
    const userPrefs = user.preferences as unknown as UserPreferences | null;
    const filingTypes = userPrefs?.notifications?.filingTypes;

    // Convert to ticker format
    const tickerPrefs = convertUserPrefsToTickerPrefs(filingTypes);

    // Update all tickers
    let updatedCount = 0;
    for (const ticker of user.tickers) {
      await prisma.ticker.update({
        where: { id: ticker.id },
        data: { preferences: tickerPrefs },
      });
      updatedCount++;
    }

    logger.info(`[preference-sync] Synced ${updatedCount} tickers for user ${user.email}`);
    return updatedCount;
  } catch (error) {
    logger.error('[preference-sync] Error syncing ticker preferences', error);
    throw error;
  }
}

/**
 * Get default ticker preferences based on DEFAULT_NOTIFICATION_PREFERENCES
 * This should be used instead of hardcoded defaults when creating new tickers
 */
export function getDefaultTickerPreferences(): TickerFilingPreferences {
  return convertUserPrefsToTickerPrefs(DEFAULT_NOTIFICATION_PREFERENCES.filingTypes);
}
