import { readFileSync } from 'fs';
import { join } from 'path';

describe('Cloudflare Worker Dead Code Removal', () => {
  const workerPath = join(__dirname, '../../cloudflare-cron/index.js');
  const wranglerPath = join(__dirname, '../../cloudflare-cron/wrangler.toml');
  let workerContent: string;
  let wranglerContent: string;

  beforeAll(() => {
    workerContent = readFileSync(workerPath, 'utf-8');
    wranglerContent = readFileSync(wranglerPath, 'utf-8');
  });

  it('should NOT contain handleIntervalSummary function', () => {
    expect(workerContent).not.toMatch(/async\s+handleIntervalSummary\s*\(/);
  });

  it('should NOT contain handleSummarizeOnly function', () => {
    expect(workerContent).not.toMatch(/async\s+handleSummarizeOnly\s*\(/);
  });

  it('should NOT contain intervalSummary in handlerHealth', () => {
    expect(workerContent).not.toMatch(/intervalSummary\s*:/);
  });

  it('should NOT contain USE_ASYNC_PROCESSING in wrangler.toml', () => {
    expect(wranglerContent).not.toMatch(/USE_ASYNC_PROCESSING/);
  });

  it('should NOT contain RATE_LIMIT_STRATEGY in wrangler.toml', () => {
    expect(wranglerContent).not.toMatch(/RATE_LIMIT_STRATEGY/);
  });

  it('should still contain active handlers', () => {
    expect(workerContent).toMatch(/handlePipelineProcessing/);
    expect(workerContent).toMatch(/handleAutoRecovery/);
    expect(workerContent).toMatch(/handleDailyTasks/);
  });
});
