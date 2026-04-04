import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

describe('SEO Metadata Validation', () => {
  const projectRoot = path.resolve(__dirname, '../..');

  describe('Sitemap', () => {
    it('should not contain ghost routes that return 404', async () => {
      const sitemap = await import('../../app/sitemap');
      const routes = sitemap.default();
      const urls = routes.map((r: { url: string }) => r.url);

      // These routes returned 404 and should NOT be in the sitemap
      const ghostRoutes = ['/pricing', '/about'];
      for (const ghost of ghostRoutes) {
        expect(urls).not.toContain(`https://tldrsec.app${ghost}`);
      }
    });

    it('should not include auth-gated routes', async () => {
      const sitemap = await import('../../app/sitemap');
      const routes = sitemap.default();
      const urls = routes.map((r: { url: string }) => r.url);

      expect(urls).not.toContain('https://tldrsec.app/dashboard');
      for (const url of urls) {
        expect(url).not.toContain('/dashboard');
        expect(url).not.toContain('/summary/');
        expect(url).not.toContain('/filing/');
      }
    });

    it('should include all public routes', async () => {
      const sitemap = await import('../../app/sitemap');
      const routes = sitemap.default();
      const urls = routes.map((r: { url: string }) => r.url);

      expect(urls).toContain('https://tldrsec.app');
      expect(urls).toContain('https://tldrsec.app/privacy');
      expect(urls).toContain('https://tldrsec.app/terms');
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
  });

  describe('OG Image', () => {
    it('should have a dynamic opengraph-image route', () => {
      const ogPath = path.join(projectRoot, 'app/opengraph-image.tsx');
      expect(fs.existsSync(ogPath)).toBe(true);
    });
  });

  describe('Homepage', () => {
    it('should use force-dynamic rendering (required for Clerk auth)', () => {
      const filePath = path.join(projectRoot, 'app/page.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      // force-dynamic is required because LandingPageV2 uses Clerk's useUser
      // via AuthProvider. Without it, Next.js static pre-rendering crashes.
      expect(content).toContain("force-dynamic");
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
});
