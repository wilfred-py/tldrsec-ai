'use client';

import { motion, useInView } from 'framer-motion';
import { useRef, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Mail, Clock, Building2, TrendingUp, AlertTriangle, FileText, DollarSign } from 'lucide-react';

/**
 * Sample filing summaries to display in the email inbox animation
 * These showcase different filing types users will receive
 */
const sampleSummaries = [
  {
    id: 1,
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    filingType: '10-Q',
    filedAt: '2 hours ago',
    headline: 'Q3 Revenue Surges 206% YoY on AI Demand',
    preview: 'Data center revenue hit $14.5B, up 279% from last year. Gaming segment also showed strength...',
    icon: TrendingUp,
    isNew: true,
  },
  {
    id: 2,
    ticker: 'TSLA',
    companyName: 'Tesla, Inc.',
    filingType: '8-K',
    filedAt: '5 hours ago',
    headline: 'Announces New Factory Location in Mexico',
    preview: 'Tesla has filed notice of a new manufacturing facility planned for Monterrey, Mexico...',
    icon: FileText,
    isNew: true,
  },
  {
    id: 3,
    ticker: 'MSFT',
    companyName: 'Microsoft Corporation',
    filingType: 'Form 4',
    filedAt: 'Yesterday',
    headline: 'CEO Satya Nadella Sells 50,000 Shares',
    preview: 'Insider transaction: CEO disposed of shares as part of a pre-arranged 10b5-1 trading plan...',
    icon: DollarSign,
    isNew: false,
  },
  {
    id: 4,
    ticker: 'AMZN',
    companyName: 'Amazon.com, Inc.',
    filingType: '10-K',
    filedAt: '2 days ago',
    headline: 'AWS Maintains 32% Market Share in Cloud',
    preview: 'Annual report highlights continued cloud dominance with $90B+ revenue, advertising growth at 27%...',
    icon: Building2,
    isNew: false,
  },
  {
    id: 5,
    ticker: 'META',
    companyName: 'Meta Platforms, Inc.',
    filingType: '8-K',
    filedAt: '3 days ago',
    headline: 'Reality Labs Losses Narrow in Q4',
    preview: 'Metaverse division reports $4.2B quarterly loss, down from $4.6B prior quarter...',
    icon: AlertTriangle,
    isNew: false,
  },
];

/**
 * Individual email card component with staggered animation
 */
function EmailCard({
  summary,
  index,
  isInView
}: {
  summary: typeof sampleSummaries[0];
  index: number;
  isInView: boolean;
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isInView) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, index * 200); // Stagger by 200ms per card
      return () => clearTimeout(timer);
    }
  }, [isInView, index]);

  return (
    <motion.div
      initial={{ opacity: 0, x: -50, y: 20 }}
      animate={isVisible ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, x: -50, y: 20 }}
      transition={{
        duration: 0.4,
        ease: 'easeOut',
        delay: 0,
      }}
      whileHover={{
        x: 4,
        backgroundColor: 'var(--landing-primary-light)',
        transition: { duration: 0.15 }
      }}
      className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
        summary.isNew
          ? 'bg-blue-50/50 border-blue-100'
          : 'bg-white border-[var(--landing-border)]'
      }`}
    >
      {/* Unread indicator */}
      <div className="flex-shrink-0 mt-1">
        {summary.isNew ? (
          <div className="w-2 h-2 rounded-full bg-[var(--landing-primary)]" />
        ) : (
          <div className="w-2 h-2 rounded-full bg-transparent" />
        )}
      </div>

      {/* Icon */}
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: 'var(--landing-primary-light)' }}
      >
        <summary.icon className="w-5 h-5 text-[var(--landing-primary)]" />
      </div>

      {/* Content */}
      <div className="flex-grow min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2">
            <span
              className={`font-semibold text-sm ${summary.isNew ? 'text-[var(--landing-secondary)]' : 'text-[var(--landing-text)]'}`}
            >
              {summary.ticker}
            </span>
            <Badge
              className={`text-xs px-2 py-0 ${
                summary.filingType === '10-K' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                summary.filingType === '10-Q' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                summary.filingType === '8-K' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                'bg-green-100 text-green-700 border-green-200'
              }`}
            >
              {summary.filingType}
            </Badge>
          </div>
          <span className="text-xs text-[var(--landing-text-muted)] flex items-center gap-1 flex-shrink-0">
            <Clock className="w-3 h-3" />
            {summary.filedAt}
          </span>
        </div>

        <h4
          className={`text-sm mb-1 line-clamp-1 ${
            summary.isNew ? 'font-semibold text-[var(--landing-secondary)]' : 'text-[var(--landing-text)]'
          }`}
        >
          {summary.headline}
        </h4>

        <p className="text-xs text-[var(--landing-text-muted)] line-clamp-1">
          {summary.preview}
        </p>
      </div>
    </motion.div>
  );
}

/**
 * Summaries Showcase Section V2
 *
 * Displays sample filing summaries in an email inbox-style animation
 * Cards animate in one by one as if emails are arriving in real-time
 */
export function SummariesShowcaseV2() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.3 });

  return (
    <section className="py-24 bg-white overflow-hidden" id="summaries">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Column - Text Content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <Badge className="landing-badge mb-6">
              <Mail className="w-4 h-4 mr-2" />
              Delivered to Your Inbox
            </Badge>

            <h2 className="landing-heading mb-4">
              Summaries That{' '}
              <span className="landing-gradient-text">Actually Matter</span>
            </h2>

            <p className="landing-body mb-6">
              Watch as filing summaries arrive in real-time. Each summary is AI-generated,
              highlighting the key insights you need to make informed decisions.
            </p>

            <ul className="space-y-3">
              {[
                'Instant delivery when filings are published',
                'Clear headlines that capture the key point',
                'One-click access to full AI analysis',
                'Color-coded by filing type for quick scanning',
              ].map((item, index) => (
                <motion.li
                  key={item}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: 0.1 * index }}
                  className="flex items-center gap-3"
                >
                  <div className="w-5 h-5 rounded-full bg-[var(--landing-success)] flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-sm" style={{ color: 'var(--landing-text)' }}>{item}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          {/* Right Column - Email Inbox Animation */}
          <div ref={containerRef} className="relative">
            {/* Email client frame */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="bg-white rounded-2xl border border-[var(--landing-border)] shadow-xl overflow-hidden"
            >
              {/* Email client header */}
              <div className="flex items-center gap-2 px-4 py-3 bg-[var(--landing-bg-subtle)] border-b border-[var(--landing-border)]">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-grow text-center">
                  <span className="text-sm font-medium text-[var(--landing-text-muted)]">
                    SEC Filing Summaries
                  </span>
                </div>
                <Badge className="bg-[var(--landing-primary)] text-white text-xs">
                  {sampleSummaries.filter(s => s.isNew).length} new
                </Badge>
              </div>

              {/* Email list */}
              <div className="p-4 space-y-3 max-h-[500px] overflow-hidden">
                {sampleSummaries.map((summary, index) => (
                  <EmailCard
                    key={summary.id}
                    summary={summary}
                    index={index}
                    isInView={isInView}
                  />
                ))}
              </div>

              {/* Footer hint */}
              <div className="px-4 py-3 bg-[var(--landing-bg-subtle)] border-t border-[var(--landing-border)] text-center">
                <span className="text-xs text-[var(--landing-text-muted)]">
                  Showing 5 of 127 summaries this week
                </span>
              </div>
            </motion.div>

            {/* Decorative elements */}
            <div
              className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-30 pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(0, 121, 242, 0.2) 0%, transparent 70%)',
              }}
            />
            <div
              className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full opacity-20 pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(139, 92, 246, 0.2) 0%, transparent 70%)',
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
