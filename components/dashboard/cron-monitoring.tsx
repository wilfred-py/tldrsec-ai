"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Clock, 
  DollarSign, 
  Mail, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle,
  RefreshCw,
  Users
} from 'lucide-react';

interface CronStatusData {
  currentStatus: {
    isHealthy: boolean;
    runningJobs: number;
    lastJobStatus: string;
    lastJobTime: string;
    nextScheduledRun: string;
  };
  summary: {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    successRate: number;
    totalCost: number;
    totalFilings: number;
    totalUsers: number;
    avgDuration: number;
    avgCostPerFiling: number;
    avgCostPerUser: number;
  };
  recentExecutions: Array<{
    id: string;
    jobName: string;
    status: string;
    startTime: string;
    endTime: string;
    durationHuman: string;
    tickersChecked: number;
    newFilingsFound: number;
    filingsProcessed: number;
    usersNotified: number;
    totalCost: number;
    aiCost: number;
    emailCost: number;
    tokensUsed: number;
    errorCount: number;
    filingsByType: Record<string, number>;
    emailDeliveryStats: {
      sent: number;
      failed: number;
      pending: number;
    };
  }>;
  costAnalysis: {
    projectedMonthlyCost: number;
  };
  tickerActivity: Array<{
    symbol: string;
    filingsCount: number;
    totalCost: number;
    avgCostPerFiling: number;
  }>;
}

export function CronMonitoringDashboard() {
  const [data, setData] = useState<CronStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/monitoring/cron-status?days=7&limit=10');
      if (response.ok) {
        const result = await response.json();
        setData(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch cron monitoring data:', error);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
        <h3 className="text-lg font-semibold">Failed to load monitoring data</h3>
        <Button onClick={fetchData} variant="outline" className="mt-4">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'bg-green-500';
      case 'RUNNING': return 'bg-blue-500';
      case 'FAILED': return 'bg-red-500';
      case 'TIMEOUT': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (isHealthy: boolean) => {
    return isHealthy ? (
      <CheckCircle className="h-5 w-5 text-green-500" />
    ) : (
      <AlertCircle className="h-5 w-5 text-red-500" />
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cron Job Monitoring</h1>
          <p className="text-gray-600">SEC Filing Processing Status & Analytics</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-500">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </div>
          <Button onClick={fetchData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            {getStatusIcon(data.currentStatus.isHealthy)}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.currentStatus.isHealthy ? 'Healthy' : 'Issues'}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.currentStatus.runningJobs > 0 
                ? `${data.currentStatus.runningJobs} job(s) running`
                : `Last run: ${data.currentStatus.lastJobStatus}`
              }
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.successRate}%</div>
            <p className="text-xs text-muted-foreground">
              {data.summary.successfulExecutions}/{data.summary.totalExecutions} successful
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${data.costAnalysis.projectedMonthlyCost}</div>
            <p className="text-xs text-muted-foreground">
              ${data.summary.avgCostPerFiling}/filing avg
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users Notified</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.summary.totalUsers}</div>
            <p className="text-xs text-muted-foreground">
              ${data.summary.avgCostPerUser}/user avg
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <Tabs defaultValue="executions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="executions">Recent Executions</TabsTrigger>
          <TabsTrigger value="activity">Ticker Activity</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="executions">
          <Card>
            <CardHeader>
              <CardTitle>Recent Cron Job Executions</CardTitle>
              <CardDescription>
                Detailed view of recent SEC filing processing jobs
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.recentExecutions.map((execution) => (
                  <div key={execution.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Badge className={getStatusColor(execution.status)}>
                          {execution.status}
                        </Badge>
                        <span className="font-medium">{execution.jobName}</span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(execution.startTime).toLocaleString()}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
                      <div>
                        <div className="text-gray-500">Duration</div>
                        <div className="font-medium">{execution.durationHuman}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">New Filings</div>
                        <div className="font-medium">{execution.newFilingsFound}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Processed</div>
                        <div className="font-medium">{execution.filingsProcessed}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Users Notified</div>
                        <div className="font-medium">{execution.usersNotified}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">AI Cost</div>
                        <div className="font-medium">${execution.aiCost.toFixed(4)}</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Tokens</div>
                        <div className="font-medium">{execution.tokensUsed.toLocaleString()}</div>
                      </div>
                    </div>

                    {Object.keys(execution.filingsByType).length > 0 && (
                      <div>
                        <div className="text-sm text-gray-500 mb-2">Filing Types:</div>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(execution.filingsByType).map(([type, count]) => (
                            <Badge key={type} variant="outline">
                              {type}: {count}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center space-x-4 text-sm">
                      <div className="flex items-center space-x-1">
                        <Mail className="h-4 w-4 text-green-500" />
                        <span>{execution.emailDeliveryStats.sent} sent</span>
                      </div>
                      {execution.emailDeliveryStats.failed > 0 && (
                        <div className="flex items-center space-x-1">
                          <AlertCircle className="h-4 w-4 text-red-500" />
                          <span>{execution.emailDeliveryStats.failed} failed</span>
                        </div>
                      )}
                      {execution.errorCount > 0 && (
                        <div className="flex items-center space-x-1">
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                          <span>{execution.errorCount} errors</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Ticker Activity</CardTitle>
              <CardDescription>
                Filing activity and costs by ticker symbol
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.tickerActivity.map((ticker) => (
                  <div key={ticker.symbol} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Badge variant="outline">{ticker.symbol}</Badge>
                      <div>
                        <div className="font-medium">{ticker.filingsCount} filings</div>
                        <div className="text-sm text-gray-500">
                          ${ticker.avgCostPerFiling.toFixed(4)} avg cost
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">${ticker.totalCost.toFixed(4)}</div>
                      <div className="text-sm text-gray-500">total cost</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Performance Metrics</CardTitle>
                <CardDescription>Average processing times and efficiency</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span>Avg Execution Time</span>
                  <span className="font-medium">{Math.round(data.summary.avgDuration / 1000)}s</span>
                </div>
                <div className="flex justify-between">
                  <span>Cost per Filing</span>
                  <span className="font-medium">${data.summary.avgCostPerFiling.toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cost per User</span>
                  <span className="font-medium">${data.summary.avgCostPerUser.toFixed(4)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Next Scheduled Run</CardTitle>
                <CardDescription>Upcoming cron job execution</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-3">
                  <Clock className="h-8 w-8 text-blue-500" />
                  <div>
                    <div className="font-medium">
                      {new Date(data.currentStatus.nextScheduledRun).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500">
                      Daily at midnight UTC
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}