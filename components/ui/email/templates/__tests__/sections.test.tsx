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
      const { container } = render(<DataRow label="Test Label" value="Test Value" />);
      expect(container.textContent).toContain('Test Label');
      expect(container.textContent).toContain('Test Value');
    });

    it('handles empty value', () => {
      const { container } = render(<DataRow label="Test Label" value="" />);
      expect(container.textContent).toContain('Test Label');
      expect(container.textContent).toContain('N/A');
    });

    it('highlights value when specified', () => {
      const { container } = render(
        <DataRow label="Test" value="Value" highlight={true} />
      );
      const valueCell = container.querySelector('td:last-child');
      expect(valueCell?.style.fontWeight).toBe('600');
    });
  });

  describe('BulletList', () => {
    it('renders list items', () => {
      const items = ['Item 1', 'Item 2', 'Item 3'];
      const { container } = render(<BulletList items={items} />);
      const listItems = container.querySelectorAll('li');
      expect(listItems).toHaveLength(3);
      expect(listItems[0]).toHaveTextContent('Item 1');
    });

    it('handles empty array', () => {
      const { container } = render(<BulletList items={[]} />);
      const listItems = container.querySelectorAll('li');
      expect(listItems).toHaveLength(0);
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