'use client';

import { motion } from 'framer-motion';
import { Inbox, Bell, FileText, Clock } from 'lucide-react';

const features = [
  {
    icon: <Inbox className="h-8 w-8" />,
    title: 'Email Delivery',
    description: 'Summaries sent directly to your inbox, no need to check another dashboard or app.'
  },
  {
    icon: <Bell className="h-8 w-8" />,
    title: 'Real-Time Alerts',
    description: 'Receive notifications within minutes of new SEC filings for your subscribed tickers.'
  },
  {
    icon: <FileText className="h-8 w-8" />,
    title: 'Concise Summaries',
    description: 'Get clear, readable summaries that extract what matters most from dense financial documents.'
  },
  {
    icon: <Clock className="h-8 w-8" />,
    title: 'Time Savings',
    description: 'Focus on making decisions instead of spending hours reading through lengthy filings.'
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
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Stay Ahead with Email Updates</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Our email subscription service transforms complex SEC filings into clear, actionable insights delivered right when you need them.
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