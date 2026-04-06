"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const ROLES = [
  { id: "personal-investor", label: "Personal / Retail Investor" },
  { id: "professional-investor", label: "Professional / Institutional Investor" },
  { id: "investment-analyst", label: "Investment Analyst" },
  { id: "financial-advisor", label: "Financial Advisor / Wealth Manager" },
  { id: "c-suite", label: "C-Suite Executive (CEO, CFO, CIO)" },
  { id: "compliance-legal", label: "Compliance / Legal Professional" },
  { id: "academic-researcher", label: "Academic / Researcher" },
  { id: "other", label: "Other" },
] as const;

const AUM_BRACKETS = [
  { id: "under-100k", label: "Under $100K" },
  { id: "100k-500k", label: "$100K - $500K" },
  { id: "500k-1m", label: "$500K - $1M" },
  { id: "1m-5m", label: "$1M - $5M" },
  { id: "5m-25m", label: "$5M - $25M" },
  { id: "25m-100m", label: "$25M - $100M" },
  { id: "100m-plus", label: "$100M+" },
  { id: "prefer-not-to-say", label: "Prefer not to say" },
] as const;

export type UserRole = (typeof ROLES)[number]["id"];
export type AumBracket = (typeof AUM_BRACKETS)[number]["id"];

interface ProfileStepProps {
  onComplete: (profile: { role: UserRole; aumBracket?: AumBracket }) => void;
  onBack: () => void;
  isSubmitting: boolean;
  isTransitioning: boolean;
}

export function ProfileStep({ onComplete, onBack, isSubmitting, isTransitioning }: ProfileStepProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [selectedAum, setSelectedAum] = useState<AumBracket | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const handleComplete = () => {
    if (!selectedRole) return;
    onComplete({
      role: selectedRole,
      aumBracket: selectedAum ?? undefined,
    });
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="p-6">
        <div className="text-center mb-8">
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">
            Tell us about yourself
          </h2>
          <p className="text-muted-foreground">
            Help us personalize your experience. This takes 30 seconds.
          </p>
        </div>

        {/* Question 1: Role */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold mb-3 text-foreground">
            What best describes your role?
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ROLES.map((role) => {
              const isSelected = selectedRole === role.id;
              return (
                <button
                  key={role.id}
                  type="button"
                  aria-pressed={isSelected}
                  className={`text-left rounded-lg border px-4 py-3 text-sm transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10 font-medium"
                      : "border-gray-200 hover:border-primary/50 dark:border-gray-700"
                  }`}
                  onClick={() => setSelectedRole(role.id)}
                >
                  <div className="flex items-center justify-between">
                    <span>{role.label}</span>
                    {isSelected && <CheckCircle className="h-4 w-4 text-primary shrink-0 ml-2" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Question 2: AUM */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold mb-1 text-foreground">
            What&apos;s your approximate AUM or portfolio size?
          </h3>
          <p className="text-xs text-muted-foreground mb-3">Optional</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {AUM_BRACKETS.map((bracket) => {
              const isSelected = selectedAum === bracket.id;
              return (
                <button
                  key={bracket.id}
                  type="button"
                  aria-pressed={isSelected}
                  className={`text-center rounded-lg border px-3 py-2.5 text-sm transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10 font-medium"
                      : "border-gray-200 hover:border-primary/50 dark:border-gray-700"
                  }`}
                  onClick={() => setSelectedAum(isSelected ? null : bracket.id)}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>{bracket.label}</span>
                    {isSelected && <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={onBack} disabled={isTransitioning || isSubmitting}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={handleComplete}
            disabled={!selectedRole || isSubmitting || isTransitioning}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                Complete Setup
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
