'use client';

import React, { useState, useEffect } from 'react';
import ReactConfetti from 'react-confetti';
import { useWindowSize } from 'react-use';
import ConfettiExplosion from 'react-confetti-explosion';

interface ConfettiProps {
  active: boolean;
  duration?: number; // Duration in milliseconds
  particleCount?: number;
  recycle?: boolean;
  explosion?: boolean; // Whether to use ConfettiExplosion instead of full screen confetti
}

export function Confetti({ 
  active, 
  duration = 3000, 
  particleCount = 200,
  recycle = false,
  explosion = false
}: ConfettiProps) {
  const [isActive, setIsActive] = useState(false);
  const { width, height } = useWindowSize();
  
  useEffect(() => {
    if (active && !isActive) {
      setIsActive(true);
      
      if (!recycle) {
        const timer = setTimeout(() => {
          setIsActive(false);
        }, duration);
        
        return () => clearTimeout(timer);
      }
    } else if (!active && isActive && !recycle) {
      setIsActive(false);
    }
  }, [active, duration, isActive, recycle]);

  if (!isActive) return null;
  
  // Use explosion style confetti if requested
  if (explosion) {
    return (
      <div className="fixed top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50">
        <ConfettiExplosion
          force={0.8}
          duration={duration}
          particleCount={particleCount}
          width={1600}
        />
      </div>
    );
  }
  
  // Otherwise use full screen confetti
  return (
    <ReactConfetti
      width={width}
      height={height}
      numberOfPieces={particleCount}
      recycle={recycle}
      confettiSource={{
        x: width / 2,
        y: height / 3,
        w: 0,
        h: 0
      }}
      className="fixed inset-0 z-50 pointer-events-none"
    />
  );
} 