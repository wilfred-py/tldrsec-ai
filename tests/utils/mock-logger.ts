/**
 * Mock logger for testing
 */
const mockLogFunction = jest.fn();

interface MockLogger {
  error: jest.Mock;
  warn: jest.Mock;
  info: jest.Mock;
  debug: jest.Mock;
  trace: jest.Mock;
  child: jest.Mock;
}

// Create mock logger instance with recursive child() method
const mockLoggerInstance: MockLogger = {
  error: mockLogFunction,
  warn: mockLogFunction,
  info: mockLogFunction,
  debug: mockLogFunction,
  trace: mockLogFunction,
  child: jest.fn()
};

// Set up recursive child() to return itself
mockLoggerInstance.child.mockReturnValue(mockLoggerInstance);

export const mockLogger = {
  child: jest.fn().mockReturnValue(mockLoggerInstance)
}; 