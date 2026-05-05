"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Confetti } from "@/components/ui/confetti";
import { updateTutorialProgress } from "@/components/onboarding/actions";

interface DashboardOnboardingProps {
  tutorialCompleted: boolean;
  subscriptionSuccess: boolean;
  sessionId?: string;
  subscriptionTier: "FREE" | "PRO" | "MAX";
}

/**
 * Handles first-visit confetti, subscription success toasts, and
 * background Stripe reconciliation. Extracted from DashboardClient
 * to keep these side effects separate from the data-streaming sections.
 */
export function DashboardOnboarding({
  tutorialCompleted,
  subscriptionSuccess,
  sessionId,
  subscriptionTier,
}: DashboardOnboardingProps) {
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiFiredRef = useRef(false);
  const isFirstVisit =
    !tutorialCompleted &&
    typeof window !== "undefined" &&
    localStorage.getItem("tutorialCompleted") !== "true";

  // Fire confetti on first visit
  useEffect(() => {
    if (!isFirstVisit || confettiFiredRef.current) return;

    const timer = setTimeout(() => {
      // Set the guard inside the timer (after cleanup window) so React 19
      // strict-mode dev double-invoke can reschedule on remount instead of
      // being blocked by a ref the cancelled first run already flipped.
      confettiFiredRef.current = true;
      setShowConfetti(true);

      updateTutorialProgress(100, {
        currentStep: 0,
        currentSubstep: 0,
        completed: true,
      }).catch((err) =>
        console.error("Failed to mark tutorial complete:", err)
      );

      localStorage.setItem("tutorialCompleted", "true");

      fetch("/api/onboarding?action=deliver-summaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch((err) =>
        console.error("Failed to deliver cached summaries:", err)
      );

      setTimeout(() => setShowConfetti(false), 4000);
    }, 500);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscription success toast
  useEffect(() => {
    if (subscriptionSuccess) {
      if (subscriptionTier === "FREE") {
        toast.loading("Verifying subscription...", {
          description:
            "Your payment was received. Activating your plan now.",
          duration: 4000,
        });
        const timer = setTimeout(() => window.location.reload(), 3000);
        return () => clearTimeout(timer);
      } else {
        toast.success("Welcome to your new plan!", {
          description:
            "Your subscription is now active. Start tracking more companies!",
          duration: 5000,
        });
      }
    }
  }, [subscriptionSuccess, subscriptionTier]);

  // Background Stripe reconciliation
  useEffect(() => {
    if (subscriptionTier !== "FREE") return;

    const reconcileInBackground = async () => {
      try {
        if (subscriptionSuccess && sessionId) {
          const res = await fetch("/api/user?type=verify-checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
          if (res?.ok) {
            const data = (await res.json()) as { reconciled?: boolean };
            if (data?.reconciled) window.location.reload();
          }
        } else {
          const lastReconcile = sessionStorage.getItem("lastReconcile");
          if (
            lastReconcile &&
            Date.now() - Number(lastReconcile) < 5 * 60 * 1000
          )
            return;
          sessionStorage.setItem("lastReconcile", String(Date.now()));

          const res = await fetch("/api/user?type=reconcile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          if (res?.ok) {
            const data = (await res.json()) as { reconciled?: boolean };
            if (data?.reconciled) window.location.reload();
          }
        }
      } catch {
        // Non-fatal: webhook will eventually sync
      }
    };

    reconcileInBackground();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Confetti active={showConfetti} duration={3000} />;
}
