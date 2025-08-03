export default {
  displayName: 'Build Tests',
  testMatch: ['<rootDir>/tests/build/**/*.test.ts'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/build/setup.ts'],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'services/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 60000,
  verbose: true,
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      useESM: true,
    }],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testSequencer: '<rootDir>/tests/build/test-sequencer.mjs'
};