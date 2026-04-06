'use client';

import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

interface ConfettiProps {
  active: boolean;
  duration?: number;
}

/**
 * Side cannons confetti using canvas-confetti (Magic UI pattern).
 * Fires particles from both sides of the viewport simultaneously.
 */
export function Confetti({ active, duration = 3000 }: ConfettiProps) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!active || firedRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    firedRef.current = true;

    const end = Date.now() + duration;
    const colors = ['#0079F2', '#8B5CF6', '#a786ff', '#fd8bbc', '#eca184', '#f8deb1'];

    const frame = () => {
      if (Date.now() > end) return;

      // Left cannon
      confetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        startVelocity: 60,
        origin: { x: 0, y: 0.5 },
        colors,
        zIndex: 10001,
      });

      // Right cannon
      confetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        startVelocity: 60,
        origin: { x: 1, y: 0.5 },
        colors,
        zIndex: 10001,
      });

      requestAnimationFrame(frame);
    };

    frame();
  }, [active, duration]);

  // Reset fired state when deactivated so it can fire again next time
  useEffect(() => {
    if (!active) {
      firedRef.current = false;
    }
  }, [active]);

  return null;
}
