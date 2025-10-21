"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle, CheckCircle, Clock, Zap, Mail, Database, Activity } from "lucide-react";

interface DetailedMetrics {
  timestamp: Date;
  cron: {
    lastExecution: Date | null;
    executionInterval: number;
    successRate: number;
    recentErrors: number;
  };
  processing: {
    backlogSize: number;
    processingRate: number;
    avgProcessingTime: number;
    successRate: number;
    estimatedClearTime: number;
  };
  ai: {
    summariesLastHour: number;
    avgCost: number;
    avgTokens: number;
    errorRate: number;
  };
  email: {
    sentLastHour: number;
    deliveryRate: number;
    bounceRate: number;
    recentFailures: number;
  };
  database: {
    connectionStatus: 'healthy' | 'degraded' | 'failed';
    avgQueryTime: number;
    activeConnections: number;
  };
}

interface Alert {
  metric: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  current: number;
  threshold: number;
}

export function MonitoringDashboard() {
  const [metrics, setMetrics] = useState<DetailedMetrics | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/admin/detailed-metrics');
      if (response.ok) {
        const data = await response.json();
        setMetrics(data.metrics);
        setAlerts(data.alerts || []);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Failed to fetch detailed metrics:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    
    if (autoRefresh) {
      const interval = setInterval(fetchMetrics, 30000); // 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'failed':
      case 'critical':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200';
      default:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading monitoring data...</span>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-center py-8">
        <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold">Failed to load monitoring data</h3>
        <p className="text-muted-foreground mb-4">Unable to connect to monitoring service</p>
        <Button onClick={fetchMetrics}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
  const totalAlerts = alerts.length;

  return (
    <div className="space-y-6">
      {/* Header with Refresh Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {totalAlerts === 0 ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            )}
            <span className="font-medium">
              {totalAlerts === 0 ? 'All Systems Operational' : `${criticalAlerts} Critical, ${totalAlerts} Total Alerts`}
            </span>
          </div>
          
          {lastUpdate && (
            <span className="text-sm text-muted-foreground">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className={`h-4 w-4 mr-2 ${autoRefresh ? 'text-green-500' : ''}`} />
            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
          </Button>
          <Button onClick={fetchMetrics} size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Alert Summary */}
      {alerts.length > 0 && (
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <AlertTriangle className="h-5 w-5" />
              Active Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.map((alert, index) => (
                <div key={index} className="flex items-center justify-between p-2 rounded border">
                  <div className="flex items-center gap-2">
                    <Badge className={getSeverityColor(alert.severity)}>
                      {alert.severity.toUpperCase()}
                    </Badge>
                    <span className="text-sm">{alert.message}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {alert.current} / {alert.threshold}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Overview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Cron Jobs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Cron Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                {getStatusIcon(metrics.cron.successRate > 95 ? 'healthy' : 'degraded')}
                <span className="text-2xl font-bold">{metrics.cron.successRate.toFixed(1)}%</span>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Interval: {metrics.cron.executionInterval.toFixed(1)}m</div>
                <div>Errors: {metrics.cron.recentErrors}</div>
                <div>Last: {metrics.cron.lastExecution ? 
                  new Date(metrics.cron.lastExecution).toLocaleTimeString() : 'Unknown'}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Processing Queue */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Processing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                {getStatusIcon(metrics.processing.backlogSize < 100 ? 'healthy' : 'degraded')}
                <span className="text-2xl font-bold">{metrics.processing.backlogSize}</span>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Rate: {metrics.processing.processingRate}/hr</div>
                <div>Avg: {metrics.processing.avgProcessingTime.toFixed(1)}s</div>
                <div>Success: {metrics.processing.successRate.toFixed(1)}%</div>
              </div>
              {metrics.processing.backlogSize > 0 && (
                <Progress 
                  value={Math.max(0, 100 - (metrics.processing.backlogSize / 300) * 100)} 
                  className="h-1 mt-2"
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Email Delivery */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                {getStatusIcon(metrics.email.deliveryRate > 95 ? 'healthy' : 'degraded')}
                <span className="text-2xl font-bold">{metrics.email.sentLastHour}</span>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Delivery: {metrics.email.deliveryRate.toFixed(1)}%</div>
                <div>Bounce: {metrics.email.bounceRate.toFixed(1)}%</div>
                <div>Failures: {metrics.email.recentFailures}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Database */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />
              Database
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                {getStatusIcon(metrics.database.connectionStatus)}
                <span className="text-2xl font-bold">{metrics.database.avgQueryTime}ms</span>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Status: {metrics.database.connectionStatus}</div>
                <div>Connections: {metrics.database.activeConnections}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed AI Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            AI Summarization Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{metrics.ai.summariesLastHour}</div>
              <div className="text-sm text-muted-foreground">Summaries/hour</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">${metrics.ai.avgCost.toFixed(4)}</div>
              <div className="text-sm text-muted-foreground">Avg cost</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{Math.round(metrics.ai.avgTokens)}</div>
              <div className="text-sm text-muted-foreground">Avg tokens</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{metrics.ai.errorRate.toFixed(1)}%</div>
              <div className="text-sm text-muted-foreground">Error rate</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}