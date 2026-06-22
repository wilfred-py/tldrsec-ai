# ADR-0007: `lib/db/` deprecated stubs stay until comprehensive-cron-integration.test.ts is decoupled

Date: 2026-06-22
Status: accepted

## Context

The autonomous architecture review routine considered deleting four
zero-production-caller modules in `lib/db/` as a dead-orbital cluster
collapse, mirroring the shape of recent PRs (lib/sec-edgar/ orbital
PR #707, lib/audit/summary-audit PR #723, lib/middleware/csrf PR #715,
lib/utils/file-type-detector PR #714, lib/security/error-responses
PR #716, etc.).

The candidate cluster:

- `lib/db/budget-operations.ts` (90 LOC) — documented as
  `DEPRECATED`, all exports (`updateUserBudgetWithLock`,
  `updateMultipleUserBudgets`) are no-op stubs returning fixed
  success values. The migration that retired the budget system
  (`docs/plans/2026-01-02-remove-budget-system-add-credit-monitoring.md`)
  delegated daily credit limits to OpenRouter, leaving these functions
  as backwards-compat shims.
- `lib/db/cost-validation.ts` (300 LOC) — exports
  `validateCostUpdate`, `validateCostBatch`,
  `DAILY_COST_LIMITS`, etc. Zero production callers. The
  `DAILY_COST_LIMITS` constant is independently redefined in
  `lib/cron/types.ts`.
- `lib/db/async-audit.ts` (384 LOC) — exports
  `createAsyncAuditLog`, `flushAuditQueue`, `clearAuditQueue`,
  `getAuditQueueStats`, `shutdownAuditSystem`. Zero production
  callers.
- `lib/db/transaction-manager.ts` (587 LOC) — exports
  `TransactionManager`, `FilingTransactionManager`,
  `transactionUtils`. Zero production callers (imports `monitoring`,
  `async-audit`, and `prisma` but nothing outside the cluster imports
  back).

`lib/db/concurrency.ts` re-exports `updateUserBudgetWithLock` and
`validateCostUpdate` for backwards compatibility (lines 325, 458 of
`concurrency.ts`); both re-exports are marked `@deprecated`.

The cluster appears to satisfy the same deletion test as recent
dead-orbital deletions: imagine deleting the modules, complexity
vanishes (zero production callers), and the deletion-test signal is
"yes, concentrates."

## Decision

**Do not delete.** The four orbital modules and the two
backwards-compatibility re-exports in `lib/db/concurrency.ts` stay in
their current form.

## Reasons (load-bearing)

### 1. Tests assert on the deprecated stubs' interfaces

Three test files exist purely to test these dead modules:

- `__tests__/transaction-deadlock-fix.test.ts` — exercises
  `updateUserBudgetWithLock` and `createAsyncAuditLog` directly.
- `__tests__/security/budget-manipulation.test.ts` — explicitly
  comments "The budget functions (updateUserBudgetWithLock,
  validateCostUpdate) are now no-ops" and asserts the no-op
  contract.
- `__tests__/deadlock-fix-validation.test.ts` — asserts
  `createAsyncAuditLog` is defined.

These are not test waste — they pin the no-op contract so a future
contributor reading the deprecation comment and "fixing" the stubs
(e.g., re-introducing budget tracking) breaks tests immediately. The
shape matches CONTEXT.md "Subscription Active" (`isSubscriptionActive`
predicate stays canonical) and the precedent ADR-0006 keeps for
`financial-content-gate.ts` (a module is not the wrong shape merely
because it has one caller).

### 2. `__tests__/cron/comprehensive-cron-integration.test.ts` is
deeply entangled with the deprecated surface

This single 1500+-line integration test:

- Imports `updateUserBudgetWithLock` from `lib/db/concurrency` (line
  28) and uses it across 8+ `mockResolvedValue` setup blocks.
- Has `jest.mock(...)` blocks for `lib/db/cost-validation`,
  `lib/db/transaction-manager`, and `lib/db/async-audit` (lines
  145–162) that pin the mock contracts the cron route relied on
  before the budget-system migration.
- Asserts on `FilingTransactionManager.processFilingWithTransaction`
  callback flow at lines 1261, 1396.

The 9 other tests in `__tests__/transaction-safety/` and
`__tests__/lib/db/` exercise the same surface to varying degrees.

Deleting the four orbital modules cascades into ~150–200 lines of
test edits across roughly a dozen test files. The leverage of a
dead-code deletion does not exceed the test-rewrite churn at this
ratio.

### 3. The deprecation deadline has not arrived

`budget-operations.ts` itself documents the stubs as a transition
period (`docs/plans/2026-01-02-remove-budget-system-add-credit-monitoring.md`).
The migration plan retired the production callers; it did not retire
the stubs. Until either the comprehensive cron integration test is
rewritten without budget assertions OR the deprecation deadline
arrives, the stubs earn their keep as a load-bearing test fixture.

## Consequences

- The four orbital modules (`budget-operations.ts`,
  `cost-validation.ts`, `async-audit.ts`, `transaction-manager.ts`)
  stay in place with their current `@deprecated` documentation.
- The backwards-compat re-exports in `lib/db/concurrency.ts`
  (`updateUserBudgetWithLock`, `validateCostUpdate`) stay in place.
- Future architecture reviews should not re-suggest this deletion
  until one of:
  1. `__tests__/cron/comprehensive-cron-integration.test.ts` is
     rewritten or split so that its assertions do not flow through
     the deprecated `lib/db/` surface.
  2. The three single-purpose tests
     (`__tests__/transaction-deadlock-fix.test.ts`,
     `__tests__/security/budget-manipulation.test.ts`,
     `__tests__/deadlock-fix-validation.test.ts`) are removed
     deliberately — at which point the deprecation contract no longer
     has a test anchor and the stubs can follow.
- When the deletion eventually happens, the four modules go together
  as one cluster, the two re-exports go with them, and the three
  single-purpose tests are deleted at the same time. The
  comprehensive integration test must be touched.

## Cross-reference

- `docs/plans/actioned/2026/1. January/2026-01-02-remove-budget-system-add-credit-monitoring.md`
  — the original migration that retired the production callers.
- ADR-0006 (Financial Content Gate stays as its own module) — the
  precedent for keeping a module alive when its test surface is the
  load-bearing reason.
