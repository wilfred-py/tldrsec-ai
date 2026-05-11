# ADR 0002 — Inline Analysis-Depth Scoring into Onboarding Delivery

**Status**: Accepted

## Context

`lib/onboarding/analysis-depth.ts` exported `getAnalysisDepthScore` — a pure scoring function that reads `summaryJSON`, `summaryText`, and `smartSubject` and returns a number in [0, 100]. It had exactly one production caller: `calculateCompositeScore` in `cached-summary-delivery.ts`. The module existed because the function was *extracted for testability* — a common anti-pattern where implementation detail is separated from its only caller just to make it unit-testable in isolation.

The function's test file (`__tests__/lib/onboarding/analysis-depth.test.ts`) tested `getAnalysisDepthScore` directly via exported bonus constants (`ANALYSIS_DEPTH_BONUSES`, `ANALYSIS_DEPTH_TEXT_THRESHOLD`). These were not used in production, only in tests.

## Decision

Move the scoring function and its dependencies (`ANALYSIS_BONUSES`, `SUMMARY_TEXT_LONG_THRESHOLD`, `SummaryJsonSchema`) directly into `cached-summary-delivery.ts` as unexported private implementation. Delete `analysis-depth.ts` and its test file.

The existing `calculateCompositeScore` tests already cover the depth-scoring behaviour at the composite level (`analysisDepth signal contributes when summaryJSON has xSentiment`, `weights sum to 1.0 via max-score scenario`).

## Consequences

- `lib/onboarding/analysis-depth.ts` deleted; `__tests__/lib/onboarding/analysis-depth.test.ts` deleted.
- `calculateCompositeScore` — the real interface — remains fully tested with 28 passing tests.
- The scoring constants are no longer exported (they were never needed outside tests).
- `cached-summary-delivery.ts` gains `import { z } from 'zod'` (zod was already a dependency of the project).
