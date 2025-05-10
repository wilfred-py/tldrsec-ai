// This file sets up the testing environment for Jest

// Import Jest DOM extension for custom DOM matchers
import '@testing-library/jest-dom';
import crypto from 'crypto';

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    pathname: '/',
    events: {
      on: jest.fn(),
      off: jest.fn(),
    },
  })),
  usePathname: jest.fn(() => '/'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

// Mock nextjs/headers cookies function
jest.mock('next/headers', () => ({
  cookies: jest.fn().mockReturnValue({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  }),
}));

// Mock Next.js server module for API routes - we add this here even though
// we have the actual mock implementation in __mocks__ to ensure globals are defined early
if (typeof global.Request !== 'function') {
  global.Request = class Request {
    constructor(input, init = {}) {
      this.url = typeof input === 'string' ? input : input.url;
      this.method = init.method || 'GET';
      this.headers = new Headers(init.headers || {});
    }
  };
}

if (typeof global.Response !== 'function') {
  global.Response = class Response {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status || 200;
      this.ok = this.status >= 200 && this.status < 300;
    }
  
    json() {
      return Promise.resolve(JSON.parse(this.body));
    }
  };
}

if (typeof global.Headers !== 'function') {
  global.Headers = class Headers {
    constructor(init = {}) {
      this._headers = {};
      
      if (init) {
        Object.entries(init).forEach(([key, value]) => {
          this._headers[key.toLowerCase()] = value;
        });
      }
    }
  
    get(name) {
      return this._headers[name.toLowerCase()] || null;
    }
  
    set(name, value) {
      this._headers[name.toLowerCase()] = value;
    }
  };
}

// Mock global crypto API for tests
if (typeof global.crypto !== 'object') {
  global.crypto = {
    getRandomValues: (buffer) => {
      return crypto.randomFillSync(buffer);
    },
    subtle: {},
  };
}

// Define custom global variables
global.IS_REACT_ACT_ENVIRONMENT = true;

// Silence console messages during tests
console.error = jest.fn();
console.warn = jest.fn();

// Optional: silence specific warnings or setup other global testing configurations
jest.spyOn(console, 'warn').mockImplementation((message) => {
  // Ignore certain Next.js warnings
  if (message && message.includes('next')) return;
  // Let other warnings through
  console.warn(message);
});