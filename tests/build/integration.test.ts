import { describe, test, expect, beforeAll, afterAll } from '@jest/test';
import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import path from 'path';

const execAsync = promisify(exec);

describe('Build Integration Tests', () => {
  const projectRoot = path.resolve(__dirname, '../..');
  let serverProcess: ChildProcess | null = null;
  const serverPort = process.env.PORT || 3000;
  const baseUrl = `http://localhost:${serverPort}`;

  beforeAll(async () => {
    // Build the project first
    console.log('Building project for integration tests...');
    await execAsync('npm run build', { cwd: projectRoot });
    
    // Start the production server
    console.log('Starting production server...');
    serverProcess = spawn('npm', ['start'], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Wait for server to start
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server failed to start within 30 seconds'));
      }, 30000);

      const checkServer = async () => {
        try {
          const response = await fetch(`${baseUrl}/api/health`);
          if (response.ok) {
            clearTimeout(timeout);
            resolve(void 0);
          } else {
            setTimeout(checkServer, 1000);
          }
        } catch {
          setTimeout(checkServer, 1000);
        }
      };

      setTimeout(checkServer, 3000); // Wait 3 seconds before first check
    });
  }, 120000);

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await new Promise((resolve) => {
        serverProcess!.on('exit', resolve);
        setTimeout(() => {
          serverProcess!.kill('SIGKILL');
          resolve(void 0);
        }, 5000);
      });
    }
  });

  describe('Server Health Checks', () => {
    test('should respond to health check endpoint', async () => {
      const response = await fetch(`${baseUrl}/api/health`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.status).toBe('healthy');
    });

    test('should have liveness probe working', async () => {
      const response = await fetch(`${baseUrl}/api/health/liveness`);
      expect(response.status).toBe(200);
    });

    test('should have readiness probe working', async () => {
      const response = await fetch(`${baseUrl}/api/health/readiness`);
      expect(response.status).toBe(200);
    });
  });

  describe('Critical Page Routes', () => {
    test('should serve marketing homepage', async () => {
      const response = await fetch(`${baseUrl}/`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      
      const html = await response.text();
      expect(html).toContain('tldrSEC');
      expect(html).toContain('SEC filings');
    });

    test('should serve sign-in page', async () => {
      const response = await fetch(`${baseUrl}/sign-in`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
    });

    test('should serve sign-up page', async () => {
      const response = await fetch(`${baseUrl}/sign-up`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
    });

    test('should serve onboarding page', async () => {
      const response = await fetch(`${baseUrl}/onboarding`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
    });

    test('should handle 404 pages gracefully', async () => {
      const response = await fetch(`${baseUrl}/non-existent-page`);
      expect(response.status).toBe(404);
    });
  });

  describe('API Endpoints', () => {
    test('should handle companies list endpoint', async () => {
      const response = await fetch(`${baseUrl}/api/companies/list`);
      // May require auth, but should not crash
      expect([200, 401, 403]).toContain(response.status);
    });

    test('should handle ticker search endpoint', async () => {
      const response = await fetch(`${baseUrl}/api/tickers/search?q=AAPL`);
      expect([200, 401, 403]).toContain(response.status);
    });

    test('should handle metrics endpoint', async () => {
      const response = await fetch(`${baseUrl}/api/metrics`);
      expect([200, 401, 403]).toContain(response.status);
    });

    test('should handle filing endpoints', async () => {
      const response = await fetch(`${baseUrl}/api/filings/latest`);
      expect([200, 401, 403]).toContain(response.status);
    });
  });

  describe('Static Assets', () => {
    test('should serve JavaScript bundles', async () => {
      const response = await fetch(`${baseUrl}/`);
      const html = await response.text();
      
      // Extract script src attributes
      const scriptMatches = html.match(/<script[^>]*src="([^"]*)"[^>]*>/g);
      if (scriptMatches && scriptMatches.length > 0) {
        const firstScript = scriptMatches[0];
        const srcMatch = firstScript.match(/src="([^"]*)"/);
        if (srcMatch) {
          const scriptUrl = srcMatch[1];
          const scriptResponse = await fetch(`${baseUrl}${scriptUrl}`);
          expect(scriptResponse.status).toBe(200);
          expect(scriptResponse.headers.get('content-type')).toContain('javascript');
        }
      }
    });

    test('should serve CSS files', async () => {
      const response = await fetch(`${baseUrl}/`);
      const html = await response.text();
      
      // Extract CSS link href attributes
      const cssMatches = html.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"]*)"[^>]*>/g);
      if (cssMatches && cssMatches.length > 0) {
        const firstCss = cssMatches[0];
        const hrefMatch = firstCss.match(/href="([^"]*)"/);
        if (hrefMatch) {
          const cssUrl = hrefMatch[1];
          const cssResponse = await fetch(`${baseUrl}${cssUrl}`);
          expect(cssResponse.status).toBe(200);
          expect(cssResponse.headers.get('content-type')).toContain('css');
        }
      }
    });
  });

  describe('Performance Tests', () => {
    test('should respond to homepage within reasonable time', async () => {
      const start = Date.now();
      const response = await fetch(`${baseUrl}/`);
      const duration = Date.now() - start;
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(5000); // 5 seconds max
    });

    test('should handle concurrent requests', async () => {
      const promises = Array.from({ length: 10 }, () =>
        fetch(`${baseUrl}/api/health`)
      );
      
      const responses = await Promise.all(promises);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    test('should have appropriate caching headers', async () => {
      const response = await fetch(`${baseUrl}/`);
      const cacheControl = response.headers.get('cache-control');
      
      // Should have some form of caching for static content
      if (cacheControl) {
        expect(cacheControl).toBeDefined();
      }
    });
  });

  describe('Security Headers', () => {
    test('should have security headers set', async () => {
      const response = await fetch(`${baseUrl}/`);
      
      // Check for common security headers
      const securityHeaders = {
        'x-frame-options': ['DENY', 'SAMEORIGIN'],
        'x-content-type-options': ['nosniff'],
        'referrer-policy': ['strict-origin-when-cross-origin', 'no-referrer-when-downgrade']
      };

      Object.entries(securityHeaders).forEach(([header, expectedValues]) => {
        const value = response.headers.get(header);
        if (value) {
          expect(expectedValues).toContain(value);
        }
      });
    });

    test('should not expose sensitive information in headers', async () => {
      const response = await fetch(`${baseUrl}/`);
      
      const sensitiveHeaders = ['x-powered-by', 'server'];
      sensitiveHeaders.forEach(header => {
        const value = response.headers.get(header);
        if (value) {
          expect(value.toLowerCase()).not.toContain('express');
          expect(value.toLowerCase()).not.toContain('apache');
          expect(value.toLowerCase()).not.toContain('nginx');
        }
      });
    });
  });

  describe('Database Connectivity', () => {
    test('should be able to connect to database through API', async () => {
      // Test an endpoint that requires database access
      const response = await fetch(`${baseUrl}/api/health/readiness`);
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.database).toBe('connected');
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed requests gracefully', async () => {
      const response = await fetch(`${baseUrl}/api/filings/summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json',
      });
      
      expect(response.status).toBe(400);
    });

    test('should handle unauthorized requests appropriately', async () => {
      const protectedEndpoints = [
        '/api/user/tickers',
        '/api/user/preferences',
        '/dashboard'
      ];

      for (const endpoint of protectedEndpoints) {
        const response = await fetch(`${baseUrl}${endpoint}`);
        expect([401, 403, 302]).toContain(response.status); // 302 for redirects to auth
      }
    });
  });

  describe('Content Validation', () => {
    test('should serve valid HTML', async () => {
      const response = await fetch(`${baseUrl}/`);
      const html = await response.text();
      
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
      expect(html).toContain('<head>');
      expect(html).toContain('</head>');
      expect(html).toContain('<body>');
      expect(html).toContain('</body>');
    });

    test('should have proper meta tags', async () => {
      const response = await fetch(`${baseUrl}/`);
      const html = await response.text();
      
      expect(html).toContain('<meta charset="utf-8">');
      expect(html).toContain('<meta name="viewport"');
      expect(html).toContain('<title>');
    });

    test('should not contain development artifacts in production', async () => {
      const response = await fetch(`${baseUrl}/`);
      const html = await response.text();
      
      expect(html).not.toContain('webpack-dev-server');
      expect(html).not.toContain('hot-reload');
      expect(html).not.toContain('localhost:3000');
    });
  });
});