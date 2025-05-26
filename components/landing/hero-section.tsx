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

const tickerItems = [
  "AAPL", "MSFT", "AMZN", "GOOGL", "META", "TSLA", "NVDA", "JNJ", "JPM", "V", "PG", "WMT", "DIS", "KO", "PFE"
];

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
            SEC Filings, Delivered to Your Inbox
          </h1>
        </motion.div>
        
        <motion.div variants={item}>
          <p className="text-xl md:text-2xl mb-10 max-w-3xl mx-auto text-muted-foreground">
            Subscribe to company tickers and receive concise, real-time email summaries of SEC filings. Stay informed without the information overload.
          </p>
        </motion.div>
        
        <motion.div 
          className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          variants={item}
        >
          <Link href="/auth/sign-up">
            <Button size="lg" className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white px-8 py-6 text-lg rounded-full">
              Get Started
            </Button>
          </Link>
        </motion.div>
        
        <motion.div 
          className="mt-16"
          variants={item}
        >
          <p className="text-sm text-muted-foreground mb-4">Subscribe to public companies like</p>
          
          <div className="relative w-full overflow-hidden mask-gradient">
            <div className="ticker-container">
              <div className="ticker">
                {[...tickerItems, ...tickerItems].map((ticker, index) => (
                  <div 
                    key={index} 
                    className="px-4 py-2 mx-4 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 inline-block whitespace-nowrap"
                  >
                    {ticker}
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <style jsx global>{`
            @keyframes ticker {
              0% {
                transform: translateX(0);
              }
              100% {
                transform: translateX(-50%);
              }
            }
            
            .mask-gradient {
              mask-image: linear-gradient(to right, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 1) 10%, rgba(0, 0, 0, 1) 90%, rgba(0, 0, 0, 0) 100%);
            }
            
            .ticker-container {
              width: 100%;
              overflow: hidden;
              padding: 1rem 0;
            }
            
            .ticker {
              display: inline-flex;
              white-space: nowrap;
              animation: ticker 30s linear infinite;
            }
          `}</style>
        </motion.div>
      </motion.div>
    </div>
  );
} 