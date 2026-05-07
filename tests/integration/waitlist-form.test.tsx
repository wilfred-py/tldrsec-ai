/**
 * @jest-environment jsdom
 *
 * Integration tests for WaitlistForm. Focuses on the contract that matters
 * downstream: the API call payload, the success/already-subscribed/error
 * surfaces, and accessibility.
 *
 * Older assertions referenced pre-rewrite copy ("Get Business Insights",
 * "Value-focused", "continue to receive updates") and have been replaced
 * with the current-state assertions below. See landing-copy-rework.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { WaitlistForm } from '@/components/waitlist/waitlist-form';

global.fetch = jest.fn();

Object.defineProperty(window, 'location', {
  value: {
    search: '?utm_source=test&utm_medium=social&utm_campaign=launch',
    href: 'https://tldrsec.app/?utm_source=test&utm_medium=social&utm_campaign=launch',
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

describe('WaitlistForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetch as jest.Mock).mockClear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
  });

  describe('rendering', () => {
    it('renders the email input and submit button', () => {
      render(<WaitlistForm />);
      expect(screen.getByRole('textbox')).toHaveAttribute('type', 'email');
      expect(screen.getByRole('button', { name: /join the waitlist/i })).toBeInTheDocument();
    });

    it('email input has the current placeholder', () => {
      render(<WaitlistForm />);
      expect(screen.getByPlaceholderText(/enter your email to join the waitlist/i)).toBeInTheDocument();
    });
  });

  describe('submission flow', () => {
    it('posts to the waitlist API with the entered email', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'Successfully subscribed!' }),
      });
      const user = userEvent.setup();
      render(<WaitlistForm />);
      await user.type(screen.getByRole('textbox'), 'test@example.com');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /join the waitlist/i }));
      });
      await waitFor(() => expect(fetch).toHaveBeenCalled());
      const [url, init] = (fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('/api/waitlist');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body.email).toBe('test@example.com');
    });

    it('does not submit without an email (HTML5 required validation)', async () => {
      const user = userEvent.setup();
      render(<WaitlistForm />);
      await user.click(screen.getByRole('button', { name: /join the waitlist/i }));
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('success state', () => {
    it('renders the confirmation card on successful subscription', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });
      const user = userEvent.setup();
      render(<WaitlistForm />);
      await user.type(screen.getByRole('textbox'), 'test@example.com');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /join the waitlist/i }));
      });
      await waitFor(() => {
        expect(screen.getByText(/you're on the waitlist/i)).toBeInTheDocument();
        expect(screen.getByText(/notified when the app launches/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('renders the already-subscribed card on duplicate submission', async () => {
      // The form keys off HTTP 409 + response body's isAlreadySubscribed flag.
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ isAlreadySubscribed: true }),
      });
      const user = userEvent.setup();
      render(<WaitlistForm />);
      await user.type(screen.getByRole('textbox'), 'existing@example.com');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /join the waitlist/i }));
      });
      await waitFor(() => {
        expect(screen.getByText(/already subscribed/i)).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('error handling', () => {
    it('does not crash when the API returns an error', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'server error' }),
      });
      const user = userEvent.setup();
      render(<WaitlistForm />);
      await user.type(screen.getByRole('textbox'), 'test@example.com');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /join the waitlist/i }));
      });
      // Form should still be present (no unhandled rejection or crash).
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /join the waitlist/i })).toBeInTheDocument();
      }, { timeout: 3000 });
    });

    it('does not crash when the network rejects', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
      const user = userEvent.setup();
      render(<WaitlistForm />);
      await user.type(screen.getByRole('textbox'), 'test@example.com');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /join the waitlist/i }));
      });
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /join the waitlist/i })).toBeInTheDocument();
      }, { timeout: 3000 });
    });
  });

  describe('accessibility', () => {
    it('email input is reachable and typed correctly', () => {
      render(<WaitlistForm />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('type', 'email');
    });

    it('submit button is reachable as a button role', () => {
      render(<WaitlistForm />);
      expect(screen.getByRole('button', { name: /join the waitlist/i })).toBeInTheDocument();
    });
  });
});
