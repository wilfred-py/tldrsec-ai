/**
 * Tests for the OnboardingFallbackNoticeTemplate React component.
 *
 * Tests the template directly via @testing-library/react instead of going
 * through @react-email/render — that path uses dynamic import and requires
 * --experimental-vm-modules in jest. Direct render is sufficient: it proves
 * the JSX produces the expected text content. The `renderAsync` integration
 * is exercised by the production email send path and verified via the live
 * E2E test in scripts/test-deliver-first-onboarding-email.ts.
 */
import { render } from '@testing-library/react';
import { OnboardingFallbackNoticeTemplate } from '@/components/ui/email/templates/onboarding-fallback-notice-template';

describe('OnboardingFallbackNoticeTemplate', () => {
  const baseData = {
    recipientName: 'Wilfred',
    trackedTickers: ['AAPL', 'MSFT', 'NVDA'],
    dashboardUrl: 'https://tldrsec.app/dashboard',
    unsubscribeUrl: 'https://tldrsec.app/dashboard/settings',
  };

  it('renders ticker list comma-separated', () => {
    const { getByText } = render(
      <OnboardingFallbackNoticeTemplate data={baseData} />
    );
    // headline includes tickers
    expect(getByText(/We.re watching AAPL, MSFT, NVDA/)).toBeInTheDocument();
  });

  it('renders the recipient name', () => {
    const { getByText } = render(
      <OnboardingFallbackNoticeTemplate data={baseData} />
    );
    expect(getByText(/Hi Wilfred/)).toBeInTheDocument();
  });

  it('renders the dashboard CTA link', () => {
    const { getByRole } = render(
      <OnboardingFallbackNoticeTemplate data={baseData} />
    );
    const link = getByRole('link', { name: /Open your dashboard/ });
    expect(link).toHaveAttribute('href', 'https://tldrsec.app/dashboard');
  });

  it('renders the unsubscribe link when provided', () => {
    const { getAllByRole } = render(
      <OnboardingFallbackNoticeTemplate data={baseData} />
    );
    const links = getAllByRole('link');
    const unsubLink = links.find(
      (l) => l.getAttribute('href') === 'https://tldrsec.app/dashboard/settings'
    );
    expect(unsubLink).toBeDefined();
  });

  it('falls back to "your tracked tickers" when trackedTickers is empty', () => {
    const { getByText } = render(
      <OnboardingFallbackNoticeTemplate
        data={{ ...baseData, trackedTickers: [] }}
      />
    );
    expect(getByText(/We.re watching your tracked tickers/)).toBeInTheDocument();
  });

  it('falls back to default unsubscribe URL when not provided', () => {
    const { getAllByRole } = render(
      <OnboardingFallbackNoticeTemplate
        data={{
          recipientName: 'Wilfred',
          trackedTickers: ['AAPL'],
          dashboardUrl: 'https://tldrsec.app/dashboard',
          // unsubscribeUrl omitted
        }}
      />
    );
    const links = getAllByRole('link');
    // EMAIL_PREFERENCES_URL fallback per template
    const settingsLink = links.find((l) =>
      l.getAttribute('href')?.includes('settings')
    );
    expect(settingsLink).toBeDefined();
  });
});
