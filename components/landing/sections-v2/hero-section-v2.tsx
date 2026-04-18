'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import {
  staggerContainer,
  staggerItem,
  meshGradientStyle,
} from '@/lib/animations/landing-animations';
import { HeroFilingCard } from './hero-filing-card';
import { useAuth } from '@/contexts/auth-context';
import { useAnalytics } from '@/lib/hooks/use-analytics';
import { EVENTS } from '@/lib/analytics/events';

/**
 * Trust metrics displayed in the hero section
 */
const trustMetrics = [
  { value: '10 min', label: 'filing-to-inbox' },
  { value: '99.9%', label: 'uptime' },
  { value: 'All types', label: 'of SEC filings' },
];

/**
 * Hero Section V2 Component
 *
 * Light theme hero with:
 * - Z-pattern two-column layout
 * - Animated mesh gradient background
 * - Trust metrics with icons
 * - Filing preview card (desktop only)
 * - Clear CTA hierarchy
 */
export function HeroSectionV2() {
  const { isSignedIn, isOnboarded } = useAuth();
  const { trackEvent } = useAnalytics();

  // Unauthenticated: go to sign-up. Signed in but not onboarded: go to onboarding. Onboarded: go to dashboard.
  const ctaHref = !isSignedIn ? '/sign-up' : !isOnboarded ? '/onboarding' : '/dashboard';
  const ctaLabel = !isSignedIn ? 'Start Free Trial' : !isOnboarded ? 'Complete Setup' : 'Go to Dashboard';

  const handlePrimaryCtaClick = () => {
    trackEvent(EVENTS.LANDING_CTA_CLICK, {
      cta_location: 'hero',
      cta_text: ctaLabel,
      variant: !isSignedIn ? 'signed_out' : !isOnboarded ? 'onboarding' : 'dashboard',
    });
  };

  return (
    <section
      className="relative min-h-[100vh] flex items-center overflow-hidden"
      style={meshGradientStyle}
    >
      {/* Subtle animated gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-60"
          style={{
            background: 'radial-gradient(circle, rgba(0, 121, 242, 0.15) 0%, transparent 70%)',
          }}
          animate={{
            x: [0, 30, 0],
            y: [0, -20, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full opacity-40"
          style={{
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 70%)',
          }}
          animate={{
            x: [0, -20, 0],
            y: [0, 30, 0],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Column - Content */}
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="text-center lg:text-left"
          >
            {/* Headline */}
            <motion.h1
              variants={staggerItem}
              className="brand-display mb-6"
            >
              SEC Filings,{' '}
              <span className="brand-gradient-text">Simplified</span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              variants={staggerItem}
              className="brand-body-large mb-8 max-w-xl mx-auto lg:mx-0"
            >
              Transform 300+ page regulatory documents into clear, actionable
              summaries delivered to your inbox in minutes.
            </motion.p>

            {/* Trust Metrics Row */}
            <motion.div
              variants={staggerItem}
              className="flex flex-wrap justify-center lg:justify-start gap-6 mb-8"
            >
              {trustMetrics.map((metric) => (
                <div key={metric.label} className="brand-metric">
                  <CheckCircle2 className="w-5 h-5 text-[var(--brand-success)]" />
                  <span className="brand-metric-value">{metric.value}</span>
                  <span className="brand-metric-label">{metric.label}</span>
                </div>
              ))}
            </motion.div>

            {/* CTAs */}
            <motion.div
              variants={staggerItem}
              className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-6"
            >
              <Link href={ctaHref} onClick={handlePrimaryCtaClick}>
                <Button className="brand-button-primary">
                  {ctaLabel}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="#pricing">
                <Button className="brand-button-outline">
                  View Pricing
                </Button>
              </Link>
            </motion.div>

            {/* Trust Signal */}
            <motion.p
              variants={staggerItem}
              className="brand-caption"
            >
              7-day free trial. Cancel anytime.
            </motion.p>
          </motion.div>

          {/* Right Column - Filing Preview Card */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="hidden lg:block"
          >
            <HeroFilingCard />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
