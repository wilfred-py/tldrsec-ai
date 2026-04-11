"use client";

import { CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ONBOARDING_STEPS } from "@/app/(auth)/onboarding/types";

interface VerticalProgressProps {
  currentStep: number; // 1-indexed
}

export function VerticalProgress({ currentStep }: VerticalProgressProps) {
  return (
    <nav
      aria-label="Onboarding progress"
      className="flex flex-col items-center sm:items-start gap-0"
    >
      {ONBOARDING_STEPS.map((step, index) => {
        const stepNum = index + 1;
        const isCompleted = currentStep > stepNum;
        const isActive = currentStep === stepNum;
        const isLast = index === ONBOARDING_STEPS.length - 1;

        return (
          <div key={step.key} className="flex flex-col items-center sm:items-start">
            <div className="flex items-center gap-3">
              {/* Step indicator dot */}
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-300",
                  isCompleted && "border-[var(--landing-primary)] bg-[var(--landing-primary)] text-white",
                  isActive && "border-[var(--landing-primary)] bg-[var(--landing-primary)]/10 text-[var(--landing-primary)]",
                  !isCompleted && !isActive && "border-gray-300 text-gray-400 dark:border-gray-600"
                )}
                aria-current={isActive ? "step" : undefined}
              >
                {isCompleted ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <span className="text-xs font-semibold">{stepNum}</span>
                )}
              </div>

              {/* Step label (hidden on mobile) */}
              <span
                className={cn(
                  "hidden sm:block text-sm transition-colors duration-300",
                  isActive && "font-semibold text-foreground",
                  isCompleted && "font-medium text-[var(--landing-primary)]",
                  !isCompleted && !isActive && "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connecting line */}
            {!isLast && (
              <div className="flex justify-center sm:justify-start sm:pl-[15px] w-8 sm:w-auto">
                <div
                  className={cn(
                    "h-8 w-0.5 transition-colors duration-300",
                    currentStep > stepNum ? "bg-[var(--landing-primary)]" : "bg-gray-200 dark:bg-gray-700"
                  )}
                />
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
