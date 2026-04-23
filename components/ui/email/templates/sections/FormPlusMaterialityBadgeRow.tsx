import * as React from 'react';
import { EmailStyles, BadgeColors, DEFAULT_FILING_CATEGORY_MAP } from '../../design-system';

type BadgeColorKey = keyof typeof BadgeColors;

interface SignalBadgeSpec {
  label: string;
  colorKey: BadgeColorKey;
}

interface FormPlusMaterialityBadgeRowProps {
  filingType: string;
  filingCategory?: string;
  signal?: SignalBadgeSpec;
  /** Optional second badge (e.g., sentiment for 8-K alongside materiality). */
  secondarySignal?: SignalBadgeSpec;
}

/**
 * Renders the form-type badge (e.g. "S-1 | IPO") on the same row as the
 * materiality / signal badge cluster. Sits below the ticker line in
 * notification email templates.
 *
 * Suppression rule: if the form-type label fully covers what the signal
 * badge would say (e.g. form badge "S-1 | IPO" + signal "IPO FILING"),
 * the duplicate signal is omitted to avoid two badges saying the same thing.
 */
export function FormPlusMaterialityBadgeRow({
  filingType,
  filingCategory,
  signal,
  secondarySignal,
}: FormPlusMaterialityBadgeRowProps) {
  const displayType = filingType || 'SEC';
  const category = filingCategory
    || DEFAULT_FILING_CATEGORY_MAP[displayType.toUpperCase().trim()]
    || 'Filing';

  const formLabel = `${displayType} | ${category}`;
  const formLabelTokens = formLabel.toUpperCase().split(/[\s|]+/).filter(Boolean);

  const isDuplicate = (s: SignalBadgeSpec | undefined): boolean => {
    if (!s) return true;
    const signalTokens = s.label.toUpperCase().split(/\s+/).filter(Boolean);
    return signalTokens.every((tok) => formLabelTokens.includes(tok));
  };

  const showPrimary = signal && !isDuplicate(signal);
  const showSecondary = secondarySignal && !isDuplicate(secondarySignal);

  return (
    <table width="100%" cellPadding="0" cellSpacing="0" style={{ marginBottom: '12px' }}>
      <tbody>
        <tr>
          <td style={{ padding: '0 15px' }}>
            <span style={{ ...EmailStyles.categoryBadge, marginRight: '8px' }}>
              {formLabel}
            </span>
            {showPrimary && signal && (
              <span style={{
                ...EmailStyles.pillBadge,
                backgroundColor: BadgeColors[signal.colorKey].bg,
                color: BadgeColors[signal.colorKey].text,
                marginRight: showSecondary ? '8px' : '0',
              }}>
                {signal.label}
              </span>
            )}
            {showSecondary && secondarySignal && (
              <span style={{
                ...EmailStyles.pillBadge,
                backgroundColor: BadgeColors[secondarySignal.colorKey].bg,
                color: BadgeColors[secondarySignal.colorKey].text,
              }}>
                {secondarySignal.label}
              </span>
            )}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export default FormPlusMaterialityBadgeRow;
