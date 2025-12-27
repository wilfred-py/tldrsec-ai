import { describe, it, expect, afterEach } from '@jest/globals';

describe('USE_3_PHASE_PIPELINE Feature Flag', () => {
  const originalEnv = process.env.USE_3_PHASE_PIPELINE;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.USE_3_PHASE_PIPELINE;
    } else {
      process.env.USE_3_PHASE_PIPELINE = originalEnv;
    }
  });

  it('should default to true when not set', () => {
    delete process.env.USE_3_PHASE_PIPELINE;
    // The new behavior: defaults to true (enabled) unless explicitly set to 'false'
    const use3PhasePipeline = process.env.USE_3_PHASE_PIPELINE !== 'false';
    expect(use3PhasePipeline).toBe(true);
  });

  it('should be true when explicitly set to true', () => {
    process.env.USE_3_PHASE_PIPELINE = 'true';
    const use3PhasePipeline = process.env.USE_3_PHASE_PIPELINE !== 'false';
    expect(use3PhasePipeline).toBe(true);
  });

  it('should be false only when explicitly set to false', () => {
    process.env.USE_3_PHASE_PIPELINE = 'false';
    const use3PhasePipeline = process.env.USE_3_PHASE_PIPELINE !== 'false';
    expect(use3PhasePipeline).toBe(false);
  });

  it('should be true when set to any other value', () => {
    // Edge case: any value other than 'false' should result in true
    process.env.USE_3_PHASE_PIPELINE = 'yes';
    const use3PhasePipeline = process.env.USE_3_PHASE_PIPELINE !== 'false';
    expect(use3PhasePipeline).toBe(true);

    process.env.USE_3_PHASE_PIPELINE = '1';
    const use3PhasePipeline2 = process.env.USE_3_PHASE_PIPELINE !== 'false';
    expect(use3PhasePipeline2).toBe(true);

    process.env.USE_3_PHASE_PIPELINE = '';
    const use3PhasePipeline3 = process.env.USE_3_PHASE_PIPELINE !== 'false';
    expect(use3PhasePipeline3).toBe(true);
  });
});
