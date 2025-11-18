/**
 * Cloudflare Worker Configuration Synchronization Tests
 * 
 * Validates that root-level and subdirectory wrangler.toml configurations
 * are properly synchronized to prevent deployment issues.
 */

import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

// TOML parsing utility (simple parser for test purposes)
function parseToml(content: string): Record<string, any> {
  const lines = content.split('\n');
  const config: Record<string, any> = {};
  let currentSection = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // Section header
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1);
      if (currentSection === 'vars') {
        config.vars = {};
      } else if (currentSection === 'triggers') {
        config.triggers = {};
      } else if (currentSection === 'observability.logs') {
        config.observability = config.observability || {};
        config.observability.logs = {};
      }
      continue;
    }
    
    // Key-value pairs
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex > 0) {
      const key = trimmed.slice(0, equalIndex).trim();
      let value = trimmed.slice(equalIndex + 1).trim();
      
      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) || 
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      // Handle arrays (crons)
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1).split(',').map(v => v.trim().replace(/["']/g, ''));
      }
      
      if (currentSection === 'vars') {
        config.vars[key] = value;
      } else if (currentSection === 'triggers') {
        config.triggers[key] = value;
      } else if (currentSection === 'observability.logs') {
        config.observability = config.observability || {};
        config.observability.logs = config.observability.logs || {};
        config.observability.logs[key] = value === 'true' ? true : value === 'false' ? false : value;
      } else {
        config[key] = value;
      }
    }
  }
  
  return config;
}

describe('Cloudflare Worker Configuration Synchronization', () => {
  let rootConfig: Record<string, any>;
  let subdirConfig: Record<string, any>;

  beforeAll(() => {
    // Read configuration files
    const rootConfigPath = join(process.cwd(), 'wrangler.toml');
    const subdirConfigPath = join(process.cwd(), 'cloudflare-cron', 'wrangler.toml');
    
    const rootConfigContent = readFileSync(rootConfigPath, 'utf8');
    const subdirConfigContent = readFileSync(subdirConfigPath, 'utf8');
    
    rootConfig = parseToml(rootConfigContent);
    subdirConfig = parseToml(subdirConfigContent);
  });

  describe('Basic Configuration', () => {
    test('should have matching worker name', () => {
      expect(rootConfig.name).toBeDefined();
      expect(subdirConfig.name).toBeDefined();
      expect(rootConfig.name).toBe(subdirConfig.name);
    });

    test('should have matching compatibility date', () => {
      expect(rootConfig.compatibility_date).toBeDefined();
      expect(subdirConfig.compatibility_date).toBeDefined();
      expect(rootConfig.compatibility_date).toBe(subdirConfig.compatibility_date);
    });

    test('should have matching cron triggers', () => {
      expect(rootConfig.triggers?.crons).toBeDefined();
      expect(subdirConfig.triggers?.crons).toBeDefined();
      expect(rootConfig.triggers.crons).toEqual(subdirConfig.triggers.crons);
      expect(rootConfig.triggers.crons).toContain('*/10 * * * *');
    });
  });

  describe('Environment Variables Synchronization', () => {
    test('should have matching PUBLIC_URL', () => {
      expect(rootConfig.vars?.PUBLIC_URL).toBe('https://tldrsec.app');
      expect(subdirConfig.vars?.PUBLIC_URL).toBe('https://tldrsec.app');
      expect(rootConfig.vars.PUBLIC_URL).toBe(subdirConfig.vars.PUBLIC_URL);
    });

    test('should have matching USE_ASYNC_PROCESSING (Bug #5 fix)', () => {
      // Critical: Both should be 'false' after the bug fix
      expect(rootConfig.vars?.USE_ASYNC_PROCESSING).toBe('false');
      expect(subdirConfig.vars?.USE_ASYNC_PROCESSING).toBe('false');
      expect(rootConfig.vars.USE_ASYNC_PROCESSING).toBe(subdirConfig.vars.USE_ASYNC_PROCESSING);
    });

    test('should have matching DEBUG_MODE', () => {
      expect(rootConfig.vars?.DEBUG_MODE).toBeDefined();
      expect(subdirConfig.vars?.DEBUG_MODE).toBeDefined();
      expect(rootConfig.vars.DEBUG_MODE).toBe(subdirConfig.vars.DEBUG_MODE);
    });

    test('should have matching WORKER_VERSION', () => {
      expect(rootConfig.vars?.WORKER_VERSION).toBeDefined();
      expect(subdirConfig.vars?.WORKER_VERSION).toBeDefined();
      expect(rootConfig.vars.WORKER_VERSION).toBe(subdirConfig.vars.WORKER_VERSION);
    });

    test('should have matching RATE_LIMIT_STRATEGY', () => {
      expect(rootConfig.vars?.RATE_LIMIT_STRATEGY).toBeDefined();
      expect(subdirConfig.vars?.RATE_LIMIT_STRATEGY).toBeDefined();
      expect(rootConfig.vars.RATE_LIMIT_STRATEGY).toBe(subdirConfig.vars.RATE_LIMIT_STRATEGY);
    });
  });

  describe('Critical Bug Fix Validations', () => {
    test('USE_ASYNC_PROCESSING should be disabled in both configs (Bug #3 & #5 fix)', () => {
      // This was the critical fix - both configs must have async processing disabled
      expect(rootConfig.vars.USE_ASYNC_PROCESSING).toBe('false');
      expect(subdirConfig.vars.USE_ASYNC_PROCESSING).toBe('false');
    });

    test('should not reference tier-aware-optimized endpoint anywhere (Bug #4 fix)', () => {
      const rootContent = readFileSync(join(process.cwd(), 'wrangler.toml'), 'utf8');
      const subdirContent = readFileSync(join(process.cwd(), 'cloudflare-cron', 'wrangler.toml'), 'utf8');
      
      expect(rootContent).not.toContain('tier-aware-optimized');
      expect(subdirContent).not.toContain('tier-aware-optimized');
    });

    test('should have consistent configuration structure', () => {
      // Ensure both configs have the same variable keys
      const rootVarKeys = Object.keys(rootConfig.vars || {}).sort();
      const subdirVarKeys = Object.keys(subdirConfig.vars || {}).sort();
      
      expect(rootVarKeys).toEqual(subdirVarKeys);
    });
  });

  describe('Root Configuration Wrapper', () => {
    test('should point to correct main entry point', () => {
      expect(rootConfig.main).toBe('cloudflare-cron/index.js');
    });

    test('should not duplicate subdirectory-specific settings', () => {
      // Root config should be a wrapper, not duplicate all subdirectory settings
      const rootContent = readFileSync(join(process.cwd(), 'wrangler.toml'), 'utf8');
      
      // Should contain wrapper comments
      expect(rootContent).toContain('Root Level Wrapper');
      expect(rootContent).toContain('cloudflare-cron/ subdirectory');
    });
  });

  describe('Deployment Readiness', () => {
    test('should be ready for Cloudflare automatic deployment', () => {
      // Verify all required fields for automatic deployment
      expect(rootConfig.name).toBeDefined();
      expect(rootConfig.main).toBe('cloudflare-cron/index.js');
      expect(rootConfig.compatibility_date).toBeDefined();
      expect(rootConfig.triggers?.crons).toBeDefined();
      expect(rootConfig.vars).toBeDefined();
    });

    test('should have proper observability configuration', () => {
      // Both should have logging enabled for monitoring
      expect(rootConfig.observability?.logs?.enabled).toBe(true);
      expect(subdirConfig.observability?.logs?.enabled).toBe(true);
    });

    test('should document secret requirements', () => {
      const rootContent = readFileSync(join(process.cwd(), 'wrangler.toml'), 'utf8');
      const subdirContent = readFileSync(join(process.cwd(), 'cloudflare-cron', 'wrangler.toml'), 'utf8');
      
      // Should document CRON_SECRET requirement
      expect(rootContent).toContain('CRON_SECRET');
      expect(subdirContent).toContain('CRON_SECRET');
    });
  });

  describe('Configuration Drift Prevention', () => {
    test('should prevent future configuration drift', () => {
      // Test that critical configuration values match exactly
      const criticalVars = [
        'PUBLIC_URL',
        'USE_ASYNC_PROCESSING', 
        'DEBUG_MODE',
        'WORKER_VERSION',
        'RATE_LIMIT_STRATEGY'
      ];
      
      for (const varName of criticalVars) {
        expect(rootConfig.vars[varName]).toBe(subdirConfig.vars[varName],
          `Configuration drift detected: ${varName} differs between root and subdirectory configs`);
      }
    });

    test('should maintain cron schedule synchronization', () => {
      expect(rootConfig.triggers.crons).toEqual(subdirConfig.triggers.crons);
      expect(rootConfig.triggers.crons).toContain('*/10 * * * *');
    });

    test('should maintain compatibility date synchronization', () => {
      expect(rootConfig.compatibility_date).toBe(subdirConfig.compatibility_date);
      
      // Should be a valid date format (YYYY-MM-DD)
      const compatDate = rootConfig.compatibility_date;
      expect(compatDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      
      // Should be 2024-10-01 or later (current compatibility date)
      expect(compatDate).toMatch(/^202[4-9]-/);
    });
  });

  describe('Security Configuration', () => {
    test('should not contain secrets in configuration files', () => {
      const rootContent = readFileSync(join(process.cwd(), 'wrangler.toml'), 'utf8');
      const subdirContent = readFileSync(join(process.cwd(), 'cloudflare-cron', 'wrangler.toml'), 'utf8');
      
      // Should not contain actual secret values
      expect(rootContent).not.toContain('CRON_SECRET = ');
      expect(subdirContent).not.toContain('CRON_SECRET = ');
      
      // Should only contain documentation about secrets
      expect(rootContent).toContain('wrangler secret put');
      expect(subdirContent).toContain('wrangler secret put');
    });

    test('should properly document secret management', () => {
      const rootContent = readFileSync(join(process.cwd(), 'wrangler.toml'), 'utf8');
      
      expect(rootContent).toContain('npx wrangler secret put CRON_SECRET');
      expect(rootContent).toContain('Required Commands:');
    });
  });
});