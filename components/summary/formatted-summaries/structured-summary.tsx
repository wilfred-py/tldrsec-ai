'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

/**
 * Generic structured summary renderer for filing types that don't have
 * a dedicated display component (SC 13G, 13D, DEF 14A, DEFA14A, 424B2,
 * S-1, S-3, FWP, 11-K, Form 144, etc.)
 *
 * Design principles:
 * - Summary prose ALWAYS renders first (never replaced by cards)
 * - Skip section headers when content is null/undefined/empty
 * - Deliberately simpler than rich 10-K/10-Q layout
 * - Falls back to summaryText if summaryJSON has < 3 meaningful fields
 */

// Fields that should never be displayed as user-facing content
const HIDDEN_FIELDS = new Set([
  '_schemaVersion', '_metadata', '_normalized', '_rawResponse',
  'importanceScore', 'company', 'summary',
]);

// Custom labels for domain-specific fields
const FIELD_LABELS: Record<string, string> = {
  filerName: 'Filer',
  ownershipPercentage: 'Ownership',
  sharesOwned: 'Shares Owned',
  previousOwnershipPercentage: 'Previous Ownership',
  changeInOwnership: 'Change in Ownership',
  filingPurpose: 'Filing Purpose',
  filerType: 'Filer Type',
  eventType: 'Event Type',
  sentiment: 'Sentiment',
  itemNumbers: 'Item Numbers',
  itemDescriptions: 'Items',
  offeringType: 'Offering Type',
  offeringSize: 'Offering Size',
  offeringAmount: 'Offering Amount',
  maturityDate: 'Maturity Date',
  interestRate: 'Interest Rate',
  priceRange: 'Price Range',
  sharesOffered: 'Shares Offered',
  useOfProceeds: 'Use of Proceeds',
  expectedTradingDate: 'Expected Trading Date',
  exchangeListing: 'Exchange Listing',
  underwriters: 'Underwriters',
  dilutionImpact: 'Dilution Impact',
  shelfRegistration: 'Shelf Registration',
  sellingShareholders: 'Selling Shareholders',
  meetingDate: 'Meeting Date',
  executiveCompensation: 'Executive Compensation',
  ceoPayRatio: 'CEO Pay Ratio',
  boardProposals: 'Board Proposals',
  shareholderProposals: 'Shareholder Proposals',
  directorNominees: 'Director Nominees',
  sayOnPay: 'Say on Pay',
  auditorRatification: 'Auditor Ratification',
  signalStrength: 'Signal Strength',
  estimatedValue: 'Estimated Value',
  remainingHoldings: 'Remaining Holdings',
  sharesOutstanding: 'Shares Outstanding',
  has10b51Plan: '10b5-1 Plan',
  totalValue: 'Total Value',
  percentageChange: '% Change',
  planAssets: 'Plan Assets',
  planName: 'Plan Name',
  planType: 'Plan Type',
  fiscalYear: 'Fiscal Year',
  fiscalQuarter: 'Fiscal Quarter',
  financialHighlights: 'Financial Highlights',
  keyHighlights: 'Key Highlights',
  keyPoints: 'Key Points',
  riskFactors: 'Risk Factors',
  materialType: 'Material Type',
  filerIdentity: 'Filed By',
  keyProposals: 'Key Proposals',
  newInformation: 'New Information',
  updatedTerms: 'Updated Terms',
  underlyingReference: 'Underlying Reference',
  managementCommentary: 'Management Commentary',
  forwardGuidance: 'Forward Guidance',
  financialImpact: 'Financial Impact',
  businessDescription: 'Business Description',
  pricePerShare: 'Price Per Share',
  qoqChange: 'Quarter-over-Quarter Change',
  quarterlyTrends: 'Quarterly Trends',
  guidanceUpdates: 'Guidance Updates',
  positiveDevelopments: 'Positive Developments',
  concerns: 'Concerns',
  transactions: 'Transactions',
  vestingDetails: 'Vesting Details',
  purpose: 'Purpose',
  fundingSource: 'Funding Source',
  proposedActions: 'Proposed Actions',
  tradingPlan: 'Trading Plan',
  recentActivity: 'Recent Activity',
  percentOfHoldings: '% of Holdings',
  broker: 'Broker',
  investorImplication: 'Investor Implication',
};

// Fields that are filing-type-specific "headline" metrics (render as cards)
const METRIC_FIELDS = new Set([
  'ownershipPercentage', 'sharesOwned', 'totalValue', 'estimatedValue',
  'offeringSize', 'offeringAmount', 'interestRate', 'maturityDate',
  'planAssets', 'ceoPayRatio', 'signalStrength', 'percentageChange',
  'remainingHoldings', 'sharesOutstanding', 'pricePerShare', 'dilutionImpact',
  'priceRange', 'sharesOffered',
]);

interface StructuredSummaryProps {
  summaryData: Record<string, unknown>;
  summaryText: string;
  ticker: {
    symbol: string;
    companyName: string;
  };
  filingDate: Date;
  filingType: string;
  isAmendment?: boolean;
}

function humanizeFieldName(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  // camelCase -> Title Case: "estimatedValue" -> "Estimated Value"
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

function isMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) return false;
  return true;
}

function renderValue(value: unknown): React.ReactNode {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'object' && value !== null) {
    // Render object as key: value pairs
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => isMeaningfulValue(v))
      .map(([k, v]) => `${humanizeFieldName(k)}: ${String(v)}`)
      .join(', ');
  }
  return String(value);
}

function renderArrayItem(item: unknown, index: number): React.ReactNode {
  if (typeof item === 'string') {
    return <li key={index} className="text-sm text-muted-foreground">{item}</li>;
  }
  if (typeof item === 'object' && item !== null) {
    const obj = item as Record<string, unknown>;
    // Extract the most meaningful field as the primary text
    const textFields = ['highlight', 'proposal', 'label', 'metric', 'name', 'title', 'description'];
    const primaryField = textFields.find(f => obj[f] && typeof obj[f] === 'string');
    const primaryText = primaryField ? String(obj[primaryField]) : '';

    // Collect secondary fields
    const secondaryParts: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (k === primaryField || !isMeaningfulValue(v)) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        secondaryParts.push(`${humanizeFieldName(k)}: ${renderValue(v)}`);
      }
    }

    return (
      <li key={index} className="text-sm text-muted-foreground">
        {primaryText && <span className="font-medium text-foreground">{primaryText}</span>}
        {primaryText && secondaryParts.length > 0 && ' — '}
        {secondaryParts.join(' · ')}
      </li>
    );
  }
  return <li key={index} className="text-sm text-muted-foreground">{String(item)}</li>;
}

export function StructuredSummary({
  summaryData,
  summaryText,
  ticker,
  filingDate,
  filingType,
  isAmendment,
}: StructuredSummaryProps) {
  // Count meaningful fields (excluding hidden/metadata)
  const meaningfulFields = Object.entries(summaryData).filter(
    ([key, value]) => !HIDDEN_FIELDS.has(key) && isMeaningfulValue(value)
  );

  // If fewer than 3 meaningful fields, fall back to summaryText
  if (meaningfulFields.length < 3) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{ticker.companyName} ({ticker.symbol})</CardTitle>
          <CardDescription>
            {filingType} · {isNaN(new Date(filingDate).getTime()) ? 'Unknown date' : format(new Date(filingDate), 'PPP')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="prose dark:prose-invert max-w-none">
            <div className="whitespace-pre-wrap">{summaryText}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Categorize fields into: metrics (cards), arrays (lists), text (prose)
  const metricEntries: [string, unknown][] = [];
  const arrayEntries: [string, unknown[]][] = [];
  const textEntries: [string, string][] = [];
  const objectEntries: [string, Record<string, unknown>][] = [];

  for (const [key, value] of meaningfulFields) {
    if (METRIC_FIELDS.has(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
      metricEntries.push([key, value]);
    } else if (Array.isArray(value)) {
      arrayEntries.push([key, value]);
    } else if (typeof value === 'object' && value !== null) {
      objectEntries.push([key, value as Record<string, unknown>]);
    } else if (typeof value === 'string' && value.length > 100) {
      textEntries.push([key, value]);
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      metricEntries.push([key, value]);
    }
  }

  const summary = typeof summaryData.summary === 'string' ? summaryData.summary : null;
  const company = typeof summaryData.company === 'string' ? summaryData.company : ticker.companyName;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle>{company} ({ticker.symbol})</CardTitle>
          <Badge variant="secondary">{filingType}</Badge>
          {isAmendment && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
              Amendment
            </Badge>
          )}
        </div>
        <CardDescription>Filed {isNaN(new Date(filingDate).getTime()) ? 'Unknown date' : format(new Date(filingDate), 'PPP')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 1. Summary prose always first */}
        {summary && (
          <p className="text-sm leading-relaxed">{summary}</p>
        )}

        {/* 2. Metric cards in a responsive grid */}
        {metricEntries.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {metricEntries.map(([key, value]) => (
              <div key={key} className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">{humanizeFieldName(key)}</p>
                <p className="text-sm font-medium mt-0.5">{renderValue(value)}</p>
              </div>
            ))}
          </div>
        )}

        {/* 3. Text/prose fields */}
        {textEntries.map(([key, value]) => (
          <div key={key}>
            <h4 className="text-sm font-medium mb-1">{humanizeFieldName(key)}</h4>
            <p className="text-sm text-muted-foreground">{value}</p>
          </div>
        ))}

        {/* 4. Object entries (e.g., sayOnPay, shelfRegistration) */}
        {objectEntries.map(([key, obj]) => {
          const parts = Object.entries(obj).filter(([, v]) => isMeaningfulValue(v));
          if (parts.length === 0) return null;
          return (
            <div key={key}>
              <h4 className="text-sm font-medium mb-1">{humanizeFieldName(key)}</h4>
              <div className="rounded-lg bg-muted/40 p-3 space-y-1">
                {parts.map(([subKey, subValue]) => (
                  <div key={subKey} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{humanizeFieldName(subKey)}</span>
                    <span className="font-medium">{renderValue(subValue)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* 5. Array fields as bullet lists */}
        {arrayEntries.map(([key, items]) => (
          <div key={key}>
            <h4 className="text-sm font-medium mb-1">{humanizeFieldName(key)}</h4>
            <ul className="space-y-1 list-disc list-inside">
              {items.slice(0, 20).map((item, i) => renderArrayItem(item, i))}
              {items.length > 20 && (
                <li className="text-xs text-muted-foreground italic">...and {items.length - 20} more</li>
              )}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
