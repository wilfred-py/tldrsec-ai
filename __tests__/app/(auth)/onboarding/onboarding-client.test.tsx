/**
 * Integration-level smoke tests for the OnboardingPage orchestrator.
 *
 * Focuses on the A/B branching logic introduced in this branch:
 * - handleProfileComplete: routes to step 4 (Variant A) vs submits (Variant B)
 * - handleZeroTickers: shows toast and resets to Companies step
 * - Variant skeleton guard: shows loader when !resolved
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---- Server action mock ----
// jest.mock is hoisted — factory must not reference const bindings declared below.
jest.mock('@/app/(auth)/onboarding/actions', () => ({
  completeOnboardingBatched: jest.fn(),
}));

// ---- Toast mock ----
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));

// ---- Auth context ----
const mockUseAuthContext = jest.fn();
jest.mock('@/lib/context/auth-context', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

// ---- Clerk ----
jest.mock('@clerk/nextjs', () => ({ useSession: () => ({ session: null }) }));

// ---- Analytics ----
jest.mock('@/lib/hooks/use-analytics', () => ({
  useAnalytics: () => ({ trackEvent: jest.fn(), identifyUser: jest.fn() }),
}));

// ---- Variant hook ----
const mockUseOnboardingVariant = jest.fn();
jest.mock('@/lib/hooks/use-onboarding-variant', () => ({
  useOnboardingVariant: (userId: string) => mockUseOnboardingVariant(userId),
}));

// ---- Child component stubs ----
jest.mock('@/components/onboarding/sector-step', () => ({
  SectorStep: ({ onContinue }: { onContinue: () => void }) => (
    <button onClick={onContinue} data-testid="sector-continue">Sectors Next</button>
  ),
}));
jest.mock('@/components/onboarding/company-step', () => ({
  CompanyStep: ({ onContinue, onBack }: { onContinue: () => void; onBack: () => void }) => (
    <div>
      <button onClick={onBack} data-testid="company-back">Back</button>
      <button onClick={onContinue} data-testid="company-continue">Companies Next</button>
    </div>
  ),
}));
jest.mock('@/components/onboarding/profile-step', () => ({
  ProfileStep: ({ onComplete, onBack, onRoleChange }: {
    onComplete: (p: { role: string }) => void;
    onBack: () => void;
    onRoleChange?: (role: string) => void;
  }) => (
    <div>
      <button onClick={onBack} data-testid="profile-back">Back</button>
      <button
        onClick={() => {
          onRoleChange?.('personal-investor');
          onComplete({ role: 'personal-investor' });
        }}
        data-testid="profile-complete"
      >
        Complete Profile
      </button>
    </div>
  ),
}));
jest.mock('@/components/onboarding/confirm-step', () => ({
  ConfirmStep: ({ onFinish, onBack, onZeroTickers }: {
    onFinish: () => void;
    onBack: () => void;
    onZeroTickers: () => void;
  }) => (
    <div>
      <button onClick={onBack} data-testid="confirm-back">Back</button>
      <button onClick={onFinish} data-testid="confirm-finish">Finish</button>
      <button onClick={onZeroTickers} data-testid="confirm-zero">Zero Tickers</button>
    </div>
  ),
}));
jest.mock('@/components/onboarding/inline-email-notice', () => ({
  InlineEmailNotice: () => <div data-testid="inline-notice" />,
}));
jest.mock('@/components/onboarding/onboarding-transition', () => ({
  OnboardingTransition: () => <div data-testid="onboarding-transition" />,
}));
jest.mock('@/components/onboarding/vertical-progress', () => ({
  VerticalProgress: () => <nav aria-label="progress" />,
}));

// ---- Import after mocks ----
import OnboardingPage from '@/app/(auth)/onboarding/onboarding-client';
import { completeOnboardingBatched } from '@/app/(auth)/onboarding/actions';
import { toast } from 'sonner';

const mockCompleteOnboarding = completeOnboardingBatched as jest.Mock;
const mockToastError = toast.error as jest.Mock;

function readyAuth() {
  mockUseAuthContext.mockReturnValue({
    isLoading: false,
    userId: 'user_123',
    userEmail: 'test@example.com',
    userName: 'Test User',
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCompleteOnboarding.mockResolvedValue({ success: true });
});

// Step transitions use setTimeout(fn, 300). Use real timers with waitFor(timeout) to advance.
const STEP_TIMEOUT = { timeout: 1500 };

describe('OnboardingPage — variant skeleton guard', () => {
  it('shows loading spinner when variant not yet resolved', () => {
    readyAuth();
    mockUseOnboardingVariant.mockReturnValue({ variant: null, resolved: false });
    render(<OnboardingPage />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    expect(screen.queryByTestId('sector-continue')).not.toBeInTheDocument();
  });

  it('shows wizard once variant resolves', () => {
    readyAuth();
    mockUseOnboardingVariant.mockReturnValue({ variant: 'inline', resolved: true });
    render(<OnboardingPage />);
    expect(screen.getByTestId('sector-continue')).toBeInTheDocument();
  });
});

describe('OnboardingPage — Variant B (inline, 3 steps)', () => {
  beforeEach(() => {
    readyAuth();
    mockUseOnboardingVariant.mockReturnValue({ variant: 'inline', resolved: true });
  });

  it('handleProfileComplete submits directly — does NOT advance to step 4', async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.click(screen.getByTestId('sector-continue'));
    await waitFor(() => screen.getByTestId('company-continue'), STEP_TIMEOUT);
    await user.click(screen.getByTestId('company-continue'));
    await waitFor(() => screen.getByTestId('profile-complete'), STEP_TIMEOUT);
    await user.click(screen.getByTestId('profile-complete'));

    await waitFor(() => expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1), STEP_TIMEOUT);
    expect(screen.queryByTestId('confirm-finish')).not.toBeInTheDocument();
  });
});

describe('OnboardingPage — Variant A (step4, 4 steps)', () => {
  beforeEach(() => {
    readyAuth();
    mockUseOnboardingVariant.mockReturnValue({ variant: 'step4', resolved: true });
  });

  it('handleProfileComplete advances to ConfirmStep — no submit yet', async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.click(screen.getByTestId('sector-continue'));
    await waitFor(() => screen.getByTestId('company-continue'), STEP_TIMEOUT);
    await user.click(screen.getByTestId('company-continue'));
    await waitFor(() => screen.getByTestId('profile-complete'), STEP_TIMEOUT);
    await user.click(screen.getByTestId('profile-complete'));

    // Step 4 visible, no submit yet
    await waitFor(() => screen.getByTestId('confirm-finish'), STEP_TIMEOUT);
    expect(mockCompleteOnboarding).not.toHaveBeenCalled();
  });

  it('handleConfirmFinish submits on Finish click', async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.click(screen.getByTestId('sector-continue'));
    await waitFor(() => screen.getByTestId('company-continue'), STEP_TIMEOUT);
    await user.click(screen.getByTestId('company-continue'));
    await waitFor(() => screen.getByTestId('profile-complete'), STEP_TIMEOUT);
    await user.click(screen.getByTestId('profile-complete'));
    await waitFor(() => screen.getByTestId('confirm-finish'), STEP_TIMEOUT);
    await user.click(screen.getByTestId('confirm-finish'));

    await waitFor(() => expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1), STEP_TIMEOUT);
  });
});

describe('OnboardingPage — handleZeroTickers', () => {
  beforeEach(() => {
    readyAuth();
    mockUseOnboardingVariant.mockReturnValue({ variant: 'step4', resolved: true });
  });

  it('shows toast and navigates back to Companies step', async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

    await user.click(screen.getByTestId('sector-continue'));
    await waitFor(() => screen.getByTestId('company-continue'), STEP_TIMEOUT);
    await user.click(screen.getByTestId('company-continue'));
    await waitFor(() => screen.getByTestId('profile-complete'), STEP_TIMEOUT);
    await user.click(screen.getByTestId('profile-complete'));
    await waitFor(() => screen.getByTestId('confirm-zero'), STEP_TIMEOUT);
    await user.click(screen.getByTestId('confirm-zero'));

    expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/at least one ticker/i));
    await waitFor(() => screen.getByTestId('company-continue'), STEP_TIMEOUT);
  });
});
