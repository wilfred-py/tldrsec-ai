'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Check } from 'lucide-react';

const pricingPlans = [
  {
    name: "Basic",
    price: "$9",
    period: "per month",
    description: "Perfect for individual investors tracking a few companies.",
    features: [
      "Up to 5 ticker subscriptions",
      "Email summaries of SEC filings",
      "10-K, 10-Q, and 8-K coverage",
      "Basic summary format",
      "24-hour delivery window"
    ],
    cta: "Start Free Trial",
    highlighted: false
  },
  {
    name: "Premium",
    price: "$29",
    period: "per month",
    description: "Ideal for active investors who need comprehensive insights.",
    features: [
      "Up to 25 ticker subscriptions",
      "Priority email delivery",
      "All SEC filing types covered",
      "Enhanced summary format with insights",
      "Real-time delivery (within minutes)",
      "Historical filing access",
      "Web dashboard access"
    ],
    cta: "Start Free Trial",
    highlighted: true
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "pricing",
    description: "For professional teams requiring advanced features and support.",
    features: [
      "Unlimited ticker subscriptions",
      "Priority email delivery",
      "All SEC filing types covered",
      "Custom summary format",
      "Real-time delivery (within minutes)",
      "API access",
      "Team collaboration tools",
      "Dedicated support"
    ],
    cta: "Contact Sales",
    highlighted: false
  }
];

export function PricingSection() {
  return (
    <section className="py-24 bg-gradient-to-b from-background to-background/90 relative overflow-hidden">
      {/* Background gradient elements */}
      <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-violet-500/5 to-transparent -z-10" />
      
      <div className="container px-4 mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Simple, Transparent Pricing</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Choose the plan that fits your investment needs. All plans include a 7-day free trial.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {pricingPlans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: index * 0.2 }}
              className={`p-8 rounded-2xl ${plan.highlighted ? 'bg-gradient-to-b from-violet-500/10 to-indigo-500/10 border-violet-500/20' : 'bg-card border-border'} border hover:shadow-lg transition-all duration-300 ease-in-out relative flex flex-col h-full`}
            >
              {plan.highlighted && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </div>
              )}
              
              <div>
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <div className="mb-4">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground"> {plan.period}</span>
                </div>
                <p className="text-muted-foreground mb-6">{plan.description}</p>
              </div>
              
              <div className="space-y-3 mb-8 flex-grow">
                {plan.features.map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
              
              <Link href={plan.name === "Enterprise" ? "/contact" : "/auth/sign-up"} className="mt-auto">
                <Button 
                  className={`w-full ${plan.highlighted ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white' : ''}`}
                  variant={plan.highlighted ? "default" : "outline"}
                  size="lg"
                >
                  {plan.cta}
                </Button>
              </Link>
            </motion.div>
          ))}
        </div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-center mt-16"
        >
          <p className="text-muted-foreground mb-4">Need a custom solution?</p>
          <Link href="/contact">
            <Button variant="outline" size="lg">
              Contact Our Team
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
} 