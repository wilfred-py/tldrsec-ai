import React from 'react';
import { render } from '@testing-library/react';
import SECFilingEmailTemplate from '../SECFilingEmailTemplate';
import { FilingTemplateData } from '../../../../lib/email/types';

describe('SECFilingEmailTemplate Router', () => {
  const baseFiling: FilingTemplateData = {
    companyName: 'Test Company',
    ticker: 'TEST',
    filingType: '10-K',
    filingDate: '2025-12-01',
    filingUrl: 'https://example.com/filing',
    summaryText: 'Test summary text',
    documentUrl: 'https://example.com/doc',
    accessionNumber: '0000000000-00-000000',
    summaryData: {},
    keyPoints: []
  };

  describe('Template Selection Logic', () => {
    it('selects Form4MinimalistTemplate for Form 4', () => {
      const filing = { ...baseFiling, filingType: 'Form 4' };
      const { container } = render(<SECFilingEmailTemplate filing={filing} />);
      // Check for Form 4 minimalist template content (Key Transaction section)
      expect(container.innerHTML).toContain('Key Transaction');
    });

    it('selects Form4MinimalistTemplate for insider forms 3/4/5', () => {
      const filingTypes = ['Form 3', 'Form 4', 'Form 5', '3', '4', '5'];
      filingTypes.forEach(type => {
        const filing = { ...baseFiling, filingType: type };
        const { container } = render(<SECFilingEmailTemplate filing={filing} />);
        // Form4MinimalistTemplate shows Key Transaction section
        expect(container.innerHTML).toContain('Key Transaction');
      });
    });

    it('selects Form10KMinimalistTemplate for 10-K', () => {
      const filingTypes = ['10-K', 'Form 10-K'];
      filingTypes.forEach(type => {
        const filing = { ...baseFiling, filingType: type };
        const { container } = render(<SECFilingEmailTemplate filing={filing} />);
        // 10-K minimalist template shows the filing type in header and tldrSEC branding
        expect(container.innerHTML).toContain('10-K');
        expect(container.innerHTML).toContain('tldrSEC');
      });
    });

    it('selects Form10QMinimalistTemplate for 10-Q', () => {
      const filingTypes = ['10-Q', 'Form 10-Q'];
      filingTypes.forEach(type => {
        const filing = { ...baseFiling, filingType: type };
        const { container } = render(<SECFilingEmailTemplate filing={filing} />);
        // 10-Q minimalist template shows the filing type in header and tldrSEC branding
        expect(container.innerHTML).toContain('10-Q');
        expect(container.innerHTML).toContain('tldrSEC');
      });
    });

    it('selects existing templates for specialized forms', () => {
      const specializedForms = [
        'Form 11-K',
        'Form 144',
        'DEF 14A',
        'Schedule 13D'
      ];
      specializedForms.forEach(type => {
        const filing = { ...baseFiling, filingType: type };
        const { container } = render(<SECFilingEmailTemplate filing={filing} />);
        // Should render without error
        expect(container.innerHTML).toBeTruthy();
      });
    });

    it('selects GenericMinimalistTemplate for unknown filing types', () => {
      const filing = { ...baseFiling, filingType: 'Unknown Type' };
      const { container } = render(<SECFilingEmailTemplate filing={filing} />);
      // Generic minimalist template shows tldrSEC branding and Summary section
      expect(container.innerHTML).toContain('tldrSEC');
      expect(container.innerHTML).toContain('Summary');
    });
  });

  describe('Edge Cases', () => {
    it('handles missing summaryData gracefully', () => {
      const filing = { ...baseFiling, summaryData: undefined };
      const { container } = render(<SECFilingEmailTemplate filing={filing} />);
      expect(container.innerHTML).toBeTruthy();
    });

    it('handles missing company name', () => {
      const filing = { ...baseFiling, companyName: '' };
      const { container } = render(<SECFilingEmailTemplate filing={filing} />);
      // Template still renders with empty company name (graceful degradation)
      expect(container.innerHTML).toContain('tldrSEC');
      expect(container.innerHTML).toBeTruthy();
    });

    it('handles extremely long summary text', () => {
      const longText = 'A'.repeat(10000);
      const filing = { ...baseFiling, summaryText: longText };
      const { container } = render(<SECFilingEmailTemplate filing={filing} />);
      expect(container.innerHTML).toBeTruthy();
    });

    it('handles special characters in company names', () => {
      const filing = { ...baseFiling, companyName: 'Test & Co. <Ltd>' };
      const { container } = render(<SECFilingEmailTemplate filing={filing} />);
      // React should escape special characters
      expect(container.innerHTML).not.toContain('<Ltd>');
      expect(container.innerHTML).toContain('&lt;Ltd&gt;');
    });
  });
});