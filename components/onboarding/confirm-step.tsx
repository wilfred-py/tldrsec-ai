"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NotificationPreference } from "@/lib/email/notification-types";
import { EMAIL_NOTICE_PROMISE, SETTINGS_HELPER } from "@/lib/onboarding/email-notice-constants";

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

/**
 * Variant A — 4th onboarding step.
 *
 * Confirms the email promise before finish: shows tracked tickers, current
 * frequency (with inline toggle), and a single Finish CTA.
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

  // Autofocus heading on mount (A11y + plan spec: autofocus Variant A only).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // 0-ticker guard: if user somehow lands here with no tickers (e.g. race with
  // unsubscribing the last ticker), bail out to Back with a toast.
  useEffect(() => {
    if (tickers.length === 0 && !zeroTickersFiredRef.current) {
      zeroTickersFiredRef.current = true;
      onZeroTickers();
    }
  }, [tickers.length, onZeroTickers]);

  const count = tickers.length;

  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="flex flex-col p-6" style={{ height: "calc(100vh - 120px)", maxHeight: "700px" }}>
        <div className="text-center mb-6">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-xl font-bold outline-none"
          >
            {EMAIL_NOTICE_PROMISE(count)}
          </h2>
          <p className="text-muted-foreground text-sm mt-2">
            Your first email will arrive the moment a new SEC filing hits.
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Tracked tickers */}
          {count > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Tracking {count} {count === 1 ? "company" : "companies"}
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

          {/* Frequency segmented control */}
          <div className="mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Email frequency
            </h3>
            <div
              role="radiogroup"
              aria-label="Email frequency"
              className="flex flex-col gap-1.5"
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
                        ? "border-primary bg-primary/10 font-medium"
                        : "border-gray-200 hover:border-primary/50 dark:border-gray-700"
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
            <p className="mt-2 text-[11px] text-muted-foreground">{SETTINGS_HELPER}</p>
          </div>
        </div>

        <div className="mt-auto pt-4 flex items-center justify-between">
          <Button variant="ghost" onClick={onBack} disabled={isSubmitting}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button onClick={onFinish} disabled={isSubmitting || count === 0}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                Start tracking
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
