'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LLMRecommendationEngine, PersonalizedContent, UserContext } from '@/lib/newsletter/recommendation-engine';
import { trackPageAnalytics } from '@/lib/analytics/page-tracking';

interface PersonalizedHeroProps {
  fallbackContent?: PersonalizedContent;
}

export function PersonalizedHero({ fallbackContent }: PersonalizedHeroProps) {
  const [content, setContent] = useState<PersonalizedContent>(
    fallbackContent || {
      headline: "SEC Filings Made Simple",
      valueProposition: "Get weekly AI summaries without the overwhelm",
      socialProof: "Join 2,847+ smart investors",
      ctaText: "Get Weekly Insights",
      riskMitigation: "Free forever • No spam"
    }
  );
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [isPersonalizing, setIsPersonalizing] = useState(false);

  useEffect(() => {
    // Personalize content on component mount
    personalizeContent();
  }, []);

  const personalizeContent = async () => {
    try {
      setIsPersonalizing(true);
      
      // Gather user context
      const userContext: UserContext = {
        referrer: document.referrer,
        utm_source: new URLSearchParams(window.location.search).get('utm_source') || undefined,
        utm_medium: new URLSearchParams(window.location.search).get('utm_medium') || undefined,
        utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign') || undefined,
        userAgent: window.navigator.userAgent,
        // Add more context as needed
      };

      const engine = new LLMRecommendationEngine();
      const personalizedContent = await engine.generatePersonalizedContent(userContext);
      
      setContent(personalizedContent);
      
      // Track personalization success
      await trackPageAnalytics('newsletter', 'personalization_success', {
        utm_source: userContext.utm_source,
        utm_medium: userContext.utm_medium,
        utm_campaign: userContext.utm_campaign,
      });
    } catch (error) {
      console.error('Personalization failed:', error);
      
      // Track personalization failure but don't show error to user
      await trackPageAnalytics('newsletter', 'personalization_failed');
    } finally {
      setIsPersonalizing(false);
    }
  };

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

      if (!response.ok) {
        throw new Error('Subscription failed');
      }

      setStatus('success');
      
      // Track successful signup
      await trackPageAnalytics('newsletter', 'personalized_signup_success');

    } catch (error) {
      setStatus('error');
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
                  Please enter a valid email address
                </p>
              )}
              
              <Button 
                type="submit" 
                disabled={status === 'loading' || isPersonalizing}
                className="w-full bg-white text-violet-600 hover:bg-gray-100 text-lg font-bold py-4 px-8 transition-all duration-200"
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