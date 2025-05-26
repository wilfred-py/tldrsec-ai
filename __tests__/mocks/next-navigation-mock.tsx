// Mock router object for next/navigation
export const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  prefetch: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
};

// Mock useRouter hook
export const useRouter = jest.fn().mockReturnValue(mockRouter);

// Mock usePathname hook
export const usePathname = jest.fn().mockReturnValue('/onboarding');

// Reset mocks helper
export const resetNavigationMocks = () => {
  mockRouter.push.mockClear();
  mockRouter.replace.mockClear();
  mockRouter.prefetch.mockClear();
  mockRouter.back.mockClear();
  mockRouter.forward.mockClear();
  mockRouter.refresh.mockClear();
  useRouter.mockClear();
  usePathname.mockClear();
};

// Mock the Next.js navigation module
jest.mock('next/navigation', () => ({
  useRouter: () => useRouter(),
  usePathname: () => usePathname(),
})); 