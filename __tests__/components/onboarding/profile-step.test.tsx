import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileStep } from '@/components/onboarding/profile-step';
import type { UserRole, AumBracket } from '@/components/onboarding/profile-step';

function defaults() {
  return {
    subStep: 1 as const,
    onSubStepChange: jest.fn(),
    selectedRole: null as UserRole | null,
    onRoleChange: jest.fn(),
    customRoleText: '',
    onCustomRoleChange: jest.fn(),
    selectedAum: null as AumBracket | null,
    onAumChange: jest.fn(),
    onComplete: jest.fn(),
    onBack: jest.fn(),
    isSubmitting: false,
    isTransitioning: false,
  };
}

describe('ProfileStep — lifted state props', () => {
  it('renders role question on subStep 1', () => {
    render(<ProfileStep {...defaults()} />);
    expect(screen.getByText(/What best describes your role/i)).toBeInTheDocument();
    expect(screen.queryByText(/AUM/i)).not.toBeInTheDocument();
  });

  it('renders AUM question on subStep 2', () => {
    render(<ProfileStep {...defaults()} subStep={2} selectedRole="personal-investor" />);
    expect(screen.getByText(/approximate AUM/i)).toBeInTheDocument();
    expect(screen.queryByText(/What best describes your role/i)).not.toBeInTheDocument();
  });

  it('Next button disabled when no role selected on subStep 1', () => {
    render(<ProfileStep {...defaults()} />);
    expect(screen.getByRole('button', { name: /Next/i })).toBeDisabled();
  });

  it('Next button enabled after role selected', () => {
    render(<ProfileStep {...defaults()} selectedRole="personal-investor" />);
    expect(screen.getByRole('button', { name: /Next/i })).not.toBeDisabled();
  });

  it('calls onRoleChange when a role is clicked', async () => {
    const user = userEvent.setup();
    const props = defaults();
    render(<ProfileStep {...props} />);
    await user.click(screen.getByRole('button', { name: /Personal \/ Retail Investor/i }));
    expect(props.onRoleChange).toHaveBeenCalledWith('personal-investor');
  });

  it('calls onSubStepChange(2) when Next is clicked with role selected', async () => {
    const user = userEvent.setup();
    const props = defaults();
    render(<ProfileStep {...props} selectedRole="personal-investor" />);
    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(props.onSubStepChange).toHaveBeenCalledWith(2);
  });

  it('Back on subStep 1 calls onBack (goes to previous wizard step)', async () => {
    const user = userEvent.setup();
    const props = defaults();
    render(<ProfileStep {...props} />);
    await user.click(screen.getByRole('button', { name: /Back/i }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
    expect(props.onSubStepChange).not.toHaveBeenCalled();
  });

  it('Back on subStep 2 calls onSubStepChange(1) instead of onBack', async () => {
    const user = userEvent.setup();
    const props = defaults();
    render(<ProfileStep {...props} subStep={2} selectedRole="personal-investor" />);
    await user.click(screen.getByRole('button', { name: /Back/i }));
    expect(props.onSubStepChange).toHaveBeenCalledWith(1);
    expect(props.onBack).not.toHaveBeenCalled();
  });

  it('calls onAumChange when an AUM bracket is clicked', async () => {
    const user = userEvent.setup();
    const props = defaults();
    render(<ProfileStep {...props} subStep={2} selectedRole="personal-investor" />);
    await user.click(screen.getByRole('button', { name: /Under \$100K/i }));
    expect(props.onAumChange).toHaveBeenCalledWith('under-100k');
  });

  it('calls onComplete with role + aumBracket when Complete Setup clicked', async () => {
    const user = userEvent.setup();
    const props = defaults();
    render(<ProfileStep {...props} subStep={2} selectedRole="financial-advisor" selectedAum="1m-5m" />);
    await user.click(screen.getByRole('button', { name: /Complete Setup/i }));
    expect(props.onComplete).toHaveBeenCalledWith({
      role: 'financial-advisor',
      aumBracket: '1m-5m',
      customRoleText: undefined,
    });
  });

  it('renders inlineDisclosure slot on subStep 2 when provided (Variant B)', () => {
    const disclosure = <div data-testid="inline-disclosure">Email notice here</div>;
    render(
      <ProfileStep
        {...defaults()}
        subStep={2}
        selectedRole="personal-investor"
        inlineDisclosure={disclosure}
      />
    );
    expect(screen.getByTestId('inline-disclosure')).toBeInTheDocument();
  });

  it('does NOT render inlineDisclosure on subStep 1 even when provided', () => {
    const disclosure = <div data-testid="inline-disclosure">Email notice here</div>;
    render(<ProfileStep {...defaults()} subStep={1} inlineDisclosure={disclosure} />);
    expect(screen.queryByTestId('inline-disclosure')).not.toBeInTheDocument();
  });

  it('Complete Setup disabled while isSubmitting', () => {
    render(
      <ProfileStep
        {...defaults()}
        subStep={2}
        selectedRole="personal-investor"
        isSubmitting
      />
    );
    expect(screen.getByRole('button', { name: /Saving/i })).toBeDisabled();
  });
});
