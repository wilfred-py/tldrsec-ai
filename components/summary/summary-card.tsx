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

  return (
    <Card className={cn(
      "transition-all duration-200 hover:shadow-md",
      variant === 'compact' ? 'p-3' : '',
      className
    )}>
      <CardHeader className={cn("pb-2", variant === 'compact' ? 'p-3' : '')}>
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2">
            <FileTextIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className={cn(
              "font-medium leading-none",
              variant === 'compact' ? 'text-base' : 'text-lg'
            )}>
              {summary.ticker.symbol}: {summary.filingType}
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
          
          <Badge variant="outline" className="text-xs">
            {formattedDate}
          </Badge>
        </div>
      </CardHeader>
      
      {showPreview && (
        <CardContent className={cn(
          "text-sm text-muted-foreground",
          variant === 'compact' ? 'p-3 pt-0' : ''
        )}>
          {previewContent}
        </CardContent>
      )}
      
      <CardFooter className={cn(
        "pt-2 flex justify-between",
        variant === 'compact' ? 'p-3' : ''
      )}>
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
      </CardFooter>
    </Card>
  );
} 