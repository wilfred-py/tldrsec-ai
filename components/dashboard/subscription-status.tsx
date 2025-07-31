/**
 * Subscription Status Dashboard Component
 * Addresses UX issue: missing subscription visibility for users
 */

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  CreditCard, 
  Calendar, 
  TrendingUp, 
  FileText, 
  Zap,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SubscriptionStatusProps {
  userId: string;
}

interface UserSubscription {
  tier: 'basic' | 'professional' | 'premium';
  isActive: boolean;
  features: string[];
  limits: {
    monthlyFilings: number;
    usedFilings: number;
    resetDate: Date;
  };
}

interface UsageAnalytics {
  totalFilings: number;
  totalTokensOptimized: number;
  averageReduction: number;
  costSavings: number;
}

const TIER_CONFIG = {
  basic: {
    name: 'Basic',
    color: 'bg-blue-500',
    badgeVariant: 'default' as const,
    optimizationLevel: 'Balanced (85% reduction)',
    price: '$9/month'
  },
  professional: {
    name: 'Professional', 
    color: 'bg-purple-500',
    badgeVariant: 'secondary' as const,
    optimizationLevel: 'Conservative (67% reduction)',
    price: '$29/month'
  },
  premium: {
    name: 'Premium',
    color: 'bg-orange-500', 
    badgeVariant: 'destructive' as const,
    optimizationLevel: 'Minimal (55% reduction)',
    price: '$99/month'
  }
};

export function SubscriptionStatus({ userId }: SubscriptionStatusProps) {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [analytics, setAnalytics] = useState<UsageAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSubscriptionData() {
      try {
        setLoading(true);
        
        // Fetch subscription status
        const subResponse = await fetch(`/api/user/subscription`);
        if (!subResponse.ok) {
          throw new Error('Failed to fetch subscription data');
        }
        const subData = await subResponse.json();
        setSubscription(subData);

        // Fetch usage analytics for current month
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        const analyticsResponse = await fetch(
          `/api/user/analytics?start=${startOfMonth.toISOString()}&end=${endOfMonth.toISOString()}`
        );
        if (analyticsResponse.ok) {
          const analyticsData = await analyticsResponse.json();
          setAnalytics(analyticsData);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchSubscriptionData();
  }, [userId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-8 bg-gray-200 rounded w-full"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !subscription) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Subscription Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            {error || 'Unable to load subscription data'}
          </p>
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const tierConfig = TIER_CONFIG[subscription.tier];
  const usagePercentage = (subscription.limits.usedFilings / subscription.limits.monthlyFilings) * 100;
  const isNearLimit = usagePercentage > 80;
  const timeToReset = formatDistanceToNow(subscription.limits.resetDate, { addSuffix: true });

  return (
    <div className="space-y-4">
      {/* Main Subscription Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Subscription Status
            </CardTitle>
            <Badge variant={tierConfig.badgeVariant} className="px-3 py-1">
              {tierConfig.name}
            </Badge>
          </div>
          <CardDescription>
            {tierConfig.price} • {tierConfig.optimizationLevel}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Active Status */}
          <div className="flex items-center gap-2">
            {subscription.isActive ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium text-green-700">Active</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium text-red-700">Inactive</span>
              </>
            )}
          </div>

          {/* Usage Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Monthly Usage</span>
              <span className={isNearLimit ? 'text-orange-600 font-medium' : 'text-gray-600'}>
                {subscription.limits.usedFilings} / {subscription.limits.monthlyFilings} filings
              </span>
            </div>
            <Progress 
              value={usagePercentage} 
              className={`h-2 ${isNearLimit ? 'bg-orange-100' : ''}`}
            />
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Resets {timeToReset}</span>
              <span>{Math.round(100 - usagePercentage)}% remaining</span>
            </div>
          </div>

          {/* Usage Warning */}
          {isNearLimit && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-orange-800">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Approaching Monthly Limit</span>
              </div>
              <p className="text-xs text-orange-700 mt-1">
                Consider upgrading to avoid interruption in service.
              </p>
            </div>
          )}

          <Separator />

          {/* Quick Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href="/dashboard/billing">
                <CreditCard className="h-4 w-4 mr-2" />
                Manage Billing
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/dashboard/usage">
                <TrendingUp className="h-4 w-4 mr-2" />
                View Analytics
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Analytics Summary */}
      {analytics && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4" />
              This Month's Impact
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Filings Processed</p>
                <p className="text-lg font-semibold">{analytics.totalFilings}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Avg. Reduction</p>
                <p className="text-lg font-semibold text-green-600">
                  {Math.round(analytics.averageReduction)}%
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Tokens Saved</p>
                <p className="text-lg font-semibold">
                  {(analytics.totalTokensOptimized / 1000).toFixed(1)}K
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Cost Savings</p>
                <p className="text-lg font-semibold text-green-600">
                  ${analytics.costSavings.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Features List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            Plan Features
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {subscription.features.map((feature, index) => (
              <li key={index} className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-3 w-3 text-green-500 flex-shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}