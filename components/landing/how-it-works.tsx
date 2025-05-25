'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const steps = [
  {
    number: '01',
    title: 'Upload SEC Filing',
    description: 'Simply provide the URL or upload the SEC filing document you want to analyze.'
  },
  {
    number: '02',
    title: 'AI Analysis',
    description: 'Our advanced AI reads through and analyzes the entire document in seconds.'
  },
  {
    number: '03',
    title: 'Get Key Insights',
    description: 'Receive a concise summary highlighting the most important information.'
  }
];

export function HowItWorks() {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background gradient elements */}
      <div className="absolute top-0 right-0 w-1/3 h-1/3 bg-gradient-to-b from-purple-500/20 to-transparent rounded-full blur-3xl -z-10 transform translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 left-0 w-1/3 h-1/3 bg-gradient-to-t from-blue-500/20 to-transparent rounded-full blur-3xl -z-10 transform -translate-x-1/2 translate-y-1/2" />
      
      <div className="container px-4 mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">How It Works</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Our platform makes it easy to get insights from complex financial documents in just a few steps.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: index * 0.2 }}
              className="p-8 rounded-2xl bg-card border border-border relative"
            >
              <div className="absolute -top-4 -left-4 flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold">
                {step.number}
              </div>
              <h3 className="text-xl font-semibold mb-3 mt-4">{step.title}</h3>
              <p className="text-muted-foreground">{step.description}</p>
            </motion.div>
          ))}
        </div>

        <motion.div 
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <Link href="/auth/sign-up">
            <Button size="lg" className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white px-8 py-6 text-lg rounded-full">
              Try It Now
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
} 