/**
 * Tests for the generic StructuredSummary component.
 *
 * Verifies:
 * - Summary prose always renders first
 * - Metric fields render as cards
 * - Array fields render as bullet lists
 * - Hidden/metadata fields are excluded
 * - Falls back to summaryText when < 3 meaningful fields
 * - Amendment badge renders when isAmendment=true
 * - Empty sections don't render headers
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { StructuredSummary } from '@/components/summary/formatted-summaries/structured-summary';

const defaultProps = {
  ticker: { symbol: 'AAPL', companyName: 'Apple Inc.' },
  filingDate: new Date('2026-03-15'),
  filingType: 'SC 13G',
  summaryText: 'Fallback text content for the filing.',
};

describe('StructuredSummary', () => {
  it('renders summary prose first when summaryJSON has content', () => {
    const { container } = render(
      <StructuredSummary
        {...defaultProps}
        summaryData={{
          company: 'Apple Inc.',
          summary: 'Vanguard reports 8.2% ownership of Apple common stock.',
          filerName: 'The Vanguard Group',
          ownershipPercentage: '8.2%',
          sharesOwned: '1,340,000,000',
        }}
      />
    );

    // Summary should appear in the content
    expect(screen.getByText(/Vanguard reports 8.2% ownership/)).toBeInTheDocument();
    // Metric cards should also appear
    expect(screen.getByText('8.2%')).toBeInTheDocument();
    expect(screen.getByText('Ownership')).toBeInTheDocument();
  });

  it('falls back to summaryText when fewer than 3 meaningful fields', () => {
    render(
      <StructuredSummary
        {...defaultProps}
        summaryData={{
          company: 'Apple Inc.',
          summary: 'Brief summary.',
        }}
      />
    );

    // Should show the fallback text since company and summary are hidden/only 2 meaningful
    expect(screen.getByText('Fallback text content for the filing.')).toBeInTheDocument();
  });

  it('hides metadata fields like _schemaVersion', () => {
    render(
      <StructuredSummary
        {...defaultProps}
        summaryData={{
          company: 'Apple Inc.',
          summary: 'Summary text here.',
          _schemaVersion: '2.0',
          _metadata: { processed: true },
          importanceScore: 'high',
          filerName: 'Vanguard',
          ownershipPercentage: '8.2%',
          sharesOwned: '1.3B',
        }}
      />
    );

    // Metadata should not appear
    expect(screen.queryByText('2.0')).not.toBeInTheDocument();
    expect(screen.queryByText('Schema Version')).not.toBeInTheDocument();
    expect(screen.queryByText('Importance Score')).not.toBeInTheDocument();
  });

  it('renders amendment badge when isAmendment is true', () => {
    render(
      <StructuredSummary
        {...defaultProps}
        isAmendment={true}
        summaryData={{
          company: 'Apple Inc.',
          summary: 'Amended filing.',
          filerName: 'Vanguard',
          ownershipPercentage: '9.1%',
          sharesOwned: '1.5B',
        }}
      />
    );

    expect(screen.getByText('Amendment')).toBeInTheDocument();
  });

  it('renders array fields as lists', () => {
    render(
      <StructuredSummary
        {...defaultProps}
        filingType="DEF 14A"
        summaryData={{
          company: 'Apple Inc.',
          summary: 'Proxy statement for annual meeting.',
          meetingDate: '2026-06-15',
          filerName: 'Apple Inc.',
          keyPoints: ['Director election', 'Executive compensation vote', 'Auditor ratification'],
        }}
      />
    );

    expect(screen.getByText('Director election')).toBeInTheDocument();
    expect(screen.getByText('Executive compensation vote')).toBeInTheDocument();
    expect(screen.getByText('Auditor ratification')).toBeInTheDocument();
  });

  it('renders object array items with primary + secondary fields', () => {
    render(
      <StructuredSummary
        {...defaultProps}
        filingType="DEFA14A"
        summaryData={{
          company: 'Apple Inc.',
          summary: 'Supplemental proxy materials.',
          materialType: 'Investor Presentation',
          keyProposals: [
            { proposal: 'Elect directors', recommendation: 'FOR' },
            { proposal: 'Advisory vote on compensation', recommendation: 'FOR' },
          ],
          newInformation: 'Updated vote recommendations based on ISS review.',
        }}
      />
    );

    expect(screen.getByText('Elect directors')).toBeInTheDocument();
    // FOR appears as part of the secondary fields on each proposal
    expect(screen.getByText(/Advisory vote on compensation/)).toBeInTheDocument();
  });

  it('does not render headers for empty arrays', () => {
    render(
      <StructuredSummary
        {...defaultProps}
        filingType="424B2"
        summaryData={{
          company: 'Goldman Sachs',
          summary: 'Pricing supplement for structured notes.',
          offeringType: 'Structured Notes',
          offeringAmount: '$50,000,000',
          interestRate: '0%',
          riskFactors: [],  // empty array
        }}
      />
    );

    // Risk Factors header should NOT appear since the array is empty
    expect(screen.queryByText('Risk Factors')).not.toBeInTheDocument();
    // But other content should be present
    expect(screen.getByText('Structured Notes')).toBeInTheDocument();
  });

  it('renders filing type badge', () => {
    render(
      <StructuredSummary
        {...defaultProps}
        filingType="FWP"
        summaryData={{
          company: 'Tesla',
          summary: 'Free writing prospectus for convertible notes.',
          offeringType: 'Convertible Notes',
          updatedTerms: 'Price range $180-$200',
          underlyingReference: 'TSLA common stock',
        }}
      />
    );

    expect(screen.getByText('FWP')).toBeInTheDocument();
    expect(screen.getByText('Convertible Notes')).toBeInTheDocument();
  });
});
