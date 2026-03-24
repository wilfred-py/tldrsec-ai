"use client";

import { useState, useEffect } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'maintenance';
  processingBacklog: number;
  estimatedDelay?: string;
  message?: string;
  lastUpdate: Date;
}

export function SystemHealthBanner() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch system health status
    const fetchHealth = async () => {
      try {
        const response = await fetch('/api/health');
        if (response.ok) {
          const data = await response.json();
          setHealth(data);
        }
      } catch (error) {
        console.error('Failed to fetch system health:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHealth();
    // Update every 30 seconds
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading || !health) {
    return null;
  }

  // Only show banner if there are issues or processing delays
  if (health.status === 'healthy' && health.processingBacklog === 0) {
    return null;
  }

  const getStatusConfig = () => {
    switch (health.status) {
      case 'healthy':
        return {
          variant: 'default' as const,
          icon: <CheckCircle className="h-4 w-4" />,
          bgColor: 'bg-green-50 dark:bg-green-950/20',
          borderColor: 'border-green-200 dark:border-green-800',
          badgeVariant: 'secondary' as const
        };
      case 'degraded':
        return {
          variant: 'destructive' as const,
          icon: <AlertTriangle className="h-4 w-4" />,
          bgColor: 'bg-yellow-50 dark:bg-yellow-950/20',
          borderColor: 'border-yellow-200 dark:border-yellow-800',
          badgeVariant: 'outline' as const
        };
      case 'maintenance':
        return {
          variant: 'default' as const,
          icon: <Clock className="h-4 w-4" />,
          bgColor: 'bg-blue-50 dark:bg-blue-950/20',
          borderColor: 'border-blue-200 dark:border-blue-800',
          badgeVariant: 'secondary' as const
        };
      default:
        return {
          variant: 'default' as const,
          icon: <Loader2 className="h-4 w-4 animate-spin" />,
          bgColor: 'bg-gray-50 dark:bg-gray-950/20',
          borderColor: 'border-gray-200 dark:border-gray-800',
          badgeVariant: 'secondary' as const
        };
    }
  };

  const config = getStatusConfig();

  return (
    <Alert 
      className={`mb-4 ${config.bgColor} ${config.borderColor}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {config.icon}
          <div className="flex items-center gap-2">
            <AlertDescription className="font-medium">
              {health.message || getDefaultMessage(health)}
            </AlertDescription>
            {health.processingBacklog > 0 && (
              <Badge variant={config.badgeVariant}>
                {health.processingBacklog} pending
              </Badge>
            )}
          </div>
        </div>
        
        {health.estimatedDelay && (
          <div className="text-sm text-muted-foreground">
            Est. delay: {health.estimatedDelay}
          </div>
        )}
      </div>
    </Alert>
  );
}

function getDefaultMessage(health: SystemHealth): string {
  if (health.processingBacklog > 0) {
    return `Processing ${health.processingBacklog} filings - your summaries may be delayed.`;
  }
  
  switch (health.status) {
    case 'degraded':
      return 'System experiencing delays - filing processing may take longer than usual.';
    case 'maintenance':
      return 'Scheduled maintenance in progress - some features may be temporarily unavailable.';
    default:
      return 'All systems operational.';
  }
}