"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";

interface FilingStatus {
  ticker: string;
  lastCheck: Date;
  status: 'processing' | 'completed' | 'delayed' | 'error';
  estimatedCompletion?: Date;
  message?: string;
}

interface FilingStatusIndicatorProps {
  ticker: string;
  className?: string;
}

export function FilingStatusIndicator({ ticker, className }: FilingStatusIndicatorProps) {
  const [status, setStatus] = useState<FilingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/filings/${ticker}/status`);
        if (response.ok) {
          const data = await response.json();
          setStatus(data);
        }
      } catch (error) {
        console.error('Failed to fetch filing status:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatus();
    // Check status every 2 minutes
    const interval = setInterval(fetchStatus, 120000);
    return () => clearInterval(interval);
  }, [ticker]);

  if (isLoading || !status) {
    return null;
  }

  const getStatusConfig = () => {
    switch (status.status) {
      case 'processing':
        return {
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          label: 'Processing',
          variant: 'secondary' as const,
          color: 'text-blue-600'
        };
      case 'completed':
        return {
          icon: <CheckCircle className="h-3 w-3" />,
          label: 'Up to date',
          variant: 'secondary' as const,
          color: 'text-green-600'
        };
      case 'delayed':
        return {
          icon: <Clock className="h-3 w-3" />,
          label: 'Delayed',
          variant: 'outline' as const,
          color: 'text-yellow-600'
        };
      case 'error':
        return {
          icon: <AlertTriangle className="h-3 w-3" />,
          label: 'Issue',
          variant: 'destructive' as const,
          color: 'text-red-600'
        };
    }
  };

  const config = getStatusConfig();
  
  const tooltipContent = () => {
    if (status.message) return status.message;
    
    switch (status.status) {
      case 'processing':
        return `Currently processing filings for ${ticker}`;
      case 'completed':
        return `All filings up to date. Last check: ${status.lastCheck.toLocaleTimeString()}`;
      case 'delayed':
        return status.estimatedCompletion 
          ? `Processing delayed. Expected completion: ${status.estimatedCompletion.toLocaleTimeString()}`
          : 'Processing experiencing delays';
      case 'error':
        return `Error processing filings for ${ticker}. Our team has been notified.`;
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={config.variant}
            className={`${className} flex items-center gap-1 text-xs`}
          >
            <span className={config.color}>
              {config.icon}
            </span>
            <span className="hidden sm:inline">
              {config.label}
            </span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm max-w-xs">{tooltipContent()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}