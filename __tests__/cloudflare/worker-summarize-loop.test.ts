import { readFileSync } from 'fs';
import { join } from 'path';

describe('Step 3 Summarize Loop', () => {
  const workerPath = join(__dirname, '../../cloudflare-cron/index.js');
  let workerContent: string;

  beforeAll(() => {
    workerContent = readFileSync(workerPath, 'utf-8');
  });

  describe('structural checks', () => {
    it('should define SUMMARIZE_TIME_BUFFER_MS constant', () => {
      expect(workerContent).toMatch(/SUMMARIZE_TIME_BUFFER_MS\s*=\s*60000/);
    });

    it('should define MAX_SUMMARIZE_ITERATIONS constant', () => {
      expect(workerContent).toMatch(/MAX_SUMMARIZE_ITERATIONS\s*=\s*10/);
    });

    it('should contain a while loop for Step 3', () => {
      // Look for the loop pattern between the SUMMARIZE JOBS banner and Combine results
      const step3Section = workerContent.match(/SUMMARIZE JOBS \(LOOP\)[\s\S]*?Combine results/);
      expect(step3Section).not.toBeNull();
      expect(step3Section![0]).toMatch(/while\s*\(/);
    });

    it('should check jobsProcessed to decide whether to continue', () => {
      expect(workerContent).toMatch(/jobsProcessed\s*===?\s*0/);
    });

    it('should check remaining time against SUMMARIZE_TIME_BUFFER_MS', () => {
      expect(workerContent).toMatch(/SUMMARIZE_TIME_BUFFER_MS/);
    });

    it('should generate fresh HMAC signature per iteration', () => {
      // The generateSignature call should be inside the while loop
      const step3Section = workerContent.match(/SUMMARIZE JOBS \(LOOP\)[\s\S]*?Combine results/);
      expect(step3Section).not.toBeNull();
      const whileBody = step3Section![0].match(/while\s*\([^)]+\)\s*\{[\s\S]*?\n\s{6}\}/);
      expect(whileBody).not.toBeNull();
      expect(whileBody![0]).toMatch(/generateSignature/);
    });

    it('should track totalSummarizeJobsProcessed across iterations', () => {
      expect(workerContent).toMatch(/totalSummarizeJobsProcessed/);
    });

    it('should include loop metrics in result object', () => {
      // The result.metrics.summarize should reference iterations
      expect(workerContent).toMatch(/iterations.*summarizeIterations|summarizeIterations.*iterations/);
    });
  });
});
