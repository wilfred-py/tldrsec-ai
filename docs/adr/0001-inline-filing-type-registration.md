# ADR 0001 — Inline Filing-Type Registration into the Registry

**Status**: Accepted

## Context

`lib/parsers/filing-type-registry.ts` defined the `FilingTypeRegistry` class with an empty `Map`. Seven separate modules in `lib/parsers/filing-types/` (one per filing type) existed solely to call `FilingTypeRegistry.register()` as a side effect when imported. Callers in `filing-parser-factory.ts` and `parsers/index.ts` imported `./filing-types` for these side effects.

This indirection forced callers to remember a required side-effect import before using the registry. The registry was incomplete unless those files were loaded first — an implicit ordering constraint invisible to the type system.

## Decision

Move all filing-type configs directly into `FilingTypeRegistry` as the `Map`'s initial entries, using TypeScript static class blocks for alias registration. Delete the `lib/parsers/filing-types/` directory and the side-effect imports in `filing-parser-factory.ts` and `parsers/index.ts`.

## Consequences

- The registry is always complete at module load time — no implicit initialization order.
- 16 files deleted (7 `.ts` + 7 `.js` + `index.ts` + `index.js`). All filing-type config lives in one place.
- `FilingTypeRegistry.register()` remains available for callers that need to add types at runtime.
- The `initializeFilingTypes()` noop function and `initializeParsers()` require-shim are removed with the barrel module.
