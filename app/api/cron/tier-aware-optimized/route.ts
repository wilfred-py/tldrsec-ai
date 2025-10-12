/**
 * Optimized Tier-aware SEC filing monitoring cron job with 524 Timeout Prevention
 * 
 * Enhanced with:
 * - Intelligent circuit breaker for dynamic timeout management
 * - Filing prioritization system
 * - Performance metrics and monitoring
 * - Advanced parallel processing optimization
 * 
 * Designed to eliminate 524 timeout errors while maintaining processing quality
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logging';
import { getMarketHoursContext } from '../../../../lib/cron/market-hours';
import { CronJobMonitor } from '../../../../lib/monitoring/cron-monitor';
import { CronJobStatus } from '../../../../types/cron';

// Import our new service layer
import { CronAuthService } from '../../../../lib/cron/auth-service';
import { CronUserProcessingService } from '../../../../lib/cron/user-processing-service';
import { CronSecFilingService } from '../../../../lib/cron/sec-filing-service';
import { CronFilingProcessor } from '../../../../lib/cron/filing-processor';
import type { CronResults } from '../../../../lib/cron/types';

// Import our new 524 timeout prevention services
import { IntelligentCircuitBreaker, createCircuitBreaker } from '../../../../lib/services/circuitBreaker';
import { filingPrioritizer } from '../../../../lib/services/filingPrioritizer';
import { performanceMetrics } from '../../../../lib/monitoring/performanceMetrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cronLogger = logger.child('tier-aware-cron-optimized');

/**
 * Enhanced cron endpoint handler with 524 timeout prevention
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  // Generate secure execution ID
  const generateSecureExecutionId = (): string => {
    const timestamp = Date.now();
    const randomBytes = Buffer.from(Array.from({ length: 16 }, () => Math.floor(Math.random() * 256)));
    const randomHex = randomBytes.toString('hex').substring(0, 16);
    return `opt-${timestamp}-${randomHex}`;
  };
  
  const executionId = request.headers.get('x-execution-id') || generateSecureExecutionId();
  const isDebugMode = request.headers.get('x-debug-mode') === 'true';
  
  // Debug logging for auth troubleshooting
  if (isDebugMode) {
    cronLogger.info(`[${executionId}] DEBUG: Request received`, {
      headers: Object.fromEntries(request.headers.entries()),
      url: request.url,
      method: request.method,
      authHeader: request.headers.get('authorization') ? 'present' : 'missing',
      xCronAuth: request.headers.get('x-cron-auth') ? 'present' : 'missing',
      cronSecretConfigured: !!process.env.CRON_SECRET,
      cronSecretLength: process.env.CRON_SECRET?.length || 0
    });
  }
  
  // Enhanced timeout configuration with circuit breaker
  const parseTimeoutHeader = (header: string | null, defaultValue: number): number => {
    if (!header) return defaultValue;
    const parsed = parseInt(header);
    if (isNaN(parsed) || parsed < 0) return defaultValue;
    return Math.min(parsed, 600000); // Cap at 10 minutes maximum
  };
  
  const workerTimeoutMs = parseTimeoutHeader(request.headers.get('x-worker-timeout'), 300000); // 5 minutes for Vercel free plan
  const effectiveTimeoutMs = parseTimeoutHeader(request.headers.get('x-effective-timeout'), 270000); // 4.5 minutes
  
  // Initialize circuit breaker with smart timeout management (optimized for 5-minute Vercel limit)
  const circuitBreaker = createCircuitBreaker(workerTimeoutMs, {
    effectiveTimeoutMs,
    minFilingProcessingTime: 60000, // 1 minute per filing (reduced for 5-min limit)
    safetyBuffer: 30000,            // 30 seconds buffer
    maxConcurrentProcessing: 3,     // Increase concurrency to finish faster
    maxBacklogFilings: 8            // Reduce backlog processing to ensure completion
  });
  
  cronLogger.info(`[${executionId}] Starting optimized tier-aware cron with 524 timeout prevention`, {
    workerTimeoutMs,
    effectiveTimeoutMs,
    circuitBreakerConfig: circuitBreaker.getStatus().config
  });
  
  // Set up timeout protection with circuit breaker integration
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    cronLogger.warn(`[${executionId}] Circuit breaker force activation - approaching timeout`);
    circuitBreaker.forceActivation('Vercel timeout approaching');
    timeoutController.abort(new DOMException('Execution timeout approaching', 'TimeoutError'));
  }, effectiveTimeoutMs - 30000);
  
  // Initialize performance metrics
  performanceMetrics.reset();
  
  // Detect platform and initialize monitoring
  const platform = CronAuthService.detectPlatform();
  let monitor: CronJobMonitor | undefined;
  
  try {
    monitor = await CronJobMonitor.create('tier-aware-sec-monitor-optimized', platform);
    cronLogger.info(`[${executionId}] Enhanced monitoring initialized for 524 timeout prevention`);
  } catch (initError) {
    clearTimeout(timeoutId);
    cronLogger.error(`[${executionId}] Failed to initialize enhanced monitoring`, { error: initError });
    return NextResponse.json({
      success: false,
      error: 'Failed to initialize enhanced monitoring',
      executionId,
      duration: Date.now() - startTime
    }, { status: 500 });
  }

  try {
    cronLogger.info(`[${executionId}] Starting optimized SEC filing processing with intelligent circuit breaker`);

    // STEP 1: Authentication & Security Validation
    const authResult = await CronAuthService.validateCronRequest(request);
    if (!authResult.isValid) {
      clearTimeout(timeoutId);
      
      const isConfigurationError = authResult.error?.includes('not properly configured');
      
      if (isConfigurationError) {
        cronLogger.error(`[${executionId}] Server configuration error`, { 
          error: authResult.error,
          clientIP: authResult.clientIP 
        });
        if (monitor) await monitor.complete(CronJobStatus.FAILED, 'Server configuration error');
        
        return NextResponse.json({
          success: false,
          error: 'Server configuration error',
          executionId,
          duration: Date.now() - startTime
        }, { status: 500 });
      } else {
        cronLogger.warn(`[${executionId}] Authentication failed`, { 
          error: authResult.error,
          clientIP: authResult.clientIP 
        });
        if (monitor) await monitor.complete(CronJobStatus.FAILED, authResult.error || 'Authentication failed');
        
        return NextResponse.json({
          success: false,
          error: authResult.error || 'Authentication failed',
          executionId,
          duration: Date.now() - startTime
        }, { 
          status: authResult.error?.includes('Rate limit') ? 429 : 
                 authResult.error?.includes('IP not allowed') ? 403 : 401
        });
      }
    }

    // STEP 2: Get Market Context with Circuit Breaker Check
    const timeConstraints = circuitBreaker.calculateTimeConstraints();
    if (!timeConstraints.shouldContinue) {
      throw new Error(`Circuit breaker activated immediately - insufficient time: ${timeConstraints.remaining}ms remaining`);
    }

    const marketContext = getMarketHoursContext();
    cronLogger.info(`[${executionId}] Market context determined with ${timeConstraints.remaining}ms remaining`, {
      isMarketHours: marketContext.isMarketHours,
      isMarketDay: marketContext.isMarketDay,
      remainingCapacity: timeConstraints.remainingFilingsCapacity
    });

    // STEP 3: Get Eligible Users with Time-Aware Limits
    const maxUsersForTime = Math.min(100, timeConstraints.remainingFilingsCapacity * 5); // 5 users per filing capacity
    
    const { allUsers, eligibleUsers } = await CronUserProcessingService.getEligibleUsersForProcessing(
      marketContext,
      {
        maxUsersPerCycle: maxUsersForTime,
        respectBudgetLimits: true,
        budgetThreshold: 90
      }
    );

    cronLogger.info(`[${executionId}] User eligibility determined`, {
      eligibleUsers: eligibleUsers.length,
      maxUsersForTime,
      totalUsers: allUsers.length
    });

    // STEP 4: Enhanced Backlog Processing with Priority and Circuit Breaker
    let unprocessedCount = 0;
    let backlogProcessedCount = 0;
    
    const backlogDecision = circuitBreaker.shouldProcessFiling('BACKLOG');
    if (backlogDecision.shouldProcess) {
      cronLogger.info(`[${executionId}] Starting intelligent backlog processing`);
      
      try {
        const unprocessedFilings = await import('../../../../lib/sec-edgar/ticker-monitoring')
          .then(m => m.getUnprocessedFilings(100));
        unprocessedCount = unprocessedFilings.length;
        
        if (unprocessedCount > 0) {
          // Prioritize backlog filings
          const prioritizedBacklog = filingPrioritizer.prioritizeFilings(
            unprocessedFilings, 
            true // isBacklogProcessing
          );
          
          const backlogTimeConstraints = circuitBreaker.calculateTimeConstraints();
          const optimalProcessingOrder = filingPrioritizer.getOptimalProcessingOrder(
            prioritizedBacklog,
            backlogTimeConstraints.remaining,
            30000 // safety buffer
          );

          cronLogger.info(`[${executionId}] Backlog optimization completed`, {
            totalBacklog: unprocessedCount,
            recommended: optimalProcessingOrder.recommended.length,
            skipped: optimalProcessingOrder.skipped.length,
            estimatedTime: optimalProcessingOrder.totalEstimatedTime
          });

          // Process recommended backlog filings in optimized batches
          if (optimalProcessingOrder.recommended.length > 0) {
            const optimalBatchSize = circuitBreaker.calculateOptimalBatchSize(
              optimalProcessingOrder.recommended.length,
              'BACKLOG'
            );
            
            const batches = filingPrioritizer.createProcessingBatches(
              optimalProcessingOrder.recommended,
              optimalBatchSize,
              2 // max concurrent priorities
            );

            for (const [batchIndex, batch] of batches.entries()) {
              const batchTimeCheck = circuitBreaker.calculateTimeConstraints();
              if (!batchTimeCheck.shouldContinue) {
                cronLogger.warn(`[${executionId}] Circuit breaker stopped backlog processing at batch ${batchIndex}`);
                break;
              }

              cronLogger.info(`[${executionId}] Processing backlog batch ${batchIndex + 1}/${batches.length} (${batch.length} filings)`);
              
              const batchStartTime = Date.now();
              const batchPromises = batch.map(async (prioritizedFiling) => {
                const filing = prioritizedFiling.filing;
                
                return circuitBreaker.wrapProcessing(async () => {
                  // Process filing using existing logic but with enhanced monitoring
                  const { getPrismaClient } = await import('../../../../lib/db/prisma');
                  const prisma = getPrismaClient();
                  
                  const usersForTicker = await prisma.user.findMany({
                    where: {
                      tickers: {
                        some: {
                          symbol: filing.ticker.symbol
                        }
                      }
                    },
                    select: {
                      id: true,
                      email: true,
                      subscriptionTier: true,
                      processingBudget: true,
                      budgetUsed: true,
                      tickers: {
                        where: {
                          symbol: filing.ticker.symbol
                        },
                        select: {
                          symbol: true,
                          companyName: true
                        }
                      }
                    }
                  });

                  if (usersForTicker.length === 0) {
                    return null;
                  }

                  let successfulProcessingCount = 0;
                  
                  for (const user of usersForTicker) {
                    try {
                      const processingStartTime = Date.now();
                      
                      const result = await CronFilingProcessor.processSingleFiling(
                        filing,
                        user,
                        user.subscriptionTier,
                        { symbol: filing.ticker.symbol, cik: filing.ticker.cik },
                        { companyName: filing.ticker.companyName }
                      );

                      const processingTime = Date.now() - processingStartTime;
                      performanceMetrics.recordProcessingTime(processingTime, result.success);

                      if (result.success) {
                        successfulProcessingCount++;
                        
                        // Record AI metrics if available
                        if (result.cost && result.cost > 0) {
                          performanceMetrics.recordAIMetrics(
                            processingTime,
                            true,
                            result.tokensUsed || 0,
                            result.cost
                          );
                        }
                      }
                    } catch (userError) {
                      const processingTime = Date.now() - processingStartTime;
                      performanceMetrics.recordProcessingTime(processingTime, false);
                      
                      cronLogger.error(`[${executionId}] User processing failed in optimized backlog`, {
                        error: userError instanceof Error ? userError.message : 'Unknown error',
                        userId: user.id,
                        ticker: filing.ticker.symbol
                      });
                    }
                  }

                  if (successfulProcessingCount > 0) {
                    const { markFilingAsProcessedByAccession } = await import('../../../../lib/sec-edgar/ticker-monitoring');
                    await markFilingAsProcessedByAccession(filing.accessionNumber, filing.ticker.symbol);
                    return successfulProcessingCount;
                  }
                  
                  return null;
                }, 'BACKLOG', prioritizedFiling.estimatedProcessingTime);
              });

              const batchResults = await Promise.allSettled(batchPromises);
              
              // Count successful processing and record metrics
              for (const result of batchResults) {
                if (result.status === 'fulfilled' && !result.value.skipped && result.value.result !== null) {
                  backlogProcessedCount += result.value.result;
                } else if (result.status === 'fulfilled' && result.value.skipped) {
                  circuitBreaker.recordProcessingComplete('BACKLOG', 0, false);
                }
              }

              const batchTime = Date.now() - batchStartTime;
              cronLogger.info(`[${executionId}] Backlog batch ${batchIndex + 1} completed in ${batchTime}ms`);

              // Delay between batches to respect API limits
              if (batchIndex < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }
          }

          // Record backlog metrics
          performanceMetrics.recordBacklogSize(unprocessedCount - backlogProcessedCount);
        }
      } catch (backlogError) {
        cronLogger.error(`[${executionId}] Enhanced backlog processing failed`, {
          error: backlogError instanceof Error ? backlogError.message : 'Unknown error'
        });
      }
    } else {
      cronLogger.warn(`[${executionId}] Circuit breaker skipped backlog processing`, {
        reason: backlogDecision.reason,
        timeRemaining: backlogDecision.timeConstraints.remaining
      });
      
      // Still count unprocessed filings for metrics
      try {
        const unprocessedFilings = await import('../../../../lib/sec-edgar/ticker-monitoring')
          .then(m => m.getUnprocessedFilings(100));
        unprocessedCount = unprocessedFilings.length;
        performanceMetrics.recordBacklogSize(unprocessedCount);
        performanceMetrics.recordCircuitBreakerActivation(unprocessedCount);
      } catch (error) {
        cronLogger.error(`[${executionId}] Failed to count unprocessed filings`, { error });
      }
    }

    // STEP 5: Core SEC Filing Monitoring with Circuit Breaker
    const filingMonitoringDecision = circuitBreaker.shouldProcessFiling('HIGH');
    let filingMonitoringResults;
    
    if (filingMonitoringDecision.shouldProcess) {
      cronLogger.info(`[${executionId}] Starting SEC filing monitoring with circuit breaker protection`);
      
      filingMonitoringResults = await Promise.race([
        CronSecFilingService.runSecFilingMonitoring(monitor),
        new Promise<never>((_, reject) => {
          timeoutController.signal.addEventListener('abort', () => {
            reject(new Error('SEC filing monitoring aborted by circuit breaker'));
          });
        })
      ]);
    } else {
      cronLogger.warn(`[${executionId}] Circuit breaker skipped SEC filing monitoring`, {
        reason: filingMonitoringDecision.reason
      });
      
      filingMonitoringResults = {
        tickersChecked: 0,
        newFilingsFound: 0,
        errors: 0
      };
      
      performanceMetrics.recordCircuitBreakerActivation(0);
    }

    // STEP 6: User Processing with Enhanced Parallel Processing
    const userProcessingDecision = circuitBreaker.shouldProcessFiling('NORMAL');
    let processingResults;
    
    if (userProcessingDecision.shouldProcess && eligibleUsers.length > 0) {
      cronLogger.info(`[${executionId}] Starting optimized user processing pipeline`);
      
      processingResults = await Promise.race([
        CronUserProcessingService.processEligibleUsers(
          eligibleUsers,
          allUsers,
          monitor,
          // Enhanced filing processor with performance monitoring
          async (user, tier, userFilingResults) => {
            const userProcessingStart = Date.now();
            
            try {
              let result;
              if (userFilingResults) {
                result = await CronFilingProcessor.processUserWithDeduplicatedFilings(
                  user,
                  tier,
                  userFilingResults
                );
              } else {
                result = await CronFilingProcessor.processUserTierFilings(user, tier);
              }
              
              const userProcessingTime = Date.now() - userProcessingStart;
              performanceMetrics.recordProcessingTime(userProcessingTime, result.success);
              
              return result;
            } catch (error) {
              const userProcessingTime = Date.now() - userProcessingStart;
              performanceMetrics.recordProcessingTime(userProcessingTime, false);
              throw error;
            }
          }
        ),
        new Promise<never>((_, reject) => {
          timeoutController.signal.addEventListener('abort', () => {
            reject(new Error('User processing aborted by circuit breaker'));
          });
        })
      ]);
    } else {
      cronLogger.warn(`[${executionId}] Circuit breaker or no eligible users - skipping user processing`, {
        shouldProcess: userProcessingDecision.shouldProcess,
        reason: userProcessingDecision.reason,
        eligibleUsers: eligibleUsers.length
      });
      
      processingResults = {
        usersProcessed: 0,
        filingsProcessed: 0,
        emailsSent: 0,
        totalCostUSD: 0,
        errors: []
      };
      
      if (!userProcessingDecision.shouldProcess) {
        performanceMetrics.recordCircuitBreakerActivation(0);
      }
    }

    // STEP 7: Final Results and Performance Analysis
    const results: CronResults & {
      filingMonitoring: typeof filingMonitoringResults;
      backlogProcessing: {
        unprocessedFound: number;
        backlogProcessed: number;
      };
      circuitBreakerStatus: ReturnType<IntelligentCircuitBreaker['getStatus']>;
      performanceMetrics: ReturnType<typeof performanceMetrics.getPerformanceStatus>;
    } = {
      ...processingResults,
      filingMonitoring: filingMonitoringResults,
      backlogProcessing: {
        unprocessedFound: unprocessedCount,
        backlogProcessed: backlogProcessedCount
      },
      circuitBreakerStatus: circuitBreaker.getStatus(),
      performanceMetrics: performanceMetrics.getPerformanceStatus()
    };

    // Record performance metrics to monitor
    if (monitor) {
      await performanceMetrics.recordToCronMonitor(monitor);
    }

    // Enhanced monitoring and alerting
    const totalFilingsAvailable = filingMonitoringResults.newFilingsFound + unprocessedCount;
    const totalFilingsProcessed = processingResults.filingsProcessed + backlogProcessedCount;
    const processingEfficiency = totalFilingsAvailable > 0 
      ? (totalFilingsProcessed / totalFilingsAvailable * 100).toFixed(1)
      : 'N/A';

    cronLogger.info(`[${executionId}] Optimized processing completed with enhanced analytics`, {
      totalFilingsAvailable,
      totalFilingsProcessed,
      processingEfficiency: processingEfficiency + '%',
      circuitBreakerActivations: results.circuitBreakerStatus.activations,
      healthScore: results.performanceMetrics.healthScore,
      timeoutsPrevented: results.circuitBreakerStatus.activations,
      recommendationsCount: results.performanceMetrics.recommendations.length
    });

    // Critical alert for processing failures with circuit breaker context
    if (totalFilingsAvailable > 0 && totalFilingsProcessed === 0 && monitor) {
      await monitor.createAlert('OPTIMIZED_PROCESSING_FAILURE', {
        severity: 'CRITICAL',
        message: `Enhanced pipeline detected ${totalFilingsAvailable} filings but processed 0`,
        details: {
          newFilingsFound: filingMonitoringResults.newFilingsFound,
          unprocessedBacklog: unprocessedCount,
          circuitBreakerActivations: results.circuitBreakerStatus.activations,
          healthScore: results.performanceMetrics.healthScore,
          recommendations: results.performanceMetrics.recommendations
        }
      });
    }

    // Complete monitoring
    const monitorResult = monitor ? 
      await monitor.complete(CronJobStatus.SUCCESS) : 
      { executionId: 'test', duration: 0 };
    
    clearTimeout(timeoutId);
    
    cronLogger.info(`[${executionId}] Enhanced tier-aware cron completed with 524 timeout prevention`, {
      ...results,
      executionId: monitorResult.executionId,
      duration: monitorResult.duration,
      optimizationsApplied: [
        'Intelligent circuit breaker',
        'Filing prioritization',
        'Performance monitoring',
        'Enhanced parallel processing'
      ]
    });

    return NextResponse.json({
      success: true,
      executionId: monitorResult.executionId,
      duration: monitorResult.duration,
      marketContext: {
        isMarketHours: marketContext.isMarketHours,
        isMarketDay: marketContext.isMarketDay
      },
      results,
      optimizations: {
        circuitBreakerActive: results.circuitBreakerStatus.isActive,
        timeoutsPrevented: results.circuitBreakerStatus.activations,
        healthScore: results.performanceMetrics.healthScore,
        recommendations: results.performanceMetrics.recommendations
      }
    });

  } catch (error) {
    clearTimeout(timeoutId);
    
    const isTimeoutError = error instanceof Error && error.message.includes('timeout');
    const circuitBreakerStatus = circuitBreaker.getStatus();
    
    // Record failure metrics
    const processingTime = Date.now() - startTime;
    performanceMetrics.recordProcessingTime(processingTime, false);
    
    if (monitor) {
      await monitor.complete(CronJobStatus.FAILED, error instanceof Error ? error.message : 'Unknown error');
      await performanceMetrics.recordToCronMonitor(monitor);
    }
    
    const errorType = isTimeoutError ? 'TIMEOUT' : 'ERROR';
    
    cronLogger.error(`[${executionId}] Enhanced tier-aware cron failed`, { 
      error,
      errorType,
      circuitBreakerActivations: circuitBreakerStatus.activations,
      timeConstraints: circuitBreakerStatus.timeConstraints,
      duration: processingTime
    });

    return NextResponse.json({
      success: false,
      error: isTimeoutError ? 'Request timeout (circuit breaker activated)' : 'Internal processing error',
      errorType,
      executionId,
      duration: processingTime,
      circuitBreakerStatus: circuitBreakerStatus,
      performanceMetrics: performanceMetrics.getPerformanceStatus()
    }, { status: isTimeoutError ? 408 : 500 });
  }
}

/**
 * Health check endpoint for circuit breaker and performance monitoring (no auth required)
 */
export async function HEAD(request: NextRequest) {
  const isDebugMode = request.headers.get('x-debug-mode') === 'true';
  
  const healthCheck = {
    status: 'healthy',
    endpoint: '/api/cron/tier-aware-optimized',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    circuitBreakerReady: true,
    performanceMonitoringReady: true,
    filingPrioritizerReady: true,
    authConfigured: !!process.env.CRON_SECRET,
    authSecretLength: process.env.CRON_SECRET?.length || 0,
    optimizationsEnabled: [
      'intelligent-circuit-breaker',
      'filing-prioritization', 
      'performance-monitoring',
      'enhanced-parallel-processing',
      '300s-timeout-configuration'
    ],
    timeoutConfiguration: {
      vercelTimeout: '300s (5 minutes - free plan)',
      circuitBreakerTimeout: '270s (4.5 minutes)',
      effectiveSafetyBuffer: '30s'
    }
  };
  
  // Add debug information if requested
  if (isDebugMode) {
    healthCheck['debug'] = {
      headers: Object.fromEntries(request.headers.entries()),
      url: request.url,
      method: request.method
    };
  }

  return new NextResponse(JSON.stringify(healthCheck), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Optimizations-Enabled': 'true',
      'X-Circuit-Breaker-Ready': 'true',
      'X-Endpoint-Status': 'healthy',
      'X-Auth-Configured': process.env.CRON_SECRET ? 'true' : 'false'
    }
  });
}