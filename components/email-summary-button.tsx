"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import filingService from "@/services/filingService";

/**
 * Button component that allows users to request an email summary of their tracked tickers
 */
export function EmailSummaryButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleSendEmailSummary = async () => {
    try {
      setIsLoading(true);
      
      // Use the filingService to send the email summary
      const result = await filingService.sendEmailSummary();

      if (!result.success) {
        // Handle specific error cases with more user-friendly messages
        if (result.error === 'No summaries found for tracked tickers') {
          toast.error(
            'No filing summaries available for your tracked companies. Try adding more tickers or wait for new filings.', 
            { duration: 5000 }
          );
        } else if (result.error === 'No tickers found for this user') {
          toast.error(
            'You need to add companies to track before requesting summaries. Go to the Dashboard to add tickers.', 
            { duration: 5000 }
          );
        } else {
          throw new Error(result.error || 'Failed to send email summary');
        }
        return;
      }

      toast.success(result.message || 'Email summary sent successfully!');
    } catch (error) {
      console.error('Error sending email summary:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send email summary', { duration: 4000 });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      onClick={handleSendEmailSummary}
      disabled={isLoading}
      className="flex items-center gap-2"
    >
      <Mail className="h-4 w-4" />
      {isLoading ? 'Sending...' : 'Email Summaries'}
    </Button>
  );
}
