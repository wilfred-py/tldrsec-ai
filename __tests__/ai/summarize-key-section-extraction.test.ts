/**
 * Regression tests for processDocumentContent's key-section extraction.
 *
 * v0.0.25.4 made three load-bearing changes to support FCF Margin extraction
 * on 10-Q filings:
 *   1. Added 'Cash Flow' / 'Statements of Cash' to the key-phrase allowlist.
 *   2. Switched matching to case-insensitive — older filings use ALL-CAPS
 *      headings like "CONSOLIDATED STATEMENTS OF CASH FLOWS".
 *   3. Widened the extraction window for financial reports (10-K/10-Q/20-F/
 *      40-F and amendments) from 5000 chars (500 before + 4500 after) to
 *      19000 chars (1000 before + 18000 after) so multi-column income-
 *      statement tables aren't truncated mid-row.
 *
 * If any of those revert, FCF / current-period extraction silently degrades.
 * These tests pin the contract.
 */

import { processDocumentContent } from '@/lib/ai/summarize';

describe('processDocumentContent — key-section extraction', () => {
  // The chunker only triggers the multi-chunk extraction path for content
  // that exceeds the per-filing chunk size. The 10-Q chunk size is 24000,
  // so we need >24000 chars before the marker for it to land in chunk[1+].
  const CHUNK_FILLER = 'A'.repeat(28000);

  it('finds ALL-CAPS "CONSOLIDATED STATEMENTS OF CASH FLOWS" via case-insensitive match', () => {
    const heading = 'CONSOLIDATED STATEMENTS OF CASH FLOWS';
    const cashFlowBody = 'NET CASH FROM OPERATIONS 1,234 ' + 'X'.repeat(2000) + ' END_OF_CASH_TABLE';
    const content = CHUNK_FILLER + '\n\n' + heading + '\n' + cashFlowBody;

    const out = processDocumentContent(content, '10-Q', 200_000);

    // The heading + cash-flow body should make it through despite the case mismatch.
    expect(out.processedContent).toContain(heading);
    expect(out.processedContent).toContain('NET CASH FROM OPERATIONS 1,234');
    expect(out.processedContent).toContain('END_OF_CASH_TABLE');
  });

  it('matches "Cash Flow" as a standalone key phrase (not just "Consolidated Statements")', () => {
    // Use a heading that does NOT trigger any of the older key phrases.
    const heading = 'Operating Cash Flow Detail';
    const body = 'OPERATING_DETAIL_MARKER ' + 'Y'.repeat(2000);
    const content = CHUNK_FILLER + '\n\n' + heading + '\n' + body;

    const out = processDocumentContent(content, '10-Q', 200_000);

    expect(out.processedContent).toContain('OPERATING_DETAIL_MARKER');
  });

  it('uses a wide enough 10-Q extraction window to capture the full income-statement table', () => {
    // Place a marker 17000 chars after the heading. A 5000-char window
    // would drop it; the 19000-char financial-report window catches it.
    const heading = 'Consolidated Statements';
    const tail = 'TAIL_MARKER';
    const padded = heading + '\n' + 'Z'.repeat(17000) + ' ' + tail;
    const content = CHUNK_FILLER + '\n\n' + padded;

    const out = processDocumentContent(content, '10-Q', 200_000);

    expect(out.processedContent).toContain(heading);
    expect(out.processedContent).toContain(tail);
  });

});
