-- Daily enrichment spend snapshot, intended for monitoring dashboard.
--
-- Joins the per-envelope spend totals for today against the persistent
-- circuit-breaker state. One row per envelope when both sides exist; left-join
-- keeps spend rows even before a breaker row is seeded.
--
-- Committed for documentation. Not executed by the app — paste into psql or
-- Prisma Studio when investigating live ledger state.
SELECT
  s."envelope",
  s."dateIso",
  s."totalUsd",
  s."capUsd",
  (s."capUsd" - s."totalUsd") AS "remainingUsd",
  c."state"             AS "circuitState",
  c."failureCount"      AS "circuitFailureCount",
  c."openedAt"          AS "circuitOpenedAt",
  c."halfOpenSuccesses" AS "circuitHalfOpenSuccesses"
FROM "pipeline"."EnrichmentSpend" s
LEFT JOIN "pipeline"."EnrichmentCircuitState" c
  ON c."envelope" = s."envelope"
WHERE s."dateIso" = TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD')
ORDER BY s."envelope";
