import { getPrismaClient } from '@/lib/db/prisma';
import { DEFAULT_USER_PREFERENCES, PreferenceUpdateResponse, UserPreferences } from './preference-types';
import { syncUserTickerPreferences } from './preference-sync';
import { logger } from '../logging';

/**
 * User Preference Service — behind the two-method interface production
 * actually calls (getUserPreferences + updateUserPreferences). The former
 * fanned-out subscription CRUD methods (getUserSubscriptions,
 * addSubscription, updateSubscription, removeSubscription) were exported
 * for a hypothetical `/api/user/subscriptions` seam that never shipped and
 * had zero production callers; deleting them concentrates the surface on
 * what the surviving `/api/user` route uses.
 */
export class PreferenceService {
  /**
   * Get user preferences
   * @param userId User ID
   * @returns User preferences
   */
  static async getUserPreferences(userId: string): Promise<UserPreferences> {
    const prisma = getPrismaClient();
    try {
      // Get user from database
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          preferences: true,
          notificationPreference: true, // Legacy field
          watchedTickers: true, // Legacy field
          watchedFormTypes: true, // Legacy field
        }
      });
      
      if (!user) {
        throw new Error(`User not found: ${userId}`);
      }
      
      // If user has preferences in the new format, return them
      if (user.preferences && typeof user.preferences === 'object') {
        // Handle case where preferences is stored as JSON
        try {
          const preferences = user.preferences as unknown as UserPreferences;
          
          // Ensure all required fields are present
          return this.ensurePreferenceStructure(preferences);
        } catch (error) {
          logger.error('Error parsing user preferences', error);
          // Fall back to defaults
          return this.migrateLegacyPreferences(user);
        }
      }
      
      // If no preferences or not in correct format, use legacy fields or defaults
      return this.migrateLegacyPreferences(user);
    } catch (error) {
      logger.error('Error getting user preferences', error);
      throw error;
    }
  }

  /**
   * Update user preferences
   * @param userId User ID
   * @param updates Preference updates to apply
   * @returns Response with updated preferences
   */
  static async updateUserPreferences(
    userId: string,
    updates: Partial<UserPreferences>
  ): Promise<PreferenceUpdateResponse> {
    const prisma = getPrismaClient();
    try {
      // Get existing preferences
      const existingPrefs = await this.getUserPreferences(userId);

      // Merge updates with existing preferences
      const updatedPrefs = this.mergePreferences(existingPrefs, updates);
      
      // Validate preferences
      if (!this.validatePreferences(updatedPrefs)) {
        return {
          success: false,
          message: 'Invalid preference format'
        };
      }
      
      // Save to database
      await prisma.user.update({
        where: { id: userId },
        data: {
          preferences: updatedPrefs as Record<string, unknown>, // Prisma will handle JSON conversion
        }
      });

      // Sync filing type preferences to all user's tickers
      // This ensures Ticker.preferences stays in sync with User.preferences
      if (updates.notifications?.filingTypes) {
        try {
          const syncedCount = await syncUserTickerPreferences(userId);
          logger.info(`Synced preferences to ${syncedCount} tickers for user ${userId}`);
        } catch (syncError) {
          // Log but don't fail the preference update
          logger.error('Failed to sync ticker preferences after user preference update', syncError);
        }
      }

      return {
        success: true,
        message: 'Preferences updated successfully',
        preferences: updatedPrefs
      };
    } catch (error) {
      logger.error('Error updating user preferences', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error updating preferences'
      };
    }
  }

  /**
   * Ensure preference structure has all required fields
   * @param preferences Input preferences, possibly incomplete
   * @returns Complete preferences with defaults for missing fields
   */
  private static ensurePreferenceStructure(preferences: Partial<UserPreferences>): UserPreferences {
    // Start with default preferences
    const result = { ...DEFAULT_USER_PREFERENCES };
    
    // Merge provided preferences
    if (preferences) {
      // Merge notifications if provided
      if (preferences.notifications) {
        result.notifications = {
          ...result.notifications,
          ...preferences.notifications,
          // Ensure filingTypes has all fields
          filingTypes: {
            ...result.notifications.filingTypes,
            ...preferences.notifications.filingTypes
          },
          // Ensure contentPreferences has all fields
          contentPreferences: {
            ...result.notifications.contentPreferences,
            ...preferences.notifications.contentPreferences
          }
        };
      }
      
      // Merge UI preferences if provided
      if (preferences.ui) {
        result.ui = {
          ...result.ui,
          ...preferences.ui
        };
      }
      
      // Use provided subscriptions if any
      if (preferences.subscriptions) {
        result.subscriptions = preferences.subscriptions;
      }
    }
    
    return result;
  }
  
  /**
   * Merge existing preferences with updates
   * @param existingPrefs Existing preferences
   * @param updates Updates to apply
   * @returns Merged preferences
   */
  private static mergePreferences(
    existingPrefs: UserPreferences, 
    updates: Partial<UserPreferences>
  ): UserPreferences {
    const result = { ...existingPrefs };
    
    // Update notifications if provided
    if (updates.notifications) {
      result.notifications = {
        ...result.notifications,
        ...updates.notifications,
        // Update filing types if provided
        filingTypes: updates.notifications.filingTypes 
          ? { ...result.notifications.filingTypes, ...updates.notifications.filingTypes }
          : result.notifications.filingTypes,
        // Update content preferences if provided
        contentPreferences: updates.notifications.contentPreferences
          ? { ...result.notifications.contentPreferences, ...updates.notifications.contentPreferences }
          : result.notifications.contentPreferences
      };
    }
    
    // Update UI preferences if provided
    if (updates.ui) {
      result.ui = {
        ...result.ui,
        ...updates.ui
      };
    }
    
    // Update subscriptions if provided
    if (updates.subscriptions) {
      result.subscriptions = updates.subscriptions;
    }
    
    return result;
  }
  
  /**
   * Validate user preferences structure
   * @param preferences Preferences to validate
   * @returns Whether the preferences are valid
   */
  private static validatePreferences(preferences: UserPreferences): boolean {
    // Check that required fields exist
    if (!preferences || !preferences.notifications || !preferences.ui) {
      return false;
    }
    
    // Check notification preferences
    const { notifications } = preferences;
    if (!notifications.emailFrequency || !notifications.filingTypes || !notifications.contentPreferences) {
      return false;
    }
    
    // More detailed validation could be added here if needed
    
    return true;
  }
  
  /**
   * Migrate legacy preference fields to new structure
   * @param user User with legacy preference fields
   * @returns Migrated preferences
   */
  private static migrateLegacyPreferences(user: Record<string, unknown>): UserPreferences {
    // Start with default preferences
    const preferences = { ...DEFAULT_USER_PREFERENCES };
    
    // Use legacy notification preference if available
    if (user.notificationPreference) {
      preferences.notifications.emailFrequency = user.notificationPreference;
    }
    
    // Set up watched tickers as subscriptions if available
    if (user.watchedTickers && Array.isArray(user.watchedTickers)) {
      preferences.subscriptions = user.watchedTickers.map((symbol: string) => ({
        symbol,
        companyName: symbol, // No company name available in legacy data
        overridePreferences: false
      }));
    }
    
    // Set up watched form types if available
    if (user.watchedFormTypes && Array.isArray(user.watchedFormTypes)) {
      const formTypes = user.watchedFormTypes;
      
      preferences.notifications.filingTypes = {
        form10K: formTypes.includes('10-K'),
        form10Q: formTypes.includes('10-Q'),
        form8K: formTypes.includes('8-K'),
        form4: formTypes.includes('FORM 4'),
        otherFilings: formTypes.some((type: string) => !['10-K', '10-Q', '8-K', 'FORM 4'].includes(type))
      };
    }
    
    return preferences;
  }
} 