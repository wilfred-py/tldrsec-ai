import React from 'react';
import { render } from '@testing-library/react';
import { CampaignDemoTemplate } from '../campaign-demo-template';

const baseProps = {
  ticker: 'VRT',
  companyName: 'Vertiv Holdings Co',
  filingType: '10-Q',
  filingDate: '2026-04-22',
  signalLevel: 'HIGH' as const,
  signalVerdict: 'Backlog more than doubled YoY to over $15B',
  signalDescription: 'Adjusted EPS up 83% YoY to $1.17, beating consensus by ~16%.',
  summaryText: 'Vertiv reported strong Q1 2026 results.',
  unsubscribeUrl: 'https://tldrsec.app/unsubscribe?token=abc',
};

describe('CampaignDemoTemplate · founderNoteVariant', () => {
  describe('compact (default)', () => {
    it('renders a single centered italic paragraph when founderNote is set', () => {
      const { container } = render(
        <CampaignDemoTemplate {...baseProps} founderNote="Hi from the founder." />
      );
      const paragraphs = container.querySelectorAll('p');
      const founderP = Array.from(paragraphs).find(p => p.textContent === 'Hi from the founder.');
      expect(founderP).toBeTruthy();
      expect(founderP!.getAttribute('style')).toContain('font-style: italic');
      expect(founderP!.getAttribute('style')).toContain('font-size: 13px');
    });

    it('falls back to default copy when founderNote is missing', () => {
      const { container } = render(<CampaignDemoTemplate {...baseProps} />);
      expect(container.textContent).toContain('This is a sample of what');
    });
  });

  describe('letter variant', () => {
    const FOUNDER_NOTE = [
      'I built tldrSEC because I care about my portfolio.',
      'What I wanted was an equity analyst in my pocket.',
      'Vertiv ran nearly 4x in twelve months.',
      'Founder, tldrSEC\nWilf',
    ].join('\n\n');

    it('splits on blank lines into multiple <p> elements', () => {
      const { container } = render(
        <CampaignDemoTemplate
          {...baseProps}
          founderNote={FOUNDER_NOTE}
          founderNoteVariant="letter"
        />
      );
      const founderText = 'I built tldrSEC because I care about my portfolio.';
      const founderP = Array.from(container.querySelectorAll('p')).find(
        p => p.textContent === founderText
      );
      expect(founderP).toBeTruthy();
      const allParas = Array.from(container.querySelectorAll('p')).filter(p =>
        ['I built tldrSEC because I care about my portfolio.',
         'What I wanted was an equity analyst in my pocket.',
         'Vertiv ran nearly 4x in twelve months.'].includes(p.textContent || '')
      );
      expect(allParas.length).toBe(3);
    });

    it('renders \\n within a paragraph as <br/> (preserves Founder/Wilf signoff lines)', () => {
      const { container } = render(
        <CampaignDemoTemplate
          {...baseProps}
          founderNote={FOUNDER_NOTE}
          founderNoteVariant="letter"
        />
      );
      const signoffP = Array.from(container.querySelectorAll('p')).find(p =>
        (p.textContent || '').includes('Founder, tldrSEC') && (p.textContent || '').includes('Wilf')
      );
      expect(signoffP).toBeTruthy();
      expect(signoffP!.querySelector('br')).toBeTruthy();
    });

    it('uses left-aligned 14px non-italic styling', () => {
      const { container } = render(
        <CampaignDemoTemplate
          {...baseProps}
          founderNote="Single paragraph note."
          founderNoteVariant="letter"
        />
      );
      const founderP = Array.from(container.querySelectorAll('p')).find(
        p => p.textContent === 'Single paragraph note.'
      );
      expect(founderP).toBeTruthy();
      const style = founderP!.getAttribute('style') || '';
      expect(style).toContain('font-size: 14px');
      expect(style).not.toContain('font-style: italic');
      const td = founderP!.closest('td');
      expect(td?.getAttribute('style')).toContain('text-align: left');
    });

    it('omits the fallback default-copy block when letter variant is set without note', () => {
      const { container } = render(
        <CampaignDemoTemplate {...baseProps} founderNoteVariant="letter" />
      );
      expect(container.textContent).toContain('This is a sample of what');
    });
  });
});
