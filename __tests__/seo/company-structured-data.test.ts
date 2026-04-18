import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * Contract tests for company hub page structured data and metadata.
 *
 * Uses source-inspection rather than rendering because the page is a server
 * component that requires a live DB connection. Rendering tests live in
 * integration test suites.
 */
describe('Company hub page — structured data contract', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const pagePath = path.join(projectRoot, 'app/companies/[ticker]/page.tsx');
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(pagePath, 'utf-8');
  });

  it('emits Corporation JSON-LD (not generic Organization)', () => {
    expect(source).toMatch(/'@type':\s*'Corporation'/);
  });

  it('uses a distinct @id from the global Organization', () => {
    // @id must be unique so Google treats as a separate entity
    expect(source).toMatch(/'@id':\s*`https:\/\/tldrsec\.app\/companies\/\$\{meta\.ticker\}#corp`/);
  });

  it('sets tickerSymbol from the company metadata', () => {
    expect(source).toMatch(/tickerSymbol:\s*meta\.ticker/);
  });

  it('links to SEC EDGAR via sameAs when CIK is present', () => {
    expect(source).toMatch(/sec\.gov\/cgi-bin\/browse-edgar/);
  });

  it('has generateStaticParams that pre-renders known tickers without DB', () => {
    // The static params are driven by the hardcoded COMPANIES map, not the DB,
    // so Vercel can pre-render at build time even without a DB connection.
    expect(source).toMatch(/generateStaticParams/);
    expect(source).toMatch(/Object\.keys\(COMPANIES\)/);
  });

  it('calls notFound() when data lookup returns null', () => {
    // notFound() is the safety net for unknown tickers that slip past generateStaticParams
    // (since we removed dynamicParams=false to keep build working without a DB).
    expect(source).toMatch(/notFound\(\)/);
  });

  it('uses 24h revalidation matching the preview-page pattern', () => {
    expect(source).toMatch(/revalidate\s*=\s*86400/);
  });

  it('emits a BreadcrumbList for breadcrumb rich results', () => {
    expect(source).toMatch(/BreadcrumbList/);
  });

  it('sets canonical URL to /companies/[ticker]', () => {
    expect(source).toMatch(/canonical:\s*`https:\/\/tldrsec\.app\/companies\/\$\{meta\.ticker\}`/);
  });
});

describe('Company directory — metadata contract', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const pagePath = path.join(projectRoot, 'app/companies/page.tsx');
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(pagePath, 'utf-8');
  });

  it('sets canonical URL to /companies', () => {
    expect(source).toMatch(/canonical:\s*['"]https:\/\/tldrsec\.app\/companies['"]/);
  });

  it('emits BreadcrumbList structured data', () => {
    expect(source).toMatch(/BreadcrumbList/);
  });

  it('allows indexing', () => {
    expect(source).toMatch(/index:\s*true/);
  });
});

describe('Company metadata registry', () => {
  it('has all 15 tracked companies', async () => {
    const { COMPANIES, getAllCompanyMeta } = await import('../../lib/seo/company-metadata');
    const entries = Object.values(COMPANIES);
    expect(entries.length).toBe(15);
    expect(getAllCompanyMeta().length).toBe(15);
  });

  it('every company has ticker, name, sector, industry', async () => {
    const { COMPANIES } = await import('../../lib/seo/company-metadata');
    for (const [key, meta] of Object.entries(COMPANIES)) {
      expect(key).toBe(meta.ticker);
      expect(meta.name).toBeTruthy();
      expect(meta.sector).toBeTruthy();
      expect(meta.industry).toBeTruthy();
    }
  });

  it('ticker keys are uppercase and match meta.ticker', async () => {
    const { COMPANIES } = await import('../../lib/seo/company-metadata');
    for (const [key, meta] of Object.entries(COMPANIES)) {
      expect(key).toBe(key.toUpperCase());
      expect(meta.ticker).toBe(key);
    }
  });

  it('getCompanyMeta is case-insensitive on ticker', async () => {
    const { getCompanyMeta } = await import('../../lib/seo/company-metadata');
    expect(getCompanyMeta('nvda')?.ticker).toBe('NVDA');
    expect(getCompanyMeta('NVDA')?.ticker).toBe('NVDA');
    expect(getCompanyMeta('fake-ticker')).toBeNull();
  });
});

describe('Filing type guide registry', () => {
  it('has at least 8 filing types (MVP coverage)', async () => {
    const { FILING_TYPE_GUIDES, getAllFilingTypeGuides } = await import(
      '../../lib/seo/filing-type-content'
    );
    expect(Object.keys(FILING_TYPE_GUIDES).length).toBeGreaterThanOrEqual(8);
    expect(getAllFilingTypeGuides().length).toBeGreaterThanOrEqual(8);
  });

  it('every guide has all required educational fields', async () => {
    const { FILING_TYPE_GUIDES } = await import('../../lib/seo/filing-type-content');
    for (const guide of Object.values(FILING_TYPE_GUIDES)) {
      expect(guide.slug).toBeTruthy();
      expect(guide.dbFormType).toBeTruthy();
      expect(guide.name).toBeTruthy();
      expect(guide.shortDescription.length).toBeGreaterThan(30);
      expect(guide.whatItIs.length).toBeGreaterThan(50);
      expect(guide.whoFilesIt).toBeTruthy();
      expect(guide.whyItMatters).toBeTruthy();
      expect(guide.keyThings.length).toBeGreaterThan(2);
      expect(guide.deadline).toBeTruthy();
      expect(guide.frequency).toBeTruthy();
    }
  });

  it('slugs are URL-safe (lowercase, letters/digits/hyphens)', async () => {
    const { FILING_TYPE_GUIDES } = await import('../../lib/seo/filing-type-content');
    for (const slug of Object.keys(FILING_TYPE_GUIDES)) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });
});
