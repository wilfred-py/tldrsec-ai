'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export function MouseFollowEffect() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const updateMousePosition = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
      if (!isVisible) setIsVisible(true);
    };

    window.addEventListener('mousemove', updateMousePosition);

    return () => {
      window.removeEventListener('mousemove', updateMousePosition);
    };
  }, [isVisible]);

  return (
    <motion.div
      className="fixed pointer-events-none w-64 h-64 rounded-full bg-gradient-to-r from-violet-400/20 to-indigo-400/20 blur-3xl -z-10"
      animate={{
        x: mousePosition.x - 128,
        y: mousePosition.y - 128,
      }}
      transition={{
        type: 'spring',
        damping: 15,
        stiffness: 150,
        mass: 0.1,
      }}
      style={{
        opacity: isVisible ? 1 : 0,
      }}
    />
  );
} 