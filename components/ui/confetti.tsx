'use client';

import React, { useState, useEffect } from 'react';
import ReactConfetti from 'react-confetti';
import { useWindowSize } from 'react-use';

interface ConfettiProps {
  active: boolean;
  duration?: number; // Duration in milliseconds
  particleCount?: number;
  recycle?: boolean;
  explosion?: boolean; // Whether to use explosion style (centered confetti)
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
  
  // Use explosion style (more concentrated confetti) if requested
  const confettiSource = explosion 
    ? { x: width / 2, y: height / 3, w: 10, h: 10 }
    : { x: width / 2, y: height / 3, w: 0, h: 0 };
  
  // Use full screen confetti with adjusted source
  return (
    <ReactConfetti
      width={width}
      height={height}
      numberOfPieces={particleCount}
      recycle={recycle}
      confettiSource={confettiSource}
      className="fixed inset-0 z-50 pointer-events-none"
    />
  );
} 