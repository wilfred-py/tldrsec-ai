---
date: 2026-01-02T10:56:49+11:00
researcher: Claude
git_commit: 0c78e435f929b942af436089ca125fc56693df72
branch: feature/pricing-counting-animation
repository: tldrsec-ai
topic: "Auto-recover endpoint returning 401 Unauthorized"
tags: [research, codebase, authentication, cron, cloudflare-worker, auto-recover]
status: complete
last_updated: 2026-01-02
last_updated_by: Claude
---

# Research: Auto-recover 401 Authentication Failure

**Date**: 2026-01-02T10:56:49+11:00
**Researcher**: Claude
**Git Commit**: 0c78e435f929b942af436089ca125fc56693df72
**Branch**: feature/pricing-counting-animation
**Repository**: tldrsec-ai

## Research Question

The auto-recovery check is failing with a 401 Unauthorized error:
```
[auto-recover-1767310215087] Auto-recovery check failed: 401 - {"error":"Unauthorized","code":401,"timestamp":"2026-01-01T23:30:15.147Z","path":"/api/cron/auto-recover"}
```

What is the authentication flow for the auto-recover endpoint and how does it differ from other cron endpoints?

## Summary

The auto-recover endpoint uses a **different authentication pattern** than other cron endpoints. It checks for an `x-cron-secret` header (or query parameter), while the Cloudflare Worker sends the secret via the `x-cron-secret` header. However, the middleware intercepts `/api/cron/*` requests first and expects either HMAC authentication or a Bearer token in the `Authorization` header.

The 401 failure occurs because:
1. The middleware intercepts all `/api/cron/*` requests first
2. The Cloudflare Worker sends `x-cron-secret` header (not `Authorization: Bearer ...` or HMAC headers)
3. The middleware doesn't recognize `x-cron-secret` as a valid authentication header
4. The middleware returns 401 before the request reaches the route handler

## Detailed Findings

### Auto-Recover Endpoint Authentication

**File**: [app/api/cron/auto-recover/route.ts](app/api/cron/auto-recover/route.ts)

The endpoint uses a unique authentication function (lines 33-47):

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

This checks for:
1. `x-cron-secret` header
2. `?secret=` query parameter

### Cloudflare Worker Request

**File**: [cloudflare-cron/index.js](cloudflare-cron/index.js) (lines 278-296)

The worker sends the auto-recover request with:

```javascript
const response = await fetch(url, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'X-Execution-Id': executionId,
    'X-Cloudflare-Worker': 'tldrsec-cron',
    'User-Agent': 'Cloudflare-Worker/1.0 AutoRecover',
    'x-cron-secret': env.CRON_SECRET,  // <-- Uses x-cron-secret header
  },
});
```

### Middleware Interception

**File**: [middleware.ts](middleware.ts) (lines 13-216)

The middleware intercepts ALL `/api/cron/*` requests and expects either:

1. **HMAC Authentication** (lines 64-83): Headers `x-hmac-signature` and `x-hmac-timestamp`
2. **Bearer Token** (lines 86-146): Header `Authorization: Bearer ${CRON_SECRET}` or `x-cron-auth`

The middleware does NOT recognize `x-cron-secret` as a valid authentication header.

Relevant middleware code (lines 86-92):
```typescript
// Check both Authorization and X-Cron-Auth headers
const authHeader = request.headers.get('authorization') || request.headers.get('x-cron-auth');
const cronSecret = process.env.CRON_SECRET?.trim();

// ...

if (!authHeader || !authHeader.startsWith('Bearer ')) {
  // Returns 401 Unauthorized
}
```

### Authentication Pattern Comparison

| Endpoint | Authentication Method | Header Used |
|----------|----------------------|-------------|
| `/api/cron/tier-aware` | CronAuthService (HMAC/Vercel/Bearer) | `x-hmac-signature` + `x-hmac-timestamp` |
| `/api/cron/slack-*` | Simple HMAC check + Bearer fallback | `x-hmac-signature` + `x-hmac-timestamp` |
| `/api/cron/auto-recover` | Custom: `x-cron-secret` header | `x-cron-secret` |
| Middleware | HMAC or Bearer token | `Authorization: Bearer ...` or `x-cron-auth` |

### Request Flow (Current - Failing)

```
Cloudflare Worker                    Vercel Application
      |                                     |
      | GET /api/cron/auto-recover          |
      | Headers: x-cron-secret: <secret>    |
      |------------------------------------>|
      |                                     | middleware.ts intercepts
      |                                     | Checks for Authorization or x-cron-auth
      |                                     | Neither found
      |                                     |
      |<------------------------------------|
      | 401 Unauthorized                    |
```

### How Other Endpoints Succeed

Other cron endpoints (like `slack-interval-summary`) use HMAC authentication in the Cloudflare Worker:

```javascript
// Lines 176-200 in cloudflare-cron/index.js
const timestamp = Date.now();
const payload = `${timestamp}:GET:/api/cron/slack-interval-summary`;
const signature = await generateHmacSignature(env.CRON_SECRET, payload);

const response = await fetch(url, {
  method: 'GET',
  headers: {
    'x-hmac-signature': signatureHex,
    'x-hmac-timestamp': timestamp.toString(),
    // ...
  }
});
```

The middleware recognizes HMAC headers and allows the request through.

## Code References

- [app/api/cron/auto-recover/route.ts:33-47](app/api/cron/auto-recover/route.ts#L33-L47) - Custom auth function expecting `x-cron-secret`
- [cloudflare-cron/index.js:278-296](cloudflare-cron/index.js#L278-L296) - Worker sending `x-cron-secret` header
- [middleware.ts:86-92](middleware.ts#L86-L92) - Middleware checking for `Authorization` or `x-cron-auth`
- [middleware.ts:64-83](middleware.ts#L64-L83) - HMAC authentication detection

## Architecture Documentation

### Authentication Layers

The codebase implements defense-in-depth authentication:

1. **Middleware Layer** (`middleware.ts`) - Intercepts all `/api/cron/*` requests
2. **Route Handler Layer** - Individual route authentication (if middleware passes)
3. **HMAC Cryptographic Layer** (`lib/security/hmac-auth.ts`) - Signature verification
4. **IP Allowlist Layer** - Optional via `CRON_ALLOWED_IPS`
5. **Rate Limiting Layer** - Abuse prevention

### Headers Recognized by Middleware

| Header | Purpose |
|--------|---------|
| `Authorization: Bearer <token>` | Primary Bearer token auth |
| `x-cron-auth: Bearer <token>` | Alternative to avoid Clerk conflicts |
| `x-hmac-signature` | HMAC signature for Cloudflare Worker |
| `x-hmac-timestamp` | HMAC timestamp for replay protection |
| `x-vercel-cron: 1` | Internal Vercel cron trigger |

### Headers NOT Recognized by Middleware

| Header | Used By |
|--------|---------|
| `x-cron-secret` | Auto-recover endpoint only |

## Open Questions

1. Is the `x-cron-secret` header pattern intentionally different for auto-recover, or is it an inconsistency?
2. Should the middleware be updated to recognize `x-cron-secret`, or should the Cloudflare Worker be updated to use HMAC for auto-recover?
3. Should the auto-recover endpoint use `CronAuthService` like other critical endpoints?
