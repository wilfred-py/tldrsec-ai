'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { trackPageAnalytics } from '@/lib/analytics/page-tracking';
import { track } from '@vercel/analytics';

interface WaitlistFormProps {
  onSuccess?: () => void;
}

export function WaitlistForm({ onSuccess }: WaitlistFormProps = {}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'already_subscribed'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear any previous error messages
    setErrorMessage('');
    
    if (!email || email.trim() === '') {
      setErrorMessage('Please enter your email address');
      setStatus('error');
      return;
    }
    
    if (!email.includes('@') || !email.includes('.')) {
      setErrorMessage('Please enter a valid email address');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setErrorMessage('');

    // Track waitlist signup attempt
    await trackPageAnalytics('home', 'waitlist_signup_attempt', {
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
          source: 'waitlist_home',
          utm_source: new URLSearchParams(window.location.search).get('utm_source'),
          utm_medium: new URLSearchParams(window.location.search).get('utm_medium'),
          utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign'),
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        // Handle duplicate email specifically
        if (response.status === 409 && responseData.isAlreadySubscribed) {
          setStatus('already_subscribed');
          // Call parent success callback for already subscribed as well
          onSuccess?.();
          // Track analytics for duplicate attempt
          await trackPageAnalytics('home', 'waitlist_signup_duplicate');
          return;
        }
        throw new Error('Subscription failed');
      }

      setStatus('success');

      // Call parent success callback
      onSuccess?.();

      // Track successful waitlist signup
      await trackPageAnalytics('home', 'waitlist_signup_success');

      // Track waitlist conversion in Vercel Analytics
      track('Waitlist Signup', {
        source: 'waitlist_home',
        utm_source: new URLSearchParams(window.location.search).get('utm_source') || undefined,
        utm_medium: new URLSearchParams(window.location.search).get('utm_medium') || undefined,
        utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign') || undefined,
      });

    } catch (error) {
      setStatus('error');
      setErrorMessage('Something went wrong. Please try again.');
      console.error('Waitlist signup error:', error);
    }
  };

  if (status === 'success') {
    return (
      <Card className="border-green-200 bg-gradient-to-br from-green-50 to-blue-50 shadow-lg">
        <CardContent className="p-8 text-center">
          <div className="mb-6">
            {/* Enhanced success icon */}
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            
            <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200 mb-3">
              🎉 You&#39;re on the waitlist!
            </Badge>
          </div>
          
          <h3 className="text-xl font-semibold text-slate-900 mb-3">
            We&#39;ve sent you an email confirming your waitlist registration. 
          </h3>
          <p className="text-slate-600 mb-3">
            You&#39;ll be notified when the app launches.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (status === 'already_subscribed') {
    return (
      <Card className="border-yellow-200 bg-gradient-to-br from-yellow-50 to-orange-50 shadow-lg">
        <CardContent className="p-8 text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-yellow-600" />
            </div>
            
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-700 border-yellow-200 mb-3">
              📧 Already subscribed!
            </Badge>
          </div>
          
          <h3 className="text-xl font-semibold text-slate-900 mb-3">
            This email is already on our waitlist.
          </h3>
          <p className="text-slate-600 mb-3">
            You&apos;ll receive updates when the app launches.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Input
          type="email"
          placeholder="Enter your email to join the waitlist"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            // Clear error when user starts typing
            if (status === 'error') {
              setStatus('idle');
              setErrorMessage('');
            }
          }}
          className="h-14 text-lg bg-white border-2 border-gray-100 placeholder:text-slate-500 focus:border-blue-600 focus:ring-blue-600/20 rounded-xl shadow-sm"
          disabled={status === 'loading'}
          autoFocus
        />
        
        {errorMessage && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">{errorMessage}</AlertDescription>
          </Alert>
        )}
      </div>
      
      <Button 
        type="submit" 
        disabled={status === 'loading'}
        className="w-full h-14 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 shadow-lg hover:shadow-xl"
      >
        {status === 'loading' ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Securing your spot...
          </>
        ) : (
          <>
            Join the Waitlist
          </>
        )}
      </Button>
    </form>
  );
}