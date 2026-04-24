/**
 * W2: "Why it matters / Note / What happened" label branching tests.
 *
 * Two axes under test:
 *   1. getWhyItMattersLabel(bucket) — pure mapping from semantic bucket to text + style.
 *   2. Form 4's getSignalConfig — has10b51Plan boolean is now source of truth
 *      (replaces the old free-text 10b5-1 string-match at line 595).
 *
 * Intended contract:
 *   - material  → "Why it matters: " + prominent 14px style
 *   - routine   → "Note: "           + muted 13px style
 *   - descriptive → "What happened: "  + muted 13px style
 *   - Form 4 LOW signal is produced ONLY when has10b51Plan=true (or signalStrength
 *     contains "weak", etc.) — summary text mentioning "10b5-1" is no longer enough.
 */

import {
  getWhyItMattersLabel,
  EmailStyles,
  type WhyItMattersBucket,
} from '../../components/ui/email/design-system';
import { getSignalConfig } from '../../components/ui/email/templates/form4-minimalist-template';

describe('getWhyItMattersLabel', () => {
  test('material bucket → "Why it matters: " with prominent 14px style', () => {
    const label = getWhyItMattersLabel('material');
    expect(label.text).toBe('Why it matters: ');
    expect(label.paragraphStyle).toBe(EmailStyles.whyItMatters);
    expect(label.labelStyle.color).toBe('#000000');
    expect(label.labelStyle.fontWeight).toBe(700);
  });

  test('routine bucket → "Note: " with muted 13px style', () => {
    const label = getWhyItMattersLabel('routine');
    expect(label.text).toBe('Note: ');
    expect(label.paragraphStyle).toBe(EmailStyles.whyItMattersRoutine);
    expect(label.labelStyle.color).toBe('#6B7280');
    expect(label.labelStyle.fontWeight).toBe(500);
  });

  test('descriptive bucket → "What happened: " with muted 13px style', () => {
    const label = getWhyItMattersLabel('descriptive');
    expect(label.text).toBe('What happened: ');
    expect(label.paragraphStyle).toBe(EmailStyles.whyItMattersRoutine);
    expect(label.labelStyle.color).toBe('#6B7280');
    expect(label.labelStyle.fontWeight).toBe(500);
  });

  test('routine and descriptive share the same paragraph style (muted)', () => {
    expect(getWhyItMattersLabel('routine').paragraphStyle).toBe(
      getWhyItMattersLabel('descriptive').paragraphStyle,
    );
    expect(getWhyItMattersLabel('routine').paragraphStyle).not.toBe(
      getWhyItMattersLabel('material').paragraphStyle,
    );
  });

  test('whyItMattersRoutine style is 13px muted non-bold', () => {
    // Lock in the design-system contract so future tweaks don't silently
    // promote routine copy to the prominent material treatment.
    expect(EmailStyles.whyItMattersRoutine.fontSize).toBe('13px');
    expect(EmailStyles.whyItMattersRoutine.color).toBe('#6B7280');
    expect(EmailStyles.whyItMattersRoutine.fontWeight).toBe(400);
  });
});

describe('Form4 getSignalConfig: has10b51Plan boolean is source of truth', () => {
  test('has10b51Plan=true routes a large-% trade to LOW (was HIGH via percentChange)', () => {
    // Pre-W2.2: isStrong's >50% clause used to fire for 10b5-1 trades unless
    // summary text happened to contain "10b5-1". Now the boolean gates it
    // directly via !has10b51 in the isStrong guard.
    const signal = getSignalConfig(
      '',
      'Sale of 5000 shares',
      /*isSale*/ true,
      /*percentChange*/ '-75',
      /*isAwardOnly*/ false,
      /*has10b51Plan*/ true,
    );
    expect(signal.level).toBe('LOW');
    expect(signal.description).toMatch(/10b5-1/);
  });

  test('has10b51Plan=false + "10b5-1" in summary text no longer triggers LOW', () => {
    // Regression guard: summary text mentioning 10b5-1 (without the schema
    // boolean being true) should NOT short-circuit to routine. The boolean
    // is now the single source of truth per plan W2.2.
    const signal = getSignalConfig(
      '',
      'Insider mentioned a 10b5-1 plan adoption in an exhibit, but this trade is outside that plan',
      /*isSale*/ true,
      /*percentChange*/ '5',
      /*isAwardOnly*/ false,
      /*has10b51Plan*/ false,
    );
    expect(signal.level).not.toBe('LOW');
  });

  test('has10b51Plan=true yields pre-scheduled-trade description', () => {
    const signal = getSignalConfig(
      '',
      'Sale of 1000 shares',
      true,
      '-2',
      false,
      true,
    );
    expect(signal.level).toBe('LOW');
    expect(signal.description).toContain('Pre-scheduled');
  });

  test('trust transfer short-circuits to NEUTRAL regardless of has10b51Plan', () => {
    const signal = getSignalConfig(
      'trust transfer',
      'Revocable trust transfer',
      false,
      '0',
      false,
      true,
    );
    expect(signal.level).toBe('NEUTRAL');
    expect(signal.verdict).toBe('Trust/Family Transfer');
  });

  test('award-only short-circuits to NEUTRAL regardless of has10b51Plan', () => {
    const signal = getSignalConfig(
      '',
      '',
      false,
      '',
      /*isAwardOnly*/ true,
      /*has10b51Plan*/ true,
    );
    expect(signal.level).toBe('NEUTRAL');
    expect(signal.verdict).toBe('Stock Award');
  });

  test('default has10b51Plan=false when omitted (backward compat for untyped callers)', () => {
    // Default-parameter behavior: existing code that hasn't been updated to
    // pass has10b51Plan should not accidentally treat every trade as routine.
    const signal = getSignalConfig('strong', 'Large insider buy', false, '75', false);
    expect(signal.level).toBe('HIGH');
  });

  test('HIGH signal maps to material bucket (via >50% percentChange)', () => {
    const signal = getSignalConfig('', '', true, '75', false, false);
    expect(signal.level).toBe('HIGH');
    // Caller-side bucket mapping from template:
    const bucket: WhyItMattersBucket =
      signal.level === 'HIGH' || signal.level === 'MODERATE' ? 'material'
      : signal.level === 'LOW' ? 'routine'
      : 'descriptive';
    expect(bucket).toBe('material');
  });

  test('LOW signal (from has10b51Plan) maps to routine bucket', () => {
    const signal = getSignalConfig('', '', true, '-5', false, true);
    const bucket: WhyItMattersBucket =
      signal.level === 'HIGH' || signal.level === 'MODERATE' ? 'material'
      : signal.level === 'LOW' ? 'routine'
      : 'descriptive';
    expect(bucket).toBe('routine');
  });

  test('NEUTRAL signal (trust transfer) maps to descriptive bucket', () => {
    const signal = getSignalConfig('trust transfer', '', false, '0', false, false);
    const bucket: WhyItMattersBucket =
      signal.level === 'HIGH' || signal.level === 'MODERATE' ? 'material'
      : signal.level === 'LOW' ? 'routine'
      : 'descriptive';
    expect(bucket).toBe('descriptive');
  });
});
