'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';

interface TickerConfirmationSectionProps {
  tickerCount: number;
}

export function TickerConfirmationSection({ tickerCount }: TickerConfirmationSectionProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleConfirm = async () => {
    setIsConfirming(true);

    try {
      const response = await fetch('/api/user/tickers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      });

      const data = await response.json();

      if (response.ok) {
        setConfirmed(true);

        if (data.emailSent) {
          const tickerList = data.newTickersEmailed?.length <= 3
            ? data.newTickersEmailed.join(', ')
            : `${data.newTickersEmailed.slice(0, 3).join(', ')} and ${data.newTickersEmailed.length - 3} more`;

          toast.success(
            `Portfolio confirmed! We've emailed you quarterly earnings summaries for ${tickerList}.`
          );
        } else if (data.reason === 'within_grace_period') {
          toast.success('Portfolio confirmed! No new companies added - no additional email sent.');
        } else if (data.reason === 'no_tickers') {
          toast.info('Add some companies to your portfolio first!');
        } else {
          toast.success('Portfolio confirmed!');
        }

        // Reset after 30 seconds to allow re-confirmation
        setTimeout(() => setConfirmed(false), 30000);
      } else {
        toast.error(data.error || 'Failed to confirm portfolio');
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsConfirming(false);
    }
  };

  if (tickerCount === 0) {
    return (
      <div className="text-center py-8 px-4 text-slate-500 bg-slate-50 rounded-lg border border-slate-200">
        <Mail className="w-10 h-10 mx-auto mb-3 text-slate-400" />
        <p className="font-medium text-slate-700 mb-1">No companies tracked yet</p>
        <p className="text-sm">
          Add companies to your portfolio to receive quarterly earnings summaries.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6 mt-6">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
          <Mail className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-blue-900 text-lg mb-1">
            Get Your Quarterly Earnings
          </h3>
          <p className="text-blue-700 text-sm mb-4">
            Ready to receive the latest 10-K and 10-Q summaries for your {tickerCount}{' '}
            {tickerCount === 1 ? 'company' : 'companies'}? Click confirm and we&apos;ll
            email you the most recent quarterly reports.
          </p>

          <Button
            onClick={handleConfirm}
            disabled={isConfirming || confirmed}
            className={`${
              confirmed
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-blue-600 hover:bg-blue-700'
            } transition-colors`}
          >
            {isConfirming ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Confirming...
              </>
            ) : confirmed ? (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Portfolio Confirmed
              </>
            ) : (
              <>
                <Mail className="w-4 h-4 mr-2" />
                Confirm & Email Me Summaries
              </>
            )}
          </Button>

          {confirmed && (
            <p className="text-xs text-blue-600 mt-2">
              Check your inbox! You can confirm again after making changes to your portfolio.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
