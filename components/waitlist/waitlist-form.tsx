'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Loader2, AlertCircle, Lock } from 'lucide-react';
import { trackPageAnalytics } from '@/lib/analytics/page-tracking';

export function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
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

      if (!response.ok) {
        throw new Error('Subscription failed');
      }

      const result = await response.json();
      setSuccessMessage(result.message || 'Successfully subscribed!');
      setStatus('success');
      
      // Track successful waitlist signup
      await trackPageAnalytics('home', 'waitlist_signup_success');

    } catch (error) {
      setStatus('error');
      setErrorMessage('Something went wrong. Please try again.');
      console.error('Waitlist signup error:', error);
    }
  };

  if (status === 'success') {
    return (
      <Card className="border-green-200 bg-green-50/50">
        <CardContent className="p-6 text-center">
          <div className="mb-4">
            <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
            <Badge variant="secondary" className="bg-green-100 text-green-800 mb-3">
              🎉 Welcome to Early Access
            </Badge>
          </div>
          
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            You&rsquo;re officially on the list!
          </h3>
          
          <p className="text-slate-600 text-sm mb-4">
            {successMessage.includes('already') 
              ? 'You were already subscribed. You\'ll continue to receive updates about your portfolio summaries.'
              : 'Check your email for confirmation. We\'ll notify you when your SEC filing summaries are ready.'
            }
          </p>
          
          <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-green-500" />
              <span>Value-focused</span>
            </div>
            <div className="flex items-center gap-1">
              <Lock className="w-3 h-3 text-blue-500" />
              <span>Secure & private</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Input
          type="email"
          placeholder="Enter your email for early access"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 text-lg bg-white border-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500"
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
        disabled={status === 'loading' || !email}
        className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold transition-all duration-200 disabled:opacity-50"
      >
        {status === 'loading' ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Securing your spot...
          </>
        ) : (
          <>
            <CheckCircle className="w-5 h-5 mr-2" />
            Get Business Insights
          </>
        )}
      </Button>
      
      <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
        <div className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3 text-green-500" />
          <span>Value-focused</span>
        </div>
        <div className="flex items-center gap-1">
          <Lock className="w-3 h-3 text-blue-500" />
          <span>Secure & private</span>
        </div>
      </div>
    </form>
  );
}