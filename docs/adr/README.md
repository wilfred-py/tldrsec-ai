# Architecture Decision Records

Records of architectural decisions that the autonomous architecture review routine should not re-litigate. Each ADR captures a load-bearing reason — something a future reviewer would need to know to avoid re-suggesting the same change.

## When to write an ADR

- A deepening candidate is rejected for a reason that isn't ephemeral ("not worth it right now") and isn't self-evident from the code.
- A seam is placed deliberately in a non-obvious location.
- A dependency category (per [process/Deepening/deepening.md](../../process/Deepening/deepening.md)) is unusual for this codebase.

## Format

```
# ADR-NNNN — <short title>

Date: YYYY-MM-DD
Status: accepted | superseded by ADR-MMMM

## Context
What architectural friction prompted this decision?

## Decision
What did we decide?

## Consequences
What does this lock in? What does it preclude? Why is this load-bearing for future reviewers?
```

Number ADRs sequentially, zero-padded to 4 digits (e.g. `0001-filing-intake-seam.md`). Never renumber once committed; supersede via a new ADR instead.
