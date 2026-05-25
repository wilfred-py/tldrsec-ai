# ADR-0005 — CIK-resolution duplication is dead code, not a deepening target

Date: 2026-05-25
Status: accepted

## Context

The nightly deepening routine flagged an apparent consolidation opportunity:
two modules resolve a ticker to a CIK behind the same interface
(`resolveTicker(ticker) → { cik, companyName, source }`) over the same
implementation shape (in-memory cache → `CikMapping` Postgres lookup → SEC
directory fallback):

- `lib/sec-edgar/cik-resolver.ts` (function-based) — **live**, with two
  callers (`environment-aware-fetcher.ts`, `app/api/user/tickers/route.ts`).
- `lib/sec-edgar/ticker-service/ticker-resolver.ts` (`TickerResolver` class)
  — its sole consumer is `lib/sec-edgar/filing-storage.ts`, which is itself
  reachable only through the `lib/sec-edgar/index.ts` barrel (imported
  nowhere) and a manual `test-filing-storage.ts` script.

On the surface this reads as "two adapters of one concept — consolidate into
one deep module." A closer look shows the second module and its entire
`ticker-service/` directory (`ticker-resolver.ts`, `sec-client.ts`,
`types.ts`) are **dead**: no production caller, no test reference, no barrel
consumer, and `SECDataClient` / the ticker-service types are unused
elsewhere. Its SEC fallback is additionally a broken stub
(`mockCik = ticker.replace(/\D/g, '').padStart(10, '0')` → `"0000000000"`
for any alphabetic ticker; the file's own comments admit it is not
production code).

## Decision

**Do not treat the cik-resolver / `TickerResolver` pair as a
deepening-by-consolidation candidate.** The live `cik-resolver` is already a
deep module (substantial behaviour behind a one-argument interface); it is
not shallow, so there is no shallow cluster to merge. The duplication exists
only on the dead side. The correct treatment is **dead-code removal** of
`lib/sec-edgar/ticker-service/` and the dead `filing-storage` chain, tracked
as the architecture-gap issue #587 (and overlapping with #575), not a
refactor that merges two interfaces.

A separate, smaller improvement remains open and is noted in #587: the live
`cik-resolver` hardwires its SEC directory fetch to `global.fetch` and has no
tests. Introducing a `CikDirectoryLookup` port (the SEC directory is a
true-external dependency, so a mock adapter in tests + the real adapter in
production gives two adapters and therefore a real seam) would make it
testable through its interface. That is a standalone testability change, not
a consolidation of the two modules.

## Consequences

- A future deepening pass that sees "two ticker→CIK resolvers" should not
  re-propose merging them. The merge target is dead; the action is deletion,
  which belongs in a dead-code-removal change tracked by #587, kept separate
  from the deepening routine's PRs.
- If `filing-storage.ts` is ever revived (it currently does not even compile
  — see #575), its ticker resolution should call the live `cik-resolver`
  rather than reintroducing a second resolver. The broken-mock
  `TickerResolver` must not be the basis for that revival.
- This ADR does not authorise deleting `filing-storage.ts` blindly; the
  manual `test-filing-storage.ts` script suggests in-progress intent. The
  dead `ticker-service/` resolver itself is unambiguously removable.
