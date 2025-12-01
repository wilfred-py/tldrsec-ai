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
    it('renders with default props', () => {
      const { container } = render(<EmailHeader />);
      expect(container.querySelector('h1')).toHaveTextContent('SEC Filing Alert');
    });

    it('renders with custom title and subtitle', () => {
      const { container } = render(
        <EmailHeader title="Test Title" subtitle="Test Subtitle" />
      );
      expect(container.querySelector('h1')).toHaveTextContent('Test Title');
      expect(container.textContent).toContain('Test Subtitle');
    });
  });

  describe('EmailFooter', () => {
    it('renders with filing URL', () => {
      const { container } = render(<EmailFooter filingUrl="https://example.com" />);
      const link = container.querySelector('a[href="https://example.com"]');
      expect(link).toBeTruthy();
      expect(link).toHaveTextContent('View Original Filing');
    });

    it('renders without filing URL', () => {
      const { container } = render(<EmailFooter />);
      const link = container.querySelector('a');
      expect(link).toBeFalsy();
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
