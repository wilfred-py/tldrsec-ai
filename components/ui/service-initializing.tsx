"use client";

import { Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "./card";

interface ServiceInitializingProps {
  message?: string;
  estimatedTime?: number;
  className?: string;
}

/**
 * Service initialization component with accessibility and consistent UX
 * Used when services are starting up or unavailable temporarily
 */
export function ServiceInitializing({ 
  message = "Service initializing...", 
  estimatedTime = 30,
  className = ""
}: ServiceInitializingProps) {
  return (
    <Card 
      className={`border-amber-200 bg-amber-50/50 ${className}`} 
      role="status" 
      aria-live="polite"
      aria-labelledby="service-init-title"
      aria-describedby="service-init-description"
    >
      <CardContent className="p-6">
        <div className="flex items-start space-x-3">
          <Loader2 
            className="h-6 w-6 text-amber-500 animate-spin flex-shrink-0" 
            aria-label="Loading"
            role="img"
          />
          <div className="flex-1 min-w-0">
            <h3 
              id="service-init-title"
              className="text-amber-800 font-semibold text-lg mb-2"
            >
              {message}
            </h3>
            <p 
              id="service-init-description"
              className="text-amber-700 text-sm mb-4"
            >
              Our system is safely initializing. This typically takes {estimatedTime} seconds.
              Please wait while we prepare your secure connection.
            </p>
            <div className="flex items-center space-x-2 text-amber-600 text-xs">
              <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>Systems are operating normally during initialization</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Error state component with recovery options
 */
interface ServiceErrorProps {
  message?: string;
  retryAfter?: number;
  onRetry?: () => void;
  className?: string;
}

export function ServiceError({ 
  message = "Service temporarily unavailable", 
  retryAfter = 30,
  onRetry,
  className = ""
}: ServiceErrorProps) {
  return (
    <Card 
      className={`border-red-200 bg-red-50/50 ${className}`}
      role="alert"
      aria-labelledby="service-error-title"
      aria-describedby="service-error-description"
    >
      <CardContent className="p-6">
        <div className="flex items-start space-x-3">
          <AlertCircle 
            className="h-6 w-6 text-red-500 flex-shrink-0" 
            aria-label="Error"
            role="img"
          />
          <div className="flex-1 min-w-0">
            <h3 
              id="service-error-title"
              className="text-red-800 font-semibold text-lg mb-2"
            >
              {message}
            </h3>
            <p 
              id="service-error-description"
              className="text-red-700 text-sm mb-4"
            >
              We're experiencing a temporary issue. Please try again in {retryAfter} seconds.
              If the problem persists, our team has been notified.
            </p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
                aria-describedby="service-error-description"
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}