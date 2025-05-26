'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useAuthContext } from '@/lib/context/auth-context';

export function CTASection() {
  const { isAuthenticated, isLoading } = useAuthContext();
  
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background gradient elements */}
      <div className="absolute inset-0 bg-gradient-to-r from-violet-600/10 to-indigo-600/10 -z-10" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-4xl max-h-96 bg-gradient-to-r from-violet-600/20 to-indigo-600/20 rounded-full blur-3xl -z-10" />
      
      <div className="container px-4 mx-auto">
        <motion.div 
          className="max-w-3xl mx-auto text-center"
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-violet-500 to-pink-600">
            Never Miss Important SEC Filings Again
          </h2>
          <p className="text-xl mb-10 text-muted-foreground">
            Join investors who stay informed with real-time email summaries of SEC filings for the companies they follow.
          </p>
          <div className="flex justify-center">
            {!isLoading && (
              isAuthenticated ? (
                <Link href="/dashboard">
                  <Button size="lg" className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white px-8 py-6 text-lg rounded-full">
                    Go to Dashboard
                  </Button>
                </Link>
              ) : (
                <Link href="/sign-up">
                  <Button size="lg" className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white px-8 py-6 text-lg rounded-full">
                    Get Started
                  </Button>
                </Link>
              )
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
} 