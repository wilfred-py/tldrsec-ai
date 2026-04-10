import { readFileSync } from 'fs';
import { join } from 'path';

describe('Cloudflare Worker Logging', () => {
  const workerPath = join(__dirname, '../../cloudflare-cron/index.js');
  let workerContent: string;

  beforeAll(() => {
    workerContent = readFileSync(workerPath, 'utf-8');
  });

  it('should use console.log for operational logging', () => {
    expect(workerContent).toMatch(/console\.log/);
  });

  it('should use console.error for error logging', () => {
    expect(workerContent).toMatch(/console\.error/);
  });

  it('should not contain verbose debug infrastructure', () => {
    // The simplified worker should not have the old debug logging gate
    expect(workerContent).not.toMatch(/AdvancedRateLimiter/);
    expect(workerContent).not.toMatch(/CircuitBreaker/);
    expect(workerContent).not.toMatch(/WorkerMonitor/);
    expect(workerContent).not.toMatch(/WorkerMetrics/);
  });
});
