/**
 * Filing processing engine for cron jobs
 * Handles individual filing processing, AI summarization, and email notifications
 * Extracted from app/api/cron/tier-aware/route.ts
 */

import { Prisma, Summary } from '@prisma/client';
import { logger } from '../logging';
// import { getPrismaClient } from '../db/prisma';
import { FilingTransactionManager } from '../db/transaction-manager';
import { generateSecureCorrelationId } from '../security/secure-random';
import { CronSecFilingService } from './sec-filing-service';
import { CronBudgetService } from './budget-service';
import { boundedContextManager } from './bounded-context-manager';
import { validateSummaryWithAI, type SummaryValidationResult } from '../validation/summary-content-validator';
import type {
  DatabaseUser,
  User,
  FilingForProcessing,
  UserFilingResult,
  TransactionOptions,
  ProcessingContext
} from './types';
import { FILING_PROCESSING_TIMEOUT } from './types';

const processorLogger = logger.child('cron-filing-processor');

export class CronFilingProcessor {
  /**
   * Retry configuration for failed filing processing
   */
  private static readonly RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    retryableErrors: [
      'timeout',
      'network',
      'api_error',
      'rate_limit',
      'temporary_failure'
    ]
  };

  /**
   * Process SEC filings for a specific user with tier-aware optimization
   */
  static async processUserTierFilings(
    user: DatabaseUser | User,
    tier: string
  ): Promise<{ filingsProcessed: number; cost: number; processingContext?: ProcessingContext }> {
    const result = {
      filingsProcessed: 0,
      cost: 0
    };

    // Collection of individual processing contexts for aggregation
    const individualContexts: ProcessingContext[] = [];

    // Enhanced metrics tracking for filing processing
    const processingMetrics = {
      totalAttempted: 0,
      successful: 0,
      permanentFailures: 0,
      transientFailures: 0,
      errorBreakdown: {
        filingNotFound: 0,
        invalidAccessionNumber: 0,
        contentValidationFailed: 0,
        aiGenerationFailed: 0,
        networkTimeouts: 0,
        rateLimited: 0,
        unknownErrors: 0
      },
      processingTimes: [] as number[]
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

          // Get ALL unprocessed filings for this ticker (including historical backlog)
          const unprocessedFilings = await CronSecFilingService.getUnprocessedFilingsForUser(
            tickerValidation.symbol,
            user.id
          );

          processorLogger.info(`Found ${unprocessedFilings.length} unprocessed filings for ${tickerValidation.symbol} (including backlog)`, {
            userId: user.id,
            ticker: tickerValidation.symbol,
            filingsFound: unprocessedFilings.map(f => ({
              accession: f.accessionNumber,
              type: f.filingType,
              date: f.filingDate
            }))
          });

          // CRITICAL: Prioritize processing ALL unprocessed filings to reach 0 target
          if (unprocessedFilings.length > 0) {
            processorLogger.info(`Processing backlog of ${unprocessedFilings.length} unprocessed filings for ${tickerValidation.symbol}`, {
              userId: user.id,
              ticker: tickerValidation.symbol
            });
          }

          // Process each filing from the complete unprocessed backlog
          for (const filing of unprocessedFilings || []) {
            const filingStartTime = Date.now();
            processingMetrics.totalAttempted++;
            
            try {
              if (!filing || !filing.id || !filing.accessionNumber) {
                processorLogger.warn('Invalid filing object encountered', {
                  userId: user.id,
                  ticker: tickerValidation.symbol,
                  filing: filing
                });
                processingMetrics.errorBreakdown.unknownErrors++;
                continue;
              }

              const filingResult = await this.processSingleFiling(
                filing,
                user,
                tier,
                tickerValidation,
                originalTicker
              );

              const filingProcessingTime = Date.now() - filingStartTime;
              processingMetrics.processingTimes.push(filingProcessingTime);

              // OPTIMIZATION: Add context to bounded manager instead of accumulating unlimited contexts
              if (filingResult.processingContext) {
                boundedContextManager.addContext(user.id, filingResult.processingContext);
                individualContexts.push(filingResult.processingContext);
              }

              if (filingResult.success) {
                result.filingsProcessed++;
                result.cost += filingResult.cost;
                processingMetrics.successful++;

                // Mark filing as processed - CRITICAL for reducing backlog to 0
                await CronSecFilingService.markFilingAsProcessed(
                  filing.accessionNumber,
                  tickerValidation.symbol,
                  user.id
                );
                
                processorLogger.info(`Successfully processed and marked filing ${filing.accessionNumber}`, {
                  userId: user.id,
                  ticker: tickerValidation.symbol,
                  filingType: filing.filingType,
                  cost: filingResult.cost,
                  processingTimeMs: filingProcessingTime
                });
              } else {
                // Classify the error for detailed metrics
                this.categorizeFilingError(filingResult.error, processingMetrics);
                
                // Implement retry logic for failed filings
                const isRetryable = this.isRetryableError(filingResult.error);
                if (isRetryable) {
                  processingMetrics.transientFailures++;
                  processorLogger.warn(`Filing ${filing.accessionNumber} failed with retryable error, will be retried in next cron run`, {
                    userId: user.id,
                    ticker: tickerValidation.symbol,
                    error: filingResult.error,
                    errorCode: filingResult.errorCode,
                    isRetryable: filingResult.isRetryable,
                    filingType: filing.filingType,
                    processingTimeMs: filingProcessingTime,
                    nextRetry: 'Next cron execution'
                  });
                  // Filing remains marked as unprocessed, will be picked up in next run
                } else {
                  processingMetrics.permanentFailures++;
                  processorLogger.error(`Filing ${filing.accessionNumber} failed with non-retryable error - skipping permanently`, {
                    userId: user.id,
                    ticker: tickerValidation.symbol,
                    error: filingResult.error,
                    errorCode: filingResult.errorCode,
                    isRetryable: filingResult.isRetryable,
                    filingType: filing.filingType,
                    processingTimeMs: filingProcessingTime,
                    action: 'Marked as permanently failed'
                  });
                  
                  // Mark as permanently failed to avoid infinite retries
                  try {
                    await CronSecFilingService.markFilingAsProcessed(
                      filing.accessionNumber,
                      tickerValidation.symbol,
                      user.id
                    );
                  } catch (markError) {
                    processorLogger.error(`Failed to mark filing ${filing.accessionNumber} as permanently failed`, {
                      error: markError instanceof Error ? markError.message : 'Unknown error'
                    });
                  }
                }
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
              const filingProcessingTime = Date.now() - filingStartTime;
              processingMetrics.processingTimes.push(filingProcessingTime);
              processingMetrics.errorBreakdown.unknownErrors++;
              processingMetrics.permanentFailures++;
              
              processorLogger.error(`Failed to process filing ${filing.accessionNumber} - unexpected error`, {
                error: filingError instanceof Error ? filingError.message : 'Unknown error',
                errorType: filingError instanceof Error ? filingError.constructor.name : 'Unknown',
                userId: user.id,
                ticker: tickerValidation.symbol,
                cik: tickerValidation.cik,
                filingType: filing.filingType,
                processingTimeMs: filingProcessingTime,
                action: 'Continue processing other filings'
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

    // Calculate final metrics
    const avgProcessingTime = processingMetrics.processingTimes.length > 0 
      ? Math.round(processingMetrics.processingTimes.reduce((a, b) => a + b, 0) / processingMetrics.processingTimes.length)
      : 0;
    
    const successRate = processingMetrics.totalAttempted > 0 
      ? Math.round((processingMetrics.successful / processingMetrics.totalAttempted) * 100)
      : 0;

    processorLogger.info(`📊 User processing metrics for ${user.id}`, {
      userId: user.id,
      tier,
      summary: {
        filingsProcessed: result.filingsProcessed,
        totalCost: result.cost,
        totalAttempted: processingMetrics.totalAttempted,
        successful: processingMetrics.successful,
        successRate: `${successRate}%`,
        permanentFailures: processingMetrics.permanentFailures,
        transientFailures: processingMetrics.transientFailures,
        avgProcessingTimeMs: avgProcessingTime
      },
      errorBreakdown: processingMetrics.errorBreakdown,
      resilience: {
        continuedOnFailures: processingMetrics.totalAttempted > processingMetrics.successful,
        totalFailures: processingMetrics.permanentFailures + processingMetrics.transientFailures,
        retriableFailures: processingMetrics.transientFailures
      }
    });

    // OPTIMIZATION: Use bounded context manager to prevent memory growth
    // Old approach was accumulating unlimited contexts causing memory issues
    const aggregateContext: ProcessingContext = boundedContextManager.createBoundedAggregateContext(
      user.id,
      tier,
      individualContexts,
      result.cost,
      result.filingsProcessed
    );

    // Clean up completed contexts to free memory
    boundedContextManager.cleanupCompletedContexts(user.id);

    processorLogger.debug('Created aggregate processing context for user tier filings', {
      userId: user.id,
      tier,
      totalCost: result.cost,
      filingsProcessed: result.filingsProcessed,
      individualContextsCount: individualContexts.length,
      aggregateContext
    });

    return {
      ...result,
      processingContext: aggregateContext
    };
  }

  /**
   * Process user filings using deduplicated filing results (optimized)
   */
  static async processUserWithDeduplicatedFilings(
    user: DatabaseUser,
    tier: string,
    userFilingResults: UserFilingResult[]
  ): Promise<{ filingsProcessed: number; cost: number; filingsSkipped?: number }> {
    const result = {
      filingsProcessed: 0,
      cost: 0,
      filingsSkipped: 0
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

              // Pre-filter: Check if filing is already processed before transaction
              const { checkIfFilingProcessed } = await import('../../services/filings/utils/filingProcessingStatus');
              const isAlreadyProcessed = await checkIfFilingProcessed(
                tickerResult.ticker,
                filing.filingType,
                filing.accessionNumber
              );

              if (isAlreadyProcessed) {
                processorLogger.debug('Skipping already processed filing', {
                  userId: user.id,
                  ticker: tickerResult.ticker,
                  accessionNumber: filing.accessionNumber,
                  filingType: filing.filingType,
                  optimization: 'pre-filter'
                });
                result.filingsSkipped = (result.filingsSkipped || 0) + 1;
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

    // Create processing context based on the operations performed
    const processingContext: ProcessingContext = {
      userId: user.id,
      tier,
      operation: 'tier-aware-cron-processing-dedup',
      operationType: result.cost === 0 ? 'cached_summary' : 'ai_generation',
      isCached: result.cost === 0
    };

    processorLogger.info(`Completed deduplication processing for user ${user.id}`, {
      filingsProcessed: result.filingsProcessed,
      filingsSkipped: result.filingsSkipped,
      cost: result.cost,
      tier,
      optimization: result.filingsSkipped > 0 ? `Saved ${result.filingsSkipped} unnecessary transactions` : 'No optimization applied',
      context: processingContext
    });

    return {
      ...result,
      processingContext
    };
  }

  /**
   * Process a single filing with transaction boundaries
   *
   * @param filing - The SEC filing record to process
   * @param user - The user requesting the filing
   * @param tier - User's subscription tier
   * @param tickerValidation - Validated ticker information (symbol and CIK)
   * @param originalTicker - Original ticker data including company name
   * @param signal - Optional AbortSignal for cancelling in-flight requests on timeout
   */
  public static async processSingleFiling(
    filing: unknown,
    user: DatabaseUser | User,
    tier: string,
    tickerValidation: { symbol: string; cik: string },
    originalTicker: { companyName?: string },
    signal?: AbortSignal
  ): Promise<{ success: boolean; cost: number; error?: string; processingContext?: ProcessingContext }> {
    try {
      // Check if already aborted before starting
      if (signal?.aborted) {
        processorLogger.warn('Filing processing aborted before starting', {
          userId: user.id,
          ticker: tickerValidation.symbol,
          reason: 'Job timeout exceeded'
        });
        return {
          success: false,
          cost: 0,
          error: 'Processing aborted: Job timeout exceeded before filing processing started'
        };
      }

      // Create filing object for processing
      const filingRecord = filing as { id: string; accessionNumber: string; filingType?: string; filingDate?: Date; filingUrl?: string };

      // Validate required fields
      if (!filingRecord?.id) {
        processorLogger.error('Filing record missing required id field', {
          filing,
          filingRecord,
          accessionNumber: filingRecord?.accessionNumber
        });
        return {
          success: false,
          cost: 0,
          error: 'Filing record missing required id field'
        };
      }

      if (!filingRecord.accessionNumber) {
        processorLogger.error('Filing record missing required accessionNumber field', {
          filing,
          filingRecord,
          id: filingRecord.id
        });
        return {
          success: false,
          cost: 0,
          error: 'Filing record missing required accessionNumber field'
        };
      }

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
          cost: transactionResult.data.cost || 0,
          processingContext: transactionResult.data.processingContext
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
          error: transactionResult.error?.message || 'Transaction failed',
          processingContext: transactionResult.data?.processingContext
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
        // Note: No context available for outer catch errors
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
        lastCronProcessed: user.lastCronProcessed
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
  ): Promise<{ 
    success: boolean; 
    cost?: number; 
    error?: string;
    filingData?: FilingForProcessing;
    errorCode?: string;
    isRetryable?: boolean;
    processingTime?: number;
    metadata?: Record<string, unknown>;
    processingContext?: ProcessingContext;
  }> {
    const processingStartTime = Date.now();
    
    // Initialize processing context - will be updated as processing progresses
    let processingContext: ProcessingContext = {
      userId: user.id,
      tier,
      operation: 'tier-aware-cron-processing',
      operationType: 'ai_generation', // Default, will be updated based on actual processing
      isCached: false,              // Default, will be updated if cache is used
      processingStartTime
    };
    
    try {
      processorLogger.info(`Processing filing ${filingForProcessing.accessionNumber} for user ${user.id} within transaction`, {
        tier,
        filingType: filingForProcessing.formType,
        userId: user.id,
        ticker: filingForProcessing.tickerData.symbol
      });

      // Dynamic imports to avoid build-time dependencies
      const { generateAISummaryWithRetry } = await import('../../services/filing/summaryGenerationService');
      const { queueEmail } = await import('../email/async-email-queue');
      const { generateHtmlEmail, generatePlainTextEmail } = await import('../../services/filings/email/emailGenerator');
      const { getFilingContentWithRetry } = await import('../../services/filings/filingRetrieval');
      const { FilingContentValidator } = await import('../validation/filing-content-validator');

      // Validate critical imports succeeded
      if (typeof generateAISummaryWithRetry !== 'function') {
        throw new Error('Failed to import generateAISummaryWithRetry - AI summarization will not work');
      }
      if (typeof queueEmail !== 'function') {
        throw new Error('Failed to import queueEmail - async email notifications will not work');
      }
      if (typeof getFilingContentWithRetry !== 'function') {
        throw new Error('Failed to import getFilingContentWithRetry - filing retrieval will not work');
      }
      if (typeof FilingContentValidator !== 'function') {
        throw new Error('Failed to import FilingContentValidator - content validation will not work');
      }

      processorLogger.info(`Successfully imported all dependencies for filing ${filingForProcessing.accessionNumber}`, {
        userId: user.id,
        ticker: filingForProcessing.tickerData.symbol
      });

      // STEP 1: Fetch the actual filing content
      processorLogger.info(`🔄 STEP 1: Starting content fetch for filing ${filingForProcessing.accessionNumber}`, {
        userId: user.id,
        ticker: filingForProcessing.tickerData.symbol,
        cik: filingForProcessing.tickerData.cik,
        formType: filingForProcessing.formType
      });

      let filingContent = '';
      const contentFetchStartTime = Date.now();
      
      // STEP 1: Use resilient filing retrieval with comprehensive error handling
      const retrievalResult: FilingRetrievalResult = await getFilingContentWithRetry(
        filingForProcessing.accessionNumber,
        '1', // Use document sequence 1 as primary document
        filingForProcessing.tickerData.cik
      );

      const contentFetchDuration = Date.now() - contentFetchStartTime;

      if (retrievalResult.success && retrievalResult.content) {
        filingContent = retrievalResult.content;
        
        processorLogger.info(`✅ STEP 1 COMPLETE: Content fetch successful for filing ${filingForProcessing.accessionNumber}`, {
          userId: user.id,
          ticker: filingForProcessing.tickerData.symbol,
          contentLength: filingContent.length,
          fetchDurationMs: contentFetchDuration,
          attemptCount: retrievalResult.metadata.attemptCount,
          finalUrl: retrievalResult.metadata.finalUrl,
          nextStep: 'Content validation'
        });
      } else {
        // Handle filing retrieval failure gracefully - don't throw, return error result
        const error = retrievalResult.error!;
        
        processorLogger.warn(`⚠️ STEP 1 FAILED: Filing retrieval failed for ${filingForProcessing.accessionNumber}`, {
          userId: user.id,
          ticker: filingForProcessing.tickerData.symbol,
          cik: filingForProcessing.tickerData.cik,
          errorCode: error.errorCode,
          isRetryable: error.isRetryable,
          httpStatus: error.httpStatus,
          attemptCount: retrievalResult.metadata.attemptCount,
          totalDuration: retrievalResult.metadata.totalDuration,
          errorMessage: error.message
        });

        // Return a graceful failure result instead of throwing
        return {
          success: false,
          filingData: filingForProcessing,
          error: `Filing retrieval failed: ${error.errorCode} - ${error.message}`,
          errorCode: error.errorCode,
          isRetryable: error.isRetryable,
          processingTime: Date.now() - processingStartTime,
          metadata: {
            step: 'filing_retrieval',
            attemptCount: retrievalResult.metadata.attemptCount,
            errorType: error.isRetryable ? 'transient' : 'permanent'
          }
        };
      }

      // STEP 1.5: Validate content to prevent NoSuchKey errors and invalid content from reaching AI
      processorLogger.info(`🔄 STEP 1.5: Validating content for filing ${filingForProcessing.accessionNumber}`, {
        userId: user.id,
        ticker: filingForProcessing.tickerData.symbol,
        contentLength: filingContent.length,
        formType: filingForProcessing.formType
      });

      const validationStartTime = Date.now();
      
      try {
        const documentUrl = filingForProcessing.filingUrl || `filing-${filingForProcessing.accessionNumber}`;
        const validationResult = await FilingContentValidator.validate(
          filingContent,
          filingForProcessing.accessionNumber,
          documentUrl
        );

        const validationDuration = Date.now() - validationStartTime;

        if (!validationResult.isValid) {
          // Content is invalid - log details and fail the filing
          processorLogger.error(`❌ STEP 1.5 FAILED: Content validation failed for filing ${filingForProcessing.accessionNumber}`, {
            userId: user.id,
            ticker: filingForProcessing.tickerData.symbol,
            validationError: validationResult.error?.name,
            validationCode: validationResult.error?.code,
            failureReason: validationResult.failureReason,
            validationTimeMs: validationDuration,
            contentLength: filingContent.length,
            detectedFormat: validationResult.validationMetrics.detectedFormat,
            hasNoSuchKey: validationResult.validationMetrics.hasNoSuchKey,
            retryable: validationResult.error?.retryable,
            costSaved: '$0.152' // Approximate cost saved by preventing AI processing
          });

          // Throw the validation error to fail the filing processing
          throw validationResult.error || new Error(validationResult.failureReason || 'Content validation failed');
        }

        processorLogger.info(`✅ STEP 1.5 COMPLETE: Content validation passed for filing ${filingForProcessing.accessionNumber}`, {
          userId: user.id,
          ticker: filingForProcessing.tickerData.symbol,
          validationTimeMs: validationDuration,
          contentLength: filingContent.length,
          detectedFormat: validationResult.validationMetrics.detectedFormat,
          extractedYear: validationResult.validationMetrics.extractedYear,
          nextStep: 'Cache check and AI summarization'
        });

      } catch (validationError) {
        processorLogger.error(`Content validation error for filing ${filingForProcessing.accessionNumber}`, {
          error: validationError instanceof Error ? validationError.message : 'Unknown validation error',
          ticker: filingForProcessing.tickerData.symbol,
          cik: filingForProcessing.tickerData.cik,
          userId: user.id,
          validationTimeMs: Date.now() - validationStartTime
        });
        throw new Error(`Content validation failed: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`);
      }

      // STEP 2: Check for existing summary (cache hit detection)
      processorLogger.info(`🔄 STEP 2: Checking for cached summary for filing ${filingForProcessing.accessionNumber}`, {
        userId: user.id,
        ticker: filingForProcessing.tickerData.symbol,
        formType: filingForProcessing.formType,
        filingDate: filingForProcessing.filingDate
      });

      let existingSummary = null;
      const cacheCheckStartTime = Date.now();
      
      try {
        existingSummary = await tx.summary.findFirst({
          where: {
            ticker: {
              symbol: filingForProcessing.tickerData.symbol
            },
            filingType: filingForProcessing.formType,
            filingDate: filingForProcessing.filingDate,
            // Skip summaries marked for force refresh (cache invalidation)
            forceRefreshFlag: { not: true }
          },
          orderBy: { createdAt: 'desc' }
        });

        const cacheCheckDuration = Date.now() - cacheCheckStartTime;

        // Check if there's an invalidated summary we're bypassing
        const invalidatedSummary = await tx.summary.findFirst({
          where: {
            ticker: {
              symbol: filingForProcessing.tickerData.symbol
            },
            filingType: filingForProcessing.formType,
            filingDate: filingForProcessing.filingDate,
            forceRefreshFlag: true
          },
          orderBy: { createdAt: 'desc' }
        });

        if (invalidatedSummary) {
          processorLogger.info(`🔄 CACHE INVALIDATION DETECTED: Forcing OpenRouter call for filing ${filingForProcessing.accessionNumber}`, {
            userId: user.id,
            ticker: filingForProcessing.tickerData.symbol,
            invalidatedSummaryId: invalidatedSummary.id,
            invalidationReason: invalidatedSummary.invalidationReason,
            invalidatedBy: invalidatedSummary.invalidatedBy,
            lastInvalidatedAt: invalidatedSummary.lastInvalidatedAt,
            cacheCheckDurationMs: cacheCheckDuration,
            nextStep: 'Generate new AI summary (cache invalidated)'
          });
          // Treat as cache miss to force OpenRouter call
          existingSummary = null;
        } else if (existingSummary && existingSummary.summaryText) {
          processorLogger.info(`✅ STEP 2 COMPLETE: Cache hit found for filing ${filingForProcessing.accessionNumber}`, {
            userId: user.id,
            ticker: filingForProcessing.tickerData.symbol,
            existingSummaryId: existingSummary.id,
            cacheUsageCount: existingSummary.cacheUsageCount,
            cacheCheckDurationMs: cacheCheckDuration,
            nextStep: 'Use cached summary',
            contextFlags: {
              operationType: 'cached_summary',
              isCached: true,
              expectedCost: 0
            }
          });
        } else {
          processorLogger.info(`✅ STEP 2 COMPLETE: No cache found for filing ${filingForProcessing.accessionNumber}`, {
            userId: user.id,
            ticker: filingForProcessing.tickerData.symbol,
            cacheCheckDurationMs: cacheCheckDuration,
            nextStep: 'Generate new AI summary',
            contextFlags: {
              operationType: 'ai_generation',
              isCached: false,
              expectedCost: '>0'
            }
          });
        }
      } catch (cacheCheckError) {
        processorLogger.warn(`⚠️ STEP 2 WARNING: Cache check failed for filing ${filingForProcessing.accessionNumber}`, {
          error: cacheCheckError instanceof Error ? cacheCheckError.message : String(cacheCheckError),
          userId: user.id,
          nextStep: 'Proceeding with AI generation'
        });
      }

      // STEP 3: Generate AI summary (or use cached version)
      processorLogger.info(`🔄 STEP 3: Starting summary generation for filing ${filingForProcessing.accessionNumber}`, {
        userId: user.id,
        ticker: filingForProcessing.tickerData.symbol,
        willUseCache: !!(existingSummary && existingSummary.summaryText),
        contentLength: filingContent.length
      });

      let summaryResult;
      const summaryStartTime = Date.now();
      
      if (existingSummary && existingSummary.summaryText) {
        // CACHE HIT: Update processing context to reflect cache usage
        processingContext = {
          ...processingContext,
          operationType: 'cached_summary',
          isCached: true,
          cacheHit: true,
          aiGenerated: false
        };
        
        // Use cached summary
        summaryResult = {
          summary: existingSummary.summaryText,
          keyPoints: (existingSummary.summaryJSON as Record<string, unknown>)?.keyPoints || [],
          tokensUsed: 0, // No new tokens used for cache hit
          inputTokens: 0,
          outputTokens: 0,
          cost: 0, // No new cost for cache hit
          processingStatus: 'CACHE_HIT',
          correlationId: generateSecureCorrelationId('cache_hit')
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

        const summaryDuration = Date.now() - summaryStartTime;
        processorLogger.info(`✅ STEP 3 COMPLETE: Using cached summary for filing ${filingForProcessing.accessionNumber}`, {
          userId: user.id,
          ticker: filingForProcessing.tickerData.symbol,
          cachedSummaryId: existingSummary.id,
          newCacheUsageCount: existingSummary.cacheUsageCount + 1,
          summaryDurationMs: summaryDuration,
          nextStep: 'Store summary and send email',
          contextAssignment: {
            operationType: 'cached_summary',
            isCached: true,
            actualCost: 0,
            expectedValidation: 'Should pass zero-cost validation with cached context'
          }
        });
      } else {
        // CACHE MISS: Update processing context to reflect AI generation
        processingContext = {
          ...processingContext,
          operationType: 'ai_generation',
          isCached: false,
          cacheHit: false,
          aiGenerated: true
        };
        
        // Generate new AI summary with OpenRouter
        processorLogger.info(`🤖 STEP 3: INITIATING OPENROUTER AI CALL - This should generate OpenRouter logs`, {
          userId: user.id,
          ticker: filingForProcessing.tickerData.symbol,
          contentLength: filingContent.length,
          formType: filingForProcessing.formType,
          accessionNumber: filingForProcessing.accessionNumber,
          expectedModel: process.env.DEFAULT_AI_MODEL || 'fallback-model',
          apiConfiguration: {
            OPENROUTER_API_KEY_SET: !!process.env.OPENROUTER_API_KEY,
            TLDRSEC_AI_SUMMARIZER_SET: !!process.env.TLDRSEC_AI_SUMMARIZER,
            DEFAULT_AI_MODEL_SET: !!process.env.DEFAULT_AI_MODEL,
            ANTHROPIC_API_KEY_SET: !!process.env.ANTHROPIC_API_KEY
          },
          expectation: 'OpenRouter client should log: 🚀 OPENROUTER API CALL INITIATED'
        });

        try {
          // CRITICAL: maxRetries=0 to ensure single AI attempt fits within 150s job timeout
          // Time budget: 150s total - 30s (SEC fetch) - 5s (overhead) = ~115s for AI
          // With maxRetries=0, we get 1 attempt × 100s timeout = 100s < 115s budget ✓
          // Previous maxRetries=2 caused 3 attempts × 100s = 300s > 150s timeout (FAILED)
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
            0 // FIXED: Zero retries - single AI attempt to fit 150s job timeout
          );

          processorLogger.info(`✅ OPENROUTER AI CALL COMPLETED`, {
            userId: user.id,
            ticker: filingForProcessing.tickerData.symbol,
            summaryGenerated: !!summaryResult.summary,
            model: summaryResult.model || 'unknown',
            inputTokens: summaryResult.inputTokens || 0,
            outputTokens: summaryResult.outputTokens || 0,
            cost: summaryResult.cost || 0,
            processingStatus: summaryResult.processingStatus
          });

        } catch (aiError) {
          processorLogger.error(`❌ OPENROUTER AI CALL FAILED`, {
            userId: user.id,
            ticker: filingForProcessing.tickerData.symbol,
            error: aiError instanceof Error ? aiError.message : String(aiError),
            errorName: aiError instanceof Error ? aiError.name : 'Unknown',
            stack: aiError instanceof Error ? aiError.stack : undefined,
            recommendation: 'Check OpenRouter API key, model availability, and network connectivity'
          });
          throw aiError; // Re-throw to maintain error handling flow
        }

        const summaryDuration = Date.now() - summaryStartTime;
        const actualCost = summaryResult.cost || 0;

        // CRITICAL: Validate AI generation was successful and cost incurred
        if (!summaryResult.summary || summaryResult.summary.trim().length === 0) {
          throw new Error('AI generation failed: Empty summary returned from OpenRouter');
        }

        if (actualCost === 0 && !existingSummary) {
          processorLogger.warn(`🚨 COST VALIDATION WARNING: OpenRouter returned $0 cost for new summary generation`, {
            userId: user.id,
            ticker: filingForProcessing.tickerData.symbol,
            tokensUsed: summaryResult.tokensUsed || 0,
            possibleIssue: 'OpenRouter API may not have been called or free credits used'
          });
        }

        processorLogger.info(`✅ STEP 3 COMPLETE: AI summary generated successfully for filing ${filingForProcessing.accessionNumber}`, {
          userId: user.id,
          tier,
          ticker: filingForProcessing.tickerData.symbol,
          tokensUsed: summaryResult.tokensUsed || 0,
          inputTokens: summaryResult.inputTokens || 0,
          outputTokens: summaryResult.outputTokens || 0,
          cost: actualCost,
          processingStatus: summaryResult.processingStatus,
          summaryLength: summaryResult.summary.length,
          summaryDurationMs: summaryDuration,
          openRouterApiCalled: actualCost > 0,
          nextStep: 'Store summary in database',
          contextAssignment: {
            operationType: 'ai_generation',
            isCached: false,
            actualCost,
            expectedValidation: actualCost > 0 ? 'Should pass cost validation for AI generation' : 'WARNING: Zero cost for AI generation may fail validation'
          }
        });
      }

      const actualCost = summaryResult.cost || 0;

      // STEP 3.5: Validate AI-generated summary quality (Gap 3 fix - HIGH PRIORITY)
      // This validates that the summary accurately reflects the source content
      // Only validate new AI-generated summaries, not cached ones
      let validationResult: SummaryValidationResult | undefined;

      if (!processingContext.isCached && summaryResult.summary) {
        processorLogger.info(`🔄 STEP 3.5: Validating AI summary quality for filing ${filingForProcessing.accessionNumber}`, {
          userId: user.id,
          ticker: filingForProcessing.tickerData.symbol,
          summaryLength: summaryResult.summary.length,
          formType: filingForProcessing.formType
        });

        const validationStartTime = Date.now();

        try {
          validationResult = await validateSummaryWithAI({
            summaryText: summaryResult.summary,
            sourceContent: filingContent,
            ticker: filingForProcessing.tickerData.symbol,
            formType: filingForProcessing.formType,
            companyName: filingForProcessing.tickerData.companyName,
            filingDate: filingForProcessing.filingDate.toISOString()
          });

          const validationDuration = Date.now() - validationStartTime;

          processorLogger.info(`✅ STEP 3.5 COMPLETE: AI summary validation for filing ${filingForProcessing.accessionNumber}`, {
            userId: user.id,
            ticker: filingForProcessing.tickerData.symbol,
            isValid: validationResult.isValid,
            confidenceScore: validationResult.confidenceScore,
            accuracyScore: validationResult.accuracyScore,
            completenessScore: validationResult.completenessScore,
            relevanceScore: validationResult.relevanceScore,
            validationDurationMs: validationDuration,
            issues: validationResult.issues.length > 0 ? validationResult.issues : undefined,
            strengths: validationResult.strengths.length > 0 ? validationResult.strengths : undefined,
            overallAssessment: validationResult.overallAssessment,
            nextStep: 'Store summary in database'
          });

          // Log warning if validation fails, but continue processing
          // (informational only initially as per plan - don't block on low scores)
          if (!validationResult.isValid || validationResult.confidenceScore < 50) {
            processorLogger.warn(`⚠️ AI summary validation flagged issues for filing ${filingForProcessing.accessionNumber}`, {
              userId: user.id,
              ticker: filingForProcessing.tickerData.symbol,
              isValid: validationResult.isValid,
              confidenceScore: validationResult.confidenceScore,
              accuracyScore: validationResult.accuracyScore,
              completenessScore: validationResult.completenessScore,
              relevanceScore: validationResult.relevanceScore,
              issues: validationResult.issues,
              overallAssessment: validationResult.overallAssessment,
              action: 'Proceeding with storing summary despite validation issues (warn only)'
            });
          }
        } catch (validationError) {
          processorLogger.error(`❌ STEP 3.5 FAILED: AI summary validation error for filing ${filingForProcessing.accessionNumber}`, {
            error: validationError instanceof Error ? validationError.message : 'Unknown validation error',
            userId: user.id,
            ticker: filingForProcessing.tickerData.symbol,
            validationTimeMs: Date.now() - validationStartTime,
            action: 'Proceeding with storing summary despite validation error'
          });
          // Don't fail the whole process for validation errors - validation is informational
        }
      } else {
        processorLogger.debug(`Skipping AI summary validation for cached summary`, {
          userId: user.id,
          ticker: filingForProcessing.tickerData.symbol,
          isCached: processingContext.isCached
        });
      }

      // STEP 4: Store the summary in database using transaction context
      processorLogger.info(`🔄 STEP 4: Storing summary in database for filing ${filingForProcessing.accessionNumber}`, {
        userId: user.id,
        ticker: filingForProcessing.tickerData.symbol,
        summaryLength: summaryResult.summary.length,
        cost: actualCost
      });

      let summaryRecord: Summary | null = null;
      const dbStoreStartTime = Date.now();
      
      try {
        const tickerRecord = await tx.ticker.findFirst({
          where: { symbol: filingForProcessing.tickerData.symbol }
        });

        if (tickerRecord) {
          // FIX: Use upsert to prevent duplicate summaries for the same filing
          // The unique constraint is on (tickerId, filingUrl)
          const filingUrlForUpsert = filingForProcessing.filingUrl || '';

          summaryRecord = await tx.summary.upsert({
            where: {
              // Unique constraint on tickerId + filingUrl
              tickerId_filingUrl: {
                tickerId: tickerRecord.id,
                filingUrl: filingUrlForUpsert
              }
            },
            create: {
              tickerId: tickerRecord.id,
              filingType: filingForProcessing.formType,
              filingDate: filingForProcessing.filingDate,
              filingUrl: filingUrlForUpsert,
              summaryText: summaryResult.summary,
              summaryJSON: {
                ticker: filingForProcessing.tickerData.symbol,
                accessionNumber: filingForProcessing.accessionNumber,
                filingType: filingForProcessing.formType,
                summaryText: summaryResult.summary,
                keyPoints: summaryResult.keyPoints || [],
                cost: actualCost,
                inputTokens: summaryResult.inputTokens || 0,
                outputTokens: summaryResult.outputTokens || 0,
                // AI Summary Validation Results (Gap 3 fix)
                validation: validationResult ? {
                  isValid: validationResult.isValid,
                  confidenceScore: validationResult.confidenceScore,
                  accuracyScore: validationResult.accuracyScore,
                  completenessScore: validationResult.completenessScore,
                  relevanceScore: validationResult.relevanceScore,
                  issues: validationResult.issues,
                  strengths: validationResult.strengths,
                  overallAssessment: validationResult.overallAssessment,
                  validationDurationMs: validationResult.validationDurationMs
                } : undefined
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
            },
            update: {
              // If summary already exists for this filing URL, update it
              // This handles the case where a summary was partially created or needs refresh
              summaryText: summaryResult.summary,
              summaryJSON: {
                ticker: filingForProcessing.tickerData.symbol,
                accessionNumber: filingForProcessing.accessionNumber,
                filingType: filingForProcessing.formType,
                summaryText: summaryResult.summary,
                keyPoints: summaryResult.keyPoints || [],
                cost: actualCost,
                inputTokens: summaryResult.inputTokens || 0,
                outputTokens: summaryResult.outputTokens || 0,
                validation: validationResult ? {
                  isValid: validationResult.isValid,
                  confidenceScore: validationResult.confidenceScore,
                  accuracyScore: validationResult.accuracyScore,
                  completenessScore: validationResult.completenessScore,
                  relevanceScore: validationResult.relevanceScore,
                  issues: validationResult.issues,
                  strengths: validationResult.strengths,
                  overallAssessment: validationResult.overallAssessment,
                  validationDurationMs: validationResult.validationDurationMs
                } : undefined
              },
              // Update tokens and cost (accumulate for re-generations)
              tokensUsed: summaryResult.tokensUsed || 0,
              cost: actualCost,
              totalCost: actualCost,
              inputTokens: summaryResult.inputTokens || 0,
              outputTokens: summaryResult.outputTokens || 0,
              modelVersion: summaryResult.model || 'unknown',
              processingStatus: summaryResult.processingStatus || 'SUCCESS',
              processingTimeMs: summaryResult.processingTime || 0,
              // Increment cache usage count if this is a regeneration
              cacheUsageCount: { increment: 1 }
            }
          });

          processorLogger.info(`📝 Summary upserted (prevents duplicates)`, {
            summaryId: summaryRecord.id,
            filingUrl: filingUrlForUpsert,
            ticker: filingForProcessing.tickerData.symbol,
            accessionNumber: filingForProcessing.accessionNumber
          });

          const dbStoreDuration = Date.now() - dbStoreStartTime;
          processorLogger.info(`✅ STEP 4 COMPLETE: Summary stored successfully in database for filing ${filingForProcessing.accessionNumber}`, {
            userId: user.id,
            ticker: filingForProcessing.tickerData.symbol,
            cost: actualCost,
            summaryId: summaryRecord.id,
            tokensUsed: summaryResult.tokensUsed || 0,
            dbStoreDurationMs: dbStoreDuration,
            nextStep: 'Send email notification'
          });

          // STEP 4.5: Clear force refresh flag if this was a cache invalidation refresh
          try {
            const clearedFlags = await tx.summary.updateMany({
              where: {
                ticker: {
                  symbol: filingForProcessing.tickerData.symbol
                },
                filingType: filingForProcessing.formType,
                filingDate: filingForProcessing.filingDate,
                forceRefreshFlag: true
              },
              data: {
                forceRefreshFlag: false,
                invalidationReason: null,
                invalidatedBy: null
              }
            });

            if (clearedFlags.count > 0) {
              processorLogger.info(`🔄 CACHE INVALIDATION COMPLETE: Cleared force refresh flags after successful regeneration`, {
                userId: user.id,
                ticker: filingForProcessing.tickerData.symbol,
                filingType: filingForProcessing.formType,
                clearedFlagsCount: clearedFlags.count,
                newSummaryId: summaryRecord.id,
                message: 'OpenRouter API call successful - cache invalidation workflow complete'
              });
            }
          } catch (flagClearError) {
            processorLogger.warn(`Failed to clear force refresh flags after successful generation`, {
              error: flagClearError instanceof Error ? flagClearError.message : String(flagClearError),
              userId: user.id,
              ticker: filingForProcessing.tickerData.symbol
            });
            // Don't fail the main process for flag clearing issues
          }
        }
      } catch (dbError) {
        processorLogger.error(`Failed to store summary for filing ${filingForProcessing.accessionNumber}`, { 
          error: dbError,
          userId: user.id 
        });
        // Don't fail the whole process for DB storage errors in transaction context
        // The transaction will be rolled back if this function throws
      }

      // STEP 5: Queue email notification for async processing (rate limit compliant)
      if (user.email && summaryRecord) {
        processorLogger.info(`🔄 STEP 5: Queuing async email notification for filing ${filingForProcessing.accessionNumber}`, {
          userId: user.id,
          email: user.email,
          ticker: filingForProcessing.tickerData.symbol,
          summaryId: summaryRecord.id
        });

        const emailQueueStartTime = Date.now();
        
        try {
          // Create filing summary data for email
          const filingSummaryResult = {
            ticker: filingForProcessing.tickerData.symbol,
            companyName: filingForProcessing.tickerData.companyName,
            filingType: filingForProcessing.formType,
            filingDate: filingForProcessing.filingDate.toISOString(),
            url: filingForProcessing.filingUrl || '',
            accessionNumber: filingForProcessing.accessionNumber,
            summaryText: summaryResult.summary,
            keyPoints: summaryResult.keyPoints || []
          };
          
          // Generate email content
          const emailHtml = generateHtmlEmail([filingSummaryResult], []);
          const plainText = generatePlainTextEmail([filingSummaryResult], []);
          
          // Queue email for async processing
          const jobId = await queueEmail({
            to: user.email,
            subject: `SEC Filing Summary - ${new Date().toLocaleDateString()}`,
            html: emailHtml,
            text: plainText,
            tags: [
              'type_summaries',
              'content_filings',
              `ticker_${filingForProcessing.tickerData.symbol}`,
              `form_${filingForProcessing.formType}`
            ],
            replyTo: 'no-reply@tldrsec.app'
          }, {
            priority: 7, // High priority for filing notifications
            metadata: {
              userId: user.id,
              summaryId: summaryRecord.id,
              ticker: filingForProcessing.tickerData.symbol,
              filingType: filingForProcessing.formType,
              accessionNumber: filingForProcessing.accessionNumber
            },
            idempotencyKey: `filing-email-${user.id}-${summaryRecord.id}`
          });
          
          // Mark summary as queued for email (will be updated when email actually sends)
          await tx.summary.update({
            where: { id: summaryRecord.id },
            data: {
              sentToUser: false, // Will be set to true when email actually sends
              totalEmailsSent: { increment: 0 }, // Will be incremented when email sends
              uniqueUsersServed: { increment: 0 } // Will be incremented when email sends
            }
          });

          const emailQueueDuration = Date.now() - emailQueueStartTime;
          processorLogger.info(`✅ STEP 5 COMPLETE: Email queued successfully for filing ${filingForProcessing.accessionNumber}`, {
            userId: user.id,
            email: user.email,
            ticker: filingForProcessing.tickerData.symbol,
            summaryId: summaryRecord.id,
            jobId,
            emailQueueDurationMs: emailQueueDuration,
            finalStep: 'E2E process complete - email will be sent asynchronously'
          });
        } catch (emailQueueError) {
          processorLogger.error(`Email queue error for filing ${filingForProcessing.accessionNumber}`, {
            error: emailQueueError instanceof Error ? emailQueueError.message : 'Unknown error',
            userId: user.id,
            email: user.email,
            summaryId: summaryRecord?.id
          });
          // Don't fail the whole process for email queue errors
        }
      } else {
        if (!user.email) {
          processorLogger.debug(`No email address for user ${user.id}, skipping email notification`);
        }
        if (!summaryRecord) {
          processorLogger.warn(`No summary record created for filing ${filingForProcessing.accessionNumber}, skipping email`);
        }
      }
      
      // FINAL SUMMARY: E2E Processing Complete
      const totalProcessingTime = Date.now() - contentFetchStartTime;
      processorLogger.info(`🎉 E2E PROCESSING COMPLETE: Successfully processed filing ${filingForProcessing.accessionNumber} for user ${user.id}`, {
        userId: user.id,
        tier,
        ticker: filingForProcessing.tickerData.symbol,
        filingType: filingForProcessing.formType,
        totalProcessingTimeMs: totalProcessingTime,
        actualCost,
        summaryGenerated: !!summaryResult.summary,
        summaryLength: summaryResult.summary?.length || 0,
        openRouterApiCalled: actualCost > 0,
        emailSent: !!(user.email && summaryRecord),
        summaryId: summaryRecord?.id,
        processingSummary: {
          contentFetched: !!filingContent,
          aiSummaryGenerated: !!summaryResult.summary,
          databaseStored: !!summaryRecord,
          emailSent: !!(user.email && summaryRecord)
        }
      });
      
      // Finalize processing context with end time
      processingContext.processingEndTime = Date.now();
      
      return {
        success: true,
        cost: actualCost,
        processingTime: Date.now() - processingStartTime,
        processingContext
      };
      
    } catch (error) {
      // ERROR: Update processing context to reflect failure
      processingContext = {
        ...processingContext,
        operationType: 'failed_operation',
        isCached: false,
        errorOccurred: true,
        processingEndTime: Date.now()
      };
      
      processorLogger.error(`Failed to process filing ${filingForProcessing.accessionNumber} within transaction`, { 
        error,
        userId: user.id,
        tier,
        filingType: filingForProcessing.formType
      });
      return {
        success: false,
        cost: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - processingStartTime,
        processingContext
      };
    }
  }

  /**
   * Determine if an error is retryable based on error message patterns and error codes
   * Enhanced to handle the new filing error classification system
   */
  private static isRetryableError(errorMessage?: string): boolean {
    if (!errorMessage) return false;
    
    const lowerError = errorMessage.toLowerCase();
    
    // Check for specific error codes from the filing error classification system
    const permanentErrorCodes = [
      'filing_not_found',
      'invalid_accession_number',
      'access_denied',
      'malformed_content',
      'content_too_short',
      'no_such_key'
    ];
    
    const transientErrorCodes = [
      'rate_limited',
      'server_error',
      'network_timeout',
      'connection_error',
      'service_unavailable'
    ];
    
    // Check if the error message contains any error codes
    for (const code of permanentErrorCodes) {
      if (lowerError.includes(code)) {
        return false; // Permanent errors should not be retried
      }
    }
    
    for (const code of transientErrorCodes) {
      if (lowerError.includes(code)) {
        return true; // Transient errors should be retried
      }
    }
    
    // Check for non-retryable validation errors (legacy patterns)
    const nonRetryableValidationPatterns = [
      'nosuchkey', // NoSuchKey errors are permanent
      'content validation failed', // Generic validation failures
      'content too short', // Invalid content length
      'invalid date', // Date validation failures
      'malformed content', // Content structure issues
      'filing not found', // 404 errors
      'access denied' // 403 errors
    ];
    
    for (const pattern of nonRetryableValidationPatterns) {
      if (lowerError.includes(pattern)) {
        return false; // These errors won't resolve with retry
      }
    }
    
    // Check for retryable patterns (including retryable validation errors)
    return this.RETRY_CONFIG.retryableErrors.some(pattern => 
      lowerError.includes(pattern) ||
      lowerError.includes('timeout') ||
      lowerError.includes('connection') ||
      lowerError.includes('502') ||
      lowerError.includes('503') ||
      lowerError.includes('504') ||
      lowerError.includes('rate limit') ||
      lowerError.includes('too many requests') ||
      lowerError.includes('temporarily unavailable') ||
      lowerError.includes('sec api error') // Retryable validation errors
    );
  }

  /**
   * Execute a function with exponential backoff retry logic
   */
  private static async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = this.RETRY_CONFIG.maxRetries
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt > maxRetries) {
          processorLogger.error(`All retry attempts exhausted for ${operationName}`, {
            attempts: attempt - 1,
            finalError: lastError.message
          });
          throw lastError;
        }
        
        if (!this.isRetryableError(lastError.message)) {
          processorLogger.warn(`Non-retryable error in ${operationName}, not retrying`, {
            error: lastError.message,
            attempt
          });
          throw lastError;
        }
        
        const delay = Math.min(
          this.RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1),
          this.RETRY_CONFIG.maxDelayMs
        );
        
        processorLogger.warn(`${operationName} failed (attempt ${attempt}), retrying in ${delay}ms`, {
          error: lastError.message,
          attempt,
          maxRetries,
          delay
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  /**
   * Categorize filing errors for detailed metrics tracking
   */
  private static categorizeFilingError(
    errorMessage: string | undefined, 
    metrics: { errorBreakdown: Record<string, number> }
  ): void {
    if (!errorMessage) {
      metrics.errorBreakdown.unknownErrors++;
      return;
    }

    const lowerError = errorMessage.toLowerCase();

    // Classify errors based on the new error codes and legacy patterns
    if (lowerError.includes('filing_not_found') || lowerError.includes('filing not found') || lowerError.includes('404')) {
      metrics.errorBreakdown.filingNotFound++;
    } else if (lowerError.includes('invalid_accession_number') || lowerError.includes('invalid accession') || lowerError.includes('malformed accession')) {
      metrics.errorBreakdown.invalidAccessionNumber++;
    } else if (lowerError.includes('content validation failed') || lowerError.includes('content too short') || lowerError.includes('malformed_content')) {
      metrics.errorBreakdown.contentValidationFailed++;
    } else if (lowerError.includes('ai generation failed') || lowerError.includes('openrouter') || lowerError.includes('anthropic')) {
      metrics.errorBreakdown.aiGenerationFailed++;
    } else if (lowerError.includes('network_timeout') || lowerError.includes('timeout') || lowerError.includes('connection')) {
      metrics.errorBreakdown.networkTimeouts++;
    } else if (lowerError.includes('rate_limited') || lowerError.includes('rate limit') || lowerError.includes('429')) {
      metrics.errorBreakdown.rateLimited++;
    } else {
      metrics.errorBreakdown.unknownErrors++;
    }
  }

  /**
   * Create an aggregate processing context from individual filing contexts
   * @deprecated Use BoundedContextManager.createBoundedAggregateContext() for memory-optimized processing
   */
  private static createAggregateContext(
    userId: string,
    tier: string,
    individualContexts: ProcessingContext[],
    _totalCost: number,
    _filingsProcessed: number
  ): ProcessingContext {
    if (individualContexts.length === 0) {
      // No individual contexts available, create a fallback context
      return {
        userId,
        tier,
        operation: 'tier-aware-cron-processing',
        operationType: 'failed_operation',
        isCached: false,
        errorOccurred: true
      };
    }

    // Analyze individual contexts to determine aggregate characteristics
    const cacheHits = individualContexts.filter(ctx => ctx.cacheHit).length;
    const aiGenerations = individualContexts.filter(ctx => ctx.aiGenerated).length;
    const errors = individualContexts.filter(ctx => ctx.errorOccurred).length;

    // Determine primary operation type based on majority
    let operationType: 'cached_summary' | 'ai_generation' | 'failed_operation';
    if (errors > 0 && errors >= individualContexts.length / 2) {
      operationType = 'failed_operation';
    } else if (cacheHits > aiGenerations) {
      operationType = 'cached_summary';
    } else {
      operationType = 'ai_generation';
    }

    // Aggregate timing information
    const validStartTimes = individualContexts
      .map(ctx => ctx.processingStartTime)
      .filter(t => t !== undefined) as number[];
    const validEndTimes = individualContexts
      .map(ctx => ctx.processingEndTime)
      .filter(t => t !== undefined) as number[];

    return {
      userId,
      tier,
      operation: 'tier-aware-cron-processing',
      operationType,
      isCached: cacheHits > 0,
      cacheHit: cacheHits > 0,
      aiGenerated: aiGenerations > 0,
      errorOccurred: errors > 0,
      processingStartTime: validStartTimes.length > 0 ? Math.min(...validStartTimes) : undefined,
      processingEndTime: validEndTimes.length > 0 ? Math.max(...validEndTimes) : undefined
    };
  }
}