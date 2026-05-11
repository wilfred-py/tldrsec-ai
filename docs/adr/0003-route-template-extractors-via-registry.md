# ADR 0003: Route email template extractors through the central registry

**Status**: Withdrawn  
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

This looked like an opportunity to route through `lib/email/extractor-registry.ts`,
which appeared in an earlier snapshot of main as the single source of truth for
form-type → extractor routing.

## Decision

**Withdrawn.** `lib/email/extractor-registry.ts` was intentionally deleted in PR #508
("deepen: absorb extractor-registry and extractor-merge-utils into Summary Enrichment
module"). The registry was eliminated because its interface was nearly as complex as its
implementation and it had only two callers. The extractor dispatch table now lives as
private implementation inside `summarize-with-validation`.

Routing the templates through a module that no longer exists is not viable. The correct
pattern for email templates is direct import from the per-form extractor module — this
is explicit, statically analysable, and incurs no runtime indirection.

## Consequences

- Templates retain direct imports. No change to runtime behaviour.
- The registry seam for templates does not exist and should not be recreated without a
  concrete, multi-caller justification.
