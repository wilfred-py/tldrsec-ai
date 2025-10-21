import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  // Provide the path to your Next.js app
  dir: './',
});

// Add any custom config to be passed to Jest
const config = {
  testEnvironment: 'jsdom',
  testTimeout: 30000, // 30 seconds for async operations
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js', 
    '<rootDir>/__tests__/setup.js'
  ],
  // Override timeout for real pipeline tests
  testMatch: [
    '<rootDir>/**/__tests__/**/*.(test|spec).(js|jsx|ts|tsx)',
    '<rootDir>/**/?(*.)(test|spec).(js|jsx|ts|tsx)'
  ],
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
  moduleNameMapper: {
    '^@/components/(.*)$': '<rootDir>/components/$1',
    '^@/lib/(.*)$': '<rootDir>/lib/$1',
    '^@/app/(.*)$': '<rootDir>/app/$1',
    '^@/__tests__/(.*)$': '<rootDir>/__tests__/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs'],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config); 