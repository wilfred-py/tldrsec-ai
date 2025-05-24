'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { ShieldAlert, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface UnauthorizedViewProps {
  ticker: {
    symbol: string;
    companyName: string;
  };
  filingType: string;
  filingDate: Date;
}

export function UnauthorizedView({ ticker, filingType, filingDate }: UnauthorizedViewProps) {
  return (
    <div className="space-y-6">
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Access Restricted</AlertTitle>
        <AlertDescription>
          You don't have permission to view the full content of this {filingType} filing for {ticker.symbol}.
        </AlertDescription>
      </Alert>
      
      <Card>
        <CardHeader>
          <CardTitle>Summary Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Company</h3>
              <p>{ticker.companyName} ({ticker.symbol})</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Filing Type</h3>
              <p>{filingType}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Filing Date</h3>
              <p>{filingDate.toLocaleDateString()}</p>
            </div>
          </div>

          <div className="border-t pt-4 mt-2">
            <div className="flex items-start gap-2 mb-4">
              <Info className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold">Gain Access to This Summary</h3>
                <p className="text-muted-foreground">
                  To view the full summary, add {ticker.symbol} to your watchlist in settings.
                </p>
              </div>
            </div>
            
            <div className="flex justify-center mt-4">
              <Link href="/dashboard/settings">
                <Button>Go to Watchlist Settings</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 