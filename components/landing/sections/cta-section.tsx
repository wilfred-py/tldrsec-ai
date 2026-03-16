'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

export function NewCTASection() {
  return (
    <section className="py-24 bg-gradient-to-r from-blue-600 to-indigo-600 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:4rem_4rem]" />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mx-auto text-center"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Save 10+ Hours Every Week?
          </h2>
          <p className="text-lg text-blue-100 mb-8">
            Join thousands of investors who use tldrsec.app to stay informed
            without the time commitment. Start your trial today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/sign-up">
              <Button
                size="lg"
                className="h-14 px-8 text-base font-semibold bg-white text-blue-600 hover:bg-blue-50 shadow-xl"
              >
                Start Trial
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Link href="#pricing">
              <Button
                size="lg"
                variant="outline"
                className="h-14 px-8 text-base font-semibold border-white/30 text-white hover:bg-white/10"
              >
                Compare Plans
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-sm text-blue-200">
            No credit card required.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
