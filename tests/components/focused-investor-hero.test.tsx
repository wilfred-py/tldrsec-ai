/**
 * @jest-environment jsdom
 *
 * Tests for FocusedInvestorHero — the /waitlist hero component.
 *
 * Assertions import from `lib/landing/copy.ts` so future copy edits update
 * tests automatically. See landing-copy-rework decision 9A.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FocusedInvestorHero } from '@/components/landing/focused-investor-hero';
import { WAITLIST_HERO } from '@/lib/landing/copy';

// Mock the WaitlistForm — it has its own dedicated tests.
jest.mock('@/components/waitlist/waitlist-form', () => ({
  WaitlistForm: ({ onSuccess }: { onSuccess?: () => void }) => (
    <div data-testid="waitlist-form">
      <input
        type="email"
        placeholder="Enter your email to join the waitlist"
        data-testid="email-input"
      />
      <button type="submit" data-testid="submit-button" onClick={() => onSuccess?.()}>
        Join the Waitlist
      </button>
    </div>
  ),
}));

// Mock the counter — its API surface is tested separately.
jest.mock('@/components/landing/waitlist-counter', () => ({
  WaitlistCounter: ({ baseCount, realCount }: { baseCount?: number; realCount?: number }) => (
    <div data-testid="waitlist-counter" data-base-count={baseCount} data-real-count={realCount}>
      Join 251 investors already on the waitlist
    </div>
  ),
}));

// Mock floating elements — pure decoration.
jest.mock('@/components/landing/floating-elements', () => ({
  FloatingElements: () => <div data-testid="floating-elements" />,
}));

global.fetch = jest.fn();

describe('FocusedInvestorHero', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
  });

  describe('rendering', () => {
    it('renders the H1 from the copy module', () => {
      render(<FocusedInvestorHero />);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent(WAITLIST_HERO.h1.text);
    });

    it('renders the subhead from the copy module', () => {
      render(<FocusedInvestorHero />);
      // Subhead splits across spans — match the highlighted segment.
      expect(screen.getByText(WAITLIST_HERO.subhead.parts[0].text)).toBeInTheDocument();
    });

    it('mounts the WaitlistForm', () => {
      render(<FocusedInvestorHero />);
      expect(screen.getByTestId('waitlist-form')).toBeInTheDocument();
    });

    it('mounts the WaitlistCounter', () => {
      render(<FocusedInvestorHero />);
      expect(screen.getByTestId('waitlist-counter')).toBeInTheDocument();
    });

    it('forwards baseCount and realCount props to the counter', () => {
      render(<FocusedInvestorHero baseCount={42} realCount={100} />);
      const counter = screen.getByTestId('waitlist-counter');
      expect(counter).toHaveAttribute('data-base-count', '42');
      expect(counter).toHaveAttribute('data-real-count', '100');
    });
  });

  describe('frame sanity (Form-4 / insider-buying wedge)', () => {
    // Frame-sanity guard — the H1 must reflect the insider-buying wedge frame
    // (decision 7A). Catches a future revert that would silently pass the
    // constant-import assertions above.
    it('H1 references insider-buying as the wedge', () => {
      expect(WAITLIST_HERO.h1.text).toMatch(/insider/i);
    });

    it('subhead does NOT enumerate filing-type codes (decision 6A)', () => {
      // The product covers 30+ filing types; the subhead should describe
      // them in plain English, not list 4 codes.
      expect(WAITLIST_HERO.subhead.text).not.toMatch(/10-K.*10-Q.*8-K.*Form 4/);
    });
  });

  describe('accessibility', () => {
    it('uses a single H1 (proper heading hierarchy)', () => {
      render(<FocusedInvestorHero />);
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    });

    it('renders inside a <main> landmark', () => {
      const { container } = render(<FocusedInvestorHero />);
      expect(container.querySelector('main')).toBeInTheDocument();
    });

    it('email input is reachable as a form control', () => {
      render(<FocusedInvestorHero />);
      expect(screen.getByTestId('email-input')).toHaveAttribute('type', 'email');
    });
  });

  describe('integration', () => {
    it('renders without crashing when no props are passed', () => {
      expect(() => render(<FocusedInvestorHero />)).not.toThrow();
    });

    it('renders without crashing when only baseCount is passed', () => {
      expect(() => render(<FocusedInvestorHero baseCount={10} />)).not.toThrow();
    });

    it('does not throw on repeated re-renders', () => {
      const { rerender } = render(<FocusedInvestorHero />);
      expect(() => rerender(<FocusedInvestorHero baseCount={5} />)).not.toThrow();
      expect(() => rerender(<FocusedInvestorHero baseCount={10} realCount={20} />)).not.toThrow();
    });
  });
});
