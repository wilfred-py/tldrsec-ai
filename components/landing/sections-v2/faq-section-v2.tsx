'use client';

import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  staggerContainer,
  staggerItem,
  viewportOnce,
} from '@/lib/animations/landing-animations';
import { SUBSCRIPTION_PLANS } from '@/lib/stripe/plans';

const PRO = SUBSCRIPTION_PLANS.PRO;
const MAX = SUBSCRIPTION_PLANS.MAX;

type FaqItem = {
  id: string;
  question: string;
  /** Rendered in the accordion. JSX for inline pricing, plain string otherwise. */
  answer: ReactNode;
  /** Plain-text mirror of `answer` for FAQPage JSON-LD. Must stay 1:1 with `answer`. */
  answerPlain: string;
};

const PRO_VS_MAX = `Pro ($${PRO.monthlyPrice}/mo) tracks up to ${PRO.tickerLimit} companies on a priority queue. Max ($${MAX.monthlyPrice}/mo) is unlimited companies with first-priority processing — built for analysts covering large watchlists.`;

const COMPANIES = `Pro tracks up to ${PRO.tickerLimit} companies. Max and Free are unlimited. You can change your watchlist anytime from the dashboard.`;

/**
 * FAQ copy reviewed via /autoplan adversarial review (see .claude/tasks/landing-faq-section.md).
 * Pricing numbers sourced from SUBSCRIPTION_PLANS to prevent drift.
 * Order: trial → cancel → accuracy → Pro/Max → filings → speed → companies → advice → data.
 */
export const faqItems: FaqItem[] = [
  {
    id: 'trial',
    question: 'Is there a free trial?',
    answer:
      'Every paid plan starts with a 7-day free trial. No charge until day 8, and you can cancel with one click during the trial.',
    answerPlain:
      'Every paid plan starts with a 7-day free trial. No charge until day 8, and you can cancel with one click during the trial.',
  },
  {
    id: 'cancel',
    question: 'Can I cancel anytime?',
    answer:
      'Yes. Cancel from your dashboard in two clicks, no phone calls or emails required. You keep access through the end of your billing period.',
    answerPlain:
      'Yes. Cancel from your dashboard in two clicks, no phone calls or emails required. You keep access through the end of your billing period.',
  },
  {
    id: 'accuracy',
    question: 'How accurate are the summaries?',
    answer:
      'Summaries are AI-generated from the official EDGAR filing text and link back to the source so you can verify any figure. Always confirm material details against the primary filing before acting.',
    answerPlain:
      'Summaries are AI-generated from the official EDGAR filing text and link back to the source so you can verify any figure. Always confirm material details against the primary filing before acting.',
  },
  {
    id: 'pro-vs-max',
    question: "What's the difference between Pro and Max?",
    answer: PRO_VS_MAX,
    answerPlain: PRO_VS_MAX,
  },
  {
    id: 'filings',
    question: 'Which SEC filings do you cover?',
    answer:
      '10-K (annual), 10-Q (quarterly), 8-K (material events), and Form 4 (insider transactions). Coverage may expand as we add new filing types.',
    answerPlain:
      '10-K (annual), 10-Q (quarterly), 8-K (material events), and Form 4 (insider transactions). Coverage may expand as we add new filing types.',
  },
  {
    id: 'speed',
    question: 'How quickly are filings processed?',
    answer:
      'Paid tiers are processed on a priority queue as soon as EDGAR publishes; the free tier runs in batches through the day. Speed depends on EDGAR availability and filing size.',
    answerPlain:
      'Paid tiers are processed on a priority queue as soon as EDGAR publishes; the free tier runs in batches through the day. Speed depends on EDGAR availability and filing size.',
  },
  {
    id: 'companies',
    question: 'How many companies can I track?',
    answer: COMPANIES,
    answerPlain: COMPANIES,
  },
  {
    id: 'advice',
    question: 'Is this investment advice?',
    answer:
      "No. tldrSEC summarizes public SEC filings. We don't recommend trades, rate securities, or provide personalized advice.",
    answerPlain:
      "No. tldrSEC summarizes public SEC filings. We don't recommend trades, rate securities, or provide personalized advice.",
  },
  {
    id: 'data',
    question: 'How do you handle my data?',
    answer:
      'Your email and watchlist are encrypted at rest and never sold to third parties. Billing is handled by Stripe; we never see your card number.',
    answerPlain:
      'Your email and watchlist are encrypted at rest and never sold to third parties. Billing is handled by Stripe; we never see your card number.',
  },
];

/**
 * FAQ Section V2
 *
 * Placed below PricingSectionV2 to address post-pricing objections (trial safety,
 * cancellation, accuracy) before the final CTA. First item default-expanded to
 * teach the accordion pattern and answer the highest-priority question immediately.
 */
export function FAQSectionV2() {
  return (
    <section
      className="py-24 bg-white border-t border-[var(--brand-border)]"
      id="faq"
    >
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="brand-heading mb-4">Before you start your trial</h2>
          <p className="brand-body max-w-2xl mx-auto">
            Answers to the questions most prospects ask before signing up.
          </p>
        </motion.div>

        {/* FAQ Accordion */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={viewportOnce}
          className="max-w-3xl mx-auto"
        >
          <Accordion
            type="single"
            collapsible
            defaultValue={faqItems[0].id}
            className="w-full"
          >
            {faqItems.map((item) => (
              <motion.div key={item.id} variants={staggerItem}>
                <AccordionItem value={item.id}>
                  <AccordionTrigger className="text-base md:text-lg font-semibold py-5 text-[var(--brand-secondary)] hover:no-underline [&>svg]:h-5 [&>svg]:w-5 [&>svg]:text-[var(--brand-text-muted)] motion-reduce:[&>svg]:transition-none">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="brand-body pb-5 pr-8">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              </motion.div>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
