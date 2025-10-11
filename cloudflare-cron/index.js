// index.js - Cloudflare Worker for Cron Trigger
// Enhanced with timeout handling, retry logic, and comprehensive error management

export default {
  // Handle HTTP requests (required by Cloudflare Workers)
  async fetch(request, env, ctx) {
    return new Response('TLDRSEC Cron Worker - This endpoint is for scheduled execution only', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  },

  // Handle scheduled cron events with timeout protection
  async scheduled(event, env, ctx) {
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
    
    console.log(`[${executionId}] Starting TLDRSEC scheduled cron job execution`);
    
    // Configuration - Extended for AI processing workloads
    const WORKER_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (maximum Cloudflare limit)
    const REQUEST_TIMEOUT_MS = 9 * 60 * 1000; // 9 minutes for individual request
    const MAX_ATTEMPTS = 3;
    const INITIAL_BACKOFF_MS = 2000; // 2 seconds
    
    try {
      // Environment validation
      const envValidation = validateEnvironment(env);
      if (!envValidation.isValid) {
        throw new Error(`Environment validation failed: ${envValidation.errors.join(', ')}`);
      }
      
      console.log(`[${executionId}] Environment validation passed`);
      
      // Build URL for Vercel endpoint
      const url = `${env.PUBLIC_URL}/api/cron/tier-aware`;
      console.log(`[${executionId}] Target endpoint: ${url}`);
      
      // Prepare headers with enhanced tracking and timeout coordination
      const headers = {
        'X-Cron-Auth': `Bearer ${env.CRON_SECRET}`,
        'Content-Type': 'application/json',
        'User-Agent': 'TLDRSEC-Cloudflare-Worker/2.1 wilfredchen1@gmail.com',
        'X-Cloudflare-Worker': 'tldrsec-cron',
        'X-Cron-Source': 'cloudflare-worker',
        'X-Execution-Id': executionId,
        'X-Worker-Timeout': WORKER_TIMEOUT_MS.toString(),
        'X-Effective-Timeout': REQUEST_TIMEOUT_MS.toString(),
        'X-Request-Start-Time': startTime.toString(),
        'X-Cron-Frequency': '10-minutes',
        'X-Processing-Mode': 'ai-enhanced'
      };
      
      // Add Vercel deployment protection bypass if configured
      if (env.VERCEL_AUTOMATION_BYPASS_SECRET) {
        headers['x-vercel-protection-bypass'] = env.VERCEL_AUTOMATION_BYPASS_SECRET;
        headers['x-vercel-set-bypass-cookie'] = 'true';
        console.log(`[${executionId}] Configured with deployment protection bypass`);
      }
      
      // Execute with timeout protection and retry logic
      const result = await executeWithTimeoutAndRetry({
        executionId,
        url,
        headers,
        workerTimeoutMs: WORKER_TIMEOUT_MS,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        maxAttempts: MAX_ATTEMPTS,
        initialBackoffMs: INITIAL_BACKOFF_MS
      });
      
      const duration = Date.now() - startTime;
      console.log(`[${executionId}] Cron job completed successfully in ${duration}ms`);
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorType = classifyError(error);
      
      // Safe error message for external logs (no sensitive details)
      const safeErrorMessage = (() => {
        switch (errorType) {
          case 'VERCEL_TIMEOUT_524': return 'AI processing timeout (524) - Extended processing time exceeded limits';
          case 'TIMEOUT': return 'Execution timeout';
          case 'SERVICE_UNAVAILABLE': return 'Target service unavailable';
          case 'RATE_LIMITED': return 'Rate limit exceeded';
          case 'AUTHENTICATION_ERROR': return 'Authentication failed';
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
 * Execute request with comprehensive timeout and retry logic
 */
async function executeWithTimeoutAndRetry({
  executionId,
  url,
  headers,
  workerTimeoutMs,
  requestTimeoutMs,
  maxAttempts,
  initialBackoffMs
}) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStartTime = Date.now();
    const remainingWorkerTime = workerTimeoutMs - (attemptStartTime - parseInt(headers['X-Request-Start-Time']));
    
    console.log(`[${executionId}] Attempt ${attempt}/${maxAttempts}, remaining worker time: ${remainingWorkerTime}ms`);
    
    // Check if we have enough time for this attempt
    if (remainingWorkerTime < 30000) { // Need at least 30 seconds
      throw new Error(`Insufficient time remaining: ${remainingWorkerTime}ms`);
    }
    
    try {
      // Use the smaller of request timeout or remaining worker time
      const effectiveTimeout = Math.min(requestTimeoutMs, remainingWorkerTime - 10000); // 10s buffer
      
      const result = await executeRequestWithTimeout({
        executionId,
        url,
        headers: {
          ...headers,
          'X-Attempt-Number': attempt.toString(),
          'X-Effective-Timeout': effectiveTimeout.toString()
        },
        timeoutMs: effectiveTimeout
      });
      
      const attemptDuration = Date.now() - attemptStartTime;
      console.log(`[${executionId}] Attempt ${attempt} succeeded in ${attemptDuration}ms`);
      
      return result;
      
    } catch (error) {
      const attemptDuration = Date.now() - attemptStartTime;
      lastError = error;
      
      console.warn(`[${executionId}] Attempt ${attempt} failed after ${attemptDuration}ms:`, error.message);
      
      // Don't retry on certain error types
      if (isNonRetryableError(error) || attempt === maxAttempts) {
        throw error;
      }
      
      // Calculate backoff delay
      const backoffDelay = Math.min(
        initialBackoffMs * Math.pow(2, attempt - 1), // Exponential backoff
        30000 // Max 30 seconds
      );
      
      console.log(`[${executionId}] Waiting ${backoffDelay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }
  
  throw lastError;
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
    
    // Handle different response types with enhanced 524 error details
    if (response.status === 524) {
      const timeElapsed = Date.now() - parseInt(headers['X-Request-Start-Time']);
      throw new Error(`Vercel endpoint timeout (524) after ${timeElapsed}ms - AI processing may be taking longer than expected`);
    }
    
    if (response.status === 503) {
      throw new Error('Vercel endpoint unavailable (503)');
    }
    
    if (response.status === 429) {
      throw new Error('Rate limited (429)');
    }
    
    const responseText = await response.text();
    console.log(`[${executionId}] Response body preview: ${responseText.substring(0, 200)}...`);
    
    if (!response.ok) {
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
 * Classify error types for better handling
 */
function classifyError(error) {
  const message = error.message.toLowerCase();
  
  if (message.includes('timeout') || message.includes('524')) {
    return message.includes('524') ? 'VERCEL_TIMEOUT_524' : 'TIMEOUT';
  }
  if (message.includes('503') || message.includes('unavailable')) {
    return 'SERVICE_UNAVAILABLE';
  }
  if (message.includes('429') || message.includes('rate limit')) {
    return 'RATE_LIMITED';
  }
  if (message.includes('401') || message.includes('unauthorized')) {
    return 'AUTHENTICATION_ERROR';
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
