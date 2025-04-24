import { useEffect, useState } from 'react';
import { useStripe, Elements, PaymentElement, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useIsMobile } from '@/hooks/use-mobile';
import { BadgeCheck, Shield, ArrowLeft } from 'lucide-react';
import { Link } from 'wouter';

// Make sure to call `loadStripe` outside of a component's render to avoid
// recreating the `Stripe` object on every render.
if (!import.meta.env.VITE_STRIPE_PUBLIC_KEY) {
  console.warn('Missing VITE_STRIPE_PUBLIC_KEY environment variable');
}
const stripePromise = import.meta.env.VITE_STRIPE_PUBLIC_KEY 
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY)
  : null;

const SubscriptionForm = () => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const isMobile = useIsMobile();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/settings`,
        },
      });

      if (error) {
        toast({
          title: "Subscription Failed",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Subscription Started",
          description: "Thank you for subscribing to tldrSEC Premium!",
        });
      }
    } catch (err) {
      console.error('Payment confirmation error:', err);
      toast({
        title: "Subscription Failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-6">
      <PaymentElement />
      <Button 
        type="submit" 
        className="w-full" 
        disabled={isLoading || !stripe || !elements}
      >
        {isLoading ? <LoadingSpinner size="sm" /> : 'Subscribe Now'}
      </Button>
    </form>
  );
};

export default function Subscribe() {
  const [clientSecret, setClientSecret] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const isMobile = useIsMobile();

  useEffect(() => {
    // Create subscription as soon as the page loads
    async function createSubscription() {
      try {
        setIsLoading(true);
        
        const response = await apiRequest("POST", "/api/get-or-create-subscription");
        const contentType = response.headers.get("content-type");
        
        if (!response.ok) {
          // Handle error response
          if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to create subscription');
          } else {
            throw new Error('Server error: The API returned an unexpected response format');
          }
        }
        
        // Handle successful response
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          if (data.clientSecret) {
            setClientSecret(data.clientSecret);
          } else {
            throw new Error('Missing client secret in response');
          }
        } else {
          throw new Error('Server returned invalid content type');
        }
      } catch (error) {
        console.error('Subscription creation error:', error);
        setError(
          error instanceof Error 
            ? error.message 
            : 'An unexpected error occurred. Please try again.'
        );
        toast({
          title: "Subscription Error",
          description: error instanceof Error ? error.message : 'Failed to set up subscription',
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }

    createSubscription();
  }, [toast]);

  const benefits = [
    "Unlimited SEC filing summaries and insights",
    "Advanced AI analysis of financial statements",
    "Priority email alerts for critical filings",
    "Export summaries to PDF or Excel",
    "Historical filing database access"
  ];

  return (
    <div className="container mx-auto max-w-5xl py-8 px-4">
      <div className="mb-6">
        <Link to="/dashboard">
          <Button variant="ghost" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <h1 className="text-3xl font-bold text-center mb-8">Upgrade to tldrSEC Premium</h1>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Shield className="mr-2 h-6 w-6 text-primary" />
                Premium Benefits
              </CardTitle>
              <CardDescription>
                Get exclusive features to enhance your financial analysis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-start">
                    <BadgeCheck className="mr-2 h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <p className="text-sm text-muted-foreground">
                Cancel anytime. No long-term commitment required.
              </p>
            </CardFooter>
          </Card>
          
          <div className="bg-primary/5 rounded-lg p-6">
            <h3 className="text-xl font-medium mb-2">Why Go Premium?</h3>
            <p className="mb-4">
              tldrSEC Premium gives you the competitive edge by providing deeper insights 
              into SEC filings with our state-of-the-art AI analysis. Stay ahead of the market 
              with priority notifications and advanced financial metrics.
            </p>
            <p className="text-sm text-muted-foreground">
              Questions? Contact us at support@tldrsec.io
            </p>
          </div>
        </div>
        
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Payment Details</CardTitle>
              <CardDescription>
                $59.00/month - Cancel anytime
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner size="lg" />
                </div>
              ) : error ? (
                <div className="text-center py-8 text-destructive">
                  <p className="mb-4">{error}</p>
                  <Button variant="outline" onClick={() => window.location.reload()}>
                    Try Again
                  </Button>
                </div>
              ) : !stripePromise ? (
                <div className="text-center py-8 text-destructive">
                  <p className="mb-4">Payment system is unavailable. Please try again later.</p>
                </div>
              ) : clientSecret ? (
                <Elements 
                  stripe={stripePromise} 
                  options={{ clientSecret, appearance: { theme: 'stripe' } }}
                >
                  <SubscriptionForm />
                </Elements>
              ) : (
                <div className="flex justify-center py-8">
                  <LoadingSpinner size="lg" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}