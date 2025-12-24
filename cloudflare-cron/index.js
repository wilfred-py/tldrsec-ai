// index.js - Cloudflare Worker for Cron Trigger
// Enhanced with advanced rate limiting, circuit breaker patterns, and comprehensive monitoring
// Features: Request tracking, adaptive backoff, circuit breaker state persistence, burst protection

export default {
  // Handle HTTP requests (required by Cloudflare Workers)
  async fetch(request, env, ctx) {
    return new Response('TLDRSEC Cron Worker - This endpoint is for scheduled execution only', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  },

  // Handle scheduled cron events with basic rate limiting
  async scheduled(event, env, ctx) {
    // Determine which cron schedule triggered this execution
    // event.cron contains the cron expression that triggered this event
    const cronExpression = event.cron;

    // Route based on cron expression
    // "*/5 * * * *" = Pipeline processing (every 5 minutes)
    // "*/10 * * * *" = 10-minute interval Slack summary (detailed verification report)
    // "0 22 * * *" = Daily Slack report (9 AM AEST = 22:00 UTC)

    if (cronExpression === '*/10 * * * *') {
      // 10-minute interval Slack summary (detailed verification report)
      return await this.handleIntervalSummary(event, env, ctx);
    }

    if (cronExpression === '0 22 * * *') {
      // Daily Slack report (9 AM AEST)
      return await this.handleDailyReport(event, env, ctx);
    }

    // Default: Pipeline processing (*/5 * * * *)
    return await this.handlePipelineProcessing(event, env, ctx);
  },

  // Handle 10-minute interval Slack summary (replaces hourly)
  async handleIntervalSummary(event, env, ctx) {
    const executionId = `interval-summary-${Date.now()}`;
    const startTime = Date.now();

    console.log(`[${executionId}] Starting 10-minute interval Slack summary`);

    try {
      const url = `${env.PUBLIC_URL}/api/cron/slack-interval-summary`;

      // Generate HMAC signature
      const timestamp = Date.now();
      const payload = `${timestamp}:GET:/api/cron/slack-interval-summary`;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(env.CRON_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
      const signatureHex = Array.from(new Uint8Array(signature))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Execution-Id': executionId,
          'X-Cloudflare-Worker': 'tldrsec-cron',
          'x-hmac-signature': signatureHex,
          'x-hmac-timestamp': timestamp.toString(),
        },
      });

      const duration = Date.now() - startTime;

      if (response.ok) {
        const result = await response.json();
        console.log(`[${executionId}] Interval summary completed successfully in ${duration}ms`, {
          skipped: result.skipped || false,
        });
        return { success: true, executionId, duration, skipped: result.skipped };
      } else {
        const errorText = await response.text();
        console.error(`[${executionId}] Interval summary failed: ${response.status} - ${errorText}`);
        return { success: false, executionId, duration, error: errorText };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${executionId}] Interval summary error: ${error.message}`);
      return { success: false, executionId, duration, error: error.message };
    }
  },

  // Handle daily Slack report (9 AM AEST)
  async handleDailyReport(event, env, ctx) {
    const executionId = `daily-report-${Date.now()}`;
    const startTime = Date.now();

    console.log(`[${executionId}] Starting daily Slack report (9 AM AEST)`);

    try {
      const url = `${env.PUBLIC_URL}/api/cron/slack-daily-report`;

      // Generate HMAC signature
      const timestamp = Date.now();
      const payload = `${timestamp}:GET:/api/cron/slack-daily-report`;
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(env.CRON_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
      const signatureHex = Array.from(new Uint8Array(signature))
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Execution-Id': executionId,
          'X-Cloudflare-Worker': 'tldrsec-cron',
          'x-hmac-signature': signatureHex,
          'x-hmac-timestamp': timestamp.toString(),
        },
      });

      const duration = Date.now() - startTime;

      if (response.ok) {
        console.log(`[${executionId}] Daily report completed successfully in ${duration}ms`);
        return { success: true, executionId, duration };
      } else {
        const errorText = await response.text();
        console.error(`[${executionId}] Daily report failed: ${response.status} - ${errorText}`);
        return { success: false, executionId, duration, error: errorText };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${executionId}] Daily report error: ${error.message}`);
      return { success: false, executionId, duration, error: error.message };
    }
  },

  // Handle main pipeline processing (every 5 minutes)
  async handlePipelineProcessing(event, env, ctx) {
    // Initialize monitoring services (KV storage is optional)
    const rateLimiter = new AdvancedRateLimiter(null, null, null); // Use memory fallback
    const circuitBreaker = new CircuitBreaker(null, rateLimiter);
    const monitor = new WorkerMonitor(null); // Use memory fallback

    // Generate secure execution ID using crypto API
    const generateSecureExecutionId = () => {
      const timestamp = Date.now();
      const randomArray = new Uint8Array(16);
      crypto.getRandomValues(randomArray);
      const randomHex = Array.from(randomArray, byte => byte.toString(16).padStart(2, '0')).join('').substring(0, 16);
      return `cron-${timestamp}-${randomHex}`;
    };

    const executionId = generateSecureExecutionId();
    const startTime = Date.now();
    
    // Log initialization (KV storage not used in this build)
    console.log(`[${executionId}] Worker initialized with memory-only storage`);
    
    console.log(`[${executionId}] Starting TLDRSEC scheduled cron job execution with enhanced rate limiting`);
    
    // Enhanced rate limiting configuration with global subrequest awareness
    const WORKER_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (maximum Cloudflare limit)
    const REQUEST_TIMEOUT_MS = 4.5 * 60 * 1000; // 4.5 minutes for individual request (aligns with Vercel 5-min limit)
    const MAX_ATTEMPTS = 5; // Intelligent retry attempts
    const INITIAL_BACKOFF_MS = 500; // Fast initial recovery
    const MAX_BACKOFF_MS = 180000; // 3 minutes maximum backoff for severe rate limiting
    const JITTER_PERCENTAGE = 30; // Enhanced jitter to prevent thundering herd
    const RATE_LIMIT_WINDOW_MS = 60000; // 1-minute rate limiting window
    const MAX_REQUESTS_PER_WINDOW = 30; // Conservative request limit (reduced from 50)
    const CIRCUIT_BREAKER_THRESHOLD = 3; // Circuit opens after 3 consecutive failures (reduced for faster protection)
    const GLOBAL_SUBREQUEST_LIMIT = 1800; // Global limit per minute (10% buffer under 2000 limit)
    const BURST_PROTECTION_WINDOW_MS = 10000; // 10-second burst window
    const MAX_BURST_REQUESTS = 5; // Maximum requests in burst window
    
    try {
      // Environment validation with KV storage checks
      const envValidation = validateEnvironment(env);
      if (!envValidation.isValid) {
        throw new Error(`Environment validation failed: ${envValidation.errors.join(', ')}`);
      }
      
      console.log(`[${executionId}] Environment validation passed`);
      
      // Initialize monitoring and rate limiting
      await monitor.recordExecution(executionId, 'started', { startTime });
      
      // Check circuit breaker state before proceeding
      const circuitState = await circuitBreaker.getState();
      console.log(`[${executionId}] Circuit breaker state: ${circuitState.state} (failures: ${circuitState.failureCount}, last failure: ${circuitState.lastFailureTime})`);
      
      if (circuitState.state === 'OPEN') {
        const timeUntilReset = circuitState.nextRetryTime - Date.now();
        if (timeUntilReset > 0) {
          console.log(`[${executionId}] Circuit breaker is OPEN, waiting ${timeUntilReset}ms before retry`);
          await monitor.recordExecution(executionId, 'circuit_breaker_blocked', { timeUntilReset });
          return {
            success: false,
            reason: 'circuit_breaker_open',
            nextRetryTime: circuitState.nextRetryTime,
            executionId
          };
        } else {
          // Try to move to HALF_OPEN state
          await circuitBreaker.halfOpen();
          console.log(`[${executionId}] Circuit breaker moved to HALF_OPEN state for testing`);
        }
      }
      
      // Enhanced rate limiting with global subrequest tracking
      const rateLimitCheck = await rateLimiter.checkRateLimit(executionId, {
        windowMs: RATE_LIMIT_WINDOW_MS,
        maxRequests: MAX_REQUESTS_PER_WINDOW,
        burstLimit: MAX_BURST_REQUESTS,
        globalLimit: GLOBAL_SUBREQUEST_LIMIT,
        burstWindowMs: BURST_PROTECTION_WINDOW_MS
      });
      
      if (!rateLimitCheck.allowed) {
        console.log(`[${executionId}] Rate limit exceeded: ${rateLimitCheck.reason}, reset in ${rateLimitCheck.resetTimeMs}ms`);
        console.log(`[${executionId}] Rate limit details:`, {
          globalUsage: rateLimitCheck.globalUsage,
          burstUsage: rateLimitCheck.burstUsage,
          remaining: rateLimitCheck.remaining
        });
        await monitor.recordExecution(executionId, 'rate_limited', rateLimitCheck);
        return {
          success: false,
          reason: 'rate_limited',
          resetTime: Date.now() + rateLimitCheck.resetTimeMs,
          executionId
        };
      }
      
      // Build URLs for Vercel endpoints (five-step pipeline for async processing)
      // Step 0: Proactive lock cleanup (PREVENTS PIPELINE STALLS!)
      const cleanupLocksUrl = `${env.PUBLIC_URL}/api/cron/cleanup-locks`;
      // Step 1: Queue new filings for discovery
      const tierAwareUrl = `${env.PUBLIC_URL}/api/cron/tier-aware`;
      // Step 1.5: Process discovery jobs (RSS feed checking, queues fetch jobs)
      const discoveryUrl = `${env.PUBLIC_URL}/api/cron/process-filing-queue?jobTypes=ASYNC_DISCOVER_FILINGS`;
      // Step 2: Process fetch jobs (content retrieval from SEC)
      // IMPORTANT: We separate fetch and summarize jobs to ensure both get processing time.
      // The previous combined approach caused summarize jobs to be blocked by the fetch backlog.
      const fetchUrl = `${env.PUBLIC_URL}/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING`;
      // Step 3: Process summarize jobs (AI summarization)
      const summarizeUrl = `${env.PUBLIC_URL}/api/cron/process-filing-queue?jobTypes=ASYNC_SUMMARIZE_CACHED`;
      const dailyCountUrl = `${env.PUBLIC_URL}/api/cron/update-daily-count`;

      console.log(`[${executionId}] Five-step pipeline configuration:`, {
        step0: cleanupLocksUrl,
        step1: tierAwareUrl,
        step1_5: discoveryUrl,
        step2: fetchUrl,
        step3: summarizeUrl,
        pattern: 'Sequential execution: cleanup → queue discovery → process discovery → fetch → summarize'
      });
      console.log(`[${executionId}] PUBLIC_URL: ${env.PUBLIC_URL}`);
      console.log(`[${executionId}] CRON_SECRET configured: ${env.CRON_SECRET ? 'Yes (' + env.CRON_SECRET.length + ' chars)' : 'No'}`);
      
      // Helper function to generate HMAC signature for a specific URL
      const generateSignature = async (targetUrl) => {
        const urlObj = new URL(targetUrl);
        const method = 'GET';
        const path = urlObj.pathname;
        const timestamp = Date.now();

        // Create HMAC payload: timestamp:method:path
        const payload = `${timestamp}:${method.toUpperCase()}:${path}`;

        // Generate HMAC-SHA256 signature
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(env.CRON_SECRET),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
        const signatureHex = Array.from(new Uint8Array(signature))
          .map(byte => byte.toString(16).padStart(2, '0'))
          .join('');

        return { signatureHex, timestamp, method, path, payload };
      };

      // Helper function to create headers for a request
      const createHeaders = (signatureHex, timestamp) => {
        const headers = {
          'Content-Type': 'application/json',
          'User-Agent': 'TLDRSEC-Cloudflare-Worker-HMAC/2.4.0',
          'X-Cloudflare-Worker': 'tldrsec-cron',
          'X-Cron-Source': 'cloudflare-worker',
          'X-Execution-Id': executionId,
          'X-Worker-Timeout': WORKER_TIMEOUT_MS.toString(),
          'X-Effective-Timeout': REQUEST_TIMEOUT_MS.toString(),
          'X-Request-Start-Time': startTime.toString(),
          'X-Cron-Frequency': '10-minutes',
          'X-Processing-Mode': 'async',
          'X-Debug-Mode': 'true',
          // HMAC Authentication Headers (secure)
          'x-hmac-signature': signatureHex,
          'x-hmac-timestamp': timestamp.toString()
        };

        // Add Vercel deployment protection bypass if configured
        if (env.VERCEL_AUTOMATION_BYPASS_SECRET) {
          headers['x-vercel-protection-bypass'] = env.VERCEL_AUTOMATION_BYPASS_SECRET;
          headers['x-vercel-set-bypass-cookie'] = 'true';
        }

        return headers;
      };

      // ========================================
      // STEP 0: Proactive Lock Cleanup (CRITICAL!)
      // ========================================
      // This step MUST run first to prevent pipeline stalls from stale locks.
      // The pipeline was stalled for 8 days due to an expired lock that was never cleaned up.
      console.log(`[${executionId}] ====== STEP 0: LOCK CLEANUP ======`);
      console.log(`[${executionId}] Step 0: Calling cleanup-locks endpoint to clear stale locks...`);
      let cleanupResult;
      try {
        const { signatureHex: step0Signature, timestamp: step0Timestamp } = await generateSignature(cleanupLocksUrl);
        const cleanupHeaders = createHeaders(step0Signature, step0Timestamp);

        cleanupResult = await executeWithAdvancedRateLimiting({
          executionId,
          url: cleanupLocksUrl,
          headers: cleanupHeaders,
          workerTimeoutMs: WORKER_TIMEOUT_MS,
          requestTimeoutMs: 30000, // 30 seconds is plenty for lock cleanup
          maxAttempts: 2, // Quick retry, don't waste time
          initialBackoffMs: INITIAL_BACKOFF_MS,
          maxBackoffMs: 5000, // Max 5 second backoff
          jitterPercentage: JITTER_PERCENTAGE,
          rateLimiter,
          circuitBreaker,
          monitor,
          rateLimitConfig: {
            windowMs: RATE_LIMIT_WINDOW_MS,
            maxRequests: MAX_REQUESTS_PER_WINDOW,
            burstLimit: MAX_BURST_REQUESTS,
            globalLimit: GLOBAL_SUBREQUEST_LIMIT,
            burstWindowMs: BURST_PROTECTION_WINDOW_MS,
            breakerThreshold: CIRCUIT_BREAKER_THRESHOLD
          }
        });

        console.log(`[${executionId}] Step 0 completed: lock cleanup success`, {
          locksCleared: cleanupResult?.cleanup?.expiredLocksCleared || 0,
          healthStatus: cleanupResult?.health?.status || 'UNKNOWN',
          activeLocks: cleanupResult?.health?.activeLocks || 0,
          staleLocks: cleanupResult?.health?.staleLocksCount || 0
        });
      } catch (cleanupError) {
        // Log but don't fail - cleanup is important but shouldn't block pipeline
        console.warn(`[${executionId}] Step 0 warning: lock cleanup failed (continuing anyway)`, {
          error: cleanupError.message
        });
        cleanupResult = { success: false, error: cleanupError.message };
      }

      // ========================================
      // STEP 1: Queue Discovery Jobs
      // ========================================
      console.log(`[${executionId}] ====== STEP 1: DISCOVERY ======`);
      console.log(`[${executionId}] Step 1: Calling tier-aware endpoint to queue filings...`);
      let tierAwareResult;
      try {
        const { signatureHex, timestamp } = await generateSignature(tierAwareUrl);
        const tierAwareHeaders = createHeaders(signatureHex, timestamp);

        tierAwareResult = await executeWithAdvancedRateLimiting({
          executionId,
          url: tierAwareUrl,
          headers: tierAwareHeaders,
          workerTimeoutMs: WORKER_TIMEOUT_MS,
          requestTimeoutMs: REQUEST_TIMEOUT_MS,
          maxAttempts: MAX_ATTEMPTS,
          initialBackoffMs: INITIAL_BACKOFF_MS,
          maxBackoffMs: MAX_BACKOFF_MS,
          jitterPercentage: JITTER_PERCENTAGE,
          rateLimiter,
          circuitBreaker,
          monitor,
          rateLimitConfig: {
            windowMs: RATE_LIMIT_WINDOW_MS,
            maxRequests: MAX_REQUESTS_PER_WINDOW,
            burstLimit: MAX_BURST_REQUESTS,
            globalLimit: GLOBAL_SUBREQUEST_LIMIT,
            burstWindowMs: BURST_PROTECTION_WINDOW_MS,
            breakerThreshold: CIRCUIT_BREAKER_THRESHOLD
          }
        });

        console.log(`[${executionId}] Step 1 completed: tier-aware endpoint success`, {
          queuedJobs: tierAwareResult?.queue?.filingsQueued || 0,
          queueDepth: tierAwareResult?.queue?.queueDepth || 0
        });
      } catch (tierAwareError) {
        console.error(`[${executionId}] Step 1 failed: tier-aware endpoint error`, {
          error: tierAwareError.message
        });
        throw tierAwareError; // Don't proceed if queueing fails
      }

      // ========================================
      // STEP 1.5: Process Discovery Jobs (CRITICAL!)
      // ========================================
      // This step processes the ASYNC_DISCOVER_FILINGS jobs queued in Step 1.
      // Without this step, discovery jobs accumulate indefinitely in PENDING status.
      // Discovery jobs check RSS feeds for each user's tickers and queue fetch jobs.
      console.log(`[${executionId}] ====== STEP 1.5: DISCOVERY JOBS ======`);
      console.log(`[${executionId}] Step 1.5: Processing discovery jobs...`);
      let discoveryResult;
      try {
        const { signatureHex: discoverySignature, timestamp: discoveryTimestamp } = await generateSignature(discoveryUrl);
        const discoveryHeaders = createHeaders(discoverySignature, discoveryTimestamp);

        // Discovery uses reduced timeout (90s) and single attempt to leave time for Steps 2-3
        // Discovery processes many tickers via SEC API and can legitimately take >100s
        // If it fails, jobs retry on next cron cycle - no need to retry within same invocation
        const DISCOVERY_TIMEOUT_MS = 90 * 1000; // 90 seconds (reduced from 270s)
        const DISCOVERY_MAX_ATTEMPTS = 1; // No retries - fails fast to allow Steps 2-3

        discoveryResult = await executeWithAdvancedRateLimiting({
          executionId,
          url: discoveryUrl,
          headers: discoveryHeaders,
          workerTimeoutMs: WORKER_TIMEOUT_MS,
          requestTimeoutMs: DISCOVERY_TIMEOUT_MS,  // Reduced from REQUEST_TIMEOUT_MS
          maxAttempts: DISCOVERY_MAX_ATTEMPTS,     // Reduced from MAX_ATTEMPTS
          initialBackoffMs: INITIAL_BACKOFF_MS,
          maxBackoffMs: MAX_BACKOFF_MS,
          jitterPercentage: JITTER_PERCENTAGE,
          rateLimiter,
          circuitBreaker,
          monitor,
          rateLimitConfig: {
            windowMs: RATE_LIMIT_WINDOW_MS,
            maxRequests: MAX_REQUESTS_PER_WINDOW,
            burstLimit: MAX_BURST_REQUESTS,
            globalLimit: GLOBAL_SUBREQUEST_LIMIT,
            burstWindowMs: BURST_PROTECTION_WINDOW_MS,
            breakerThreshold: CIRCUIT_BREAKER_THRESHOLD
          }
        });

        console.log(`[${executionId}] Step 1.5 completed: discovery jobs processed`, {
          jobsProcessed: discoveryResult?.processed || 0,
          fetchJobsQueued: discoveryResult?.queued || 0
        });
      } catch (discoveryError) {
        console.error(`[${executionId}] Step 1.5 failed: discovery jobs error`, {
          error: discoveryError.message
        });
        // Continue to fetch step even if discovery fails - jobs will retry on next cycle
        console.warn(`[${executionId}] Discovery processing failed, continuing to fetch step`);
        discoveryResult = { success: false, error: discoveryError.message };

        // CRITICAL FIX: Reset circuit breaker after discovery timeout
        // Discovery jobs can take 100+ seconds (processing many tickers via SEC API)
        // which triggers 524 timeouts. This should NOT block fetch/summarize steps
        // since those are different endpoints that work correctly.
        // See: 2025-12-16 pipeline stall investigation - discovery timeout causing
        // circuit breaker to open and block Steps 2-3.
        const isDiscoveryTimeout = discoveryError.message?.includes('Circuit breaker') ||
                                   discoveryError.message?.includes('524') ||
                                   discoveryError.message?.includes('timeout');
        if (isDiscoveryTimeout) {
          console.log(`[${executionId}] Resetting circuit breaker after discovery timeout to allow Steps 2-3`);
          await circuitBreaker.reset();
        }
      }

      // ========================================
      // STEP 2: Process Fetch Jobs (Content Retrieval)
      // ========================================
      console.log(`[${executionId}] ====== STEP 2: FETCH JOBS ======`);
      console.log(`[${executionId}] Step 2: Calling process-filing-queue endpoint to process fetch jobs...`);
      let fetchResult;
      try {
        const { signatureHex, timestamp } = await generateSignature(fetchUrl);
        const fetchHeaders = createHeaders(signatureHex, timestamp);

        fetchResult = await executeWithAdvancedRateLimiting({
          executionId,
          url: fetchUrl,
          headers: fetchHeaders,
          workerTimeoutMs: WORKER_TIMEOUT_MS,
          requestTimeoutMs: REQUEST_TIMEOUT_MS,
          maxAttempts: MAX_ATTEMPTS,
          initialBackoffMs: INITIAL_BACKOFF_MS,
          maxBackoffMs: MAX_BACKOFF_MS,
          jitterPercentage: JITTER_PERCENTAGE,
          rateLimiter,
          circuitBreaker,
          monitor,
          rateLimitConfig: {
            windowMs: RATE_LIMIT_WINDOW_MS,
            maxRequests: MAX_REQUESTS_PER_WINDOW,
            burstLimit: MAX_BURST_REQUESTS,
            globalLimit: GLOBAL_SUBREQUEST_LIMIT,
            burstWindowMs: BURST_PROTECTION_WINDOW_MS,
            breakerThreshold: CIRCUIT_BREAKER_THRESHOLD
          }
        });

        console.log(`[${executionId}] Step 2 completed: fetch jobs endpoint success`);
      } catch (fetchError) {
        console.error(`[${executionId}] Step 2 failed: fetch jobs endpoint error`, {
          error: fetchError.message
        });
        // Don't throw - log warning but continue to Step 3
        console.warn(`[${executionId}] Fetch endpoint failed but continuing to summarize step`);
      }

      // ========================================
      // STEP 3: Process Summarize Jobs (AI Processing)
      // ========================================
      console.log(`[${executionId}] ====== STEP 3: SUMMARIZE JOBS ======`);
      console.log(`[${executionId}] Step 3: Calling process-filing-queue endpoint to process summarize jobs...`);
      let summarizeResult;
      try {
        const { signatureHex: step3Signature, timestamp: step3Timestamp } = await generateSignature(summarizeUrl);
        const summarizeHeaders = createHeaders(step3Signature, step3Timestamp);
        console.log(`[${executionId}] Step 3 URL: ${summarizeUrl}`);
        console.log(`[${executionId}] Step 3 signature generated, timestamp: ${step3Timestamp}`);

        summarizeResult = await executeWithAdvancedRateLimiting({
          executionId,
          url: summarizeUrl,
          headers: summarizeHeaders,
          workerTimeoutMs: WORKER_TIMEOUT_MS,
          requestTimeoutMs: REQUEST_TIMEOUT_MS,
          maxAttempts: MAX_ATTEMPTS,
          initialBackoffMs: INITIAL_BACKOFF_MS,
          maxBackoffMs: MAX_BACKOFF_MS,
          jitterPercentage: JITTER_PERCENTAGE,
          rateLimiter,
          circuitBreaker,
          monitor,
          rateLimitConfig: {
            windowMs: RATE_LIMIT_WINDOW_MS,
            maxRequests: MAX_REQUESTS_PER_WINDOW,
            burstLimit: MAX_BURST_REQUESTS,
            globalLimit: GLOBAL_SUBREQUEST_LIMIT,
            burstWindowMs: BURST_PROTECTION_WINDOW_MS,
            breakerThreshold: CIRCUIT_BREAKER_THRESHOLD
          }
        });

        console.log(`[${executionId}] Step 3 completed: summarize jobs endpoint success`);
      } catch (summarizeError) {
        console.error(`[${executionId}] Step 3 failed: summarize jobs endpoint error`, {
          error: summarizeError.message
        });
        // Don't throw - log warning but consider execution partially successful
        console.warn(`[${executionId}] Summarize endpoint failed - jobs will retry on next cycle`);
      }

      // Combine results from all five endpoints (including discovery)
      const result = {
        cleanup: cleanupResult,
        tierAware: tierAwareResult,
        discovery: discoveryResult,
        fetch: fetchResult,
        summarize: summarizeResult,
        // Note: cleanup and discovery failures don't fail the whole pipeline
        // Discovery failures are non-fatal - jobs will retry on next cycle
        combinedSuccess: tierAwareResult?.success && fetchResult?.success && summarizeResult?.success,
        metrics: {
          cleanup: {
            duration: cleanupResult?.duration || 0,
            locksCleared: cleanupResult?.cleanup?.expiredLocksCleared || 0,
            healthStatus: cleanupResult?.health?.status || 'UNKNOWN',
            status: cleanupResult?.success ? 'success' : 'warning' // warning, not failed
          },
          tierAware: {
            duration: tierAwareResult?.duration || 0,
            filesProcessed: tierAwareResult?.filesProcessed || 0,
            status: tierAwareResult?.success ? 'success' : 'failed'
          },
          discovery: {
            duration: discoveryResult?.duration || 0,
            jobsProcessed: discoveryResult?.processed || 0,
            fetchJobsQueued: discoveryResult?.queued || 0,
            status: discoveryResult?.success ? 'success' : 'warning' // warning, not failed
          },
          fetch: {
            duration: fetchResult?.duration || 0,
            filesProcessed: fetchResult?.filesProcessed || 0,
            status: fetchResult?.success ? 'success' : 'failed'
          },
          summarize: {
            duration: summarizeResult?.duration || 0,
            filesProcessed: summarizeResult?.filesProcessed || 0,
            status: summarizeResult?.success ? 'success' : 'failed'
          }
        }
      };

      const duration = Date.now() - startTime;

      console.log(`[${executionId}] Five-step pipeline execution completed in ${duration}ms:`, {
        step0Cleanup: result.metrics.cleanup.status,
        step0LocksCleared: result.metrics.cleanup.locksCleared,
        step0HealthStatus: result.metrics.cleanup.healthStatus,
        step1TierAware: result.metrics.tierAware.status,
        step1_5Discovery: result.metrics.discovery.status,
        step1_5JobsProcessed: result.metrics.discovery.jobsProcessed,
        step2Fetch: result.metrics.fetch.status,
        step3Summarize: result.metrics.summarize.status,
        combinedSuccess: result.combinedSuccess,
        totalDuration: duration,
        cleanupDuration: result.metrics.cleanup.duration,
        tierAwareDuration: result.metrics.tierAware.duration,
        discoveryDuration: result.metrics.discovery.duration,
        fetchDuration: result.metrics.fetch.duration,
        summarizeDuration: result.metrics.summarize.duration
      });

      // Call daily count update endpoint after main cron job
      try {
        console.log(`[${executionId}] Calling daily count update endpoint: ${dailyCountUrl}`);

        const dailyCountResponse = await fetch(dailyCountUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.CRON_SECRET}`,
            'Content-Type': 'application/json',
            'X-Execution-Id': `${executionId}-daily-count`,
            'X-Cloudflare-Worker': 'tldrsec-cron',
            'X-Cron-Source': 'cloudflare-worker'
          }
        });

        const dailyCountResult = dailyCountResponse.ok ? await dailyCountResponse.json() : await dailyCountResponse.text();

        console.log(`[${executionId}] Daily count update completed:`, dailyCountResult);
      } catch (dailyCountError) {
        // Don't fail the main cron job if daily count update fails
        console.warn(`[${executionId}] Daily count update failed (non-critical):`, dailyCountError.message);
      }

      // ========================================
      // OPTIONAL: Pipeline Health Check (Monitoring)
      // ========================================
      // This runs after the main pipeline to log health status for monitoring.
      // It's non-blocking and won't affect the pipeline execution.
      try {
        const healthUrl = `${env.PUBLIC_URL}/api/health/pipeline`;
        console.log(`[${executionId}] Checking pipeline health: ${healthUrl}`);

        const healthResponse = await fetch(healthUrl, {
          method: 'GET',
          headers: {
            'X-Execution-Id': `${executionId}-health`,
            'X-Cloudflare-Worker': 'tldrsec-cron'
          }
        });

        if (healthResponse.ok) {
          const healthData = await healthResponse.json();
          console.log(`[${executionId}] Pipeline Health Check:`, {
            status: healthData.status,
            locks: healthData.locks,
            pendingJobs: healthData.jobs?.pending,
            processingJobs: healthData.jobs?.processing,
            completedLast1h: healthData.jobs?.completedLast1h,
            minutesSinceLastCompletion: healthData.minutesSinceLastCompletion,
            issues: healthData.issues?.length || 0
          });

          // Log warning if pipeline health is degraded or critical
          if (healthData.status === 'CRITICAL') {
            console.error(`[${executionId}] PIPELINE HEALTH CRITICAL!`, {
              issues: healthData.issues,
              recommendations: healthData.recommendations
            });
          } else if (healthData.status === 'DEGRADED') {
            console.warn(`[${executionId}] Pipeline health degraded:`, {
              issues: healthData.issues
            });
          }
        } else {
          console.warn(`[${executionId}] Health check returned status ${healthResponse.status}`);
        }
      } catch (healthError) {
        // Don't fail the main cron job if health check fails
        console.warn(`[${executionId}] Health check failed (non-critical):`, healthError.message);
      }

      // Update circuit breaker based on combined success
      // Only mark as success if ALL THREE endpoints succeed
      if (result.combinedSuccess) {
        await monitor.recordExecution(executionId, 'completed', {
          duration,
          success: true,
          cleanupMetrics: result.metrics.cleanup,
          tierAwareMetrics: result.metrics.tierAware,
          fetchMetrics: result.metrics.fetch,
          summarizeMetrics: result.metrics.summarize
        });
        await circuitBreaker.recordSuccess();
        await rateLimiter.recordSuccess(executionId);

        console.log(`[${executionId}] All processing endpoints succeeded - circuit breaker updated`);
      } else {
        // Partial failure - at least one endpoint failed
        const failedSteps = [];
        if (!tierAwareResult?.success) failedSteps.push('tier-aware');
        if (!fetchResult?.success) failedSteps.push('fetch');
        if (!summarizeResult?.success) failedSteps.push('summarize');
        const failureReason = `${failedSteps.join(', ')} endpoint(s) failed`;

        console.warn(`[${executionId}] Partial failure: ${failureReason}`);

        await monitor.recordExecution(executionId, 'partial_failure', {
          duration,
          success: false,
          failureReason,
          cleanupMetrics: result.metrics.cleanup,
          tierAwareMetrics: result.metrics.tierAware,
          fetchMetrics: result.metrics.fetch,
          summarizeMetrics: result.metrics.summarize
        });

        // Record failure in circuit breaker
        const error = new Error(`Pipeline execution failed: ${failureReason}`);
        await circuitBreaker.recordFailure(error);
        await rateLimiter.recordFailure(executionId, 'PARTIAL_FAILURE');
      }

      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorType = classifyError(error);
      
      // Safe error message for external logs (no sensitive details)
      const safeErrorMessage = (() => {
        switch (errorType) {
          case 'ENDPOINT_NOT_FOUND': return 'Endpoint not found (404) - Check deployment status';
          case 'AUTHENTICATION_ERROR': return 'Authentication failed - Verify CRON_SECRET';
          case 'VERCEL_TIMEOUT_524': return 'AI processing timeout (524) - Extended processing time exceeded limits';
          case 'TIMEOUT': return 'Execution timeout';
          case 'SERVICE_UNAVAILABLE': return 'Target service unavailable';
          case 'RATE_LIMITED': return 'Rate limit exceeded';
          case 'NETWORK_ERROR': return 'Network connectivity issue';
          default: return 'Execution failed';
        }
      })();
      
      // Log full error details for debugging but use safe message externally
      console.error(`[${executionId}] Cron job failed after ${duration}ms`, {
        error: error.message,
        errorType,
        duration,
        stack: error.stack
      });
      
      // Record failure and update circuit breaker state
      try {
        await monitor.recordExecution(executionId, 'failed', { duration, error: error.message, errorType });
        await circuitBreaker.recordFailure(error);
        await rateLimiter.recordFailure(executionId, errorType);
      } catch (recordingError) {
        console.error(`[${executionId}] Failed to record failure metrics:`, recordingError);
      }
      
      // Don't throw - let Cloudflare handle gracefully
      return {
        success: false,
        error: safeErrorMessage,
        errorType,
        executionId,
        duration
      };
    }
  }
};

/**
 * Validate environment configuration
 */
function validateEnvironment(env) {
  const errors = [];
  
  if (!env.CRON_SECRET) {
    errors.push('CRON_SECRET not defined');
  } else if (env.CRON_SECRET.length < 32) {
    errors.push(`CRON_SECRET too short: ${env.CRON_SECRET.length} chars (minimum 32)`);
  }
  
  if (!env.PUBLIC_URL) {
    errors.push('PUBLIC_URL not defined');
  } else if (!env.PUBLIC_URL.startsWith('https://')) {
    errors.push('PUBLIC_URL must use HTTPS');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Execute request with advanced rate limiting, circuit breaker protection, and intelligent retry logic
 */
async function executeWithAdvancedRateLimiting({
  executionId,
  url,
  headers,
  workerTimeoutMs,
  requestTimeoutMs,
  maxAttempts,
  initialBackoffMs,
  maxBackoffMs,
  jitterPercentage,
  rateLimiter,
  circuitBreaker,
  monitor,
  rateLimitConfig
}) {
  let lastError;
  let consecutiveRateLimitErrors = 0;
  const rateLimitBackoffMultiplier = 2; // Extra backoff for rate limiting
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStartTime = Date.now();
    const remainingWorkerTime = workerTimeoutMs - (attemptStartTime - parseInt(headers['X-Request-Start-Time']));

    // Check circuit breaker state before each attempt
    const circuitState = await circuitBreaker.getState();

    console.log(`[${executionId}] Enhanced attempt ${attempt}/${maxAttempts}:`, {
      remainingWorkerTime: `${remainingWorkerTime}ms`,
      circuitState: circuitState.state,
      failureCount: circuitState.failureCount,
      lastFailureTime: circuitState.lastFailureTime ? new Date(circuitState.lastFailureTime).toISOString() : null,
      consecutiveRateLimitErrors,
      globalRateLimitProtection: true
    });
    if (circuitState.state === 'OPEN') {
      console.log(`[${executionId}] Circuit breaker is OPEN on attempt ${attempt}, aborting`);
      throw new Error('Circuit breaker is OPEN - too many consecutive failures');
    }
    
    // Check rate limiting before each attempt  
    const rateLimitCheck = await rateLimiter.checkRateLimit(executionId);
    if (!rateLimitCheck.allowed) {
      console.log(`[${executionId}] Rate limited on attempt ${attempt}: ${rateLimitCheck.reason}`);
      
      // Wait for rate limit reset if time allows
      if (rateLimitCheck.resetTimeMs < remainingWorkerTime) {
        console.log(`[${executionId}] Waiting ${rateLimitCheck.resetTimeMs}ms for rate limit reset`);
        await new Promise(resolve => setTimeout(resolve, rateLimitCheck.resetTimeMs));
        continue; // Retry without counting as an attempt
      } else {
        throw new Error(`Rate limited and insufficient time to wait for reset: ${rateLimitCheck.resetTimeMs}ms needed, ${remainingWorkerTime}ms available`);
      }
    }
    
    // Check if we have enough time for this attempt
    if (remainingWorkerTime < 30000) { // Need at least 30 seconds
      throw new Error(`Insufficient time remaining: ${remainingWorkerTime}ms`);
    }

    // Use the smaller of request timeout or remaining worker time
    const effectiveTimeout = Math.min(requestTimeoutMs, remainingWorkerTime - 10000); // 10s buffer

    try {
      // Record request attempt
      await rateLimiter.recordRequest(executionId, url);
      await monitor.recordAttempt(executionId, attempt, { url, attemptStartTime });
      
      const result = await executeRequestWithTimeout({
        executionId,
        url,
        headers: {
          ...headers,
          'X-Attempt-Number': attempt.toString(),
          'X-Effective-Timeout': effectiveTimeout.toString(),
          'X-Rate-Limit-Retry': consecutiveRateLimitErrors.toString(),
          'X-Advanced-Retry': 'true',
          'X-Circuit-State': circuitState.state
        },
        timeoutMs: effectiveTimeout
      });
      
      const attemptDuration = Date.now() - attemptStartTime;
      console.log(`[${executionId}] Enhanced attempt ${attempt} succeeded in ${attemptDuration}ms:`, {
        duration: attemptDuration,
        url: url,
        circuitStateAfter: 'SUCCESS_RECORDED',
        rateLimitCountersReset: true,
        performanceMetrics: {
          requestDuration: attemptDuration,
          totalExecutionTime: Date.now() - parseInt(headers['X-Request-Start-Time']),
          timeoutMargin: effectiveTimeout - attemptDuration
        }
      });
      
      // Reset failure counters on success
      consecutiveRateLimitErrors = 0;
      await circuitBreaker.recordSuccess();
      await monitor.recordAttempt(executionId, attempt, { url, attemptStartTime, duration: attemptDuration, success: true });
      
      return result;
      
    } catch (error) {
      const attemptDuration = Date.now() - attemptStartTime;
      lastError = error;
      
      const errorType = classifyError(error);
      const isRateLimitError = errorType === 'RATE_LIMITED';
      if (isRateLimitError) {
        consecutiveRateLimitErrors++;
      }
      
      // Record failure in circuit breaker and monitoring
      await circuitBreaker.recordFailure(error);
      await monitor.recordAttempt(executionId, attempt, { 
        url, 
        attemptStartTime, 
        duration: attemptDuration, 
        success: false, 
        error: error.message,
        errorType 
      });
      
      console.warn(`[${executionId}] Enhanced attempt ${attempt} failed after ${attemptDuration}ms:`, {
        error: error.message,
        errorType,
        isRateLimitError,
        consecutiveRateLimitErrors,
        circuitState: circuitState.state,
        circuitFailureCount: circuitState.failureCount,
        rateLimitHeaders: error.headers ? {
          retryAfter: error.retryAfter,
          rateLimitRemaining: error.rateLimitRemaining,
          rateLimitLimit: error.rateLimitLimit,
          rateLimitType: error.rateLimitType
        } : null,
        performanceMetrics: {
          attemptDuration,
          effectiveTimeout,
          timeoutUtilization: (attemptDuration / effectiveTimeout * 100).toFixed(2) + '%'
        },
        nextActions: {
          willRetry: attempt < maxAttempts && !isNonRetryableError(error),
          backoffCalculation: 'adaptive_with_jitter'
        }
      });
      
      // Don't retry on certain error types
      if (isNonRetryableError(error) || attempt === maxAttempts) {
        throw error;
      }
      
      // Calculate advanced backoff delay with adaptive strategies
      let backoffDelay = await calculateAdvancedBackoffDelay({
        attempt,
        initialBackoffMs,
        maxBackoffMs,
        jitterPercentage,
        isRateLimitError,
        consecutiveRateLimitErrors,
        rateLimitBackoffMultiplier,
        error,
        rateLimiter,
        circuitState,
        executionId
      });
      
      console.log(`[${executionId}] Enhanced adaptive backoff calculated:`, {
        backoffDelay: `${backoffDelay}ms`,
        consecutiveRateLimitErrors,
        circuitState: circuitState.state,
        errorType,
        adaptiveFactors: {
          baseExponentialBackoff: true,
          rateLimitMultiplier: isRateLimitError,
          circuitBreakerAdjustment: circuitState.state !== 'CLOSED',
          retryAfterRespected: error.retryAfterMs > 0,
          jitterApplied: true
        },
        nextAttemptETA: new Date(Date.now() + backoffDelay).toISOString()
      });
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
  
  throw lastError;
}

/**
 * Calculate advanced backoff delay with adaptive strategies and circuit breaker awareness
 */
async function calculateAdvancedBackoffDelay({
  attempt,
  initialBackoffMs,
  maxBackoffMs,
  jitterPercentage,
  isRateLimitError,
  consecutiveRateLimitErrors,
  rateLimitBackoffMultiplier,
  error,
  rateLimiter,
  circuitState,
  executionId
}) {
  // Extract retry-after header if available
  let retryAfter = 0;
  if (error.headers && error.headers['retry-after']) {
    retryAfter = parseInt(error.headers['retry-after']) * 1000;
  }
  
  // Get enhanced adaptive backoff recommendations from rate limiter
  const adaptiveRecommendation = await rateLimiter.getBackoffRecommendation(executionId, isRateLimitError, {
    consecutiveErrors: consecutiveRateLimitErrors,
    errorType: error.rateLimitType,
    circuitState: circuitState.state
  });
  
  // Base exponential backoff with enhanced adaptive adjustments
  let baseDelay = Math.min(
    initialBackoffMs * Math.pow(2, attempt - 1),
    maxBackoffMs
  );
  
  // Enhanced rate limiting multiplier with different strategies per error type
  if (isRateLimitError && consecutiveRateLimitErrors > 1) {
    const errorTypeMultiplier = getErrorTypeMultiplier(error.rateLimitType);
    baseDelay *= Math.pow(rateLimitBackoffMultiplier * errorTypeMultiplier, Math.min(consecutiveRateLimitErrors - 1, 5));
  }
  
  // Apply circuit breaker state adjustments with more nuanced timing
  if (circuitState.state === 'HALF_OPEN') {
    // Be more conservative in half-open state
    baseDelay *= 2.0; // Increased from 1.5
  } else if (circuitState.failureCount > 0) {
    // Gradual backoff based on failure count
    baseDelay *= (1 + circuitState.failureCount * 0.2);
  }
  
  // Use adaptive recommendation with priority based on confidence
  if (adaptiveRecommendation && adaptiveRecommendation.recommendedDelayMs > 0) {
    if (adaptiveRecommendation.confidence > 0.7) {
      baseDelay = adaptiveRecommendation.recommendedDelayMs;
    } else {
      baseDelay = Math.max(baseDelay, adaptiveRecommendation.recommendedDelayMs);
    }
  }
  
  // Enhanced retry-after handling with error-specific parsing
  let retryAfterDelay = 0;
  if (error.retryAfterMs && error.retryAfterMs > 0) {
    retryAfterDelay = error.retryAfterMs;
  } else if (error.retryAfterSeconds && error.retryAfterSeconds > 0) {
    retryAfterDelay = error.retryAfterSeconds * 1000;
  }
  
  // Use retry-after with safety margin for different rate limit types
  if (retryAfterDelay > 0) {
    const safetyMarginMs = getSafetyMarginForRateLimitType(error.rateLimitType);
    baseDelay = Math.max(baseDelay, retryAfterDelay + safetyMarginMs);
  }
  
  // Enhanced jitter with adaptive sizing based on error patterns
  const adaptiveJitterMultiplier = getAdaptiveJitterMultiplier(isRateLimitError, consecutiveRateLimitErrors, error.rateLimitType);
  const effectiveJitter = jitterPercentage * adaptiveJitterMultiplier;
  const jitter = baseDelay * (effectiveJitter / 100) * (Math.random() - 0.5) * 2;
  const finalDelay = Math.max(1000, baseDelay + jitter); // Minimum 1s (increased from 500ms)
  
  return Math.min(finalDelay, maxBackoffMs);
}

/**
 * Get error type specific multiplier for backoff calculation
 */
function getErrorTypeMultiplier(rateLimitType) {
  switch (rateLimitType) {
    case 'cloudflare': return 1.5; // Cloudflare is strict
    case 'vercel': return 1.3; // Vercel has reasonable limits
    case 'aws_api_gateway': return 2.0; // AWS can be very strict
    default: return 1.2; // Conservative default
  }
}

/**
 * Get safety margin for different rate limit types
 */
function getSafetyMarginForRateLimitType(rateLimitType) {
  switch (rateLimitType) {
    case 'cloudflare': return 5000; // 5 second margin
    case 'vercel': return 2000; // 2 second margin
    case 'aws_api_gateway': return 10000; // 10 second margin
    default: return 3000; // 3 second default margin
  }
}

/**
 * Calculate adaptive jitter multiplier based on error patterns
 */
function getAdaptiveJitterMultiplier(isRateLimitError, consecutiveErrors, rateLimitType) {
  let multiplier = 1.0;
  
  if (isRateLimitError) {
    multiplier *= 1.8; // Increase jitter for rate limit errors
    
    // Increase jitter with consecutive errors
    multiplier *= (1 + consecutiveErrors * 0.3);
    
    // Adjust based on rate limit type
    switch (rateLimitType) {
      case 'cloudflare':
      case 'aws_api_gateway':
        multiplier *= 1.4; // More jitter for strict systems
        break;
      case 'vercel':
        multiplier *= 1.2; // Moderate jitter
        break;
    }
  }
  
  return Math.min(multiplier, 3.0); // Cap at 3x jitter
}

/**
 * Execute a single request with timeout protection
 */
async function executeRequestWithTimeout({ executionId, url, headers, timeoutMs }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException(`Request timeout after ${timeoutMs}ms`, 'TimeoutError'));
  }, timeoutMs);
  
  try {
    console.log(`[${executionId}] Making request with ${timeoutMs}ms timeout`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
    
    console.log(`[${executionId}] Received response: ${response.status} ${response.statusText}`);
    console.log(`[${executionId}] Response headers:`, Object.fromEntries(response.headers.entries()));
    
    // Handle different response types with enhanced error details
    if (response.status === 404) {
      throw new Error(`Endpoint not found (404) - URL: ${url} - The endpoint may not be deployed or accessible`);
    }
    
    if (response.status === 401) {
      const responseText = await response.text();
      console.error(`[${executionId}] Authentication failed (401):`, responseText);
      throw new Error(`Authentication failed (401) - The CRON_SECRET may not match or headers are incorrect`);
    }
    
    if (response.status === 524) {
      const timeElapsed = Date.now() - parseInt(headers['X-Request-Start-Time']);
      throw new Error(`Vercel endpoint timeout (524) after ${timeElapsed}ms - AI processing may be taking longer than expected`);
    }
    
    if (response.status === 503) {
      throw new Error('Vercel endpoint unavailable (503)');
    }
    
    if (response.status === 429) {
      // Enhanced 429 error with comprehensive rate limit header parsing
      const retryAfter = response.headers.get('retry-after');
      const rateLimitReset = response.headers.get('x-ratelimit-reset');
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      const rateLimitLimit = response.headers.get('x-ratelimit-limit');
      const cloudflareRayId = response.headers.get('cf-ray');
      const retryAfterMs = response.headers.get('retry-after-ms');
      
      // Parse retry-after (can be seconds or HTTP date)
      let retryAfterSeconds = 0;
      if (retryAfter) {
        if (/^\d+$/.test(retryAfter)) {
          retryAfterSeconds = parseInt(retryAfter);
        } else {
          // HTTP date format
          const retryDate = new Date(retryAfter);
          retryAfterSeconds = Math.max(0, (retryDate.getTime() - Date.now()) / 1000);
        }
      }
      
      const error = new Error('Rate limited (429)');
      error.headers = Object.fromEntries(response.headers.entries());
      error.retryAfter = retryAfter;
      error.retryAfterSeconds = retryAfterSeconds;
      error.retryAfterMs = retryAfterMs ? parseInt(retryAfterMs) : retryAfterSeconds * 1000;
      error.rateLimitReset = rateLimitReset;
      error.rateLimitRemaining = rateLimitRemaining;
      error.rateLimitLimit = rateLimitLimit;
      error.cloudflareRayId = cloudflareRayId;
      error.rateLimitType = detectRateLimitType(response.headers);
      
      console.warn(`[${executionId}] Enhanced rate limit details:`, {
        retryAfter,
        retryAfterSeconds,
        retryAfterMs: error.retryAfterMs,
        rateLimitReset, 
        rateLimitRemaining,
        rateLimitLimit,
        rateLimitType: error.rateLimitType,
        cloudflareRayId,
        allHeaders: Object.fromEntries(response.headers.entries())
      });
      
      throw error;
    }
    
    const responseText = await response.text();
    console.log(`[${executionId}] Response status: ${response.status}`);
    console.log(`[${executionId}] Response body preview: ${responseText.substring(0, 500)}...`);
    
    if (!response.ok) {
      console.error(`[${executionId}] Request failed:`, {
        status: response.status,
        statusText: response.statusText,
        url: url,
        responsePreview: responseText.substring(0, 500)
      });
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${responseText.substring(0, 500)}`);
    }
    
    // Try to parse as JSON, fallback to text
    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
    
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Detect the type of rate limiting from response headers
 */
function detectRateLimitType(headers) {
  const headersObj = Object.fromEntries(headers.entries());
  
  // Cloudflare rate limiting
  if (headersObj['cf-ray']) {
    return 'cloudflare';
  }
  
  // Vercel rate limiting
  if (headersObj['x-vercel-id'] || headersObj['server']?.includes('Vercel')) {
    return 'vercel';
  }
  
  // Generic rate limiting
  if (headersObj['x-ratelimit-limit']) {
    return 'standard';
  }
  
  // API Gateway or custom
  if (headersObj['x-amzn-requestid']) {
    return 'aws_api_gateway';
  }
  
  return 'unknown';
}

/**
 * Classify error types for better handling
 */
function classifyError(error) {
  const message = error.message.toLowerCase();
  
  if (message.includes('404') || message.includes('not found')) {
    return 'ENDPOINT_NOT_FOUND';
  }
  if (message.includes('401') || message.includes('unauthorized') || message.includes('authentication')) {
    return 'AUTHENTICATION_ERROR';
  }
  if (message.includes('timeout') || message.includes('524')) {
    return message.includes('524') ? 'VERCEL_TIMEOUT_524' : 'TIMEOUT';
  }
  if (message.includes('503') || message.includes('unavailable')) {
    return 'SERVICE_UNAVAILABLE';
  }
  if (message.includes('429') || message.includes('rate limit')) {
    return 'RATE_LIMITED';
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'NETWORK_ERROR';
  }
  
  return 'UNKNOWN_ERROR';
}

/**
 * Determine if an error should not be retried
 */
function isNonRetryableError(error) {
  const errorType = classifyError(error);
  
  // Don't retry authentication errors or client errors
  return [
    'AUTHENTICATION_ERROR'
  ].includes(errorType);
}

/**
 * Advanced Rate Limiter using Cloudflare KV storage for persistent tracking
 * Features: Request tracking, adaptive backoff, burst protection, circuit breaker integration
 */
class AdvancedRateLimiter {
  constructor(rateLimitKV, circuitBreakerKV, metricsKV) {
    this.rateLimitKV = rateLimitKV;
    this.circuitBreakerKV = circuitBreakerKV;
    this.metricsKV = metricsKV;
    this.memoryCache = new Map(); // Fallback for KV failures
    this.lastCleanup = 0;
  }

  /**
   * Check if request is allowed based on enhanced rate limiting rules with global tracking
   */
  async checkRateLimit(executionId, options = {}) {
    const {
      windowMs = 60000,        // 1 minute window
      maxRequests = 30,        // Conservative limit (reduced)
      burstLimit = 5,          // Burst protection (reduced)
      globalLimit = 1800,      // Global subrequest limit per minute
      burstWindowMs = 10000,   // 10-second burst window
      keyPrefix = 'rate_limit'
    } = options;

    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const burstWindowStart = Math.floor(now / burstWindowMs) * burstWindowMs;
    
    const localKey = `${keyPrefix}:local:${windowStart}`;
    const globalKey = `${keyPrefix}:global:${windowStart}`;
    const burstKey = `${keyPrefix}:burst:${burstWindowStart}`;

    try {
      // Check KV storage first
      if (this.rateLimitKV) {
        return await this.checkRateLimitKV({
          localKey, 
          globalKey, 
          burstKey, 
          maxRequests, 
          burstLimit, 
          globalLimit,
          windowMs, 
          burstWindowMs,
          now
        });
      } else {
        // Fallback to memory cache
        return this.checkRateLimitMemory({
          localKey, 
          globalKey, 
          burstKey, 
          maxRequests, 
          burstLimit, 
          globalLimit,
          windowMs, 
          burstWindowMs,
          now
        });
      }
    } catch (error) {
      console.error('Rate limit check failed, allowing request (fail-open)', error);
      // Fail-open for availability - allow request but log the failure
      return {
        allowed: true,
        reason: 'rate_limiter_failed',
        resetTimeMs: windowMs,
        remaining: maxRequests - 1,
        errorOccurred: true
      };
    }
  }

  /**
   * Enhanced KV-based rate limiting with global subrequest tracking
   */
  async checkRateLimitKV({ localKey, globalKey, burstKey, maxRequests, burstLimit, globalLimit, windowMs, burstWindowMs, now }) {
    // Get current counts for local, global, and burst tracking
    const [localCount, globalCount, burstCount] = await Promise.all([
      this.rateLimitKV.get(localKey, { type: 'json' }),
      this.rateLimitKV.get(globalKey, { type: 'json' }),
      this.rateLimitKV.get(burstKey, { type: 'json' })
    ]);

    const localRequestCount = localCount?.count || 0;
    const globalRequestCount = globalCount?.count || 0;
    const burstRequestCount = burstCount?.count || 0;
    
    const currentBurstWindow = Math.floor(now / burstWindowMs) * burstWindowMs;
    const burstWindowStart = burstCount?.windowStart || currentBurstWindow;

    // Check burst protection first (highest priority)
    if (burstWindowStart === currentBurstWindow && burstRequestCount >= burstLimit) {
      return {
        allowed: false,
        reason: 'burst_limit_exceeded',
        resetTimeMs: burstWindowMs - (now % burstWindowMs),
        remaining: 0,
        burstUsage: burstRequestCount,
        burstProtection: true
      };
    }

    // Check global subrequest limit (Cloudflare limit protection)
    if (globalRequestCount >= globalLimit) {
      return {
        allowed: false,
        reason: 'global_subrequest_limit_exceeded',
        resetTimeMs: windowMs - (now % windowMs),
        remaining: 0,
        globalUsage: globalRequestCount,
        globalLimit: globalLimit
      };
    }

    // Check local rate limit
    if (localRequestCount >= maxRequests) {
      return {
        allowed: false,
        reason: 'local_rate_limit_exceeded', 
        resetTimeMs: windowMs - (now % windowMs),
        remaining: 0,
        localUsage: localRequestCount
      };
    }

    // All checks passed - increment all counters atomically
    const ttlSeconds = Math.ceil(windowMs / 1000);
    const burstTtlSeconds = Math.ceil(burstWindowMs / 1000);
    const windowStart = Math.floor(now / windowMs) * windowMs;

    await Promise.all([
      // Increment local counter
      this.rateLimitKV.put(localKey, JSON.stringify({ 
        count: localRequestCount + 1, 
        windowStart: windowStart,
        lastUpdate: now
      }), { expirationTtl: ttlSeconds }),
      
      // Increment global counter (shared across all worker instances)
      this.rateLimitKV.put(globalKey, JSON.stringify({ 
        count: globalRequestCount + 1, 
        windowStart: windowStart,
        lastUpdate: now,
        instances: (globalCount?.instances || new Set()).add(crypto.randomUUID().substring(0, 8))
      }), { expirationTtl: ttlSeconds }),
      
      // Increment burst counter
      this.rateLimitKV.put(burstKey, JSON.stringify({ 
        count: burstWindowStart === currentBurstWindow ? burstRequestCount + 1 : 1,
        windowStart: currentBurstWindow,
        lastUpdate: now
      }), { expirationTtl: burstTtlSeconds })
    ]);

    return {
      allowed: true,
      remaining: maxRequests - (localRequestCount + 1),
      globalRemaining: globalLimit - (globalRequestCount + 1),
      burstRemaining: burstLimit - (burstRequestCount + 1),
      resetTimeMs: windowMs - (now % windowMs),
      localUsage: localRequestCount + 1,
      globalUsage: globalRequestCount + 1,
      burstUsage: burstRequestCount + 1
    };
  }

  /**
   * Enhanced memory-based rate limiting fallback with global tracking simulation
   */
  checkRateLimitMemory({ localKey, globalKey, burstKey, maxRequests, burstLimit, globalLimit, windowMs, burstWindowMs, now }) {
    this.cleanupExpiredEntries(now);

    const localEntry = this.memoryCache.get(localKey) || { count: 0, resetTime: now + windowMs };
    const globalEntry = this.memoryCache.get(globalKey) || { count: 0, resetTime: now + windowMs };
    const burstEntry = this.memoryCache.get(burstKey) || { count: 0, resetTime: now + burstWindowMs };

    // Check burst limit
    if (burstEntry.resetTime > now && burstEntry.count >= burstLimit) {
      return {
        allowed: false,
        reason: 'burst_limit_exceeded_memory',
        resetTimeMs: burstEntry.resetTime - now,
        remaining: 0,
        burstUsage: burstEntry.count,
        burstProtection: true,
        usingMemoryFallback: true
      };
    }

    // Check global limit (simulated in memory)
    if (globalEntry.resetTime > now && globalEntry.count >= globalLimit) {
      return {
        allowed: false,
        reason: 'global_subrequest_limit_exceeded_memory',
        resetTimeMs: globalEntry.resetTime - now,
        remaining: 0,
        globalUsage: globalEntry.count,
        globalLimit: globalLimit,
        usingMemoryFallback: true
      };
    }

    // Check local rate limit
    if (localEntry.resetTime > now && localEntry.count >= maxRequests) {
      return {
        allowed: false,
        reason: 'local_rate_limit_exceeded_memory',
        resetTimeMs: localEntry.resetTime - now,
        remaining: 0,
        localUsage: localEntry.count,
        usingMemoryFallback: true
      };
    }

    // Update all counters
    if (localEntry.resetTime <= now) {
      localEntry.count = 1;
      localEntry.resetTime = now + windowMs;
    } else {
      localEntry.count++;
    }

    if (globalEntry.resetTime <= now) {
      globalEntry.count = 1;
      globalEntry.resetTime = now + windowMs;
    } else {
      globalEntry.count++;
    }

    if (burstEntry.resetTime <= now) {
      burstEntry.count = 1;
      burstEntry.resetTime = now + burstWindowMs;
    } else {
      burstEntry.count++;
    }

    this.memoryCache.set(localKey, localEntry);
    this.memoryCache.set(globalKey, globalEntry);
    this.memoryCache.set(burstKey, burstEntry);

    return {
      allowed: true,
      remaining: maxRequests - localEntry.count,
      globalRemaining: globalLimit - globalEntry.count,
      burstRemaining: burstLimit - burstEntry.count,
      resetTimeMs: localEntry.resetTime - now,
      localUsage: localEntry.count,
      globalUsage: globalEntry.count,
      burstUsage: burstEntry.count,
      usingMemoryFallback: true
    };
  }

  /**
   * Record successful request for adaptive algorithms
   */
  async recordRequest(executionId, url) {
    try {
      if (this.metricsKV) {
        const requestData = {
          executionId,
          url,
          timestamp: Date.now(),
          success: null // Will be updated later
        };
        await this.metricsKV.put(`request:${executionId}`, JSON.stringify(requestData), { expirationTtl: 3600 });
      }
    } catch (error) {
      console.warn('Failed to record request metrics:', error);
    }
  }

  /**
   * Record successful completion
   */
  async recordSuccess(executionId) {
    try {
      if (this.metricsKV) {
        const key = `request:${executionId}`;
        const existing = await this.metricsKV.get(key, { type: 'json' });
        if (existing) {
          existing.success = true;
          existing.completedAt = Date.now();
          await this.metricsKV.put(key, JSON.stringify(existing), { expirationTtl: 3600 });
        }
      }
    } catch (error) {
      console.warn('Failed to record success metrics:', error);
    }
  }

  /**
   * Record failure with error type
   */
  async recordFailure(executionId, errorType) {
    try {
      if (this.metricsKV) {
        const key = `request:${executionId}`;
        const existing = await this.metricsKV.get(key, { type: 'json' });
        if (existing) {
          existing.success = false;
          existing.errorType = errorType;
          existing.failedAt = Date.now();
          await this.metricsKV.put(key, JSON.stringify(existing), { expirationTtl: 3600 });
        }
      }
    } catch (error) {
      console.warn('Failed to record failure metrics:', error);
    }
  }

  /**
   * Get enhanced adaptive backoff recommendation based on recent patterns and error analysis
   */
  async getBackoffRecommendation(executionId, isRateLimitError, options = {}) {
    try {
      const { consecutiveErrors = 0, errorType = 'unknown', circuitState = 'CLOSED' } = options;
      
      if (!this.metricsKV) {
        return this.getBasicBackoffRecommendation(isRateLimitError, consecutiveErrors, errorType);
      }

      // Get recent error patterns from KV storage
      const recentErrorsKey = 'recent_errors';
      const recentErrors = await this.metricsKV.get(recentErrorsKey, { type: 'json' }) || [];
      
      // Analyze error patterns
      const errorAnalysis = this.analyzeErrorPatterns(recentErrors, errorType);
      
      // Calculate recommendation based on multiple factors
      let recommendedDelayMs = 0;
      let confidence = 0.5; // Default confidence
      
      if (isRateLimitError) {
        // Base delay for rate limit errors
        recommendedDelayMs = 15000; // 15 seconds base
        
        // Adjust based on error type
        switch (errorType) {
          case 'cloudflare':
            recommendedDelayMs = 45000; // 45 seconds for Cloudflare
            confidence = 0.9;
            break;
          case 'vercel':
            recommendedDelayMs = 30000; // 30 seconds for Vercel
            confidence = 0.8;
            break;
          case 'aws_api_gateway':
            recommendedDelayMs = 60000; // 60 seconds for AWS
            confidence = 0.9;
            break;
          default:
            recommendedDelayMs = 25000; // 25 seconds default
            confidence = 0.6;
        }
        
        // Increase delay based on consecutive errors
        if (consecutiveErrors > 1) {
          recommendedDelayMs *= Math.pow(1.5, Math.min(consecutiveErrors - 1, 4));
          confidence = Math.min(confidence + 0.1, 0.95);
        }
        
        // Adjust based on recent error patterns
        if (errorAnalysis.frequency > 0.3) { // High error frequency
          recommendedDelayMs *= 2.0;
          confidence = Math.min(confidence + 0.2, 0.95);
        }
        
        // Circuit breaker state adjustment
        if (circuitState === 'HALF_OPEN') {
          recommendedDelayMs *= 1.5;
          confidence = Math.min(confidence + 0.1, 0.95);
        }
      }
      
      // Store current error for pattern analysis
      if (isRateLimitError) {
        await this.recordErrorPattern(executionId, errorType, consecutiveErrors);
      }

      return { 
        recommendedDelayMs: Math.min(recommendedDelayMs, 180000), // Cap at 3 minutes
        confidence,
        errorAnalysis,
        reasoning: `${errorType} rate limit with ${consecutiveErrors} consecutive errors`
      };
    } catch (error) {
      console.warn('Failed to get adaptive backoff recommendation:', error);
      return this.getBasicBackoffRecommendation(isRateLimitError, consecutiveErrors || 0, errorType || 'unknown');
    }
  }
  
  /**
   * Basic backoff recommendation when KV storage is unavailable
   */
  getBasicBackoffRecommendation(isRateLimitError, consecutiveErrors, errorType) {
    if (!isRateLimitError) {
      return { recommendedDelayMs: 0, confidence: 0.5 };
    }
    
    let baseDelay = 20000; // 20 seconds base
    
    // Adjust based on error type
    switch (errorType) {
      case 'cloudflare':
        baseDelay = 40000;
        break;
      case 'aws_api_gateway':
        baseDelay = 50000;
        break;
      case 'vercel':
        baseDelay = 25000;
        break;
    }
    
    // Apply consecutive error multiplier
    const delayMs = baseDelay * Math.pow(1.4, Math.min(consecutiveErrors, 4));
    
    return { 
      recommendedDelayMs: Math.min(delayMs, 120000), // Cap at 2 minutes
      confidence: 0.6,
      fallbackMode: true
    };
  }
  
  /**
   * Analyze recent error patterns for adaptive recommendations
   */
  analyzeErrorPatterns(recentErrors, currentErrorType) {
    const now = Date.now();
    const oneHourAgo = now - 3600000; // 1 hour
    
    // Filter recent errors within the last hour
    const recentRelevantErrors = recentErrors.filter(error => 
      error.timestamp > oneHourAgo && error.errorType === currentErrorType
    );
    
    const totalRecentRequests = recentErrors.filter(error => error.timestamp > oneHourAgo).length;
    
    return {
      frequency: totalRecentRequests > 0 ? recentRelevantErrors.length / totalRecentRequests : 0,
      count: recentRelevantErrors.length,
      avgInterval: this.calculateAverageInterval(recentRelevantErrors),
      trend: this.calculateErrorTrend(recentRelevantErrors)
    };
  }
  
  /**
   * Calculate average interval between errors
   */
  calculateAverageInterval(errors) {
    if (errors.length < 2) return 0;
    
    const intervals = [];
    for (let i = 1; i < errors.length; i++) {
      intervals.push(errors[i].timestamp - errors[i-1].timestamp);
    }
    
    return intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  }
  
  /**
   * Calculate error trend (increasing, decreasing, stable)
   */
  calculateErrorTrend(errors) {
    if (errors.length < 3) return 'insufficient_data';
    
    const now = Date.now();
    const thirtyMinutesAgo = now - 1800000;
    const sixtyMinutesAgo = now - 3600000;
    
    const recentErrors = errors.filter(e => e.timestamp > thirtyMinutesAgo).length;
    const olderErrors = errors.filter(e => e.timestamp > sixtyMinutesAgo && e.timestamp <= thirtyMinutesAgo).length;
    
    if (recentErrors > olderErrors * 1.5) return 'increasing';
    if (recentErrors < olderErrors * 0.5) return 'decreasing';
    return 'stable';
  }
  
  /**
   * Record error pattern for future analysis
   */
  async recordErrorPattern(executionId, errorType, consecutiveErrors) {
    try {
      if (!this.metricsKV) return;
      
      const recentErrorsKey = 'recent_errors';
      const existing = await this.metricsKV.get(recentErrorsKey, { type: 'json' }) || [];
      
      // Add new error
      existing.push({
        executionId,
        errorType,
        consecutiveErrors,
        timestamp: Date.now()
      });
      
      // Keep only last 100 errors
      const trimmed = existing.slice(-100);
      
      // Store with 24 hour TTL
      await this.metricsKV.put(recentErrorsKey, JSON.stringify(trimmed), { expirationTtl: 86400 });
    } catch (error) {
      console.warn('Failed to record error pattern:', error);
    }
  }

  /**
   * Cleanup expired memory cache entries
   */
  cleanupExpiredEntries(now) {
    if (now - this.lastCleanup > 60000) { // Cleanup every minute
      for (const [key, entry] of this.memoryCache.entries()) {
        if (entry.resetTime <= now) {
          this.memoryCache.delete(key);
        }
      }
      this.lastCleanup = now;
    }
  }
}

/**
 * Circuit Breaker with KV state persistence for Cloudflare Workers
 * Features: State persistence, failure tracking, automatic recovery
 */
class CircuitBreaker {
  constructor(kvStorage, rateLimiter) {
    this.kvStorage = kvStorage;
    this.rateLimiter = rateLimiter;
    this.memoryState = {
      state: 'CLOSED',
      failureCount: 0,
      lastFailureTime: null,
      nextRetryTime: null
    };
    this.stateLoaded = false;
  }

  /**
   * Get current circuit breaker state (load from KV if needed)
   */
  async getState() {
    if (!this.stateLoaded) {
      await this.loadStateFromKV();
    }
    return { ...this.memoryState };
  }

  /**
   * Load state from KV storage
   */
  async loadStateFromKV() {
    try {
      if (this.kvStorage) {
        const stored = await this.kvStorage.get('circuit_breaker_state', { type: 'json' });
        if (stored) {
          this.memoryState = { ...stored };
        }
      }
    } catch (error) {
      console.warn('Failed to load circuit breaker state from KV:', error);
    }
    this.stateLoaded = true;
  }

  /**
   * Save state to KV storage
   */
  async saveStateToKV() {
    try {
      if (this.kvStorage) {
        await this.kvStorage.put('circuit_breaker_state', JSON.stringify(this.memoryState), {
          expirationTtl: 3600 // 1 hour TTL
        });
      }
    } catch (error) {
      console.warn('Failed to save circuit breaker state to KV:', error);
    }
  }

  /**
   * Record successful operation
   */
  async recordSuccess() {
    const state = await this.getState();
    
    if (state.state === 'HALF_OPEN' || state.failureCount > 0) {
      this.memoryState.state = 'CLOSED';
      this.memoryState.failureCount = 0;
      this.memoryState.lastFailureTime = null;
      this.memoryState.nextRetryTime = null;
      await this.saveStateToKV();
      
      console.log('Circuit breaker: Success recorded, state reset to CLOSED');
    }
  }

  /**
   * Record failed operation
   */
  async recordFailure(error) {
    await this.getState(); // Ensure state is loaded
    
    this.memoryState.failureCount++;
    this.memoryState.lastFailureTime = Date.now();
    
    const threshold = 3; // Open circuit after 3 failures (reduced for faster protection)
    const recoveryTimeMs = 180000; // 3 minutes recovery time (reduced from 5 minutes)
    
    if (this.memoryState.failureCount >= threshold) {
      this.memoryState.state = 'OPEN';
      this.memoryState.nextRetryTime = Date.now() + recoveryTimeMs;
      
      console.log(`[CIRCUIT_BREAKER] State changed to OPEN:`, {
        triggerFailureCount: this.memoryState.failureCount,
        threshold,
        nextRetryTime: new Date(this.memoryState.nextRetryTime).toISOString(),
        lastFailureTime: new Date(this.memoryState.lastFailureTime).toISOString(),
        recoveryTimeMs,
        errorType: error?.message?.includes('429') ? 'rate_limit' : 'other'
      });
    }
    
    await this.saveStateToKV();
  }

  /**
   * Attempt to move to half-open state
   */
  async halfOpen() {
    this.memoryState.state = 'HALF_OPEN';
    await this.saveStateToKV();
    console.log('Circuit breaker: Moved to HALF_OPEN state for testing');
  }

  /**
   * Reset circuit breaker to closed state
   */
  async reset() {
    this.memoryState.state = 'CLOSED';
    this.memoryState.failureCount = 0;
    this.memoryState.lastFailureTime = null;
    this.memoryState.nextRetryTime = null;
    await this.saveStateToKV();
    console.log('Circuit breaker: Manually reset to CLOSED state');
  }
}

/**
 * Worker Monitor for metrics collection and performance tracking
 * Features: Execution tracking, performance metrics, error analysis
 */
class WorkerMonitor {
  constructor(metricsKV) {
    this.metricsKV = metricsKV;
    this.memoryMetrics = {
      executions: [],
      attempts: [],
      performanceData: []
    };
  }

  /**
   * Record execution start/completion/failure with enhanced debugging information
   */
  async recordExecution(executionId, status, metadata = {}) {
    const record = {
      executionId,
      status, // 'started', 'completed', 'failed', 'circuit_breaker_blocked', 'rate_limited'
      timestamp: Date.now(),
      debugInfo: {
        workerVersion: '2.3.0-enhanced',
        kvStorageAvailable: !!this.metricsKV,
        rateLimitingStrategy: 'adaptive-global-aware',
        circuitBreakerEnabled: true
      },
      ...metadata
    };

    try {
      if (this.metricsKV) {
        await this.metricsKV.put(`execution:${executionId}:${status}`, JSON.stringify(record), {
          expirationTtl: 86400 // 24 hours
        });
        
        // Also maintain aggregated statistics
        await this.updateAggregatedStats(status, metadata);
      }
      
      // Also store in memory for immediate access
      this.memoryMetrics.executions.push(record);
      this.trimMemoryMetrics();
      
      // Enhanced logging for debugging
      if (status === 'failed' || status === 'rate_limited' || status === 'circuit_breaker_blocked') {
        console.warn(`[${executionId}] Execution recorded as ${status}:`, {
          timestamp: new Date(record.timestamp).toISOString(),
          metadata: metadata,
          debugInfo: record.debugInfo
        });
      } else {
        console.log(`[${executionId}] Execution recorded as ${status}`);
      }
    } catch (error) {
      console.warn(`[${executionId}] Failed to record execution metrics:`, {
        error: error.message,
        status,
        metadataKeys: Object.keys(metadata)
      });
    }
  }
  
  /**
   * Update aggregated statistics for monitoring dashboard
   */
  async updateAggregatedStats(status, metadata) {
    try {
      const statsKey = 'aggregated_stats';
      const existing = await this.metricsKV.get(statsKey, { type: 'json' }) || {
        totalExecutions: 0,
        successful: 0,
        failed: 0,
        rateLimited: 0,
        circuitBreakerBlocked: 0,
        lastUpdated: Date.now()
      };
      
      existing.totalExecutions++;
      
      switch (status) {
        case 'completed':
          existing.successful++;
          break;
        case 'failed':
          existing.failed++;
          break;
        case 'rate_limited':
          existing.rateLimited++;
          break;
        case 'circuit_breaker_blocked':
          existing.circuitBreakerBlocked++;
          break;
      }
      
      existing.lastUpdated = Date.now();
      existing.successRate = (existing.successful / existing.totalExecutions * 100).toFixed(2);
      
      await this.metricsKV.put(statsKey, JSON.stringify(existing), { expirationTtl: 86400 });
    } catch (error) {
      console.warn('Failed to update aggregated stats:', error);
    }
  }

  /**
   * Record individual attempt within an execution
   */
  async recordAttempt(executionId, attemptNumber, metadata = {}) {
    const record = {
      executionId,
      attemptNumber,
      timestamp: Date.now(),
      ...metadata
    };

    try {
      if (this.metricsKV) {
        await this.metricsKV.put(`attempt:${executionId}:${attemptNumber}`, JSON.stringify(record), {
          expirationTtl: 86400
        });
      }
      
      this.memoryMetrics.attempts.push(record);
      this.trimMemoryMetrics();
    } catch (error) {
      console.warn('Failed to record attempt metrics:', error);
    }
  }

  /**
   * Record performance data
   */
  async recordPerformance(executionId, performanceMetrics) {
    const record = {
      executionId,
      timestamp: Date.now(),
      ...performanceMetrics
    };

    try {
      if (this.metricsKV) {
        await this.metricsKV.put(`performance:${executionId}`, JSON.stringify(record), {
          expirationTtl: 86400
        });
      }
      
      this.memoryMetrics.performanceData.push(record);
      this.trimMemoryMetrics();
    } catch (error) {
      console.warn('Failed to record performance metrics:', error);
    }
  }

  /**
   * Get enhanced execution summary with debugging insights
   */
  getRecentExecutionSummary() {
    const recent = this.memoryMetrics.executions.slice(-50); // Last 50 executions (increased)
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    
    const recentHour = recent.filter(e => e.timestamp > oneHourAgo);
    
    const summary = {
      total: recent.length,
      totalLastHour: recentHour.length,
      completed: recent.filter(e => e.status === 'completed').length,
      failed: recent.filter(e => e.status === 'failed').length,
      rateLimited: recent.filter(e => e.status === 'rate_limited').length,
      circuitBreakerBlocked: recent.filter(e => e.status === 'circuit_breaker_blocked').length,
      debugInfo: {
        oldestExecution: recent.length > 0 ? new Date(recent[0].timestamp).toISOString() : null,
        newestExecution: recent.length > 0 ? new Date(recent[recent.length - 1].timestamp).toISOString() : null,
        memoryUtilization: {
          executions: this.memoryMetrics.executions.length,
          attempts: this.memoryMetrics.attempts.length,
          performanceData: this.memoryMetrics.performanceData.length
        }
      }
    };
    
    summary.successRate = summary.total > 0 ? (summary.completed / summary.total * 100).toFixed(2) : 0;
    summary.hourlySuccessRate = recentHour.length > 0 ? 
      (recentHour.filter(e => e.status === 'completed').length / recentHour.length * 100).toFixed(2) : 0;
    
    // Add trend analysis
    summary.trends = this.calculateExecutionTrends(recent);
    
    return summary;
  }
  
  /**
   * Calculate execution trends for monitoring
   */
  calculateExecutionTrends(executions) {
    if (executions.length < 10) {
      return { trend: 'insufficient_data', confidence: 'low' };
    }
    
    const midpoint = Math.floor(executions.length / 2);
    const firstHalf = executions.slice(0, midpoint);
    const secondHalf = executions.slice(midpoint);
    
    const firstHalfSuccess = firstHalf.filter(e => e.status === 'completed').length / firstHalf.length;
    const secondHalfSuccess = secondHalf.filter(e => e.status === 'completed').length / secondHalf.length;
    
    const difference = secondHalfSuccess - firstHalfSuccess;
    
    if (Math.abs(difference) < 0.1) {
      return { trend: 'stable', confidence: 'medium', successRateDelta: difference };
    } else if (difference > 0.1) {
      return { trend: 'improving', confidence: 'high', successRateDelta: difference };
    } else {
      return { trend: 'degrading', confidence: 'high', successRateDelta: difference };
    }
  }

  /**
   * Trim memory metrics to prevent unbounded growth
   */
  trimMemoryMetrics() {
    const maxEntries = 100;
    
    if (this.memoryMetrics.executions.length > maxEntries) {
      this.memoryMetrics.executions = this.memoryMetrics.executions.slice(-maxEntries);
    }
    
    if (this.memoryMetrics.attempts.length > maxEntries) {
      this.memoryMetrics.attempts = this.memoryMetrics.attempts.slice(-maxEntries);
    }
    
    if (this.memoryMetrics.performanceData.length > maxEntries) {
      this.memoryMetrics.performanceData = this.memoryMetrics.performanceData.slice(-maxEntries);
    }
  }
}
