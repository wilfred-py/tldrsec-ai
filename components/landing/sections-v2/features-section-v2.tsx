'use client';

import { motion } from 'framer-motion';
import {
  Clock,
  Bell,
  Zap,
  FileSearch,
  Shield,
  Timer
} from 'lucide-react';
import {
  staggerContainer,
  staggerItem,
  viewportOnce,
} from '@/lib/animations/landing-animations';

/**
 * Feature list with icons and descriptions
 * Highlights core value propositions
 */
const features = [
  {
    icon: Clock,
    title: '300+ Pages → 2 Minutes',
    description: 'Our AI distills lengthy SEC filings into clear, actionable summaries you can read in minutes.',
  },
  {
    icon: Bell,
    title: 'Real-Time Monitoring',
    description: 'Get notified the moment a company you track files with the SEC. Never miss critical updates.',
  },
  {
    icon: Zap,
    title: 'Smart Notifications',
    description: 'Customize alerts by filing type, company, or keywords. Only get what matters to you.',
  },
  {
    icon: FileSearch,
    title: 'Filing-Type Analysis',
    description: 'Specialized parsing for 10-K, 10-Q, 8-K, Form 4, and more. Each format handled with precision.',
  },
  {
    icon: Shield,
    title: 'Investment-Grade Quality',
    description: 'Summaries reviewed for accuracy with source citations. Trust the insights you receive.',
  },
  {
    icon: Timer,
    title: 'Save 10+ Hours Weekly',
    description: 'Stop spending weekends reading filings. Get back your time for actual analysis.',
  },
];

/**
 * Features Section V2 Component
 *
 * Clean white background with:
 * - Section heading with subheadline
 * - 3-column grid of feature cards
 * - Staggered scroll-triggered animations
 * - Hover effects on cards
 */
export function FeaturesSectionV2() {
  return (
    <section className="py-24 bg-white" id="features">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="landing-heading mb-4">
            Built for Modern Investors
          </h2>
          <p className="landing-body max-w-2xl mx-auto">
            Everything you need to stay informed about the companies you care about.
          </p>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={viewportOnce}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto"
        >
          {features.map((feature) => (
            <motion.article
              key={feature.title}
              variants={staggerItem}
              className="landing-card group"
            >
              {/* Icon */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110"
                style={{ backgroundColor: 'var(--landing-primary-light)' }}
              >
                <feature.icon className="w-6 h-6 text-[var(--landing-primary)]" />
              </div>

              {/* Title */}
              <h3
                className="text-lg font-semibold mb-2"
                style={{ color: 'var(--landing-secondary)' }}
              >
                {feature.title}
              </h3>

              {/* Description */}
              <p className="landing-body text-sm">
                {feature.description}
              </p>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
