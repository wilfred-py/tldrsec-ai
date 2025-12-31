'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AnimatedPriceProps {
  value: number;
  suffix: string;
  savings?: number | null;
  className?: string;
}

/**
 * AnimatedPrice Component
 *
 * Grok-inspired price display with individual digit animations.
 * Each digit slides up/down when the price changes.
 *
 * Features:
 * - Individual digit animation (vertical slide)
 * - Fixed-width container to prevent layout shift
 * - Savings badge with orange accent
 * - Smooth transitions between monthly/yearly
 */
export function AnimatedPrice({ value, suffix, savings, className = '' }: AnimatedPriceProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (value !== prevValueRef.current) {
      // Determine animation direction based on value change
      setDirection(value > prevValueRef.current ? 'up' : 'down');
      setDisplayValue(value);
      prevValueRef.current = value;
    }
  }, [value]);

  // Format price with commas and decimals
  const formatPrice = (price: number): string => {
    if (price === 0) return '0';
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const priceString = formatPrice(displayValue);
  const digits = priceString.split('');

  // Animation variants for digits
  const digitVariants = {
    initial: (dir: 'up' | 'down') => ({
      y: dir === 'up' ? 20 : -20,
      opacity: 0,
    }),
    animate: {
      y: 0,
      opacity: 1,
    },
    exit: (dir: 'up' | 'down') => ({
      y: dir === 'up' ? -20 : 20,
      opacity: 0,
    }),
  };

  return (
    <div className={`flex items-baseline gap-0.5 ${className}`}>
      {/* Dollar sign - static */}
      <span
        className="text-4xl font-bold tracking-tight"
        style={{ color: 'var(--landing-secondary)' }}
      >
        $
      </span>

      {/* Animated digits container */}
      <div className="flex items-baseline overflow-hidden">
        <AnimatePresence mode="popLayout" custom={direction}>
          {digits.map((digit, index) => (
            <motion.span
              key={`${displayValue}-${index}-${digit}`}
              custom={direction}
              variants={digitVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{
                duration: 0.3,
                ease: [0.25, 0.46, 0.45, 0.94], // easeOutQuad
                delay: index * 0.02, // Stagger effect
              }}
              className="text-4xl font-bold tracking-tight inline-block"
              style={{
                color: 'var(--landing-secondary)',
                minWidth: digit === ',' ? '0.3em' : digit === '.' ? '0.25em' : '0.6em',
                textAlign: 'center',
              }}
            >
              {digit}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      {/* Suffix (USD/month or USD/year) */}
      <span className="text-sm text-[var(--landing-text-muted)] ml-0.5">
        {suffix}
      </span>

      {/* Savings badge */}
      <AnimatePresence>
        {savings && savings > 0 && (
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
            className="text-sm font-medium text-orange-500 ml-2"
          >
            saving {savings}%
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Simple non-animated price for Free tier
 */
export function StaticPrice({ label }: { label: string }) {
  return (
    <span
      className="text-4xl font-bold tracking-tight"
      style={{ color: 'var(--landing-secondary)' }}
    >
      {label}
    </span>
  );
}
