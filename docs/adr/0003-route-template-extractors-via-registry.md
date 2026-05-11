# ADR 0003: Route email template extractors through the central registry

**Status**: Accepted  
**Date**: 2026-05-11

## Context

Three email templates (`form4-minimalist-template.tsx`, `8k-minimalist-template.tsx`,
`form144-minimalist-template.tsx`) each imported their data-extractor function
directly by name:

```typescript
// form4
import { extractForm4Data } from '../../../../lib/email/form4-data-extractor';
// 8k
import { extract8KData } from '../../../../lib/email/8k-data-extractor';
// form144
import { extractForm144Data } from '../../../../lib/email/form144-data-extractor';
```

`lib/email/extractor-registry.ts` already existed on `main` as the single source
of truth for routing form types to extractors, but the templates bypassed it.
This meant every template coupled directly to a specific extractor module —
adding a new extractor alias or swapping an implementation required touching
each template individually.

## Decision

Replace each direct extractor import with a `getExtractor` call from the
central registry. Retain a `import type` for the data shape (erased at runtime)
to preserve type safety at the call site.

```typescript
// Before
import { extractForm4Data } from '../../../../lib/email/form4-data-extractor';
const extractedData = summaryText ? extractForm4Data(summaryText) : null;

// After
import { getExtractor } from '../../../../lib/email/extractor-registry';
import type { Form4ExtractedData } from '../../../../lib/email/form4-data-extractor';
const extractedData = summaryText
  ? (getExtractor('4')?.(summaryText) as Form4ExtractedData ?? null)
  : null;
```

## Consequences

- Three templates no longer bind to specific extractor function names at runtime.
  Adding a new alias in the registry is sufficient to reach any template.
- The routing decision lives in one place (`extractor-registry.ts`) rather than
  being scattered across each template.
- `import type` carries no runtime dependency; it is erased by TypeScript at
  compile time. Runtime coupling is only to the registry.
- No files deleted; no extractors removed. The data-extractor modules retain
  their full surface area for other callers (e.g., server-side summarizers).
