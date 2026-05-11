/**
 * Email URL utilities for SEC filing links
 *
 * Design principle: Always link directly to the actual document when available.
 * The SEC renders Form 4/3/144 XML files with stylesheets (xslF345X05), providing
 * a clean, readable view. Users get a better experience seeing the actual filing
 * rather than an index page.
 *
 * For XML files without stylesheets in the URL path, we construct the proper
 * XSLT stylesheet viewer URL to ensure users see formatted content.
 */

/**
 * Converts an 18-digit accession number (without dashes) to the standard format with dashes.
 *
 * Format: XXXXXXXXXX-YY-ZZZZZZ
 * - First 10 digits: Filer ID
 * - Next 2 digits: Year
 * - Last 6 digits: Sequence number
 *
 * @example
 * formatAccessionNumber('000167978825000249') // Returns '0001679788-25-000249'
 */
function formatAccessionNumber(accessionNoDashes: string): string {
  // Accession numbers are 18 digits: 10 + 2 + 6
  if (accessionNoDashes.length !== 18) {
    return accessionNoDashes;
  }

  const filerId = accessionNoDashes.slice(0, 10);
  const year = accessionNoDashes.slice(10, 12);
  const sequence = accessionNoDashes.slice(12, 18);

  return `${filerId}-${year}-${sequence}`;
}

/**
 * Check if XML file already has an XSLT stylesheet path in the URL
 * Examples:
 * - /xslF345X05/form4.xml (Form 4 with stylesheet)
 * - /xsl144X01/primary_doc.xml (Form 144 with stylesheet)
 */
function hasXsltStylesheet(url: string): boolean {
  return /\/xsl[A-Z0-9]+\//i.test(url);
}

/**
 * Get the appropriate XSLT stylesheet directory for a form type
 * - Form 3/4/5 (ownership forms): xslF345X05
 * - Form 144: xsl144X01
 * - Schedule 13G: xslSCHEDULE_13G_X01
 * - Schedule 13D: xslSCHEDULE_13D_X01
 *
 * @returns The stylesheet directory name, or null if unknown form type
 */
function getXsltStylesheetDir(formType?: string): string | null {
  if (!formType) return null;

  const upperType = formType.toUpperCase().replace(/\s+/g, '');

  // Form 3, 4, 5 (ownership forms)
  if (['3', '4', '5', 'FORM3', 'FORM4', 'FORM5'].includes(upperType)) {
    return 'xslF345X05';
  }

  // Form 144
  if (['144', 'FORM144'].includes(upperType)) {
    return 'xsl144X01';
  }

  // Schedule 13G (including amendments and variations)
  if (upperType.includes('13G') || upperType === 'SCHEDULE' || upperType === 'SC13G') {
    return 'xslSCHEDULE_13G_X01';
  }

  // Schedule 13D (including amendments)
  if (upperType.includes('13D') || upperType === 'SC13D') {
    return 'xslSCHEDULE_13D_X01';
  }

  return null; // Unknown form type - will fallback to index
}

/**
 * Check if a form type is a Schedule 13G or 13D type
 */
function isSchedule13Type(formType?: string): boolean {
  if (!formType) return false;
  const upperType = formType.toUpperCase();
  return upperType.includes('13G') || upperType.includes('13D') ||
         upperType === 'SCHEDULE' || upperType.includes('SC 13') || upperType.includes('SC13');
}

/**
 * Resolve a `-index.htm` filing URL to the actual primary document URL by
 * fetching EDGAR's `index.json` for that filing. The index page lists every
 * document in the submission (the filing itself, exhibits, graphics, XBRL
 * fragments) — this picks the primary HTM matching the form type so the
 * email link drops the reader straight into the filing they care about
 * rather than a documents catalog.
 *
 * Returns the resolved document URL on success. Returns the original input
 * URL on any failure (network, parse, no matching doc) — caller never gets
 * a broken link, just falls back to the original `-index.htm`.
 *
 * Caches by accession-no so a per-cohort send doesn't slam EDGAR.
 */
const PRIMARY_DOC_CACHE = new Map<string, string>();

/**
 * @internal — test helper. Production code never needs to clear the cache;
 * accession numbers are immutable so a hit is always correct. Exported only
 * so unit tests for the resolver can run with a clean slate per test.
 */
export function __clearPrimaryDocCacheForTesting(): void {
  PRIMARY_DOC_CACHE.clear();
}

interface EdgarIndexItem {
  name: string;
  type: string;
  size: string;
}
interface EdgarIndexJson {
  directory?: {
    item?: EdgarIndexItem[];
  };
}

export async function resolveSecPrimaryDocumentUrl(
  filingUrl: string,
  formType: string | undefined,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<string> {
  // Accept three URL shapes that all encode the same filing directory:
  //   1. /Archives/edgar/data/{CIK}/{ACC18}/{ACC-DASHED}-index.htm[l]
  //   2. /Archives/edgar/data/{CIK}/{ACC18}/        (directory URL with slash)
  //   3. /Archives/edgar/data/{CIK}/{ACC18}         (directory URL no slash)
  // Production stores all three shapes in `Summary.filingUrl` depending on
  // ingestion path. We extract the directory base + accession from any of
  // them, then fetch index.json from there.
  const m = filingUrl.match(
    /^(https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/(\d{18}))(?:\/[^/]*)?\/?$/i,
  );
  if (!m) return filingUrl;
  const [, basePath, accession] = m;
  const cacheKey = accession;
  const cached = PRIMARY_DOC_CACHE.get(cacheKey);
  if (cached) return cached;

  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchFn !== 'function') return filingUrl;

  try {
    const indexJsonUrl = `${basePath}/index.json`;
    const res = await fetchFn(indexJsonUrl, {
      headers: { 'User-Agent': 'tldrsec.app campaign@tldrsec.app' },
    });
    if (!res.ok) return filingUrl;
    const data = (await res.json()) as EdgarIndexJson;
    const items = data?.directory?.item ?? [];
    const wanted = (formType || '').toUpperCase().replace(/^FORM\s+/, '').trim();

    // 1. Exact form-type match on a .htm document (e.g. type "10-Q")
    let primary = items.find(
      (i) => i.type?.toUpperCase() === wanted && /\.htm$/i.test(i.name),
    );
    // 2. Largest .htm in the filing — almost always the primary doc
    if (!primary) {
      const htmItems = items.filter(
        (i) =>
          /\.htm$/i.test(i.name) &&
          !/-index\.html?$/i.test(i.name) &&
          i.type !== 'GRAPHIC',
      );
      htmItems.sort((a, b) => Number(b.size || 0) - Number(a.size || 0));
      primary = htmItems[0];
    }
    if (!primary?.name) return filingUrl;
    const resolved = `${basePath}/${primary.name}`;
    PRIMARY_DOC_CACHE.set(cacheKey, resolved);
    return resolved;
  } catch {
    return filingUrl;
  }
}

/**
 * UTM variants for click-through attribution on the "Why it matters" rollout.
 * - `ai`: AI-generated whyItMatters rendered
 * - `fallback`: hardcoded fallback copy rendered
 * - `note`: LOW/10b5-1 routine "Note:" label
 * - `neutral`: NEUTRAL descriptive "What happened:" label
 */
export type WhyItMattersUtmVariant = 'ai' | 'fallback' | 'note' | 'neutral';

interface UrlOptions {
  variant?: WhyItMattersUtmVariant;
  filingId?: string;
}

const EDGAR_SEARCH_FALLBACK = 'https://www.sec.gov/edgar/searchedgar/companysearch.html';
const DEFAULT_APP_URL = 'https://tldrsec.app';

/**
 * Pulls the 18-digit accession number out of a SEC Archives URL. Returns
 * `undefined` for URLs that don't match the `.../data/{CIK}/{ACCESSION}/...`
 * pattern (e.g. EDGAR search pages).
 */
function extractAccessionFromUrl(url: string): string | undefined {
  const match = url.match(/\/Archives\/edgar\/data\/\d+\/(\d{18})(?:[\/?#]|$)/);
  return match?.[1];
}

/**
 * When a `variant` is present, wrap the SEC URL in our `/r/filing` redirect
 * so PostHog can capture an `email_cta_clicked` event server-side. sec.gov
 * doesn't run our snippet — a redirect on our own domain is the only place
 * we can observe the click.
 *
 * The `filing_id` query param (`f`) is used as PostHog distinctId for cohort
 * attribution. When no explicit `filingId` is provided, fall back to the
 * accession number parsed out of the SEC URL — otherwise every click would
 * get a random anon id and lose cohort correlation across variants.
 *
 * Without a variant, the URL passes through unchanged (backward compat).
 */
function wrapWithRedirect(
  url: string,
  variant: WhyItMattersUtmVariant | undefined,
  filingId: string | undefined,
  formType: string | undefined,
): string {
  if (!variant) return url;
  // Don't wrap the EDGAR search fallback — it's not a filing link.
  if (url === EDGAR_SEARCH_FALLBACK) return url;
  const base = process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL;
  const params = new URLSearchParams();
  params.set('url', url);
  params.set('v', variant);
  const resolvedFilingId = filingId ?? extractAccessionFromUrl(url);
  if (resolvedFilingId) params.set('f', resolvedFilingId);
  if (formType) params.set('ft', formType);
  return `${base}/r/filing?${params.toString()}`;
}

/**
 * Validates and normalizes an SEC filing URL for use in email links.
 *
 * Design: Link directly to the actual document whenever possible.
 * - XML files with xslF345X05 stylesheet (Form 4, 3, 144) render beautifully on SEC.gov
 * - XML files WITHOUT stylesheet get the stylesheet path injected based on form type
 * - HTML/HTM files are human-readable
 * - Directory URLs get converted to index page as fallback
 *
 * @param filingUrl - The SEC filing URL (directory URL, document URL, or -index.htm URL)
 * @param formType - Optional form type (e.g., "Form 4", "Form 144") for smart XML handling
 * @param options - Optional `{ variant, filingId }`. When `variant` is set, the URL is wrapped
 *                  in `/r/filing?...` so PostHog can capture the click server-side before 302ing
 *                  to SEC. No-options / no-variant path returns the resolved SEC URL unchanged.
 * @returns A valid URL for email display, or the EDGAR search page for empty URLs
 */
export function getSecFilingViewerUrl(
  filingUrl: string,
  formType?: string,
  options?: UrlOptions,
): string {
  const resolved = resolveSecFilingUrl(filingUrl, formType);
  return wrapWithRedirect(resolved, options?.variant, options?.filingId, formType);
}

function resolveSecFilingUrl(filingUrl: string, formType?: string): string {
  // Handle empty or invalid URLs - redirect to EDGAR company search
  if (!filingUrl || filingUrl.trim() === '') {
    return EDGAR_SEARCH_FALLBACK;
  }

  // For Schedule 13G/13D filings with -index.htm URLs, construct the actual document URL
  // SEC stores these as XML files rendered with XSLT stylesheets
  if (filingUrl.includes('-index.htm') && isSchedule13Type(formType)) {
    // Pattern: https://www.sec.gov/Archives/edgar/data/{CIK}/{ACCESSION}/{accession}-index.htm
    const indexPattern = /^(https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d+\/)/;
    const match = filingUrl.match(indexPattern);
    if (match) {
      const basePath = match[1];
      const stylesheetDir = getXsltStylesheetDir(formType);
      if (stylesheetDir) {
        // Construct URL to the XSLT-rendered primary document
        return `${basePath}${stylesheetDir}/primary_doc.xml`;
      }
    }
  }

  // If already an index URL (non-Schedule 13 types), return as-is. The
  // caller is responsible for upgrading this to the primary document URL
  // when needed (see `resolveSecPrimaryDocumentUrl` in this file — fetches
  // EDGAR's index.json to find the actual filing document).
  if (filingUrl.includes('-index.htm')) {
    return filingUrl;
  }

  // XML files with XSLT stylesheet already - pass through
  if (filingUrl.match(/\.xml$/i) && hasXsltStylesheet(filingUrl)) {
    return filingUrl;
  }

  // XML files WITHOUT stylesheet - construct proper viewer URL based on form type
  if (filingUrl.match(/\.xml$/i)) {
    const stylesheetDir = getXsltStylesheetDir(formType);

    if (stylesheetDir) {
      // Pattern: .../data/{CIK}/{ACCESSION}/{filename}.xml
      const xmlPattern = /^(https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d+\/)([^/]+\.xml)$/i;
      const xmlMatch = filingUrl.match(xmlPattern);

      if (xmlMatch) {
        const [, basePath, filename] = xmlMatch;
        // Construct: .../data/{CIK}/{ACCESSION}/{stylesheetDir}/{filename}.xml
        return `${basePath}${stylesheetDir}/${filename}`;
      }
    }

    // Fallback: convert to index page for unknown form types or non-matching patterns
    const xmlIndexPattern = /\/Archives\/edgar\/data\/(\d+)\/(\d{18})\/[^/]+\.xml$/i;
    const indexMatch = filingUrl.match(xmlIndexPattern);
    if (indexMatch) {
      const [, cik, accessionNoDashes] = indexMatch;
      const accessionWithDashes = formatAccessionNumber(accessionNoDashes);
      return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}/${accessionWithDashes}-index.html`;
    }
  }

  // HTML/HTM files - pass through for direct viewing
  if (filingUrl.match(/\.(html?|htm)$/i)) {
    return filingUrl;
  }

  // Check if this is a directory URL pattern (no file extension):
  // https://www.sec.gov/Archives/edgar/data/{CIK}/{ACCESSION_NO_DASHES}
  const directoryPattern = /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/(\d+)\/(\d{18})\/?$/;
  const match = filingUrl.match(directoryPattern);

  if (match) {
    // Convert directory URL to index page as fallback
    const [, cik, accessionNoDashes] = match;
    const accessionWithDashes = formatAccessionNumber(accessionNoDashes);
    return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNoDashes}/${accessionWithDashes}-index.html`;
  }

  // Return as-is for any other URL format
  return filingUrl;
}

// ─── Campaign URL builder ──────────────────────────────────────────────────

/**
 * Default campaign id. Newsletter broadcast 2026-05.
 * If we run a second campaign, callers pass `campaignId` explicitly.
 */
const DEFAULT_CAMPAIGN_ID = 'launch-2026-05';

interface BuildCampaignUrlOptions {
  /** Supabase newsletter_subscribers.id (UUID). Stitched into PostHog as distinct_id `sub_<uuid>`. */
  subscriberId: string;
  /** Email position in the sequence: e1 | e2 | e3. Becomes utm_content. */
  emailId: 'e1' | 'e2' | 'e3';
  /** Path on tldrsec.app. Defaults to `/` (the landing page). */
  path?: string;
  /** Extra query params (e.g. `plan=pro` for sign-up CTAs). */
  extraParams?: Record<string, string>;
  /** Campaign id (defaults to current campaign). */
  campaignId?: string;
  /** Override the base URL — primarily for tests. */
  baseUrl?: string;
}

/**
 * Build a campaign-tagged URL for inclusion in newsletter campaign emails.
 *
 * Every link in a campaign email goes through this builder so the landing page
 * can identify the subscriber via `?sub=<id>` and PostHog gets standard UTM
 * parameters for funnel filtering.
 *
 * Resulting shape:
 *   https://tldrsec.app/{path}?sub=<uuid>
 *     &utm_source=email
 *     &utm_medium=newsletter
 *     &utm_campaign=launch-2026-05
 *     &utm_content=e1
 *     [&plan=pro&...]
 *
 * @example
 * buildCampaignUrl({ subscriberId: '550e8400-...', emailId: 'e1' })
 *   // → https://tldrsec.app/?sub=550e8400-...&utm_source=email&utm_medium=newsletter
 *   //     &utm_campaign=launch-2026-05&utm_content=e1
 *
 * buildCampaignUrl({ subscriberId, emailId: 'e3', path: '/sign-up', extraParams: { plan: 'pro' } })
 *   // → https://tldrsec.app/sign-up?sub=...&utm_source=...&plan=pro
 */
export function buildCampaignUrl(options: BuildCampaignUrlOptions): string {
  const {
    subscriberId,
    emailId,
    path = '/',
    extraParams,
    campaignId = DEFAULT_CAMPAIGN_ID,
    baseUrl,
  } = options;

  const base = baseUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? DEFAULT_APP_URL;
  // Strip trailing slash from base so we don't get `//path`.
  const normalizedBase = base.replace(/\/+$/, '');
  // Ensure path starts with '/'
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  const params = new URLSearchParams();
  params.set('sub', subscriberId);
  params.set('utm_source', 'email');
  params.set('utm_medium', 'newsletter');
  params.set('utm_campaign', campaignId);
  params.set('utm_content', emailId);
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, v);
    }
  }

  return `${normalizedBase}${normalizedPath}?${params.toString()}`;
}
