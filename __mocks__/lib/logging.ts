// Mock Logger class
export class Logger {
  constructor(_config = {}, _name = '') {
    return this;
  }

  info = jest.fn();
  error = jest.fn();
  warn = jest.fn();
  debug = jest.fn();
  trace = jest.fn();
  fatal = jest.fn();
  child = jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn().mockReturnThis()
  }));
}

// Export a preconfigured logger instance
export const logger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn().mockReturnThis()
  }))
}; 