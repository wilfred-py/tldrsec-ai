"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@clerk/nextjs";
import { useAuthContext } from "@/lib/context/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle, ArrowRight, Building2, Cpu, Heart, Car, ShoppingCart, Zap, Home, Banknote, Search, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { NotificationPreference } from "@/lib/email/notification-types";
import { 
  FilingTypePreferences, 
  NotificationContentPreferences,
  UIPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_UI_PREFERENCES
} from "@/lib/user/preference-types";
import { completeOnboardingBatched } from "./actions";

// Define sectors with their icons and descriptions
const sectors = [
  {
    id: "technology",
    name: "Technology",
    icon: Cpu,
    description: "Software, hardware, and tech services",
    color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  },
  {
    id: "healthcare",
    name: "Healthcare",
    icon: Heart,
    description: "Pharmaceuticals, biotech, and medical devices",
    color: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  },
  {
    id: "financial",
    name: "Financial Services",
    icon: Banknote,
    description: "Banks, insurance, and investment firms",
    color: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
  },
  {
    id: "automotive",
    name: "Automotive",
    icon: Car,
    description: "Auto manufacturers and suppliers",
    color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  },
  {
    id: "consumer",
    name: "Consumer Goods",
    icon: ShoppingCart,
    description: "Retail, food, and consumer products",
    color: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  },
  {
    id: "energy",
    name: "Energy",
    icon: Zap,
    description: "Oil, gas, and renewable energy",
    color: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  },
  {
    id: "realestate",
    name: "Real Estate",
    icon: Home,
    description: "REITs and property companies",
    color: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950 dark:text-teal-300 dark:border-teal-800",
  },
  {
    id: "industrial",
    name: "Industrial",
    icon: Building2,
    description: "Manufacturing and industrial services",
    color: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-950 dark:text-gray-300 dark:border-gray-800",
  },
];

// Sample equities by sector for the reference implementation
// In production, this would be fetched from an API
const equitiesBySector = {
  technology: [
    { symbol: "AAPL", name: "Apple Inc." },
    { symbol: "MSFT", name: "Microsoft Corporation" },
    { symbol: "GOOGL", name: "Alphabet Inc." },
    { symbol: "AMZN", name: "Amazon.com Inc." },
    { symbol: "META", name: "Meta Platforms Inc." },
  ],
  healthcare: [
    { symbol: "JNJ", name: "Johnson & Johnson" },
    { symbol: "PFE", name: "Pfizer Inc." },
    { symbol: "UNH", name: "UnitedHealth Group" },
    { symbol: "ABBV", name: "AbbVie Inc." },
    { symbol: "TMO", name: "Thermo Fisher Scientific" },
  ],
  financial: [
    { symbol: "JPM", name: "JPMorgan Chase & Co." },
    { symbol: "BAC", name: "Bank of America Corp" },
    { symbol: "WFC", name: "Wells Fargo & Company" },
    { symbol: "GS", name: "Goldman Sachs Group" },
    { symbol: "MS", name: "Morgan Stanley" },
  ],
  automotive: [
    { symbol: "TSLA", name: "Tesla Inc." },
    { symbol: "F", name: "Ford Motor Company" },
    { symbol: "GM", name: "General Motors Company" },
    { symbol: "TM", name: "Toyota Motor Corporation" },
    { symbol: "HMC", name: "Honda Motor Co." },
  ],
  consumer: [
    { symbol: "WMT", name: "Walmart Inc." },
    { symbol: "PG", name: "Procter & Gamble" },
    { symbol: "KO", name: "Coca-Cola Company" },
    { symbol: "PEP", name: "PepsiCo Inc." },
    { symbol: "COST", name: "Costco Wholesale" },
  ],
  energy: [
    { symbol: "XOM", name: "Exxon Mobil Corporation" },
    { symbol: "CVX", name: "Chevron Corporation" },
    { symbol: "COP", name: "ConocoPhillips" },
    { symbol: "EOG", name: "EOG Resources" },
    { symbol: "SLB", name: "Schlumberger Limited" },
  ],
  realestate: [
    { symbol: "AMT", name: "American Tower Corporation" },
    { symbol: "PLD", name: "Prologis Inc." },
    { symbol: "CCI", name: "Crown Castle Inc." },
    { symbol: "EQIX", name: "Equinix Inc." },
    { symbol: "SPG", name: "Simon Property Group" },
  ],
  industrial: [
    { symbol: "BA", name: "Boeing Company" },
    { symbol: "CAT", name: "Caterpillar Inc." },
    { symbol: "HON", name: "Honeywell International" },
    { symbol: "UPS", name: "United Parcel Service" },
    { symbol: "LMT", name: "Lockheed Martin Corporation" },
  ],
};

export default function OnboardingPage() {
  const { isLoading, userName } = useAuthContext();
  const { session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New state for the simplified onboarding flow
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedEquities, setSelectedEquities] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isTransitioning, setIsTransitioning] = useState(false);

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

  // Initialize with user's name if available
  useEffect(() => {
    if (userName) {
      // Set any user-specific initial values
    }
  }, [userName]);

  // Initialize page state once auth context is loaded
  // Note: Onboarding now requires authentication (auth-first flow)
  useEffect(() => {
    try {
      if (!isLoading) {
        setInitializing(false);
      }
    } catch (err) {
      console.error("Error during initialization:", err);
      setError("An error occurred while loading. Please try refreshing the page.");
      setInitializing(false);
    }
  }, [isLoading]);

  // Calculate progress based on current step and selections (2-step flow)
  const calculateProgress = () => {
    if (currentStep === 1) {
      // Step 1: 0% if no sectors selected, 50% if at least one sector is selected
      return selectedSectors.length > 0 ? 50 : 0;
    } else {
      // Step 2: 50% base + 50% if at least one company is selected = 100%
      return 50 + (selectedEquities.length > 0 ? 50 : 0);
    }
  };

  const progress = calculateProgress();

  // Handle sector selection
  const handleSectorToggle = (sectorId: string) => {
    setSelectedSectors((prev) => 
      prev.includes(sectorId) ? prev.filter((id) => id !== sectorId) : [...prev, sectorId]
    );
  };

  // Handle equity selection
  const handleEquityToggle = (symbol: string) => {
    setSelectedEquities((prev) => {
      if (prev.includes(symbol)) {
        return prev.filter((s) => s !== symbol);
      }
      if (prev.length < 5) {
        return [...prev, symbol];
      }
      return prev;
    });
  };

  // Get available equities based on selected sectors and search query
  const getAvailableEquities = () => {
    if (selectedSectors.length === 0) return [];

    const allEquities = selectedSectors.flatMap((sectorId) => equitiesBySector[sectorId as keyof typeof equitiesBySector] || []);
    const uniqueEquities = allEquities.filter(
      (equity, index, self) => index === self.findIndex((e) => e.symbol === equity.symbol)
    );

    if (searchQuery) {
      return uniqueEquities.filter(
        (equity) =>
          equity.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
          equity.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return uniqueEquities;
  };

  // Handle next button click
  const handleNext = () => {
    if (currentStep === 1) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStep(2);
        setIsTransitioning(false);
      }, 300);
    } else if (currentStep === 2) {
      // Step 2 is now the final step - complete onboarding
      handleCompleteOnboarding();
    }
  };

  // Handle back button click
  const handleBack = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStep(currentStep - 1);
      setIsTransitioning(false);
    }, 300);
  };

  // Handle onboarding completion - OPTIMIZED with single batched server action
  const handleCompleteOnboarding = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      // Format selected tickers for saving
      const formattedTickers = getAvailableEquities()
        .filter(equity => selectedEquities.includes(equity.symbol))
        .map(equity => ({
          symbol: equity.symbol,
          companyName: equity.name
        }));

      // Single batched server action replaces 3+ sequential calls
      // This reduces: ~15 Clerk API calls + ~15 DB queries → 2 Clerk + 1 DB transaction
      const result = await completeOnboardingBatched({
        preferences: {
          notifications: {
            emailFrequency,
            filingTypes,
            contentPreferences
          },
          ui: uiPreferences
        },
        tickers: formattedTickers
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to complete onboarding');
      }

      toast.success('Onboarding completed successfully!');

      // CRITICAL: Force Clerk session refresh to get updated publicMetadata
      // This prevents the middleware race condition where stale session claims
      // cause redirect back to /onboarding
      if (session) {
        try {
          await session.reload();
        } catch (reloadError) {
          console.warn('Session reload failed, continuing with navigation:', reloadError);
        }
      }

      // Set a temporary cookie to bypass middleware check during redirect
      // This handles the race condition where Clerk's JWT hasn't refreshed yet
      document.cookie = 'onboarding_completed=true; path=/; max-age=60; SameSite=Lax';

      // Use hard navigation to ensure fresh middleware evaluation with new session
      // router.push() uses client-side navigation which may use cached session claims
      // Forward subscription_success param so dashboard can show sync indicator
      const subscriptionSuccess = searchParams.get('subscription_success');
      const dashboardUrl = subscriptionSuccess ? '/dashboard?subscription_success=true' : '/dashboard';
      window.location.href = dashboardUrl;
    } catch (error) {
      console.error('Error completing onboarding:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      setError(errorMessage);
      toast.error('Failed to complete onboarding. Please try again.');
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
              <Button 
                onClick={() => {
                  setError(null);
                  router.refresh();
                }}
              >
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSubmitting) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Setting up your account...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-4xl">
          {/* Header */}
          <div className="mb-8 text-center">

            <h1 className="mt-10 mb-2 text-2xl font-bold">Welcome to tldrSEC!</h1>
            <p className="text-muted-foreground">Let&apos;s personalize your experience in just 2 quick steps.</p>
          </div>

          {/* Progress */}
          <div className="mb-8">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">Step {currentStep} of 2</span>
              <span className="text-muted-foreground">{Math.round(progress)}% complete</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Step Container with Transition */}
          <div className="relative overflow-hidden">
            <div
              className={`transition-all duration-300 ease-in-out ${
                isTransitioning ? "translate-x-[-100%] opacity-0" : "translate-x-0 opacity-100"
              }`}
            >
              {/* Step 1: Sector Selection */}
              {currentStep === 1 && (
                <Card className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <div className="text-center mb-6">
                      <h2 className="text-xl font-bold">What sectors interest you?</h2>
                      <p className="text-muted-foreground">
                        Select the industries you&apos;d like to track. You can always change this later.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      {sectors.map((sector) => {
                        const Icon = sector.icon;
                        const isSelected = selectedSectors.includes(sector.id);
                        return (
                          <div
                            key={sector.id}
                            className={`cursor-pointer rounded-lg border-2 p-4 transition-all hover:shadow-md ${
                              isSelected
                                ? "border-primary bg-primary/10 shadow-md"
                                : "border-gray-200 hover:border-primary/50 dark:border-gray-700"
                            }`}
                            onClick={() => handleSectorToggle(sector.id)}
                          >
                            <div className="flex flex-col items-center text-center">
                              <div
                                className={`mb-3 flex h-12 w-12 items-center justify-center rounded-lg border ${sector.color}`}
                              >
                                <Icon className="h-6 w-6" />
                              </div>
                              <h3 className="mb-1 font-medium">{sector.name}</h3>
                              <p className="mb-6 text-xs text-muted-foreground">{sector.description}</p>
                              <div className="h-5 flex items-center justify-center">
                                {isSelected && <CheckCircle className="h-5 w-5 text-primary" />}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="mt-8 flex items-center justify-between">
                      <div></div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">
                          {selectedSectors.length} sector{selectedSectors.length !== 1 ? "s" : ""} selected
                        </span>
                        <Button onClick={handleNext} disabled={selectedSectors.length === 0}>
                          Continue
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}


              {/* Step 2: Equity Selection */}
              {currentStep === 2 && (
                <Card className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <div className="text-center mb-6">
                      <h2 className="text-xl font-bold">Choose your first companies</h2>
                      <p className="text-muted-foreground">
                        Select up to 5 companies to start tracking. Based on your selected sectors.
                      </p>
                    </div>

                    {/* Search */}
                    <div className="relative mb-6">
                      <Input
                        placeholder="Search companies..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>

                    {/* Selected Sectors */}
                    <div className="mb-6">
                      <h3 className="mb-2 text-sm font-medium">Selected Sectors:</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedSectors.map((sectorId) => {
                          const sector = sectors.find((s) => s.id === sectorId);
                          return (
                            <Badge key={sectorId} variant="secondary">
                              {sector?.name}
                            </Badge>
                          )
                        })}
                      </div>
                    </div>

                    {/* Equity Grid */}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {getAvailableEquities().map((equity) => {
                        const isSelected = selectedEquities.includes(equity.symbol);
                        const isDisabled = !isSelected && selectedEquities.length >= 5;
                        return (
                          <div
                            key={equity.symbol}
                            className={`cursor-pointer rounded-lg border p-3 transition-all ${
                              isSelected
                                ? "border-primary bg-primary/10 shadow-sm"
                                : isDisabled
                                  ? "border-gray-200 bg-muted/50 opacity-50 dark:border-gray-700"
                                  : "border-gray-200 hover:border-primary/50 hover:shadow-sm dark:border-gray-700"
                            }`}
                            onClick={() => !isDisabled && handleEquityToggle(equity.symbol)}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">{equity.symbol}</div>
                                <div className="text-sm text-muted-foreground">{equity.name}</div>
                              </div>
                              {isSelected && <CheckCircle className="h-5 w-5 text-primary" />}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {getAvailableEquities().length === 0 && (
                      <div className="py-8 text-center text-muted-foreground">
                        {selectedSectors.length === 0
                          ? "Please select at least one sector to see available companies."
                          : searchQuery
                            ? "No companies found matching your search."
                            : "No companies available for selected sectors."}
                      </div>
                    )}

                    <div className="mt-8 flex items-center justify-between">
                      <Button variant="outline" onClick={handleBack}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back
                      </Button>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">
                          {selectedEquities.length} of 5 companies selected
                        </span>
                        <Button onClick={handleNext} disabled={selectedEquities.length === 0}>
                          Complete Setup
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}


            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 