'use client';

import { motion } from 'framer-motion';
import { Star } from 'lucide-react';

const testimonials = [
  {
    quote: "This tool has saved me countless hours of reading through dense SEC filings. The summaries are accurate and highlight exactly what I need to know.",
    author: "Sarah J.",
    title: "Investment Analyst"
  },
  {
    quote: "As a financial advisor, I need to stay on top of company filings. This platform makes it easy to quickly understand the key points and share insights with clients.",
    author: "Michael T.",
    title: "Financial Advisor"
  },
  {
    quote: "The AI does an incredible job of extracting the most important information. It's like having a financial analyst on demand.",
    author: "David R.",
    title: "Retail Investor"
  }
];

export function Testimonials() {
  return (
    <section className="py-24 bg-gradient-to-b from-background/80 to-background">
      <div className="container px-4 mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-6">What Our Users Say</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Join thousands of investors and financial professionals who trust our platform.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: index * 0.2 }}
              className="p-8 rounded-2xl bg-card border border-border hover:shadow-lg transition-all duration-300 ease-in-out"
            >
              <div className="flex mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                ))}
              </div>
              <p className="mb-6 text-muted-foreground italic">&ldquo;{testimonial.quote}&rdquo;</p>
              <div>
                <p className="font-semibold">{testimonial.author}</p>
                <p className="text-sm text-muted-foreground">{testimonial.title}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
} 