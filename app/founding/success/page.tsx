/**
 * /founding/success — post-checkout landing.
 *
 * Stripe redirects here after a successful Lifetime Seat payment with
 * `?session_id={CHECKOUT_SESSION_ID}`. We don't verify the session here
 * (the webhook is the source of truth for entitlement); this page is just
 * the human-readable thank-you + next-steps surface.
 */

export const dynamic = 'force-dynamic';

export default async function FoundingSuccessPage() {
  return (
    <main className="min-h-screen bg-gray-100 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm sm:p-14">
        <div className="mb-8 text-sm font-semibold text-black">tldrSEC</div>

        <h1 className="mb-5 text-3xl font-bold leading-tight tracking-tight text-black sm:text-4xl">
          You&apos;re in. Lifetime access activated.
        </h1>

        <p className="mb-6 text-base leading-relaxed text-gray-700 sm:text-lg">
          Your payment is processed and your MAX access is being activated. A Stripe receipt is on its way to your inbox.
        </p>

        <hr className="my-8 border-gray-200" />

        <h2 className="mb-4 text-lg font-bold text-black">What happens next</h2>
        <ol className="mb-6 list-none space-y-3">
          <li className="relative pl-9 text-base leading-relaxed text-gray-700">
            <span className="absolute left-0 top-0 font-bold text-black">1.</span>
            Check your inbox for the Stripe receipt within the next few minutes.
          </li>
          <li className="relative pl-9 text-base leading-relaxed text-gray-700">
            <span className="absolute left-0 top-0 font-bold text-black">2.</span>
            Sign up below using the same email address you paid with. Your seat is already activated and waiting; signing up just creates your login.
          </li>
          <li className="relative pl-9 text-base leading-relaxed text-gray-700">
            <span className="absolute left-0 top-0 font-bold text-black">3.</span>
            Add your tickers and start receiving real-time alerts on every SEC filing.
          </li>
        </ol>

        <a
          href="/sign-up"
          className="mt-2 block w-full rounded-lg bg-violet-600 px-4 py-4 text-center text-base font-semibold text-white transition-colors hover:bg-violet-700"
        >
          Sign up to access your seat
        </a>

        <hr className="my-8 border-gray-200" />

        <p className="text-sm text-gray-700">
          Questions? Reply to the receipt email or write to{' '}
          <a href="mailto:wilfred@tldrsec.app" className="font-semibold text-black underline">
            wilfred@tldrsec.app
          </a>
          .
        </p>

        <div className="mt-10 border-t border-gray-200 pt-6 text-sm text-gray-700">
          <b className="font-semibold text-black">Wilf</b>, tldrSEC
        </div>
      </div>
    </main>
  );
}
