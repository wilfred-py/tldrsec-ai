"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const ROLES = [
  { id: "personal-investor", label: "Personal / Retail Investor" },
  { id: "professional-investor", label: "Professional / Institutional Investor" },
  { id: "financial-advisor", label: "Financial Advisor / Wealth Manager" },
  { id: "compliance-legal", label: "Compliance / Legal Professional" },
  { id: "academic-researcher", label: "Academic / Researcher" },
  { id: "other", label: "Other" },
] as const;

const AUM_BRACKETS = [
  { id: "under-100k", label: "Under $100K" },
  { id: "100k-500k", label: "$100K - $500K" },
  { id: "500k-1m", label: "$500K - $1M" },
  { id: "1m-5m", label: "$1M - $5M" },
  { id: "5m-plus", label: "$5M+" },
] as const;

export type UserRole = (typeof ROLES)[number]["id"];
export type AumBracket = (typeof AUM_BRACKETS)[number]["id"];

export type ProfileSubStep = 1 | 2;

interface ProfileStepProps {
  subStep: ProfileSubStep;
  onSubStepChange: (step: ProfileSubStep) => void;
  selectedRole: UserRole | null;
  onRoleChange: (role: UserRole | null) => void;
  customRoleText: string;
  onCustomRoleChange: (text: string) => void;
  selectedAum: AumBracket | null;
  onAumChange: (aum: AumBracket | null) => void;
  onComplete: (profile: { role: UserRole; aumBracket?: AumBracket; customRoleText?: string }) => void;
  onBack: () => void;
  isSubmitting: boolean;
  isTransitioning: boolean;
  /** When present (Variant B), renders below AUM radios, above footer. */
  inlineDisclosure?: ReactNode;
}

export function ProfileStep({
  subStep,
  onSubStepChange,
  selectedRole,
  onRoleChange,
  customRoleText,
  onCustomRoleChange,
  selectedAum,
  onAumChange,
  onComplete,
  onBack,
  isSubmitting,
  isTransitioning,
  inlineDisclosure,
}: ProfileStepProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  const canAdvanceFromRole =
    selectedRole !== null &&
    (selectedRole !== "other" || customRoleText.trim().length > 0);

  const advanceToAum = useCallback(() => {
    if (canAdvanceFromRole) onSubStepChange(2);
  }, [canAdvanceFromRole, onSubStepChange]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [subStep]);

  // Enter key advances from question 1 to question 2
  useEffect(() => {
    if (subStep !== 1) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && canAdvanceFromRole) {
        e.preventDefault();
        advanceToAum();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [subStep, canAdvanceFromRole, advanceToAum]);

  const handleRoleSelect = (roleId: UserRole) => {
    if (roleId === "other") {
      onRoleChange(roleId);
      return;
    }
    onRoleChange(roleId);
    onCustomRoleChange("");
  };

  const handleComplete = () => {
    if (!selectedRole) return;
    onComplete({
      role: selectedRole,
      aumBracket: selectedAum ?? undefined,
      customRoleText: selectedRole === "other" ? customRoleText : undefined,
    });
  };

  const handleBack = () => {
    if (subStep === 2) {
      onSubStepChange(1);
    } else {
      onBack();
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardContent className="flex flex-col p-6" style={{ height: "calc(100vh - 120px)", maxHeight: "700px" }}>
        <div className="text-center mb-8">
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">
            Tell us about yourself
          </h2>
          <p className="text-muted-foreground">
            We&apos;ll tailor your filing alerts and summaries to what matters most to you.
          </p>
        </div>

        {/* Content area */}
        <div className="flex-1 min-h-0 relative overflow-hidden">
          <div className="motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-in-out translate-x-0 opacity-100">
            {subStep === 1 && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold mb-3 text-foreground">
                  What best describes your role?
                </h3>
                <div className="flex flex-col gap-2">
                  {ROLES.map((role) => {
                    const isSelected = selectedRole === role.id;
                    const isOtherWithInput = role.id === "other" && isSelected;

                    if (isOtherWithInput) {
                      return (
                        <div
                          key={role.id}
                          className="rounded-lg border border-primary bg-primary/10 px-4 py-3"
                        >
                          <Input
                            placeholder="Tell us your role..."
                            value={customRoleText}
                            onChange={(e) => onCustomRoleChange(e.target.value)}
                            className="border-0 bg-transparent p-0 h-auto text-sm font-medium focus-visible:ring-0 placeholder:text-muted-foreground/60"
                            autoFocus
                          />
                        </div>
                      );
                    }

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
                        onClick={() => handleRoleSelect(role.id)}
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
            )}

            {subStep === 2 && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold mb-3 text-foreground">
                  What&apos;s your approximate AUM or portfolio size?
                </h3>
                <div className="flex flex-col gap-2">
                  {AUM_BRACKETS.map((bracket) => {
                    const isSelected = selectedAum === bracket.id;
                    return (
                      <button
                        key={bracket.id}
                        type="button"
                        aria-pressed={isSelected}
                        className={`text-left rounded-lg border px-4 py-3 text-sm transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 font-medium"
                            : "border-gray-200 hover:border-primary/50 dark:border-gray-700"
                        }`}
                        onClick={() => onAumChange(isSelected ? null : bracket.id)}
                      >
                        <div className="flex items-center justify-between">
                          <span>{bracket.label}</span>
                          {isSelected && <CheckCircle className="h-3.5 w-3.5 text-primary shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {inlineDisclosure}
              </div>
            )}
          </div>
        </div>

        {/* Footer — stable position */}
        <div className="mt-auto pt-4 flex items-center justify-between">
          <Button variant="ghost" onClick={handleBack} disabled={isTransitioning || isSubmitting}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          {subStep === 1 && (
            <Button onClick={advanceToAum} disabled={!canAdvanceFromRole}>
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}

          {subStep === 2 && (
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
          )}
        </div>
      </CardContent>
    </Card>
  );
}
