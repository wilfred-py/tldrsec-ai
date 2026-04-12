'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Building2, Calendar, TrendingUp, FileText, DollarSign, Users, X, AlertTriangle, BarChart3 } from 'lucide-react';

/**
 * Sample filing data for hero card (Apple 10-K)
 * Showcases value proposition with real-looking data
 */
const sampleFiling = {
  ticker: 'AAPL',
  companyName: 'Apple Inc.',
  filingType: '10-K',
  filedAt: 'Nov 1, 2024',
  keyHighlights: [
    { icon: DollarSign, text: 'Revenue: $383.3B (+2.0% YoY)' },
    { icon: TrendingUp, text: 'Services segment grew 14%' },
    { icon: Users, text: 'Active devices: 2.2B worldwide' },
    { icon: FileText, text: 'AI features launching in 2025' },
  ],
  fullAnalysis: {
    summary: `Apple's fiscal year 2024 10-K filing reveals continued growth momentum despite macroeconomic headwinds. The company reported total net sales of $383.3 billion, representing a 2% year-over-year increase, with particularly strong performance in the Services segment.`,
    sections: [
      {
        title: 'Financial Performance',
        icon: BarChart3,
        content: 'Net income reached $93.7B with EPS of $6.08. Gross margin improved to 45.6%, driven by Services growth and favorable product mix.',
      },
      {
        title: 'Services Growth',
        icon: TrendingUp,
        content: 'Services revenue hit $96.2B (+14% YoY), now representing 25% of total revenue. Apple Music, iCloud, and App Store led growth.',
      },
      {
        title: 'Risk Factors',
        icon: AlertTriangle,
        content: 'Key risks include supply chain concentration in China, regulatory scrutiny in EU/US, and increasing competition in wearables.',
      },
    ],
  },
};

/**
 * Hero Filing Card Component
 *
 * Displays a sample filing summary in the hero section
 * to immediately demonstrate value to visitors.
 */
export function HeroFilingCard() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Handle Escape key to close modal
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setIsModalOpen(false);
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isModalOpen, handleEscape]);

  return (
    <>
      <motion.div
        className="brand-card relative overflow-hidden"
        whileHover={{ y: -4 }}
        transition={{ duration: 0.2 }}
      >
        {/* Card Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[var(--brand-bg-subtle)] flex items-center justify-center">
              <Building2 className="w-6 h-6 text-[var(--brand-primary)]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg" style={{ color: 'var(--brand-secondary)' }}>
                  {sampleFiling.ticker}
                </span>
                <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                  {sampleFiling.filingType}
                </Badge>
              </div>
              <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
                {sampleFiling.companyName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--brand-text-muted)' }}>
            <Calendar className="w-4 h-4" />
            {sampleFiling.filedAt}
          </div>
        </div>

        {/* Key Highlights */}
        <div className="space-y-3">
          <p className="text-sm font-medium" style={{ color: 'var(--brand-text-muted)' }}>
            Key Highlights
          </p>
          {sampleFiling.keyHighlights.map((highlight, index) => (
            <motion.div
              key={index}
              className="flex items-center gap-3 p-3 rounded-lg"
              style={{ backgroundColor: 'var(--brand-bg-subtle)' }}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + index * 0.1 }}
            >
              <highlight.icon className="w-4 h-4 text-[var(--brand-primary)]" />
              <span className="text-sm" style={{ color: 'var(--brand-secondary)' }}>
                {highlight.text}
              </span>
            </motion.div>
          ))}
        </div>

        {/* CTA Link */}
        <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--brand-border)' }}>
          <button
            onClick={() => setIsModalOpen(true)}
            className="text-sm font-medium text-[var(--brand-primary)] hover:underline flex items-center gap-1"
          >
            Read full analysis
            <span className="text-xs">→</span>
          </button>
        </div>

        {/* Decorative gradient overlay */}
        <div
          className="absolute top-0 right-0 w-32 h-32 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at top right, rgba(0, 121, 242, 0.05) 0%, transparent 70%)',
          }}
        />
      </motion.div>

      {/* Full Analysis Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/50 z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
            />

            {/* Modal */}
            <motion.div
              className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-2xl md:w-full bg-white rounded-2xl shadow-2xl z-50 overflow-hidden"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--brand-primary-light)] flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-[var(--brand-primary)]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold" style={{ color: 'var(--brand-secondary)' }}>
                        {sampleFiling.ticker}
                      </span>
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                        {sampleFiling.filingType}
                      </Badge>
                    </div>
                    <p className="text-sm" style={{ color: 'var(--brand-text-muted)' }}>
                      {sampleFiling.companyName} • {sampleFiling.filedAt}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" style={{ color: 'var(--brand-text-muted)' }} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                {/* Summary */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-3" style={{ color: 'var(--brand-secondary)' }}>
                    Executive Summary
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--brand-text)' }}>
                    {sampleFiling.fullAnalysis.summary}
                  </p>
                </div>

                {/* Sections */}
                <div className="space-y-4">
                  {sampleFiling.fullAnalysis.sections.map((section, index) => (
                    <motion.div
                      key={section.title}
                      className="p-4 rounded-xl"
                      style={{ backgroundColor: 'var(--brand-bg-subtle)' }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <section.icon className="w-4 h-4 text-[var(--brand-primary)]" />
                        <h4 className="font-semibold text-sm" style={{ color: 'var(--brand-secondary)' }}>
                          {section.title}
                        </h4>
                      </div>
                      <p className="text-sm" style={{ color: 'var(--brand-text)' }}>
                        {section.content}
                      </p>
                    </motion.div>
                  ))}
                </div>

                {/* Sample disclaimer */}
                <div className="mt-6 p-4 rounded-lg bg-blue-50 border border-blue-100">
                  <p className="text-xs text-blue-700">
                    <strong>Sample Summary:</strong> This is an example of the AI-generated summaries you&apos;ll receive.
                    Sign up to get real-time summaries for companies you care about.
                  </p>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t" style={{ borderColor: 'var(--brand-border)', backgroundColor: 'var(--brand-bg-subtle)' }}>
                <Button
                  className="brand-button-gradient w-full"
                  onClick={() => {
                    setIsModalOpen(false);
                    window.location.href = '/onboarding';
                  }}
                >
                  Get summaries like this for your portfolio
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
