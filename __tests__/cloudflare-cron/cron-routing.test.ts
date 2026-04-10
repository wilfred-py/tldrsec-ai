// Tests for Cloudflare Worker cron routing configuration
// Verifies correct routing of cron schedules to appropriate handlers.

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
    it('should have */5 * * * * pipeline schedule', () => {
      expect(wranglerConfig).toContain('*/5 * * * *');
    });

    it('should have */15 * * * * auto-recovery schedule', () => {
      expect(wranglerConfig).toContain('*/15 * * * *');
    });

    it('should have 0 0 * * * daily tasks schedule', () => {
      expect(wranglerConfig).toContain('0 0 * * *');
    });

    it('should have exactly 3 cron triggers (free tier limit)', () => {
      const cronsMatch = wranglerConfig.match(/crons\s*=\s*\[([^\]]+)\]/);
      expect(cronsMatch).toBeTruthy();
      const schedules = cronsMatch![1].match(/"[^"]+"/g);
      expect(schedules).toHaveLength(3);
    });
  });

  describe('Worker routing logic', () => {
    it('should route auto-recovery cron', () => {
      expect(workerCode).toContain('*/15 * * * *');
      expect(workerCode).toContain('handleAutoRecovery');
    });

    it('should route daily tasks cron', () => {
      expect(workerCode).toContain('0 0 * * *');
      expect(workerCode).toContain('handleDailyTasks');
    });

    it('should default to handlePipelineProcessing', () => {
      expect(workerCode).toContain('handlePipelineProcessing');
    });

    it('should NOT contain removed dead handlers', () => {
      expect(workerCode).not.toMatch(/AdvancedRateLimiter/);
      expect(workerCode).not.toMatch(/CircuitBreaker/);
      expect(workerCode).not.toMatch(/WorkerMonitor/);
      expect(workerCode).not.toMatch(/WorkerMetrics/);
    });
  });

  describe('Worker handler structure', () => {
    it('should have all active handlers defined', () => {
      expect(workerCode).toContain('handlePipelineProcessing');
      expect(workerCode).toContain('handleAutoRecovery');
      expect(workerCode).toContain('handleDailyTasks');
    });

    it('should have handleDailyTasks calling cleanup-dlq', () => {
      expect(workerCode).toContain('cleanup-dlq');
    });
  });
});
