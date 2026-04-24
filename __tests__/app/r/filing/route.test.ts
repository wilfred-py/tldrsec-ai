/**
 * @jest-environment node
 *
 * W4.1 redirect route: captures `email_cta_clicked` server-side, 302s to SEC.
 *
 * The route is the only place we can observe a click because PostHog's snippet
 * can't run on sec.gov. Tests cover the capture contract + open-redirect
 * defense. Uses the `node` environment because `NextResponse.redirect` relies
 * on the global Response constructor, which jsdom polyfills incompletely.
 */

// `jest.mock` is hoisted above `const` declarations, so the factory can't
// close over module-scope vars. Use inline `jest.fn()` and grab typed
// references after the import.
jest.mock('../../../../lib/analytics/posthog-server', () => ({
  captureServerEvent: jest.fn(),
  getServerPostHog: jest.fn(),
}));

// Extend the global jest.setup.js next/server mock (which only exports
// NextResponse.json) to include redirect — this is all the route needs.
jest.mock('next/server', () => ({
  NextRequest: global.Request,
  NextResponse: {
    json: (body: unknown, init: ResponseInit = {}) =>
      new global.Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
      }),
    redirect: (url: string | URL, status: number = 302) =>
      new global.Response(null, {
        status,
        headers: { location: typeof url === 'string' ? url : url.toString() },
      }),
  },
}));

import { GET } from '../../../../app/r/filing/route';
import { EVENTS } from '../../../../lib/analytics/events';
import {
  captureServerEvent,
  getServerPostHog,
} from '../../../../lib/analytics/posthog-server';

const mockCapture = captureServerEvent as jest.MockedFunction<typeof captureServerEvent>;
const mockGetServerPostHog = getServerPostHog as jest.MockedFunction<typeof getServerPostHog>;

const SEC_URL = 'https://www.sec.gov/Archives/edgar/data/0000021344/000155278125000454/e25454_ko-8k.htm';
const EDGAR_SEARCH = 'https://www.sec.gov/edgar/searchedgar/companysearch.html';

function buildRequest(params: Record<string, string>): Request {
  const url = new URL('https://tldrsec.app/r/filing');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString());
}

describe('/r/filing GET — capture + redirect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: PostHog client is available
    mockGetServerPostHog.mockReturnValue({ capture: jest.fn() });
  });

  it('302s to the SEC URL', async () => {
    const res = await GET(buildRequest({ url: SEC_URL, v: 'ai' }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(SEC_URL);
  });

  it('captures email_cta_clicked with variant + destination', async () => {
    await GET(buildRequest({ url: SEC_URL, v: 'ai', f: 'acc-123', ft: '8-K' }));
    expect(mockCapture).toHaveBeenCalledTimes(1);
    const [distinctId, event, props] = mockCapture.mock.calls[0];
    expect(distinctId).toBe('acc-123');
    expect(event).toBe(EVENTS.EMAIL_CTA_CLICKED);
    expect(props).toEqual({
      variant: 'ai',
      destination: SEC_URL,
      filing_id: 'acc-123',
      form_type: '8-K',
      campaign: 'why_it_matters',
    });
  });

  it('uses a random anon distinctId when f is missing', async () => {
    await GET(buildRequest({ url: SEC_URL, v: 'fallback' }));
    const [distinctId, , props] = mockCapture.mock.calls[0];
    expect(distinctId).toMatch(/^anon-email-/);
    expect(props.filing_id).toBeUndefined();
  });

  it.each(['ai', 'fallback', 'note', 'neutral'] as const)(
    'accepts variant=%s',
    async (variant) => {
      await GET(buildRequest({ url: SEC_URL, v: variant }));
      expect(mockCapture).toHaveBeenCalledTimes(1);
      expect(mockCapture.mock.calls[0][2].variant).toBe(variant);
    },
  );
});

describe('/r/filing GET — open-redirect defense', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerPostHog.mockReturnValue({ capture: jest.fn() });
  });

  it('redirects to EDGAR search when url is not sec.gov', async () => {
    const res = await GET(buildRequest({ url: 'https://evil.example.com/phish', v: 'ai' }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(EDGAR_SEARCH);
  });

  it('redirects to EDGAR search when url is sec.gov lookalike', async () => {
    const res = await GET(buildRequest({ url: 'https://sec.gov.evil.com/phish', v: 'ai' }));
    expect(res.headers.get('location')).toBe(EDGAR_SEARCH);
  });

  it('rejects http:// URLs (only https sec.gov is allowed)', async () => {
    const res = await GET(buildRequest({ url: 'http://www.sec.gov/foo', v: 'ai' }));
    expect(res.headers.get('location')).toBe(EDGAR_SEARCH);
  });

  it('accepts sec.gov subdomains', async () => {
    const efts = 'https://efts.sec.gov/LATEST/search-index?q=test';
    const res = await GET(buildRequest({ url: efts, v: 'ai' }));
    expect(res.headers.get('location')).toBe(efts);
  });

  it('captures destination=EDGAR_SEARCH when rejecting a bad URL', async () => {
    await GET(buildRequest({ url: 'https://evil.example.com', v: 'ai' }));
    expect(mockCapture.mock.calls[0][2].destination).toBe(EDGAR_SEARCH);
  });

  it('redirects to EDGAR search when url param is missing', async () => {
    const res = await GET(buildRequest({ v: 'ai' }));
    expect(res.headers.get('location')).toBe(EDGAR_SEARCH);
  });

  it('redirects to EDGAR search when url param is malformed', async () => {
    const res = await GET(buildRequest({ url: 'not-a-url', v: 'ai' }));
    expect(res.headers.get('location')).toBe(EDGAR_SEARCH);
  });
});

describe('/r/filing GET — variant validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerPostHog.mockReturnValue({ capture: jest.fn() });
  });

  it('skips capture (but still redirects) when v is missing', async () => {
    const res = await GET(buildRequest({ url: SEC_URL }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(SEC_URL);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it('skips capture when v is not a known variant', async () => {
    const res = await GET(buildRequest({ url: SEC_URL, v: 'bogus' }));
    expect(res.status).toBe(302);
    expect(mockCapture).not.toHaveBeenCalled();
  });
});

describe('/r/filing GET — PostHog unavailable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('still redirects when PostHog client is null (no env key)', async () => {
    mockGetServerPostHog.mockReturnValue(null);
    const res = await GET(buildRequest({ url: SEC_URL, v: 'ai' }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(SEC_URL);
    expect(mockCapture).not.toHaveBeenCalled();
  });
});
