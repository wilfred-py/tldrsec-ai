'use client';

import { motion } from 'framer-motion';
import { Clock, LineChart, Search, Share2 } from 'lucide-react';

const features = [
  {
    icon: <Clock className="h-8 w-8" />,
    title: 'Save Time',
    description: 'Get the key insights from complex SEC filings in minutes, not hours.'
  },
  {
    icon: <Search className="h-8 w-8" />,
    title: 'AI-Powered Analysis',
    description: 'Our AI extracts the most important information, highlighting what matters most.'
  },
  {
    icon: <LineChart className="h-8 w-8" />,
    title: 'Better Decisions',
    description: 'Make more informed investment decisions with clear, concise summaries.'
  },
  {
    icon: <Share2 className="h-8 w-8" />,
    title: 'Easy Sharing',
    description: 'Share insights with your team or clients with a single click.'
  }
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.2,
      delayChildren: 0.3,
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

export function FeaturesSection() {
  return (
    <section className="py-24 bg-gradient-to-b from-background to-background/80">
      <div className="container px-4 mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Why Choose Our Platform?</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Our AI-powered platform transforms complex SEC filings into clear, actionable insights.
          </p>
        </motion.div>

        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={item}
              className="p-8 rounded-2xl bg-card border border-border hover:border-primary/20 hover:shadow-lg transition-all duration-300 ease-in-out"
            >
              <div className="p-4 rounded-full bg-primary/10 inline-block mb-6 text-primary">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
} 