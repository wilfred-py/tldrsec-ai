import {
  resolveSecPrimaryDocumentUrl,
  __clearPrimaryDocCacheForTesting,
} from '../../lib/email/url-utils';

/**
 * Coverage for `resolveSecPrimaryDocumentUrl()` in lib/email/url-utils.ts.
 *
 * The helper takes an EDGAR filing URL (any of three shapes — `-index.htm`
 * file, directory URL with trailing slash, bare directory URL) and resolves
 * to the primary `.htm` document by fetching `index.json`. The resolved URL
 * is what production filing emails (10-K/10-Q/8-K) and the campaign hero
 * email use for the "Source: SEC EDGAR" link, so a recipient lands inside
 * the actual filing instead of a documents-list page.
 */
describe('resolveSecPrimaryDocumentUrl', () => {
  // Stub `globalThis.fetch` per test so we can deterministically simulate
  // EDGAR responses without hitting the network. Cleared after each test.
  const originalFetch = globalThis.fetch;
  let fetchCalls: { url: string; init?: RequestInit }[] = [];

  function mockFetch(payload: unknown, options: { ok?: boolean; throwError?: Error } = {}) {
    fetchCalls = [];
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init });
      if (options.throwError) return Promise.reject(options.throwError);
      return Promise.resolve({
        ok: options.ok ?? true,
        json: () => Promise.resolve(payload),
      } as Response);
    }) as typeof fetch;
  }

  afterEach(() => {
    globalThis.fetch = originalFetch;
    fetchCalls = [];
    // Module-level cache is keyed by accession-no — clear between tests so
    // earlier resolutions don't short-circuit later ones with the same key.
    __clearPrimaryDocCacheForTesting();
  });

  describe('URL shape parsing', () => {
    it('returns the input URL unchanged when no CIK + 18-digit accession is detectable', async () => {
      const result = await resolveSecPrimaryDocumentUrl(
        'https://www.sec.gov/edgar/searchedgar/companysearch.html',
        '10-Q',
      );
      expect(result).toBe('https://www.sec.gov/edgar/searchedgar/companysearch.html');
    });

    it('returns the input URL when fetch is unavailable in the runtime', async () => {
      const stripped = (globalThis as unknown as { fetch: unknown }).fetch;
      try {
        (globalThis as unknown as { fetch: unknown }).fetch = undefined;
        const result = await resolveSecPrimaryDocumentUrl(
          'https://www.sec.gov/Archives/edgar/data/1326801/000162828026028526/0001628280-26-028526-index.htm',
          '10-Q',
        );
        expect(result).toContain('-index.htm');
      } finally {
        (globalThis as unknown as { fetch: unknown }).fetch = stripped;
      }
    });

    it('parses the standard `-index.htm` URL shape and fetches index.json', async () => {
      mockFetch({
        directory: {
          item: [
            { name: 'meta-20260331.htm', type: '10-Q', size: '12345678' },
            { name: 'exhibit-31.htm', type: 'EX-31', size: '4567' },
          ],
        },
      });
      const result = await resolveSecPrimaryDocumentUrl(
        'https://www.sec.gov/Archives/edgar/data/1326801/000162828026028526/0001628280-26-028526-index.htm',
        '10-Q',
      );
      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0].url).toBe(
        'https://www.sec.gov/Archives/edgar/data/1326801/000162828026028526/index.json',
      );
      expect(result).toBe(
        'https://www.sec.gov/Archives/edgar/data/1326801/000162828026028526/meta-20260331.htm',
      );
    });

    it('parses the directory URL shape with trailing slash', async () => {
      mockFetch({
        directory: {
          item: [{ name: 'tsla-20251231.htm', type: '10-K', size: '99999' }],
        },
      });
      const result = await resolveSecPrimaryDocumentUrl(
        'https://www.sec.gov/Archives/edgar/data/1318605/000162828026003952/',
        '10-K',
      );
      expect(result).toBe(
        'https://www.sec.gov/Archives/edgar/data/1318605/000162828026003952/tsla-20251231.htm',
      );
    });

    it('parses the bare directory URL shape (no trailing slash)', async () => {
      mockFetch({
        directory: {
          item: [{ name: 'nvda-20251026.htm', type: '10-Q', size: '88888' }],
        },
      });
      const result = await resolveSecPrimaryDocumentUrl(
        'https://www.sec.gov/Archives/edgar/data/0001045810/000104581025000230',
        '10-Q',
      );
      expect(result).toBe(
        'https://www.sec.gov/Archives/edgar/data/0001045810/000104581025000230/nvda-20251026.htm',
      );
    });
  });

  describe('Primary document selection', () => {
    it('prefers the .htm file whose `type` exactly matches the form type', async () => {
      mockFetch({
        directory: {
          item: [
            { name: 'small-summary.htm', type: 'EX-99', size: '1000' },
            { name: 'aapl-20250927.htm', type: '10-K', size: '50000' },
            { name: 'huge-exhibit.htm', type: 'EX-21', size: '999999' },
          ],
        },
      });
      const result = await resolveSecPrimaryDocumentUrl(
        'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/0000320193-25-000079-index.htm',
        '10-K',
      );
      // Even though huge-exhibit.htm is the largest, exact form-type match wins.
      expect(result).toContain('aapl-20250927.htm');
    });

    it('falls back to the largest .htm when no item matches the form type', async () => {
      mockFetch({
        directory: {
          item: [
            { name: 'tiny.htm', type: 'EX-99.1', size: '500' },
            { name: 'medium.htm', type: 'EX-99.2', size: '5000' },
            { name: 'biggest.htm', type: 'EX-99.3', size: '50000' },
            { name: 'logo.gif', type: 'GRAPHIC', size: '2048' },
          ],
        },
      });
      const result = await resolveSecPrimaryDocumentUrl(
        'https://www.sec.gov/Archives/edgar/data/12345/000012345025000001/0000123450-25-000001-index.htm',
        '10-Q', // no 10-Q in payload — falls through to largest .htm
      );
      expect(result).toContain('biggest.htm');
    });

    it('skips GRAPHIC-type and -index.htm entries when picking the largest fallback', async () => {
      mockFetch({
        directory: {
          item: [
            { name: 'huge-graphic.htm', type: 'GRAPHIC', size: '999999' },
            { name: '0000123450-25-000001-index.htm', type: '10-Q', size: '888888' },
            { name: 'real-doc.htm', type: 'EX-99', size: '50000' },
          ],
        },
      });
      const result = await resolveSecPrimaryDocumentUrl(
        'https://www.sec.gov/Archives/edgar/data/12345/000012345025000001/0000123450-25-000001-index.htm',
        '8-K', // doesn't match anything; falls through to largest non-graphic, non-index .htm
      );
      expect(result).toContain('real-doc.htm');
    });

    it('returns the input URL when index.json has no `.htm` items at all', async () => {
      const inputUrl =
        'https://www.sec.gov/Archives/edgar/data/12345/000012345025000001/0000123450-25-000001-index.htm';
      mockFetch({
        directory: {
          item: [
            { name: 'data.xml', type: 'XBRL', size: '5000' },
            { name: 'metadata.json', type: 'OTHER', size: '500' },
          ],
        },
      });
      const result = await resolveSecPrimaryDocumentUrl(inputUrl, '10-Q');
      expect(result).toBe(inputUrl);
    });

    it('handles "Form 10-Q" form-type prefix (with the word Form)', async () => {
      mockFetch({
        directory: {
          item: [
            { name: 'matched.htm', type: '10-Q', size: '1000' },
            { name: 'other.htm', type: 'EX-99', size: '5000' },
          ],
        },
      });
      const result = await resolveSecPrimaryDocumentUrl(
        'https://www.sec.gov/Archives/edgar/data/1326801/000162828026028526/0001628280-26-028526-index.htm',
        'Form 10-Q', // prefix should be stripped before matching
      );
      expect(result).toContain('matched.htm');
    });
  });

  describe('XML primary doc fallback (Form 3/4/5/144/13G/13D)', () => {
    // Reality check: EDGAR's index.json returns `type: "text.gif"` for every
    // item in production (verified against live API). Tests below mirror that
    // truth — we cannot rely on the `type` field for matching.

    it('picks form4.xml as primary for a Form 4 filing (real EDGAR shape)', async () => {
      mockFetch({
        directory: {
          item: [
            { name: '0001140361-26-020298-index-headers.html', type: 'text.gif', size: '' },
            { name: '0001140361-26-020298-index.html', type: 'text.gif', size: '' },
            { name: '0001140361-26-020298.txt', type: 'text.gif', size: '' },
            { name: 'form4.xml', type: 'text.gif', size: '7230' },
          ],
        },
      });
      const result = await resolveSecPrimaryDocumentUrl(
        'https://www.sec.gov/Archives/edgar/data/320193/000114036126020298/0001140361-26-020298-index.htm',
        '4',
      );
      expect(result).toBe(
        'https://www.sec.gov/Archives/edgar/data/320193/000114036126020298/form4.xml',
      );
    });

    it('picks the largest non-metadata .xml when multiple xml files exist (Form 4 with WF-prefix)', async () => {
      mockFetch({
        directory: {
          item: [
            { name: 'wf-form4_172505.xml', type: 'text.gif', size: '8765' },
            { name: 'primary_doc.xsd', type: 'text.gif', size: '500' },
          ],
        },
      });
      const result = await resolveSecPrimaryDocumentUrl(
        'https://www.sec.gov/Archives/edgar/data/320193/000114036126020298/0001140361-26-020298-index.htm',
        '4',
      );
      expect(result).toContain('wf-form4_172505.xml');
    });

    it('resolves primary_doc.xml for Form 144', async () => {
      mockFetch({
        directory: {
          item: [{ name: 'primary_doc.xml', type: 'text.gif', size: '1234' }],
        },
      });
      const result = await resolveSecPrimaryDocumentUrl(
        'https://www.sec.gov/Archives/edgar/data/320193/000114036126099999/0001140361-26-099999-index.htm',
        '144',
      );
      expect(result).toContain('primary_doc.xml');
    });

    it('does NOT fall back to XML for HTM-primary forms (10-Q) — leaves input unchanged', async () => {
      // 10-K/10-Q don't have a stylesheet directory in getXsltStylesheetDir,
      // so the XML fallback is gated off — we never accidentally pick up an
      // XBRL R-file, FilingSummary.xml, or linkbase as the primary doc.
      const inputUrl =
        'https://www.sec.gov/Archives/edgar/data/12345/000012345025000001/0000123450-25-000001-index.htm';
      mockFetch({
        directory: {
          item: [
            { name: 'data.xml', type: 'text.gif', size: '5000' },
            { name: 'FilingSummary.xml', type: 'text.gif', size: '1000' },
            { name: 'R1.xml', type: 'text.gif', size: '500' },
          ],
        },
      });
      const result = await resolveSecPrimaryDocumentUrl(inputUrl, '10-Q');
      expect(result).toBe(inputUrl);
    });

    it('skips XBRL linkbase and summary files even for XML-primary forms', async () => {
      // For Form 4 with junk XBRL fragments mixed in (theoretical edge case),
      // the resolver should still pick form4.xml over the linkbases.
      mockFetch({
        directory: {
          item: [
            { name: 'aapl_lab.xml', type: 'text.gif', size: '999999' },
            { name: 'aapl_pre.xml', type: 'text.gif', size: '888888' },
            { name: 'FilingSummary.xml', type: 'text.gif', size: '777777' },
            { name: 'R1.xml', type: 'text.gif', size: '666666' },
            { name: 'form4.xml', type: 'text.gif', size: '5000' },
          ],
        },
      });
      const result = await resolveSecPrimaryDocumentUrl(
        'https://www.sec.gov/Archives/edgar/data/320193/000114036126020298/0001140361-26-020298-index.htm',
        '4',
      );
      expect(result).toContain('form4.xml');
    });
  });

  describe('Failure paths — never break the email link', () => {
    it('returns the input URL when fetch throws (network error)', async () => {
      const inputUrl =
        'https://www.sec.gov/Archives/edgar/data/12345/000012345025000001/0000123450-25-000001-index.htm';
      mockFetch(null, { throwError: new Error('network unreachable') });
      const result = await resolveSecPrimaryDocumentUrl(inputUrl, '10-Q');
      expect(result).toBe(inputUrl);
    });

    it('returns the input URL when EDGAR responds with a non-OK status', async () => {
      const inputUrl =
        'https://www.sec.gov/Archives/edgar/data/12345/000012345025000001/0000123450-25-000001-index.htm';
      mockFetch(null, { ok: false });
      const result = await resolveSecPrimaryDocumentUrl(inputUrl, '10-Q');
      expect(result).toBe(inputUrl);
    });

    it('returns the input URL when the JSON shape is unexpected (no directory.item)', async () => {
      const inputUrl =
        'https://www.sec.gov/Archives/edgar/data/12345/000012345025000001/0000123450-25-000001-index.htm';
      mockFetch({ unexpected: 'shape' });
      const result = await resolveSecPrimaryDocumentUrl(inputUrl, '10-Q');
      expect(result).toBe(inputUrl);
    });
  });

  describe('Caching', () => {
    it('does not re-fetch index.json for the same accession on a second call', async () => {
      const url =
        'https://www.sec.gov/Archives/edgar/data/1326801/000162828026028526/0001628280-26-028526-index.htm';
      mockFetch({
        directory: {
          item: [{ name: 'meta-20260331.htm', type: '10-Q', size: '99999' }],
        },
      });
      const first = await resolveSecPrimaryDocumentUrl(url, '10-Q');
      const second = await resolveSecPrimaryDocumentUrl(url, '10-Q');
      expect(first).toBe(second);
      // Cache hits short-circuit the fetch — only one network call total.
      expect(fetchCalls).toHaveLength(1);
    });
  });

  describe('User-Agent header', () => {
    it('sends a contact User-Agent on the EDGAR request (SEC requires this)', async () => {
      mockFetch({
        directory: {
          item: [{ name: 'doc.htm', type: '10-Q', size: '1000' }],
        },
      });
      await resolveSecPrimaryDocumentUrl(
        'https://www.sec.gov/Archives/edgar/data/99999/000099999026000001/0000999990-26-000001-index.htm',
        '10-Q',
      );
      const headers = (fetchCalls[0].init?.headers ?? {}) as Record<string, string>;
      expect(headers['User-Agent']).toMatch(/tldrsec\.app/);
    });
  });

  describe('fetchImpl injection', () => {
    it('uses the supplied fetch implementation when provided in options', async () => {
      const calls: string[] = [];
      const customFetch = (url: string) => {
        calls.push(url);
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            directory: {
              item: [{ name: 'custom-doc.htm', type: '10-Q', size: '5000' }],
            },
          }),
        } as Response);
      };
      const result = await resolveSecPrimaryDocumentUrl(
        'https://www.sec.gov/Archives/edgar/data/77777/000077777026000001/0000777770-26-000001-index.htm',
        '10-Q',
        { fetchImpl: customFetch as typeof fetch },
      );
      expect(calls).toHaveLength(1);
      expect(result).toContain('custom-doc.htm');
    });
  });
});
