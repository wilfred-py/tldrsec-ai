'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const messages = [
  'saving your preferences',
  'setting up tickers',
  'preparing your dashboard',
  'ready!',
];

const MIN_DISPLAY_MS = 2000;

function PulsingDots() {
  return (
    <span className="inline-flex gap-[3px] ml-1">
      <span className="animate-pulse-dot-1 text-white/80">.</span>
      <span className="animate-pulse-dot-2 text-white/80">.</span>
      <span className="animate-pulse-dot-3 text-white/80">.</span>
    </span>
  );
}

export function OnboardingTransition() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startTime] = useState(() => Date.now());

  // Cycle through messages on a schedule, then redirect
  useEffect(() => {
    if (currentIndex >= messages.length - 1) {
      // We're at "ready!" - wait then redirect
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
      const timer = setTimeout(() => {
        window.location.href = '/dashboard';
      }, remaining + 800); // small extra pause on "ready!"
      return () => clearTimeout(timer);
    }

    // Advance to next message
    const delay = currentIndex === 0 ? 600 : 700;
    const timer = setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [currentIndex, startTime]);

  const isReady = currentIndex === messages.length - 1;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center brand-gradient-bar">
      <div className="text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="text-2xl sm:text-3xl font-medium text-white"
          >
            {messages[currentIndex]}
            {!isReady && <PulsingDots />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
