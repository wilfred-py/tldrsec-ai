'use client';

import { Summary } from '@/lib/generated/prisma';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { FileTextIcon, ExternalLinkIcon, InfoIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SummaryWithTicker extends Summary {
  ticker: {
    id: string;
    symbol: string;
    companyName: string;
    userId: string;
    addedAt: Date;
  };
}

interface SummaryCardProps {
  summary: SummaryWithTicker;
  className?: string;
  variant?: 'default' | 'compact';
  showPreview?: boolean;
  previewLength?: number;
}

export function SummaryCard({
  summary,
  className = '',
  variant = 'default',
  showPreview = true,
  previewLength = 120
}: SummaryCardProps) {
  // Format the filing type for display
  const formatFilingType = (type: string) => {
    // Common filing types with special formatting
    switch (type.toUpperCase()) {
      case '10-K':
      case '10K':
        return '10-K';
      case '10-Q':
      case '10Q':
        return '10-Q';
      case '8-K':
      case '8K':
        return '8-K';
      default:
        return type;
    }
  };

  // Get the badge color based on filing type
  const getBadgeVariant = (type: string) => {
    const upperType = type.toUpperCase();
    if (upperType.includes('10-K') || upperType.includes('10K')) return 'blue';
    if (upperType.includes('10-Q') || upperType.includes('10Q')) return 'green';
    if (upperType.includes('8-K') || upperType.includes('8K')) return 'yellow';
    return 'secondary';
  };
  
  // Format the date to relative time (e.g., "2 days ago")
  const formattedDate = formatDistanceToNow(new Date(summary.filingDate), {
    addSuffix: true,
  });

  // Truncate the content for preview if needed
  const previewContent = showPreview && summary.summaryText
    ? summary.summaryText.length > previewLength
      ? `${summary.summaryText.substring(0, previewLength)}...`
      : summary.summaryText
    : '';

  if (variant === 'compact') {
    return (
      <Link 
        href={`/summary/${summary.id}`}
        className={cn(
          "block border rounded-md p-3 hover:bg-muted/50 transition-colors",
          className
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileTextIcon className="h-4 w-4 text-blue-600" />
            <span className="font-medium">
              {summary.ticker.symbol}: {formatFilingType(summary.filingType)}
            </span>
          </div>
          <Badge variant={getBadgeVariant(summary.filingType) as any}>
            {formatFilingType(summary.filingType)}
          </Badge>
        </div>
        
        {showPreview && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-1">
            {previewContent}
          </p>
        )}
        
        <div className="text-xs text-muted-foreground mt-2">
          {formattedDate}
        </div>
      </Link>
    );
  }

  return (
    <Card className={cn(
      "transition-all duration-200 hover:shadow-md",
      className
    )}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <FileTextIcon className="h-4 w-4 text-blue-600" />
            <CardTitle className="font-medium text-base">
              {summary.ticker.symbol}: {formatFilingType(summary.filingType)}
            </CardTitle>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="h-4 w-4 text-muted-foreground cursor-pointer" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Filed on {new Date(summary.filingDate).toLocaleDateString()}</p>
                  <p>{summary.ticker.companyName}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          <Badge variant={getBadgeVariant(summary.filingType) as any}>
            {formatFilingType(summary.filingType)}
          </Badge>
        </div>
      </CardHeader>
      
      {showPreview && (
        <CardContent className="pb-2 text-sm text-muted-foreground">
          {previewContent}
        </CardContent>
      )}
      
      <CardFooter className="pt-0 flex justify-between">
        <span className="text-xs text-muted-foreground">
          {formattedDate}
        </span>
        
        <div className="flex items-center gap-4">
          <Link 
            href={`/summary/${summary.id}`} 
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            View Summary <ExternalLinkIcon className="h-3 w-3" />
          </Link>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={summary.filingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  Original Filing <ExternalLinkIcon className="h-3 w-3" />
                </a>
              </TooltipTrigger>
              <TooltipContent>
                <p>View the original SEC filing</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardFooter>
    </Card>
  );
} 