/**
 * Jest configuration for enhanced summarization service tests
 */

export default {
  testEnvironment: 'node',
  rootDir: '../../../../',
  setupFilesAfterEnv: [
    '<rootDir>/lib/ai/summarization/__tests__/setup.js',
    '<rootDir>/lib/ai/summarization/__tests__/jest.setup.js'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs'],
  testMatch: ['**/lib/ai/summarization/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/components/(.*)$': '<rootDir>/components/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/app/(.*)$': '<rootDir>/app/$1',
  }
};
