/**
 * Summary.processingStatus success values.
 *
 * Historical writers emit different cases ("COMPLETED", "SUCCESS", "CACHE_HIT",
 * plus lowercase/title-case variants). Until the column is migrated to a Prisma
 * enum (deferred — see plan TODOS), this is the single source of truth for the
 * "summary is usable" predicate.
 *
 * New writers MUST import from here. An ESLint rule
 * (`no-restricted-syntax` matching `processingStatus: '<literal>'`) enforces
 * this — see eslint.config.mjs.
 */
export const SUCCESS_STATUSES = [
  'COMPLETED',
  'SUCCESS',
  'CACHE_HIT',
  'completed',
  'Success',
] as const;

export type SuccessStatus = (typeof SUCCESS_STATUSES)[number];

/**
 * True if the given processingStatus indicates the summary is delivery-ready.
 * Useful at filter sites that don't want to expose the raw array.
 */
export function isSuccessStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (SUCCESS_STATUSES as readonly string[]).includes(status);
}
