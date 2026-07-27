"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "@clerk/nextjs";
import { useAuthContext } from "@/lib/context/auth-context";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { NotificationPreference } from "@/lib/user/preference-types";
import {
  FilingTypePreferences,
  NotificationContentPreferences,
  UIPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_UI_PREFERENCES,
} from "@/lib/user/preference-types";
import { completeOnboardingBatched } from "./actions";
import { OnboardingTransition } from "@/components/onboarding/onboarding-transition";
import { VerticalProgress } from "@/components/onboarding/vertical-progress";
import { SectorStep } from "@/components/onboarding/sector-step";
import { CompanyStep } from "@/components/onboarding/company-step";
import { ProfileStep, type ProfileSubStep } from "@/components/onboarding/profile-step";
import { ConfirmStep } from "@/components/onboarding/confirm-step";
import { InlineEmailNotice } from "@/components/onboarding/inline-email-notice";
import type { CompanyItem } from "./types";
import type { UserRole, AumBracket } from "@/components/onboarding/profile-step";
import { getOnboardingSteps } from "./types";
import { useAnalytics } from "@/lib/hooks/use-analytics";
import { EVENTS } from "@/lib/analytics/events";
import { useOnboardingVariant } from "@/lib/hooks/use-onboarding-variant";

const STEP_NAMES = ["sectors", "companies", "profile", "confirm"] as const;

export default function OnboardingPage() {
  const { isLoading, userId, userEmail, userName } = useAuthContext();
  const { session } = useSession();
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTransition, setShowTransition] = useState(false);

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedEquities, setSelectedEquities] = useState<string[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Lifted profile state (was inside ProfileStep) — required for Variant A
  // Back-from-step-4 to preserve role/AUM/customRoleText.
  const [profileSubStep, setProfileSubStep] = useState<ProfileSubStep>(1);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [customRoleText, setCustomRoleText] = useState("");
  const [selectedAum, setSelectedAum] = useState<AumBracket | null>(null);

  const equityNamesRef = useRef<Map<string, string>>(new Map());
  const submittingRef = useRef(false);

  // Onboarding funnel timing.
  const onboardingStartRef = useRef<number>(Date.now());
  const stepStartRef = useRef<number>(Date.now());
  const { trackEvent, identifyUser } = useAnalytics();

  // A/B variant — resolved async, bucket-stable on Clerk userId.
  const { variant, resolved } = useOnboardingVariant(userId);
  const steps = getOnboardingSteps(variant ?? "step4");
  const TOTAL_STEPS_FOR_VARIANT = steps.length;

  // Email frequency — wired as real state (was readonly before). Variant A
  // toggle mutates this; Variant B inherits the default and redirects to
  // Settings for changes (per plan §667).
  const [emailFrequency, setEmailFrequency] = useState<NotificationPreference>(
    DEFAULT_NOTIFICATION_PREFERENCES.emailFrequency
  );
  const [filingTypes] = useState<FilingTypePreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES.filingTypes
  );
  const [contentPreferences] = useState<NotificationContentPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES.contentPreferences
  );
  const [uiPreferences] = useState<UIPreferences>(DEFAULT_UI_PREFERENCES);

  // Identify PostHog user once Clerk hydrates — required for valid A/B
  // bucketing (§3A in review notes).
  useEffect(() => {
    if (!userId) return;
    identifyUser({ id: userId, email: userEmail, name: userName });
  }, [userId, userEmail, userName, identifyUser]);

  useEffect(() => {
    try {
      if (!isLoading) setInitializing(false);
    } catch (err) {
      console.error("Error during initialization:", err);
      setError("An error occurred while loading. Please try refreshing the page.");
      setInitializing(false);
    }
  }, [isLoading]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------
  const handleSectorToggle = (sectorId: string) => {
    setSelectedSectors((prev) =>
      prev.includes(sectorId) ? prev.filter((id) => id !== sectorId) : [...prev, sectorId]
    );
  };

  const handleEquityToggle = (company: CompanyItem) => {
    const { symbol, name } = company;
    setSelectedEquities((prev) => {
      if (prev.includes(symbol)) {
        equityNamesRef.current.delete(symbol);
        return prev.filter((s) => s !== symbol);
      }
      if (prev.length < 15) {
        equityNamesRef.current.set(symbol, name);
        return [...prev, symbol];
      }
      return prev;
    });
  };

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------
  const handleNext = () => {
    if (currentStep < TOTAL_STEPS_FOR_VARIANT) {
      const now = Date.now();
      const stepName = STEP_NAMES[currentStep - 1];
      if (stepName) {
        trackEvent(EVENTS.ONBOARDING_STEP_COMPLETED, {
          step_name: stepName,
          step_index: currentStep,
          duration_ms: now - stepStartRef.current,
        });
      }
      stepStartRef.current = now;

      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStep((s) => s + 1);
        setIsTransitioning(false);
      }, 300);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStep((s) => s - 1);
        setIsTransitioning(false);
      }, 300);
    }
  };

  // Called from ProfileStep (Variant B — last step) or from ConfirmStep
  // Finish (Variant A). Variant A's Finish doesn't supply a profile — we
  // read from lifted state.
  const handleCompleteOnboarding = async (profileOverride?: {
    role: UserRole;
    aumBracket?: AumBracket;
    customRoleText?: string;
  }) => {
    if (submittingRef.current) return;

    const profile = profileOverride ?? {
      role: selectedRole!,
      aumBracket: selectedAum ?? undefined,
      customRoleText:
        selectedRole === "other" ? customRoleText : undefined,
    };

    if (!profile.role) {
      setError("Missing role. Please return to the profile step.");
      return;
    }

    submittingRef.current = true;
    try {
      setIsSubmitting(true);
      setError(null);

      // Set cookie optimistically — middleware checks this as fallback to prevent redirect loops
      document.cookie = "onboarding_completed=true; path=/; max-age=60; SameSite=Lax";

      const formattedTickers = selectedEquities.map((symbol) => ({
        symbol,
        companyName: equityNamesRef.current.get(symbol) || symbol,
      }));

      const params = new URLSearchParams(window.location.search);
      const utmParams = {
        utm_source: params.get("utm_source") || undefined,
        utm_medium: params.get("utm_medium") || undefined,
        utm_campaign: params.get("utm_campaign") || undefined,
      };

      const result = await completeOnboardingBatched({
        preferences: {
          notifications: { emailFrequency, filingTypes, contentPreferences },
          ui: uiPreferences,
          profile: {
            role: profile.role,
            aumBracket: profile.aumBracket,
            ...(profile.customRoleText ? { customRoleText: profile.customRoleText } : {}),
          },
          ...(utmParams.utm_source ? { utmParams } : {}),
        },
        tickers: formattedTickers,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to complete onboarding");
      }

      // Funnel events — variant-aware. Emit "step4-polished" as the canonical
      // label so PostHog funnels keyed on this property survive the inline →
      // step4 transition without dropping data. Original assignment ("inline" /
      // "step4") still flows through ONBOARDING_VARIANT_ASSIGNED for historical
      // attribution.
      const now = Date.now();
      const resolvedVariant = "step4-polished";
      const lastStepName = STEP_NAMES[currentStep - 1] ?? "profile";
      trackEvent(EVENTS.ONBOARDING_STEP_COMPLETED, {
        step_name: lastStepName,
        step_index: currentStep,
        duration_ms: now - stepStartRef.current,
      });
      trackEvent(EVENTS.ONBOARDING_COMPLETED, {
        total_duration_ms: now - onboardingStartRef.current,
        companies_count: formattedTickers.length,
        sectors_count: selectedSectors.length,
        variant: resolvedVariant,
        step_count: TOTAL_STEPS_FOR_VARIANT as 3 | 4,
        email_frequency: emailFrequency.toUpperCase() as
          | "IMMEDIATE"
          | "DAILY"
          | "NONE",
        ticker_count: formattedTickers.length,
        duration_ms: now - onboardingStartRef.current,
      });

      setShowTransition(true);

      if (session) {
        session.reload().catch((reloadError) => {
          console.warn("Session reload failed, continuing with navigation:", reloadError);
        });
      }
    } catch (error) {
      console.error("Error completing onboarding:", error);
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      setError(errorMessage);
      toast.error("Failed to complete onboarding. Please try again.");
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  };

  // Variant B: ProfileStep's Complete CTA fires submit directly.
  // Variant A: ProfileStep's Complete CTA advances to step 4 instead.
  const handleProfileComplete = (profile: {
    role: UserRole;
    aumBracket?: AumBracket;
    customRoleText?: string;
  }) => {
    if (variant === "step4") {
      // Lift-state is authoritative; ignore the profile payload (it's the
      // same data). Advance to the Confirm step.
      handleNext();
    } else {
      void handleCompleteOnboarding(profile);
    }
  };

  const handleConfirmFinish = () => {
    void handleCompleteOnboarding();
  };

  const handleZeroTickers = () => {
    toast.error("You need at least one ticker before finishing onboarding.");
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStep(2); // Companies step
      setIsTransitioning(false);
    }, 300);
  };

  // Auto-redirect to sign-in on error after 3 seconds
  useEffect(() => {
    if (!error || showTransition) return;
    const timer = setTimeout(() => {
      window.location.href = "/sign-in";
    }, 3000);
    return () => clearTimeout(timer);
  }, [error, showTransition]);

  // -----------------------------------------------------------------------
  // Render guards
  // -----------------------------------------------------------------------
  if (isLoading || initializing || !resolved) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error && !showTransition) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h2>
          <p className="text-muted-foreground">{error}</p>
          <p className="text-sm text-muted-foreground mt-4">Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  if (showTransition) {
    return <OnboardingTransition />;
  }

  // -----------------------------------------------------------------------
  // Main render — two-column layout with vertical progress
  // -----------------------------------------------------------------------
  const inlineDisclosure =
    variant === "inline" ? (
      <InlineEmailNotice tickers={selectedEquities} />
    ) : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="flex gap-6 sm:gap-10 w-full max-w-4xl">
          {/* Left: vertical progress */}
          <div className="flex-shrink-0 flex items-center">
            <VerticalProgress currentStep={currentStep} steps={steps} />
          </div>

          {/* Right: main content */}
          <div className="flex-1 min-w-0">
            {/* Step transition wrapper */}
            <div className="relative overflow-hidden">
              <div
                className={`transition-all duration-300 ease-in-out ${
                  isTransitioning
                    ? "translate-x-[-100%] opacity-0 pointer-events-none"
                    : "translate-x-0 opacity-100"
                }`}
              >
                {currentStep === 1 && (
                  <SectorStep
                    selectedSectors={selectedSectors}
                    onToggle={handleSectorToggle}
                    onContinue={handleNext}
                    isTransitioning={isTransitioning}
                  />
                )}

                {currentStep === 2 && (
                  <CompanyStep
                    selectedSectors={selectedSectors}
                    selectedEquities={selectedEquities}
                    onEquityToggle={handleEquityToggle}
                    onContinue={handleNext}
                    onBack={handleBack}
                    isTransitioning={isTransitioning}
                    equityNamesRef={equityNamesRef}
                  />
                )}

                {currentStep === 3 && (
                  <ProfileStep
                    subStep={profileSubStep}
                    onSubStepChange={setProfileSubStep}
                    selectedRole={selectedRole}
                    onRoleChange={setSelectedRole}
                    customRoleText={customRoleText}
                    onCustomRoleChange={setCustomRoleText}
                    selectedAum={selectedAum}
                    onAumChange={setSelectedAum}
                    onComplete={handleProfileComplete}
                    onBack={handleBack}
                    isSubmitting={isSubmitting && variant === "inline"}
                    isTransitioning={isTransitioning}
                    inlineDisclosure={inlineDisclosure}
                  />
                )}

                {currentStep === 4 && variant === "step4" && (
                  <ConfirmStep
                    tickers={selectedEquities}
                    emailFrequency={emailFrequency}
                    onFrequencyChange={setEmailFrequency}
                    onFinish={handleConfirmFinish}
                    onBack={() => {
                      // Back to ProfileStep, restore to sub-step 2 so AUM is
                      // immediately visible (user was on AUM when they
                      // advanced).
                      setProfileSubStep(2);
                      handleBack();
                    }}
                    onZeroTickers={handleZeroTickers}
                    isSubmitting={isSubmitting}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
