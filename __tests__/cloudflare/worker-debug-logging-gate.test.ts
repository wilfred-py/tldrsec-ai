import { readFileSync } from 'fs';
import { join } from 'path';

describe('Cloudflare Worker DEBUG_MODE Logging Gate', () => {
  const workerPath = join(__dirname, '../../cloudflare-cron/index.js');
  let workerContent: string;

  beforeAll(() => {
    workerContent = readFileSync(workerPath, 'utf-8');
  });

  it('should define a debugLog function', () => {
    expect(workerContent).toMatch(/function\s+debugLog\s*\(/);
  });

  it('should check DEBUG_MODE in debugLog', () => {
    // Extract the debugLog function and verify it checks env.DEBUG_MODE
    const debugLogMatch = workerContent.match(/function\s+debugLog[\s\S]*?\n\}/);
    expect(debugLogMatch).not.toBeNull();
    expect(debugLogMatch![0]).toMatch(/DEBUG_MODE/);
  });

  it('should use debugLog for per-attempt logging in executeWithAdvancedRateLimiting', () => {
    // The "Enhanced attempt" log should use debugLog, not console.log
    const enhancedAttemptPattern = /console\.log\([^)]*Enhanced attempt/;
    expect(workerContent).not.toMatch(enhancedAttemptPattern);
  });

  it('should use debugLog for response headers logging', () => {
    const headersPattern = /console\.log\([^)]*Response headers/;
    expect(workerContent).not.toMatch(headersPattern);
  });

  it('should use debugLog for backoff calculation logging', () => {
    const backoffPattern = /console\.log\([^)]*adaptive backoff/i;
    expect(workerContent).not.toMatch(backoffPattern);
  });

  it('should keep console.error and console.warn unconditional', () => {
    // These should NOT be converted to debugLog
    expect(workerContent).toMatch(/console\.error/);
    expect(workerContent).toMatch(/console\.warn/);
  });

  it('should keep DEBUG_MODE in wrangler.toml', () => {
    const wranglerPath = join(__dirname, '../../cloudflare-cron/wrangler.toml');
    const wranglerContent = readFileSync(wranglerPath, 'utf-8');
    expect(wranglerContent).toMatch(/DEBUG_MODE/);
  });
});
