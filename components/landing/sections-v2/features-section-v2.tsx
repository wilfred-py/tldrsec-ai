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
import { FEATURES_SECTION } from '@/lib/landing/copy';

/**
 * Feature list with icons and descriptions.
 * Copy lives in lib/landing/copy.ts; icons stay here (component-level concern).
 */
const featureIcons = [Clock, Bell, Zap, FileSearch, Shield, Timer];
const features = FEATURES_SECTION.cards.map((card, i) => ({
  ...card,
  icon: featureIcons[i],
}));

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
          <h2 className="brand-heading mb-4">
            {FEATURES_SECTION.heading}
          </h2>
          <p className="brand-body max-w-2xl mx-auto">
            {FEATURES_SECTION.subhead}
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
              className="brand-card group"
            >
              {/* Icon */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110"
                style={{ backgroundColor: 'var(--brand-primary-light)' }}
              >
                <feature.icon className="w-6 h-6 text-[var(--brand-primary)]" />
              </div>

              {/* Title */}
              <h3
                className="text-lg font-semibold mb-2"
                style={{ color: 'var(--brand-secondary)' }}
              >
                {feature.title}
              </h3>

              {/* Description */}
              <p className="brand-body text-sm">
                {feature.description}
              </p>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
