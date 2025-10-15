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