// Suppress Node.js deprecation warnings in tests
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'DeprecationWarning' && warning.message.includes('punycode')) {
    return; // Suppress punycode deprecation warnings
  }
  console.warn(warning.message);
});

// Import Jest DOM for DOM testing utilities
require('@testing-library/jest-dom');
// Import fetch polyfill for testing API calls
require('whatwg-fetch');

// Mock environment variables
process.env.NEXT_PUBLIC_API_ENABLED = 'false';
process.env.NEXT_PUBLIC_API_URL = 'https://test-api.tldrsec.dev';

// Mock the global fetch function
global.fetch = jest.fn();

// Mock Next.js objects
global.Request = class Request {
  constructor(input, init = {}) {
    this.url = input instanceof Request ? input.url : input;
    this.method = init.method || 'GET';
    this.headers = new Headers(init.headers || {});
    this.body = init.body || null;
    this._bodyInit = init.body || null;
  }

  json() {
    return Promise.resolve(
      typeof this.body === 'string' ? JSON.parse(this.body) : this.body
    );
  }

  text() {
    return Promise.resolve(
      typeof this.body === 'string' ? this.body : JSON.stringify(this.body)
    );
  }
};

global.Response = class Response {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status || 200;
    this.statusText = init.statusText || '';
    this.headers = new Headers(init.headers || {});
    this._bodyInit = body;
    this.type = 'basic';
    this.url = '';
  }

  json() {
    return Promise.resolve(
      typeof this.body === 'string' ? JSON.parse(this.body) : this.body
    );
  }

  text() {
    return Promise.resolve(
      typeof this.body === 'string' ? this.body : JSON.stringify(this.body)
    );
  }
};

global.Headers = class Headers {
  constructor(init = {}) {
    this.headers = new Map();
    if (init) {
      Object.keys(init).forEach(key => {
        this.headers.set(key.toLowerCase(), init[key]);
      });
    }
  }

  append(name, value) {
    this.headers.set(name.toLowerCase(), value);
  }

  get(name) {
    return this.headers.get(name.toLowerCase()) || null;
  }
};

// Mock monitoring module
jest.mock('@/lib/monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    recordValue: jest.fn(),
    recordTiming: jest.fn(),
    startTimer: jest.fn().mockReturnValue('timer-id'),
    stopTimer: jest.fn(),
    registerHealthCheck: jest.fn(),
    getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
    setUnhealthy: jest.fn(),
    setHealthy: jest.fn()
  }
}), { virtual: true });

// Mock the logger
const mockLoggerMethods = {
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  child: jest.fn().mockReturnValue({
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    child: jest.fn()
  })
};

jest.mock('@/lib/logging', () => ({
  logger: mockLoggerMethods,
  Logger: jest.fn().mockImplementation(() => mockLoggerMethods),
  defaultLogger: mockLoggerMethods
}), { virtual: true });

// Mock notification service
jest.mock('@/lib/email/notification-service', () => ({
  NotificationPreference: {
    IMMEDIATE: 'immediate',
    DAILY: 'daily',
    WEEKLY: 'weekly',
    NEVER: 'never'
  },
  NotificationService: {
    getInstance: jest.fn().mockReturnValue({
      sendNotification: jest.fn().mockResolvedValue(true),
      sendDigest: jest.fn().mockResolvedValue(true)
    })
  }
}), { virtual: true });

// Mock resend client
jest.mock('@/lib/email/resend-client', () => ({
  ResendClient: jest.fn().mockImplementation(() => ({
    sendEmail: jest.fn().mockResolvedValue({ id: 'mock-email-id' }),
  }))
}), { virtual: true });

// Mock Next.js modules
jest.mock('next/server', () => ({
  NextRequest: global.Request,
  NextResponse: {
    json: (body, init = {}) => new global.Response(body, init)
  }
}), { virtual: true });

// Mock window methods that are not implemented in JSDOM (only in browser environments)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

// Mock IntersectionObserver if it doesn't exist (for Node environment)
if (typeof global.IntersectionObserver === 'undefined') {
  global.IntersectionObserver = class IntersectionObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() { return null; }
    disconnect() { return null; }
    unobserve() { return null; }
  };
}

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock toast notifications
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock Web Crypto API for Edge Runtime compatibility
global.crypto = {
  subtle: {
    digest: jest.fn().mockImplementation(async (algorithm, data) => {
      // Mock SHA-256 digest for testing
      const encoder = new TextEncoder();
      const hashInput = typeof data === 'string' ? encoder.encode(data) : data;
      // Return a mock hash buffer (32 bytes for SHA-256)
      return new ArrayBuffer(32);
    }),
    importKey: jest.fn().mockImplementation(async (format, keyData, algorithm, extractable, keyUsages) => {
      // Mock key import for HMAC operations
      return { type: 'secret', algorithm, extractable, usages: keyUsages };
    }),
    sign: jest.fn().mockImplementation(async (algorithm, key, data) => {
      // Mock HMAC signature generation
      return new ArrayBuffer(32);
    }),
    verify: jest.fn().mockImplementation(async (algorithm, key, signature, data) => {
      // Mock signature verification (always return true for tests)
      return true;
    }),
    generateKey: jest.fn().mockImplementation(async (algorithm, extractable, keyUsages) => {
      // Mock key generation
      return { type: 'secret', algorithm, extractable, usages: keyUsages };
    })
  },
  getRandomValues: jest.fn().mockImplementation((array) => {
    // Mock random values generation
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  })
};

// Mock TextEncoder and TextDecoder for Edge Runtime compatibility
global.TextEncoder = global.TextEncoder || class TextEncoder {
  encode(string) {
    return new Uint8Array(Buffer.from(string, 'utf8'));
  }
};

global.TextDecoder = global.TextDecoder || class TextDecoder {
  decode(uint8Array) {
    return Buffer.from(uint8Array).toString('utf8');
  }
};

// Reset all mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
}); 