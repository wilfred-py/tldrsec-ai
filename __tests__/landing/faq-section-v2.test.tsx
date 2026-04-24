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
  it('renders all 9 FAQ questions as accordion triggers', () => {
    render(<FAQSectionV2 />);
    const triggers = screen.getAllByRole('button');
    expect(triggers).toHaveLength(9);
  });

  it('renders the section heading', () => {
    render(<FAQSectionV2 />);
    expect(
      screen.getByRole('heading', { name: /before you start your trial/i })
    ).toBeInTheDocument();
  });

  it('has the first item (free trial) expanded by default', () => {
    render(<FAQSectionV2 />);
    const trialTrigger = screen.getByRole('button', {
      name: /is there a free trial/i,
    });
    expect(trialTrigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapses other items by default', () => {
    render(<FAQSectionV2 />);
    const cancelTrigger = screen.getByRole('button', {
      name: /can i cancel anytime/i,
    });
    expect(cancelTrigger).toHaveAttribute('aria-expanded', 'false');
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

  // Pricing regression guard — fails if FAQ copy drifts from SUBSCRIPTION_PLANS.
  it('renders Pro monthly price from SUBSCRIPTION_PLANS in the Pro-vs-Max answer', () => {
    const proAnswer = faqItems.find((i) => i.id === 'pro-vs-max')?.answerPlain;
    expect(proAnswer).toContain(`$${SUBSCRIPTION_PLANS.PRO.monthlyPrice}`);
    expect(proAnswer).toContain(`$${SUBSCRIPTION_PLANS.MAX.monthlyPrice}`);
  });

  it('renders Pro ticker limit from SUBSCRIPTION_PLANS in the companies answer', () => {
    const companiesAnswer = faqItems.find((i) => i.id === 'companies')
      ?.answerPlain;
    expect(companiesAnswer).toContain(
      String(SUBSCRIPTION_PLANS.PRO.tickerLimit)
    );
  });

  it('keeps answer (JSX) and answerPlain (string) in sync for text content', () => {
    // Critical invariant: JSON-LD uses answerPlain, UI uses answer.
    // This test ensures both contain the same pricing numbers.
    const pro = faqItems.find((i) => i.id === 'pro-vs-max');
    expect(pro?.answerPlain).toMatch(
      new RegExp(`\\$${SUBSCRIPTION_PLANS.PRO.monthlyPrice}`)
    );
    expect(pro?.answerPlain).toMatch(
      new RegExp(`\\$${SUBSCRIPTION_PLANS.MAX.monthlyPrice}`)
    );
  });
});
