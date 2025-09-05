'use client';

import { motion } from 'framer-motion';

export function ComprehensiveInsights() {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background gradient element */}
      <div className="absolute bottom-0 right-0 w-1/3 h-1/3 bg-gradient-to-t from-indigo-500/20 to-transparent rounded-full blur-3xl -z-10 transform translate-x-1/2 translate-y-1/2" />
      
      <div className="container px-4 mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-6">Live Oversight of Your Investment Portfolio</h2>
            <p className="text-xl mb-8 text-muted-foreground">
              Stay informed about critical financial disclosures for the companies you follow. Our real-time email summaries deliver insights when they matter most.
            </p>
            
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-violet-600/10 flex items-center justify-center text-violet-600 font-bold">
                  1
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Real-Time Notifications</h3>
                  <p className="text-muted-foreground">
                    Receive email alerts within minutes of new SEC filings for your subscribed tickers.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-violet-600/10 flex items-center justify-center text-violet-600 font-bold">
                  2
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Comprehensive Summaries</h3>
                  <p className="text-muted-foreground">
                    Each summary extracts key financial metrics, risk factors, and material changes so you can quickly grasp what matters.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-violet-600/10 flex items-center justify-center text-violet-600 font-bold">
                  3
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2">Contextual Analysis</h3>
                  <p className="text-muted-foreground">
                    Understand how current filings compare to previous disclosures with trend indicators and highlighted changes.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-950/20 dark:to-indigo-950/20 p-1"
          >
            <div className="bg-card rounded-xl p-8 border border-border shadow-xl">
              {/* Placeholder for an email summary mockup */}
              <div className="aspect-[4/5] bg-background rounded-lg overflow-hidden flex items-center justify-center">
                <div className="p-6 max-w-md mx-auto">
                  <div className="h-8 w-32 bg-violet-200 dark:bg-violet-900/40 rounded mb-6"></div>
                  <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded mb-3"></div>
                  <div className="h-4 w-5/6 bg-gray-200 dark:bg-gray-800 rounded mb-3"></div>
                  <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded mb-6"></div>
                  
                  <div className="h-6 w-40 bg-violet-200 dark:bg-violet-900/40 rounded mb-4"></div>
                  <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded mb-3"></div>
                  <div className="h-4 w-5/6 bg-gray-200 dark:bg-gray-800 rounded mb-6"></div>
                  
                  <div className="h-6 w-40 bg-violet-200 dark:bg-violet-900/40 rounded mb-4"></div>
                  <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded mb-3"></div>
                  <div className="h-4 w-5/6 bg-gray-200 dark:bg-gray-800 rounded mb-3"></div>
                  <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded mb-3"></div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
} 