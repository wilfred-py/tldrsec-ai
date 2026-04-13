import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('SEO Metadata Validation', () => {
  const projectRoot = path.resolve(__dirname, '../..');

  describe('Sitemap', () => {
    it('should not contain ghost routes that return 404', async () => {
      const sitemap = await import('../../app/sitemap');
      const routes = await sitemap.default();
      const urls = routes.map((r: { url: string }) => r.url);

      // These routes returned 404 and should NOT be in the sitemap
      const ghostRoutes = ['/pricing', '/about'];
      for (const ghost of ghostRoutes) {
        expect(urls).not.toContain(`https://tldrsec.app${ghost}`);
      }
    });

    it('should not include auth-gated routes', async () => {
      const sitemap = await import('../../app/sitemap');
      const routes = await sitemap.default();
      const urls = routes.map((r: { url: string }) => r.url);

      expect(urls).not.toContain('https://tldrsec.app/dashboard');
      for (const url of urls) {
        expect(url).not.toContain('/dashboard');
        // /summary/ is auth-gated; /s/ is the public preview route
        if (!url.includes('/s/')) {
          expect(url).not.toContain('/summary/');
        }
        expect(url).not.toContain('/filing/');
      }
    });

    it('should include all public routes', async () => {
      const sitemap = await import('../../app/sitemap');
      const routes = await sitemap.default();
      const urls = routes.map((r: { url: string }) => r.url);

      expect(urls).toContain('https://tldrsec.app');
      expect(urls).toContain('https://tldrsec.app/privacy');
      expect(urls).toContain('https://tldrsec.app/terms');
    });

    it('should use fixed lastModified dates for static routes', async () => {
      const sitemap = await import('../../app/sitemap');
      const routes = await sitemap.default();

      // Static routes should have string dates, not dynamic Date objects
      const staticRoutes = routes.filter(
        (r: { url: string }) => !r.url.includes('/s/')
      );
      for (const route of staticRoutes) {
        // lastModified should be a fixed string like '2026-04-05', not a Date instance
        expect(route.lastModified).not.toBeInstanceOf(Date);
      }
    });
  });

  describe('robots.txt', () => {
    it('should block all dashboard routes', async () => {
      const robots = await import('../../app/robots');
      const config = robots.default();
      const disallowed = Array.isArray(config.rules)
        ? config.rules.flatMap((r: { disallow?: string | string[] }) =>
            Array.isArray(r.disallow) ? r.disallow : [r.disallow]
          )
        : Array.isArray(config.rules.disallow)
          ? config.rules.disallow
          : [config.rules.disallow];

      expect(disallowed).toContain('/dashboard/');
    });

    it('should block auth-gated content routes', async () => {
      const robots = await import('../../app/robots');
      const config = robots.default();
      const disallowed = Array.isArray(config.rules)
        ? config.rules.flatMap((r: { disallow?: string | string[] }) =>
            Array.isArray(r.disallow) ? r.disallow : [r.disallow]
          )
        : Array.isArray(config.rules.disallow)
          ? config.rules.disallow
          : [config.rules.disallow];

      expect(disallowed).toContain('/summary/');
      expect(disallowed).toContain('/filing/');
    });

    it('should reference the correct sitemap URL', async () => {
      const robots = await import('../../app/robots');
      const config = robots.default();

      expect(config.sitemap).toBe('https://tldrsec.app/sitemap.xml');
    });

    it('should NOT block the public preview route /s/', async () => {
      const robots = await import('../../app/robots');
      const config = robots.default();
      const disallowed = Array.isArray(config.rules)
        ? config.rules.flatMap((r: { disallow?: string | string[] }) =>
            Array.isArray(r.disallow) ? r.disallow : [r.disallow]
          )
        : Array.isArray(config.rules.disallow)
          ? config.rules.disallow
          : [config.rules.disallow];

      expect(disallowed).not.toContain('/s/');
    });
  });

  describe('Structured Data (JSON-LD)', () => {
    it('should use tldrsec.app domain, not tldrsec.ai', () => {
      const filePath = path.join(projectRoot, 'components/structured-data.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).not.toContain('tldrsec.ai');
      expect(content).toContain('tldrsec.app');
    });

    it('should not reference non-existent search endpoint', () => {
      const filePath = path.join(projectRoot, 'components/structured-data.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).not.toContain('SearchAction');
      expect(content).not.toContain('search?q=');
    });

    it('should include Organization schema in @graph', () => {
      const filePath = path.join(projectRoot, 'components/structured-data.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('@graph');
      expect(content).toContain('Organization');
    });

    it('should include SoftwareApplication schema', () => {
      const filePath = path.join(projectRoot, 'components/structured-data.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('SoftwareApplication');
      expect(content).toContain('FinanceApplication');
    });
  });

  describe('OG Image', () => {
    it('should have a dynamic opengraph-image route', () => {
      const ogPath = path.join(projectRoot, 'app/opengraph-image.tsx');
      expect(fs.existsSync(ogPath)).toBe(true);
    });
  });

  describe('Homepage', () => {
    it('should use static rendering (all auth is client-side via Clerk hooks)', () => {
      const filePath = path.join(projectRoot, 'app/page.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      // Landing page should NOT use force-dynamic — all auth/subscription
      // logic is client-side (useUser, SWR), so static generation is safe
      expect(content).not.toContain('force-dynamic');
    });

    it('should include high-intent SEC filing keywords', () => {
      const filePath = path.join(projectRoot, 'app/page.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('10-K');
      expect(content).toContain('10-Q');
      expect(content).toContain('8-K');
      expect(content).toContain('Form 4');
    });
  });

  describe('Title Template', () => {
    it('should use title template in root layout', () => {
      const filePath = path.join(projectRoot, 'app/layout.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('template:');
      expect(content).toContain('%s | tldrSEC');
    });

    it('should not have manual brand suffixes in child page titles', () => {
      const pages = [
        'app/privacy/page.tsx',
        'app/terms/page.tsx',
      ];

      for (const page of pages) {
        const filePath = path.join(projectRoot, page);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Title should NOT contain manual " | tldrsec" suffix
        // The template handles this automatically
        expect(content).not.toMatch(/title:.*\| tldrsec/i);
      }
    });
  });

  describe('Subscribe Page', () => {
    it('should have metadata via layout', () => {
      const filePath = path.join(projectRoot, 'app/subscribe/layout.tsx');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('Pricing');
      expect(content).toContain('canonical');
      expect(content).toContain('tldrsec.app/subscribe');
    });
  });

  describe('Noindex Pages', () => {
    it('should have noindex on unsubscribe layout', () => {
      const filePath = path.join(projectRoot, 'app/unsubscribe/layout.tsx');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('index: false');
    });

    it('should have noindex on feedback pages', () => {
      const pages = [
        'app/feedback/thanks/page.tsx',
        'app/feedback/error/page.tsx',
      ];

      for (const page of pages) {
        const filePath = path.join(projectRoot, page);
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('index: false');
      }
    });
  });

  describe('Public Preview Route', () => {
    it('should have the preview page route file', () => {
      const filePath = path.join(
        projectRoot,
        'app/s/[ticker]/[filingType]/[accession]/page.tsx'
      );
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should use generateMetadata for dynamic SEO', () => {
      const filePath = path.join(
        projectRoot,
        'app/s/[ticker]/[filingType]/[accession]/page.tsx'
      );
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('generateMetadata');
      expect(content).toContain('canonical');
      expect(content).toContain('article');
    });

    it('should validate URL params against actual data', () => {
      const filePath = path.join(
        projectRoot,
        'app/s/[ticker]/[filingType]/[accession]/page.tsx'
      );
      const content = fs.readFileSync(filePath, 'utf-8');

      // Should check that ticker and filingType params match the data
      expect(content).toContain('notFound');
      expect(content).toContain('toUpperCase');
    });

    it('should have 24h revalidation for immutable content', () => {
      const filePath = path.join(
        projectRoot,
        'app/s/[ticker]/[filingType]/[accession]/page.tsx'
      );
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('revalidate');
      expect(content).toContain('86400');
    });
  });

  describe('Preview Data Layer', () => {
    it('should have the summary-preview module', () => {
      const filePath = path.join(projectRoot, 'lib/seo/summary-preview.ts');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should filter for completed summaries only', () => {
      const filePath = path.join(projectRoot, 'lib/seo/summary-preview.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain("processingStatus: 'completed'");
      expect(content).toContain("summaryText: { not: '' }");
    });

    it('should cap sitemap entries', () => {
      const filePath = path.join(projectRoot, 'lib/seo/summary-preview.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      // Should have a limit parameter with default
      expect(content).toContain('limit = 500');
    });

    it('should deduplicate by accession number', () => {
      const filePath = path.join(projectRoot, 'lib/seo/summary-preview.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain("distinct: ['accessionNumber']");
    });
  });
});
