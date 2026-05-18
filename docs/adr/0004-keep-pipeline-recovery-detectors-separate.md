# ADR 0004 — Keep Pipeline Recovery Detectors Separate

**Status**: Accepted
**Date**: 2026-05-18

## Context

`lib/cron/execution-gap-detector.ts` (`CronExecutionGapDetector`) and
`lib/cron/orphaned-filing-detector.ts` (`OrphanedFilingDetector`) share surface
shape: static-method classes, module-scoped `lastAlertTime` rate-limiting,
mock-injectable testing seams, Slack alert hooks. A scan ranked them as a
deepening candidate — fold both into a single `Pipeline Recovery` module
behind one observe-and-heal interface.

A closer read of the sole caller, `handleAutoRecover` in `app/api/cron/route.ts`,
disqualified the merge:

- `OrphanedFilingDetector.checkAndRecover()` (route.ts:742) is called **inside
  `runImmediateCleanup(health)`** as one of N cleanup steps alongside stale
  PROCESSING jobs, invalid job types, exhausted retries, and stale locks. Its
  return value contributes to a `CleanupResults` payload and to the unified
  Slack cleanup notification.
- `CronExecutionGapDetector.checkAndAlert()` (route.ts:898) runs **after**
  `runImmediateCleanup` returns. It detects whether the Cloudflare Worker
  cron itself fired — an infrastructure-level signal, not a job-queue cleanup
  step. Its result goes to a separate `CronGapCheckResult` payload and routes
  through its own Slack alert.

The two are in the same parent handler but they have different **purposes**:
one heals stalled filings inside the queue; the other observes whether the
queue's upstream trigger is even alive. Merging them behind one interface
would force callers to learn both concerns at one seam, or invent a faux-unified
`observePipelineHealth()` that runs both unconditionally and always alerts on
both — a semantic change, not a refactor.

## Decision

The two detectors stay as separate modules. The next architecture review must
not re-suggest merging them on the basis of shared surface shape; **shape is
not purpose**.

If a future caller emerges that genuinely needs to observe and heal as one
decision — a true "pipeline self-healing" surface that ties gap detection to
recovery — that caller may justify a deeper merge. Today the only caller
treats them as two independent observations and that justification is not
present.

## Consequences

- `OrphanedFilingDetector` and `CronExecutionGapDetector` remain in
  `lib/cron/`. Their interfaces continue to be called separately from
  `handleAutoRecover`.
- The shared **patterns** (rate-limited Slack alerts, mock-injectable
  detection, static-method shape) are duplicated by design — they encode
  two unrelated observations that happen to share a deployment surface.
- If the duplication becomes painful (e.g. a third detector lands and copies
  the same pattern), the right deepening is to extract the **alert
  rate-limit pattern** as an in-process utility, not to merge the detectors
  themselves. That extraction would be a small new module, not a
  consolidation of the existing ones.
