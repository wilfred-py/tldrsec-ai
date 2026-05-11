'use client';

import { useState } from 'react';
import { WaitlistForm } from '@/components/waitlist/waitlist-form';
import { WaitlistCounter } from './waitlist-counter';
import { FloatingElements } from './floating-elements';
import { WAITLIST_HERO } from '@/lib/landing/copy';
// import { ProfessionalFooter } from './professional-footer';

interface FocusedInvestorHeroProps {
  baseCount?: number;  // Starting point for animation (yesterday's end-of-day)
  realCount?: number;  // Current real count (target for animation)
}

export function FocusedInvestorHero({ baseCount, realCount }: FocusedInvestorHeroProps) {
  const [hasSignedUp, setHasSignedUp] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 bg-gradient-to-br from-white via-fintech-bg-subtle to-white relative overflow-hidden">
        <FloatingElements />

        <div className="absolute inset-0 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22 width=%2232%22 height=%2232%22 fill=%22none%22 stroke=%22oklch(0.90 0.01 232)%22 stroke-width=%220.5%22%3E%3Cpath d=%22M0 .5H31.5V32%22/%3E%3C/svg%3E')] opacity-30"></div>

        <div className="container mx-auto px-4 py-32 relative">
          <div className="max-w-4xl mx-auto text-center">

            {/* Enhanced headline with improved spacing */}
            <h1 className="text-5xl md:text-6xl font-bold text-fintech-text-primary leading-tight mb-8 tracking-tight">
              {WAITLIST_HERO.h1.parts.map((part, i) =>
                part.highlight ? (
                  <span key={i} className="text-fintech-primary">{part.text}</span>
                ) : (
                  <span key={i}>{part.text}</span>
                )
              )}
            </h1>

            {/* Enhanced subheading */}
            <p className="text-xl md:text-2xl text-fintech-text-secondary mb-16 leading-relaxed font-light max-w-3xl mx-auto">
              {WAITLIST_HERO.subhead.parts.map((part, i) =>
                part.highlight ? (
                  <span key={i} className="font-medium text-fintech-accent">{part.text}</span>
                ) : (
                  <span key={i}>{part.text}</span>
                )
              )}
            </p>

            {/* Form section with enhanced spacing */}
            <div className="max-w-md mx-auto mb-12">
              <WaitlistForm onSuccess={() => setHasSignedUp(true)} />
            </div>

            <WaitlistCounter hideAfterSignup={true} userHasSignedUp={hasSignedUp} baseCount={baseCount} realCount={realCount} />
            
          </div>
        </div>
      </main>
      
      {/* <ProfessionalFooter /> */}
    </div>
  );
}