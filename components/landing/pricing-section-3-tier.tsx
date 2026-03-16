'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Check } from 'lucide-react';

export function PricingSection3Tier() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handlePlanSelect = async (planType: 'FREE' | 'PRO' | 'MAX') => {
    if (!email) {
      alert('Please enter your email address');
      return;
    }

    setIsLoading(true);
    
    try {
      const response = await fetch('/api/checkout/direct', {
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
          // Redirect to Stripe checkout for paid plans
          window.location.href = data.sessionUrl;
        } else if (data.redirectUrl) {
          // Redirect to onboarding for FREE plan
          window.location.href = data.redirectUrl;
        }
      } else {
        alert('Error: ' + data.error);
      }
    } catch {
      alert('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const plans = [
    {
      name: 'FREE',
      price: '$0',
      period: 'for 7 days',
      description: 'Full access trial',
      features: [
        'Unlimited companies to track',
        'Real-time email alerts',
        'All SEC filing types',
        'First priority processing queue',
      ],
      buttonText: 'Start Trial',
      popular: false,
    },
    {
      name: 'PRO',
      price: '$199',
      period: '/month',
      description: 'For serious investors and analysts',
      features: [
        '25 companies to track',
        'Real-time email alerts',
        'Priority processing queue',
        'All SEC filing types',
        'Email support',
      ],
      buttonText: 'Start PRO',
      popular: true,
    },
    {
      name: 'MAX',
      price: '$349',
      period: '/month',
      description: 'For institutions and power users',
      features: [
        'Unlimited companies',
        'Real-time email alerts',
        'First priority processing queue',
        'All SEC filing types',
        'Dedicated support',
      ],
      buttonText: 'Start MAX',
      popular: false,
    },
  ];

  return (
    <section className="py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Choose Your Plan</h2>
          <p className="text-lg text-gray-600 mb-8">
            Start tracking SEC filings and get AI-powered summaries delivered to your inbox
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

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-6">
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
                  onClick={() => handlePlanSelect(plan.name as 'FREE' | 'PRO' | 'MAX')}
                  disabled={isLoading || !email}
                  className={`w-full ${
                    plan.popular 
                      ? 'bg-blue-600 hover:bg-blue-700' 
                      : 'bg-gray-900 hover:bg-gray-800'
                  }`}
                >
                  {isLoading ? 'Loading...' : plan.buttonText}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}