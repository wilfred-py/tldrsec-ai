'use client';

import { motion } from 'framer-motion';
import type { BillingInterval } from '@/lib/stripe/plans';

interface BillingToggleProps {
  billingInterval: BillingInterval;
  onToggle: () => void;
  disabled?: boolean;
}

/**
 * Grok-inspired billing interval toggle.
 * Pill container with "Save with yearly billing" label and green switch.
 */
export function BillingToggle({ billingInterval, onToggle, disabled = false }: BillingToggleProps) {
  const isAnnual = billingInterval === 'annual';

  return (
    <div className="inline-flex items-center gap-2.5 rounded-full px-4 py-2.5">
      <span className="text-sm text-[var(--brand-text-muted)]">
        Save with yearly billing
      </span>
      <button
        onClick={onToggle}
        disabled={disabled}
        className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${
          isAnnual ? 'bg-emerald-500' : 'bg-gray-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        role="switch"
        aria-checked={isAnnual}
        aria-label={`Switch to ${isAnnual ? 'monthly' : 'annual'} billing`}
      >
        <motion.span
          animate={{ x: isAnnual ? 20 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md"
        />
      </button>
    </div>
  );
}
