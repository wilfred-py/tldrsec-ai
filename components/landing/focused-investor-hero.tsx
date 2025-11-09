'use client';

import { WaitlistForm } from '@/components/waitlist/waitlist-form';

export function FocusedInvestorHero() {
  return (
    <main className="min-h-screen bg-white">
      <div className="container mx-auto px-4 py-24">
        <div className="max-w-2xl mx-auto text-center">
          
          {/* 64px whitespace built into py-24 */}
          
          {/* Headline - 42px, focused problem statement */}
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight mb-6">
            Skip the 100-page SEC filings, 
            the complex legal and financial jargon
          </h1>
          
          {/* Subheading - 18px, clear value prop for disciplined value investors */}
          <p className="text-lg md:text-xl text-gray-600 mb-12 leading-relaxed">
            Cut through the noise. Get clear insights on your portfolio of great businesses 
            with economic moats and enduring brands.
          </p>
          
          {/* 48px whitespace via mb-12 */}
          
          {/* Email Form - maintain existing functionality */}
          <div className="max-w-md mx-auto">
            <WaitlistForm />
          </div>
          
          {/* Trust line - accurate for disciplined value investors */}
          <p className="text-sm text-gray-500 mt-8">
            Join 247+ focused investors on the waitlist. 
          </p>
          
          {/* 96px whitespace via py-24 bottom padding */}
        </div>
      </div>
    </main>
  );
}