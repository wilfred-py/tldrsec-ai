import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  // Provide the path to your Next.js app
  dir: './',
});

// ESM packages that Jest needs to transform (including transitive deps)
const esmPackages = [
  '@vercel/analytics',
  '@clerk/backend.*\\.mjs',
  '@clerk/.*',
  'react-syntax-highlighter/.*',
  'react-json-tree',
  'react-base16-styling',
  'base16',
  'lodash-es',
  'color',
  'color-string',
  'color-convert',
  'color-name',
  'dompurify',
  '@jest/transform',
  '@babel/preset-env',
].join('|');

// Add any custom config to be passed to Jest
const config = {
  testEnvironment: 'jsdom',
  testTimeout: 60000, // 60 seconds for async operations (increased for CI)
  // Load dotenv before any test setup to ensure DATABASE_URL is available for integration tests
  setupFiles: ['<rootDir>/__tests__/setup-integration.js'],
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
    '^@/contexts/(.*)$': '<rootDir>/contexts/$1',
    '^@/hooks/(.*)$': '<rootDir>/hooks/$1',
    '^@/__tests__/(.*)$': '<rootDir>/__tests__/$1',
    '^@/scripts/(.*)$': '<rootDir>/scripts/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '@clerk/backend': '<rootDir>/__tests__/__mocks__/@clerk/backend.js',
    '@clerk/nextjs/server$': '<rootDir>/__tests__/__mocks__/@clerk/nextjs.js',
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mjs'],
  transformIgnorePatterns: [
    `node_modules/(?!(${esmPackages}))`,
  ],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
};

// Override next/jest's transformIgnorePatterns with ours
const baseConfig = createJestConfig(config);
export default async () => {
  const resolved = await baseConfig();
  resolved.transformIgnorePatterns = [
    `node_modules/(?!(${esmPackages}))`,
    '^.+\\.module\\.(css|sass|scss)$',
  ];
  return resolved;
};
