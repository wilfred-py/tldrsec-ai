'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trackPageAnalytics } from '@/lib/analytics/page-tracking';
import { track } from '@vercel/analytics';

interface NewsletterFormProps {
  ctaText?: string;
}

export function NewsletterForm({ ctaText = 'Get Weekly Summaries' }: NewsletterFormProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'already-subscribed'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address');
      return;
    }

    setStatus('loading');
    setErrorMessage('');
    setSuccessMessage('');

    // Track signup attempt
    await trackPageAnalytics('newsletter', 'signup_attempt', {
      utm_source: new URLSearchParams(window.location.search).get('utm_source'),
      utm_medium: new URLSearchParams(window.location.search).get('utm_medium'),
      utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign'),
    });

    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          source: 'newsletter_page',
          utm_source: new URLSearchParams(window.location.search).get('utm_source'),
          utm_medium: new URLSearchParams(window.location.search).get('utm_medium'),
          utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign'),
        }),
      });

      const result = await response.json();

      // Handle duplicate email gracefully
      if (response.status === 409) {
        setStatus('already-subscribed');
        setSuccessMessage(result.message || 'This email is already subscribed to our newsletter.');

        // Track duplicate attempt
        await trackPageAnalytics('newsletter', 'signup_duplicate', {
          utm_source: new URLSearchParams(window.location.search).get('utm_source'),
        });
        return;
      }

      if (!response.ok) {
        throw new Error(result.message || 'Subscription failed');
      }

      setStatus('success');
      setSuccessMessage(result.message || 'Successfully subscribed!');

      // Track successful signup
      await trackPageAnalytics('newsletter', 'signup_success');

      // Track signup conversion in Vercel Analytics
      track('Newsletter Signup', {
        source: 'newsletter_page',
        utm_source: new URLSearchParams(window.location.search).get('utm_source') || undefined,
        utm_medium: new URLSearchParams(window.location.search).get('utm_medium') || undefined,
        utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign') || undefined,
      });

    } catch (error) {
      setStatus('error');
      setErrorMessage('Unable to subscribe at this time. Please try again later.');
      console.error('Newsletter signup error:', error);
    }
  };

  if (status === 'success') {
    return (
      <div className="text-center p-6">
        <div className="text-green-600 text-2xl mb-2">✓</div>
        <h3 className="text-lg font-semibold mb-2">{successMessage}</h3>
        <p className="text-gray-600">
          Check your email for a welcome message. Your first newsletter arrives next week.
        </p>
      </div>
    );
  }

  if (status === 'already-subscribed') {
    return (
      <div className="text-center p-6">
        <div className="text-blue-600 text-2xl mb-2">ℹ️</div>
        <h3 className="text-lg font-semibold mb-2">You&apos;re Already Subscribed!</h3>
        <p className="text-gray-600 mb-4">
          {successMessage || 'This email is already subscribed to our newsletter.'}
        </p>
        <p className="text-gray-600 mb-4">
          You will continue to receive our weekly newsletter every Sunday.
        </p>
        <Button
          onClick={() => {
            setStatus('idle');
            setEmail('');
            setSuccessMessage('');
          }}
          variant="outline"
          className="mt-2"
        >
          Try Another Email
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Input
          type="email"
          placeholder="Enter your email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="text-lg p-4"
          disabled={status === 'loading'}
        />
        {errorMessage && (
          <p className="text-red-600 text-sm mt-2">{errorMessage}</p>
        )}
      </div>
      
      <Button 
        type="submit" 
        disabled={status === 'loading'}
        className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white p-4 text-lg"
      >
        {status === 'loading' ? 'Subscribing...' : ctaText}
      </Button>
      
      <p className="text-xs text-gray-500 text-center">
        No spam. Unsubscribe anytime.
      </p>
    </form>
  );
}