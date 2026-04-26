"use client";

import { EMAIL_NOTICE_PROMISE, SETTINGS_HELPER } from "@/lib/onboarding/email-notice-constants";

interface InlineEmailNoticeProps {
  tickers: string[];
}

/**
 * Variant B disclosure block — rendered inside ProfileStep sub-step 2 (AUM),
 * below the radio group and above the footer CTA.
 *
 * Shares copy constants with Variant A so the A/B measures placement, not copy.
 */
export function InlineEmailNotice({ tickers }: InlineEmailNoticeProps) {
  const count = tickers.length;
  const first3 = tickers.slice(0, 3).join(", ");
  const remaining = Math.max(0, count - 3);
  const tickerLine =
    count === 0
      ? ""
      : remaining > 0
      ? `${first3} +${remaining} more`
      : first3;

  return (
    <section
      aria-labelledby="email-notice-heading"
      className="mt-5 rounded-lg border border-gray-200 dark:border-gray-700 bg-muted/30 p-3"
    >
      <h3 id="email-notice-heading" className="sr-only">
        Email notice
      </h3>
      <p className="text-[13px] leading-snug text-foreground">
        {EMAIL_NOTICE_PROMISE(count)}
      </p>
      {tickerLine && (
        <p
          className="mt-1 text-[12px] font-mono text-muted-foreground truncate"
          title={tickers.join(", ")}
        >
          {tickerLine}
        </p>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        {SETTINGS_HELPER}
      </p>
    </section>
  );
}
