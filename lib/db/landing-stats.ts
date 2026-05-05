import { getPrismaClient } from "@/lib/db/prisma";

const RATE_WINDOW_DAYS = 30;
const RATE_WINDOW_SECONDS = RATE_WINDOW_DAYS * 24 * 60 * 60;
// Floor rate so the landing-page counter is always visibly ticking even if
// the platform briefly has no fresh activity (Stripe-style perpetual motion).
// 0.5 min/sec → integer rolls up every ~2 seconds at the displayed scale.
const FLOOR_RATE_MIN_PER_SEC = 0.5;

export interface GlobalMinutesSaved {
  /** Lifetime total of estimated minutes saved across the whole platform. */
  totalMinutes: number;
  /** Projected per-second growth rate, derived from last 30 days of activity. */
  ratePerSecond: number;
}

/**
 * Aggregate "minutes saved" across every Summary in the platform — used for the
 * collective counter on the landing-page hero (Stripe-GDP-counter analog).
 *
 * The metric is an estimate: input tokens converted to words at the standard
 * 250 WPM reading rate, minus the equivalent for the summary the user actually
 * read. Same formula as the per-user dashboard stat.
 */
export async function fetchGlobalMinutesSaved(): Promise<GlobalMinutesSaved> {
  const prisma = getPrismaClient();
  const windowStart = new Date(Date.now() - RATE_WINDOW_SECONDS * 1000);

  const [totalAgg, recentAgg] = await Promise.all([
    prisma.summary.aggregate({
      _sum: { inputTokens: true, outputTokens: true },
    }),
    prisma.summary.aggregate({
      where: { filingDate: { gte: windowStart } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
  ]);

  const totalInput = totalAgg._sum.inputTokens ?? 0;
  const totalOutput = totalAgg._sum.outputTokens ?? 0;
  const totalMinutes = Math.max(0, ((totalInput - totalOutput) * 0.75) / 250);

  const recentInput = recentAgg._sum.inputTokens ?? 0;
  const recentOutput = recentAgg._sum.outputTokens ?? 0;
  const recentMinutes = Math.max(0, ((recentInput - recentOutput) * 0.75) / 250);
  const derivedRate = recentMinutes / RATE_WINDOW_SECONDS;
  const ratePerSecond = Math.max(derivedRate, FLOOR_RATE_MIN_PER_SEC);

  return { totalMinutes, ratePerSecond };
}
