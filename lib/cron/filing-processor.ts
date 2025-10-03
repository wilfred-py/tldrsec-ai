/**
 * Filing processing engine for cron jobs
 * Handles individual filing processing, AI summarization, and email notifications
 * Extracted from app/api/cron/tier-aware/route.ts
 */

import { Prisma, Summary } from '@prisma/client';
import { logger } from '../logging';
// import { getPrismaClient } from '../db/prisma';
import { FilingTransactionManager } from '../db/transaction-manager';
import { CronSecFilingService } from './sec-filing-service';
import { CronBudgetService } from './budget-service';
import type {
  DatabaseUser,
  User,
  FilingForProcessing,
  UserFilingResult,
  TransactionOptions
} from './types';
import { FILING_PROCESSING_TIMEOUT } from './types';

const processorLogger = logger.child('cron-filing-processor');

export class CronFilingProcessor {
  /**
   * Process SEC filings for a specific user with tier-aware optimization
   */
  static async processUserTierFilings(
    user: DatabaseUser | User,
    tier: string
  ): Promise<{ filingsProcessed: number; cost: number }> {
    const result = {
      filingsProcessed: 0,
      cost: 0
    };

    try {
      // Validate user object structure
      if (!user || !user.id || !user.tickers) {
        processorLogger.error('Invalid user object passed to processUserTierFilings', {
          userId: user?.id || 'unknown',
          hasId: !!user?.id,
          hasTickers: !!user?.tickers,
          tickersType: typeof user?.tickers
        });
        return result;
      }

      processorLogger.info(`Processing filings for user ${user.id} (tier: ${tier})`);

      // First validate all user tickers have valid CIKs
      const tickerValidations = await CronSecFilingService.validateUserTickersForProcessing(
        user.id,
        user.tickers || []
      );

      const validTickers = tickerValidations.filter(t => t && t.valid);
      
      if (validTickers.length === 0) {
        processorLogger.warn(`No valid tickers found for user ${user.id}`, {
          userId: user.id,
          totalTickers: user.tickers?.length || 0,
          invalidTickers: tickerValidations.filter(t => t && !t.valid).map(t => t.symbol).filter(Boolean)
        });
        return result;
      }

      // Process each valid ticker
      for (const tickerValidation of validTickers) {
        try {
          if (!tickerValidation || !tickerValidation.symbol) {
            processorLogger.warn('Invalid ticker validation object encountered', {
              userId: user.id,
              tickerValidation
            });
            continue;
          }

          // Find the original ticker object
          const originalTicker = (user.tickers || []).find(t => t && t.symbol === tickerValidation.symbol);
          if (!originalTicker) {
            processorLogger.warn(`Original ticker not found for ${tickerValidation.symbol}`, {
              userId: user.id,
              searchedSymbol: tickerValidation.symbol,
              availableSymbols: (user.tickers || []).map(t => t?.symbol).filter(Boolean)
            });
            continue;
          }

          if (!tickerValidation.cik) {
            processorLogger.warn(`No CIK available for ${tickerValidation.symbol}, skipping`, {
              userId: user.id,
              ticker: tickerValidation.symbol
            });
            continue;
          }

          // Get unprocessed filings for this ticker
          const newFilings = await CronSecFilingService.getUnprocessedFilingsForUser(
            tickerValidation.symbol,
            user.id
          );

          processorLogger.info(`Found ${newFilings.length} unprocessed filings for ${tickerValidation.symbol}`, {
            userId: user.id
          });

          // Process each filing
          for (const filing of newFilings || []) {
            try {
              if (!filing || !filing.id || !filing.accessionNumber) {
                processorLogger.warn('Invalid filing object encountered', {
                  userId: user.id,
                  ticker: tickerValidation.symbol,
                  filing: filing
                });
                continue;
              }

              const filingResult = await this.processSingleFiling(
                filing,
                user,
                tier,
                tickerValidation,
                originalTicker
              );

              if (filingResult.success) {
                result.filingsProcessed++;
                result.cost += filingResult.cost;

                // Mark filing as processed
                await CronSecFilingService.markFilingAsProcessed(
                  filing.accessionNumber,
                  tickerValidation.symbol,
                  user.id
                );
              }

              // Respect tier-based processing limits
              const maxFilings = CronBudgetService.getBatchSizeForTier(tier);
              if (result.filingsProcessed >= maxFilings) {
                processorLogger.info(`Reached tier limit for user ${user.id}: ${maxFilings} filings`, {
                  tier,
                  filingsProcessed: result.filingsProcessed
                });
                break;
              }

            } catch (filingError) {
              processorLogger.error(`Failed to process filing ${filing.accessionNumber}`, {
                error: filingError instanceof Error ? filingError.message : 'Unknown error',
                userId: user.id,
                ticker: tickerValidation.symbol,
                cik: tickerValidation.cik
              });
            }
          }

          // Break if we've hit the tier limit
          const maxFilings = CronBudgetService.getBatchSizeForTier(tier);
          if (result.filingsProcessed >= maxFilings) {
            break;
          }

        } catch (tickerError) {
          processorLogger.error(`Failed to process ticker ${tickerValidation.symbol} for user ${user.id}`, {
            error: tickerError instanceof Error ? tickerError.message : 'Unknown error',
            userId: user.id,
            ticker: tickerValidation.symbol,
            cik: tickerValidation.cik
          });
        }
      }

    } catch (error) {
      processorLogger.error(`Failed to process SEC filings for user ${user.id}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        tier,
        tickerCount: user.tickers?.length || 0
      });
    }

    processorLogger.info(`Completed processing for user ${user.id}`, {
      filingsProcessed: result.filingsProcessed,
      cost: result.cost,
      tier
    });

    return result;
  }

  /**
   * Process user filings using deduplicated filing results (optimized)
   */
  static async processUserWithDeduplicatedFilings(
    user: DatabaseUser,
    tier: string,
    userFilingResults: UserFilingResult[]
  ): Promise<{ filingsProcessed: number; cost: number }> {
    const result = {
      filingsProcessed: 0,
      cost: 0
    };

    try {
      processorLogger.info(`Processing user ${user.id} with ${userFilingResults.length} ticker results using deduplication`, {
        userId: user.id,
        tickerResults: userFilingResults.length,
        tickers: userFilingResults.map(r => r.ticker)
      });

      // Process each ticker's filing results
      for (const tickerResult of userFilingResults) {
        try {
          if (tickerResult.error) {
            processorLogger.warn(`Skipping ticker ${tickerResult.ticker} due to error: ${tickerResult.error}`, {
              userId: user.id,
              ticker: tickerResult.ticker
            });
            continue;
          }

          if (!tickerResult.filings || tickerResult.filings.length === 0) {
            processorLogger.debug(`No filings found for ticker ${tickerResult.ticker}`, {
              userId: user.id,
              ticker: tickerResult.ticker,
              cacheHit: tickerResult.cacheHit
            });
            continue;
          }

          processorLogger.info(`Processing ${tickerResult.filings.length} filings for ${tickerResult.ticker}`, {
            userId: user.id,
            ticker: tickerResult.ticker,
            cacheHit: tickerResult.cacheHit,
            apiCallTime: tickerResult.apiCallTime
          });

          // Process each filing for this ticker
          for (const filing of tickerResult.filings) {
            try {
              if (!filing || !filing.accessionNumber) {
                processorLogger.warn('Invalid filing object encountered in deduplication', {
                  userId: user.id,
                  ticker: tickerResult.ticker,
                  filing: filing
                });
                continue;
              }

              const filingResult = await this.processDeduplicatedFiling(
                filing,
                user,
                tier,
                tickerResult
              );

              if (filingResult.success) {
                result.filingsProcessed++;
                result.cost += filingResult.cost;

                // Mark filing as processed
                await CronSecFilingService.markFilingAsProcessed(
                  filing.accessionNumber,
                  tickerResult.ticker,
                  user.id
                );
              }

              // Respect tier-based processing limits
              const maxFilings = CronBudgetService.getBatchSizeForTier(tier);
              if (result.filingsProcessed >= maxFilings) {
                processorLogger.info(`Reached tier limit for user ${user.id}: ${maxFilings} filings`, {
                  tier,
                  filingsProcessed: result.filingsProcessed
                });
                break;
              }

            } catch (filingError) {
              processorLogger.error(`Failed to process filing ${filing.accessionNumber} (dedup)`, {
                error: filingError instanceof Error ? filingError.message : 'Unknown error',
                userId: user.id,
                ticker: tickerResult.ticker
              });
            }
          }

          // Break if we've hit the tier limit
          const maxFilings = CronBudgetService.getBatchSizeForTier(tier);
          if (result.filingsProcessed >= maxFilings) {
            break;
          }

        } catch (tickerError) {
          processorLogger.error(`Failed to process ticker ${tickerResult.ticker} for user ${user.id} (dedup)`, {
            error: tickerError instanceof Error ? tickerError.message : 'Unknown error',
            userId: user.id,
            ticker: tickerResult.ticker
          });
        }
      }

    } catch (error) {
      processorLogger.error(`Failed to process SEC filings for user ${user.id} (dedup)`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        tier,
        userFilingResults: userFilingResults.length
      });
    }

    processorLogger.info(`Completed deduplication processing for user ${user.id}`, {
      filingsProcessed: result.filingsProcessed,
      cost: result.cost,
      tier
    });

    return result;
  }

  /**
   * Process a single filing with transaction boundaries
   */
  private static async processSingleFiling(
    filing: unknown,
    user: DatabaseUser | User,
    tier: string,
    tickerValidation: { symbol: string; cik: string },
    originalTicker: { companyName?: string }
  ): Promise<{ success: boolean; cost: number; error?: string }> {
    try {
      // Create filing object for processing
      const filingRecord = filing as { id: string; accessionNumber: string; filingType?: string; filingDate?: Date; filingUrl?: string };
      const filingForProcessing: FilingForProcessing = {
        id: filingRecord.id,
        accessionNumber: filingRecord.accessionNumber,
        formType: filingRecord.filingType || 'Unknown',
        filingDate: filingRecord.filingDate || new Date(),
        filingUrl: filingRecord.filingUrl,
        tickerData: {
          symbol: tickerValidation.symbol,
          cik: tickerValidation.cik,
          companyName: originalTicker?.companyName || 'Unknown Company'
        }
      };

      // Process filing with transaction
      const transactionResult = await FilingTransactionManager.processFilingWithTransaction(
        filingRecord.id,
        user.id,
        async (tx) => {
          return await this.processSecFilingWithinTransaction(
            filingForProcessing,
            user,
            tier,
            tx
          );
        },
        {
          timeout: FILING_PROCESSING_TIMEOUT,
          description: `Process filing ${filingRecord.accessionNumber} for user ${user.id}`
        } as TransactionOptions
      );

      if (transactionResult.success && transactionResult.data) {
        processorLogger.info(`Filing processed successfully with transaction`, {
          filingId: filingRecord.accessionNumber,
          userId: user.id,
          transactionId: transactionResult.transactionId,
          cost: transactionResult.data.cost
        });

        return {
          success: true,
          cost: transactionResult.data.cost || 0
        };
      } else {
        processorLogger.error(`Filing transaction failed`, {
          filingId: filing.accessionNumber,
          userId: user.id,
          error: transactionResult.error?.message,
          transactionId: transactionResult.transactionId
        });

        return {
          success: false,
          cost: 0,
          error: transactionResult.error?.message || 'Transaction failed'
        };
      }

    } catch (error) {
      processorLogger.error(`Failed to process single filing`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        filingId: filing.accessionNumber,
        userId: user.id
      });

      return {
        success: false,
        cost: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process a filing from deduplicated results
   */
  private static async processDeduplicatedFiling(
    filing: unknown,
    user: DatabaseUser,
    tier: string,
    tickerResult: UserFilingResult
  ): Promise<{ success: boolean; cost: number; error?: string }> {
    try {
      // Create filing object for processing
      const filingRecord = filing as { 
        id?: string; 
        accessionNumber: string; 
        filingType?: string; 
        formType?: string; 
        filingDate?: Date | string; 
        filingUrl?: string; 
        url?: string;
        cik?: string;
        companyName?: string;
      };
      const filingForProcessing: FilingForProcessing = {
        id: filingRecord.id || `${filingRecord.accessionNumber}-${tickerResult.ticker}`,
        accessionNumber: filingRecord.accessionNumber,
        formType: filingRecord.filingType || filingRecord.formType || 'Unknown',
        filingDate: filingRecord.filingDate ? new Date(filingRecord.filingDate) : new Date(),
        filingUrl: filingRecord.filingUrl || filingRecord.url,
        tickerData: {
          symbol: tickerResult.ticker,
          cik: filingRecord.cik || 'unknown',
          companyName: filingRecord.companyName || user.tickers.find(t => t.symbol === tickerResult.ticker)?.companyName || 'Unknown Company'
        }
      };

      // Convert DatabaseUser to User interface for processing
      const userForProcessing: User = {
        id: user.id,
        email: user.email || undefined,
        tickers: user.tickers || [],
        subscriptionTier: user.subscriptionTier,
        lastCronProcessed: user.lastCronProcessed,
        processingBudget: user.processingBudget || 0,
        budgetUsed: user.budgetUsed || 0
      };

      // Process filing with transaction
      const transactionResult = await FilingTransactionManager.processFilingWithTransaction(
        filingForProcessing.id,
        user.id,
        async (tx) => {
          return await this.processSecFilingWithinTransaction(
            filingForProcessing,
            userForProcessing,
            tier,
            tx
          );
        },
        {
          timeout: FILING_PROCESSING_TIMEOUT,
          description: `Process filing ${filing.accessionNumber} for user ${user.id} (dedup)`
        } as TransactionOptions
      );

      if (transactionResult.success && transactionResult.data) {
        processorLogger.info(`Filing processed successfully with transaction (dedup)`, {
          filingId: filing.accessionNumber,
          userId: user.id,
          transactionId: transactionResult.transactionId,
          cost: transactionResult.data.cost
        });

        return {
          success: true,
          cost: transactionResult.data.cost || 0
        };
      } else {
        processorLogger.error(`Filing transaction failed (dedup)`, {
          filingId: filing.accessionNumber,
          userId: user.id,
          error: transactionResult.error?.message,
          transactionId: transactionResult.transactionId
        });

        return {
          success: false,
          cost: 0,
          error: transactionResult.error?.message || 'Transaction failed'
        };
      }

    } catch (error) {
      processorLogger.error(`Failed to process deduplicated filing`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        filingId: filing.accessionNumber,
        userId: user.id
      });

      return {
        success: false,
        cost: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Process SEC filing within a database transaction context
   */
  private static async processSecFilingWithinTransaction(
    filingForProcessing: FilingForProcessing,
    user: User,
    tier: string,
    tx: Prisma.TransactionClient
  ): Promise<{ success: boolean; cost?: number; error?: string }> {
    try {
      processorLogger.info(`Processing filing ${filingForProcessing.accessionNumber} for user ${user.id} within transaction`, {
        tier,
        filingType: filingForProcessing.formType,
        userId: user.id,
        ticker: filingForProcessing.tickerData.symbol
      });

      // Dynamic imports to avoid build-time dependencies
      const { generateAISummaryWithRetry } = await import('../../services/filing/summaryGenerationService');
      const { sendEmailSummary } = await import('../../services/filing/sendEmailSummary');
      const { getFilingContent } = await import('../../services/filings/filingRetrieval');

      // 1. Fetch the actual filing content
      let filingContent = '';
      try {
        processorLogger.info(`Fetching content for filing ${filingForProcessing.accessionNumber}`, {
          cik: filingForProcessing.tickerData.cik,
          ticker: filingForProcessing.tickerData.symbol
        });

        filingContent = await getFilingContent(
          filingForProcessing.accessionNumber,
          '1', // Use document sequence 1 as primary document
          filingForProcessing.tickerData.cik
        );

        processorLogger.info(`Successfully fetched content for filing ${filingForProcessing.accessionNumber}`, {
          contentLength: filingContent.length,
          ticker: filingForProcessing.tickerData.symbol
        });
      } catch (contentError) {
        processorLogger.error(`Failed to fetch content for filing ${filingForProcessing.accessionNumber}`, {
          error: contentError instanceof Error ? contentError.message : 'Unknown error',
          ticker: filingForProcessing.tickerData.symbol,
          cik: filingForProcessing.tickerData.cik
        });
        throw new Error(`Failed to fetch filing content: ${contentError instanceof Error ? contentError.message : 'Unknown error'}`);
      }

      // 2. Check for existing summary (cache hit detection)
      let existingSummary = null;
      try {
        existingSummary = await tx.summary.findFirst({
          where: {
            ticker: {
              symbol: filingForProcessing.tickerData.symbol
            },
            filingType: filingForProcessing.formType,
            filingDate: filingForProcessing.filingDate
          },
          orderBy: { createdAt: 'desc' }
        });

        if (existingSummary && existingSummary.summaryText) {
          processorLogger.info(`Cache hit found for filing ${filingForProcessing.accessionNumber}`, {
            userId: user.id,
            ticker: filingForProcessing.tickerData.symbol,
            existingSummaryId: existingSummary.id,
            cacheUsageCount: existingSummary.cacheUsageCount
          });
        }
      } catch (cacheCheckError) {
        processorLogger.warn(`Cache check failed for filing ${filingForProcessing.accessionNumber}`, {
          error: cacheCheckError instanceof Error ? cacheCheckError.message : String(cacheCheckError)
        });
      }

      // 3. Generate AI summary (or use cached version)
      let summaryResult;
      
      if (existingSummary && existingSummary.summaryText) {
        // Use cached summary
        summaryResult = {
          summary: existingSummary.summaryText,
          keyPoints: (existingSummary.summaryJSON as Record<string, unknown>)?.keyPoints || [],
          tokensUsed: 0, // No new tokens used for cache hit
          inputTokens: 0,
          outputTokens: 0,
          cost: 0, // No new cost for cache hit
          processingStatus: 'CACHE_HIT',
          correlationId: `cache_hit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        };

        // Update cache analytics for existing summary
        await tx.summary.update({
          where: { id: existingSummary.id },
          data: {
            cacheUsageCount: { increment: 1 },
            lastCacheUsed: new Date()
          }
        });

        // Create cache access record
        await tx.summaryCacheAccess.create({
          data: {
            summaryId: existingSummary.id,
            userId: user.id,
            accessedAt: new Date(),
            accessType: 'EMAIL'
          }
        });

        processorLogger.info(`Using cached summary for filing ${filingForProcessing.accessionNumber}`, {
          userId: user.id,
          ticker: filingForProcessing.tickerData.symbol,
          cachedSummaryId: existingSummary.id,
          newCacheUsageCount: existingSummary.cacheUsageCount + 1
        });
      } else {
        // Generate new AI summary
        summaryResult = await generateAISummaryWithRetry(
          filingContent,
          {
            accessionNumber: filingForProcessing.accessionNumber,
            formType: filingForProcessing.formType,
            filingDate: filingForProcessing.filingDate.toISOString()
          },
          {
            name: filingForProcessing.tickerData.companyName,
            ticker: filingForProcessing.tickerData.symbol
          },
          2 // max retries
        );

        processorLogger.info(`Generated new AI summary for filing ${filingForProcessing.accessionNumber}`, {
          userId: user.id,
          ticker: filingForProcessing.tickerData.symbol,
          tokensUsed: summaryResult.tokensUsed || 0,
          cost: summaryResult.cost || 0,
          processingStatus: summaryResult.processingStatus
        });
      }

      const actualCost = summaryResult.cost || 0;

      // 3. Store the summary in database using transaction context
      let summaryRecord: Summary | null = null;
      try {
        const tickerRecord = await tx.ticker.findFirst({
          where: { symbol: filingForProcessing.tickerData.symbol }
        });

        if (tickerRecord) {
          summaryRecord = await tx.summary.create({
            data: {
              tickerId: tickerRecord.id,
              filingType: filingForProcessing.formType,
              filingDate: filingForProcessing.filingDate,
              filingUrl: filingForProcessing.filingUrl || '',
              summaryText: summaryResult.summary,
              summaryJSON: {
                ticker: filingForProcessing.tickerData.symbol,
                accessionNumber: filingForProcessing.accessionNumber,
                filingType: filingForProcessing.formType,
                summaryText: summaryResult.summary,
                keyPoints: summaryResult.keyPoints || [],
                cost: actualCost,
                inputTokens: summaryResult.inputTokens || 0,
                outputTokens: summaryResult.outputTokens || 0
              },
              tokensUsed: summaryResult.tokensUsed || 0,
              cost: actualCost,
              sentToUser: false,
              // Enhanced Cost and Token Tracking
              inputTokens: summaryResult.inputTokens || 0,
              outputTokens: summaryResult.outputTokens || 0,
              totalCost: actualCost,
              // Cache and Reuse Analytics (defaults for new summary)
              isCacheHit: false,
              cacheUsageCount: 0,
              // Performance Metrics
              modelVersion: summaryResult.model || 'unknown',
              // Business Analytics (will be updated when emails are sent)
              uniqueUsersServed: 0,
              totalEmailsSent: 0,
              // Processing metadata
              processingStatus: summaryResult.processingStatus || 'SUCCESS',
              processingTimeMs: summaryResult.processingTime || 0
            }
          });

          processorLogger.info(`Enhanced summary stored for filing ${filingForProcessing.accessionNumber}`, {
            userId: user.id,
            ticker: filingForProcessing.tickerData.symbol,
            cost: actualCost,
            summaryId: summaryRecord.id,
            tokensUsed: summaryResult.tokensUsed || 0
          });
        }
      } catch (dbError) {
        processorLogger.error(`Failed to store summary for filing ${filingForProcessing.accessionNumber}`, { 
          error: dbError,
          userId: user.id 
        });
        // Don't fail the whole process for DB storage errors in transaction context
        // The transaction will be rolled back if this function throws
      }

      // 4. Send email notification if user has email with bulletproof deduplication
      if (user.email && summaryRecord) {
        try {
          const emailResult = await sendEmailSummary(
            user.email,
            [filingForProcessing.tickerData.symbol],
            false, // not debug mode
            user.id // Pass user ID for bulletproof deduplication
          );
          
          if (emailResult.success) {
            // Email delivery tracking is now handled atomically in sendEmailSummary function
            // Update summary analytics - increment email counters
            await tx.summary.update({
              where: { id: summaryRecord.id },
              data: {
                sentToUser: true,
                totalEmailsSent: { increment: 1 },
                uniqueUsersServed: { increment: 1 } // First email to this user for this summary
              }
            });

            processorLogger.info(`Bulletproof email sent successfully for filing ${filingForProcessing.accessionNumber}`, {
              userId: user.id,
              email: user.email,
              ticker: filingForProcessing.tickerData.symbol,
              summaryId: summaryRecord.id,
              duplicatesDetected: emailResult.duplicatesDetected || 0,
              emailServiceId: emailResult.emailServiceId
            });
          } else {
            processorLogger.warn(`Email sending failed for filing ${filingForProcessing.accessionNumber}`, {
              userId: user.id,
              email: user.email,
              error: emailResult.error,
              summaryId: summaryRecord.id
            });
          }
        } catch (emailError) {
          processorLogger.error(`Email service error for filing ${filingForProcessing.accessionNumber}`, {
            error: emailError,
            userId: user.id,
            email: user.email,
            summaryId: summaryRecord?.id
          });
          // Don't fail the whole process for email errors
        }
      } else {
        if (!user.email) {
          processorLogger.debug(`No email address for user ${user.id}, skipping email notification`);
        }
        if (!summaryRecord) {
          processorLogger.warn(`No summary record created for filing ${filingForProcessing.accessionNumber}, skipping email`);
        }
      }
      
      processorLogger.info(`Successfully processed filing ${filingForProcessing.accessionNumber} for user ${user.id} within transaction`, {
        tier,
        filingType: filingForProcessing.formType,
        actualCost,
        summaryGenerated: !!summaryResult.summary
      });
      
      return {
        success: true,
        cost: actualCost
      };
      
    } catch (error) {
      processorLogger.error(`Failed to process filing ${filingForProcessing.accessionNumber} within transaction`, { 
        error,
        userId: user.id,
        tier,
        filingType: filingForProcessing.formType
      });
      return {
        success: false,
        cost: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}