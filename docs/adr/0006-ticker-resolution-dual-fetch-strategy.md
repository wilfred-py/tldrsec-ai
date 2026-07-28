# ADR-0006: Ticker→CIK resolution keeps two adapters with different SEC fetch strategies

Date: 2026-05-27
Status: accepted

## Context

The nightly deepening routine flagged a candidate: two modules independently resolve a ticker symbol to a CIK (the Filing-intake "Ticker Resolution" concept), each carrying its own 24h / 1000-entry in-memory cache and its own SEC-fetch + Postgres-lookup logic.

- `lib/sec-edgar/cik-resolver.ts` — a functional module (`resolveTicker` → `CIKResolutionResult`). Header: "CIK Resolution Service for Railway-Safe SEC Data Fetching". Its SEC fallback fetches the **bulk `company_tickers_exchange.json`** endpoint in one request. Callers: `app/api/user/tickers/route.ts` (fire-and-forget, ignores the result — only triggers the DB-population side effect) and `lib/sec-edgar/environment-aware-fetcher.ts` (uses `.success` and `.ticker`).
- `lib/sec-edgar/ticker-service/ticker-resolver.ts` — a `TickerResolver` class with injected `prisma` + `SECDataClient` (`resolveTicker` → `TickerResolutionResult`). Its SEC path uses the **per-company submissions API** via `SECDataClient`, plus fuzzy matching, historical-ticker handling, confidence scoring, and metadata. Callers: `lib/sec-edgar/index.ts`, `lib/sec-edgar/filing-storage.ts`.

On the surface this is a textbook deepening: collapse two shallow resolvers into one deep Ticker Resolution module so the resolution logic and cache live in one place. The deletion test passes — delete either and the cache + lookup logic reappears.

## Decision

**Withdrawn — do not merge the two resolvers as a routine deepening.**

The two modules are not two copies of one strategy; they are **two adapters with deliberately different SEC fetch strategies** at the same seam:

- `cik-resolver` is the *railway-safe* adapter — a single bulk-JSON fetch, chosen explicitly (per its own header) for an environment where per-company submission fetches are problematic.
- `TickerResolver` is the *rich* adapter — per-company submissions with fuzzy/historical/confidence enrichment.

Per LANGUAGE.md's seam discipline, **two adapters means a real seam** — this is not redundant indirection to collapse. Naively folding one into the other would either (a) lose the railway-safe single-fetch property, or (b) discard the fuzzy/historical enrichment, in both cases changing the behaviour of production **Filing** intake.

Three further facts make this load-bearing rather than "not worth it right now":

1. **The interfaces diverge in a caller-visible way.** `CIKResolutionResult` and `TickerResolutionResult` are different shapes; `environment-aware-fetcher` reads `.success`/`.ticker`, and the tickers route relies purely on the DB-population side effect. A merge must reconcile both contracts.
2. **No equivalence tests exist.** There is no test that pins "resolver A and resolver B produce the same CIK for the same ticker," so a merge cannot be verified behaviour-preserving through any existing interface — exactly the situation deepening.md warns against ("the interface is the test surface").
3. **It is production-critical filing intake.** A subtle divergence (CIK zero-padding, alias matching, failure recording, cache key normalization) silently misroutes filings.

## Consequences

- The two resolvers stay. The duplication is accepted as the cost of two intentional fetch strategies behind one seam, not treated as drift to be eliminated.
- A future consolidation is viable **only** with new work this ADR scopes: (a) write a ticker→CIK *equivalence* test fixture covering both adapters, (b) define a single `Ticker Resolution` port whose interface is the union both callers need, (c) implement the railway-safe bulk fetch and the submissions fetch as two named **adapters** behind that port, and (d) migrate the four callers. That is a deliberate ports-&-adapters refactor (deepening.md category 4, true-external SEC API), not a nightly auto-merge.
- The shared 24h/1000-entry cache config and the small pure helpers (`isValidCIK`, `formatCIK`, `normalizeTicker`) are the low-risk part that *could* be extracted first if a future pass wants an incremental step.
- This ADR exists so the routine does not re-flag "two ticker resolvers, merge them" every run without acknowledging the dual-strategy seam.
