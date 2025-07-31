/**
 * Usage Analytics Dashboard
 * Addresses UX issue: missing usage analytics and optimization insights
 */

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  TrendingUp, 
  FileText, 
  Zap, 
  DollarSign,
  Calendar,
  BarChart3,
  PieChart,
  Activity
} from 'lucide-react';
import { format, subDays, subMonths, startOfMonth, endOfMonth } from 'date-fns';

interface UsageAnalytics {
  totalFilings: number;
  totalTokensOriginal: number;
  totalTokensOptimized: number;
  averageReduction: number;
  totalCost: number;
  costSavings: number;
  averageProcessingTime: number;
  filingsByType: Record<string, number>;
  dailyUsage?: Array<{
    date: string;
    filings: number;
    tokensOptimized: number;
  }>;
}

interface SubscriptionLimits {
  monthlyFilings: number;
  usedFilings: number;
  resetDate: Date;
}

const TIME_PERIODS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: '3m', label: 'Last 3 months' }
];

export default function UsageAnalyticsPage() {
  const [analytics, setAnalytics] = useState<UsageAnalytics | null>(null);
  const [limits, setLimits] = useState<SubscriptionLimits | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        setLoading(true);
        
        // Calculate date range based on selected period
        let startDate: Date;
        let endDate: Date = new Date();
        
        switch (selectedPeriod) {
          case '7d':
            startDate = subDays(endDate, 7);
            break;
          case '30d':
            startDate = subDays(endDate, 30);
            break;
          case 'thisMonth':
            startDate = startOfMonth(endDate);
            endDate = endOfMonth(endDate);
            break;
          case 'lastMonth':
            const lastMonth = subMonths(endDate, 1);
            startDate = startOfMonth(lastMonth);
            endDate = endOfMonth(lastMonth);
            break;
          case '3m':
            startDate = subMonths(endDate, 3);
            break;
          default:
            startDate = subDays(endDate, 30);
        }

        // Fetch analytics data
        const analyticsResponse = await fetch(
          `/api/user/analytics?start=${startDate.toISOString()}&end=${endDate.toISOString()}&includeDailyBreakdown=true`
        );
        
        if (!analyticsResponse.ok) {
          throw new Error('Failed to fetch analytics');
        }
        
        const analyticsData = await analyticsResponse.json();
        setAnalytics(analyticsData);

        // Fetch subscription limits
        const limitsResponse = await fetch('/api/user/subscription');
        if (limitsResponse.ok) {
          const subscriptionData = await limitsResponse.json();
          setLimits({
            monthlyFilings: subscriptionData.limits.monthlyFilings,
            usedFilings: subscriptionData.limits.usedFilings,
            resetDate: new Date(subscriptionData.limits.resetDate)
          });
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [selectedPeriod]);

  if (loading) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="h-4 bg-gray-200 rounded w-96"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="container mx-auto py-8">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">{error || 'Failed to load analytics'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usage Analytics</h1>
          <p className="text-gray-600 mt-2">
            Track your SEC filing processing and token optimization performance
          </p>
        </div>
        
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_PERIODS.map(period => (
              <SelectItem key={period.value} value={period.value}>
                {period.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Monthly Usage Progress (if limits available) */}
      {limits && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Monthly Usage
            </CardTitle>
            <CardDescription>
              Current month progress towards your plan limit
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Filings Used</span>
                <span className="text-sm text-gray-600">
                  {limits.usedFilings} / {limits.monthlyFilings}
                </span>
              </div>
              <Progress 
                value={(limits.usedFilings / limits.monthlyFilings) * 100} 
                className="h-2"
              />
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  Resets {format(limits.resetDate, 'MMM d, yyyy')}
                </span>
                <span>
                  {limits.monthlyFilings - limits.usedFilings} remaining
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Filings</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalFilings}</div>
            <p className="text-xs text-muted-foreground">
              SEC filings processed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Reduction</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {Math.round(analytics.averageReduction)}%
            </div>
            <p className="text-xs text-muted-foreground">
              Token optimization rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tokens Saved</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {((analytics.totalTokensOriginal - analytics.totalTokensOptimized) / 1000).toFixed(1)}K
            </div>
            <p className="text-xs text-muted-foreground">
              Total optimization savings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cost Savings</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${analytics.costSavings.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Estimated AI cost savings
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filing Types Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Filing Types
            </CardTitle>
            <CardDescription>
              Breakdown by SEC form type
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(analytics.filingsByType)
                .sort(([,a], [,b]) => b - a)
                .map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {type}
                      </Badge>
                      <span className="text-sm">{count} filings</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full" 
                          style={{ 
                            width: `${(count / analytics.totalFilings) * 100}%` 
                          }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-8">
                        {Math.round((count / analytics.totalFilings) * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Performance Metrics
            </CardTitle>
            <CardDescription>
              Processing and optimization performance
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Average Processing Time</span>
              <span className="text-sm font-mono">
                {(analytics.averageProcessingTime / 1000).toFixed(1)}s
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Processing Cost</span>
              <span className="text-sm font-mono">
                ${analytics.totalCost.toFixed(3)}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Original Token Count</span>
              <span className="text-sm font-mono">
                {(analytics.totalTokensOriginal / 1000).toFixed(1)}K
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Optimized Token Count</span>
              <span className="text-sm font-mono text-green-600">
                {(analytics.totalTokensOptimized / 1000).toFixed(1)}K
              </span>
            </div>

            <div className="pt-2 border-t">
              <div className="flex items-center justify-between font-medium">
                <span className="text-sm">Efficiency Score</span>
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  {Math.round((analytics.costSavings / (analytics.totalCost + analytics.costSavings)) * 100)}% Efficient
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Usage Chart (if available) */}
      {analytics.dailyUsage && analytics.dailyUsage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Daily Usage Trend
            </CardTitle>
            <CardDescription>
              Filing processing activity over time
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.dailyUsage.slice(-14).map((day, index) => (
                <div key={day.date} className="flex items-center justify-between text-sm">
                  <span className="w-20">
                    {format(new Date(day.date), 'MMM d')}
                  </span>
                  <div className="flex-1 mx-4">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-500 h-2 rounded-full" 
                        style={{ 
                          width: `${Math.max(5, (day.filings / Math.max(...analytics.dailyUsage!.map(d => d.filings))) * 100)}%` 
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    <span>{day.filings} filings</span>
                    <span>{(day.tokensOptimized / 1000).toFixed(1)}K tokens</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}