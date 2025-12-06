/**
 * Morning Brew-inspired email design system
 * Based on research: thoughts/shared/research/2025-12-01-email-summarization-improvement-strategy.md
 *
 * Design principles:
 * - Clean, scannable layouts
 * - Minimal color use (only green/red for changes)
 * - Tight spacing (7px between lines)
 * - 15px horizontal padding (Morning Brew standard)
 * - Light gray borders (#e6e6e6)
 * - 15px border-radius
 */

export const EmailColors = {
  text: {
    headline: '#000000',      // Pure black for section headings
    body: '#374151',          // Gray 700 for body text
    meta: '#6B7280',          // Gray 500 for labels and metadata
    muted: '#9CA3AF',         // Gray 400 for less important text
  },
  structure: {
    border: '#e6e6e6',        // Light gray borders (Morning Brew standard)
    borderLight: '#f1f5f9',   // Very light gray for table row dividers
    background: '#ffffff',    // White content sections
    backgroundAlt: '#f8fafc', // Slight gray for alternating rows
  },
  semantic: {
    positive: '#10B981',      // Green 500 for positive changes (buys, gains)
    negative: '#EF4444',      // Red 500 for negative changes (sells, losses)
    neutral: '#6B7280',       // Gray 500 for no change
    accent: '#7C3AED',        // Purple for CTAs only (minimal use)
  },
  brand: {
    primary: '#7C3AED',       // Purple - use sparingly
    secondary: '#EC4899',     // Pink - avoid in minimalist design
  },
} as const;

export const EmailSpacing = {
  section: {
    marginTop: '20px',
    marginBottom: '20px',
    padding: '15px',          // Morning Brew standard inner padding
  },
  inner: {
    padding: '15px',          // Inside sections (Morning Brew standard)
    paddingLarge: '20px',     // For larger content areas
  },
  tight: {
    marginTop: '7px',
    marginBottom: '7px',      // Morning Brew standard tight spacing
  },
  cell: {
    padding: '10px 12px',     // Table cell padding
  },
} as const;

export const EmailTypography = {
  headline: {
    fontSize: '16px',
    fontWeight: '600',
    color: EmailColors.text.headline,
    margin: '0 0 7px 0',      // Tight margin (Morning Brew)
    lineHeight: '1.3',
  },
  subheadline: {
    fontSize: '14px',
    fontWeight: '600',
    color: EmailColors.text.headline,
    margin: '0 0 7px 0',
  },
  body: {
    fontSize: '14px',
    fontWeight: '400',
    color: EmailColors.text.body,
    lineHeight: '1.6',        // Readable line height
    margin: '0',
  },
  meta: {
    fontSize: '12px',
    fontWeight: '500',
    color: EmailColors.text.meta,
    margin: '0',
  },
  label: {
    fontSize: '11px',
    fontWeight: '600',
    color: EmailColors.text.meta,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  number: {
    fontSize: '14px',
    fontWeight: '600',
    fontFamily: 'Monaco, Consolas, monospace',
  },
  numberLarge: {
    fontSize: '18px',
    fontWeight: '700',
    fontFamily: 'Monaco, Consolas, monospace',
  },
} as const;

export const EmailBorders = {
  section: {
    border: `1px solid ${EmailColors.structure.border}`,
    borderRadius: '15px',     // Morning Brew standard
  },
  card: {
    border: `1px solid ${EmailColors.structure.border}`,
    borderRadius: '8px',
  },
  divider: {
    borderBottom: `1px solid ${EmailColors.structure.borderLight}`,
  },
} as const;

export const EmailShadows = {
  none: 'none',
  subtle: '0 1px 2px rgba(0,0,0,0.05)',
  card: '0 2px 4px rgba(0,0,0,0.05)',
} as const;

/**
 * Common style presets for email components
 */
export const EmailStyles = {
  // Container for the entire email
  container: {
    maxWidth: '600px',
    margin: '0 auto',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    backgroundColor: EmailColors.structure.background,
    color: EmailColors.text.body,
  },

  // Section header with optional emoji
  sectionHeader: {
    ...EmailTypography.headline,
    borderBottom: `1px solid ${EmailColors.structure.borderLight}`,
    paddingBottom: '8px',
    marginBottom: '12px',
  },

  // Card container
  card: {
    backgroundColor: EmailColors.structure.background,
    ...EmailBorders.card,
    padding: EmailSpacing.inner.padding,
    marginBottom: EmailSpacing.section.marginBottom,
  },

  // Bullet list item
  bulletItem: {
    ...EmailTypography.body,
    marginBottom: '4px',
    paddingLeft: '0',
  },

  // CTA button
  ctaButton: {
    display: 'inline-block',
    padding: '12px 24px',
    backgroundColor: EmailColors.semantic.accent,
    color: '#ffffff',
    textDecoration: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
  },

  // Secondary link
  secondaryLink: {
    color: EmailColors.text.meta,
    textDecoration: 'underline',
    fontSize: '12px',
  },

  // Positive change indicator
  positiveChange: {
    color: EmailColors.semantic.positive,
    fontWeight: '600',
  },

  // Negative change indicator
  negativeChange: {
    color: EmailColors.semantic.negative,
    fontWeight: '600',
  },

  // Neutral indicator
  neutralChange: {
    color: EmailColors.semantic.neutral,
    fontWeight: '400',
  },
} as const;

/**
 * Helper to format numbers for display
 */
export function formatNumber(value: number | string | undefined, options?: {
  prefix?: string;
  suffix?: string;
  decimals?: number;
}): string {
  if (value === undefined || value === null) return 'N/A';

  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return String(value);

  const formatted = options?.decimals !== undefined
    ? num.toLocaleString('en-US', { minimumFractionDigits: options.decimals, maximumFractionDigits: options.decimals })
    : num.toLocaleString('en-US');

  return `${options?.prefix || ''}${formatted}${options?.suffix || ''}`;
}

/**
 * Helper to format currency values
 */
export function formatCurrency(value: number | string | undefined, options?: {
  compact?: boolean;
}): string {
  if (value === undefined || value === null) return 'N/A';

  const num = typeof value === 'string' ? parseFloat(value.replace(/[$,]/g, '')) : value;
  if (isNaN(num)) return String(value);

  if (options?.compact) {
    if (Math.abs(num) >= 1_000_000_000) {
      return `$${(num / 1_000_000_000).toFixed(1)}B`;
    }
    if (Math.abs(num) >= 1_000_000) {
      return `$${(num / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(num) >= 1_000) {
      return `$${(num / 1_000).toFixed(0)}K`;
    }
  }

  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Helper to format percentage values
 */
export function formatPercent(value: number | string | undefined, options?: {
  showSign?: boolean;
}): string {
  if (value === undefined || value === null) return 'N/A';

  const num = typeof value === 'string' ? parseFloat(value.replace(/%/g, '')) : value;
  if (isNaN(num)) return String(value);

  const sign = options?.showSign && num > 0 ? '+' : '';
  return `${sign}${num.toFixed(1)}%`;
}

/**
 * Get change indicator styles based on value
 */
export function getChangeStyle(change: number | string | undefined): typeof EmailStyles.positiveChange {
  if (change === undefined || change === null) return EmailStyles.neutralChange;

  const num = typeof change === 'string' ? parseFloat(change.replace(/[%$,+]/g, '')) : change;
  if (isNaN(num) || num === 0) return EmailStyles.neutralChange;

  return num > 0 ? EmailStyles.positiveChange : EmailStyles.negativeChange;
}

/**
 * Get change arrow based on direction
 */
export function getChangeArrow(change: number | string | undefined): string {
  if (change === undefined || change === null) return '';

  const num = typeof change === 'string' ? parseFloat(change.replace(/[%$,+]/g, '')) : change;
  if (isNaN(num) || num === 0) return '';

  return num > 0 ? '↑' : '↓';
}

/**
 * Convert markdown text to email-safe HTML with inline styles
 * Handles: headers, bold, italic, bullet lists, numbered lists, tables, line breaks
 */
export function markdownToHtml(markdown: string | undefined): string {
  if (!markdown) return '';

  let html = markdown;

  // Escape HTML entities first (but preserve intentional HTML)
  html = html.replace(/&(?!amp;|lt;|gt;|quot;|#)/g, '&amp;');

  // Convert markdown tables to styled HTML tables
  const tableRegex = /\|(.+)\|\n\|[-:\s|]+\|\n((?:\|.+\|\n?)+)/g;
  html = html.replace(tableRegex, (match, header, body) => {
    const headerCells = header.split('|').filter((c: string) => c.trim()).map((c: string) => c.trim());
    const bodyRows = body.trim().split('\n').map((row: string) =>
      row.split('|').filter((c: string) => c.trim()).map((c: string) => c.trim())
    );

    const headerHtml = headerCells.map((cell: string) =>
      `<th style="padding:8px 12px;text-align:left;font-weight:600;border-bottom:2px solid ${EmailColors.structure.border};color:${EmailColors.text.headline};font-size:12px;text-transform:uppercase;">${cell}</th>`
    ).join('');

    const bodyHtml = bodyRows.map((row: string[], idx: number) => {
      const bgColor = idx % 2 === 0 ? EmailColors.structure.background : EmailColors.structure.backgroundAlt;
      return `<tr style="background-color:${bgColor}">${row.map(cell =>
        `<td style="padding:8px 12px;border-bottom:1px solid ${EmailColors.structure.borderLight};font-size:14px;color:${EmailColors.text.body};">${cell}</td>`
      ).join('')}</tr>`;
    }).join('');

    return `<table style="width:100%;border-collapse:collapse;margin:12px 0;"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
  });

  // Convert headers (### Header -> styled div)
  html = html.replace(/^### (.+)$/gm, `<div style="font-size:14px;font-weight:600;color:${EmailColors.text.headline};margin:16px 0 8px 0;">$1</div>`);
  html = html.replace(/^## (.+)$/gm, `<div style="font-size:15px;font-weight:600;color:${EmailColors.text.headline};margin:16px 0 8px 0;">$1</div>`);
  html = html.replace(/^# (.+)$/gm, `<div style="font-size:16px;font-weight:700;color:${EmailColors.text.headline};margin:16px 0 8px 0;">$1</div>`);

  // Convert bold (**text** or __text__)
  html = html.replace(/\*\*(.+?)\*\*/g, `<strong style="font-weight:600;color:${EmailColors.text.headline};">$1</strong>`);
  html = html.replace(/__(.+?)__/g, `<strong style="font-weight:600;color:${EmailColors.text.headline};">$1</strong>`);

  // Convert italic (*text* or _text_) - be careful not to match bold
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em style="font-style:italic;">$1</em>');
  html = html.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em style="font-style:italic;">$1</em>');

  // Convert bullet lists (- item or * item)
  html = html.replace(/^[\-\*] (.+)$/gm, `<div style="padding:4px 0 4px 16px;font-size:14px;color:${EmailColors.text.body};"><span style="color:${EmailColors.text.meta};margin-right:8px;">•</span>$1</div>`);

  // Convert numbered lists (1. item)
  html = html.replace(/^(\d+)\. (.+)$/gm, (match, num, content) => {
    return `<div style="padding:4px 0 4px 16px;font-size:14px;color:${EmailColors.text.body};"><span style="color:${EmailColors.text.meta};margin-right:8px;">${num}.</span>${content}</div>`;
  });

  // Convert line breaks (double newline = paragraph break)
  html = html.replace(/\n\n/g, '</p><p style="margin:12px 0;">');

  // Convert single newlines to <br> only where appropriate (not after block elements)
  html = html.replace(/(?<!<\/div>|<\/table>|<\/p>)\n(?!<)/g, '<br>');

  // Wrap in paragraph if not already wrapped
  if (!html.startsWith('<') && !html.startsWith('</')) {
    html = `<p style="margin:0;">${html}</p>`;
  }

  return html;
}
