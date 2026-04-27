/**
 * Regression tests for the 10-Q financial scorecard PillDelta component.
 *
 * Renders the full Form10QMinimalistTemplate with realistic financial data,
 * then asserts the rendered HTML contains the expected pill colors and text
 * for each tone: positive (green), negative (red), zero (gray), unparseable
 * (gray, not green — that was the bug).
 */

import * as React from 'react';
import { render } from '@testing-library/react';
import { Form10QMinimalistTemplate } from '@/components/ui/email/templates/10q-minimalist-template';
import { EmailColors } from '@/components/ui/email/design-system';
import { FilingTemplateData } from '@/lib/email/types';

function makeFiling(financialHighlights: Array<{
  label: string;
  value: string;
  change?: string | number;
  qoqChange?: string | number;
}>): FilingTemplateData {
  return {
    companyName: 'Apple Inc.',
    symbol: 'AAPL',
    filingType: '10-Q',
    filingDate: '2026-01-15',
    filingUrl: 'https://www.sec.gov/example',
    summaryText: '',
    summaryData: {
      headline: 'AAPL Q1',
      keyPoints: ['Q1 beat estimates'],
      financialHighlights,
    } as never,
  };
}

function renderHtml(filing: FilingTemplateData): string {
  const { container } = render(<Form10QMinimalistTemplate filing={filing} />);
  return container.innerHTML;
}

/**
 * JSDOM converts inline `backgroundColor: '#ECFDF5'` to
 * `background-color: rgb(236, 253, 245)` in the rendered HTML, so we
 * convert the design-token hex into the same rgb string the assertion
 * actually needs to find.
 */
function hexToRgbString(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

const PILL = {
  positiveBg: hexToRgbString(EmailColors.semantic.pillPositiveBg),
  positiveFg: hexToRgbString(EmailColors.semantic.pillPositiveFg),
  negativeBg: hexToRgbString(EmailColors.semantic.pillNegativeBg),
  negativeFg: hexToRgbString(EmailColors.semantic.pillNegativeFg),
  neutralBg: hexToRgbString(EmailColors.semantic.pillNeutralBg),
  neutralFg: hexToRgbString(EmailColors.semantic.pillNeutralFg),
};

describe('Form10QMinimalistTemplate — PillDelta', () => {
  it('renders a green pill for a positive YoY delta', () => {
    const html = renderHtml(makeFiling([
      { label: 'Revenue', value: '$94B', change: '+6.1%' },
    ]));
    expect(html).toContain(PILL.positiveBg);
    expect(html).toContain(PILL.positiveFg);
    expect(html).toContain('+6.1%');
  });

  it('renders a red pill for a negative YoY delta with a unicode minus', () => {
    const html = renderHtml(makeFiling([
      { label: 'EPS', value: '$1.65', change: '-3.5%' },
    ]));
    expect(html).toContain(PILL.negativeBg);
    expect(html).toContain(PILL.negativeFg);
    expect(html).toContain('\u22123.5%');
  });

  it('renders a gray pill for a zero delta', () => {
    const html = renderHtml(makeFiling([
      { label: 'Buybacks', value: '$0', change: '0%' },
    ]));
    expect(html).toContain(PILL.neutralBg);
    expect(html).toContain(PILL.neutralFg);
    expect(html).toContain('0%');
  });

  it('renders a gray pill (NOT green) for unparseable strings like "N/A"', () => {
    const html = renderHtml(makeFiling([
      { label: 'Revenue', value: '$94B', change: 'N/A' },
    ]));
    expect(html).toContain(PILL.neutralBg);
    expect(html).toContain(PILL.neutralFg);
    expect(html).toContain('N/A');
    const naIndex = html.indexOf('N/A');
    const surroundingPill = html.slice(Math.max(0, naIndex - 300), naIndex + 50);
    expect(surroundingPill).not.toContain(PILL.positiveBg);
  });

  it('renders a gray pill (NOT green) for basis-point measures like "5 points"', () => {
    const html = renderHtml(makeFiling([
      { label: 'Net margin', value: '38%', change: '+5 points' },
    ]));
    expect(html).toContain(PILL.neutralBg);
    expect(html).toContain('+5 points');
    const idx = html.indexOf('+5 points');
    const surroundingPill = html.slice(Math.max(0, idx - 300), idx + 50);
    expect(surroundingPill).not.toContain(PILL.positiveBg);
  });

  it('renders an em-dash placeholder when delta is missing', () => {
    const html = renderHtml(makeFiling([
      { label: 'Revenue', value: '$94B' },
    ]));
    expect(html).toContain('—');
  });

  it('renders YoY and QoQ pills independently in the same row', () => {
    const html = renderHtml(makeFiling([
      { label: 'EPS', value: '$1.65', change: '+13.7%', qoqChange: '-3.5%' },
    ]));
    expect(html).toContain('+13.7%');
    expect(html).toContain('\u22123.5%');
    expect(html).toContain(PILL.positiveBg);
    expect(html).toContain(PILL.negativeBg);
  });

  it('does NOT apply pill color to the dollar value cell', () => {
    const html = renderHtml(makeFiling([
      { label: 'Revenue', value: '$94B', change: '+6.1%' },
    ]));
    const valueIndex = html.indexOf('$94B');
    expect(valueIndex).toBeGreaterThan(-1);
    // The dollar-value <td> immediately precedes "$94B" — its style attribute
    // ends just before the text. Take a tight window that excludes the
    // following pill <td>.
    const cellStart = html.lastIndexOf('<td', valueIndex);
    const cellSlice = html.slice(cellStart, valueIndex);
    expect(cellSlice).not.toContain(PILL.positiveBg);
    expect(cellSlice).not.toContain(PILL.negativeBg);
  });
});
