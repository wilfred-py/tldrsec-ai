'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Mail, Loader2 } from 'lucide-react';

interface EmailStepProps {
  onEmailSubmit: (email: string) => Promise<void> | void;
  onBack: () => void;
  selectedTickers: string[];
  isLoading?: boolean;
}

export function EmailStep({
  onEmailSubmit,
  onBack,
  selectedTickers,
  isLoading = false
}: EmailStepProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateEmail = (email: string): string | null => {
    if (!email || email.trim() === '') {
      return 'Email is required';
    }

    // RFC 5322 simplified regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return 'Please enter a valid email address';
    }

    if (email.length > 254) {
      return 'Email address is too long';
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validateEmail(email);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setIsSubmitting(true);
      await onEmailSubmit(email.toLowerCase().trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const showProcessing = isSubmitting || isLoading;

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">Where should we send your summaries?</CardTitle>
        <CardDescription className="text-base">
          Enter your email to receive SEC filing summaries for your selected companies.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Selected Tickers Summary */}
        <div className="rounded-lg bg-muted/50 p-4">
          <p className="text-sm font-medium mb-2">You&apos;ll receive summaries for:</p>
          <div className="flex flex-wrap gap-2">
            {selectedTickers.map((ticker) => (
              <Badge key={ticker} variant="secondary">
                {ticker}
              </Badge>
            ))}
          </div>
        </div>

        {/* Email Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              type="email"
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
              className={error ? 'border-destructive' : ''}
              disabled={showProcessing}
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={showProcessing}
              className="flex-1"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              type="submit"
              disabled={showProcessing}
              className="flex-1"
            >
              {showProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Continue'
              )}
            </Button>
          </div>
        </form>

        <p className="text-xs text-muted-foreground text-center">
          We&apos;ll create your account and send a verification email.
          Your first summaries will arrive after verification.
        </p>
      </CardContent>
    </Card>
  );
}
