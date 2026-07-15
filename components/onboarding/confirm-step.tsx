"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NotificationPreference } from "@/lib/email/notification-types";

interface ConfirmStepProps {
  tickers: string[];
  emailFrequency: NotificationPreference;
  onFrequencyChange: (frequency: NotificationPreference) => void;
  onFinish: () => void;
  onBack: () => void;
  onZeroTickers: () => void;
  isSubmitting: boolean;
}

const FREQUENCY_OPTIONS: Array<{ value: NotificationPreference; label: string; description: string }> = [
  {
    value: NotificationPreference.IMMEDIATE,
    label: "Immediate",
    description: "Email the moment a filing hits",
  },
  {
    value: NotificationPreference.DAILY,
    label: "Daily",
    description: "One summary email per day",
  },
  {
    value: NotificationPreference.NONE,
    label: "None",
    description: "No emails, check the dashboard",
  },
];

const FREQUENCY_LABEL: Record<NotificationPreference, string> = {
  [NotificationPreference.IMMEDIATE]: "Immediate",
  [NotificationPreference.DAILY]: "Daily",
  [NotificationPreference.NONE]: "None",
};

/**
 * Final onboarding step (Variant A — step4-polished).
 *
 * The hero treatment: brand-blue mail icon, prominent promise heading, and a
 * single brand-blue CTA. The frequency selector is collapsed behind a "Change"
 * affordance to keep the screen as one clean focal point.
 */
export function ConfirmStep({
  tickers,
  emailFrequency,
  onFrequencyChange,
  onFinish,
  onBack,
  onZeroTickers,
  isSubmitting,
}: ConfirmStepProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const zeroTickersFiredRef = useRef(false);
  const [showFrequency, setShowFrequency] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (tickers.length === 0 && !zeroTickersFiredRef.current) {
      zeroTickersFiredRef.current = true;
      onZeroTickers();
    }
  }, [tickers.length, onZeroTickers]);

  const count = tickers.length;
  const companyWord = count === 1 ? "company" : "companies";

  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="flex flex-col p-6" style={{ height: "calc(100vh - 120px)", maxHeight: "700px" }}>
        {/* Hero block */}
        <div className="text-center mb-6 pt-4">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-primary)]/10">
            <Mail className="h-6 w-6 text-[var(--brand-primary)]" aria-hidden="true" />
          </div>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl sm:text-3xl font-bold tracking-tight outline-none"
          >
            We&apos;ll email you when new filings are posted for{" "}
            <span className="text-[var(--brand-primary)]">
              {count} {companyWord}
            </span>
            .
          </h2>
          <p className="text-muted-foreground text-sm mt-3">
            Your first email arrives the moment a new SEC filing hits.
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Tracked tickers */}
          {count > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Tracking {count} {companyWord}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {tickers.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center rounded-md border border-gray-200 dark:border-gray-700 bg-muted/40 px-2 py-0.5 text-xs font-mono text-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Email frequency — collapsed by default to keep the promise prominent */}
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Email frequency
              </h3>
              <button
                type="button"
                onClick={() => setShowFrequency((v) => !v)}
                className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
                aria-expanded={showFrequency}
                aria-controls="frequency-options"
              >
                {showFrequency ? "Done" : "Change"}
              </button>
            </div>
            {!showFrequency && (
              <p className="mt-1 text-sm text-foreground">
                {FREQUENCY_LABEL[emailFrequency]}
              </p>
            )}
            {showFrequency && (
              <div
                id="frequency-options"
                role="radiogroup"
                aria-label="Email frequency"
                className="mt-2 flex flex-col gap-1.5"
              >
                {FREQUENCY_OPTIONS.map((opt) => {
                  const selected = emailFrequency === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onFrequencyChange(opt.value)}
                      className={`text-left rounded-lg border px-3 py-2 text-sm transition-all ${
                        selected
                          ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 font-medium"
                          : "border-gray-200 hover:border-[var(--brand-primary)]/50 dark:border-gray-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.description}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">Change anytime in Settings.</p>
          </div>
        </div>

        <div className="mt-auto pt-4 flex items-center justify-between">
          <Button variant="ghost" onClick={onBack} disabled={isSubmitting}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={onFinish}
            disabled={isSubmitting || count === 0}
            className="bg-[var(--brand-primary)] text-white font-semibold hover:bg-[var(--brand-primary-hover)] focus-visible:ring-[var(--brand-primary)]/40"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                Complete setup
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
