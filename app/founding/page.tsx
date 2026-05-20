/**
 * /founding — Lifetime Seat offer landing page.
 *
 * Server-rendered. Reads `?email=` and `?batch=` query params from the
 * founder-sent email links, renders the offer recap with a live seat
 * counter, and posts to `/api/checkout/founding` on CTA click.
 *
 * Three states keyed off the live seat count:
 *   - claimedCount < 22  → primary state
 *   - 22 <= claimedCount < 25 → last-3-seats urgency banner
 *   - claimedCount >= 25 → sold-out state with PRO/MAX fallback
 *
 * See `~/.gstack/projects/wilfred-py-tldrsec-ai/designs/founding-page-20260518/founding-final.html`
 * for the wireframe this implements.
 */

import { getPrismaClient } from '@/lib/db/prisma';
import { FoundingClaimForm } from './founding-claim-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const FOUNDING_SEAT_LIMIT = 25;
const URGENCY_THRESHOLD = 22; // last 3 seats

interface PageProps {
  searchParams: Promise<{ email?: string; batch?: string; cancelled?: string }>;
}

export default async function FoundingPage({ searchParams }: PageProps) {
  const { email, batch, cancelled } = await searchParams;

  const prisma = getPrismaClient();
  const claimedCount = await prisma.user.count({
    where: { foundingMember: true, deletedAt: null },
  });

  const remaining = Math.max(0, FOUNDING_SEAT_LIMIT - claimedCount);
  const soldOut = remaining === 0;
  const urgent = !soldOut && claimedCount >= URGENCY_THRESHOLD;

  if (soldOut) {
    return <SoldOutView />;
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm sm:p-14">
        <div className="mb-8 text-sm font-semibold text-black">tldrSEC</div>

        {urgent && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            Only {remaining} {remaining === 1 ? 'seat' : 'seats'} remaining. After these fill, the offer closes.
          </div>
        )}

        {cancelled === 'true' && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Checkout cancelled. Your seat is still available.
          </div>
        )}

        <h1 className="mb-5 text-3xl font-bold leading-tight tracking-tight text-black sm:text-4xl">
          Pay once. Read SEC filings for life.
        </h1>

        <p className="mb-8 text-base leading-relaxed text-gray-700 sm:text-lg">
          We&apos;re opening <b className="font-semibold text-black">25 lifetime seats</b> today. One payment of{' '}
          <b className="font-semibold text-black">$499</b>, MAX access for life. After these 25 fill, the offer closes.
        </p>

        <hr className="my-8 border-gray-200" />

        <h2 className="mb-4 text-lg font-bold text-black">What you get</h2>
        <ol className="mb-2 list-none">
          <FeatureItem
            n={1}
            title="Unlimited tickers."
            body="Track as many companies as you want."
          />
          <FeatureItem
            n={2}
            title="Real-time alerts on every SEC filing."
            body="10-K, 10-Q, 8-K, Form 4, S-1, every type, delivered the moment it hits EDGAR."
          />
          <FeatureItem
            n={3}
            title="Enriched summaries with live X search."
            body="Filings come back with current market chatter and context, not just the raw document."
          />
          <FeatureItem
            n={4}
            title="First priority in the queue."
            body="MAX users see new filings before PRO users."
          />
        </ol>

        <hr className="my-8 border-gray-200" />

        <h2 className="mb-3 text-lg font-bold text-black">Our promise</h2>
        <p className="text-base text-gray-700">
          <b className="font-semibold text-black">Not the right fit in the first 30 days?</b> Full refund, no questions asked.
        </p>

        <div className="mt-8 flex items-center justify-between border-y border-gray-200 py-5">
          <span className="font-mono text-3xl font-bold tracking-tight text-black">
            {remaining} of 25
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Lifetime seats remaining
          </span>
        </div>

        <FoundingClaimForm initialEmail={email} batch={batch} />

        <p className="mt-3 text-center text-xs text-gray-600">
          One-time payment of <b className="font-semibold text-black">$499</b>. No subscription.
        </p>

        <div className="mt-10 border-t border-gray-200 pt-6 text-sm text-gray-700">
          <b className="font-semibold text-black">Wilf</b>, tldrSEC
        </div>
      </div>
    </main>
  );
}

function FeatureItem({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="relative border-b border-gray-100 py-3 pl-9 text-sm leading-relaxed text-gray-700 last:border-b-0 sm:text-base">
      <span className="absolute left-0 top-3 font-bold text-black">{n}.</span>
      <b className="font-semibold text-black">{title}</b> {body}
    </li>
  );
}

function SoldOutView() {
  return (
    <main className="min-h-screen bg-gray-100 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm sm:p-14">
        <div className="mb-8 text-sm font-semibold text-black">tldrSEC</div>

        <h1 className="mb-5 text-3xl font-bold leading-tight tracking-tight text-black sm:text-4xl">
          All 25 lifetime seats are claimed.
        </h1>

        <p className="mb-8 text-base leading-relaxed text-gray-700 sm:text-lg">
          Thanks for your interest. The 25 lifetime seats were claimed by waitlist members in order of signup. The offer is now closed.
        </p>

        <hr className="my-8 border-gray-200" />

        <p className="mb-4 text-base text-gray-700">tldrSEC is still available at our standard plans:</p>
        <ol className="mb-2 list-none">
          <FeatureItem n={1} title="PRO." body="$199/month. 25 tickers, real-time alerts." />
          <FeatureItem n={2} title="MAX." body="$349/month. Unlimited tickers, enriched summaries, first priority queue." />
        </ol>

        <div className="mt-8 flex items-center justify-between border-y border-gray-200 py-5">
          <span className="font-mono text-3xl font-bold tracking-tight text-gray-500">25 of 25</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Lifetime seats claimed
          </span>
        </div>

        <button
          disabled
          className="mt-4 block w-full cursor-not-allowed rounded-lg bg-gray-400 px-4 py-4 text-base font-semibold text-white"
        >
          Lifetime offer closed
        </button>
        <p className="mt-3 text-center text-xs text-gray-600">
          View standard plans at <b className="font-semibold text-black">tldrsec.app/pricing</b>.
        </p>

        <div className="mt-10 border-t border-gray-200 pt-6 text-sm text-gray-700">
          <b className="font-semibold text-black">Wilf</b>, tldrSEC
        </div>
      </div>
    </main>
  );
}
