// Mock Monitoring
export const monitoring = {
  incrementCounter: jest.fn(),
  recordValue: jest.fn(),
  recordTiming: jest.fn(),
  startTimer: jest.fn().mockReturnValue('timer-id'),
  stopTimer: jest.fn(),
  registerHealthCheck: jest.fn(),
  getHealth: jest.fn().mockResolvedValue({ status: 'healthy' }),
  setUnhealthy: jest.fn(),
  setHealthy: jest.fn()
};

export default monitoring; 