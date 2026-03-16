import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock Next.js Link
jest.mock('next/link', () => {
  return ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
});

import { PlanStatusBanner } from '@/components/dashboard/plan-status-banner';

describe('PlanStatusBanner', () => {
  it('should render trial banner with days remaining', () => {
    render(
      <PlanStatusBanner planType="FREE" daysRemaining={5} isTrialing={true} />
    );

    expect(screen.getByText(/5 days left in your/)).toBeInTheDocument();
    expect(screen.getByText(/trial/)).toBeInTheDocument();
    expect(screen.getByText(/Upgrade Now/)).toBeInTheDocument();
  });

  it('should show singular "day" when 1 day remaining', () => {
    render(
      <PlanStatusBanner planType="FREE" daysRemaining={1} isTrialing={true} />
    );

    expect(screen.getByText(/1 day left in your/)).toBeInTheDocument();
  });

  it('should not render for PRO users', () => {
    const { container } = render(
      <PlanStatusBanner planType="PRO" daysRemaining={5} isTrialing={false} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should not render for MAX users', () => {
    const { container } = render(
      <PlanStatusBanner planType="MAX" daysRemaining={5} isTrialing={false} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should not render for grandfathered users', () => {
    const { container } = render(
      <PlanStatusBanner planType="FREE" daysRemaining={5} isTrialing={true} isGrandfathered={true} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should show expired banner when trial ended', () => {
    render(
      <PlanStatusBanner planType="FREE" daysRemaining={0} isTrialing={false} />
    );

    expect(screen.getByText(/trial has ended/)).toBeInTheDocument();
    expect(screen.getByText(/Upgrade Now/)).toBeInTheDocument();
  });

  it('should always use green for active trials regardless of days remaining', () => {
    const { container: container1 } = render(
      <PlanStatusBanner planType="FREE" daysRemaining={1} isTrialing={true} />
    );
    expect(container1.firstChild).toHaveClass('bg-emerald-100');

    const { container: container2 } = render(
      <PlanStatusBanner planType="FREE" daysRemaining={7} isTrialing={true} />
    );
    expect(container2.firstChild).toHaveClass('bg-emerald-100');
  });

  it('should always link to /subscribe', () => {
    render(
      <PlanStatusBanner planType="FREE" daysRemaining={5} isTrialing={true} />
    );

    const link = screen.getByText(/Upgrade Now/).closest('a');
    expect(link).toHaveAttribute('href', '/subscribe');
  });

  it('should link to /subscribe for expired trials', () => {
    render(
      <PlanStatusBanner planType="FREE" daysRemaining={0} isTrialing={false} />
    );

    const link = screen.getByText(/Upgrade Now/).closest('a');
    expect(link).toHaveAttribute('href', '/subscribe');
  });

  it('should use "trial" not "free trial" in banner text', () => {
    render(
      <PlanStatusBanner planType="FREE" daysRemaining={5} isTrialing={true} />
    );

    const bannerText = screen.getByText(/left in your/);
    expect(bannerText.textContent).not.toContain('free trial');
    expect(bannerText.textContent).toContain('trial');
  });
});
