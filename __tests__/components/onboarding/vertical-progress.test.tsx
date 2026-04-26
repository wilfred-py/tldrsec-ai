import React from 'react';
import { render, screen } from '@testing-library/react';
import { VerticalProgress } from '@/components/onboarding/vertical-progress';
import { ONBOARDING_STEPS_BASE, ONBOARDING_STEPS_WITH_CONFIRM } from '@/app/(auth)/onboarding/types';

describe('VerticalProgress — steps prop', () => {
  it('renders 3 steps by default (Variant B)', () => {
    render(<VerticalProgress currentStep={1} />);
    // Each step renders a numbered indicator; step 1, 2, 3
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.queryByText('4')).not.toBeInTheDocument();
  });

  it('renders 4 steps when ONBOARDING_STEPS_WITH_CONFIRM passed (Variant A)', () => {
    render(<VerticalProgress currentStep={1} steps={ONBOARDING_STEPS_WITH_CONFIRM} />);
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('marks the active step with aria-current="step"', () => {
    render(<VerticalProgress currentStep={2} steps={ONBOARDING_STEPS_BASE} />);
    // Step 2 dot should have aria-current="step"
    const dots = document.querySelectorAll('[aria-current="step"]');
    expect(dots).toHaveLength(1);
  });

  it('shows step labels for each base step', () => {
    render(<VerticalProgress currentStep={1} steps={ONBOARDING_STEPS_BASE} />);
    for (const step of ONBOARDING_STEPS_BASE) {
      expect(screen.getByText(step.label)).toBeInTheDocument();
    }
  });

  it('shows all 4 labels for ONBOARDING_STEPS_WITH_CONFIRM', () => {
    render(<VerticalProgress currentStep={1} steps={ONBOARDING_STEPS_WITH_CONFIRM} />);
    for (const step of ONBOARDING_STEPS_WITH_CONFIRM) {
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
});
