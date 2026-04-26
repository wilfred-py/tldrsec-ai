import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmStep } from '@/components/onboarding/confirm-step';
import { NotificationPreference } from '@/lib/email/notification-types';

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

describe('ConfirmStep (Variant A — step 4)', () => {
  it('renders the email promise heading and ticker pills', () => {
    render(<ConfirmStep {...defaults()} />);
    expect(
      screen.getByRole('heading', {
        name: "We'll email you when new filings are posted for 2 companies.",
      })
    ).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
  });

  it('renders three frequency radios with one checked', () => {
    render(<ConfirmStep {...defaults()} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    const immediate = screen.getByRole('radio', { name: /Immediate/i });
    expect(immediate).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onFrequencyChange when the user picks a different option', async () => {
    const user = userEvent.setup();
    const props = defaults();
    render(<ConfirmStep {...props} />);
    await user.click(screen.getByRole('radio', { name: /Daily/i }));
    expect(props.onFrequencyChange).toHaveBeenCalledWith(
      NotificationPreference.DAILY
    );
  });

  it('calls onFinish when "Start tracking" is clicked', async () => {
    const user = userEvent.setup();
    const props = defaults();
    render(<ConfirmStep {...props} />);
    await user.click(screen.getByRole('button', { name: /Start tracking/i }));
    expect(props.onFinish).toHaveBeenCalledTimes(1);
  });

  it('calls onBack when "Back" is clicked', async () => {
    const user = userEvent.setup();
    const props = defaults();
    render(<ConfirmStep {...props} />);
    await user.click(screen.getByRole('button', { name: /Back/i }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it('disables "Start tracking" when 0 tickers and fires the zero-ticker guard once', () => {
    const props = { ...defaults(), tickers: [] };
    render(<ConfirmStep {...props} />);
    expect(props.onZeroTickers).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Start tracking/i })).toBeDisabled();
  });

  it('does not refire zero-ticker guard if tickers array remains empty across renders', () => {
    const props = { ...defaults(), tickers: [] };
    const { rerender } = render(<ConfirmStep {...props} />);
    rerender(<ConfirmStep {...props} />);
    rerender(<ConfirmStep {...props} />);
    expect(props.onZeroTickers).toHaveBeenCalledTimes(1);
  });

  it('disables both CTAs while isSubmitting', () => {
    render(<ConfirmStep {...defaults()} isSubmitting />);
    expect(screen.getByRole('button', { name: /Saving/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Back/i })).toBeDisabled();
  });
});
