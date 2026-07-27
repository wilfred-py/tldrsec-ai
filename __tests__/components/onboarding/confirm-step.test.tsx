import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmStep } from '@/components/onboarding/confirm-step';
import { NotificationPreference } from '@/lib/user/preference-types';

function defaults() {
  return {
    tickers: ['AAPL', 'MSFT'],
    emailFrequency: NotificationPreference.IMMEDIATE,
    onFrequencyChange: jest.fn(),
    onFinish: jest.fn(),
    onBack: jest.fn(),
    onZeroTickers: jest.fn(),
    isSubmitting: false,
  };
}

describe('ConfirmStep (final step — step4-polished)', () => {
  it('renders the prominent email promise heading and ticker pills', () => {
    render(<ConfirmStep {...defaults()} />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent ?? '').toMatch(/We'll email you when new filings are posted for/);
    expect(heading.textContent ?? '').toMatch(/2 companies/);
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
  });

  it('renders the singular form when exactly one ticker is selected', () => {
    render(<ConfirmStep {...defaults()} tickers={['AAPL']} />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent ?? '').toMatch(/1 company\b/);
    expect(heading.textContent ?? '').not.toMatch(/companies/);
  });

  it('hides the frequency radios by default and shows the current selection as text', () => {
    render(<ConfirmStep {...defaults()} />);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByText('Immediate')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Change/i })).toBeInTheDocument();
  });

  it('reveals the frequency radios when "Change" is clicked', async () => {
    const user = userEvent.setup();
    render(<ConfirmStep {...defaults()} />);
    await user.click(screen.getByRole('button', { name: /Change/i }));
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /Immediate/i })).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onFrequencyChange when the user picks a different option in the expanded panel', async () => {
    const user = userEvent.setup();
    const props = defaults();
    render(<ConfirmStep {...props} />);
    await user.click(screen.getByRole('button', { name: /Change/i }));
    await user.click(screen.getByRole('radio', { name: /Daily/i }));
    expect(props.onFrequencyChange).toHaveBeenCalledWith(
      NotificationPreference.DAILY
    );
  });

  it('calls onFinish when "Complete setup" is clicked', async () => {
    const user = userEvent.setup();
    const props = defaults();
    render(<ConfirmStep {...props} />);
    await user.click(screen.getByRole('button', { name: /Complete setup/i }));
    expect(props.onFinish).toHaveBeenCalledTimes(1);
  });

  it('calls onBack when "Back" is clicked', async () => {
    const user = userEvent.setup();
    const props = defaults();
    render(<ConfirmStep {...props} />);
    await user.click(screen.getByRole('button', { name: /Back/i }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it('disables "Complete setup" when 0 tickers and fires the zero-ticker guard once', () => {
    const props = { ...defaults(), tickers: [] };
    render(<ConfirmStep {...props} />);
    expect(props.onZeroTickers).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Complete setup/i })).toBeDisabled();
  });

  it('does not refire zero-ticker guard if tickers array remains empty across renders', () => {
    const props = { ...defaults(), tickers: [] };
    const { rerender } = render(<ConfirmStep {...props} />);
    rerender(<ConfirmStep {...props} />);
    rerender(<ConfirmStep {...props} />);
    expect(props.onZeroTickers).toHaveBeenCalledTimes(1);
  });

  it('renders the brand-blue CTA className on "Complete setup"', () => {
    render(<ConfirmStep {...defaults()} />);
    const cta = screen.getByRole('button', { name: /Complete setup/i });
    expect(cta.className).toMatch(/var\(--brand-primary\)/);
  });

  it('disables both CTAs while isSubmitting', () => {
    render(<ConfirmStep {...defaults()} isSubmitting />);
    expect(screen.getByRole('button', { name: /Saving/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Back/i })).toBeDisabled();
  });
});
