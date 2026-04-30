import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { SUBSCRIPTION_PLANS } from '@/lib/stripe/plans';

// Mock framer-motion to strip animation props and render plain DOM
jest.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(
      (
        {
          children,
          initial,
          animate,
          whileInView,
          whileHover,
          variants,
          viewport,
          transition,
          ...props
        }: React.PropsWithChildren<Record<string, unknown>>,
        ref
      ) => (
        <div ref={ref as React.Ref<HTMLDivElement>} {...props}>
          {children}
        </div>
      )
    ),
  },
}));

// Radix accordion uses ResizeObserver; jsdom does not provide it.
if (typeof global.ResizeObserver === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

import { FAQSectionV2, faqItems } from '@/components/landing/sections-v2/faq-section-v2';

describe('FAQSectionV2', () => {
  it('renders all 6 FAQ questions as accordion triggers', () => {
    render(<FAQSectionV2 />);
    const triggers = screen.getAllByRole('button');
    expect(triggers).toHaveLength(6);
  });

  it('renders the section heading', () => {
    render(<FAQSectionV2 />);
    expect(
      screen.getByRole('heading', { name: /before you start your trial/i })
    ).toBeInTheDocument();
  });

  it('collapses all items by default', () => {
    render(<FAQSectionV2 />);
    const triggers = screen.getAllByRole('button');
    triggers.forEach((trigger) => {
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('expands an item when its trigger is clicked', async () => {
    const user = userEvent.setup();
    render(<FAQSectionV2 />);
    const cancelTrigger = screen.getByRole('button', {
      name: /can i cancel anytime/i,
    });
    await user.click(cancelTrigger);
    expect(cancelTrigger).toHaveAttribute('aria-expanded', 'true');
  });

  // Pricing regression guard — Pro-vs-Max intentionally omits prices now
  // (pricing cards own that). The ticker limit is the remaining dynamic value.
  it('renders Pro ticker limit from SUBSCRIPTION_PLANS in the Pro-vs-Max answer', () => {
    const proAnswer = faqItems.find((i) => i.id === 'pro-vs-max')?.answerPlain;
    expect(proAnswer).toContain(String(SUBSCRIPTION_PLANS.PRO.tickerLimit));
  });

  it('Pro-vs-Max answer does not leak monthly prices (owned by pricing cards)', () => {
    const pro = faqItems.find((i) => i.id === 'pro-vs-max');
    expect(pro?.answerPlain).not.toContain(
      `$${SUBSCRIPTION_PLANS.PRO.monthlyPrice}`
    );
    expect(pro?.answerPlain).not.toContain(
      `$${SUBSCRIPTION_PLANS.MAX.monthlyPrice}`
    );
  });

  // Pro-vs-Max must differentiate Max via web-context enrichment — the core
  // value prop introduced in the X Search MAX-only feature. If this test
  // fails, the FAQ stopped explaining why Max costs more than Pro.
  it('Pro-vs-Max answer calls out enriched/web-context differentiation', () => {
    const pro = faqItems.find((i) => i.id === 'pro-vs-max');
    expect(pro?.answerPlain).toMatch(/enrich|web context|web-context/i);
  });

  it('removed FAQ items (companies, advice, data) are not present', () => {
    const ids = faqItems.map((i) => i.id);
    expect(ids).not.toContain('companies');
    expect(ids).not.toContain('advice');
    expect(ids).not.toContain('data');
  });

  it('keeps answer (JSX) and answerPlain (string) in sync for every item', () => {
    // Critical invariant: JSON-LD uses answerPlain, UI uses answer.
    // For all-string answers, they must be identical references.
    faqItems.forEach((item) => {
      if (typeof item.answer === 'string') {
        expect(item.answer).toBe(item.answerPlain);
      }
    });
  });
});
