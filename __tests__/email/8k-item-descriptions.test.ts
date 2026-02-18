import { getItemDescription } from '@/components/ui/email/templates/8k-minimalist-template';

describe('8-K Item Descriptions', () => {
  it('should return description for Item 2.02', () => {
    expect(getItemDescription('2.02')).toBe('Results of Operations and Financial Condition');
  });

  it('should return description for Item 5.02', () => {
    expect(getItemDescription('5.02')).toBe('Departure/Election of Directors or Officers');
  });

  it('should return description for Item 9.01', () => {
    expect(getItemDescription('9.01')).toBe('Financial Statements and Exhibits');
  });

  it('should return empty string for unknown item number', () => {
    expect(getItemDescription('99.99')).toBe('');
  });
});
