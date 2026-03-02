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
    it('should have */5 * * * * pipeline processing schedule', () => {
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

    it('should NOT have old hourly schedule', () => {
      const cronsMatch = wranglerConfig.match(/crons\s*=\s*\[([^\]]+)\]/);
      expect(cronsMatch).toBeTruthy();
      expect(cronsMatch![1]).not.toContain('"0 * * * *"');
    });
  });

  describe('Worker routing logic', () => {
    it('should route */15 * * * * to handleAutoRecovery', () => {
      expect(workerCode).toContain("cronExpression === '*/15 * * * *'");
      expect(workerCode).toContain('handleAutoRecovery');
    });

    it('should route 0 0 * * * to handleDailyTasks', () => {
      expect(workerCode).toContain("cronExpression === '0 0 * * *'");
      expect(workerCode).toContain('handleDailyTasks');
    });

    it('should default to handlePipelineProcessing for */5 * * * *', () => {
      expect(workerCode).toContain('handlePipelineProcessing');
    });

    it('should NOT contain removed dead handlers', () => {
      expect(workerCode).not.toMatch(/async\s+handleIntervalSummary\s*\(/);
      expect(workerCode).not.toMatch(/async\s+handleSummarizeOnly\s*\(/);
    });
  });

  describe('Worker handler structure', () => {
    it('should have all active handlers defined', () => {
      expect(workerCode).toContain('handlePipelineProcessing');
      expect(workerCode).toContain('handleAutoRecovery');
      expect(workerCode).toContain('handleDailyTasks');
      expect(workerCode).toContain('handleDLQCleanup');
      expect(workerCode).toContain('handleDailyReport');
    });

    it('should have handleDailyTasks calling DLQ cleanup and daily report', () => {
      expect(workerCode).toContain('handleDLQCleanup');
      expect(workerCode).toContain('handleDailyReport');
    });
  });
});
