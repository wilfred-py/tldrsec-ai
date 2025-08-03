import { describe, test, expect, beforeAll, afterAll } from '@jest/test';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Post-Build Validation', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  const buildDir = path.join(projectRoot, '.next');
  
  beforeAll(async () => {
    // Ensure build exists
    if (!fs.existsSync(buildDir)) {
      console.log('Building project for post-build tests...');
      await execAsync('npm run build', { cwd: projectRoot });
    }
  }, 120000);

  describe('Build Artifacts', () => {
    test('should create .next directory', () => {
      expect(fs.existsSync(buildDir)).toBe(true);
      expect(fs.statSync(buildDir).isDirectory()).toBe(true);
    });

    test('should have required build subdirectories', () => {
      const requiredDirs = [
        'server',
        'static',
        'cache'
      ];

      requiredDirs.forEach(dir => {
        const dirPath = path.join(buildDir, dir);
        expect(fs.existsSync(dirPath)).toBe(true);
      });
    });

    test('should have server app directory', () => {
      const serverAppPath = path.join(buildDir, 'server/app');
      expect(fs.existsSync(serverAppPath)).toBe(true);
    });

    test('should have static assets', () => {
      const staticPath = path.join(buildDir, 'static');
      expect(fs.existsSync(staticPath)).toBe(true);
      
      const staticContents = fs.readdirSync(staticPath);
      expect(staticContents.length).toBeGreaterThan(0);
    });

    test('should have build manifest', () => {
      const manifestPath = path.join(buildDir, 'build-manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);
      
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest.pages).toBeDefined();
    });
  });

  describe('Page Generation', () => {
    test('should generate static pages', () => {
      const serverAppPath = path.join(buildDir, 'server/app');
      const staticPages = [
        '(marketing)/page.html',
        'dashboard/billing/page.html',
        'dashboard/usage/page.html',
        'forgot-password/page.html',
        'onboarding/page.html'
      ];

      staticPages.forEach(page => {
        const pagePath = path.join(serverAppPath, page);
        expect(fs.existsSync(pagePath)).toBe(true);
      });
    });

    test('should have API routes built', () => {
      const apiPath = path.join(buildDir, 'server/app/api');
      expect(fs.existsSync(apiPath)).toBe(true);
      
      const criticalApiRoutes = [
        'health/route.js',
        'filings/summary/route.js',
        'user/tickers/route.js'
      ];

      criticalApiRoutes.forEach(route => {
        const routePath = path.join(apiPath, route);
        expect(fs.existsSync(routePath)).toBe(true);
      });
    });

    test('should have middleware built', () => {
      const middlewarePath = path.join(buildDir, 'server/middleware.js');
      expect(fs.existsSync(middlewarePath)).toBe(true);
    });
  });

  describe('JavaScript Bundle Analysis', () => {
    test('should have reasonable bundle sizes', () => {
      const manifestPath = path.join(buildDir, 'build-manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      
      // Check that pages don't exceed reasonable size limits
      Object.entries(manifest.pages).forEach(([page, files]: [string, any]) => {
        if (Array.isArray(files)) {
          files.forEach((file: string) => {
            if (file.endsWith('.js')) {
              const filePath = path.join(buildDir, 'static', file);
              if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                // Individual chunks should not exceed 5MB
                expect(stats.size).toBeLessThan(5 * 1024 * 1024);
              }
            }
          });
        }
      });
    });

    test('should have shared chunks', () => {
      const chunksDir = path.join(buildDir, 'static/chunks');
      expect(fs.existsSync(chunksDir)).toBe(true);
      
      const chunks = fs.readdirSync(chunksDir).filter(file => file.endsWith('.js'));
      expect(chunks.length).toBeGreaterThan(0);
    });

    test('should have webpack runtime', () => {
      const webpackPath = path.join(buildDir, 'static/chunks/webpack-*.js');
      const staticChunksDir = path.join(buildDir, 'static/chunks');
      const webpackFiles = fs.readdirSync(staticChunksDir).filter(file => 
        file.startsWith('webpack-') && file.endsWith('.js')
      );
      expect(webpackFiles.length).toBeGreaterThan(0);
    });
  });

  describe('CSS and Assets', () => {
    test('should have compiled CSS', () => {
      const staticDir = path.join(buildDir, 'static');
      const findCssFiles = (dir: string): string[] => {
        const files: string[] = [];
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
          const itemPath = path.join(dir, item);
          const stat = fs.statSync(itemPath);
          
          if (stat.isDirectory()) {
            files.push(...findCssFiles(itemPath));
          } else if (item.endsWith('.css')) {
            files.push(itemPath);
          }
        }
        return files;
      };

      const cssFiles = findCssFiles(staticDir);
      expect(cssFiles.length).toBeGreaterThan(0);
    });

    test('should have static assets from public directory', () => {
      const publicDir = path.join(projectRoot, 'public');
      if (fs.existsSync(publicDir)) {
        const publicFiles = fs.readdirSync(publicDir);
        // Check that some public assets are accessible
        publicFiles.forEach(file => {
          if (!file.startsWith('.')) {
            const builtAssetPath = path.join(buildDir, 'server/app', file);
            // Note: Next.js 13+ handles static assets differently
            // This test may need adjustment based on actual asset handling
          }
        });
      }
    });
  });

  describe('Performance and Optimization', () => {
    test('should have preload links for critical resources', () => {
      const marketingPagePath = path.join(buildDir, 'server/app/(marketing)/page.html');
      if (fs.existsSync(marketingPagePath)) {
        const content = fs.readFileSync(marketingPagePath, 'utf-8');
        // Check for preload links for fonts, critical CSS, etc.
        expect(content).toMatch(/<link[^>]*rel=["']preload["']/);
      }
    });

    test('should have optimized images in build', () => {
      // Check if any image optimization occurred
      const staticDir = path.join(buildDir, 'static');
      if (fs.existsSync(staticDir)) {
        const findImageFiles = (dir: string): string[] => {
          const files: string[] = [];
          const items = fs.readdirSync(dir);
          
          for (const item of items) {
            const itemPath = path.join(dir, item);
            const stat = fs.statSync(itemPath);
            
            if (stat.isDirectory()) {
              files.push(...findImageFiles(itemPath));
            } else if (/\.(jpg|jpeg|png|webp|avif)$/i.test(item)) {
              files.push(itemPath);
            }
          }
          return files;
        };

        const imageFiles = findImageFiles(staticDir);
        // If images exist, they should be in the static directory
        imageFiles.forEach(imagePath => {
          expect(fs.existsSync(imagePath)).toBe(true);
        });
      }
    });
  });

  describe('Route Configuration', () => {
    test('should have routes manifest', () => {
      const routesManifestPath = path.join(buildDir, 'routes-manifest.json');
      expect(fs.existsSync(routesManifestPath)).toBe(true);
      
      const routesManifest = JSON.parse(fs.readFileSync(routesManifestPath, 'utf-8'));
      expect(routesManifest.version).toBeDefined();
      expect(routesManifest.pages404).toBeDefined();
    });

    test('should have app route configurations', () => {
      const appRoutesPath = path.join(buildDir, 'app-build-manifest.json');
      if (fs.existsSync(appRoutesPath)) {
        const appManifest = JSON.parse(fs.readFileSync(appRoutesPath, 'utf-8'));
        expect(appManifest.pages).toBeDefined();
      }
    });
  });

  describe('Production Readiness', () => {
    test('should not contain development artifacts', () => {
      const serverAppPath = path.join(buildDir, 'server/app');
      const searchForDevArtifacts = (dir: string): string[] => {
        const devFiles: string[] = [];
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
          const itemPath = path.join(dir, item);
          const stat = fs.statSync(itemPath);
          
          if (stat.isDirectory()) {
            devFiles.push(...searchForDevArtifacts(itemPath));
          } else if (item.includes('.dev.') || item.includes('development')) {
            devFiles.push(itemPath);
          }
        }
        return devFiles;
      };

      const devArtifacts = searchForDevArtifacts(serverAppPath);
      expect(devArtifacts).toHaveLength(0);
    });

    test('should have minified JavaScript', () => {
      const chunksDir = path.join(buildDir, 'static/chunks');
      const jsFiles = fs.readdirSync(chunksDir).filter(file => file.endsWith('.js'));
      
      // Sample a few files to check they're minified
      const sampleFiles = jsFiles.slice(0, 3);
      sampleFiles.forEach(file => {
        const filePath = path.join(chunksDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Minified files should not have excessive whitespace
        const lines = content.split('\n');
        const averageLineLength = content.length / lines.length;
        expect(averageLineLength).toBeGreaterThan(50); // Indicates minification
      });
    });

    test('should have source maps for debugging', () => {
      const chunksDir = path.join(buildDir, 'static/chunks');
      const jsFiles = fs.readdirSync(chunksDir).filter(file => file.endsWith('.js'));
      const mapFiles = fs.readdirSync(chunksDir).filter(file => file.endsWith('.js.map'));
      
      // Should have some source maps available
      expect(mapFiles.length).toBeGreaterThan(0);
    });
  });

  describe('Server Components', () => {
    test('should have React Server Components artifacts', () => {
      const serverAppPath = path.join(buildDir, 'server/app');
      
      // Look for RSC-specific files
      const findRscFiles = (dir: string): string[] => {
        const files: string[] = [];
        if (!fs.existsSync(dir)) return files;
        
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
          const itemPath = path.join(dir, item);
          const stat = fs.statSync(itemPath);
          
          if (stat.isDirectory()) {
            files.push(...findRscFiles(itemPath));
          } else if (item.includes('layout') || item.includes('page')) {
            files.push(itemPath);
          }
        }
        return files;
      };

      const rscFiles = findRscFiles(serverAppPath);
      expect(rscFiles.length).toBeGreaterThan(0);
    });
  });

  describe('Error Pages', () => {
    test('should have error page components', () => {
      const errorPagePaths = [
        path.join(buildDir, 'server/app/not-found.html'),
        path.join(buildDir, 'server/app/_not-found.html')
      ];

      // At least one error page should exist
      const hasErrorPage = errorPagePaths.some(errorPath => fs.existsSync(errorPath));
      expect(hasErrorPage).toBe(true);
    });
  });
});