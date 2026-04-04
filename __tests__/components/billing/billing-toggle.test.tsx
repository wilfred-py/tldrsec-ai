import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BillingToggle } from '@/components/billing/billing-toggle';

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    span: React.forwardRef(({ children, animate, transition, ...props }: any, ref: any) => (
      <span ref={ref} {...props}>{children}</span>
    )),
  },
}));

describe('BillingToggle', () => {
  it('renders with monthly state', () => {
    render(
      <BillingToggle billingInterval="monthly" onToggle={jest.fn()} />
    );
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Save with yearly billing')).toBeInTheDocument();
  });

  it('renders with annual state', () => {
    render(
      <BillingToggle billingInterval="annual" onToggle={jest.fn()} />
    );
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onToggle when clicked', () => {
    const onToggle = jest.fn();
    render(
      <BillingToggle billingInterval="monthly" onToggle={onToggle} />
    );
    fireEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('does not call onToggle when disabled', () => {
    const onToggle = jest.fn();
    render(
      <BillingToggle billingInterval="monthly" onToggle={onToggle} disabled />
    );
    const toggle = screen.getByRole('switch');
    expect(toggle).toBeDisabled();
    fireEvent.click(toggle);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('shows correct aria-label for monthly state', () => {
    render(
      <BillingToggle billingInterval="monthly" onToggle={jest.fn()} />
    );
    expect(screen.getByRole('switch')).toHaveAttribute(
      'aria-label',
      'Switch to annual billing'
    );
  });

  it('shows correct aria-label for annual state', () => {
    render(
      <BillingToggle billingInterval="annual" onToggle={jest.fn()} />
    );
    expect(screen.getByRole('switch')).toHaveAttribute(
      'aria-label',
      'Switch to monthly billing'
    );
  });
});
