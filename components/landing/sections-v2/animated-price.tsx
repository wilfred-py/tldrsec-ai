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
 * - Savings badge on separate line to prevent horizontal shift
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

  // Format price - no decimals for cleaner display (like Grok)
  const formatPrice = (price: number): string => {
    if (price === 0) return '0';
    // For annual prices (typically 3-4 digits), use comma formatting
    if (price >= 1000) {
      return price.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    }
    // For monthly prices, no decimals needed
    return price.toString();
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
    <div className={`flex flex-col ${className}`}>
      {/* Price row - fixed layout */}
      <div className="flex items-baseline">
        {/* Dollar sign - static */}
        <span
          className="text-4xl font-bold tracking-tight"
          style={{ color: 'var(--landing-secondary)' }}
        >
          $
        </span>

        {/* Animated digits container - fixed width to prevent shift */}
        <div
          className="flex items-baseline overflow-hidden"
          style={{ minWidth: '5.5ch' }} // Accommodates up to "1,390" (5 chars)
        >
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
                  width: digit === ',' ? '0.35em' : '0.6em',
                  textAlign: 'center',
                }}
              >
                {digit}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>

        {/* Suffix with fixed width to prevent shift */}
        <span
          className="text-sm text-[var(--landing-text-muted)] ml-1"
          style={{ minWidth: '4.5rem' }} // Fixed width for "USD/year" or "USD/month"
        >
          {suffix}
        </span>
      </div>

      {/* Savings badge - on separate line to prevent horizontal shift */}
      <div className="h-5 mt-1">
        <AnimatePresence>
          {savings && savings > 0 && (
            <motion.span
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.2 }}
              className="text-sm font-medium text-orange-500"
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
      {/* Placeholder for savings badge height consistency */}
      <div className="h-5 mt-1" />
    </div>
  );
}
