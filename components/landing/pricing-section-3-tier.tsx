'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check } from 'lucide-react';
import { toast } from 'sonner';

export function PricingSection3Tier() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handlePlanSelect = async (planType: 'PRO' | 'MAX') => {
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          planType
        })
      });

      const data = await response.json();

      if (response.ok) {
        if (data.sessionUrl) {
          window.location.href = data.sessionUrl;
        }
      } else if (response.status === 409 && data.signInUrl) {
        toast.error('An account with this email already exists. Please sign in.');
      } else {
        toast.error(data.error || 'An error occurred. Please try again.');
      }
    } catch {
      toast.error('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const plans = [
    {
      name: 'PRO',
      price: '$199',
      period: '/month',
      trialText: '7-day free trial — then $199/mo',
      description: 'Standard summaries for focused watchlists',
      features: [
        '25 companies to track',
        'Real-time email alerts',
        'Priority processing queue',
        'Standard AI summaries',
        'All SEC filing types',
        'Email support',
      ],
      buttonText: 'Start Free Trial',
      popular: true,
    },
    {
      name: 'MAX',
      price: '$349',
      period: '/month',
      trialText: '7-day free trial — then $349/mo',
      description: 'Enriched summaries with live web context, for analysts',
      features: [
        'Unlimited companies',
        'Real-time email alerts',
        'First priority processing queue',
        'Enriched summaries with web context',
        'All SEC filing types',
        'Dedicated support',
      ],
      buttonText: 'Start Free Trial',
      popular: false,
    },
  ];

  return (
    <section className="py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Never miss another filing</h2>
          <p className="text-lg text-gray-600 mb-8">
            AI-powered SEC filing summaries delivered to your inbox the moment they drop
          </p>

          {/* Email Input */}
          <div className="max-w-md mx-auto mb-8">
            <Label htmlFor="email" className="sr-only">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-center"
            />
          </div>
        </div>

        {/* Pricing Cards — 2-tier centered layout */}
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={`relative ${plan.popular ? 'ring-2 ring-blue-600 scale-105' : ''}`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                    Most Popular
                  </span>
                </div>
              )}

              <CardHeader className="text-center pb-4">
                <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
                <CardDescription className="text-sm">{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-gray-600">{plan.period}</span>
                </div>
                <p className="text-sm text-gray-500 mt-2">{plan.trialText}</p>
              </CardHeader>

              <CardContent className="pt-0">
                <ul className="space-y-3 mb-6">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <Check className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  onClick={() => handlePlanSelect(plan.name as 'PRO' | 'MAX')}
                  disabled={isLoading || !email}
                  className={`w-full ${
                    plan.popular
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-gray-900 hover:bg-gray-800'
                  }`}
                >
                  {isLoading ? 'Redirecting to checkout...' : plan.buttonText}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
