'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { AnimatedGradient } from './animated-gradient';
import Link from 'next/link';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { 
    opacity: 1, 
    y: 0,
    transition: {
      duration: 0.8,
      ease: [0.25, 0.1, 0.25, 1.0],
    }
  },
};

export function HeroSection() {
  return (
    <div className="relative min-h-[90vh] flex items-center">
      <AnimatedGradient />
      
      <motion.div 
        className="container px-4 py-24 mx-auto text-center"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={item}>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-violet-500 to-pink-600">
            SEC Filings, Simplified
          </h1>
        </motion.div>
        
        <motion.div variants={item}>
          <p className="text-xl md:text-2xl mb-10 max-w-3xl mx-auto text-muted-foreground">
            AI-powered summaries of complex SEC filings. Save time, gain insights, make better investment decisions.
          </p>
        </motion.div>
        
        <motion.div 
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          variants={item}
        >
          <Link href="/auth/sign-up">
            <Button size="lg" className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white px-8 py-6 text-lg rounded-full">
              Start for Free
            </Button>
          </Link>
          <Link href="/about">
            <Button variant="outline" size="lg" className="border-2 px-8 py-6 text-lg rounded-full">
              Learn More
            </Button>
          </Link>
        </motion.div>
        
        <motion.div 
          className="mt-16"
          variants={item}
        >
          <p className="text-sm text-muted-foreground mb-4">Trusted by financial professionals</p>
          <div className="flex flex-wrap justify-center items-center gap-8 opacity-60">
            {/* Replace these with actual logos */}
            <div className="h-8 w-24 bg-gray-300 rounded"></div>
            <div className="h-8 w-24 bg-gray-300 rounded"></div>
            <div className="h-8 w-24 bg-gray-300 rounded"></div>
            <div className="h-8 w-24 bg-gray-300 rounded"></div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
} 