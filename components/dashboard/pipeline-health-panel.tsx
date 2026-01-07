"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Lock,
  FileX,
  RotateCcw,
  Timer,
  AlertCircle
} from 'lucide-react';

interface PipelineHealthData {
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'ERROR';
  jobs: {
    pending: number;
    processing: number;
    completedLast1h: number;
    completedLast24h: number;
    deadLetter: number;
    retrying: number;
    exhaustedRetrying: number;
    staleProcessing: number;
    invalidJobTypes: number;
    highRetryCount: number;
  };
  locks: {
    healthStatus: string;
    staleCount: number;
    activeCount: number;
  };
  minutesSinceLastCompletion: number | null;
  lastCompletion: string | null;
  issues: string[];
  warnings?: string[];
  recommendations: string[];
  timestamp: string;
}

export function PipelineHealthPanel() {
  const [health, setHealth] = useState<PipelineHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchHealth = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/health/pipeline');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setHealth(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  };

  useEffect(() => {
    fetchHealth();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'HEALTHY':
        return {
          icon: <CheckCircle className="h-5 w-5 text-green-500" />,
          color: 'text-green-500',
          bg: 'bg-green-50 dark:bg-green-950/20',
          border: 'border-green-200 dark:border-green-800',
          badge: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
        };
      case 'DEGRADED':
        return {
          icon: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
          color: 'text-yellow-500',
          bg: 'bg-yellow-50 dark:bg-yellow-950/20',
          border: 'border-yellow-200 dark:border-yellow-800',
          badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100'
        };
      case 'CRITICAL':
        return {
          icon: <XCircle className="h-5 w-5 text-red-500" />,
          color: 'text-red-500',
          bg: 'bg-red-50 dark:bg-red-950/20',
          border: 'border-red-200 dark:border-red-800',
          badge: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
        };
      default:
        return {
          icon: <AlertCircle className="h-5 w-5 text-gray-500" />,
          color: 'text-gray-500',
          bg: 'bg-gray-50 dark:bg-gray-950/20',
          border: 'border-gray-200 dark:border-gray-800',
          badge: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100'
        };
    }
  };

  if (loading && !health) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-red-200 dark:border-red-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-500">
            <XCircle className="h-5 w-5" />
            Pipeline Health Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600 dark:text-red-400 mb-4">
            Failed to fetch pipeline health: {error}
          </p>
          <Button onClick={fetchHealth} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!health) return null;

  const config = getStatusConfig(health.status);
  const hasStuckJobs = health.jobs.exhaustedRetrying > 0 ||
                       health.jobs.invalidJobTypes > 0 ||
                       health.jobs.staleProcessing > 0;

  return (
    <Card className={`${config.border}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {config.icon}
            <div>
              <CardTitle className="text-lg">Pipeline Health</CardTitle>
              <CardDescription>
                Last updated: {lastRefresh.toLocaleTimeString()}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={config.badge}>{health.status}</Badge>
            <Button onClick={fetchHealth} variant="ghost" size="sm" disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
            <div className="text-2xl font-bold">{health.jobs.completedLast1h}</div>
            <div className="text-xs text-gray-500">Completed (1h)</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
            <div className="text-2xl font-bold">{health.jobs.pending}</div>
            <div className="text-xs text-gray-500">Pending</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
            <div className="text-2xl font-bold">{health.jobs.processing}</div>
            <div className="text-xs text-gray-500">Processing</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
            <div className="text-2xl font-bold">
              {health.minutesSinceLastCompletion !== null
                ? `${health.minutesSinceLastCompletion}m`
                : '-'}
            </div>
            <div className="text-xs text-gray-500">Since Last</div>
          </div>
        </div>

        {/* Stuck Job Detection - Only show if issues exist */}
        {hasStuckJobs && (
          <div className="border rounded-lg p-4 space-y-3 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800">
            <h4 className="font-semibold text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Stuck Job Detection
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {health.jobs.exhaustedRetrying > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <RotateCcw className="h-4 w-4 text-red-500" />
                  <span className="font-medium">{health.jobs.exhaustedRetrying}</span>
                  <span className="text-gray-600 dark:text-gray-400">Exhausted Retries</span>
                </div>
              )}
              {health.jobs.invalidJobTypes > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <FileX className="h-4 w-4 text-red-500" />
                  <span className="font-medium">{health.jobs.invalidJobTypes}</span>
                  <span className="text-gray-600 dark:text-gray-400">Invalid Types</span>
                </div>
              )}
              {health.jobs.staleProcessing > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Timer className="h-4 w-4 text-yellow-500" />
                  <span className="font-medium">{health.jobs.staleProcessing}</span>
                  <span className="text-gray-600 dark:text-gray-400">Stale Processing</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lock Status */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-gray-500" />
            <span className="text-sm">Lock Status</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {health.locks.activeCount} active / {health.locks.staleCount} stale
            </span>
            <Badge variant={health.locks.healthStatus === 'HEALTHY' ? 'secondary' : 'destructive'}>
              {health.locks.healthStatus}
            </Badge>
          </div>
        </div>

        {/* Warnings */}
        {health.warnings && health.warnings.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-yellow-600 dark:text-yellow-400">Warnings</h4>
            {health.warnings.map((warning, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-yellow-700 dark:text-yellow-300">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        )}

        {/* Issues */}
        {health.issues.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-red-600 dark:text-red-400">Issues</h4>
            {health.issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{issue}</span>
              </div>
            ))}
          </div>
        )}

        {/* Recommendations */}
        {health.recommendations.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-blue-600 dark:text-blue-400">Recommendations</h4>
            {health.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-blue-700 dark:text-blue-300">
                <CheckCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="font-mono text-xs">{rec}</span>
              </div>
            ))}
          </div>
        )}

        {/* Additional Stats */}
        <div className="pt-3 border-t text-xs text-gray-500 grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <span className="font-medium">Retrying:</span> {health.jobs.retrying}
          </div>
          <div>
            <span className="font-medium">Dead Letter:</span> {health.jobs.deadLetter}
          </div>
          <div>
            <span className="font-medium">High Retry:</span> {health.jobs.highRetryCount}
          </div>
          <div>
            <span className="font-medium">24h Completed:</span> {health.jobs.completedLast24h}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
