"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/lib/context/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MultiStepForm } from "@/components/onboarding/multi-step-form";
import { TickerSelection, SelectedTicker } from "@/components/onboarding/ticker-selection";
import { NotificationPreferences } from "@/components/onboarding/notification-preferences";
import { UserProfileForm } from "@/components/onboarding/user-profile";
import { NotificationPreference } from "@/lib/email/notification-service";
import { 
  FilingTypePreferences, 
  NotificationContentPreferences,
  UIPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_UI_PREFERENCES
} from "@/lib/user/preference-types";
import { saveUserPreferences, addTickerSubscription } from "./actions";

export default function OnboardingPage() {
  const { isAuthenticated, isLoading, userName, userId } = useAuthContext();
  const router = useRouter();
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [selectedTickers, setSelectedTickers] = useState<SelectedTicker[]>([]);
  const [emailFrequency, setEmailFrequency] = useState<NotificationPreference>(
    DEFAULT_NOTIFICATION_PREFERENCES.emailFrequency
  );
  const [filingTypes, setFilingTypes] = useState<FilingTypePreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES.filingTypes
  );
  const [contentPreferences, setContentPreferences] = useState<NotificationContentPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES.contentPreferences
  );
  const [fullName, setFullName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [bio, setBio] = useState("");
  const [uiPreferences, setUiPreferences] = useState<UIPreferences>(DEFAULT_UI_PREFERENCES);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize with user's name if available
  useEffect(() => {
    if (userName) {
      setFullName(userName);
    }
  }, [userName]);

  // Protect this route
  useEffect(() => {
    try {
      if (!isLoading && !isAuthenticated) {
        router.replace("/sign-in");
      } else if (!isLoading) {
        setInitializing(false);
      }
    } catch (err) {
      console.error("Error during authentication check:", err);
      setError("An error occurred while checking authentication status. Please try refreshing the page.");
      setInitializing(false);
    }
  }, [isAuthenticated, isLoading, router]);

  // Handle ticker selection
  const handleAddTicker = (ticker: SelectedTicker) => {
    setSelectedTickers(prev => [...prev, ticker]);
  };

  const handleRemoveTicker = (tickerSymbol: string) => {
    setSelectedTickers(prev => prev.filter(ticker => ticker.symbol !== tickerSymbol));
  };

  // Handle filing type preferences
  const handleFilingTypeChange = (key: keyof FilingTypePreferences, value: boolean) => {
    setFilingTypes(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Handle content preferences
  const handleContentPreferenceChange = (key: keyof NotificationContentPreferences, value: boolean) => {
    setContentPreferences(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Handle UI preferences
  const handleThemeChange = (theme: UIPreferences['theme']) => {
    setUiPreferences(prev => ({
      ...prev,
      theme
    }));
  };

  const handleDashboardLayoutChange = (layout: UIPreferences['dashboardLayout']) => {
    setUiPreferences(prev => ({
      ...prev,
      dashboardLayout: layout
    }));
  };

  // Handle onboarding completion
  const handleCompleteOnboarding = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      // Save user preferences using server action
      const result = await saveUserPreferences({
        notifications: {
          emailFrequency,
          filingTypes,
          contentPreferences
        },
        ui: uiPreferences
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to save preferences');
      }

      // Add ticker subscriptions using server action
      for (const ticker of selectedTickers) {
        const subResult = await addTickerSubscription({
          symbol: ticker.symbol,
          companyName: ticker.companyName,
          overridePreferences: false
        });

        if (!subResult.success) {
          console.error(`Failed to subscribe to ${ticker.symbol}: ${subResult.error}`);
        }
      }

      toast.success('Onboarding completed successfully!');
      router.push('/dashboard');
    } catch (error) {
      console.error('Error completing onboarding:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      setError(errorMessage);
      toast.error('Failed to complete onboarding. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

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

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
              <p className="mb-6">{error}</p>
              <button 
                className="px-4 py-2 bg-primary text-white rounded-md"
                onClick={() => {
                  setError(null);
                  router.refresh();
                }}
              >
                Retry
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Define the steps for our multi-step form
  const steps = [
    {
      id: "user-profile",
      title: "Profile",
      description: "Tell us about yourself",
      component: (
        <UserProfileForm
          fullName={fullName}
          jobTitle={jobTitle}
          company={company}
          bio={bio}
          uiPreferences={uiPreferences}
          onNameChange={setFullName}
          onJobTitleChange={setJobTitle}
          onCompanyChange={setCompany}
          onBioChange={setBio}
          onThemeChange={handleThemeChange}
          onDashboardLayoutChange={handleDashboardLayoutChange}
        />
      )
    },
    {
      id: "ticker-selection",
      title: "Companies",
      description: "Select companies to track",
      component: (
        <TickerSelection
          selectedTickers={selectedTickers}
          onAddTicker={handleAddTicker}
          onRemoveTicker={handleRemoveTicker}
        />
      )
    },
    {
      id: "notification-preferences",
      title: "Notifications",
      description: "Set your notification preferences",
      component: (
        <NotificationPreferences
          emailFrequency={emailFrequency}
          filingTypes={filingTypes}
          contentPreferences={contentPreferences}
          onEmailFrequencyChange={setEmailFrequency}
          onFilingTypeChange={handleFilingTypeChange}
          onContentPreferenceChange={handleContentPreferenceChange}
        />
      )
    }
  ];

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardContent className="p-6">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">Welcome to tldrSEC</h2>
            <p className="text-muted-foreground">
              Let's set up your account to track SEC filings
            </p>
          </div>

          {isSubmitting ? (
            <div className="py-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p>Setting up your account...</p>
            </div>
          ) : (
            <MultiStepForm 
              steps={steps} 
              onComplete={handleCompleteOnboarding} 
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
} 