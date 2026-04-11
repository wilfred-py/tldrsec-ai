'use client';

import { SignUp, useSignUp } from "@clerk/nextjs";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335" />
    </svg>
  );
}

function SkeletonBar({ className }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-md bg-gray-200 ${className ?? ''}`}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-gray-300/60 to-transparent" />
    </div>
  );
}

function SignUpSkeleton() {
  return (
    <div className="w-[400px] rounded-xl border border-gray-200 bg-white p-8 shadow-sm space-y-6">
      {/* Header */}
      <div className="space-y-2 text-center">
        <SkeletonBar className="h-7 w-40 mx-auto" />
        <SkeletonBar className="h-4 w-56 mx-auto" />
      </div>

      {/* Google button placeholder */}
      <SkeletonBar className="h-10 w-full rounded-lg" />

      {/* Divider */}
      <div className="flex items-center gap-3">
        <SkeletonBar className="h-px flex-1" />
        <SkeletonBar className="h-4 w-6" />
        <SkeletonBar className="h-px flex-1" />
      </div>

      {/* Email field */}
      <div className="space-y-2">
        <SkeletonBar className="h-4 w-24" />
        <SkeletonBar className="h-10 w-full rounded-lg" />
      </div>

      {/* Password field */}
      <div className="space-y-2">
        <SkeletonBar className="h-4 w-20" />
        <SkeletonBar className="h-10 w-full rounded-lg" />
      </div>

      {/* Submit button */}
      <SkeletonBar className="h-10 w-full rounded-lg" />

      {/* Footer link */}
      <SkeletonBar className="h-4 w-48 mx-auto" />
    </div>
  );
}

export default function SignUpPage() {
  const [clerkLoaded, setClerkLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const { signUp, isLoaded } = useSignUp();

  // Capture plan intent from campaign emails (e.g., ?plan=pro&ref=campaign)
  useEffect(() => {
    const plan = searchParams.get('plan');
    const ref = searchParams.get('ref');
    if (plan) {
      document.cookie = `signup_plan=${plan};path=/;max-age=3600;SameSite=Lax`;
    }
    if (ref) {
      document.cookie = `signup_ref=${ref};path=/;max-age=3600;SameSite=Lax`;
    }
  }, [searchParams]);

  const checkClerkContent = useCallback(() => {
    const el = containerRef.current;
    if (!el) return false;
    // Clerk renders its form inside a div with content - check for meaningful child content
    return el.querySelector('.cl-signUp-root, .cl-rootBox, .cl-card') !== null;
  }, []);

  useEffect(() => {
    if (checkClerkContent()) {
      setClerkLoaded(true);
      return;
    }

    const observer = new MutationObserver(() => {
      if (checkClerkContent()) {
        setClerkLoaded(true);
        observer.disconnect();
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current, { childList: true, subtree: true });
    }

    return () => observer.disconnect();
  }, [checkClerkContent]);

  const [loading, setLoading] = useState(false);

  const handleGoogleSignUp = async () => {
    if (!signUp || loading) return;
    try {
      setError(null);
      setLoading(true);
      await signUp.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sign-up/sso-callback',
        redirectUrlComplete: '/onboarding',
        oidcPrompt: 'select_account',
      });
    } catch {
      setLoading(false);
      setError('Unable to connect to Google. Please try again.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-[400px] space-y-4">
        {error && (
          <p className="text-sm text-red-600 text-center">{error}</p>
        )}
        <button
          onClick={handleGoogleSignUp}
          disabled={!isLoaded || loading}
          className="w-full flex items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <GoogleIcon />
          Continue with Google
        </button>
        {!clerkLoaded && <SignUpSkeleton />}
        <div ref={containerRef} className={clerkLoaded ? '' : 'absolute opacity-0 pointer-events-none'}>
          <SignUp
            appearance={{
              elements: {
                socialButtons: { display: 'none' },
                dividerRow: { display: 'none' },
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
