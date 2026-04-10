// index.js - Cloudflare Worker for Cron Trigger
// Calls Vercel endpoints on a schedule to run the SEC filing pipeline.
// Stateless by design — all persistence lives in the Vercel app + Postgres.

import { renderStatusPage } from './status-page.js';

/**
 * Sanitizes CRON_SECRET by removing common contamination:
 * - Literal backslash-n sequences (\\n) from CLI escaping issues
 * - Actual newline characters (\n) from `vercel env pull`
 * - Leading/trailing whitespace from copy-paste errors
 */
function sanitizeCronSecret(secret) {
  if (!secret) return '';
  return secret.replace(/\\n/g, '').replace(/\n/g, '').trim();
}

/**
 * Generate HMAC-SHA256 signature for authenticating requests to Vercel.
 * Payload format: `${timestamp}:${method}:${pathname}`
 */
async function generateHmacSignature(secret, method, url) {
  const urlObj = new URL(url);
  const timestamp = Date.now();
  const payload = `${timestamp}:${method}:${urlObj.pathname}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return { signature: hex, timestamp };
}

/**
 * Make an authenticated GET request to a Vercel endpoint.
 */
async function authenticatedFetch(env, url, { method = 'GET', executionId, timeoutMs = 270000 } = {}) {
  const secret = sanitizeCronSecret(env.CRON_SECRET);
  const { signature, timestamp } = await generateHmacSignature(secret, method, url);

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'TLDRSEC-Cloudflare-Worker/3.0',
    'X-Cloudflare-Worker': 'tldrsec-cron',
    'X-Execution-Id': executionId,
    'x-hmac-signature': signature,
    'x-hmac-timestamp': timestamp.toString(),
  };

  if (env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers['x-vercel-protection-bypass'] = env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { method, headers, signal: controller.signal });
    const data = response.ok ? await response.json() : await response.text();
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        worker: 'healthy',
        version: '3.0.0',
        currentTime: new Date().toISOString(),
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/status') {
      try {
        let kvData = null;
        if (env.STATUS_KV) {
          kvData = await env.STATUS_KV.get('status', { type: 'json' });
        }
        const html = renderStatusPage(kvData, {});
        return new Response(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=60',
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
          },
        });
      } catch (e) {
        return new Response('tldrSEC Status: Unable to load.', { status: 500 });
      }
    }

    return new Response('TLDRSEC Cron Worker - scheduled execution only', { status: 200 });
  },

  async scheduled(event, env, ctx) {
    const cron = event.cron;
    console.log(`[scheduled] Cron triggered: ${cron}`);

    if (cron === '*/15 * * * *') {
      return await this.handleAutoRecovery(event, env, ctx);
    }
    if (cron === '0 0 * * *') {
      return await this.handleDailyTasks(event, env, ctx);
    }
    // Default: */5 * * * * — pipeline processing
    return await this.handlePipelineProcessing(event, env, ctx);
  },

  /**
   * Main pipeline: cleanup-locks → tier-aware → process discovery → fetch → summarize (loop)
   */
  async handlePipelineProcessing(event, env, ctx) {
    const executionId = `pipeline-${Date.now()}`;
    const startTime = Date.now();
    const base = env.PUBLIC_URL;

    console.log(`[${executionId}] Starting pipeline`);

    const step = async (name, url, opts = {}) => {
      try {
        const result = await authenticatedFetch(env, url, { executionId, ...opts });
        console.log(`[${executionId}] ${name}: ${result.ok ? 'OK' : 'FAILED'} (${result.status})`);
        return result;
      } catch (error) {
        console.error(`[${executionId}] ${name}: ${error.message}`);
        return { ok: false, error: error.message };
      }
    };

    // Step 0: Lock cleanup (non-blocking)
    await step('cleanup-locks', `${base}/api/cron?action=cleanup-locks`, { timeoutMs: 30000 });

    // Step 1a: Enqueue discovery job
    await step('tier-aware', `${base}/api/cron?action=tier-aware`, { timeoutMs: 15000 });

    // Step 1b: Process discovery jobs
    await step('process-discovery', `${base}/api/cron?action=process-queue&jobTypes=ASYNC_DISCOVER_FILINGS`, { timeoutMs: 55000 });

    // Step 2: Process fetch jobs
    await step('process-fetch', `${base}/api/cron?action=process-queue&jobTypes=ASYNC_FETCH_FILING`, { timeoutMs: 270000 });

    // Step 3: Process summarize jobs (loop until drained or time limit)
    const WORKER_TIMEOUT_MS = 10 * 60 * 1000;
    const TIME_BUFFER_MS = 60000;
    const MAX_ITERATIONS = 10;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const remaining = WORKER_TIMEOUT_MS - (Date.now() - startTime);
      if (remaining < TIME_BUFFER_MS) {
        console.log(`[${executionId}] Summarize loop: stopping, ${remaining}ms remaining`);
        break;
      }

      const result = await step(`summarize-${i + 1}`, `${base}/api/cron?action=process-queue&jobTypes=ASYNC_SUMMARIZE_CACHED`, { timeoutMs: 270000 });

      const jobsProcessed = result?.data?.jobsProcessed ?? 0;
      if (jobsProcessed === 0) {
        console.log(`[${executionId}] Summarize loop: queue drained after ${i + 1} iteration(s)`);
        break;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[${executionId}] Pipeline completed in ${duration}ms`);
    return { success: true, executionId, duration };
  },

  /**
   * Auto-recovery: health check and remediation
   */
  async handleAutoRecovery(event, env, ctx) {
    const executionId = `auto-recover-${Date.now()}`;
    console.log(`[${executionId}] Starting auto-recovery check`);

    try {
      const result = await authenticatedFetch(env, `${env.PUBLIC_URL}/api/cron?action=auto-recover`, {
        executionId,
        timeoutMs: 60000,
      });

      console.log(`[${executionId}] Auto-recovery: ${result.ok ? 'OK' : 'FAILED'} (${result.status})`, {
        action: result.data?.action,
        reason: result.data?.reason,
      });

      return { success: result.ok, executionId, ...result.data };
    } catch (error) {
      console.error(`[${executionId}] Auto-recovery error: ${error.message}`);
      return { success: false, executionId, error: error.message };
    }
  },

  /**
   * Daily tasks at midnight UTC: DLQ cleanup, trial checks, nurture, weekly digest (Sunday)
   */
  async handleDailyTasks(event, env, ctx) {
    const executionId = `daily-${Date.now()}`;
    const base = env.PUBLIC_URL;
    console.log(`[${executionId}] Starting daily tasks`);

    const results = {};

    const callEndpoint = async (name, url, opts = {}) => {
      try {
        const result = await authenticatedFetch(env, url, { executionId, ...opts });
        results[name] = { success: result.ok, status: result.status };
        console.log(`[${executionId}] ${name}: ${result.ok ? 'OK' : 'FAILED'} (${result.status})`);
      } catch (error) {
        results[name] = { success: false, error: error.message };
        console.error(`[${executionId}] ${name}: ${error.message}`);
      }
    };

    // DLQ cleanup (POST)
    await callEndpoint('cleanup-dlq', `${base}/api/cron?action=cleanup-dlq`, { method: 'POST', timeoutMs: 30000 });

    // Trial expiration check
    await callEndpoint('check-trials', `${base}/api/cron?action=check-trials`, { timeoutMs: 30000 });

    // Trial nurture emails
    await callEndpoint('nurture-trials', `${base}/api/cron?action=nurture-trials`, { timeoutMs: 30000 });

    // Weekly digest + prompt improvement (Sunday only)
    if (new Date().getUTCDay() === 0) {
      await callEndpoint('weekly-digest', `${base}/api/cron/weekly-digest`, { timeoutMs: 60000 });
      await callEndpoint('prompt-improvement', `${base}/api/cron/prompt-improvement`, { timeoutMs: 60000 });
    }

    console.log(`[${executionId}] Daily tasks completed`, results);
    return { success: true, executionId, results };
  },
};
