'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

export const AnimatedGradient = () => {
  return (
    <div className="absolute inset-0 overflow-hidden -z-10">
      <motion.div
        className="absolute -inset-[100px] opacity-50"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(92, 65, 255, 0.8) 0%, rgba(22, 21, 21, 0) 50%)',
        }}
        animate={{
          x: ['-25%', '25%', '-25%'],
          y: ['-15%', '15%', '-15%'],
        }}
        transition={{
          repeat: Infinity,
          duration: 15,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        className="absolute -inset-[100px] opacity-30"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(255, 86, 65, 0.8) 0%, rgba(22, 21, 21, 0) 50%)',
        }}
        animate={{
          x: ['25%', '-25%', '25%'],
          y: ['15%', '-15%', '15%'],
        }}
        transition={{
          repeat: Infinity,
          duration: 20,
          ease: 'easeInOut',
        }}
      />
      <div className="absolute inset-0 bg-background/80 backdrop-blur-xl" />
    </div>
  );
}; 