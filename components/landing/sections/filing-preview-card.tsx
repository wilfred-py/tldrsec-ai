'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Calendar, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { CuratedFiling } from '@/lib/data/curated-filings';

interface FilingPreviewCardProps {
  filing: CuratedFiling;
  index: number;
}

/**
 * Filing type badge colors
 */
const filingTypeColors: Record<string, string> = {
  '10-K': 'bg-blue-100 text-blue-700 border-blue-200',
  '10-Q': 'bg-green-100 text-green-700 border-green-200',
  '8-K': 'bg-amber-100 text-amber-700 border-amber-200',
  'Form 4': 'bg-purple-100 text-purple-700 border-purple-200',
  'DEF 14A': 'bg-rose-100 text-rose-700 border-rose-200',
};

export function FilingPreviewCard({ filing, index }: FilingPreviewCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const badgeColor =
    filingTypeColors[filing.filingType] ||
    'bg-slate-100 text-slate-700 border-slate-200';

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: index * 0.1 }}
        className="group cursor-pointer"
        onClick={() => setDialogOpen(true)}
      >
        <div className="bg-white rounded-xl border border-slate-200 p-6 hover:border-blue-300 hover:shadow-lg transition-all duration-300 h-full">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                <FileText className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{filing.ticker}</h3>
                <p className="text-sm text-slate-500">{filing.companyName}</p>
              </div>
            </div>
            <Badge variant="outline" className={badgeColor}>
              {filing.filingType}
            </Badge>
          </div>

          {/* Date */}
          <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-4">
            <Calendar className="w-4 h-4" />
            <span>Filed {formatDate(filing.filedAt)}</span>
          </div>

          {/* Key Highlights Preview */}
          <ul className="space-y-2 mb-4">
            {filing.keyHighlights.slice(0, 3).map((highlight, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-slate-600"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                <span className="line-clamp-1">{highlight}</span>
              </li>
            ))}
          </ul>

          {/* Read More CTA */}
          <div className="flex items-center text-sm font-medium text-blue-600 group-hover:text-blue-700">
            <span>Read full analysis</span>
            <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </motion.div>

      {/* Full Summary Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-slate-600" />
                </div>
                <div>
                  <DialogTitle className="text-xl">
                    {filing.companyName} ({filing.ticker})
                  </DialogTitle>
                  <DialogDescription className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className={badgeColor}>
                      {filing.filingType}
                    </Badge>
                    <span className="text-slate-500">
                      Filed {formatDate(filing.filedAt)}
                    </span>
                  </DialogDescription>
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Key Highlights */}
          <div className="mt-6">
            <h4 className="font-semibold text-slate-900 mb-3">Key Highlights</h4>
            <ul className="space-y-2">
              {filing.keyHighlights.map((highlight, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-slate-600"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Full Summary - NOT truncated */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h4 className="font-semibold text-slate-900 mb-3">
              Complete Analysis
            </h4>
            <div className="prose prose-slate max-w-none">
              <p className="whitespace-pre-wrap text-slate-600 leading-relaxed">
                {filing.fullSummary}
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-6 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-slate-500">
              Want summaries like this for your portfolio?
            </p>
            <Button asChild>
              <Link href="/sign-up">Start Trial</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Grid of filing preview cards
 */
interface FilingPreviewGridProps {
  filings: CuratedFiling[];
}

export function FilingPreviewGrid({ filings }: FilingPreviewGridProps) {
  return (
    <section className="py-20 bg-slate-50">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            See Real Filing Summaries
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            AI-powered analysis that helps you understand what matters in seconds,
            not hours.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {filings.map((filing, index) => (
            <FilingPreviewCard key={filing.id} filing={filing} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}
