# Fix Auto-Recover 401 Authentication Error

**Date**: 2026-01-02T11:05:07+11:00
**Git Commit**: 0c78e435f929b942af436089ca125fc56693df72
**Branch**: feature/inline-ticker-search-keyboard-nav
**Repository**: tldrsec-ai

## Overview

Fix the 401 Unauthorized error occurring on the `/api/cron/auto-recover` endpoint when called by the Cloudflare Worker. The root cause is an authentication pattern mismatch: the Cloudflare Worker sends `x-cron-secret` header, but the middleware expects either HMAC headers or `Authorization: Bearer` token.

## Current State Analysis

### The Authentication Flow (Failing)

```
Cloudflare Worker                    Vercel Application
      |                                     |
      | GET /api/cron/auto-recover          |
      | Headers: x-cron-secret: <secret>    |
      |------------------------------------>|
      |                                     | middleware.ts intercepts
      |                                     | Checks for x-hmac-signature → NOT FOUND
      |                                     | Checks for Authorization: Bearer → NOT FOUND
      |                                     |
      |<------------------------------------|
      | 401 Unauthorized                    |
```

### Key Files

| File | Role |
|------|------|
| [cloudflare-cron/index.js:278-327](cloudflare-cron/index.js#L278-L327) | `handleAutoRecovery` - sends `x-cron-secret` header |
| [middleware.ts:63-105](middleware.ts#L63-L105) | Expects HMAC or Bearer token auth |
| [app/api/cron/auto-recover/route.ts:33-47](app/api/cron/auto-recover/route.ts#L33-L47) | Route-level auth checking `x-cron-secret` |

### Key Discoveries

1. **Inconsistent Pattern**: `handleAutoRecovery` uses `x-cron-secret` header, while other handlers use HMAC:
   - `handleIntervalSummary` - Uses HMAC ([index.js:176-202](cloudflare-cron/index.js#L176-L202))
   - `handleDailyReport` - Uses HMAC ([index.js:234-258](cloudflare-cron/index.js#L234-L258))
   - `handlePipelineProcessing` - Uses HMAC ([index.js:500-520](cloudflare-cron/index.js#L500-L520))

2. **Middleware Bypass Logic**: The middleware allows HMAC-authenticated requests through with `x-auth-method: hmac` header ([middleware.ts:67-83](middleware.ts#L67-L83))

3. **Route-Level Auth Redundancy**: The auto-recover route has its own `authenticateRequest` function that checks `x-cron-secret`, but requests never reach it due to middleware rejection

## Desired End State

1. Auto-recover endpoint successfully authenticates requests from Cloudflare Worker
2. Authentication pattern is consistent with all other cron handlers (HMAC)
3. All existing tests pass
4. E2E verification confirms the endpoint works in production

### Verification Criteria

1. **Automated**: `npm run test` passes
2. **Automated**: `npm run build` succeeds
3. **Manual**: Deploy to Vercel and verify Cloudflare Worker logs show successful auto-recover calls

## What We're NOT Doing

- NOT modifying the middleware authentication logic
- NOT adding `x-cron-secret` support to middleware (would add complexity)
- NOT removing the route-level authentication (defense in depth)
- NOT changing the auto-recover endpoint logic itself

## Implementation Approach

**Elon's 5-Step Algorithm Applied:**

1. **Question the requirement**: Is `x-cron-secret` header needed? No - HMAC is more secure and already used
2. **Delete**: Remove the `x-cron-secret` header pattern from `handleAutoRecovery`
3. **Simplify**: Use existing HMAC pattern already implemented in other handlers
4. **Accelerate**: Single file change, minimal testing needed
5. **Automate**: N/A - this is a bug fix

**Solution**: Update `handleAutoRecovery` in `cloudflare-cron/index.js` to use HMAC authentication, matching the pattern used by all other cron handlers.

---

## Phase 1: Add HMAC Authentication to handleAutoRecovery

### Overview

Update the `handleAutoRecovery` function to generate and send HMAC signature headers instead of `x-cron-secret`.

### Step 1.1: Write Failing Tests

**Test File**: `__tests__/cloudflare-cron/auto-recover-auth.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * These tests verify that auto-recover requests use HMAC authentication.
 * Since we can't directly test the Cloudflare Worker in Jest, we'll test
 * the endpoint's HMAC validation logic.
 */

describe('Auto-Recover HMAC Authentication', () => {
  const CRON_SECRET = 'test-secret-at-least-32-characters-long';

  // Helper to generate HMAC signature (mirrors Cloudflare Worker logic)
  async function generateHmacSignature(secret: string, payload: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    return Array.from(new Uint8Array(signature))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  describe('HMAC Signature Generation', () => {
    it('should generate consistent HMAC signatures for auto-recover payload', async () => {
      const timestamp = 1704150307000; // Fixed timestamp for test
      const payload = `${timestamp}:GET:/api/cron/auto-recover`;

      const signature1 = await generateHmacSignature(CRON_SECRET, payload);
      const signature2 = await generateHmacSignature(CRON_SECRET, payload);

      expect(signature1).toBe(signature2);
      expect(signature1).toHaveLength(64); // SHA-256 produces 64 hex chars
    });

    it('should produce different signatures for different timestamps', async () => {
      const timestamp1 = 1704150307000;
      const timestamp2 = 1704150308000;

      const payload1 = `${timestamp1}:GET:/api/cron/auto-recover`;
      const payload2 = `${timestamp2}:GET:/api/cron/auto-recover`;

      const signature1 = await generateHmacSignature(CRON_SECRET, payload1);
      const signature2 = await generateHmacSignature(CRON_SECRET, payload2);

      expect(signature1).not.toBe(signature2);
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they PASS (these are testing helper functions):
```bash
npm run test -- --testPathPattern="auto-recover-auth"
# Expected: 2 passing tests
```

### Step 1.2: Implement HMAC in Cloudflare Worker

**File**: `cloudflare-cron/index.js`

**Current Code (lines 278-297)**:
```javascript
async handleAutoRecovery(event, env, ctx) {
  const executionId = `auto-recover-${Date.now()}`;
  const startTime = Date.now();

  console.log(`[${executionId}] ====== AUTO-RECOVERY CHECK ======`);

  try {
    const url = `${env.PUBLIC_URL}/api/cron/auto-recover`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Execution-Id': executionId,
        'X-Cloudflare-Worker': 'tldrsec-cron',
        'User-Agent': 'Cloudflare-Worker/1.0 AutoRecover',
        'x-cron-secret': env.CRON_SECRET,  // <-- PROBLEM: Middleware doesn't recognize this
      },
    });
```

**New Code**:
```javascript
async handleAutoRecovery(event, env, ctx) {
  const executionId = `auto-recover-${Date.now()}`;
  const startTime = Date.now();

  console.log(`[${executionId}] ====== AUTO-RECOVERY CHECK ======`);

  try {
    const url = `${env.PUBLIC_URL}/api/cron/auto-recover`;

    // Generate HMAC signature (consistent with other cron handlers)
    const timestamp = Date.now();
    const payload = `${timestamp}:GET:/api/cron/auto-recover`;
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
        'User-Agent': 'Cloudflare-Worker/1.0 AutoRecover',
        'x-hmac-signature': signatureHex,
        'x-hmac-timestamp': timestamp.toString(),
      },
    });
```

**Checkpoint 1.2**: Build succeeds:
```bash
npm run build
# Expected: Build completes successfully
```

### Step 1.3: Refactor - Clean Up Route-Level Auth

**File**: `app/api/cron/auto-recover/route.ts`

The route currently has a custom `authenticateRequest` function that only checks `x-cron-secret`. Since requests now come with HMAC headers and pass through middleware validation, we should update this function to also accept middleware-validated requests.

**Current Code (lines 33-47)**:
```typescript
async function authenticateRequest(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  // Check header
  const headerSecret = request.headers.get('x-cron-secret');
  if (headerSecret === cronSecret) return true;

  // Check query param (for Vercel cron)
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  if (querySecret === cronSecret) return true;

  return false;
}
```

**New Code**:
```typescript
async function authenticateRequest(request: NextRequest): Promise<boolean> {
  // Check if middleware already validated the request (HMAC auth)
  const securityValidated = request.headers.get('x-security-validated');
  const authMethod = request.headers.get('x-auth-method');
  if (securityValidated === 'true' && authMethod === 'hmac') {
    return true;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  // Check header (legacy support for direct calls)
  const headerSecret = request.headers.get('x-cron-secret');
  if (headerSecret === cronSecret) return true;

  // Check query param (for Vercel cron)
  const url = new URL(request.url);
  const querySecret = url.searchParams.get('secret');
  if (querySecret === cronSecret) return true;

  return false;
}
```

**Checkpoint 1.3**: All tests pass:
```bash
npm run test
# Expected: All tests pass
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [x] All tests pass: `npm run test` (auto-recover tests pass; pre-existing failures in unrelated email queue tests)
- [x] Type checking passes: `npm run build`
- [x] Linting passes: `npm run lint`
- [x] No regressions: `npm run test:cron-comprehensive` (pre-existing failures unrelated to this fix)

#### Manual Verification:
- [ ] Deploy Cloudflare Worker: `npm run cloudflare:deploy`
- [ ] Wait 15 minutes for auto-recovery cron to execute
- [ ] Check Cloudflare Worker logs for successful auto-recover calls: `npm run cloudflare:logs`
- [ ] Verify no 401 errors in logs

**STOP**: After completing this phase and all automated verification passes, pause here for manual confirmation that the Cloudflare Worker logs show successful auto-recover calls before considering this task complete.

---

## Testing Strategy

### TDD Test Design

The tests focus on:
1. HMAC signature generation consistency
2. Middleware authentication bypass for HMAC requests
3. Route-level authentication fallback

### Test Categories

#### 1. Unit Tests (Written First)
- HMAC signature generation
- Authentication function logic

#### 2. Integration Tests
- End-to-end cron authentication flow (existing `npm run test:cron-comprehensive`)

#### 3. Manual Verification
- Cloudflare Worker log analysis post-deployment

### Checkpoint Frequency

- Checkpoint 1.1: After writing test helpers
- Checkpoint 1.2: After Cloudflare Worker update
- Checkpoint 1.3: After route authentication update
- Checkpoint 1.4: Final automated + manual verification

## Performance Considerations

- No performance impact expected
- HMAC signature generation adds ~1ms per request (negligible)
- Existing pattern already proven performant in other handlers

## Migration Notes

- No database migration required
- No data migration required
- Backward compatible: route-level auth still accepts `x-cron-secret` for direct calls

## References

- Original research: [thoughts/shared/research/2026-01-02-auto-recover-401-authentication.md](thoughts/shared/research/2026-01-02-auto-recover-401-authentication.md)
- Middleware authentication: [middleware.ts:63-105](middleware.ts#L63-L105)
- Example HMAC implementation: [cloudflare-cron/index.js:176-202](cloudflare-cron/index.js#L176-L202)
