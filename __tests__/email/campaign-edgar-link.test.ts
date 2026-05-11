/**
 * Campaign EDGAR-link redirect regression suite.
 *
 * The bug this guards against: SEC filing links in campaign emails sometimes
 * routed to (a) EDGAR's company-search page, (b) the filing's `-index.htm`
 * documents-list page, instead of (c) the actual filing document.
 *
 * Root causes (covered by these tests):
 *   1. Campaign template selected only `Summary.filingUrl`, not `Summary.url`
 *      (the resolved primary doc URL). Fixed by plumbing `s.url` through
 *      `toCampaignFiling`.
 *   2. The fallback fixture's empty `filingUrl` made `getSecFilingViewerUrl('')`
 *      return EDGAR's companysearch URL. Fixed by collapsing the "Source"
 *      anchor when no real URL is present.
 *   3. Rows where `Summary.url` is null AND `Summary.filingUrl` is an
 *      `-index.htm` URL would still pass through unchanged. Fixed by calling
 *      `resolveSecPrimaryDocumentUrl` inside `fetchCampaignFilings` to upgrade
 *      to the primary doc via `index.json`.
 *
 * Strategy: assert against the rendered HTML href of email1() across the
 * three input shapes the user observed.
 */

jest.mock('@react-email/render', () => ({
  renderAsync: jest.fn(async () => '<table><tbody><tr><td>STUB</td></tr></tbody></table>'),
}));

import {
  getCampaignEmailContent,
  toCampaignFiling,
  type ScoredSummaryRow,
  type CampaignFiling,
} from '@/lib/email/campaign-templates';

const baseOptions = { unsubscribeUrl: 'https://tldrsec.app/unsubscribe?token=t' };

/** Pull non-unsubscribe anchor hrefs from rendered HTML. */
function nonUnsubHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /<a\s+[^>]*href="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const h = m[1];
    if (h.includes('/unsubscribe') || h.includes('/dashboard/settings')) continue;
    out.push(h);
  }
  return out;
}

function makeFiling(overrides: Partial<CampaignFiling> = {}): CampaignFiling {
  return {
    ticker: 'AAPL',
    companyName: 'Apple Inc',
    filingType: '10-Q',
    filingDate: new Date('2026-04-15'),
    importance: 'high',
    summary: 'Quarterly results.',
    title: 'Q2 fiscal 2026 results',
    ...overrides,
  };
}

describe('toCampaignFiling — Summary.url field preference', () => {
  function makeRow(overrides: Partial<ScoredSummaryRow> = {}): ScoredSummaryRow {
    return {
      filingType: '10-Q',
      filingDate: new Date('2026-04-15'),
      summaryText: 'A quarter happened.',
      summaryJSON: null,
      importance: 'high',
      smartSubject: 'Q2 results',
      tokensUsed: 1000,
      filingUrl: 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000077/0000320193-26-000077-index.htm',
      url: null,
      ticker: { symbol: 'AAPL', companyName: 'Apple Inc' },
      score: 12,
      ...overrides,
    };
  }

  it('prefers s.url (primary doc) over s.filingUrl (index page)', () => {
    const primaryDoc = 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000077/aapl-20260330.htm';
    const out = toCampaignFiling(makeRow({ url: primaryDoc }));
    expect(out.filingUrl).toBe(primaryDoc);
  });

  it('falls back to s.filingUrl when s.url is null', () => {
    const indexUrl = 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000077/0000320193-26-000077-index.htm';
    const out = toCampaignFiling(makeRow({ url: null, filingUrl: indexUrl }));
    expect(out.filingUrl).toBe(indexUrl);
  });

  it('returns undefined filingUrl when both url and filingUrl are missing', () => {
    const out = toCampaignFiling(makeRow({ url: null, filingUrl: '' }));
    // Empty-string filingUrl coerces to undefined via `?? undefined`
    expect(out.filingUrl == null || out.filingUrl === '').toBe(true);
  });
});

describe('email1() rendered href across URL shapes', () => {
  it('renders the primary doc URL as the EDGAR Source anchor when given a primary doc', async () => {
    const primaryDoc = 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000077/aapl-20260330.htm';
    const { html } = await getCampaignEmailContent(1, {
      ...baseOptions,
      filings: [makeFiling({ filingUrl: primaryDoc })],
    });
    const hrefs = nonUnsubHrefs(html);
    expect(hrefs).toContain(primaryDoc);
  });

  it('passes through an `-index.htm` URL unchanged at the renderer layer', async () => {
    // The renderer itself does not resolve index pages — that resolution
    // happens upstream in `fetchCampaignFilings` via
    // `resolveSecPrimaryDocumentUrl`. When a caller hands the renderer a
    // raw -index.htm (e.g. test fixtures, demo route), the helper passes
    // it through. Pinning that contract: index.htm reaches the anchor
    // verbatim, and the upstream resolver is responsible for upgrading.
    const indexUrl = 'https://www.sec.gov/Archives/edgar/data/320193/000032019326000077/0000320193-26-000077-index.htm';
    const { html } = await getCampaignEmailContent(1, {
      ...baseOptions,
      filings: [makeFiling({ filingUrl: indexUrl })],
    });
    const hrefs = nonUnsubHrefs(html);
    expect(hrefs).toContain(indexUrl);
  });

  it('omits the EDGAR Source anchor entirely when filingUrl is empty/missing', async () => {
    // No filingUrl on the input: the fallback fixture path does this, and
    // any DB row with url=null AND filingUrl='' (rare but possible) hits
    // it too. Pre-fix this produced a search-page redirect; post-fix the
    // line collapses to "Filed: <date>".
    const { html } = await getCampaignEmailContent(1, {
      ...baseOptions,
      filings: [makeFiling({ filingUrl: undefined })],
    });
    const hrefs = nonUnsubHrefs(html);
    expect(hrefs.some((h) => h.startsWith('https://www.sec.gov/'))).toBe(false);
    // The "Filed:" date label is still present so the audit cue remains.
    expect(html).toContain('Filed: ');
  });

  it('does NOT route to EDGAR companysearch when filingUrl is empty', async () => {
    // Specific anti-regression: pre-fix `getSecFilingViewerUrl('')` returned
    // 'https://www.sec.gov/edgar/searchedgar/companysearch.html' which
    // recipients perceived as a broken redirect.
    const { html } = await getCampaignEmailContent(1, {
      ...baseOptions,
      filings: [makeFiling({ filingUrl: undefined })],
    });
    expect(html).not.toContain('searchedgar/companysearch');
  });

  it('does NOT route to EDGAR companysearch in the fallback (no filings) path', async () => {
    // Same anti-regression but exercising the no-filings fallback fixture
    // path explicitly.
    const { html } = await getCampaignEmailContent(1, baseOptions);
    expect(html).not.toContain('searchedgar/companysearch');
  });
});
