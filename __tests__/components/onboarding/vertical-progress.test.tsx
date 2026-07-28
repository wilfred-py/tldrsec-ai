import React from 'react';
import { render, screen } from '@testing-library/react';
import { VerticalProgress } from '@/components/onboarding/vertical-progress';
import { ONBOARDING_STEPS } from '@/app/(auth)/onboarding/types';

describe('VerticalProgress — steps prop', () => {
  it('renders 4 steps when ONBOARDING_STEPS passed', () => {
    render(<VerticalProgress currentStep={1} steps={ONBOARDING_STEPS} />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('marks the active step with aria-current="step"', () => {
    render(<VerticalProgress currentStep={2} steps={ONBOARDING_STEPS} />);
    // Step 2 dot should have aria-current="step"
    const dots = document.querySelectorAll('[aria-current="step"]');
    expect(dots).toHaveLength(1);
  });

  it('shows step labels for each step', () => {
    render(<VerticalProgress currentStep={1} steps={ONBOARDING_STEPS} />);
    for (const step of ONBOARDING_STEPS) {
      expect(screen.getByText(step.label)).toBeInTheDocument();
    }
  });

  it('renders nav landmark for screen readers', () => {
    render(<VerticalProgress currentStep={1} />);
    expect(screen.getByRole('navigation', { name: /Onboarding progress/i })).toBeInTheDocument();
  });

  it('accepts custom step array', () => {
    const custom = [
      { label: 'Step A', key: 'a' },
      { label: 'Step B', key: 'b' },
    ] as const;
    render(<VerticalProgress currentStep={1} steps={custom} />);
    expect(screen.getByText('Step A')).toBeInTheDocument();
    expect(screen.getByText('Step B')).toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('hybrid: on the final step, all four step indicators show as completed (numbers replaced by checks)', () => {
    render(<VerticalProgress currentStep={4} steps={ONBOARDING_STEPS} />);
    // No raw step numbers should be visible — all four dots render the check icon.
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
    expect(screen.queryByText('4')).not.toBeInTheDocument();
    // Active marker still on the current step.
    const dots = document.querySelectorAll('[aria-current="step"]');
    expect(dots).toHaveLength(1);
  });

  it('hybrid: the final/active step keeps the active overlay ring', () => {
    render(<VerticalProgress currentStep={4} steps={ONBOARDING_STEPS} />);
    const activeDot = document.querySelector('[aria-current="step"]') as HTMLElement | null;
    expect(activeDot?.className).toMatch(/ring-2/);
  });
});
