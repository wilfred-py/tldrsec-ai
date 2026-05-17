import * as React from 'react';
import { EmailColors } from '../../design-system';

const MONO_FONT = '"JetBrains Mono", "SF Mono", Monaco, Consolas, "Courier New", monospace';

type DeltaTone = 'positive' | 'negative' | 'zero' | 'unparseable';

/**
 * Parse a YoY/QoQ change value into a tone + display text.
 *
 * Numeric strings ("+6.1%", "-2.7", 6.1) → positive/negative/zero with
 * "+N%" / "−N%" formatting. Non-numeric strings ("N/A", "n/m") and basis-
 * point measures ("5 points") fall through as "unparseable" — they render
 * in a neutral gray pill with the raw text preserved, never colored as
 * positive by accident.
 *
 * Percentage-point unit ("pp", "pts", "points") — used for margin changes.
 * The LLM may emit pp suffixes; we normalize to "%" for display so the
 * scorecard reads consistently across revenue (% relative) and margin
 * (% point) rows. Disambiguation lives in the column label, not the unit.
 */
export function parseDelta(value: string | number | undefined): { tone: DeltaTone; text: string } | null {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const ppMatch = raw.match(/^([+-]?\d+(?:\.\d+)?)\s*(?:pp|pts|points?)$/i);
  if (ppMatch) {
    const num = parseFloat(ppMatch[1]);
    if (isNaN(num)) return { tone: 'unparseable', text: raw };
    if (num === 0) return { tone: 'zero', text: '0.00%' };
    const isNegative = num < 0;
    const abs = Math.abs(num);
    const sign = isNegative ? '−' : '+';
    return { tone: isNegative ? 'negative' : 'positive', text: `${sign}${abs.toFixed(2)}%` };
  }

  const stripped = raw.replace(/[%+,$\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(stripped)) return { tone: 'unparseable', text: raw };
  const num = parseFloat(stripped);
  if (isNaN(num)) return { tone: 'unparseable', text: raw };
  if (num === 0) return { tone: 'zero', text: '0.00%' };
  const isNegative = num < 0;
  const abs = Math.abs(num);
  const sign = isNegative ? '−' : '+';
  return { tone: isNegative ? 'negative' : 'positive', text: `${sign}${abs.toFixed(2)}%` };
}

/**
 * Pill chip showing a percentage delta. Green for positive, red for
 * negative, gray for zero AND for unparseable values like "N/A" / "n/m".
 *
 * The pill is the ONLY colored element in the financial scorecard rows —
 * labels and dollar values stay neutral so the colored chips carry the
 * tone without competing with the underlying text.
 *
 * Used in both 10-K and 10-Q templates: scorecard rows, segment chart
 * growth labels, and "Why it matters" prose inline chips.
 */
export function PillDelta({ value, size = 'normal' }: { value: string | number; size?: 'normal' | 'small' }) {
  const parsed = parseDelta(value);
  if (!parsed) {
    return (
      <span style={{
        color: EmailColors.text.muted,
        fontSize: size === 'small' ? '10px' : '12px',
        fontFamily: MONO_FONT,
      }}>—</span>
    );
  }

  const colors = parsed.tone === 'positive'
    ? { bg: EmailColors.semantic.pillPositiveBg, text: EmailColors.semantic.pillPositiveFg }
    : parsed.tone === 'negative'
      ? { bg: EmailColors.semantic.pillNegativeBg, text: EmailColors.semantic.pillNegativeFg }
      : { bg: EmailColors.semantic.pillNeutralBg, text: EmailColors.semantic.pillNeutralFg };

  const sizing = size === 'small'
    ? { padding: '1px 6px', fontSize: '10px', borderRadius: '3px' }
    : { padding: '3px 8px', fontSize: '11px', borderRadius: '4px' };

  return (
    <span style={{
      display: 'inline-block' as const,
      backgroundColor: colors.bg,
      color: colors.text,
      fontWeight: 700,
      fontFamily: MONO_FONT,
      fontVariantNumeric: 'tabular-nums' as const,
      letterSpacing: '0.2px',
      lineHeight: '1.2',
      whiteSpace: 'nowrap' as const,
      ...sizing,
    }}>
      {parsed.text}
    </span>
  );
}

/**
 * MetricPill — neutral-tone chip for the Previous (grey) and Latest
 * (white) scorecard value columns. Carries the chip aesthetic to the
 * non-delta columns so every cell in the scorecard reads as a styled
 * pill, not raw text. The YoY/QoQ columns still use `PillDelta` for
 * the colored (green/red) deltas — this component is JUST the prior /
 * current value wrappers.
 *
 *   tone="prior"   → muted grey bg + grey text (Previous column)
 *   tone="latest"  → white bg + 1px border + ink text (Latest column)
 */
export function MetricPill({ value, tone }: { value: string | number; tone: 'prior' | 'latest' }) {
  const isPrior = tone === 'prior';
  const styles = isPrior
    ? {
      backgroundColor: '#F3F4F6',
      color: '#6B7280',
      border: '1px solid #F3F4F6',
    }
    : {
      backgroundColor: '#FFFFFF',
      color: '#111827',
      border: '1px solid #E5E7EB',
    };
  return (
    <span style={{
      display: 'inline-block' as const,
      ...styles,
      padding: '3px 8px',
      borderRadius: '4px',
      fontWeight: isPrior ? 500 : 700,
      fontFamily: MONO_FONT,
      fontVariantNumeric: 'tabular-nums' as const,
      fontSize: '11px',
      letterSpacing: '0.2px',
      lineHeight: '1.2',
      whiteSpace: 'nowrap' as const,
    }}>
      {String(value)}
    </span>
  );
}
