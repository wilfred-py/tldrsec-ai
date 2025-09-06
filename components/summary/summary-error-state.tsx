"use client";

import { AlertTriangle, RefreshCw, Mail, X } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";

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
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const errorAnnouncementRef = useRef<HTMLDivElement>(null);
  
  // Announce error state changes to screen readers
  useEffect(() => {
    if (retryDisabled && errorAnnouncementRef.current) {
      errorAnnouncementRef.current.textContent = "Retrying summary generation, please wait...";
    } else if (!retryDisabled && errorAnnouncementRef.current) {
      errorAnnouncementRef.current.textContent = "";
    }
  }, [retryDisabled]);
  
  return (
    <Card className="border-red-200 bg-red-50/50" role="alert" aria-labelledby="error-heading">
      <CardContent className="p-6">
        {/* Screen reader announcement area */}
        <div 
          ref={errorAnnouncementRef}
          aria-live="polite" 
          aria-atomic="true"
          className="sr-only"
        />
        
        <div className="flex items-start space-x-3">
          <div className="flex items-center space-x-1 mt-0.5 flex-shrink-0">
            <AlertTriangle 
              className="h-6 w-6 text-red-500" 
              aria-label="Error indicator"
            />
            <X 
              className="h-4 w-4 text-red-600" 
              aria-hidden="true"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="error-heading" className="text-red-800 font-semibold text-lg mb-2">
              Summary Temporarily Unavailable
            </h3>
            
            <div className="text-red-700 text-sm space-y-2 mb-4">
              <p>
                We&apos;re experiencing technical difficulties generating a summary for this{" "}
                {filingType} filing from {displayName}.
              </p>
              <p>
                Our team has been automatically notified and is working to resolve the issue. 
                You can try generating the summary again, or check back in a few minutes.
              </p>
            </div>

            {error && (
              <details 
                className="mb-4" 
                onToggle={(e) => setIsDetailsExpanded((e.target as HTMLDetailsElement).open)}
              >
                <summary 
                  className="text-red-600 text-xs cursor-pointer hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded px-1 py-0.5"
                  aria-expanded={isDetailsExpanded}
                  aria-controls="error-details"
                  role="button"
                  tabIndex={0}
                >
                  <span className="flex items-center space-x-1">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    <span>Technical details</span>
                    <span className="text-xs text-red-500" aria-hidden="true">
                      ({isDetailsExpanded ? 'collapse' : 'expand'})
                    </span>
                  </span>
                </summary>
                <div 
                  id="error-details"
                  role="region"
                  aria-label="Error technical details"
                >
                  <pre 
                    className="text-red-600 text-xs mt-1 bg-red-100 p-2 rounded border overflow-auto"
                    aria-label="Error message details"
                  >
                    {error}
                  </pre>
                </div>
              </details>
            )}

            <div className="flex flex-col sm:flex-row gap-3" role="group" aria-label="Error recovery actions">
              {onRetry && (
                <Button
                  ref={retryButtonRef}
                  variant="outline"
                  size="sm"
                  onClick={onRetry}
                  disabled={retryDisabled}
                  className="border-red-300 text-red-700 hover:bg-red-100 hover:border-red-400 focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                  aria-describedby="retry-button-description"
                  aria-label={retryDisabled ? "Currently retrying summary generation" : "Retry generating summary"}
                >
                  <RefreshCw 
                    className={`w-4 h-4 mr-2 ${retryDisabled ? 'animate-spin' : ''}`} 
                    aria-hidden="true"
                  />
                  <span>{retryDisabled ? "Retrying..." : "Try Again"}</span>
                </Button>
              )}
              <div id="retry-button-description" className="sr-only">
                {retryDisabled ? 
                  "Summary generation is currently in progress. Please wait." : 
                  "Click to attempt generating the summary again."
                }
              </div>
              
              <Button variant="ghost" size="sm" asChild>
                <Link 
                  href="mailto:support@tldrsec.app?subject=Summary Generation Issue"
                  className="text-red-700 hover:text-red-800 hover:bg-red-100 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded"
                  aria-label="Contact support team via email about this summary generation issue"
                >
                  <Mail className="w-4 h-4 mr-2" aria-hidden="true" />
                  <span>Contact Support</span>
                </Link>
              </Button>
            </div>

            <div 
              className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded" 
              role="note" 
              aria-label="Helpful information"
            >
              <p className="text-blue-800 text-xs">
                <strong className="flex items-center space-x-1">
                  <span aria-label="Light bulb icon" role="img">💡</span>
                  <span>While you wait:</span>
                </strong>
                <span className="ml-1">
                  You can still access the original SEC filing document for complete details. 
                  Summary generation typically resolves within 15-30 minutes.
                </span>
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
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 my-4" role="alert">
      <div className="flex items-center space-x-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-red-500" aria-label="Error indicator" />
        <X className="h-3 w-3 text-red-600" aria-hidden="true" />
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
        <div className="mt-2">
          <p className="text-red-500 text-xs font-mono bg-red-100 p-1 rounded" aria-label="Technical error details">
            <strong>Error:</strong> {error}
          </p>
        </div>
      )}
    </div>
  );
}