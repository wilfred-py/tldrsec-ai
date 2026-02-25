'use client';

import { SignUp } from "@clerk/nextjs";
import { useState, useEffect, useRef, useCallback } from "react";

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

      {/* Social buttons */}
      <div className="space-y-3">
        <SkeletonBar className="h-10 w-full rounded-lg" />
        <SkeletonBar className="h-10 w-full rounded-lg" />
      </div>

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
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      {!clerkLoaded && <SignUpSkeleton />}
      <div ref={containerRef} className={clerkLoaded ? '' : 'absolute opacity-0 pointer-events-none'}>
        <SignUp />
      </div>
    </div>
  );
} 