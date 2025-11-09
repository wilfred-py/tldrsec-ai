'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RefreshCw, AlertCircle, Mail } from 'lucide-react';
import { trackPageAnalytics } from '@/lib/analytics/page-tracking';
import { newsletterErrorTracker } from '@/lib/monitoring/newsletter-error-tracker';

interface Props {
  children: ReactNode;
  fallbackComponent?: ReactNode;
  enableRetry?: boolean;
  maxRetries?: number;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
  lastErrorTime: number;
  isRecovering: boolean;
}

class NewsletterErrorBoundary extends Component<Props, State> {
  private retryTimeoutId: NodeJS.Timeout | null = null;
  private readonly maxRetries: number;
  private readonly retryDelay: number = 2000; // Start with 2 second delay

  constructor(props: Props) {
    super(props);
    this.maxRetries = props.maxRetries || 3;
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      lastErrorTime: 0,
      isRecovering: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      lastErrorTime: Date.now(),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error details
    this.logError(error, errorInfo);
    
    // Track error with monitoring system
    newsletterErrorTracker.trackComponentCrash(error, errorInfo, 'NewsletterErrorBoundary')
      .catch(console.error);
    
    // Update state with error info
    this.setState({
      errorInfo,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  componentWillUnmount(): void {
    // Clean up retry timeout
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  private async logError(error: Error, errorInfo: ErrorInfo): Promise<void> {
    try {
      // Log to console for development
      console.group('Newsletter Error Boundary');
      console.error('Error:', error);
      console.error('Error Info:', errorInfo);
      console.error('Component Stack:', errorInfo.componentStack);
      console.groupEnd();

      // Track error in analytics
      await trackPageAnalytics('newsletter', 'error_boundary_triggered', {
        error_message: error.message,
        error_name: error.name,
        component_stack: errorInfo.componentStack?.slice(0, 500), // Limit length
        retry_count: this.state.retryCount,
        user_agent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      });
    } catch (analyticsError) {
      console.error('Failed to log error to analytics:', analyticsError);
    }
  }

  private handleRetry = (): void => {
    if (this.state.retryCount >= this.maxRetries) {
      console.warn('Maximum retry attempts reached for newsletter error boundary');
      return;
    }

    this.setState({ isRecovering: true });

    // Calculate exponential backoff delay
    const delay = this.retryDelay * Math.pow(2, this.state.retryCount);

    this.retryTimeoutId = setTimeout(() => {
      this.setState((prevState) => ({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: prevState.retryCount + 1,
        isRecovering: false,
      }));

      // Track retry attempt
      trackPageAnalytics('newsletter', 'error_boundary_retry', {
        retry_count: this.state.retryCount + 1,
        delay: delay,
      }).catch(console.error);
    }, delay);
  };

  private renderFallbackContent(): ReactNode {
    const { fallbackComponent } = this.props;
    const { error, retryCount, isRecovering } = this.state;
    
    // If custom fallback provided, use it
    if (fallbackComponent) {
      return fallbackComponent;
    }

    // Determine error type for better user messaging
    const isNetworkError = error?.message?.includes('fetch') || error?.message?.includes('network');
    const isAIError = error?.message?.includes('AI') || error?.message?.includes('LLM') || error?.message?.includes('personalization');
    
    // For network/AI errors, show a more subtle message
    if (isNetworkError || isAIError) {
      return (
        <section className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 text-white py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              
              {/* Static fallback content */}
              <div className="mb-6">
                <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6">
                  SEC Filings Made Simple
                </h1>
              </div>

              <div className="mb-8">
                <p className="text-xl md:text-2xl text-purple-100 font-medium">
                  Get weekly AI summaries without the overwhelm
                </p>
              </div>

              <div className="mb-8">
                <p className="text-lg text-purple-200">
                  Join 2,847+ smart investors
                </p>
              </div>

              {/* Subtle indicator that we're running in fallback mode */}
              <div className="max-w-md mx-auto">
                <div className="bg-white/5 backdrop-blur-sm rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-center text-sm text-purple-200">
                    <Mail className="w-4 h-4 mr-2" />
                    Loading your personalized experience...
                  </div>
                </div>
                
                {/* The form will be rendered by child components */}
                <div id="newsletter-form-container">
                  {/* PersonalizedHero child components will render here if they recover */}
                </div>
              </div>

              {/* Trust indicators - static version */}
              <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
                  <div className="text-3xl font-bold text-yellow-300">2,847+</div>
                  <div className="text-purple-200">Active Subscribers</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
                  <div className="text-3xl font-bold text-green-300">100%</div>
                  <div className="text-purple-200">Free Forever</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
                  <div className="text-3xl font-bold text-blue-300">5min</div>
                  <div className="text-purple-200">Weekly Read</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      );
    }

    // For more serious errors, show error message with retry option
    return (
      <section className="bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 text-white py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <Alert className="bg-red-600/20 border-red-400 text-white mb-8">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Temporary Issue</AlertTitle>
              <AlertDescription>
                We&apos;re experiencing a temporary issue loading personalized content. 
                {this.props.enableRetry && retryCount < this.maxRetries && (
                  <span> You can try again or continue with standard content.</span>
                )}
              </AlertDescription>
            </Alert>

            {this.props.enableRetry && retryCount < this.maxRetries && (
              <div className="mb-8">
                <Button
                  onClick={this.handleRetry}
                  disabled={isRecovering}
                  variant="outline"
                  className="bg-white/10 border-white/30 text-white hover:bg-white/20"
                >
                  {isRecovering ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Try Again
                    </>
                  )}
                </Button>
                <p className="text-sm text-purple-200 mt-2">
                  Attempt {retryCount + 1} of {this.maxRetries}
                </p>
              </div>
            )}

            {/* Static fallback content */}
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              SEC Filings Made Simple
            </h1>
            <p className="text-xl text-purple-100 mb-8">
              Get weekly AI summaries without the overwhelm
            </p>
            <p className="text-lg text-purple-200 mb-8">
              Join 2,847+ smart investors who trust our insights
            </p>

            {/* Basic signup form as fallback */}
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6">
              <p className="text-lg font-medium mb-4">Continue with Standard Experience</p>
              <p className="text-sm text-purple-200">
                Enter your email to receive weekly SEC filing summaries
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.renderFallbackContent();
    }

    return this.props.children;
  }
}

export default NewsletterErrorBoundary;