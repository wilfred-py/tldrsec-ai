# ADR-0007 — Delete the FilingTypeRegistry along with its dead orbital

Date: 2026-06-17
Status: accepted
Supersedes: ADR-0001 (Inline Filing-Type Registration into the Registry)

## Context

ADR-0001 (accepted) inlined seven side-effect-import filing-type config
modules into `FilingTypeRegistry` so the registry was always complete at
module load time. That decision was correct given its context: the
registry had callers, but the cluster of `lib/parsers/filing-types/*.ts`
files registering themselves as a side effect of import was an implicit
ordering constraint invisible to the type system. Inlining removed that
ordering bug.

In the months since ADR-0001 shipped, every production caller of
`FilingTypeRegistry` was migrated to the live extraction pipeline at
`lib/parsers/filing-extractor.ts` (covered by ADR-0005) and the
form-specific dispatch inside the [Filing Prompt] module. By the time
this ADR is written, the only remaining importer of
`lib/parsers/filing-type-registry.ts` is its own test file,
`__tests__/parsers/filing-registry.test.ts` — and that test file's
own only purpose is asserting on the registry's internals.

The same fate befell the seven sibling modules behind the
`lib/parsers/index.ts` barrel (`html-parser`, `sec-filing-parser`,
`chunk-manager`, `pdf-parser`, `xbrl-parser`, `parser-error-handler`,
plus the barrel itself and an older `js-backup/` snapshot). All have
zero production importers; their only inbound edges are to each other.

The autonomous deepening routine surfaced this as
[issue #677][677] and asked explicitly whether deleting the registry
contradicts ADR-0001. This ADR exists to answer that question on the
record, so the same review doesn't have to happen again.

## Decision

Delete `lib/parsers/filing-type-registry.ts`, its test file, and the
rest of the dead orbital cluster behind `lib/parsers/index.ts`. This
does not contradict ADR-0001 — it is the continuation of the same
reasoning. ADR-0001 inlined the configs into the registry because that
solved a real problem callers were hitting (implicit load-order). Now
that no callers remain, the entire registry is hypothetical-seam
infrastructure that adds no leverage and no locality; per LANGUAGE.md
"one adapter means a hypothetical seam, two adapters means a real one,"
and zero adapters means no seam at all.

ADR-0001's `FilingTypeRegistry.register()` runtime entrypoint is
deleted along with the registry; no production code ever called it,
and no live caller exists for it to serve.

## Consequences

**This locks in:**

- The live Filing extraction surface is `lib/parsers/filing-extractor.ts`
  (per ADR-0005, "HTML iXBRL as primary financial source") for the
  cron/summarize pipeline, and `lib/parsers/form-parser.ts` for the
  legacy `services/filings/*` chain. No central registry mediates between
  callers and form-type-specific extraction; each live module dispatches
  form-type internally.
- New filing-type support is added by editing the form-type dispatch
  inside the live module that needs it (e.g. `unified-prompts.ts`'s
  `FORM_SCHEMAS` registry for the [Filing Prompt], or
  `filing-extractor.ts`'s internal switch for cleaning) — **not** by
  registering against a central registry.

**This precludes:**

- Re-introducing a global filing-type registry without a concrete,
  multi-caller justification. A future contributor proposing one must
  show at least two live callers that the registry would deduplicate;
  per LANGUAGE.md, one adapter is a hypothetical seam.
- Resurrecting any of the deleted parser modules (`html-parser`,
  `xbrl-parser`, `pdf-parser`, `sec-filing-parser`, `chunk-manager`,
  `parser-error-handler`) under their old names. If the SEC parsing
  pipeline needs to be split out of `filing-extractor.ts` in the
  future, do so by extracting from the live module against live
  callers — not by reconstituting the deleted cluster.

**Why this is load-bearing for future reviewers:**

A future review pass — automated or human — looking at ADR-0001 and
finding no `FilingTypeRegistry` in the codebase would naturally
suspect that the deepening had been undone. This ADR makes the chain
explicit: ADR-0001 fixed an implicit-ordering bug at a time when the
registry had callers; ADR-0007 deleted the registry once it had none.
The two decisions agree on the underlying principle (eliminate
hypothetical seams; concentrate behaviour at live interfaces) and
disagree only on which artefact survives, because the answer changed
when the call graph did.

[677]: https://github.com/wilfred-py/tldrsec-ai/issues/677
