'use client';

import { Users } from 'lucide-react';

export function WaitlistCounter() {
  return (
    <div className="flex items-center justify-center gap-2 text-base text-fintech-text-secondary mt-8">
      <Users className="w-5 h-5 text-fintech-accent" />
      <span className="font-medium">
        Join 247+ investors already on the waitlist
      </span>
    </div>
  );
}