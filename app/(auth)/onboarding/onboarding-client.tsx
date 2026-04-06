"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "@clerk/nextjs";
import { useAuthContext } from "@/lib/context/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { NotificationPreference } from "@/lib/email/notification-types";
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
import { ProfileStep } from "@/components/onboarding/profile-step";
import type { CompanyItem } from "./types";
import type { UserRole, AumBracket } from "@/components/onboarding/profile-step";
import { TOTAL_STEPS } from "./types";

export default function OnboardingPage() {
  const { isLoading } = useAuthContext();
  const { session } = useSession();
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showTransition, setShowTransition] = useState(false);

  const [currentStep, setCurrentStep] = useState(1);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedEquities, setSelectedEquities] = useState<string[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const equityNamesRef = useRef<Map<string, string>>(new Map());
  const submittingRef = useRef(false);

  // Default preferences
  const [emailFrequency] = useState<NotificationPreference>(
    DEFAULT_NOTIFICATION_PREFERENCES.emailFrequency
  );
  const [filingTypes] = useState<FilingTypePreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES.filingTypes
  );
  const [contentPreferences] = useState<NotificationContentPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES.contentPreferences
  );
  const [uiPreferences] = useState<UIPreferences>(DEFAULT_UI_PREFERENCES);

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
    if (currentStep < TOTAL_STEPS) {
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

  // -----------------------------------------------------------------------
  // Complete onboarding
  // -----------------------------------------------------------------------
  const handleCompleteOnboarding = async (profile: { role: UserRole; aumBracket?: AumBracket }) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      setIsSubmitting(true);
      setError(null);

      const formattedTickers = selectedEquities.map((symbol) => ({
        symbol,
        companyName: equityNamesRef.current.get(symbol) || symbol,
      }));

      // Capture UTM params if present
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
          },
          ...(utmParams.utm_source ? { utmParams } : {}),
        },
        tickers: formattedTickers,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to complete onboarding");
      }

      document.cookie = "onboarding_completed=true; path=/; max-age=60; SameSite=Lax";
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
    }
  };

  // -----------------------------------------------------------------------
  // Render guards
  // -----------------------------------------------------------------------
  if (isLoading || initializing) {
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
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
              <p className="mb-6">{error}</p>
              <Button onClick={() => { setError(null); setIsSubmitting(false); }}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showTransition) {
    return <OnboardingTransition />;
  }

  // -----------------------------------------------------------------------
  // Main render — two-column layout with vertical progress
  // -----------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="flex min-h-screen">
        {/* Left column: vertical progress */}
        <div className="w-16 sm:w-48 flex-shrink-0 pl-4 sm:pl-8">
          <VerticalProgress currentStep={currentStep} />
        </div>

        {/* Right column: main content */}
        <div
          className={`flex-1 flex items-start justify-center px-4 ${
            currentStep === 1
              ? "pt-4 sm:pt-[8vh] lg:pt-[12vh]"
              : "pt-4 sm:pt-[4vh] lg:pt-[8vh]"
          }`}
        >
          <div className="w-full max-w-3xl">
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
                    onComplete={handleCompleteOnboarding}
                    onBack={handleBack}
                    isSubmitting={isSubmitting}
                    isTransitioning={isTransitioning}
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
