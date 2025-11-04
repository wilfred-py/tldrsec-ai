'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trackPageAnalytics } from '@/lib/analytics/page-tracking';

interface NewsletterFormProps {
  ctaText?: string;
}

export function NewsletterForm({ ctaText = 'Get Weekly Summaries' }: NewsletterFormProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
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

      if (!response.ok) {
        throw new Error('Subscription failed');
      }

      const result = await response.json();
      setStatus('success');
      setSuccessMessage(result.message || 'Successfully subscribed!');
      
      // Track successful signup
      await trackPageAnalytics('newsletter', 'signup_success');

    } catch (error) {
      setStatus('error');
      setErrorMessage('Something went wrong. Please try again.');
      console.error('Newsletter signup error:', error);
    }
  };

  if (status === 'success') {
    return (
      <div className="text-center p-6">
        <div className="text-green-600 text-2xl mb-2">✓</div>
        <h3 className="text-lg font-semibold mb-2">{successMessage}</h3>
        <p className="text-gray-600">
          {successMessage.includes('already') 
            ? 'You will continue to receive our weekly newsletter.'
            : 'Check your email for a welcome message. Your first newsletter arrives next week.'
          }
        </p>
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