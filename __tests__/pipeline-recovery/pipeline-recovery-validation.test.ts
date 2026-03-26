import { describe, it, expect } from '@jest/globals';

// Skip in CI — these tests hit the live production API and are meant
// for manual post-recovery validation, not automated test suites.
const describeOrSkip = process.env.CI ? describe.skip : describe;

describeOrSkip('Pipeline Recovery Validation', () => {
  it('should have healthy pipeline status after recovery', async () => {
    const response = await fetch('https://tldrsec.app/api/health/pipeline');
    const health = await response.json();
    expect(health.status).toBe('HEALTHY');
    expect(health.issues).toHaveLength(0);
  });

  it('should have zero jobs in queue after recovery', async () => {
    // Check queue status via API
    const response = await fetch('https://tldrsec.app/api/health/pipeline');
    const health = await response.json();
    expect(health.jobs?.pending || 0).toBe(0);
    expect(health.jobs?.processing || 0).toBe(0);
  });

  it('should have recent cron executions', async () => {
    const response = await fetch('https://tldrsec.app/api/health/pipeline');
    const health = await response.json();
    const minutesSinceLastCron = health.cronExecution?.minutesSinceLastCron;
    expect(minutesSinceLastCron).toBeDefined();
    expect(minutesSinceLastCron).toBeLessThan(15);
  });
});