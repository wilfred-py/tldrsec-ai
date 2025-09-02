"use client";

import { AlertTriangle, RefreshCw, Mail } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import Link from "next/link";

interface SummaryErrorStateProps {
  error?: string;
  filingType?: string;
  companyName?: string;
  ticker?: string;
  onRetry?: () => void;
  retryDisabled?: boolean;
}

/**
 * Error state component for failed summary generation
 * Provides user-friendly messaging and recovery actions
 */
export function SummaryErrorState({
  error,
  filingType = "filing",
  companyName = "this company",
  ticker,
  onRetry,
  retryDisabled = false
}: SummaryErrorStateProps) {
  const displayName = ticker ? `${companyName} (${ticker})` : companyName;
  
  return (
    <Card className="border-red-200 bg-red-50/50">
      <CardContent className="p-6">
        <div className="flex items-start space-x-3">
          <AlertTriangle className="h-6 w-6 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-red-800 font-semibold text-lg mb-2">
              Summary Temporarily Unavailable
            </h3>
            
            <div className="text-red-700 text-sm space-y-2 mb-4">
              <p>
                We're experiencing technical difficulties generating a summary for this{" "}
                {filingType} filing from {displayName}.
              </p>
              <p>
                Our team has been automatically notified and is working to resolve the issue. 
                You can try generating the summary again, or check back in a few minutes.
              </p>
            </div>

            {error && (
              <details className="mb-4">
                <summary className="text-red-600 text-xs cursor-pointer hover:text-red-800">
                  Technical details
                </summary>
                <pre className="text-red-600 text-xs mt-1 bg-red-100 p-2 rounded border overflow-auto">
                  {error}
                </pre>
              </details>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              {onRetry && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetry}
                  disabled={retryDisabled}
                  className="border-red-300 text-red-700 hover:bg-red-100 hover:border-red-400"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {retryDisabled ? "Retrying..." : "Try Again"}
                </Button>
              )}
              
              <Button variant="ghost" size="sm" asChild>
                <Link 
                  href="mailto:support@tldrsec.app?subject=Summary Generation Issue"
                  className="text-red-700 hover:text-red-800 hover:bg-red-100"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Contact Support
                </Link>
              </Button>
            </div>

            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-blue-800 text-xs">
                <strong>💡 While you wait:</strong> You can still access the original SEC filing 
                document for complete details. Summary generation typically resolves within 15-30 minutes.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Simplified error state for email notifications
 */
export function EmailSummaryErrorState({
  companyName,
  ticker,
  filingType,
  error
}: {
  companyName: string;
  ticker?: string;
  filingType: string;
  error?: string;
}) {
  const displayName = ticker ? `${companyName} (${ticker})` : companyName;
  
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 my-4">
      <div className="flex items-center space-x-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-red-500" />
        <h3 className="text-red-800 font-medium text-sm">
          Summary Generation Failed
        </h3>
      </div>
      
      <p className="text-red-700 text-sm mb-2">
        We encountered an issue generating the AI summary for the {filingType} filing from {displayName}.
      </p>
      
      <p className="text-red-600 text-xs">
        Our team has been notified. You can view the original filing or try again later through your dashboard.
      </p>
      
      {error && (
        <p className="text-red-500 text-xs mt-2 font-mono bg-red-100 p-1 rounded">
          Error: {error}
        </p>
      )}
    </div>
  );
}