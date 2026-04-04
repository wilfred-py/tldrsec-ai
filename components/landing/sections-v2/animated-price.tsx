'use client';

import { motion, AnimatePresence } from 'framer-motion';
import NumberFlow from '@number-flow/react';

interface AnimatedPriceProps {
  value: number;
  suffix: string;
  savings?: number | null;
  className?: string;
}

/**
 * AnimatedPrice Component
 *
 * Grok-inspired price display using number-flow for slot-machine digit animation.
 * Each digit scrolls vertically when the price changes (monthly ↔ yearly).
 */
export function AnimatedPrice({ value, suffix, savings, className = '' }: AnimatedPriceProps) {
  return (
    <div className={`flex flex-col ${className}`}>
      {/* Price row */}
      <div className="flex items-baseline">
        <NumberFlow
          value={value}
          locales="en-US"
          format={{ style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }}
          className="text-4xl font-bold tracking-tight"
          style={{ color: 'var(--landing-secondary)' }}
        />
        <span
          className="text-sm text-[var(--landing-text-muted)] ml-1"
          style={{ minWidth: '4.5rem' }}
        >
          {suffix}
        </span>
      </div>

      {/* Savings badge */}
      <div className="h-5 mt-1">
        <AnimatePresence>
          {savings != null && savings > 0 && (
            <motion.span
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
              className="text-sm font-medium text-emerald-600"
            >
              Save {savings}%
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Simple non-animated price for Free tier
 */
export function StaticPrice({ label }: { label: string }) {
  return (
    <div className="flex flex-col">
      <span
        className="text-4xl font-bold tracking-tight"
        style={{ color: 'var(--landing-secondary)' }}
      >
        {label}
      </span>
      <div className="h-5 mt-1" />
    </div>
  );
}
