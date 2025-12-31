'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import {
  staggerContainer,
  staggerItem,
  meshGradientStyle,
} from '@/lib/animations/landing-animations';
import { HeroFilingCard } from './hero-filing-card';

/**
 * Trust metrics displayed in the hero section
 * Quantified social proof to build credibility
 */
const trustMetrics = [
  { value: '2,500+', label: 'investors' },
  { value: '99.9%', label: 'uptime' },
  { value: '<5 min', label: 'delivery' },
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
            {/* Badge */}
            <motion.div variants={staggerItem}>
              <Badge className="landing-badge mb-6">
                <Sparkles className="w-4 h-4 mr-2" />
                AI-Powered SEC Intelligence
              </Badge>
            </motion.div>

            {/* Headline */}
            <motion.h1
              variants={staggerItem}
              className="landing-display mb-6"
            >
              SEC Filings,{' '}
              <span className="landing-gradient-text">Simplified</span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              variants={staggerItem}
              className="landing-body-large mb-8 max-w-xl mx-auto lg:mx-0"
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
                <div key={metric.label} className="landing-metric">
                  <CheckCircle2 className="w-5 h-5 text-[var(--landing-success)]" />
                  <span className="landing-metric-value">{metric.value}</span>
                  <span className="landing-metric-label">{metric.label}</span>
                </div>
              ))}
            </motion.div>

            {/* CTAs */}
            <motion.div
              variants={staggerItem}
              className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-6"
            >
              <Link href="/onboarding">
                <Button className="landing-button-gradient">
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="#pricing">
                <Button className="landing-button-outline">
                  View Pricing
                </Button>
              </Link>
            </motion.div>

            {/* Trust Signal */}
            <motion.p
              variants={staggerItem}
              className="landing-caption"
            >
              No credit card required. Cancel anytime.
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
