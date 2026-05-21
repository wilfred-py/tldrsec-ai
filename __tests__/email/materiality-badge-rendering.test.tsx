/**
 * End-to-end rendering tests for the materiality badge slot in the 10-K and
 * 10-Q minimalist templates.
 *
 * Verifies the autoplan-approved contract:
 *   - high   → "HIGH MATERIALITY" pill + rationale + "Wrong call?" mailto
 *   - medium → "MEDIUM MATERIALITY" pill + rationale + mailto
 *   - low    → "LOW MATERIALITY" pill + rationale + mailto
 *   - noise  → fallback to "ANNUAL REPORT" / "QUARTERLY REPORT" pill; no rationale, no mailto
 *   - missing materialitySignal in summaryData → same as noise (safe default)
 */

import * as React from 'react';
import { render } from '@testing-library/react';
import { Form10KMinimalistTemplate } from '@/components/ui/email/templates/10k-minimalist-template';
import { Form10QMinimalistTemplate } from '@/components/ui/email/templates/10q-minimalist-template';
import { FilingTemplateData } from '@/lib/email/types';

function makeFiling(
  formType: '10-K' | '10-Q',
  materialitySignal?: { score: string; rationale: string },
): FilingTemplateData {
  return {
    companyName: 'Test Co',
    symbol: 'TEST',
    filingType: formType,
    filingDate: '2026-03-15',
    filingUrl: 'https://www.sec.gov/example',
    summaryText: '',
    summaryData: {
      headline: 'Test filing',
      financialHighlights: [],
      ...(materialitySignal ? { materialitySignal } : {}),
    } as never,
  };
}

function renderHtml(formType: '10-K' | '10-Q', materialitySignal?: { score: string; rationale: string }): string {
  const Template = formType === '10-K' ? Form10KMinimalistTemplate : Form10QMinimalistTemplate;
  const { container } = render(<Template filing={makeFiling(formType, materialitySignal)} />);
  return container.innerHTML;
}

describe('10-K materiality badge rendering', () => {
  it('renders HIGH MATERIALITY pill + rationale + mailto when score is high', () => {
    const html = renderHtml('10-K', {
      score: 'high',
      rationale: 'FY26 revenue +65% YoY to $215.9B; $4.5B H20 inventory charge.',
    });
    expect(html).toContain('HIGH MATERIALITY');
    expect(html).toContain('FY26 revenue +65% YoY');
    expect(html).toContain('Wrong call?');
    expect(html).toContain('mailto:materiality-feedback');
    // Form-type fallback must NOT also render (autoplan Decision #15: single badge slot)
    expect(html).not.toContain('ANNUAL REPORT');
  });

  it('renders MEDIUM MATERIALITY pill when score is medium', () => {
    const html = renderHtml('10-K', { score: 'medium', rationale: 'Segment realignment per Item 7.' });
    expect(html).toContain('MEDIUM MATERIALITY');
    expect(html).toContain('Segment realignment per Item 7.');
    expect(html).not.toContain('ANNUAL REPORT');
  });

  it('renders LOW MATERIALITY pill when score is low', () => {
    const html = renderHtml('10-K', { score: 'low', rationale: 'Routine annual filing with in-line numbers.' });
    expect(html).toContain('LOW MATERIALITY');
    expect(html).toContain('Routine annual filing with in-line numbers.');
  });

  it('falls back to ANNUAL REPORT and suppresses rationale + mailto on noise', () => {
    const html = renderHtml('10-K', { score: 'noise', rationale: 'No actionable signal.' });
    expect(html).toContain('ANNUAL REPORT');
    expect(html).not.toContain('HIGH MATERIALITY');
    expect(html).not.toContain('Wrong call?');
    // The noise rationale should NOT leak into the email
    expect(html).not.toContain('No actionable signal.');
  });

  it('falls back to ANNUAL REPORT when materialitySignal is absent from summaryData', () => {
    const html = renderHtml('10-K');
    expect(html).toContain('ANNUAL REPORT');
    expect(html).not.toContain('HIGH MATERIALITY');
    expect(html).not.toContain('Wrong call?');
  });

  it('falls back to ANNUAL REPORT when materialitySignal has an invalid score', () => {
    const html = renderHtml('10-K', { score: 'CRITICAL', rationale: 'some rationale' });
    expect(html).toContain('ANNUAL REPORT');
    expect(html).not.toContain('HIGH MATERIALITY');
  });
});

describe('10-Q materiality badge rendering', () => {
  it('renders HIGH MATERIALITY pill + rationale + mailto when score is high', () => {
    const html = renderHtml('10-Q', {
      score: 'high',
      rationale: 'Q1 revenue +33% YoY; $8.03B AMT tax benefit.',
    });
    expect(html).toContain('HIGH MATERIALITY');
    expect(html).toContain('Q1 revenue +33% YoY');
    expect(html).toContain('Wrong call?');
    expect(html).not.toContain('QUARTERLY REPORT');
  });

  it('renders MEDIUM MATERIALITY pill when score is medium', () => {
    const html = renderHtml('10-Q', { score: 'medium', rationale: '3-5% YoY EPS miss per Item 2.' });
    expect(html).toContain('MEDIUM MATERIALITY');
    expect(html).toContain('3-5% YoY EPS miss per Item 2.');
  });

  it('falls back to QUARTERLY REPORT on noise', () => {
    const html = renderHtml('10-Q', { score: 'noise', rationale: 'Routine quarter, no actionable signal.' });
    expect(html).toContain('QUARTERLY REPORT');
    expect(html).not.toContain('HIGH MATERIALITY');
    expect(html).not.toContain('Wrong call?');
  });

  it('falls back to QUARTERLY REPORT when materialitySignal is absent', () => {
    const html = renderHtml('10-Q');
    expect(html).toContain('QUARTERLY REPORT');
    expect(html).not.toContain('Wrong call?');
  });
});

describe('mailto: link encoding', () => {
  it('includes ticker and form type in subject line', () => {
    const html = renderHtml('10-K', { score: 'high', rationale: 'Test rationale long enough to pass.' });
    expect(html).toMatch(/mailto:materiality-feedback@[^"]*\?subject=Materiality%20feedback%3A%20TEST%2010-K/);
  });
});
