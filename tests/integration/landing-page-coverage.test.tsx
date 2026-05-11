/**
 * @jest-environment jsdom
 *
 * Integration coverage for the /waitlist landing page surface. Focuses on
 * what's actually testable cleanly:
 *   - Hero rendering (assertions import from copy module — see decision 9A)
 *   - Form submission flow (fetch is invoked with correct payload)
 *   - Heading hierarchy and form accessibility
 *   - UTM parameter tracking
 *   - Frame sanity (insider-buying wedge, no stale credit-rating terms)
 *
 * Older tests asserted on landing copy from 4+ versions ago — replaced in
 * the landing-copy-rework PR with the focused suite below.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { FocusedInvestorHero } from '@/components/landing/focused-investor-hero';
import { WaitlistForm } from '@/components/waitlist/waitlist-form';
import { WAITLIST_HERO } from '@/lib/landing/copy';

global.fetch = jest.fn();

Object.defineProperty(window, 'location', {
  value: {
    search: '?utm_source=test&utm_medium=social&utm_campaign=landing',
    href: 'https://tldrsec.app/?utm_source=test&utm_medium=social&utm_campaign=landing',
  },
  writable: true,
});

const localStorageMock = {
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock the floating elements + counter — pure decoration, tested elsewhere.
jest.mock('@/components/landing/floating-elements', () => ({
  FloatingElements: () => <div data-testid="floating-elements" />,
}));
jest.mock('@/components/landing/waitlist-counter', () => ({
  WaitlistCounter: () => <div data-testid="waitlist-counter">Join 251 investors</div>,
}));

describe('Landing /waitlist coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
  });

  describe('Hero rendering', () => {
    it('renders the H1 from the copy module', () => {
      render(<FocusedInvestorHero />);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent(WAITLIST_HERO.h1.text);
    });

    it('renders the subhead from the copy module', () => {
      render(<FocusedInvestorHero />);
      expect(screen.getByText(WAITLIST_HERO.subhead.parts[0].text)).toBeInTheDocument();
    });

    it('mounts the WaitlistForm', () => {
      render(<FocusedInvestorHero />);
      // The form's submit button is the canonical signal that the form mounted.
      expect(screen.getByRole('button', { name: /join the waitlist/i })).toBeInTheDocument();
    });

    it('mounts the WaitlistCounter', () => {
      render(<FocusedInvestorHero />);
      expect(screen.getByTestId('waitlist-counter')).toBeInTheDocument();
    });
  });

  describe('Form submission flow', () => {
    it('posts to /api/waitlist/subscribe with the entered email', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });
      const user = userEvent.setup();
      render(<WaitlistForm />);
      const input = screen.getByPlaceholderText(/enter your email/i);
      await user.type(input, 'test@example.com');
      await user.click(screen.getByRole('button', { name: /join the waitlist/i }));
      await waitFor(() => {
        expect(fetch).toHaveBeenCalled();
      });
      const [url, init] = (fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('/api/waitlist');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body).email).toBe('test@example.com');
    });

    it('does not submit without an email', async () => {
      const user = userEvent.setup();
      render(<WaitlistForm />);
      await user.click(screen.getByRole('button', { name: /join the waitlist/i }));
      // Native HTML5 validation prevents the submit; fetch is never called.
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('uses a single H1 (proper heading hierarchy)', () => {
      render(<FocusedInvestorHero />);
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    });

    it('email input is typed as email and has a placeholder', () => {
      render(<WaitlistForm />);
      const input = screen.getByPlaceholderText(/enter your email/i);
      expect(input).toHaveAttribute('type', 'email');
    });
  });

  describe('Frame sanity (Form-4 / insider-buying wedge)', () => {
    it('H1 references insider-buying as the wedge (decision 7A)', () => {
      expect(WAITLIST_HERO.h1.text).toMatch(/insider/i);
    });

    it('subhead does NOT enumerate filing-type codes (decision 6A)', () => {
      expect(WAITLIST_HERO.subhead.text).not.toMatch(/10-K.*10-Q.*8-K.*Form 4/);
    });

    it('no compliance-forbidden vocabulary in waitlist copy (decision 5A)', () => {
      const allCopy = WAITLIST_HERO.h1.text + ' ' + WAITLIST_HERO.subhead.text;
      expect(allCopy).not.toMatch(/investment[-\s]grade/i);
      expect(allCopy).not.toMatch(/investment\s+analyst/i);
      expect(allCopy).not.toMatch(/professional[-\s]grade/i);
      expect(allCopy).not.toMatch(/Wall\s+Street\s+analyst/i);
    });
  });
});
