'use client';

import { motion } from 'framer-motion';
import { NewsletterForm } from './newsletter-form';

export function NewsletterHero() {
  return (
    <div className="relative min-h-[85vh] flex items-center bg-gradient-to-br from-violet-50 via-white to-indigo-50">
      <div className="container px-4 py-24 mx-auto">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-indigo-600">
              SEC Filings Made Simple
            </h1>
            
            <p className="text-xl md:text-2xl mb-8 text-gray-700 max-w-3xl mx-auto">
              Get weekly AI-generated summaries of SEC filings from Fortune 500 companies. 
              <strong className="text-violet-600"> No signup required.</strong> Just your email.
            </p>

            <div className="bg-white rounded-2xl shadow-xl p-8 mb-8 max-w-lg mx-auto">
              <NewsletterForm />
            </div>

            <p className="text-sm text-gray-500 mb-8">
              Join <strong>2,847</strong> investors getting weekly insights • Free forever
            </p>

            <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto text-center">
              <div>
                <div className="text-2xl font-bold text-violet-600">5 min</div>
                <div className="text-sm text-gray-600">Reading time</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-violet-600">500+</div>
                <div className="text-sm text-gray-600">Companies covered</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-violet-600">Weekly</div>
                <div className="text-sm text-gray-600">Delivery schedule</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}