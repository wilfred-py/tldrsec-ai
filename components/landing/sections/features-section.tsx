'use client';

import { motion } from 'framer-motion';
import {
  Bell,
  FileText,
  Clock,
  Shield,
  Sparkles,
  TrendingUp,
} from 'lucide-react';

const features = [
  {
    icon: FileText,
    title: 'All Major Filing Types',
    description:
      'Get summaries for 10-K, 10-Q, 8-K, Form 4, DEF 14A, and more. Stay on top of every important disclosure.',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    icon: Sparkles,
    title: 'AI-Powered Insights',
    description:
      'Our AI extracts key financial metrics, risk factors, and material changes so you can focus on what matters.',
    color: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  {
    icon: Bell,
    title: 'Real-Time Alerts',
    description:
      'Get notified within minutes of new filings. Never miss an important disclosure or earnings report.',
    color: 'text-amber-600',
    bgColor: 'bg-amber-100',
  },
  {
    icon: Clock,
    title: 'Save 10+ Hours Weekly',
    description:
      'Stop spending weekends reading dense filings. Get the key insights delivered straight to your inbox.',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  {
    icon: TrendingUp,
    title: 'Track Your Portfolio',
    description:
      'Monitor the companies you care about. Add tickers and get automatic summaries for every new filing.',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-100',
  },
  {
    icon: Shield,
    title: 'Reliable & Secure',
    description:
      'Direct SEC data integration ensures accuracy. Your data is encrypted and never shared with third parties.',
    color: 'text-rose-600',
    bgColor: 'bg-rose-100',
  },
];

export function NewFeaturesSection() {
  return (
    <section className="py-24 bg-white">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Everything You Need for Better Investment Decisions
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Professional-grade SEC filing analysis, simplified for individual
            investors.
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group"
            >
              <div className="bg-slate-50 rounded-xl p-6 h-full border border-slate-100 hover:border-slate-200 hover:shadow-lg transition-all duration-300">
                <div
                  className={`w-12 h-12 rounded-xl ${feature.bgColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
                >
                  <feature.icon className={`w-6 h-6 ${feature.color}`} />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-slate-600">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
