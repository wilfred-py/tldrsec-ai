/**
 * UTM propagation tests for getSecFilingViewerUrl.
 * W4.1 — measures click-through attribution for "Why it matters" rollout.
 *
 * When a `variant` is passed, the helper wraps the resolved SEC URL in our
 * `/r/filing?url=...&v=...&f=...&ft=...` redirect. The redirect route then
 * captures a PostHog `email_cta_clicked` event server-side before 302ing to
 * SEC.gov — PostHog's snippet can't run on sec.gov, so a redirect on our
 * own domain is the only way to observe the click.
 *
 * No variant → resolved SEC URL passes through unchanged (backward compat).
 */

import { getSecFilingViewerUrl } from '../../lib/email/url-utils';

const SAMPLE_HTM = 'https://www.sec.gov/Archives/edgar/data/0000021344/000155278125000454/e25454_ko-8k.htm';
const SAMPLE_DIRECTORY = 'https://www.sec.gov/Archives/edgar/data/0001679788/000167978825000249';
const SAMPLE_FORM4_XML = 'https://www.sec.gov/Archives/edgar/data/1234567/000123456725000001/form4.xml';
const SEARCH_FALLBACK = 'https://www.sec.gov/edgar/searchedgar/companysearch.html';

const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://tldrsec.app';
});

afterAll(() => {
  if (ORIGINAL_APP_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_APP_URL;
});

function parseRedirect(redirectUrl: string): { base: string; params: URLSearchParams } {
  const parsed = new URL(redirectUrl);
  return {
    base: `${parsed.origin}${parsed.pathname}`,
    params: parsed.searchParams,
  };
}

describe('getSecFilingViewerUrl — backward compatibility (no options)', () => {
  it('returns unchanged URL when no options provided (htm)', () => {
    expect(getSecFilingViewerUrl(SAMPLE_HTM)).toBe(SAMPLE_HTM);
  });

  it('returns unchanged URL with formType but no options', () => {
    expect(getSecFilingViewerUrl(SAMPLE_HTM, '8-K')).toBe(SAMPLE_HTM);
  });

  it('returns unchanged URL with empty options object', () => {
    expect(getSecFilingViewerUrl(SAMPLE_HTM, '8-K', {})).toBe(SAMPLE_HTM);
  });

  it('returns unchanged URL when variant is undefined', () => {
    expect(getSecFilingViewerUrl(SAMPLE_HTM, '8-K', { variant: undefined })).toBe(SAMPLE_HTM);
  });

  it('returns unchanged URL when only filingId is set (no variant)', () => {
    // Without a variant there's no attribution cohort to capture — skip the redirect.
    expect(getSecFilingViewerUrl(SAMPLE_HTM, '8-K', { filingId: 'abc' })).toBe(SAMPLE_HTM);
  });
});

describe('getSecFilingViewerUrl — redirect wrapping with variant', () => {
  it('wraps in /r/filing with v param for ai variant', () => {
    const result = getSecFilingViewerUrl(SAMPLE_HTM, '8-K', { variant: 'ai' });
    const { base, params } = parseRedirect(result);
    expect(base).toBe('https://tldrsec.app/r/filing');
    expect(params.get('url')).toBe(SAMPLE_HTM);
    expect(params.get('v')).toBe('ai');
    expect(params.get('ft')).toBe('8-K');
  });

  it('explicit filingId takes precedence over URL extraction', () => {
    const result = getSecFilingViewerUrl(SAMPLE_HTM, '8-K', {
      variant: 'ai',
      filingId: '0001679788-25-000249',
    });
    const { params } = parseRedirect(result);
    expect(params.get('f')).toBe('0001679788-25-000249');
  });

  it('auto-extracts accession from SEC URL when filingId not provided', () => {
    // SAMPLE_HTM contains accession 000155278125000454 in its path — the redirect
    // should carry that as `f` so click cohorts correlate without the caller
    // having to thread the accession through.
    const result = getSecFilingViewerUrl(SAMPLE_HTM, '8-K', { variant: 'fallback' });
    const { params } = parseRedirect(result);
    expect(params.get('f')).toBe('000155278125000454');
  });

  it('omits f param when URL has no accession pattern (e.g. EDGAR search)', () => {
    // getSecFilingViewerUrl('') resolves to the EDGAR search fallback, which
    // is never wrapped — so this path is exercised via a non-Archives URL.
    const nonArchives = 'https://www.sec.gov/edgar/browse/?CIK=0000320193';
    const result = getSecFilingViewerUrl(nonArchives, '8-K', { variant: 'ai' });
    const { params } = parseRedirect(result);
    expect(params.has('f')).toBe(false);
  });

  it('omits ft param when formType not provided', () => {
    const result = getSecFilingViewerUrl(SAMPLE_HTM, undefined, { variant: 'ai' });
    const { params } = parseRedirect(result);
    expect(params.has('ft')).toBe(false);
  });

  it('percent-encodes the destination URL so nested query strings survive', () => {
    const urlWithQuery = `${SAMPLE_HTM}?foo=bar`;
    const result = getSecFilingViewerUrl(urlWithQuery, '8-K', { variant: 'ai' });
    const { params } = parseRedirect(result);
    expect(params.get('url')).toBe(urlWithQuery);
    // Raw encoded form should contain %3D / %26 for the nested ?foo=bar
    expect(result).toContain('url=');
    expect(result).toMatch(/%3F|%3D/);
  });

  it('accepts all four variants', () => {
    const variants = ['ai', 'fallback', 'note', 'neutral'] as const;
    variants.forEach(v => {
      const result = getSecFilingViewerUrl(SAMPLE_HTM, '8-K', { variant: v });
      const { params } = parseRedirect(result);
      expect(params.get('v')).toBe(v);
    });
  });

  it('wraps normalized directory URL (directory → index.html → redirect)', () => {
    const result = getSecFilingViewerUrl(SAMPLE_DIRECTORY, undefined, { variant: 'ai' });
    const { base, params } = parseRedirect(result);
    expect(base).toBe('https://tldrsec.app/r/filing');
    expect(params.get('url')).toContain('-index.html');
    expect(params.get('v')).toBe('ai');
  });

  it('wraps Form 4 XML with injected stylesheet path', () => {
    const result = getSecFilingViewerUrl(SAMPLE_FORM4_XML, 'Form 4', { variant: 'note' });
    const { params } = parseRedirect(result);
    expect(params.get('url')).toContain('/xslF345X05/');
    expect(params.get('v')).toBe('note');
    expect(params.get('ft')).toBe('Form 4');
  });

  it('falls back to DEFAULT_APP_URL when NEXT_PUBLIC_APP_URL is empty', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const result = getSecFilingViewerUrl(SAMPLE_HTM, '8-K', { variant: 'ai' });
    expect(result.startsWith('https://tldrsec.app/r/filing')).toBe(true);
  });
});

describe('getSecFilingViewerUrl — empty URL fallback', () => {
  it('does not wrap the EDGAR search fallback even with variant', () => {
    // The search fallback is not a filing link — skip redirect to avoid
    // misattributing clicks to a "filing" variant that wasn't rendered.
    const result = getSecFilingViewerUrl('', '8-K', { variant: 'ai' });
    expect(result).toBe(SEARCH_FALLBACK);
  });

  it('returns search fallback unchanged with no options', () => {
    expect(getSecFilingViewerUrl('')).toBe(SEARCH_FALLBACK);
  });
});

// ─── buildCampaignUrl ──────────────────────────────────────────────────────

import { buildCampaignUrl } from '../../lib/email/url-utils';

const TEST_SUB_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('buildCampaignUrl', () => {
  it('returns landing-page URL with all UTM params and ?sub=<uuid> for default path', () => {
    const url = buildCampaignUrl({ subscriberId: TEST_SUB_ID, emailId: 'e1' });
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://tldrsec.app');
    expect(parsed.pathname).toBe('/');
    expect(parsed.searchParams.get('sub')).toBe(TEST_SUB_ID);
    expect(parsed.searchParams.get('utm_source')).toBe('email');
    expect(parsed.searchParams.get('utm_medium')).toBe('newsletter');
    expect(parsed.searchParams.get('utm_campaign')).toBe('launch-2026-05');
    expect(parsed.searchParams.get('utm_content')).toBe('e1');
  });

  it('honors a non-default path with leading slash', () => {
    const url = buildCampaignUrl({ subscriberId: TEST_SUB_ID, emailId: 'e2', path: '/sign-up' });
    expect(new URL(url).pathname).toBe('/sign-up');
  });

  it('normalizes a path missing leading slash', () => {
    const url = buildCampaignUrl({ subscriberId: TEST_SUB_ID, emailId: 'e2', path: 'sign-up' });
    expect(new URL(url).pathname).toBe('/sign-up');
  });

  it('appends extraParams without overwriting UTMs', () => {
    const url = buildCampaignUrl({
      subscriberId: TEST_SUB_ID,
      emailId: 'e3',
      path: '/sign-up',
      extraParams: { plan: 'pro' },
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('plan')).toBe('pro');
    expect(parsed.searchParams.get('utm_content')).toBe('e3');
    expect(parsed.searchParams.get('sub')).toBe(TEST_SUB_ID);
  });

  it('skips empty extraParam values rather than emitting blank params', () => {
    const url = buildCampaignUrl({
      subscriberId: TEST_SUB_ID,
      emailId: 'e1',
      extraParams: { plan: '', referrer: 'twitter' },
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.has('plan')).toBe(false);
    expect(parsed.searchParams.get('referrer')).toBe('twitter');
  });

  it('uses NEXT_PUBLIC_APP_URL when set, falls back to tldrsec.app otherwise', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.tldrsec.app';
    const url = buildCampaignUrl({ subscriberId: TEST_SUB_ID, emailId: 'e1' });
    expect(new URL(url).origin).toBe('https://staging.tldrsec.app');
  });

  it('strips trailing slash from base url to avoid `//path`', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://tldrsec.app/';
    const url = buildCampaignUrl({ subscriberId: TEST_SUB_ID, emailId: 'e1', path: '/sign-up' });
    expect(url).toContain('https://tldrsec.app/sign-up?');
    expect(url).not.toContain('//sign-up');
  });

  it('honors campaignId override', () => {
    const url = buildCampaignUrl({
      subscriberId: TEST_SUB_ID,
      emailId: 'e1',
      campaignId: 'launch-2026-q3',
    });
    expect(new URL(url).searchParams.get('utm_campaign')).toBe('launch-2026-q3');
  });

  it('honors baseUrl override (test seam)', () => {
    const url = buildCampaignUrl({
      subscriberId: TEST_SUB_ID,
      emailId: 'e1',
      baseUrl: 'http://localhost:3000',
    });
    expect(new URL(url).origin).toBe('http://localhost:3000');
  });
});
