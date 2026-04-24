import * as React from 'react';
import { EmailColors } from '../../design-system';

export interface DealTerms {
  counterparty: string;
  dealValue?: string;
  consideration?: string;
  closeDate?: string;
  approvals?: string[];
  rationale?: string;
}

interface DealTermsCardProps {
  dealTerms: DealTerms;
}

const MAX_VISIBLE_APPROVALS = 3;

function ApprovalsDisplay({ approvals }: { approvals: string[] }) {
  if (approvals.length <= MAX_VISIBLE_APPROVALS) {
    return <span>{approvals.join(', ')}</span>;
  }
  const visible = approvals.slice(0, MAX_VISIBLE_APPROVALS);
  const hidden = approvals.length - MAX_VISIBLE_APPROVALS;
  return (
    <span>
      {visible.join(', ')}
      <span style={{ color: EmailColors.text.meta, fontStyle: 'italic' }}>
        {` +${hidden} more`}
      </span>
    </span>
  );
}

/**
 * Structured renderer for 8-K Item 1.01 / 2.01 deal terms.
 *
 * Lays out key-value pairs in a compact card. The counterparty is always shown;
 * remaining fields render only when present. Rationale is shown as a short
 * italicized footer sentence when provided.
 */
export function DealTermsCard({ dealTerms }: DealTermsCardProps) {
  const { counterparty, dealValue, consideration, closeDate, approvals, rationale } = dealTerms;

  const rows: Array<{ label: string; value: React.ReactNode }> = [
    { label: 'Counterparty', value: counterparty },
  ];
  if (dealValue) rows.push({ label: 'Deal value', value: dealValue });
  if (consideration) rows.push({ label: 'Consideration', value: consideration });
  if (closeDate) rows.push({ label: 'Expected close', value: closeDate });
  if (approvals && approvals.length > 0) {
    rows.push({ label: 'Approvals', value: <ApprovalsDisplay approvals={approvals} /> });
  }

  return (
    <div style={{
      margin: '12px 0 16px 0',
      padding: '14px',
      border: `1px solid ${EmailColors.structure.border}`,
      borderRadius: '8px',
      backgroundColor: EmailColors.structure.background,
    }}>
      <table width="100%" cellPadding={0} cellSpacing={0}>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              <td style={{
                padding: '5px 0',
                fontSize: '12px',
                fontWeight: 600,
                color: EmailColors.text.meta,
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
                verticalAlign: 'top',
                width: '38%',
              }}>
                {row.label}
              </td>
              <td style={{
                padding: '5px 0',
                fontSize: '14px',
                fontWeight: 500,
                color: EmailColors.text.headline,
                verticalAlign: 'top',
              }}>
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rationale && (
        <div style={{
          marginTop: '10px',
          paddingTop: '10px',
          borderTop: `1px solid ${EmailColors.structure.borderLight}`,
          fontSize: '13px',
          color: EmailColors.text.body,
          fontStyle: 'italic',
          lineHeight: '1.5',
        }}>
          {rationale}
        </div>
      )}
    </div>
  );
}

export default DealTermsCard;
