import { formatText } from '@/components/ui/email/templates/8k-minimalist-template';

describe('8-K Formatting Consistency', () => {
  describe('Bold weight consistency', () => {
    it('should use consistent font-weight for dollar amounts', () => {
      const result = formatText('Revenue of $150M');
      expect(result).toContain('font-weight:600');
      expect(result).not.toContain('font-weight:700');
    });

    it('should use consistent font-weight for percentages', () => {
      const result = formatText('Up 25% YoY');
      expect(result).toContain('font-weight:600');
      expect(result).not.toContain('font-weight:700');
    });
  });

  describe('Bullet point handling', () => {
    it('should not produce double bullets when text starts with bullet character', () => {
      const result = formatText('• Revenue increased 25%');
      const bulletCount = (result.match(/•/g) || []).length;
      expect(bulletCount).toBeLessThanOrEqual(1);
    });

    it('should strip leading bullet/dash from highlight text', () => {
      const result = formatText('- Revenue increased 25%');
      expect(result).not.toMatch(/^[\s]*[-•*]/);
    });
  });
});
