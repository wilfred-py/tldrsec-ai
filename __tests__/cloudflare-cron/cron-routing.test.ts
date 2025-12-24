/**
 * Tests for Cloudflare Worker cron routing configuration
 *
 * These tests verify the Worker is correctly configured to route
 * the 10-minute interval cron schedule to the interval summary endpoint.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Cloudflare Worker Cron Routing', () => {
  const workerPath = path.join(process.cwd(), 'cloudflare-cron', 'index.js');
  const wranglerPath = path.join(process.cwd(), 'cloudflare-cron', 'wrangler.toml');
  let workerCode: string;
  let wranglerConfig: string;

  beforeAll(() => {
    workerCode = fs.readFileSync(workerPath, 'utf-8');
    wranglerConfig = fs.readFileSync(wranglerPath, 'utf-8');
  });

  describe('wrangler.toml configuration', () => {
    it('should have */10 * * * * cron schedule configured', () => {
      expect(wranglerConfig).toContain('*/10 * * * *');
    });

    it('should have removed the 0 * * * * hourly schedule', () => {
      // The old hourly schedule should not be in the crons array
      const cronsMatch = wranglerConfig.match(/crons\s*=\s*\[([^\]]+)\]/);
      expect(cronsMatch).toBeTruthy();
      const cronsArray = cronsMatch![1];
      expect(cronsArray).not.toContain('"0 * * * *"');
    });

    it('should still have the daily report schedule', () => {
      expect(wranglerConfig).toContain('0 22 * * *');
    });

    it('should still have the pipeline processing schedule', () => {
      expect(wranglerConfig).toContain('*/5 * * * *');
    });
  });

  describe('Worker routing logic', () => {
    it('should have handleIntervalSummary function defined', () => {
      expect(workerCode).toContain('handleIntervalSummary');
    });

    it('should route */10 * * * * to handleIntervalSummary', () => {
      // Check the routing logic matches the expression
      expect(workerCode).toContain("cronExpression === '*/10 * * * *'");
      expect(workerCode).toContain('handleIntervalSummary');
    });

    it('should call the correct endpoint from interval handler', () => {
      expect(workerCode).toContain('/api/cron/slack-interval-summary');
    });

    it('should not have the old hourly summary routing', () => {
      // The old hourly routing should not exist
      expect(workerCode).not.toContain("cronExpression === '0 * * * *'");
      expect(workerCode).not.toContain('handleHourlySummary');
    });

    it('should generate proper HMAC signature for interval endpoint', () => {
      // Check that HMAC is generated for the correct endpoint
      expect(workerCode).toContain('GET:/api/cron/slack-interval-summary');
    });

    it('should log skipped status when no activity', () => {
      // Check that the handler logs skip status
      expect(workerCode).toContain('result.skipped');
    });
  });

  describe('Worker handler structure', () => {
    it('should have daily report handler still defined', () => {
      expect(workerCode).toContain('handleDailyReport');
      expect(workerCode).toContain('/api/cron/slack-daily-report');
    });

    it('should have pipeline processing handler still defined', () => {
      expect(workerCode).toContain('handlePipelineProcessing');
    });

    it('should route 0 22 * * * to daily report', () => {
      expect(workerCode).toContain("cronExpression === '0 22 * * *'");
    });
  });
});
