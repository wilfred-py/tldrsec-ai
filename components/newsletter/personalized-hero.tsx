'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PersonalizedContent, UserContext } from '@/lib/newsletter/recommendation-engine';
import { trackPageAnalytics } from '@/lib/analytics/page-tracking';
import { useAIPersonalizationRecovery } from '@/hooks/use-error-recovery';
import NewsletterErrorBoundary from '@/components/error/newsletter-error-boundary';
import { newsletterErrorTracker } from '@/lib/monitoring/newsletter-error-tracker';

interface PersonalizedHeroProps {
  fallbackContent?: PersonalizedContent;
}

// Internal component without error boundary
function PersonalizedHeroInternal({ fallbackContent }: PersonalizedHeroProps) {
  const defaultContent: PersonalizedContent = useMemo(() => fallbackContent || {
    headline: "SEC Filings Made Simple",
    valueProposition: "Get weekly AI summaries without the overwhelm",
    socialProof: "Join 2,847+ smart investors",
    ctaText: "Get Weekly Insights",
    riskMitigation: "Free forever • No spam"
  }, [fallbackContent]);

  const [content, setContent] = useState<PersonalizedContent>(defaultContent);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'already-subscribed'>('idle');
  const [isPersonalizing, setIsPersonalizing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  // Use AI personalization recovery hook
  const aiRecovery = useAIPersonalizationRecovery();

  useEffect(() => {
    // Personalize content on component mount
    personalizeContent();
  }, [personalizeContent]);

  const personalizeContent = useCallback(async () => {
    // Skip personalization if circuit breaker is open
    if (aiRecovery.state.isCircuitBreakerOpen) {
      console.log('AI personalization circuit breaker is open, skipping personalization');
      return;
    }

    // Gather user context with error handling
    const userContext: UserContext = {
      referrer: typeof document !== 'undefined' ? document.referrer : undefined,
      utm_source: typeof window !== 'undefined' 
        ? new URLSearchParams(window.location.search).get('utm_source') || undefined 
        : undefined,
      utm_medium: typeof window !== 'undefined' 
        ? new URLSearchParams(window.location.search).get('utm_medium') || undefined 
        : undefined,
      utm_campaign: typeof window !== 'undefined' 
        ? new URLSearchParams(window.location.search).get('utm_campaign') || undefined 
        : undefined,
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
    };

    try {
      setIsPersonalizing(true);

      // Use the AI recovery hook to handle personalization with fallback
      const personalizedContent = await aiRecovery.executeAIOperation(
        async () => {
          const response = await fetch('/api/newsletter/personalize', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(userContext),
          });
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const data = await response.json();
          if (!data.success) {
            throw new Error(data.error || 'Personalization failed');
          }
          
          return data.content;
        },
        defaultContent // Fallback to default content if AI fails
      );
      
      setContent(personalizedContent);
      
      // Track personalization success
      await trackPageAnalytics('newsletter', 'personalization_success', {
        utm_source: userContext.utm_source,
        utm_medium: userContext.utm_medium,
        utm_campaign: userContext.utm_campaign,
        retry_count: aiRecovery.state.retryCount,
      });
    } catch (error) {
      console.error('Personalization failed after all recovery attempts:', error);
      
      // Track personalization failure with detailed monitoring
      const errorInstance = error instanceof Error ? error : new Error(String(error));
      await newsletterErrorTracker.trackAIPersonalizationFailure(errorInstance, {
        retryCount: aiRecovery.state.retryCount,
        circuitBreakerOpen: aiRecovery.state.isCircuitBreakerOpen,
        userContext: userContext,
      });
      
      // Also track in analytics
      await trackPageAnalytics('newsletter', 'personalization_failed', {
        error_name: errorInstance.name,
        retry_count: aiRecovery.state.retryCount,
        circuit_breaker_open: aiRecovery.state.isCircuitBreakerOpen,
      });
    } finally {
      setIsPersonalizing(false);
    }
  }, [aiRecovery, defaultContent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      setStatus('error');
      return;
    }

    setStatus('loading');

    // Track signup attempt with personalized content
    await trackPageAnalytics('newsletter', 'personalized_signup_attempt', {
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
          source: 'newsletter_personalized',
          utm_source: new URLSearchParams(window.location.search).get('utm_source'),
          utm_medium: new URLSearchParams(window.location.search).get('utm_medium'),
          utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign'),
        }),
      });

      const data = await response.json();

      // Handle duplicate email gracefully
      if (response.status === 409) {
        setStatus('already-subscribed');
        setErrorMessage(data.message || 'This email is already subscribed to our newsletter.');

        // Track duplicate attempt
        await trackPageAnalytics('newsletter', 'personalized_signup_duplicate', {
          utm_source: new URLSearchParams(window.location.search).get('utm_source'),
        });
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || 'Subscription failed');
      }

      setStatus('success');

      // Track successful signup
      await trackPageAnalytics('newsletter', 'personalized_signup_success');

    } catch (error) {
      setStatus('error');
      setErrorMessage('Unable to subscribe at this time. Please try again later.');
      console.error('Newsletter signup error:', error);
    }
  };

  if (status === 'success') {
    return (
      <section className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-2xl mx-auto">
            <div className="text-green-400 text-4xl mb-4">✓</div>
            <h2 className="text-3xl font-bold mb-4">Welcome to the Community!</h2>
            <p className="text-xl text-purple-100 mb-6">
              Check your email for a welcome message. Your first newsletter arrives this Sunday.
            </p>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mt-8">
              <p className="text-lg font-semibold mb-2">What happens next?</p>
              <ul className="text-left text-purple-100 space-y-2">
                <li>• Welcome email with sample summaries (check your inbox now)</li>
                <li>• Weekly newsletter every Sunday morning</li>
                <li>• Option to upgrade for real-time alerts</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (status === 'already-subscribed') {
    return (
      <section className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 text-white py-20">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-2xl mx-auto">
            <div className="text-blue-400 text-4xl mb-4">ℹ️</div>
            <h2 className="text-3xl font-bold mb-4">You&apos;re Already Subscribed!</h2>
            <p className="text-xl text-purple-100 mb-6">
              {errorMessage || 'This email is already subscribed to our newsletter.'}
            </p>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mt-8">
              <p className="text-lg font-semibold mb-2">What you should expect:</p>
              <ul className="text-left text-purple-100 space-y-2">
                <li>• Weekly newsletter every Sunday morning</li>
                <li>• SEC filing summaries delivered to your inbox</li>
                <li>• Option to upgrade for real-time alerts</li>
              </ul>
            </div>
            <div className="mt-8">
              <Button
                onClick={() => { setStatus('idle'); setEmail(''); }}
                variant="secondary"
                className="!bg-white !text-violet-700 hover:!bg-gray-50"
              >
                Try Another Email
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 text-white py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
          
          {/* Personalized headline with loading state */}
          <div className="mb-6">
            {isPersonalizing ? (
              <div className="animate-pulse">
                <div className="h-12 bg-white/20 rounded-lg mb-4"></div>
              </div>
            ) : (
              <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6">
                {content.headline}
              </h1>
            )}
          </div>

          {/* Personalized value proposition */}
          <div className="mb-8">
            {isPersonalizing ? (
              <div className="animate-pulse">
                <div className="h-6 bg-white/20 rounded-lg"></div>
              </div>
            ) : (
              <p className="text-xl md:text-2xl text-purple-100 font-medium">
                {content.valueProposition}
              </p>
            )}
          </div>

          {/* Social proof */}
          <div className="mb-8">
            {isPersonalizing ? (
              <div className="animate-pulse">
                <div className="h-5 bg-white/20 rounded-lg w-64 mx-auto"></div>
              </div>
            ) : (
              <p className="text-lg text-purple-200">
                {content.socialProof}
              </p>
            )}
          </div>

          {/* Email signup form */}
          <div className="max-w-md mx-auto">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                type="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="text-lg p-4 text-gray-900"
                disabled={status === 'loading'}
              />
              
              {status === 'error' && (
                <p className="text-red-300 text-sm">
                  {errorMessage || 'Please enter a valid email address'}
                </p>
              )}
              
              <Button 
                type="submit" 
                disabled={status === 'loading' || isPersonalizing}
                variant="secondary"
                size="lg"
                className="w-full !bg-white !text-violet-700 hover:!bg-gray-50 hover:!text-violet-800 text-lg font-bold py-4 px-8 transition-all duration-200 border-2 border-white/20 shadow-lg"
              >
                {status === 'loading' ? 'Subscribing...' : content.ctaText}
              </Button>
              
              <p className="text-sm text-purple-200">
                {content.riskMitigation}
              </p>
            </form>
          </div>

          {/* Trust indicators */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
              <div className="text-3xl font-bold text-yellow-300">2,847+</div>
              <div className="text-purple-200">Active Subscribers</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
              <div className="text-3xl font-bold text-green-300">100%</div>
              <div className="text-purple-200">Free Forever</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
              <div className="text-3xl font-bold text-blue-300">5min</div>
              <div className="text-purple-200">Weekly Read</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Main export with error boundary wrapper
export function PersonalizedHero(props: PersonalizedHeroProps) {
  const handleError = useCallback((error: Error, errorInfo: React.ErrorInfo) => {
    console.error('PersonalizedHero component error:', { error, errorInfo });
  }, []);

  return (
    <NewsletterErrorBoundary 
      enableRetry={true}
      maxRetries={2}
      onError={handleError}
    >
      <PersonalizedHeroInternal {...props} />
    </NewsletterErrorBoundary>
  );
}