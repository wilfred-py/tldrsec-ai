'use client';

import { Users } from 'lucide-react';

interface WaitlistCounterProps {
  hideAfterSignup?: boolean;
  userHasSignedUp?: boolean;
}

export function WaitlistCounter({ hideAfterSignup = false, userHasSignedUp = false }: WaitlistCounterProps) {
  // Only render if not signed up or hideAfterSignup is false
  if (hideAfterSignup && userHasSignedUp) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-2 text-base text-fintech-text-secondary mt-8">
      <Users className="w-5 h-5 text-fintech-accent" />
      <span className="font-medium">
        Join investors already on the waitlist
      </span>
    </div>
  );
}