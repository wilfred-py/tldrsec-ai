# TODOS

Tracker for follow-ups that surfaced during /ship gates but are not blocking the
current PR. Each entry includes priority, what surfaced it, and the smallest
viable next action.

## P1 — pre-existing test infrastructure (surfaced by /ship #486 baseline run)

Confirmed pre-existing on bare `origin/main` via stash + re-run (15 failed / 62 passed,
identical signature). Not caused by the X sentiment email integration.

- **`NotificationService.handleSummaryReadyEvent is not a function`** — and
  `getNotificationSubject is not a function`. Tests reference methods that no
  longer exist on the class. Either restore the methods or rewrite the tests
  against the current interface.
- **`EmailFooter` unsubscribe-link assertion returns `null`.** The test queries
  by text but the link is now built from a token-bearing href; the matcher
  needs an `href`-based lookup, not text.
- **`templates.test.ts` — `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG` from
  `@react-email/render`.** Needs `NODE_OPTIONS='--experimental-vm-modules'`
  (or migration to a static-renderer test helper) so the dynamic import inside
  `@react-email/render` can resolve under Jest's VM.

**Smallest next action**: open a single `chore: fix pre-existing email test
infra` PR that addresses all three — they're cheap individually but each one
on its own is too small to ship.

## P2 — onboarding A/B variant cleanup (deferred from #495 / v0.0.25.9)

**Priority:** P2

The "tell-us-about-yourself" reminder was moved into a dedicated final step in
v0.0.25.9, which de facto retired the `inline` variant of `useOnboardingVariant`.
We chose D1=B (force flag fallback to `step4` and emit `variant: "step4-polished"`
for analytics) over D1=A (delete the variant code) so the experiment
infrastructure stays available for measurement comparison.

Once the PostHog flag `onboarding-email-notice-variant` is concluded server-side
and you're confident no returning users still hold an `inline` sessionStorage/
cookie bucket (~30 days post-rollout), delete:

- `lib/hooks/use-onboarding-variant.ts`
- `components/onboarding/inline-email-notice.tsx`
- `__tests__/components/onboarding/inline-email-notice.test.tsx`
- `inlineDisclosure` prop + render in `components/onboarding/profile-step.tsx`
- Variant fork branches in `app/(auth)/onboarding/onboarding-client.tsx`
- The `'inline'` member of the `variant` union in `lib/analytics/events.ts`
- `ONBOARDING_STEPS_BASE` / `getOnboardingSteps(variant)` in `app/(auth)/onboarding/types.ts`

**Smallest next action**: ~30 min cleanup PR after the variant assignment cookie
TTL has elapsed.
