"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "@/lib/context/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function OnboardingPage() {
  const { isAuthenticated, isLoading, userName } = useAuthContext();
  const router = useRouter();
  const [initializing, setInitializing] = useState(true);

  // Protect this route
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/sign-in");
    } else if (!isLoading) {
      setInitializing(false);
    }
  }, [isAuthenticated, isLoading, router]);

  // Mock function to handle completion of onboarding
  const handleCompleteOnboarding = () => {
    // In a real app, you would save onboarding data to the database
    router.push("/dashboard");
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

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome to tldrSEC, {userName}!</CardTitle>
          <CardDescription>
            Let's get you set up to track SEC filings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <p className="mb-4">
              This is a placeholder for the multi-step onboarding process. 
              In a complete implementation, you would:
            </p>
            <ul className="list-disc text-left ml-8 mb-6">
              <li>Select the tickers you want to track</li>
              <li>Choose your notification preferences</li>
              <li>Set up your user profile</li>
              <li>Select your subscription plan</li>
            </ul>
          </div>
          
          <Button 
            onClick={handleCompleteOnboarding} 
            className="w-full"
          >
            Complete Setup
          </Button>
        </CardContent>
      </Card>
    </div>
  );
} 