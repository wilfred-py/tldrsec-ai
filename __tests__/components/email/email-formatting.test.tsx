import { render } from '@testing-library/react';
import { Form4MinimalistTemplate } from '@/components/ui/email/templates/form4-minimalist-template';
import { EmailSubjectService } from '@/lib/email/subject-service';
import type { FilingTemplateData } from '@/lib/email/types';

describe('Email Template Formatting', () => {
  describe('section formatting', () => {
    it('should use markdown section headers in summary text', () => {
      // Arrange
      const mockFiling: FilingTemplateData = {
        companyName: 'Tesla Inc.',
        symbol: 'TSLA',
        filingType: '10-K',
        filingDate: '2026-01-20',
        filingUrl: 'https://example.com',
        summaryText: '## Key Highlights\n\nRevenue increased 25%.\n\n## Risk Factors\n\nSupply chain issues persist.',
        summaryData: {
          summary: '## Key Highlights\n\nRevenue increased 25%.\n\n## Risk Factors\n\nSupply chain issues persist.',
          filerName: 'Test Filer',
          transactions: []
        }
      };

      // Act
      const { container } = render(<Form4MinimalistTemplate filing={mockFiling} />);
      const html = container.innerHTML;

      // Assert - should render markdown h2 as styled divs (email-safe)
      expect(html).toMatch(/font-size:15px.*font-weight:600/);  // h2 styling
      expect(html).toContain('Key Highlights');
      expect(html).toContain('Revenue increased 25%');
    });

    it('should render bullet lists from markdown', () => {
      // Arrange
      const mockFiling: FilingTemplateData = {
        companyName: 'Test Corp',
        symbol: 'TEST',
        filingType: '8-K',
        filingDate: '2026-01-20',
        filingUrl: 'https://example.com',
        summaryText: '## Key Points\n\n- Point 1\n- Point 2\n- Point 3',
        summaryData: {
          summary: '## Key Points\n\n- Point 1\n- Point 2\n- Point 3',
          filerName: 'Test Filer',
          transactions: []
        }
      };

      // Act
      const { container } = render(<Form4MinimalistTemplate filing={mockFiling} />);
      const html = container.innerHTML;

      // Assert - should render markdown lists as styled divs with bullet characters (email-safe)
      expect(html).toContain('•');  // Bullet character
      expect(html).toMatch(/Point 1.*Point 2.*Point 3/s);
    });

    it('should add paragraph spacing for readability', () => {
      // Arrange
      const mockFiling: FilingTemplateData = {
        companyName: 'Test Corp',
        symbol: 'TEST',
        filingType: 'Form 4',
        filingDate: '2026-01-20',
        filingUrl: 'https://example.com',
        summaryText: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
        summaryData: {
          summary: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
          filerName: 'Test Filer',
          transactions: []
        }
      };

      // Act
      const { container } = render(<Form4MinimalistTemplate filing={mockFiling} />);
      const html = container.innerHTML;

      // Assert - double newlines should create separate paragraphs
      const paragraphMatches = html.match(/<p\s+style/g);
      expect(paragraphMatches).not.toBeNull();
      expect(paragraphMatches!.length).toBeGreaterThanOrEqual(2);  // At least 2 separate paragraphs
    });
  });

  describe('amended filing indicator', () => {
    it('should add [AMENDED] to subject for /A form types', () => {
      // Arrange
      const params = {
        filingType: 'Form 4/A',  // Amended form
        companyName: 'Tesla Inc.',
        ticker: 'TSLA'
      };

      // Act
      const subject = EmailSubjectService.generateSingleFilingSubject(params);

      // Assert
      expect(subject).toContain('[AMENDED]');
      expect(subject).toMatch(/\[AMENDED\].*Form 4\/A/);
    });

    it('should NOT add [AMENDED] to original filings', () => {
      // Arrange
      const params = {
        filingType: 'Form 4',  // Original, not amended
        companyName: 'Tesla Inc.',
        ticker: 'TSLA'
      };

      // Act
      const subject = EmailSubjectService.generateSingleFilingSubject(params);

      // Assert
      expect(subject).not.toContain('[AMENDED]');
      expect(subject).toContain('New Form 4 Filing');
    });

    it('should handle all /A suffix variants', () => {
      // Arrange
      const formTypes = ['10-K/A', '10-Q/A', '8-K/A', 'Form 4/A', 'Form 144/A'];

      // Act & Assert
      formTypes.forEach(formType => {
        const subject = EmailSubjectService.generateSingleFilingSubject({
          filingType: formType,
          companyName: 'Test Corp',
          ticker: 'TEST'
        });

        expect(subject).toContain('[AMENDED]');
        expect(subject).toContain(formType);
      });
    });

    it('should place [AMENDED] at the start of subject line', () => {
      // Arrange
      const params = {
        filingType: '10-K/A',
        companyName: 'Apple Inc.',
        ticker: 'AAPL'
      };

      // Act
      const subject = EmailSubjectService.generateSingleFilingSubject(params);

      // Assert
      expect(subject).toMatch(/^\[AMENDED\]/);
    });
  });
});
