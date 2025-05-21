import { PrismaClient } from '@prisma/client';
import { DEFAULT_USER_PREFERENCES, NotificationPreferences, PreferenceUpdateResponse, TickerSubscription, UserPreferences, SubscriptionUpdateResponse } from './preference-types';
import { logger } from '../logging';
import { v4 as uuidv4 } from 'uuid';

// Initialize Prisma client
const prisma = new PrismaClient();

/**
 * User Preference Service
 * Handles CRUD operations for user preferences and subscriptions
 */
export class PreferenceService {
  /**
   * Get user preferences
   * @param userId User ID
   * @returns User preferences
   */
  static async getUserPreferences(userId: string): Promise<UserPreferences> {
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
          preferences: updatedPrefs as any, // Prisma will handle JSON conversion
        }
      });
      
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
   * Get user ticker subscriptions
   * @param userId User ID
   * @returns Array of ticker subscriptions
   */
  static async getUserSubscriptions(userId: string): Promise<TickerSubscription[]> {
    try {
      // Get user preferences which contain subscriptions
      const preferences = await this.getUserPreferences(userId);
      
      // Return subscriptions or empty array if none exist
      return preferences.subscriptions || [];
    } catch (error) {
      logger.error('Error getting user subscriptions', error);
      throw error;
    }
  }

  /**
   * Add a ticker subscription
   * @param userId User ID
   * @param symbol Ticker symbol
   * @param companyName Company name
   * @param overridePreferences Whether to override global preferences
   * @param notificationPreferences Optional ticker-specific preferences
   * @returns Response with updated subscriptions
   */
  static async addSubscription(
    userId: string,
    symbol: string,
    companyName: string,
    overridePreferences: boolean = false,
    notificationPreferences?: NotificationPreferences
  ): Promise<SubscriptionUpdateResponse> {
    try {
      // Normalize the symbol to uppercase
      const normalizedSymbol = symbol.toUpperCase();
      
      // Get existing preferences
      const preferences = await this.getUserPreferences(userId);
      
      // Check if subscription already exists
      const existingIndex = (preferences.subscriptions || [])
        .findIndex(s => s.symbol.toUpperCase() === normalizedSymbol);
      
      // Create subscription object
      const subscription: TickerSubscription = {
        symbol: normalizedSymbol,
        companyName,
        overridePreferences,
        notificationPreferences: overridePreferences ? notificationPreferences : undefined
      };
      
      // Clone subscriptions array or create if it doesn't exist
      const subscriptions = [...(preferences.subscriptions || [])];
      
      // Update or add subscription
      if (existingIndex >= 0) {
        // Update existing subscription
        subscriptions[existingIndex] = subscription;
      } else {
        // Add new subscription
        subscriptions.push(subscription);
      }
      
      // Update user preferences with new subscriptions
      const result = await this.updateUserPreferences(userId, {
        subscriptions
      });
      
      return {
        success: result.success,
        message: result.success ? 'Subscription added successfully' : result.message,
        subscriptions
      };
    } catch (error) {
      logger.error('Error adding subscription', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error adding subscription'
      };
    }
  }

  /**
   * Update a ticker subscription
   * @param userId User ID
   * @param symbol Ticker symbol
   * @param overridePreferences Whether to override global preferences
   * @param notificationPreferences Optional ticker-specific preferences
   * @returns Response with updated subscriptions
   */
  static async updateSubscription(
    userId: string,
    symbol: string,
    overridePreferences: boolean,
    notificationPreferences?: NotificationPreferences
  ): Promise<SubscriptionUpdateResponse> {
    try {
      // Normalize the symbol to uppercase
      const normalizedSymbol = symbol.toUpperCase();
      
      // Get existing preferences
      const preferences = await this.getUserPreferences(userId);
      
      // Check if subscription exists
      const subscriptions = [...(preferences.subscriptions || [])];
      const existingIndex = subscriptions
        .findIndex(s => s.symbol.toUpperCase() === normalizedSymbol);
      
      // If subscription doesn't exist, return error
      if (existingIndex < 0) {
        return {
          success: false,
          message: `Subscription not found for symbol: ${symbol}`,
          subscriptions
        };
      }
      
      // Update subscription
      subscriptions[existingIndex] = {
        ...subscriptions[existingIndex],
        overridePreferences,
        notificationPreferences: overridePreferences ? notificationPreferences : undefined
      };
      
      // Update user preferences with updated subscriptions
      const result = await this.updateUserPreferences(userId, {
        subscriptions
      });
      
      return {
        success: result.success,
        message: result.success ? 'Subscription updated successfully' : result.message,
        subscriptions
      };
    } catch (error) {
      logger.error('Error updating subscription', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error updating subscription'
      };
    }
  }

  /**
   * Remove a ticker subscription
   * @param userId User ID
   * @param symbol Ticker symbol
   * @returns Response with updated subscriptions
   */
  static async removeSubscription(
    userId: string,
    symbol: string
  ): Promise<SubscriptionUpdateResponse> {
    try {
      // Normalize the symbol to uppercase
      const normalizedSymbol = symbol.toUpperCase();
      
      // Get existing preferences
      const preferences = await this.getUserPreferences(userId);
      
      // Filter out the subscription to remove
      const existingSubscriptions = preferences.subscriptions || [];
      const subscriptions = existingSubscriptions
        .filter(s => s.symbol.toUpperCase() !== normalizedSymbol);
      
      // If no subscriptions were removed, return error
      if (existingSubscriptions.length === subscriptions.length) {
        return {
          success: false,
          message: `Subscription not found for symbol: ${symbol}`,
          subscriptions
        };
      }
      
      // Update user preferences with filtered subscriptions
      const result = await this.updateUserPreferences(userId, {
        subscriptions
      });
      
      return {
        success: result.success,
        message: result.success ? 'Subscription removed successfully' : result.message,
        subscriptions
      };
    } catch (error) {
      logger.error('Error removing subscription', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error removing subscription'
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
  private static migrateLegacyPreferences(user: any): UserPreferences {
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