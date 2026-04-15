'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { viewportOnce } from '@/lib/animations/landing-animations';
import Link from 'next/link';

/**
 * Trust points displayed below the CTA
 * Reduces friction and builds confidence
 */
const trustPoints = [
  '7-day free trial',
  'Start with unlimited tickers',
  'Cancel anytime',
];

/**
 * CTA Section V2 Component
 *
 * Call-to-action section with:
 * - Light blue gradient background
 * - Single "Get Started" button
 * - Trust signals below CTA
 * - Pattern overlay for visual interest
 */
export function CTASectionV2() {
  return (
    <section
      className="py-24 relative overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, #F9FAFB 0%, #F0F7FF 40%, #FFFFFF 100%)',
      }}
    >
      {/* Subtle pattern overlay */}
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(0, 121, 242, 0.05) 1px, transparent 0)`,
          backgroundSize: '24px 24px',
        }}
      />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.5 }}
          className="max-w-2xl mx-auto text-center"
        >
          {/* Headline */}
          <h2 className="brand-heading mb-4">
            Start Monitoring SEC Filings Today
          </h2>

          <p className="brand-body mb-8">
            Join thousands of investors who save hours every week with AI-powered filing summaries.
          </p>

          {/* CTA Button */}
          <div className="mb-8">
            <Button asChild className="brand-button-primary">
              <Link href="/onboarding">
                Get Started
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
            </Button>
          </div>

          {/* Trust Points */}
          <div className="flex flex-wrap justify-center gap-6">
            {trustPoints.map((point) => (
              <div key={point} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[var(--brand-success)]" />
                <span className="brand-caption">{point}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
