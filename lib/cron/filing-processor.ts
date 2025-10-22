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
                  cost: filingResult.cost
                });
              } else {
                // Log failure but continue processing other filings
                processorLogger.error(`Failed to process filing ${filing.accessionNumber}`, {
                  userId: user.id,
                  ticker: tickerValidation.symbol,
                  error: filingResult.error,
                  filingType: filing.filingType
                });
                
                // Implement retry logic for failed filings
                const isRetryable = this.isRetryableError(filingResult.error);
                if (isRetryable) {
                  processorLogger.info(`Filing ${filing.accessionNumber} failed with retryable error, will be retried in next cron run`, {
                    userId: user.id,
                    ticker: tickerValidation.symbol,
                    error: filingResult.error,
                    filingType: filing.filingType
                  });
                  // Filing remains marked as unprocessed, will be picked up in next run
                } else {
                  processorLogger.error(`Filing ${filing.accessionNumber} failed with non-retryable error`, {
                    userId: user.id,
                    ticker: tickerValidation.symbol,
                    error: filingResult.error,
                    filingType: filing.filingType
                  });
                  // Could mark as permanently failed or implement different handling
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

    processorLogger.info(`Completed deduplication processing for user ${user.id}`, {
      filingsProcessed: result.filingsProcessed,
      filingsSkipped: result.filingsSkipped,
      cost: result.cost,
      tier,
      optimization: result.filingsSkipped > 0 ? `Saved ${result.filingsSkipped} unnecessary transactions` : 'No optimization applied'
    });

    return result;
  }

  /**
   * Process a single filing with transaction boundaries
   */
  public static async processSingleFiling(
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
      const { queueEmail } = await import('../email/async-email-queue');
      const { generateHtmlEmail, generatePlainTextEmail } = await import('../../services/filings/email/emailGenerator');
      const { getFilingContent } = await import('../../services/filings/filingRetrieval');
      const { FilingContentValidator } = await import('../validation/filing-content-validator');

      // Validate critical imports succeeded
      if (typeof generateAISummaryWithRetry !== 'function') {
        throw new Error('Failed to import generateAISummaryWithRetry - AI summarization will not work');
      }
      if (typeof queueEmail !== 'function') {
        throw new Error('Failed to import queueEmail - async email notifications will not work');
      }
      if (typeof getFilingContent !== 'function') {
        throw new Error('Failed to import getFilingContent - filing retrieval will not work');
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
      
      try {
        filingContent = await getFilingContent(
          filingForProcessing.accessionNumber,
          '1', // Use document sequence 1 as primary document
          filingForProcessing.tickerData.cik
        );

        const contentFetchDuration = Date.now() - contentFetchStartTime;
        processorLogger.info(`✅ STEP 1 COMPLETE: Content fetch successful for filing ${filingForProcessing.accessionNumber}`, {
          userId: user.id,
          ticker: filingForProcessing.tickerData.symbol,
          contentLength: filingContent.length,
          fetchDurationMs: contentFetchDuration,
          nextStep: 'Content validation'
        });
      } catch (contentError) {
        processorLogger.error(`Failed to fetch content for filing ${filingForProcessing.accessionNumber}`, {
          error: contentError instanceof Error ? contentError.message : 'Unknown error',
          ticker: filingForProcessing.tickerData.symbol,
          cik: filingForProcessing.tickerData.cik
        });
        throw new Error(`Failed to fetch filing content: ${contentError instanceof Error ? contentError.message : 'Unknown error'}`);
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
            nextStep: 'Use cached summary'
          });
        } else {
          processorLogger.info(`✅ STEP 2 COMPLETE: No cache found for filing ${filingForProcessing.accessionNumber}`, {
            userId: user.id,
            ticker: filingForProcessing.tickerData.symbol,
            cacheCheckDurationMs: cacheCheckDuration,
            nextStep: 'Generate new AI summary'
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
          nextStep: 'Store summary and send email'
        });
      } else {
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
          ticker: filingForProcessing.tickerData.symbol,
          tokensUsed: summaryResult.tokensUsed || 0,
          inputTokens: summaryResult.inputTokens || 0,
          outputTokens: summaryResult.outputTokens || 0,
          cost: actualCost,
          processingStatus: summaryResult.processingStatus,
          summaryLength: summaryResult.summary.length,
          summaryDurationMs: summaryDuration,
          openRouterApiCalled: actualCost > 0,
          nextStep: 'Store summary in database'
        });
      }

      const actualCost = summaryResult.cost || 0;

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

  /**
   * Determine if an error is retryable based on error message patterns
   * Updated to handle validation errors appropriately
   */
  private static isRetryableError(errorMessage?: string): boolean {
    if (!errorMessage) return false;
    
    const lowerError = errorMessage.toLowerCase();
    
    // Check for non-retryable validation errors first
    const nonRetryableValidationPatterns = [
      'nosuchkey', // NoSuchKey errors are permanent
      'content validation failed', // Generic validation failures
      'content too short', // Invalid content length
      'invalid date', // Date validation failures
      'malformed content' // Content structure issues
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
}