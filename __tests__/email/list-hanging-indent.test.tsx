/**
 * Hanging-indent regression test for email bullet rendering.
 *
 * Guards against regression of the inline `<div><span>•</span>{text}</div>`
 * pattern that caused wrapped bullet lines to dedent left of the first
 * text character. The canonical fix is a 2-cell <table> row: bullet in a
 * fixed-width left cell, text in a flexible right cell. See
 * .claude/tasks/fix-list-indent.md.
 */

import * as React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { render } from '@testing-library/react';
import { HangingBulletItem } from '@/components/ui/email/templates/sections/BulletList';
import { markdownToHtml } from '@/components/ui/email/design-system';

const LONG_TEXT =
  'A very long bullet text that should wrap onto a second line so that we can verify the wrapped line aligns under the first text character rather than under the bullet glyph column.';

function findHangingBulletRows(container: HTMLElement): HTMLTableRowElement[] {
  const tables = container.querySelectorAll('table[role="presentation"]');
  const rows: HTMLTableRowElement[] = [];
  tables.forEach((table) => {
    table.querySelectorAll('tr').forEach((tr) => {
      const cells = tr.querySelectorAll('td');
      if (cells.length !== 2) return;
      const left = cells[0] as HTMLTableCellElement;
      const text = (left.textContent || '').trim();
      // Match the bullet glyph or numeric label like "1." / "2."
      if (text === '•' || /^\d+\.$/.test(text)) {
        rows.push(tr as HTMLTableRowElement);
      }
    });
  });
  return rows;
}

describe('Hanging-indent bullet rendering', () => {
  describe('HangingBulletItem component', () => {
    it('renders a 2-cell row with bullet glyph in a fixed-width cell', () => {
      const { container } = render(
        <table>
          <tbody>
            <tr>
              <td>
                <HangingBulletItem text={LONG_TEXT} />
              </td>
            </tr>
          </tbody>
        </table>
      );

      const rows = findHangingBulletRows(container);
      expect(rows.length).toBe(1);

      const cells = rows[0].querySelectorAll('td');
      expect(cells.length).toBe(2);

      const bulletCell = cells[0] as HTMLTableCellElement;
      const textCell = cells[1] as HTMLTableCellElement;

      expect(bulletCell.getAttribute('width')).toBe('16');
      expect(bulletCell.getAttribute('valign')).toBe('top');
      expect(bulletCell.textContent?.trim()).toBe('•');
      expect(textCell.getAttribute('valign')).toBe('top');
      expect(textCell.textContent).toContain('long bullet text');
    });

    it('skips rendering for empty text', () => {
      const { container } = render(<HangingBulletItem text="" />);
      expect(container.querySelector('table')).toBeNull();
    });

    it('skips rendering for whitespace-only text', () => {
      const { container } = render(<HangingBulletItem text="   " />);
      expect(container.querySelector('table')).toBeNull();
    });

    it('renders an HTML payload via dangerouslySetInnerHTML', () => {
      const { container } = render(
        <HangingBulletItem html={'<strong>Bold</strong> tail'} />
      );
      const strong = container.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong?.textContent).toBe('Bold');
    });

    it('preserves highlight value color (positive=green) on inline span', () => {
      const { container } = render(
        <HangingBulletItem
          text="upside narrative"
          highlight={{ value: '+12%', type: 'positive' }}
        />
      );
      const spans = container.querySelectorAll('td span');
      const highlightSpan = Array.from(spans).find(
        (s) => s.textContent?.trim() === '+12%'
      ) as HTMLSpanElement | undefined;
      expect(highlightSpan).toBeDefined();
      expect(highlightSpan!.style.color).not.toBe('');
    });
  });

  describe('markdownToHtml emits hanging-indent table HTML', () => {
    it('converts "- item" to a 2-cell role=presentation table', () => {
      const html = markdownToHtml('- first bullet');
      expect(html).toMatch(/<table[^>]+role="presentation"/);
      expect(html).toMatch(/<td[^>]+width="16"[^>]*>•<\/td>/);
      expect(html).toMatch(/first bullet/);
      // No more legacy inline pattern
      expect(html).not.toMatch(
        /<div style="padding:[^"]*16px;[^"]*"><span[^>]*>•<\/span>/
      );
    });

    it('converts "1. item" to a 2-cell role=presentation table with numeric label', () => {
      const html = markdownToHtml('1. first numbered\n2. second numbered');
      expect(html).toMatch(/<td[^>]+width="20"[^>]*>1\.<\/td>/);
      expect(html).toMatch(/<td[^>]+width="20"[^>]*>2\.<\/td>/);
    });

    it('does not emit a stray <br> after the bullet table', () => {
      // The substitution lookbehind already excludes </table>; this verifies
      // bullets followed by a single newline don't get a <br> sandwich.
      const html = markdownToHtml('- one\n- two\n');
      expect(html).not.toMatch(/<\/table>\s*<br>/);
    });
  });

  describe('Source-level regression: buggy inline pattern is gone from templates', () => {
    // Negative-source check: the previous bug was every minimalist template
    // duplicating an inline <div padding=3px 0 3px 16px><span>•</span>{text}</div>
    // pattern. After the fix, every site imports HangingBulletItem instead.
    // We assert at the source level so a regression in any template trips the test
    // without needing per-template render fixtures (each one extracts watchFor
    // from a different shape).
    const TEMPLATE_DIR = path.join(
      __dirname,
      '..',
      '..',
      'components',
      'ui',
      'email',
      'templates'
    );
    const MINIMALIST_FILES = [
      's3-minimalist-template.tsx',
      's1-minimalist-template.tsx',
      '10k-minimalist-template.tsx',
      '11k-minimalist-template.tsx',
      'def14a-minimalist-template.tsx',
      'form4-minimalist-template.tsx',
      'form144-minimalist-template.tsx',
      'generic-minimalist-template.tsx',
      '8k-minimalist-template.tsx',
    ];

    it.each(MINIMALIST_FILES)(
      '%s does not contain the legacy "padding: \'3px 0 3px 16px\'" inline-bullet pattern',
      (file) => {
        const src = fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf8');
        // Match the exact buggy pattern: inline padding + adjacent inline span+bullet glyph.
        expect(src).not.toMatch(/padding:\s*'3px 0 3px 16px'/);
      }
    );

    it.each(MINIMALIST_FILES)(
      '%s imports HangingBulletItem from sections/BulletList',
      (file) => {
        const src = fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf8');
        expect(src).toMatch(
          /import\s*\{[^}]*HangingBulletItem[^}]*\}\s*from\s*'\.\/sections\/BulletList'/
        );
      }
    );
  });
});
