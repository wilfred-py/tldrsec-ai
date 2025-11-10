'use client';

import { WaitlistForm } from '@/components/waitlist/waitlist-form';
import { WaitlistCounter } from './waitlist-counter';
import { FloatingElements } from './floating-elements';
import { ProfessionalFooter } from './professional-footer';

export function FocusedInvestorHero() {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 bg-gradient-to-br from-white via-fintech-bg-subtle to-white relative overflow-hidden">
        <FloatingElements />
        
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22 width=%2232%22 height=%2232%22 fill=%22none%22 stroke=%22oklch(0.90 0.01 232)%22 stroke-width=%220.5%22%3E%3Cpath d=%22M0 .5H31.5V32%22/%3E%3C/svg%3E')] opacity-30"></div>
        
        <div className="container mx-auto px-4 py-32 relative">
          <div className="max-w-4xl mx-auto text-center">
            
            {/* Enhanced headline with improved spacing */}
            <h1 className="text-5xl md:text-6xl font-bold text-fintech-text-primary leading-tight mb-8 tracking-tight">
              Stop spending 10+ hours a week{' '}
              <span className="text-fintech-primary">reading SEC filings</span>
            </h1>
            
            {/* Enhanced subheading */}
            <p className="text-xl md:text-2xl text-fintech-text-secondary mb-16 leading-relaxed font-light max-w-3xl mx-auto">
              Get the insights you need to make informed buy, sell, or hold decisions.{' '}
              <span className="font-medium text-fintech-accent">AI-powered summaries of every filing</span>{' '}
              from companies in your portfolio, delivered to your inbox.
            </p>
            
            {/* Form section with enhanced spacing */}
            <div className="max-w-md mx-auto mb-12">
              <WaitlistForm />
            </div>
            
            <WaitlistCounter />
            
          </div>
        </div>
      </main>
      
      <ProfessionalFooter />
    </div>
  );
}