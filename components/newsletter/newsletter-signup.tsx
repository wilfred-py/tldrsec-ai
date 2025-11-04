'use client';

import { NewsletterForm } from './newsletter-form';

export function NewsletterSignup() {
  return (
    <div className="bg-gradient-to-br from-indigo-50 to-violet-50 py-16">
      <div className="container px-4 mx-auto">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to stay informed?</h2>
          <p className="text-lg text-gray-600 mb-8">
            Get weekly summaries delivered straight to your inbox. No credit card required.
          </p>
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md mx-auto">
            <NewsletterForm ctaText="Start Your Free Subscription" />
          </div>
        </div>
      </div>
    </div>
  );
}