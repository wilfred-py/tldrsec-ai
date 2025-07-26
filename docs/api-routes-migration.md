# API Routes Migration Guide

## Overview

We've migrated all API routes from the legacy Next.js Pages Router (`/pages/api`) to the modern App Router (`/app/api`) structure. This migration was necessary to align with Next.js best practices and take advantage of the improved performance and features of the App Router architecture.

## Key Changes

1. **Directory Structure**: API routes moved from `/pages/api/*` to `/app/api/*/route.ts`
2. **Handler Functions**: Changed from `export default function handler(req, res)` to `export async function GET/POST/etc(request)`
3. **Response Format**: Changed from `res.status().json()` to `NextResponse.json()`
4. **Request Parsing**: Changed from `req.body` and `req.query` to `request.json()` and `request.nextUrl.searchParams`

## Migrated Routes

The following API routes have been migrated:

| Old Path (Pages Router) | New Path (App Router) | HTTP Methods |
|-------------------------|------------------------|--------------|
| `/api/debug/email-summary` | `/api/debug/email-summary` | GET, POST |
| `/api/debug/filing-summary` | `/api/debug/filing-summary` | POST |
| `/api/filings/batch-summary` | `/api/filings/batch-summary` | POST |
| `/api/filings/enhanced-summary` | `/api/filings/enhanced-summary` | GET |
| `/api/filings/stream-summary` | `/api/filings/stream-summary` | GET |
| `/api/test-summarize` | `/api/test-summarize` | POST |

## Usage Examples

### Making GET Requests

**Before (Pages Router):**
```javascript
// Client-side code
const response = await fetch('/api/filings/enhanced-summary?ticker=AAPL&formType=10-K');
const data = await response.json();
```

**After (App Router):**
```javascript
// Client-side code (unchanged)
const response = await fetch('/api/filings/enhanced-summary?ticker=AAPL&formType=10-K');
const data = await response.json();
```

### Making POST Requests

**Before (Pages Router):**
```javascript
// Client-side code
const response = await fetch('/api/filings/batch-summary', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    requests: [{ ticker: 'AAPL', formType: '10-K' }],
    concurrencyLimit: 3
  })
});
const data = await response.json();
```

**After (App Router):**
```javascript
// Client-side code (unchanged)
const response = await fetch('/api/filings/batch-summary', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    requests: [{ ticker: 'AAPL', formType: '10-K' }],
    concurrencyLimit: 3
  })
});
const data = await response.json();
```

## Server-Side Implementation Differences

### GET Handler (Pages Router)

```typescript
// pages/api/filings/enhanced-summary.ts
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { ticker, formType } = req.query;
  
  // Process the request
  
  return res.status(200).json({ data });
}
```

### GET Handler (App Router)

```typescript
// app/api/filings/enhanced-summary/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const ticker = searchParams.get('ticker');
  const formType = searchParams.get('formType');
  
  // Process the request
  
  return NextResponse.json({ data });
}
```

### POST Handler (Pages Router)

```typescript
// pages/api/filings/batch-summary.ts
import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { requests, concurrencyLimit } = req.body;
  
  // Process the request
  
  return res.status(200).json({ results });
}
```

### POST Handler (App Router)

```typescript
// app/api/filings/batch-summary/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { requests, concurrencyLimit } = await request.json();
  
  // Process the request
  
  return NextResponse.json({ results });
}
```

## Error Handling

### Error Handling (Pages Router)

```typescript
try {
  // Process request
} catch (error) {
  return res.status(500).json({ 
    error: `An error occurred: ${error.message}` 
  });
}
```

### Error Handling (App Router)

```typescript
try {
  // Process request
} catch (error) {
  return NextResponse.json(
    { error: `An error occurred: ${error.message}` },
    { status: 500 }
  );
}
```

## Testing API Routes

You can test the migrated API routes using the test script located at `/tests/api-routes.test.js`:

```bash
# Start the development server
npm run dev

# In a separate terminal, run the test script
node tests/api-routes.test.js
```

## References

- [Next.js App Router Documentation](https://nextjs.org/docs/app/building-your-application/routing)
- [Next.js API Routes Documentation](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
