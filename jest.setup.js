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
    startTimer: jest.fn().mockReturnValue('timer-id'),
    stopTimer: jest.fn(),
    registerHealthCheck: jest.fn(),
    getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
    setUnhealthy: jest.fn(),
    setHealthy: jest.fn()
  }
}), { virtual: true });

// Mock the logger
jest.mock('@/lib/logging', () => ({
  logger: {
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
  }
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

// Mock window methods that are not implemented in JSDOM
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

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor(callback) {
    this.callback = callback;
  }
  observe() { return null; }
  unobserve() { return null; }
  disconnect() { return null; }
};

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

// Reset all mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
}); 