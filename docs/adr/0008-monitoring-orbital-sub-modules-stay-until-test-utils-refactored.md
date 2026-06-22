# ADR-0008: `lib/monitoring/` orbital sub-modules stay until test utilities are refactored

Date: 2026-06-22
Status: accepted

## Context

The autonomous architecture review routine considered deleting four
sub-modules of `lib/monitoring/` as a dead-orbital cluster collapse:

- `lib/monitoring/sec-api-monitor.ts` (607 LOC) — exports
  `MonitoredSECEdgarClient`, `monitoredSecClient`, `SecApiMonitor`.
- `lib/monitoring/pipeline-error-detector.ts` (999 LOC) — exports
  `PipelineErrorDetector`, `pipelineErrorDetector`,
  `detectPipelineErrors`, `generatePipelineHealthReport`,
  `resolvePipelineAlert`.
- `lib/monitoring/pipeline-health-monitoring-system.ts` (1040 LOC) —
  exports `PipelineHealthMonitoringSystem`,
  `pipelineHealthMonitoring`, `recordLockOperation`,
  `recordParameterValidation`, `recordSecApiOperation`,
  `recordUserProcessing`, `getCurrentHealthMetrics`,
  `getDashboardMetrics`, `startPipelineHealthMonitoring`,
  `stopPipelineHealthMonitoring`.
- `lib/monitoring/async-alert-queue.ts` (433 LOC) — exports
  `AsyncAlertQueue` and related.
- `lib/monitoring/performance-monitor.ts` (372 LOC) — exports
  `PerformanceMonitor` and related.

None of these modules have direct production callers outside
`lib/monitoring/` itself. The `lib/monitoring/index.ts` barrel
re-exports four of them (`export * from
'./pipeline-health-monitoring-system'`, etc.) but every production
import from `lib/monitoring` reads only the `monitoring` singleton
defined inside `index.ts` — none of the re-exported symbols are
referenced.

The candidate appears to satisfy the same deletion test as recent
dead-orbital deletions. The surviving production surface would be the
`monitoring` singleton in `index.ts` and `json-parsing-monitor.ts`
(imported by `lib/ai/parsers/response-parser.ts`).

**Note on `cron-monitor.ts`**: this sibling is NOT a deletion
candidate. `app/api/cron/route.ts` reaches it via dynamic import
(`await import('@/lib/monitoring/cron-monitor')`) and calls
`CronJobMonitor.create` / `CronJobMonitor.start`. Static grep over
top-level imports misses dynamic ones — the autonomous review must
search for both before classifying a module dead.

## Decision

**Do not delete.** The five orbital sub-modules and the `index.ts`
re-exports of four of them stay in their current form.

## Reasons (load-bearing)

### 1. `__tests__/utils/secure-test-utils.ts` builds shared mock
factories on top of the orbital interfaces

`secure-test-utils.ts` defines `AsyncAlertQueueMockFactory` and
`PerformanceMonitorMockFactory` classes whose contracts match the
exported shapes of `async-alert-queue.ts` and
`performance-monitor.ts`. These factories are intended to be reused
across the broader test suite. Deleting the source modules forces a
rewrite of the factory contracts (or their deletion), and the test
files transitively importing them must follow.

### 2. Eight tests in `__tests__/lib/monitoring/` test the orbital
sub-modules directly

- `async-integration.test.ts`
- `cron-alert-fix.test.ts`
- `cron-monitor.test.ts` (the kept module — these tests stay)
- `cron-status-changes.test.ts`
- `pipeline-error-detector.test.ts`
- `async-alert-queue-comprehensive.test.ts`
- `async-alert-queue.test.ts`
- `alert-creation-core.test.ts`

Of these, `pipeline-error-detector.test.ts`,
`async-alert-queue-comprehensive.test.ts`, `async-alert-queue.test.ts`,
and `alert-creation-core.test.ts` would all need deletion alongside
the source. The cross-cutting tests (`async-integration`,
`cron-alert-fix`, `cron-status-changes`) sit at the
multi-orbital-module integration surface and would need rewriting,
not deletion.

### 3. `__tests__/security/security-fixes.test.ts` imports
`pipelineErrorDetector` at line 12

This test imports `pipelineErrorDetector` from
`@/lib/monitoring/pipeline-error-detector` directly. The single
import is shallow but the test's existence pins the contract; the
test would need either rewriting against the live `monitoring`
singleton or deletion.

### 4. Unlike the lib/parsers orbital, the orbital re-exports are
*currently visible* through the kept barrel

`lib/monitoring/index.ts` does `export *` from four orbital
sub-modules. Even though no production code consumes those re-exports
today, a contributor reading `index.ts` sees the orbital exports as
the module's public surface. Removing them without first updating
`index.ts` (and the tests that mock the barrel) creates a
non-obvious diff vs the recent lib/sec-edgar/ deletion which removed
the barrel itself.

## Consequences

- The five orbital sub-modules stay in place.
- The `export *` lines in `lib/monitoring/index.ts` for those four
  re-exported sub-modules stay.
- `cron-monitor.ts` and `json-parsing-monitor.ts` are not part of
  this decision — they have live production callers (cron route
  dynamic import and `response-parser.ts` direct import
  respectively) and continue as deep modules behind their own
  interfaces.
- Future architecture reviews should not re-suggest this deletion
  until one of:
  1. `__tests__/utils/secure-test-utils.ts` is refactored so its
     `AsyncAlertQueueMockFactory` and `PerformanceMonitorMockFactory`
     contracts no longer reference the orbital surfaces.
  2. The eight tests in `__tests__/lib/monitoring/` (excluding the
     `cron-monitor.test.ts` for the kept module and any kept
     `posthog-bridge.test.ts`) are deleted or rewritten against the
     `monitoring` singleton's interface.
  3. `__tests__/security/security-fixes.test.ts` stops importing
     `pipelineErrorDetector`.
- When the deletion eventually happens, the four `export *` lines in
  `index.ts` go with the source modules and the corresponding test
  files are removed in the same PR.

## Cross-reference

- ADR-0007 (`lib/db/` deprecated stubs stay until tests decoupled) —
  the parallel decision for the lib/db cluster facing the same
  test-entanglement obstacle.
- ADR-0006 (Financial Content Gate stays as its own module) — the
  precedent for keeping a module alive when its test surface is the
  load-bearing reason.
- CONTEXT.md "Resilience" — documents how a prior generation of
  orbital `lib/resilience/` and `lib/db/` modules was deleted *with*
  their tests; that precedent applies once the entanglement here is
  addressed.
