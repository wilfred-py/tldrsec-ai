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

type FaqItem = {
  id: string;
  question: string;
  /** Rendered in the accordion. JSX for inline pricing, plain string otherwise. */
  answer: ReactNode;
  /** Plain-text mirror of `answer` for FAQPage JSON-LD. Must stay 1:1 with `answer`. */
  answerPlain: string;
};

const PRO_VS_MAX = `Pro is built for focused investors tracking a specific watchlist — up to ${PRO.tickerLimit} companies with standard AI summaries on a priority queue. Max is built for analysts and research teams who need every edge — unlimited companies, first-priority processing ahead of every other tier, and summaries enriched with live web context (recent news, market reaction, analyst takes) that Pro and Free don't get.`;

const TRIAL_ANSWER =
  'Every paid plan starts with a 7-day trial at $0. You get full access to every Max-tier feature during the trial — unlimited company tracking, first-priority filing processing, and every filing type we support.';

const FILINGS_ANSWER =
  'All major SEC filings — annual reports (10-K, 20-F, 40-F), quarterlies (10-Q, 6-K), material events (8-K), insider transactions (Forms 3, 4, 5, 144), beneficial ownership (SC 13D/G, 13F), proxies (DEF 14A, PRE 14A), and registrations (S-1, S-3, F-1, 424B). If EDGAR publishes it, we cover it.';

const SPEED_ANSWER =
  'Filings are processed on a priority queue as soon as EDGAR publishes. Speed depends on EDGAR availability and filing size.';

export const faqItems: FaqItem[] = [
  {
    id: 'trial',
    question: 'Is there a free trial?',
    answer: TRIAL_ANSWER,
    answerPlain: TRIAL_ANSWER,
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
    answer: FILINGS_ANSWER,
    answerPlain: FILINGS_ANSWER,
  },
  {
    id: 'speed',
    question: 'How quickly are filings processed?',
    answer: SPEED_ANSWER,
    answerPlain: SPEED_ANSWER,
  },
];

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
        </motion.div>

        {/* FAQ Accordion */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={viewportOnce}
          className="max-w-3xl mx-auto"
        >
          <Accordion type="single" collapsible className="w-full">
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
