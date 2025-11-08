/**
 * Optimized Database Connection Manager
 * 
 * Provides optimized database operations and connection management
 * to eliminate N+1 queries and improve performance.
 */

import { PrismaClient } from '@prisma/client';
import { getPrismaClient } from './prisma';
import { logger } from '../logging';

const dbLogger = logger.child('db-connection-manager');

/**
 * Database operation options
 */
export interface QueryOptions {
  includeRelations?: boolean;
  maxRetries?: number;
  timeout?: number;
}

/**
 * User with related data interface
 */
export interface UserWithRelatedData {
  id: string;
  email: string;
  subscriptionTier: string;
  processingBudget: number;
  budgetUsed: number;
  preferences?: unknown;
  tickers: Array<{
    symbol: string;
    companyName: string;
  }>;
}

/**
 * Optimized Connection Manager Class
 */
export class OptimizedConnectionManager {
  private prisma: PrismaClient;
  
  constructor() {
    this.prisma = getPrismaClient();
  }
  
  /**
   * Get users with all related data in a single query (eliminates N+1)
   * Optimized for ticker symbol lookup
   */
  async getUsersWithRelatedData(
    tickerSymbol: string,
    options: QueryOptions = {}
  ): Promise<UserWithRelatedData[]> {
    const startTime = Date.now();
    
    try {
      const users = await this.prisma.user.findMany({
        where: {
          tickers: {
            some: {
              symbol: tickerSymbol
            }
          }
        },
        include: {
          tickers: {
            where: {
              symbol: tickerSymbol
            },
            select: {
              symbol: true,
              companyName: true
            }
          }
        },
        select: options.includeRelations ? {
          id: true,
          email: true,
          subscriptionTier: true,
          processingBudget: true,
          budgetUsed: true,
          preferences: true,
          tickers: true
        } : undefined
      });
      
      const duration = Date.now() - startTime;
      dbLogger.debug(`Retrieved ${users.length} users with related data`, {
        tickerSymbol,
        duration,
        includeRelations: options.includeRelations,
        queryType: 'optimized_user_fetch'
      });
      
      return users as UserWithRelatedData[];
      
    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.error(`Failed to retrieve users with related data`, {
        tickerSymbol,
        duration,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Get multiple users by IDs with related data (batch operation)
   */
  async getUsersByIds(
    userIds: string[],
    _options: QueryOptions = {}
  ): Promise<UserWithRelatedData[]> {
    if (userIds.length === 0) return [];
    
    const startTime = Date.now();
    
    try {
      const users = await this.prisma.user.findMany({
        where: {
          id: {
            in: userIds
          }
        },
        include: {
          tickers: true
        }
      });
      
      const duration = Date.now() - startTime;
      dbLogger.debug(`Retrieved ${users.length} users by IDs`, {
        userIdsCount: userIds.length,
        duration,
        queryType: 'batch_user_fetch'
      });
      
      return users as UserWithRelatedData[];
      
    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.error(`Failed to retrieve users by IDs`, {
        userIdsCount: userIds.length,
        duration,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Get all eligible users for processing with optimized queries
   */
  async getEligibleUsersForProcessing(
    budgetThreshold: number = 90,
    subscriptionTiers?: string[]
  ): Promise<UserWithRelatedData[]> {
    const startTime = Date.now();
    
    try {
      const whereClause: {
        tickers: { some: Record<string, unknown> };
        subscriptionTier?: { in: string[] };
        OR?: Array<{ processingBudget: { lte: number } } | { budgetUsed: { lt: unknown } }>;
      } = {
        tickers: {
          some: {} // Has at least one ticker
        }
      };
      
      // Add subscription tier filter if specified
      if (subscriptionTiers && subscriptionTiers.length > 0) {
        whereClause.subscriptionTier = {
          in: subscriptionTiers
        };
      }
      
      // Add budget filter to exclude users near their limit
      if (budgetThreshold > 0) {
        whereClause.OR = [
          {
            processingBudget: {
              lte: 0 // Unlimited budget (0 or negative)
            }
          },
          {
            budgetUsed: {
              lt: this.prisma.$queryRaw`CAST("processingBudget" * ${budgetThreshold / 100} AS DECIMAL)`
            }
          }
        ];
      }
      
      const users = await this.prisma.user.findMany({
        where: whereClause,
        include: {
          tickers: {
            select: {
              symbol: true,
              companyName: true
            }
          }
        },
        orderBy: [
          {
            subscriptionTier: 'desc' // Premium users first
          },
          {
            budgetUsed: 'asc' // Users with lower budget usage first
          }
        ]
      });
      
      const duration = Date.now() - startTime;
      dbLogger.info(`Retrieved ${users.length} eligible users for processing`, {
        budgetThreshold,
        subscriptionTiers,
        duration,
        queryType: 'eligible_users_fetch'
      });
      
      return users as UserWithRelatedData[];
      
    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.error(`Failed to retrieve eligible users`, {
        budgetThreshold,
        subscriptionTiers,
        duration,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Batch update user budgets with optimized query
   */
  async batchUpdateUserBudgets(
    updates: Array<{
      userId: string;
      budgetIncrement: number;
    }>
  ): Promise<{ success: boolean; updatedCount: number; errors: Array<{ userId?: string; budgetIncrement?: number; error: string; type?: string }> }> {
    if (updates.length === 0) {
      return { success: true, updatedCount: 0, errors: [] };
    }
    
    const startTime = Date.now();
    const errors: Array<{ userId?: string; budgetIncrement?: number; error: string; type?: string }> = [];
    let updatedCount = 0;
    
    try {
      // Use transaction for atomic updates
      await this.prisma.$transaction(async (prisma) => {
        for (const { userId, budgetIncrement } of updates) {
          try {
            await prisma.user.update({
              where: { id: userId },
              data: {
                budgetUsed: {
                  increment: budgetIncrement
                }
              }
            });
            updatedCount++;
          } catch (error) {
            errors.push({
              userId,
              budgetIncrement,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      });
      
      const duration = Date.now() - startTime;
      const success = errors.length === 0;
      
      dbLogger.info(`Batch budget update completed`, {
        totalUpdates: updates.length,
        successful: updatedCount,
        errors: errors.length,
        duration,
        success
      });
      
      return { success, updatedCount, errors };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      dbLogger.error(`Batch budget update failed`, {
        totalUpdates: updates.length,
        duration,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        success: false,
        updatedCount,
        errors: [...errors, {
          type: 'transaction_error',
          error: error instanceof Error ? error.message : String(error)
        }]
      };
    }
  }
  
  /**
   * Get connection statistics
   */
  async getConnectionStats(): Promise<{
    activeConnections: number;
    idleConnections: number;
    totalConnections: number;
  } | null> {
    try {
      // Note: This requires specific Prisma configuration and database permissions
      const result = await this.prisma.$queryRaw<Array<{
        state: string;
        count: number;
      }>>`
        SELECT 
          state,
          count(*) as count
        FROM pg_stat_activity 
        WHERE datname = current_database()
        GROUP BY state
      `;
      
      const stats = result.reduce((acc, row) => {
        if (row.state === 'active') acc.activeConnections = Number(row.count);
        else if (row.state === 'idle') acc.idleConnections = Number(row.count);
        acc.totalConnections += Number(row.count);
        return acc;
      }, { activeConnections: 0, idleConnections: 0, totalConnections: 0 });
      
      return stats;
      
    } catch (error) {
      dbLogger.warn(`Failed to get connection stats`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
  
  /**
   * Optimize database connections
   */
  async optimizeConnections(): Promise<void> {
    try {
      // Run ANALYZE to update table statistics
      await this.prisma.$executeRaw`ANALYZE`;
      
      dbLogger.info(`Database optimization completed`);
      
    } catch (error) {
      dbLogger.error(`Database optimization failed`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

// Export singleton instance
export const optimizedConnectionManager = new OptimizedConnectionManager();