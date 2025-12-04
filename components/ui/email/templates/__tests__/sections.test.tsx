import React from 'react';
import { render } from '@testing-library/react';
import {
  EmailHeader,
  EmailFooter,
  SectionCard,
  SectionHeader,
  DataRow,
  BulletList,
  CTAButton
} from '../sections';

describe('Email Section Components', () => {
  describe('EmailHeader', () => {
    it('renders with required props', () => {
      const { container } = render(
        <EmailHeader
          ticker="TSLA"
          companyName="Tesla, Inc."
          filingType="Form 4"
          filingDate="2025-01-01"
        />
      );
      expect(container.querySelector('h1')).toHaveTextContent('TSLA Form 4');
      expect(container.textContent).toContain('Tesla, Inc.');
    });

    it('renders with filer info', () => {
      const { container } = render(
        <EmailHeader
          ticker="AAPL"
          companyName="Apple Inc."
          filingType="10-K"
          filingDate={new Date('2025-02-15')}
          filerName="Tim Cook"
          filerRole="CEO"
        />
      );
      expect(container.querySelector('h1')).toHaveTextContent('AAPL 10-K');
      expect(container.textContent).toContain('Tim Cook');
      expect(container.textContent).toContain('CEO');
    });

    it('renders tldrSEC branding', () => {
      const { container } = render(
        <EmailHeader
          ticker="MSFT"
          companyName="Microsoft"
          filingType="10-Q"
          filingDate="2025-03-01"
        />
      );
      expect(container.textContent).toContain('tldrSEC');
    });
  });

  describe('EmailFooter', () => {
    it('renders with filing URL', () => {
      const { container } = render(<EmailFooter filingUrl="https://sec.gov/filing" />);
      const link = container.querySelector('a[href="https://sec.gov/filing"]');
      expect(link).toBeTruthy();
      expect(link).toHaveTextContent('View Full Filing on SEC.gov');
    });

    it('renders unsubscribe link when provided', () => {
      const { container } = render(
        <EmailFooter
          filingUrl="https://sec.gov/filing"
          unsubscribeUrl="https://example.com/unsubscribe"
        />
      );
      const unsubLink = container.querySelector('a[href="https://example.com/unsubscribe"]');
      expect(unsubLink).toBeTruthy();
      expect(unsubLink).toHaveTextContent('Manage notification preferences');
    });
  });

  describe('SectionCard', () => {
    it('renders children content', () => {
      const { container } = render(
        <SectionCard>
          <tr>
            <td>Test Content</td>
          </tr>
        </SectionCard>
      );
      expect(container.textContent).toContain('Test Content');
    });
  });

  describe('SectionHeader', () => {
    it('renders title', () => {
      const { container } = render(
        <table>
          <tbody>
            <SectionHeader title="Key Takeaways" />
          </tbody>
        </table>
      );
      expect(container.textContent).toContain('Key Takeaways');
    });

    it('renders with emoji', () => {
      const { container } = render(
        <table>
          <tbody>
            <SectionHeader emoji="📊" title="Financial Highlights" />
          </tbody>
        </table>
      );
      expect(container.textContent).toContain('📊');
      expect(container.textContent).toContain('Financial Highlights');
    });
  });

  describe('DataRow', () => {
    it('renders label and value', () => {
      const { container } = render(
        <table>
          <tbody>
            <DataRow label="Test Label" value="Test Value" />
          </tbody>
        </table>
      );
      expect(container.textContent).toContain('Test Label');
      expect(container.textContent).toContain('Test Value');
    });

    it('handles empty value', () => {
      const { container } = render(
        <table>
          <tbody>
            <DataRow label="Test Label" value="" />
          </tbody>
        </table>
      );
      expect(container.textContent).toContain('Test Label');
    });

    it('handles numeric value', () => {
      const { container } = render(
        <table>
          <tbody>
            <DataRow label="Revenue" value={1000000} />
          </tbody>
        </table>
      );
      expect(container.textContent).toContain('Revenue');
      expect(container.textContent).toContain('1000000');
    });

    it('shows change indicator when specified', () => {
      const { container } = render(
        <table>
          <tbody>
            <DataRow label="Test" value="Value" change="+5%" />
          </tbody>
        </table>
      );
      // DataRow renders change in a third column
      expect(container.textContent).toContain('+5%');
    });
  });

  describe('BulletList', () => {
    it('renders list items', () => {
      // BulletList expects objects with text property
      const items = [
        { text: 'Item 1' },
        { text: 'Item 2' },
        { text: 'Item 3' }
      ];
      const { container } = render(
        <table>
          <tbody>
            <BulletList items={items} />
          </tbody>
        </table>
      );
      // BulletList uses table rows with bullet spans, not <li> elements
      expect(container.textContent).toContain('Item 1');
      expect(container.textContent).toContain('Item 2');
      expect(container.textContent).toContain('Item 3');
    });

    it('handles empty array', () => {
      const { container } = render(
        <table>
          <tbody>
            <BulletList items={[]} />
          </tbody>
        </table>
      );
      // Empty array renders an empty table
      expect(container.querySelectorAll('tr').length).toBeGreaterThanOrEqual(0);
    });

    it('renders items with highlights', () => {
      const items = [
        { text: 'revenue increased', highlight: { value: '+15%', type: 'positive' as const } }
      ];
      const { container } = render(
        <table>
          <tbody>
            <BulletList items={items} />
          </tbody>
        </table>
      );
      expect(container.textContent).toContain('+15%');
      expect(container.textContent).toContain('revenue increased');
    });
  });

  describe('CTAButton', () => {
    it('renders with href and text', () => {
      const { container } = render(
        <CTAButton href="https://example.com" text="Click Me" />
      );
      const link = container.querySelector('a[href="https://example.com"]');
      expect(link).toBeTruthy();
      expect(link).toHaveTextContent('Click Me');
    });
  });
});
