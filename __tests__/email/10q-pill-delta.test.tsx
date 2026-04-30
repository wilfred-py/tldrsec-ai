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
  it('renders a green pill for a positive YoY delta (2 decimal places)', () => {
    const html = renderHtml(makeFiling([
      { label: 'Revenue', value: '$94B', change: '+6.1%' },
    ]));
    expect(html).toContain(PILL.positiveBg);
    expect(html).toContain(PILL.positiveFg);
    expect(html).toContain('+6.10%');
  });

  it('renders a red pill for a negative YoY delta with a unicode minus (2 decimal places)', () => {
    const html = renderHtml(makeFiling([
      { label: 'EPS', value: '$1.65', change: '-3.5%' },
    ]));
    expect(html).toContain(PILL.negativeBg);
    expect(html).toContain(PILL.negativeFg);
    expect(html).toContain('\u22123.50%');
  });

  it('renders a gray pill for a zero delta (2 decimal places)', () => {
    const html = renderHtml(makeFiling([
      { label: 'Buybacks', value: '$0', change: '0%' },
    ]));
    expect(html).toContain(PILL.neutralBg);
    expect(html).toContain(PILL.neutralFg);
    expect(html).toContain('0.00%');
  });

  it('pads single-digit integer percentages to 2 decimal places', () => {
    const html = renderHtml(makeFiling([
      { label: 'Revenue', value: '$611M', change: '+7%' },
    ]));
    expect(html).toContain('+7.00%');
    expect(html).not.toContain('+7%</span>');
  });

  it('rounds long-decimal percentages to 2 decimal places', () => {
    const html = renderHtml(makeFiling([
      { label: 'Net Income', value: '$133M', change: '+33.426%' },
    ]));
    expect(html).toContain('+33.43%');
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

  it('renders a green pill (with % suffix) for positive margin-point input "+1.33pp"', () => {
    const html = renderHtml(makeFiling([
      { label: 'Gross Margin', value: '51.43%', change: '+1.33pp' },
    ]));
    expect(html).toContain(PILL.positiveBg);
    expect(html).toContain('+1.33%');
    expect(html).not.toContain('+1.33pp');
  });

  it('renders a red pill (with % suffix) for negative margin-point input "-1.33pp"', () => {
    const html = renderHtml(makeFiling([
      { label: 'Gross Margin', value: '51.43%', change: '-1.33pp' },
    ]));
    expect(html).toContain(PILL.negativeBg);
    expect(html).toContain('\u22121.33%');
    expect(html).not.toContain('1.33pp');
  });

  it('treats "pts" and "points" as percentage-point synonyms (rendered with % suffix)', () => {
    const ptsHtml = renderHtml(makeFiling([
      { label: 'Op Margin', value: '30%', change: '+0.5 pts' },
    ]));
    expect(ptsHtml).toContain(PILL.positiveBg);
    expect(ptsHtml).toContain('+0.50%');

    const pointsHtml = renderHtml(makeFiling([
      { label: 'Op Margin', value: '30%', change: '-2 points' },
    ]));
    expect(pointsHtml).toContain(PILL.negativeBg);
    expect(pointsHtml).toContain('\u22122.00%');
  });

  it('formats short dollar magnitudes to 2 decimal places ("$94B" → "$94.00B")', () => {
    const html = renderHtml(makeFiling([
      { label: 'Revenue', value: '$94B', change: '+6.1%' },
    ]));
    expect(html).toContain('$94.00B');
    expect(html).not.toContain('>$94B<');
  });

  it('formats integer-percentage values to 2 decimal places ("30%" → "30.00%")', () => {
    const html = renderHtml(makeFiling([
      { label: 'Op Margin', value: '30%', change: '+0.5 pts' },
    ]));
    expect(html).toContain('>30.00%<');
  });

  it('passes through "N/A" values unchanged', () => {
    const html = renderHtml(makeFiling([
      { label: 'FCF Margin', value: 'N/A', change: 'N/A' },
    ]));
    expect(html).toContain('>N/A<');
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
    expect(html).toContain('+13.70%');
    expect(html).toContain('\u22123.50%');
    expect(html).toContain(PILL.positiveBg);
    expect(html).toContain(PILL.negativeBg);
  });

  it('does NOT apply pill color to the dollar value cell', () => {
    const html = renderHtml(makeFiling([
      { label: 'Revenue', value: '$94B', change: '+6.1%' },
    ]));
    // formatValue normalizes "$94B" → "$94.00B" — assert on the normalized form.
    const valueIndex = html.indexOf('$94.00B');
    expect(valueIndex).toBeGreaterThan(-1);
    // The dollar-value <td> immediately precedes the value text — its style
    // attribute ends just before it. Take a tight window that excludes the
    // following pill <td>.
    const cellStart = html.lastIndexOf('<td', valueIndex);
    const cellSlice = html.slice(cellStart, valueIndex);
    expect(cellSlice).not.toContain(PILL.positiveBg);
    expect(cellSlice).not.toContain(PILL.negativeBg);
  });

  it('renders exactly 6 financial-highlight rows (canonical 10-Q metric set, drops 7th)', () => {
    const html = renderHtml(makeFiling([
      { label: 'Revenue', value: '$611M', change: '+7%' },
      { label: 'Gross Margin', value: '51.43%', change: '+1.33pp' },
      { label: 'Operating Margin', value: '30.27%', change: '+0.50pp' },
      { label: 'FCF Margin', value: '28.00%', change: '+1pp' },
      { label: 'Net Income', value: '$133M', change: '-8.15%' },
      { label: 'EPS', value: '$3.59', change: '-6.75%' },
      { label: 'Cash from Ops', value: '$200M', change: '+5%' },
    ]));
    expect(html).toContain('Revenue');
    expect(html).toContain('FCF Margin');
    expect(html).toContain('EPS');
    expect(html).not.toContain('Cash from Ops');
  });

  it.each([
    ['$5K', '$5.00K'],
    ['$1T', '$1.00T'],
    ['$3', '$3.00'],
    ['$0M', '$0.00M'],
    ['100%', '100.00%'],
  ])('formatValue normalizes %s → %s in the Latest column', (input, expected) => {
    const html = renderHtml(makeFiling([{ label: 'Metric', value: input }]));
    expect(html).toContain(expected);
  });
});
