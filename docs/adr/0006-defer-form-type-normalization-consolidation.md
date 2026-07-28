# ADR-0006 — Defer form-type normalization consolidation out of the nightly deepening routine

Date: 2026-05-26
Status: accepted

## Context

The nightly deepening routine repeatedly surfaces form-type normalization as its single highest-leverage candidate: `normalizeFormType` / `getFormTypeDescription` (the [Filing] form-type interface) is implemented **five** times with divergent behaviour:

1. `services/filing/formTypeService.ts` — substring `.includes()` normalize that **drops** amendments (`Schedule 13D/A → SC 13D`); rich **HTML** descriptions.
2. `services/filings/utils/formTypeService.ts` — a **byte-identical twin** of (1).
3. `services/filings/utils/formTypeUtils.ts` — prefix-aware normalize that **preserves** amendments; plain, registry-first descriptions.
4. `lib/ai/utils/form-type-utils.ts` — `canonicalizeFormType` with its own `CanonicalFormType` type.
5. `lib/validation/filing-content-verifier.ts` — a private `normalizeFormType`.

The deep module that *should* own this already exists: `lib/sec-edgar/form-registry.ts` (`FORM_REGISTRY` + accessors). On the surface this is the same drifting-copies pattern that the **Template Selection** deepening successfully collapsed, so a future review pass (human or this routine) will keep proposing "fold all five into `form-registry` behind one interface."

This ADR records why that consolidation is **deliberately not** done as an autonomous nightly PR, so the routine does not re-litigate it each run.

## Decision

Do **not** auto-consolidate form-type normalization in the nightly deepening routine. Defer it to a dedicated, human-reviewed effort, tracked as an `architecture-gap` issue. The nightly routine should skip this candidate.

The load-bearing reasons (none ephemeral, none self-evident from the code):

1. **The seam cannot move without changing behaviour.** The two live `normalizeFormType` contracts genuinely differ (amendment-dropping vs amendment-preserving), and *neither* produces clean `FORM_REGISTRY` keys for amendments (`formTypeUtils` emits `10-K-A`; the registry key is `10-K/A`). There is no behaviour-preserving canonical — picking one changes outputs for a subset of callers.

2. **`getFormTypeDescription` has three different outputs** (rich HTML, terse registry, medium plain) consumed by user-facing fallback-summary paths. Unifying to the registry's descriptions is a **user-facing content change**, not a refactor, and needs product judgement.

3. **It spans the parallel `services/filing/` (legacy) and `services/filings/` (live) trees** (see the parallel-trees gap), so a correct consolidation is entangled with retiring a whole sub-tree.

4. **No green test gate exists.** These modules have essentially no direct tests, and the surrounding `services/filings` / `lib/ai` suites do not run cleanly under `npm test` in CI (Node-version harness gap). A behaviour-changing consolidation cannot be validated automatically, which violates the routine's "tests must pass before pushing" rule.

## Consequences

- The nightly routine treats form-type consolidation as out of scope; it will not open a PR for it. The work is tracked as an `architecture-gap` issue and should be done as a dedicated PR that (a) picks canonical normalize semantics mapping to real `FORM_REGISTRY` keys, (b) makes an explicit decision on canonical description text, (c) retires or migrates the legacy `services/filing/` tree, and (d) establishes a green test gate first.
- This ADR can be superseded once the test-harness gap is fixed and a human has decided the canonical normalize + description contracts — at which point `form-registry.ts` becoming the single deep form-type module is the right outcome.
- This does **not** forbid the consolidation; it forbids doing it *blindly and autonomously*. It is explicitly the inverse of a "leave it duplicated forever" decision.
