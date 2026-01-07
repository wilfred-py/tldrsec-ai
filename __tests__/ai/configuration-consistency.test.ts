/**
 * Configuration Consistency Tests for Phase 2
 *
 * Tests to ensure clean configuration after deprecated code removal:
 * - No deprecated sec-prompts.js file
 * - No backup directories in production paths
 * - No legacy test files in project root
 * - Consistent temperature settings (0.2 for SEC analysis)
 */

import fs from 'fs';
import path from 'path';
import glob from 'glob';

describe('AI Configuration Consistency', () => {
  describe('Deprecated Files Removal', () => {
    it('should have no deprecated sec-prompts.js file in lib/ai/', () => {
      const deprecatedPromptFile = path.join(process.cwd(), 'lib/ai/sec-prompts.js');
      expect(fs.existsSync(deprecatedPromptFile)).toBe(false);
    });

    it('should have no backup service directory', () => {
      const backupServiceDir = path.join(process.cwd(), 'services/filing/backup');
      expect(fs.existsSync(backupServiceDir)).toBe(false);
    });

    it('should have no legacy test files in project root', () => {
      const legacyTestFiles = [
        'test-claude-summarization.ts',
        'test-claude-summarization.js',
      ];

      legacyTestFiles.forEach(file => {
        const filePath = path.join(process.cwd(), file);
        expect(fs.existsSync(filePath)).toBe(false);
      });
    });

    it('should have no deprecated test files in tests/ directory', () => {
      const deprecatedTestFiles = [
        'tests/test-sec-filings.ts',
        'tests/test-sec-filings.js',
        'tests/test-sec-filings-js.js',
      ];

      deprecatedTestFiles.forEach(file => {
        const filePath = path.join(process.cwd(), file);
        expect(fs.existsSync(filePath)).toBe(false);
      });
    });

    it('should have no backup configuration files', () => {
      const backupConfigs = [
        'cloudflare-cron/wrangler.toml.backup',
      ];

      backupConfigs.forEach(file => {
        const filePath = path.join(process.cwd(), file);
        expect(fs.existsSync(filePath)).toBe(false);
      });
    });

    it('should have no backup stripe implementation directory', () => {
      const backupStripeDir = path.join(process.cwd(), 'backup/stripe-implementation');
      expect(fs.existsSync(backupStripeDir)).toBe(false);
    });
  });

  describe('Temperature Consistency', () => {
    it('should use 0.2 temperature in lib/ai/config.ts as default', async () => {
      const configPath = path.join(process.cwd(), 'lib/ai/config.ts');
      const content = fs.readFileSync(configPath, 'utf-8');

      // Check that the default temperature in modelConfig is 0.2
      expect(content).toMatch(/temperature:\s*parseFloat\(getEnv\(['"]OPENROUTER_TEMPERATURE['"],\s*['"]0\.2['"]\)/);
    });

    it('should use 0.2 temperature in filing-prompts.ts for all form types', async () => {
      const promptsPath = path.join(process.cwd(), 'lib/ai/prompts/filing-prompts.ts');
      const content = fs.readFileSync(promptsPath, 'utf-8');

      // Extract all temperature values
      const temperatureMatches = content.match(/temperature:\s*(0\.\d+)/g) || [];
      const temperatures = temperatureMatches.map(match => {
        const valueMatch = match.match(/0\.\d+/);
        return valueMatch ? parseFloat(valueMatch[0]) : null;
      }).filter(v => v !== null);

      // All temperatures should be 0.2 for SEC filing analysis
      temperatures.forEach(temp => {
        expect(temp).toBe(0.2);
      });

      // Should have multiple temperature settings (one per form type)
      expect(temperatures.length).toBeGreaterThan(5);
    });

    it('should use 0.2 temperature in chunk-processor.ts', async () => {
      const chunkProcessorPath = path.join(process.cwd(), 'lib/ai/summarization/chunk-processor.ts');
      const content = fs.readFileSync(chunkProcessorPath, 'utf-8');

      // Look for the temperature setting in the options
      expect(content).toMatch(/temperature:\s*0\.2/);
    });
  });
});

describe('Prompt System Integration', () => {
  it('should only use unified TypeScript prompt system in production code', () => {
    // Search for imports of sec-prompts.js in production lib/services code
    const searchPaths = ['lib', 'services', 'app'];

    for (const searchPath of searchPaths) {
      const files = glob.sync(`${searchPath}/**/*.{ts,tsx}`, {
        ignore: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**', '**/__mocks__/**'],
        cwd: process.cwd()
      });

      for (const file of files) {
        const filePath = path.join(process.cwd(), file);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          // Should not import deprecated sec-prompts.js
          expect(content).not.toMatch(/from\s+['"].*sec-prompts\.js['"]/);
          expect(content).not.toMatch(/import.*sec-prompts/);
        }
      }
    }
  });

  it('should have unified-prompts.ts as the active prompt system', () => {
    const unifiedPromptsPath = path.join(process.cwd(), 'lib/ai/prompts/unified-prompts.ts');
    expect(fs.existsSync(unifiedPromptsPath)).toBe(true);
  });
});
