// Mock NextResponse and NextRequest for testing
class NextResponse {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status || 200;
    this.headers = init.headers || {};
  }

  static json(data, init = {}) {
    const response = new NextResponse(JSON.stringify(data), init);
    return response;
  }

  json() {
    return Promise.resolve(JSON.parse(this.body));
  }
}

class NextRequest {
  constructor(input, init = {}) {
    this.url = typeof input === 'string' ? input : input.url;
    this.method = init.method || 'GET';
    this.headers = new Headers(init.headers || {});
    this.cookies = {
      get: jest.fn().mockReturnValue(null),
      getAll: jest.fn().mockReturnValue([]),
      has: jest.fn().mockReturnValue(false),
    };
  }

  json() {
    return Promise.resolve({});
  }
}

// Define these classes globally to prevent "not defined" errors
global.Request = class Request {
  constructor(input, init = {}) {
    this.url = typeof input === 'string' ? input : input.url;
    this.method = init.method || 'GET';
    this.headers = new Headers(init.headers || {});
  }
};

global.Response = class Response {
  constructor(body, init = {}) {
    this.body = body;
    this.status = init.status || 200;
    this.ok = this.status >= 200 && this.status < 300;
    this.headers = new Headers(init.headers || {});
  }

  json() {
    return Promise.resolve(JSON.parse(this.body));
  }
};

global.Headers = class Headers {
  constructor(init = {}) {
    this._headers = new Map();
    
    if (init) {
      Object.entries(init).forEach(([key, value]) => {
        this.set(key, value);
      });
    }
  }

  get(name) {
    return this._headers.get(name.toLowerCase()) || null;
  }

  set(name, value) {
    this._headers.set(name.toLowerCase(), value);
  }

  has(name) {
    return this._headers.has(name.toLowerCase());
  }

  delete(name) {
    this._headers.delete(name.toLowerCase());
  }
};

// Export the mocks
module.exports = {
  NextResponse,
  NextRequest,
  auth: jest.fn().mockReturnValue({ userId: 'mock-user-id' }),
};