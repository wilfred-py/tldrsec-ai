"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Clock, TrendingUp, Zap, Mail } from "lucide-react";

interface ProcessingMetrics {
  backlogSize: number;
  processingRate: number; // filings per hour
  avgProcessingTime: number; // seconds
  successRate: number; // percentage
  emailsSentLastHour: number;
  estimatedClearTime: number; // hours
}

export function ProcessingStatus() {
  const [metrics, setMetrics] = useState<ProcessingMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch('/api/system/processing-metrics');
        if (response.ok) {
          const data = await response.json();
          setMetrics(data);
        }
      } catch (error) {
        console.error('Failed to fetch processing metrics:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetrics();
    // Update every 60 seconds
    const interval = setInterval(fetchMetrics, 60000);
    return () => clearInterval(interval);
  }, []);

  // Only show if there's meaningful activity or backlog
  if (isLoading || !metrics || (metrics.backlogSize === 0 && metrics.emailsSentLastHour === 0)) {
    return null;
  }

  const getHealthColor = () => {
    if (metrics.backlogSize < 50) return 'text-green-600 dark:text-green-400';
    if (metrics.backlogSize < 150) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getProgressValue = () => {
    // Convert backlog to progress percentage (inverse relationship)
    const maxBacklog = 300;
    return Math.max(0, Math.min(100, 100 - (metrics.backlogSize / maxBacklog) * 100));
  };

  return (
    <Card className="p-4 mb-4 bg-gradient-to-r from-blue-50/50 to-purple-50/50 dark:from-blue-950/20 dark:to-purple-950/20">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Filing Processing Status
        </h3>
        <Badge variant="outline" className="text-xs">
          Live
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {/* Processing Queue */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Queue</span>
          </div>
          <div className={`text-lg font-semibold ${getHealthColor()}`}>
            {metrics.backlogSize}
          </div>
          <div className="text-xs text-muted-foreground">filings</div>
        </div>

        {/* Processing Rate */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Rate</span>
          </div>
          <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
            {metrics.processingRate}
          </div>
          <div className="text-xs text-muted-foreground">per hour</div>
        </div>

        {/* Average Time */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Zap className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Avg Time</span>
          </div>
          <div className="text-lg font-semibold text-purple-600 dark:text-purple-400">
            {Math.round(metrics.avgProcessingTime)}s
          </div>
          <div className="text-xs text-muted-foreground">per filing</div>
        </div>

        {/* Emails Sent */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Mail className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Sent</span>
          </div>
          <div className="text-lg font-semibold text-green-600 dark:text-green-400">
            {metrics.emailsSentLastHour}
          </div>
          <div className="text-xs text-muted-foreground">last hour</div>
        </div>
      </div>

      {/* Progress Bar for Queue Status */}
      {metrics.backlogSize > 0 && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Processing efficiency</span>
            <span>{metrics.successRate.toFixed(1)}% success rate</span>
          </div>
          <Progress 
            value={getProgressValue()} 
            className="h-2"
            aria-label={`Processing efficiency: ${getProgressValue().toFixed(0)}%`}
          />
          {metrics.estimatedClearTime > 0 && metrics.estimatedClearTime < 48 && (
            <div className="text-xs text-muted-foreground mt-1 text-center">
              Est. {metrics.estimatedClearTime.toFixed(1)}h to clear queue
            </div>
          )}
        </div>
      )}
    </Card>
  );
}