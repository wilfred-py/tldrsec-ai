import React from 'react';
import { render } from '@testing-library/react';

/**
 * Phase 4 — per-template integration smoke tests for the XSentimentBlock wrapper.
 *
 * Uses `data-testid="x-sentiment-section"` on the wrapper's outer table. Tests
 * assert presence/absence of that single attribute per template + payload state,
 * rather than full HTML snapshots (per /review_plan Issue 15A — drops snapshot
 * count from ~24 to a handful, keeps assertion narrow).
 *
 * Three states per template:
 *   1. Eligible payload     → section RENDERS
 *   2. xSentiment undefined → section ABSENT
 *   3. Guard-rejected (empty factClaims) → section ABSENT
 */

import { Form10KMinimalistTemplate } from '../10k-minimalist-template';
import { Form10QMinimalistTemplate } from '../10q-minimalist-template';
import { Form8KMinimalistTemplate } from '../8k-minimalist-template';
import { Form4MinimalistTemplate } from '../form4-minimalist-template';
import { Form144MinimalistTemplate } from '../form144-minimalist-template';
import { FormDEF14AMinimalistTemplate } from '../def14a-minimalist-template';
import { FormS1MinimalistTemplate } from '../s1-minimalist-template';
import { FormS3MinimalistTemplate } from '../s3-minimalist-template';
import { GenericMinimalistTemplate } from '../generic-minimalist-template';
import type { FilingTemplateData } from '../../../../../lib/email/types';

const baseFiling = (overrides: Partial<FilingTemplateData> = {}): FilingTemplateData => ({
  companyName: 'Tesla, Inc.',
  symbol: 'TSLA',
  filingType: '10-K',
  filingDate: '2026-01-30T00:00:00Z',
  filingUrl: 'https://www.sec.gov/Archives/edgar/data/1318605/000162828026003952',
  summaryText: 'Test filing summary.',
  ...overrides,
});

const eligibleSentiment: NonNullable<FilingTemplateData['summaryData']>['xSentiment'] = {
  direction: 'bullish',
  shift: 'stable',
  confidence: 'medium',
  factClaims: ['Apple beat earnings[1]'],
  opinionClaims: [],
  discussionSynthesis: 'Bulls noted the beat[1]; bears flagged guidance[2].',
  citationUrls: ['https://x.com/Bloomberg/status/1', 'https://x.com/CNBC/status/2'],
  windowHours: 168,
};

const guardRejectedSentiment: NonNullable<FilingTemplateData['summaryData']>['xSentiment'] = {
  ...eligibleSentiment,
  // Issue 3A: factClaims-empty regardless of confidence → wrapper renders nothing.
  factClaims: [],
};

const templates = [
  { name: '10-K', filingType: '10-K', Component: Form10KMinimalistTemplate },
  { name: '10-Q', filingType: '10-Q', Component: Form10QMinimalistTemplate },
  { name: '8-K', filingType: '8-K', Component: Form8KMinimalistTemplate },
  { name: 'Form 4', filingType: 'Form 4', Component: Form4MinimalistTemplate },
  { name: 'Form 144', filingType: 'Form 144', Component: Form144MinimalistTemplate },
  { name: 'DEF 14A', filingType: 'DEF 14A', Component: FormDEF14AMinimalistTemplate },
  { name: 'S-1', filingType: 'S-1', Component: FormS1MinimalistTemplate },
  { name: 'S-3', filingType: 'S-3', Component: FormS3MinimalistTemplate },
  { name: 'Generic', filingType: 'Other', Component: GenericMinimalistTemplate },
] as const;

describe.each(templates)('$name minimalist template — XSentimentBlock integration', ({ filingType, Component }) => {
  it('renders the X sentiment section when payload is eligible', () => {
    const filing = baseFiling({
      filingType,
      summaryData: { xSentiment: eligibleSentiment },
    });
    const { container } = render(<Component filing={filing} />);
    expect(container.querySelector('[data-testid="x-sentiment-section"]')).not.toBeNull();
    // Inline marker anchors must show up because synthesis carries [1][2].
    const inlineAnchors = container.querySelectorAll('a[aria-label^="Source"]');
    expect(inlineAnchors.length).toBeGreaterThan(0);
  });

  it('does not render the section when xSentiment is undefined', () => {
    const filing = baseFiling({ filingType, summaryData: {} });
    const { container } = render(<Component filing={filing} />);
    expect(container.querySelector('[data-testid="x-sentiment-section"]')).toBeNull();
  });

  it('does not render the section when guard rejects (factClaims empty)', () => {
    const filing = baseFiling({
      filingType,
      summaryData: { xSentiment: guardRejectedSentiment },
    });
    const { container } = render(<Component filing={filing} />);
    expect(container.querySelector('[data-testid="x-sentiment-section"]')).toBeNull();
  });
});
