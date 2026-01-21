/**
 * Historical Context Service
 *
 * Retrieves historical summaries for a ticker and builds context-enriched prompts.
 * This enables the AI to reference recent filings when generating new summaries,
 * improving consistency and providing relevant context.
 *
 * Phase 3 of SEC Summary Quality Improvements.
 */

import { getPrismaClient } from '@/lib/db/prisma';

/**
 * Represents a historical summary with minimal fields needed for context.
 */
export interface HistoricalSummary {
  id: string;
  filingType: string;
  filingDate: Date;
  summaryText: string;
  ticker: {
    symbol: string;
  };
}

/**
 * Maximum number of historical summaries to retrieve.
 * Balances context richness with token budget.
 */
const MAX_HISTORICAL_SUMMARIES = 3;

/**
 * Maximum character length for each historical summary.
 * Prevents excessive token usage from long summaries.
 */
const MAX_SUMMARY_LENGTH = 1500;

/**
 * Retrieves the most recent summaries for a given ticker, excluding the current filing date.
 *
 * @param tickerSymbol - The ticker symbol (e.g., 'GOOG', 'TSLA')
 * @param currentFilingDate - The date of the current filing to exclude (ISO string)
 * @returns Array of historical summaries, ordered by filing date descending
 */
export async function getHistoricalSummaries(
  tickerSymbol: string,
  currentFilingDate: string
): Promise<HistoricalSummary[]> {
  const prisma = getPrismaClient();

  const summaries = await prisma.summary.findMany({
    where: {
      ticker: {
        symbol: tickerSymbol,
      },
      filingDate: {
        lt: new Date(currentFilingDate),
      },
    },
    select: {
      id: true,
      filingType: true,
      filingDate: true,
      summaryText: true,
      ticker: {
        select: {
          symbol: true,
        },
      },
    },
    orderBy: {
      filingDate: 'desc',
    },
    take: MAX_HISTORICAL_SUMMARIES,
  });

  return summaries;
}

/**
 * Builds a context-enriched prompt that includes historical summaries.
 * If no historical summaries exist, returns the original content unchanged.
 *
 * @param currentContent - The current filing content to analyze
 * @param historicalSummaries - Array of recent summaries for context
 * @returns The enriched prompt with historical context section
 */
export function buildContextEnrichedPrompt(
  currentContent: string,
  historicalSummaries: HistoricalSummary[]
): string {
  if (historicalSummaries.length === 0) {
    return currentContent;
  }

  const contextSection = historicalSummaries
    .map((summary) => {
      const truncatedText =
        summary.summaryText.length > MAX_SUMMARY_LENGTH
          ? summary.summaryText.substring(0, MAX_SUMMARY_LENGTH) + '...'
          : summary.summaryText;

      const dateStr = summary.filingDate.toISOString().split('T')[0];

      return `### Previous ${summary.filingType} (${dateStr})
${truncatedText}`;
    })
    .join('\n\n');

  return `## Historical Context
The following are the most recent filings for this company. Use this context to provide continuity and reference relevant patterns:

${contextSection}

---

## Current Filing
${currentContent}`;
}
