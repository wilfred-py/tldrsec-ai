import * as React from 'react';
import { EmailColors } from '../../design-system';
import { TotalsLine } from './TotalsLine';

export interface Tranche {
  amountDisplay: string;
  currency: string;
  coupon?: string;
  yield?: string;
  maturity?: string;
  spread?: string;
}

interface TranchesListProps {
  tranches: Tranche[];
}

const EM_DASH = '\u2014';

/**
 * Group tranches by currency, preserving original order within each currency group.
 * Currency order: largest tranche count first; ties broken by first appearance.
 */
function groupByCurrency(tranches: Tranche[]): Array<{ currency: string; rows: Tranche[] }> {
  const groups = new Map<string, Tranche[]>();
  for (const t of tranches) {
    const list = groups.get(t.currency);
    if (list) list.push(t);
    else groups.set(t.currency, [t]);
  }
  return Array.from(groups.entries()).map(([currency, rows]) => ({ currency, rows }));
}

/**
 * Build a compact totals-line display. For single currency: "$7.0B".
 * For multi-currency: "¥265B + $7B" (joins each group's first-amount sum string).
 *
 * We deliberately concatenate amountDisplay tokens per currency group without
 * arithmetic summation — amountDisplay is a formatted string from the LLM and
 * may include scale qualifiers ("¥265.0B") that aren't trivially addable.
 * The LLM is instructed to return one tranche per series, so the aggregate is
 * expressed as a count, not a sum.
 */
function buildTotalsDisplay(groups: Array<{ currency: string; rows: Tranche[] }>): string {
  return groups
    .map(g => g.rows.map(r => r.amountDisplay).join(' + '))
    .join(' \u00B7 ');
}

function TrancheRow({ tranche, isLast }: { tranche: Tranche; isLast: boolean }) {
  const cellBase: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: '13px',
    color: EmailColors.text.body,
    borderBottom: isLast ? 'none' : `1px solid ${EmailColors.structure.borderLight}`,
    verticalAlign: 'top',
  };
  return (
    <tr>
      <td style={{ ...cellBase, fontWeight: 600, color: EmailColors.text.headline, whiteSpace: 'nowrap' }}>
        {tranche.amountDisplay}
      </td>
      <td style={cellBase}>{tranche.coupon || EM_DASH}</td>
      <td style={cellBase}>{tranche.maturity || EM_DASH}</td>
      <td style={cellBase}>{tranche.yield || EM_DASH}</td>
      <td style={cellBase}>{tranche.spread || EM_DASH}</td>
    </tr>
  );
}

/**
 * Inline one-line renderer for single-tranche filings. A full table would be
 * noisy for a lone row; a key-value strip fits the Smart Brevity aesthetic.
 */
function SingleTrancheInline({ tranche }: { tranche: Tranche }) {
  const parts: string[] = [tranche.amountDisplay];
  if (tranche.coupon) parts.push(tranche.coupon);
  if (tranche.maturity) parts.push(`due ${tranche.maturity}`);
  return (
    <div style={{
      padding: '10px 12px',
      fontSize: '14px',
      color: EmailColors.text.body,
      backgroundColor: EmailColors.structure.backgroundAlt,
      border: `1px solid ${EmailColors.structure.border}`,
      borderRadius: '8px',
      marginBottom: '12px',
    }}>
      <strong style={{ color: EmailColors.text.headline, fontWeight: 600 }}>
        {parts.join(' \u00B7 ')}
      </strong>
      {tranche.yield && (
        <span style={{ marginLeft: '8px', color: EmailColors.text.meta, fontSize: '12px' }}>
          yield {tranche.yield}
        </span>
      )}
      {tranche.spread && (
        <span style={{ marginLeft: '8px', color: EmailColors.text.meta, fontSize: '12px' }}>
          {tranche.spread}
        </span>
      )}
    </div>
  );
}

/**
 * Structured renderer for 8-K Item 2.03 debt issuance tranches.
 *
 * Layout rules:
 * - 0 tranches: returns null (caller falls back to prose).
 * - 1 tranche:  renders as inline key-value strip (not a table).
 * - 2+ tranches: renders as a table, grouped by currency with subheader rows
 *                when multi-currency. TotalsLine shown on top.
 */
export function TranchesList({ tranches }: TranchesListProps) {
  if (!tranches || tranches.length === 0) return null;

  if (tranches.length === 1) {
    return <SingleTrancheInline tranche={tranches[0]} />;
  }

  const groups = groupByCurrency(tranches);
  const isMultiCurrency = groups.length > 1;
  const totalsDisplay = buildTotalsDisplay(groups);
  const trancheCountLabel = `${tranches.length} tranches`;

  const headerCellStyle: React.CSSProperties = {
    padding: '8px 10px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 600,
    color: EmailColors.text.meta,
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    borderBottom: `2px solid ${EmailColors.structure.border}`,
  };

  return (
    <div style={{ margin: '12px 0 16px 0' }}>
      <TotalsLine display={totalsDisplay} trancheCountLabel={trancheCountLabel} />
      <table
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        style={{
          borderCollapse: 'collapse',
          border: `1px solid ${EmailColors.structure.border}`,
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <thead>
          <tr>
            <th style={headerCellStyle}>Amount</th>
            <th style={headerCellStyle}>Coupon</th>
            <th style={headerCellStyle}>Maturity</th>
            <th style={headerCellStyle}>Yield</th>
            <th style={headerCellStyle}>Spread</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group, gIdx) => {
            const rows: React.ReactNode[] = [];
            if (isMultiCurrency) {
              rows.push(
                <tr key={`sub-${group.currency}`}>
                  <td
                    colSpan={5}
                    style={{
                      padding: '6px 10px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: EmailColors.text.meta,
                      textTransform: 'uppercase',
                      letterSpacing: '0.3px',
                      backgroundColor: EmailColors.structure.backgroundAlt,
                      borderTop: gIdx > 0 ? `1px solid ${EmailColors.structure.border}` : 'none',
                      borderBottom: `1px solid ${EmailColors.structure.borderLight}`,
                    }}
                  >
                    {group.currency}
                  </td>
                </tr>,
              );
            }
            group.rows.forEach((tranche, rIdx) => {
              // Suppress bottom border on the last row of each group — the next
              // group's currency subheader provides its own top border, so we
              // avoid doubled dividers between groups.
              const isLastInGroup = rIdx === group.rows.length - 1;
              const isLastOverall = gIdx === groups.length - 1 && isLastInGroup;
              rows.push(
                <TrancheRow
                  key={`${group.currency}-${rIdx}`}
                  tranche={tranche}
                  isLast={isLastOverall || (isLastInGroup && isMultiCurrency)}
                />,
              );
            });
            return <React.Fragment key={group.currency}>{rows}</React.Fragment>;
          })}
        </tbody>
      </table>
    </div>
  );
}

export default TranchesList;
