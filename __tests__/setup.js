// Add TextEncoder/TextDecoder to the global scope for Node.js environment
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Add setImmediate polyfill for Node.js environment
if (typeof global.setImmediate === 'undefined') {
  global.setImmediate = (callback, ...args) => {
    return setTimeout(callback, 0, ...args);
  };
}

// Mock BroadcastChannel for MSW
global.BroadcastChannel = class BroadcastChannel {
  constructor() {
    this.name = 'broadcast-channel';
  }
  postMessage() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
};

// Mock the next/navigation functions
jest.mock('next/navigation', () => ({
  useRouter: jest.fn().mockReturnValue({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: jest.fn().mockReturnValue('/'),
  useSearchParams: jest.fn().mockReturnValue(new URLSearchParams()),
}));

// Mock Clerk authentication
jest.mock('@clerk/nextjs', () => ({
  auth: jest.fn().mockReturnValue({ userId: 'user_123' }),
  currentUser: jest.fn().mockResolvedValue({
    id: 'user_123',
    fullName: 'Test User',
    emailAddresses: [{
      emailAddress: 'test@example.com',
    }],
  }),
}));

// Mock Vercel Analytics
jest.mock('@vercel/analytics', () => ({
  track: jest.fn(),
  Analytics: () => null,
}));

// Suppress React 18 console errors during tests
const originalConsoleError = console.error;
console.error = (...args) => {
  if (args[0]?.includes?.('ReactDOM.render')) {
    return;
  }
  if (args[0]?.includes?.('forwardRef render functions')) {
    return;
  }
  if (args[0]?.includes?.('inside a strict mode tree')) {
    return;
  }
  if (args[0]?.includes?.('preflight has invalid HTTP status code')) {
    return;
  }
  originalConsoleError(...args);
};

// Suppress warnings during tests
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  if (args[0]?.includes?.('SEC API request attempt')) {
    return;
  }
  if (args[0]?.includes?.('punycode module is deprecated')) {
    return;
  }
  originalConsoleWarn(...args);
};

// Enhanced Prisma mocking for monitoring tests
// Shared mock prisma client instance - created with all models needed for tests
const sharedMockPrisma = {
  $connect: jest.fn().mockResolvedValue(undefined),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  $transaction: jest.fn().mockImplementation(function(callback) {
    if (typeof callback === 'function') {
      return callback(sharedMockPrisma);
    }
    return Promise.resolve();
  }),
  errorAlert: {
    create: jest.fn().mockResolvedValue({ id: 'mock-alert-id' }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockResolvedValue({ id: 'mock-alert-id' }),
    delete: jest.fn().mockResolvedValue({ id: 'mock-alert-id' }),
  },
  pipelineHealthHistory: {
    create: jest.fn().mockResolvedValue({ id: 'mock-health-id' }),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: {}, _count: {} }),
  },
  securityAuditLog: {
    create: jest.fn().mockResolvedValue({ id: 'mock-audit-id' }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  distributedLock: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'mock-lock-id' }),
    delete: jest.fn().mockResolvedValue({ id: 'mock-lock-id' }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  user: {
    findUnique: jest.fn().mockResolvedValue({ id: 'user_123' }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  summary: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'mock-summary-id' }),
  },
  recoveryState: {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'singleton' }),
    upsert: jest.fn().mockResolvedValue({ id: 'singleton' }),
  },
};

// Mock lib/db/prisma (direct import path)
jest.mock('../lib/db/prisma', () => ({
  getPrismaClient: jest.fn().mockReturnValue(sharedMockPrisma),
  prisma: sharedMockPrisma,
}));

// Mock lib/db (re-export path) - uses same shared mock
jest.mock('../lib/db', () => ({
  getPrismaClient: jest.fn().mockReturnValue(sharedMockPrisma),
  prisma: sharedMockPrisma,
}));

// Mock the monitoring services with proper error handling
jest.mock('../lib/monitoring/alert-service', () => ({
  alertService: {
    createAlert: jest.fn().mockResolvedValue('mock-alert-id'),
    checkThresholds: jest.fn().mockResolvedValue([]),
    getAlertStatistics: jest.fn().mockResolvedValue({
      total: 0,
      byType: {},
      byStatus: {},
      trends: {},
    }),
    getRecentAlerts: jest.fn().mockResolvedValue([]),
    resolveAlert: jest.fn().mockResolvedValue(true),
  },
}));

// Create a mock Prisma client that can be used in transactions
const mockPrismaClient = {
  errorAlert: {
    create: jest.fn().mockResolvedValue({ id: 'mock-alert-id' }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    update: jest.fn().mockResolvedValue({ id: 'mock-alert-id' }),
    delete: jest.fn().mockResolvedValue({ id: 'mock-alert-id' }),
  },
  pipelineHealthHistory: {
    create: jest.fn().mockResolvedValue({ id: 'mock-health-id' }),
    findMany: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: {}, _count: {} }),
  },
  securityAuditLog: {
    create: jest.fn().mockResolvedValue({ id: 'mock-audit-id' }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
}; 